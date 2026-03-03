import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const DEFAULT_KEY = process.env.CF_KV_KEY || "course-access";
const LOCAL_ACCESS_FILE = ".data/course-access.json";

let inMemoryAccessState = { courses: {} };

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeCourseUri(courseUri) {
  if (typeof courseUri !== "string") return "";
  const trimmed = courseUri.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim() !== ""
    ? currency.trim().toLowerCase()
    : "usd";
}

function sanitizeState(state) {
  const courses = {};
  const inputCourses = state && typeof state === "object" ? state.courses : {};
  for (const [rawUri, rawValue] of Object.entries(inputCourses || {})) {
    const uri = normalizeCourseUri(rawUri);
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
      updatedAt:
        typeof rawValue?.updatedAt === "string"
          ? rawValue.updatedAt
          : new Date().toISOString(),
    };
  }
  return { courses };
}

function shouldUseCloudflareBackend() {
  return process.env.COURSE_ACCESS_STORE === "cloudflare" || isCloudflareKvConfigured();
}

async function readFromCloudflare() {
  const value = await readCloudflareKvJson(DEFAULT_KEY);
  return value ? sanitizeState(value) : { courses: {} };
}

async function writeToCloudflare(state) {
  return writeCloudflareKvJson(DEFAULT_KEY, state);
}

async function ensureLocalStore() {
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
    await fs.writeFile(accessFile, JSON.stringify({ courses: {} }, null, 2), "utf8");
  }
}

async function readFromLocal() {
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

export async function getCourseAccessState() {
  if (shouldUseCloudflareBackend()) {
    try {
      const cloudflareState = await readFromCloudflare();
      if (cloudflareState) return cloudflareState;
    } catch (error) {
      console.error("Cloudflare KV unavailable, using local course access store:", error);
    }
  }
  return readFromLocal();
}

export async function saveCourseAccessState(nextState) {
  const state = sanitizeState(nextState);
  if (shouldUseCloudflareBackend()) {
    try {
      const wroteCloudflare = await writeToCloudflare(state);
      if (wroteCloudflare) return state;
    } catch (error) {
      console.error("Cloudflare KV write failed, falling back to local file:", error);
    }
  }
  await writeToLocal(state);
  return state;
}

export async function setCourseAccess({
  courseUri,
  allowedUsers,
  priceCents,
  currency,
}) {
  const uri = normalizeCourseUri(courseUri);
  if (!uri) throw new Error("Invalid course URI");
  const state = await getCourseAccessState();
  const normalizedUsers = Array.isArray(allowedUsers)
    ? [...new Set(allowedUsers.map(normalizeEmail).filter(Boolean))]
    : [];
  const safePrice =
    typeof priceCents === "number" && priceCents >= 0 ? Math.floor(priceCents) : 0;
  state.courses[uri] = {
    allowedUsers: normalizedUsers,
    priceCents: safePrice,
    currency: normalizeCurrency(currency),
    updatedAt: new Date().toISOString(),
  };
  return saveCourseAccessState(state);
}

export async function grantCourseAccess(courseUri, email) {
  const uri = normalizeCourseUri(courseUri);
  const normalizedEmail = normalizeEmail(email);
  if (!uri || !normalizedEmail) return;
  const state = await getCourseAccessState();
  const course = state.courses[uri] || {
    allowedUsers: [],
    priceCents: Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS || "0", 10) || 0,
    currency: normalizeCurrency(process.env.DEFAULT_COURSE_FEE_CURRENCY),
  };
  if (!course.allowedUsers.includes(normalizedEmail)) {
    course.allowedUsers.push(normalizedEmail);
  }
  state.courses[uri] = {
    ...course,
    updatedAt: new Date().toISOString(),
  };
  await saveCourseAccessState(state);
}

export async function hasCourseAccess(courseUri, email) {
  const uri = normalizeCourseUri(courseUri);
  const normalizedEmail = normalizeEmail(email);
  if (!uri || !normalizedEmail) return false;
  const state = await getCourseAccessState();
  const course = state.courses[uri];
  if (!course) return false;
  return Array.isArray(course.allowedUsers)
    ? course.allowedUsers.includes(normalizedEmail)
    : false;
}

export async function getCourseAccessConfig(courseUri) {
  const uri = normalizeCourseUri(courseUri);
  if (!uri) return null;
  const state = await getCourseAccessState();
  return state.courses[uri] || null;
}

export function getCourseStorageInfo() {
  return shouldUseCloudflareBackend()
    ? { provider: "cloudflare-kv", key: DEFAULT_KEY }
    : { provider: "local-file", path: LOCAL_ACCESS_FILE };
}
