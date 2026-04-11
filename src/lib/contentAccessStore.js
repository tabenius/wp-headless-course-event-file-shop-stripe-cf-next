import { getD1Database } from "@/lib/d1Bindings";
import {
  getCloudflareKvConfigStatus,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { appendServerLog } from "@/lib/serverLog";

const CONTENT_ACCESS_KV_KEY = process.env.CF_KV_KEY || "course-access";
let memFallbackState = { courses: {} };
let contentAccessMetadataColumnReady = false;

function normalizeAnnotationText(value, maxLength = 120) {
  const safe = typeof value === "string" ? value.trim() : "";
  return safe.slice(0, maxLength);
}

function normalizeAnnotationDate(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (raw.length > 40) return "";
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(raw)) return raw.replace(" ", "T");
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  return raw;
}

function normalizeAnnotationMetadata(value) {
  let source = value;
  if (typeof source === "string") {
    const raw = source.trim();
    if (!raw) return {};
    try {
      source = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  try {
    const serialized = JSON.stringify(source);
    if (!serialized || serialized.length > 4000) return {};
    return JSON.parse(serialized);
  } catch {
    return {};
  }
}

function normalizeAnnotationFields(value = {}) {
  return {
    duration: normalizeAnnotationText(value.duration, 80),
    startDate: normalizeAnnotationDate(value.startDate || value.scheduleStart),
    endDate: normalizeAnnotationDate(value.endDate || value.scheduleEnd),
    metadata: normalizeAnnotationMetadata(value.metadata),
  };
}

async function ensureContentAccessMetadataColumn(db) {
  if (!db || contentAccessMetadataColumnReady) return;
  try {
    await db
      .prepare("ALTER TABLE content_access ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")
      .run();
  } catch (error) {
    const message = String(error?.message || error || "").toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("already exists")) {
      throw error;
    }
  }
  contentAccessMetadataColumnReady = true;
}

function normalizeStateShape(raw) {
  const safeCourses =
    raw && typeof raw === "object" && raw.courses && typeof raw.courses === "object"
      ? raw.courses
      : {};
  return { courses: safeCourses };
}

async function readFallbackState() {
  try {
    const data = await readCloudflareKvJson(CONTENT_ACCESS_KV_KEY);
    if (data && typeof data === "object") {
      memFallbackState = normalizeStateShape(data);
      return memFallbackState;
    }
    return normalizeStateShape(memFallbackState);
  } catch (error) {
    await appendServerLog({
      level: "warn",
      msg: `contentAccessStore.kv-read-failed key=${CONTENT_ACCESS_KV_KEY} err=${error?.message || error}`,
      persist: false,
    }).catch(() => {});
    return normalizeStateShape(memFallbackState);
  }
}

async function writeFallbackState(nextState) {
  const safeState = normalizeStateShape(nextState);
  const persisted = await writeCloudflareKvJson(CONTENT_ACCESS_KV_KEY, safeState);
  memFallbackState = safeState;
  if (!persisted) {
    const kvStatus = getCloudflareKvConfigStatus();
    await appendServerLog({
      level: "warn",
      msg: `contentAccessStore.memory-fallback-write key=${CONTENT_ACCESS_KV_KEY} configured=${kvStatus.configured ? "1" : "0"} missing=${kvStatus.missingKeys.join("|") || "none"}`,
      persist: false,
    }).catch(() => {});
  }
  return safeState;
}

function accessRowToObject(row) {
  if (!row) return null;
  let allowedUsers = [];
  try {
    allowedUsers = JSON.parse(row.allowed_users || "[]");
  } catch {
    /* ignore */
  }
  let annotations = {};
  try {
    annotations = JSON.parse(row.metadata || "{}");
  } catch {
    annotations = {};
  }
  const normalizedAnnotations = normalizeAnnotationFields(annotations);
  return {
    allowedUsers: Array.isArray(allowedUsers) ? allowedUsers : [],
    priceCents: row.price_cents,
    currency: row.currency,
    vatPercent: row.vat_percent,
    active: row.active === 1,
    duration: normalizedAnnotations.duration,
    startDate: normalizedAnnotations.startDate,
    endDate: normalizedAnnotations.endDate,
    metadata: normalizedAnnotations.metadata,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeContentUri(courseUri) {
  if (typeof courseUri !== "string") return "";
  const trimmed = courseUri.trim();
  if (!trimmed) return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim() !== ""
    ? currency.trim().toUpperCase()
    : "SEK";
}

function normalizeVatPercent(vatPercent) {
  if (vatPercent === "" || vatPercent === null || vatPercent === undefined) {
    return null;
  }
  const parsed =
    typeof vatPercent === "number"
      ? vatPercent
      : Number.parseFloat(String(vatPercent).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

export async function getContentAccessState() {
  const db = await getD1Database();
  if (!db) {
    return readFallbackState();
  }
  await ensureContentAccessMetadataColumn(db);
  const { results } = await db.prepare("SELECT * FROM content_access").all();
  const courses = {};
  for (const row of results || []) {
    courses[row.course_uri] = accessRowToObject(row);
  }
  return { courses };
}

export async function saveContentAccessState(nextState) {
  const db = await getD1Database();
  if (!db) {
    return writeFallbackState(nextState);
  }
  const courses =
    nextState && typeof nextState === "object" ? nextState.courses : {};
  await ensureContentAccessMetadataColumn(db);
  const statements = [];

  for (const [rawUri, rawValue] of Object.entries(courses || {})) {
    const uri = normalizeContentUri(rawUri);
    if (!uri) continue;
    const allowedUsers = Array.isArray(rawValue?.allowedUsers)
      ? rawValue.allowedUsers.map(normalizeEmail).filter(Boolean)
      : [];
    const priceCents =
      typeof rawValue?.priceCents === "number" && rawValue.priceCents >= 0
        ? Math.floor(rawValue.priceCents)
        : Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS || "0", 10) || 0;
    const currency = normalizeCurrency(rawValue?.currency);
    const vatPercent = normalizeVatPercent(rawValue?.vatPercent);
    const active = rawValue?.active !== false;
    const annotations = normalizeAnnotationFields(rawValue);
    const updatedAt =
      typeof rawValue?.updatedAt === "string"
        ? rawValue.updatedAt
        : new Date().toISOString();

    statements.push(
      db
        .prepare(
          `INSERT INTO content_access (course_uri, allowed_users, price_cents, currency, vat_percent, active, metadata, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(course_uri) DO UPDATE SET
             allowed_users=excluded.allowed_users, price_cents=excluded.price_cents,
             currency=excluded.currency, vat_percent=excluded.vat_percent,
             active=excluded.active, metadata=excluded.metadata, updated_at=excluded.updated_at`,
        )
        .bind(
          uri,
          JSON.stringify([...new Set(allowedUsers)]),
          priceCents,
          currency,
          vatPercent ?? null,
          active ? 1 : 0,
          JSON.stringify(annotations),
          updatedAt,
        ),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return getContentAccessState();
}

export async function setContentAccess({
  courseUri,
  allowedUsers,
  priceCents,
  currency,
  active,
  vatPercent,
  duration,
  startDate,
  endDate,
  metadata,
}) {
  const uri = normalizeContentUri(courseUri);
  if (!uri) throw new Error("Invalid course URI");
  const state = await getContentAccessState();
  const previous = state.courses[uri];
  const normalizedUsers = Array.isArray(allowedUsers)
    ? [...new Set(allowedUsers.map(normalizeEmail).filter(Boolean))]
    : [];
  const safePrice =
    typeof priceCents === "number" && priceCents >= 0
      ? Math.floor(priceCents)
      : 0;
  const safeVatPercent = normalizeVatPercent(vatPercent);
  const resolvedVatPercent =
    vatPercent === undefined
      ? normalizeVatPercent(previous?.vatPercent)
      : safeVatPercent;
  const previousAnnotations = normalizeAnnotationFields(previous || {});
  const nextAnnotations = normalizeAnnotationFields({
    duration: duration === undefined ? previousAnnotations.duration : duration,
    startDate: startDate === undefined ? previousAnnotations.startDate : startDate,
    endDate: endDate === undefined ? previousAnnotations.endDate : endDate,
    metadata: metadata === undefined ? previousAnnotations.metadata : metadata,
  });
  state.courses[uri] = {
    allowedUsers: normalizedUsers,
    priceCents: safePrice,
    currency: normalizeCurrency(currency),
    vatPercent: resolvedVatPercent,
    active: typeof active === "boolean" ? active : previous?.active !== false,
    duration: nextAnnotations.duration,
    startDate: nextAnnotations.startDate,
    endDate: nextAnnotations.endDate,
    metadata: nextAnnotations.metadata,
    updatedAt: new Date().toISOString(),
  };
  return saveContentAccessState(state);
}

export async function grantContentAccess(courseUri, email) {
  const uri = normalizeContentUri(courseUri);
  const normalizedEmail = normalizeEmail(email);
  if (!uri || !normalizedEmail) return;
  const state = await getContentAccessState();
  const course = state.courses[uri] || {
    allowedUsers: [],
    priceCents:
      Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS || "0", 10) || 0,
    currency: normalizeCurrency(
      process.env.DEFAULT_CURRENCY || process.env.DEFAULT_COURSE_FEE_CURRENCY,
    ),
    vatPercent: null,
    active: true,
  };
  if (!course.allowedUsers.includes(normalizedEmail)) {
    course.allowedUsers.push(normalizedEmail);
  }
  state.courses[uri] = {
    ...course,
    updatedAt: new Date().toISOString(),
  };
  await saveContentAccessState(state);
}

export async function hasContentAccess(courseUri, email) {
  const uri = normalizeContentUri(courseUri);
  const normalizedEmail = normalizeEmail(email);
  if (!uri || !normalizedEmail) return false;
  const state = await getContentAccessState();
  const course = state?.courses?.[uri] || null;
  const users = Array.isArray(course?.allowedUsers) ? course.allowedUsers : [];
  return users.includes(normalizedEmail) && course?.active !== false;
}

export async function getContentAccessConfig(courseUri) {
  const uri = normalizeContentUri(courseUri);
  if (!uri) return null;
  const state = await getContentAccessState();
  return state?.courses?.[uri] || null;
}

export function getContentStorageInfo() {
  const kvStatus = getCloudflareKvConfigStatus();
  return {
    provider: "cloudflare-d1",
    table: "content_access",
    replicas: kvStatus.configured ? ["cloudflare-kv"] : ["memory-fallback"],
  };
}
