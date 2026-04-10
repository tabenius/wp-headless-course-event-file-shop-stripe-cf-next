import crypto from "node:crypto";
import { normalizeUsername } from "@/lib/username";
import { getD1Database } from "@/lib/d1Bindings";

function userRowToObject(row) {
  if (!row) return null;
  let oauthAccounts = [];
  try {
    oauthAccounts = JSON.parse(row.oauth_accounts || "[]");
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    avatarPublic: row.avatar_public === 1,
    passwordHash: row.password_hash,
    oauthAccounts: Array.isArray(oauthAccounts) ? oauthAccounts : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAvatarPublic(value) {
  return value === true;
}

function getUsernameSecret() {
  return (
    process.env.USERNAME_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-change-me"
  );
}

function buildOpaqueEmailDerivedUsername(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";
  const digest = crypto
    .createHmac("sha256", getUsernameSecret())
    .update(`username:v1:${normalized}`)
    .digest("hex")
    .slice(0, 24);
  return normalizeUsername(digest) || "0";
}

function resolveImmutableUsername(user) {
  const existing = normalizeUsername(user?.username || "");
  if (existing) return existing;
  return buildOpaqueEmailDerivedUsername(user?.email || "");
}

function toPublicUser(user) {
  return {
    id: user?.id || "",
    name: user?.name || "",
    email: user?.email || "",
    username: resolveImmutableUsername(user),
    avatarPublic: normalizeAvatarPublic(user?.avatarPublic),
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string" || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const computedHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  if (hashBuffer.length !== computedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, computedBuffer);
}

export async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const db = await getD1Database();
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(normalized)
    .first();
  if (!row) return null;
  const user = userRowToObject(row);
  const expectedUsername = resolveImmutableUsername(user);
  const expectedAvatarPublic = normalizeAvatarPublic(user.avatarPublic);
  if (
    user.username !== expectedUsername ||
    user.avatarPublic !== expectedAvatarPublic
  ) {
    await db
      .prepare(
        "UPDATE users SET username = ?, avatar_public = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        expectedUsername,
        expectedAvatarPublic ? 1 : 0,
        new Date().toISOString(),
        user.id,
      )
      .run();
    user.username = expectedUsername;
    user.avatarPublic = expectedAvatarPublic;
  }
  return user;
}

export async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !trimmedName || trimmedPassword.length < 8) {
    throw new Error("Invalid registration input");
  }

  const db = await getD1Database();
  const userId = crypto.randomUUID();
  const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
  const passwordHash = hashPassword(trimmedPassword);
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, '[]', ?, ?)",
      )
      .bind(
        userId,
        normalizedEmail,
        trimmedName,
        username,
        passwordHash,
        now,
        now,
      )
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE constraint failed")) {
      throw new Error("Email already exists");
    }
    throw err;
  }
  return toPublicUser({
    id: userId,
    name: trimmedName,
    email: normalizedEmail,
    username,
    avatarPublic: false,
  });
}

export async function validateUserPassword(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) return null;
  return toPublicUser(user);
}

export async function updateUserPassword(email, newPassword) {
  const normalizedEmail = normalizeEmail(email);
  if (
    !normalizedEmail ||
    typeof newPassword !== "string" ||
    newPassword.length < 8
  ) {
    throw new Error("Invalid input");
  }
  const db = await getD1Database();
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(normalizedEmail)
    .first();
  if (!row) throw new Error("User not found");
  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(newHash, now, row.id)
    .run();
  return toPublicUser(
    userRowToObject({ ...row, password_hash: newHash, updated_at: now }),
  );
}

export async function listUsers() {
  const db = await getD1Database();
  const { results } = await db.prepare("SELECT * FROM users").all();
  return (results || [])
    .map((row) => {
      const user = userRowToObject(row);
      return {
        id: user.id,
        username: resolveImmutableUsername(user),
        name: user.name || user.email || "Unknown",
        email: user.email,
        avatarPublic: normalizeAvatarPublic(user.avatarPublic),
        createdAt: user.createdAt || "",
      };
    })
    .filter((user) => user.email.includes("@"));
}

export async function upsertOAuthUser({
  email,
  name,
  provider,
  providerAccountId,
}) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedEmail) {
    throw new Error("OAuth provider did not return a valid email");
  }

  const nextOAuthAccount = {
    provider,
    providerAccountId: String(providerAccountId || ""),
  };

  const db = await getD1Database();
  const existing = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(normalizedEmail)
    .first();

  if (existing) {
    let oauthAccounts = [];
    try {
      oauthAccounts = JSON.parse(existing.oauth_accounts || "[]");
    } catch {
      /* ignore */
    }
    if (!Array.isArray(oauthAccounts)) oauthAccounts = [];
    const exists = oauthAccounts.some(
      (a) =>
        a?.provider === nextOAuthAccount.provider &&
        a?.providerAccountId === nextOAuthAccount.providerAccountId,
    );
    if (!exists) oauthAccounts.push(nextOAuthAccount);
    const now = new Date().toISOString();
    await db
      .prepare(
        "UPDATE users SET name = ?, oauth_accounts = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        trimmedName || existing.name,
        JSON.stringify(oauthAccounts),
        now,
        existing.id,
      )
      .run();
    return toPublicUser(
      userRowToObject({
        ...existing,
        name: trimmedName || existing.name,
        oauth_accounts: JSON.stringify(oauthAccounts),
        updated_at: now,
      }),
    );
  }

  const newUserId = crypto.randomUUID();
  const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, '', ?, ?, ?)",
    )
    .bind(
      newUserId,
      normalizedEmail,
      trimmedName || normalizedEmail.split("@")[0],
      username,
      JSON.stringify([nextOAuthAccount]),
      now,
      now,
    )
    .run();
  return toPublicUser({
    id: newUserId,
    name: trimmedName || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    username,
    avatarPublic: false,
  });
}
