import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function accessRowToObject(row) {
  if (!row) return null;
  let allowedUsers = [];
  try {
    allowedUsers = JSON.parse(row.allowed_users || "[]");
  } catch {
    /* ignore */
  }
  return {
    allowedUsers: Array.isArray(allowedUsers) ? allowedUsers : [],
    priceCents: row.price_cents,
    currency: row.currency,
    vatPercent: row.vat_percent,
    active: row.active === 1,
    updatedAt: row.updated_at,
  };
}

function canUseFs() {
  return (
    typeof process !== "undefined" &&
    process.versions?.node &&
    process.env.NEXT_RUNTIME !== "edge"
  );
}

function getKvKey() {
  return process.env.CF_KV_KEY || "course-access";
}
const LOCAL_ACCESS_FILE = ".data/course-access.json";

let inMemoryAccessState = { courses: {} };

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

function sanitizeState(state) {
  const courses = {};
  const inputCourses = state && typeof state === "object" ? state.courses : {};
  for (const [rawUri, rawValue] of Object.entries(inputCourses || {})) {
    const uri = normalizeContentUri(rawUri);
    if (!uri) continue;
    const allowedUsers = Array.isArray(rawValue?.allowedUsers)
      ? rawValue.allowedUsers.map(normalizeEmail).filter(Boolean)
      : [];
    const priceCents =
      typeof rawValue?.priceCents === "number" && rawValue.priceCents >= 0
        ? Math.floor(rawValue.priceCents)
        : Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS || "0", 10) || 0;
    courses[uri] = {
      allowedUsers: [...new Set(allowedUsers)],
      priceCents,
      currency: normalizeCurrency(rawValue?.currency),
      vatPercent: normalizeVatPercent(rawValue?.vatPercent),
      active: rawValue?.active !== false,
      updatedAt:
        typeof rawValue?.updatedAt === "string"
          ? rawValue.updatedAt
          : new Date().toISOString(),
    };
  }
  return { courses };
}

function shouldUseCloudflareBackend() {
  return (
    process.env.COURSE_ACCESS_STORE === "cloudflare" ||
    isCloudflareKvConfigured()
  );
}

async function readFromCloudflare() {
  const value = await readCloudflareKvJson(getKvKey());
  return value ? sanitizeState(value) : { courses: {} };
}

async function writeToCloudflare(state) {
  return writeCloudflareKvJson(getKvKey(), state);
}

async function ensureLocalStore() {
  if (!canUseFs()) {
    return;
  }
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(accessFile);
  } catch {
    await fs.writeFile(
      accessFile,
      JSON.stringify({ courses: {} }, null, 2),
      "utf8",
    );
  }
}

async function readFromLocal() {
  if (!canUseFs()) {
    console.warn(
      "Local filesystem store unavailable in this runtime; using in-memory access store.",
    );
    return inMemoryAccessState;
  }
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
    const raw = await fs.readFile(accessFile, "utf8");
    try {
      return sanitizeState(JSON.parse(raw));
    } catch {
      return { courses: {} };
    }
  } catch (error) {
    console.error(
      "Local filesystem store unavailable. Using in-memory access store fallback:",
      error,
    );
    return inMemoryAccessState;
  }
}

async function writeToLocal(state) {
  if (!canUseFs()) {
    inMemoryAccessState = state;
    return;
  }
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
    await fs.writeFile(accessFile, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error(
      "Local filesystem write unavailable. Updating in-memory access store fallback:",
      error,
    );
    inMemoryAccessState = state;
  }
}

export async function getContentAccessState() {
  const db = await tryGetD1();
  if (db) {
    try {
      const { results } = await db
        .prepare("SELECT * FROM content_access")
        .all();
      const courses = {};
      for (const row of results || []) {
        courses[row.course_uri] = accessRowToObject(row);
      }
      return { courses };
    } catch (error) {
      console.error("D1 content access read failed, falling back:", error);
    }
  }

  // existing KV/local path below (unchanged)
  if (shouldUseCloudflareBackend()) {
    try {
      const cloudflareState = await readFromCloudflare();
      if (cloudflareState) return cloudflareState;
    } catch (error) {
      console.error(
        "Cloudflare KV unavailable, using local course access store:",
        error,
      );
    }
  }
  return readFromLocal();
}

export async function saveContentAccessState(nextState) {
  const state = sanitizeState(nextState);

  const db = await tryGetD1();
  if (db) {
    try {
      for (const [uri, course] of Object.entries(state.courses)) {
        await db
          .prepare(
            `INSERT INTO content_access (course_uri, allowed_users, price_cents, currency, vat_percent, active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(course_uri) DO UPDATE SET
               allowed_users=excluded.allowed_users, price_cents=excluded.price_cents,
               currency=excluded.currency, vat_percent=excluded.vat_percent,
               active=excluded.active, updated_at=excluded.updated_at`,
          )
          .bind(
            uri,
            JSON.stringify(course.allowedUsers),
            course.priceCents,
            course.currency,
            course.vatPercent ?? null,
            course.active ? 1 : 0,
            course.updatedAt || new Date().toISOString(),
          )
          .run();
      }
      return state;
    } catch (error) {
      console.error("D1 content access write failed, falling back:", error);
    }
  }

  // existing KV/local path below (unchanged)
  if (shouldUseCloudflareBackend()) {
    try {
      const wroteCloudflare = await writeToCloudflare(state);
      if (wroteCloudflare) return state;
    } catch (error) {
      console.error(
        "Cloudflare KV write failed, falling back to local file:",
        error,
      );
    }
  }
  await writeToLocal(state);
  return state;
}

export async function setContentAccess({
  courseUri,
  allowedUsers,
  priceCents,
  currency,
  active,
  vatPercent,
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
  state.courses[uri] = {
    allowedUsers: normalizedUsers,
    priceCents: safePrice,
    currency: normalizeCurrency(currency),
    vatPercent: resolvedVatPercent,
    active: typeof active === "boolean" ? active : previous?.active !== false,
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

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare(
        "SELECT allowed_users FROM content_access WHERE course_uri = ? AND active = 1",
      )
      .bind(uri)
      .first();
    if (!row) return false;
    let users = [];
    try {
      users = JSON.parse(row.allowed_users || "[]");
    } catch {
      /* ignore */
    }
    return Array.isArray(users) && users.includes(normalizedEmail);
  }

  // existing KV/local path below (unchanged)
  const state = await getContentAccessState();
  const course = state.courses[uri];
  if (!course) return false;
  return Array.isArray(course.allowedUsers)
    ? course.allowedUsers.includes(normalizedEmail)
    : false;
}

export async function getContentAccessConfig(courseUri) {
  const uri = normalizeContentUri(courseUri);
  if (!uri) return null;
  const state = await getContentAccessState();
  return state.courses[uri] || null;
}

export function getContentStorageInfo() {
  return shouldUseCloudflareBackend()
    ? { provider: "cloudflare-kv", key: getKvKey(), replicas: [] }
    : { provider: "local-file", path: LOCAL_ACCESS_FILE, replicas: [] };
}
