import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "app_session";
const OAUTH_STATE_COOKIE = "oauth_state";
const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
function getSecureCookie() { return process.env.NODE_ENV === "production" ? "; Secure" : ""; }

function getSecret() {
  return process.env.AUTH_SECRET || "dev-only-change-me";
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signValue(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
}

function encodeSession(session) {
  const payload = encodeBase64Url(JSON.stringify(session));
  const sig = signValue(payload);
  return `${payload}.${sig}`;
}

function decodeSession(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expectedSig = signValue(payload);
  const sigBuffer = Buffer.from(sig);
  const expectedSigBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedSigBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = decodeSession(token);
  if (!session?.user) return null;
  return { user: session.user };
}

export function createSessionToken(user) {
  const safeUser = {
    id: user?.id || "",
    email: user?.email || "",
    name: user?.name || "",
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

export function getSessionFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  const session = decodeSession(token);
  return session?.user ? { user: session.user } : null;
}

export function createOAuthStateCookie(statePayload) {
  const payload = encodeSession({
    ...statePayload,
    exp: Date.now() + 10 * 60 * 1000,
  });
  return `${OAUTH_STATE_COOKIE}=${payload}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${getSecureCookie()}`;
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${getSecureCookie()}`;
}

export function getOAuthStateFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);
  return decodeSession(token);
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
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

  if (emails.length > 0 && passwords.length > 0 && emails.length === passwords.length) {
    return emails.map((email, index) => ({ email, password: passwords[index] }));
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

export function validateAdminCredentials(email, password) {
  const credentials = getAdminCredentialPairs();
  if (credentials.length === 0) return false;
  return credentials.some(
    (credential) => safeEqual(email, credential.email) && safeEqual(password, credential.password),
  );
}

export function createAdminSessionToken() {
  return encodeSession({
    role: "admin",
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
  const session = decodeSession(token);
  if (!session || session.role !== "admin") return null;
  return { role: "admin" };
}

export function getAdminSessionFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1);
  const session = decodeSession(token);
  return session?.role === "admin" ? { role: "admin" } : null;
}
