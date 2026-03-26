import { cookies } from "next/headers";

const COOKIE_NAME = "app_session";
const OAUTH_STATE_COOKIE = "oauth_state";
const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
function getSecureCookie() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function getSecret() {
  return process.env.AUTH_SECRET || "dev-only-change-me";
}

function encodeBase64Url(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64url");
  }
  // Edge runtime: use btoa with URL-safe encoding
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64url").toString("utf8");
  }
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getHmacKey() {
  const secret = getSecret();
  const keyData =
    typeof Buffer !== "undefined"
      ? Buffer.from(secret)
      : new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signValue(value) {
  const key = await getHmacKey();
  const data =
    typeof Buffer !== "undefined"
      ? Buffer.from(value)
      : new TextEncoder().encode(value);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const bytes = new Uint8Array(sig);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const key = await getHmacKey();
  // Verify using HMAC: compare HMAC(a) === HMAC(b) is not timing-safe,
  // so we use subtle.verify which is timing-safe for HMAC verification.
  // Instead, we sign a constant and compare both against it via verify.
  // Simplest correct approach: verify sig b against the payload a.
  // We encode both as Uint8Array and do a manual constant-time compare.
  const aBytes =
    typeof Buffer !== "undefined"
      ? new Uint8Array(Buffer.from(a, "base64url"))
      : (() => {
          const b64 = a.replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
          return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
        })();
  const bBytes =
    typeof Buffer !== "undefined"
      ? new Uint8Array(Buffer.from(b, "base64url"))
      : (() => {
          const b64 = b.replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
          return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
        })();
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function encodeSession(session) {
  const payload = encodeBase64Url(JSON.stringify(session));
  const sig = await signValue(payload);
  return `${payload}.${sig}`;
}

async function decodeSession(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expectedSig = await signValue(payload);
  if (!(await timingSafeEqual(sig, expectedSig))) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeBase64Url(payload));
    if (!parsed?.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function safeEqualStrings(a, b) {
  const aBytes = new TextEncoder().encode(String(a || ""));
  const bBytes = new TextEncoder().encode(String(b || ""));
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = await decodeSession(token);
  if (!session?.user) return null;
  return { user: session.user };
}

export async function createSessionToken(user) {
  const safeUser = {
    id: user?.id || "",
    email: user?.email || "",
    name: user?.name || "",
    username: user?.username || "",
    avatarPublic: user?.avatarPublic === true,
  };
  const sessionPayload = {
    user: safeUser,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  return encodeSession(sessionPayload);
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${getSecureCookie()}`;
}

export function createSessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${getSecureCookie()}`;
}

export async function getSessionFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  const session = await decodeSession(token);
  return session?.user ? { user: session.user } : null;
}

export async function createOAuthStateCookie(statePayload) {
  const payload = await encodeSession({
    ...statePayload,
    exp: Date.now() + 10 * 60 * 1000,
  });
  return `${OAUTH_STATE_COOKIE}=${payload}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${getSecureCookie()}`;
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${getSecureCookie()}`;
}

export async function getOAuthStateFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);
  return decodeSession(token);
}

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAdminCredentialPairs() {
  const emails = parseCsvEnv(process.env.ADMIN_EMAILS);
  const passwords = parseCsvEnv(process.env.ADMIN_PASSWORDS);

  if (
    emails.length > 0 &&
    passwords.length > 0 &&
    emails.length === passwords.length
  ) {
    return emails.map((email, index) => ({
      email,
      password: passwords[index],
    }));
  }

  const legacyUser = process.env.ADMIN_USERNAME || "";
  const legacyPass = process.env.ADMIN_PASSWORD || "";
  if (legacyUser && legacyPass) {
    return [{ email: legacyUser, password: legacyPass }];
  }

  return [];
}

export function isAdminCredentialsConfigured() {
  return getAdminCredentialPairs().length > 0;
}

export async function validateAdminCredentials(email, password) {
  const credentials = getAdminCredentialPairs();
  if (credentials.length === 0) return false;
  for (const credential of credentials) {
    if (
      (await safeEqualStrings(email, credential.email)) &&
      (await safeEqualStrings(password, credential.password))
    ) {
      return true;
    }
  }
  return false;
}

export async function createAdminSessionToken(email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return encodeSession({
    role: "admin",
    email: normalizedEmail,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
}

export function createAdminSessionCookie(token) {
  return `${ADMIN_COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${getSecureCookie()}`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${getSecureCookie()}`;
}

export async function adminAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const session = await decodeSession(token);
  if (!session || session.role !== "admin") return null;
  return {
    role: "admin",
    email: String(session.email || "").trim().toLowerCase(),
  };
}

export async function getAdminSessionFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1);
  const session = await decodeSession(token);
  return session?.role === "admin"
    ? {
        role: "admin",
        email: String(session.email || "").trim().toLowerCase(),
      }
    : null;
}
