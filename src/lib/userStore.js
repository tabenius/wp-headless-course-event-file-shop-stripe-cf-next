import crypto from "node:crypto";
import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { normalizeUsername } from "@/lib/username";
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function userRowToObject(row) {
  if (!row) return null;
  let oauthAccounts = [];
  try {
    oauthAccounts = JSON.parse(row.oauth_accounts || "[]");
  } catch { /* ignore */ }
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

function getUsersKvKey() {
  return process.env.CF_USERS_KV_KEY || "users";
}
const LOCAL_USERS_FILE = ".data/users.json";
let inMemoryUsers = [];

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAvatarPublic(value) {
  return value === true;
}

function getUsernameSecret() {
  return process.env.USERNAME_SECRET || process.env.AUTH_SECRET || "dev-only-change-me";
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

function shouldUseCloudflareBackend() {
  return (
    process.env.USER_STORE_BACKEND === "cloudflare" ||
    isCloudflareKvConfigured()
  );
}

async function ensureLocalStore() {
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const usersFile = path.join(process.cwd(), LOCAL_USERS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(usersFile);
  } catch {
    await fs.writeFile(usersFile, "[]", "utf8");
  }
}

async function readLocalUsers() {
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const usersFile = path.join(process.cwd(), LOCAL_USERS_FILE);
    const raw = await fs.readFile(usersFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(
      "Local user store unavailable. Using in-memory user store fallback:",
      error,
    );
    return inMemoryUsers;
  }
}

async function writeLocalUsers(users) {
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const usersFile = path.join(process.cwd(), LOCAL_USERS_FILE);
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
  } catch (error) {
    console.error(
      "Local user store write unavailable. Updating in-memory user store fallback:",
      error,
    );
    inMemoryUsers = users;
  }
}

async function readCloudflareUsers() {
  const data = await readCloudflareKvJson(getUsersKvKey());
  if (!data) return [];
  return Array.isArray(data) ? data : [];
}

async function writeCloudflareUsers(users) {
  return writeCloudflareKvJson(getUsersKvKey(), users);
}

async function readUsers() {
  if (shouldUseCloudflareBackend()) {
    try {
      return await readCloudflareUsers();
    } catch (error) {
      console.error(
        "Cloudflare KV users read failed, falling back to local users:",
        error,
      );
    }
  }
  return readLocalUsers();
}

async function writeUsers(users) {
  if (shouldUseCloudflareBackend()) {
    try {
      const wrote = await writeCloudflareUsers(users);
      if (wrote) return;
    } catch (error) {
      console.error(
        "Cloudflare KV users write failed, falling back to local users:",
        error,
      );
    }
  }
  await writeLocalUsers(users);
}

export async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .bind(normalized)
      .first();
    if (!row) return null;
    const user = userRowToObject(row);
    const expectedUsername = resolveImmutableUsername(user);
    const expectedAvatarPublic = normalizeAvatarPublic(user.avatarPublic);
    if (user.username !== expectedUsername || user.avatarPublic !== expectedAvatarPublic) {
      await db
        .prepare("UPDATE users SET username = ?, avatar_public = ?, updated_at = ? WHERE id = ?")
        .bind(expectedUsername, expectedAvatarPublic ? 1 : 0, new Date().toISOString(), user.id)
        .run();
      user.username = expectedUsername;
      user.avatarPublic = expectedAvatarPublic;
    }
    return user;
  }
  const users = await readUsers();
  const index = users.findIndex(
    (user) =>
      typeof user?.email === "string" && normalizeEmail(user.email) === normalized,
  );
  if (index < 0) return null;

  const stored = users[index] || {};
  const expectedUsername = resolveImmutableUsername(stored);
  const expectedAvatarPublic = normalizeAvatarPublic(stored.avatarPublic);
  const needsPatch =
    normalizeUsername(stored.username || "") !== expectedUsername ||
    stored.avatarPublic !== expectedAvatarPublic;

  if (needsPatch) {
    users[index] = {
      ...stored,
      username: expectedUsername,
      avatarPublic: expectedAvatarPublic,
      updatedAt: new Date().toISOString(),
    };
    await writeUsers(users);
    return users[index];
  }

  return {
    ...stored,
    username: expectedUsername,
    avatarPublic: expectedAvatarPublic,
  };
}

export async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !trimmedName || trimmedPassword.length < 8) {
    throw new Error("Invalid registration input");
  }

  const db = await tryGetD1();
  if (db) {
    const userId = crypto.randomUUID();
    const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
    const passwordHash = hashPassword(trimmedPassword);
    const now = new Date().toISOString();
    try {
      await db
        .prepare(
          "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, '[]', ?, ?)",
        )
        .bind(userId, normalizedEmail, trimmedName, username, passwordHash, now, now)
        .run();
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed")) {
        throw new Error("Email already exists");
      }
      throw err;
    }
    return toPublicUser({ id: userId, name: trimmedName, email: normalizedEmail, username, avatarPublic: false });
  }

  const users = await readUsers();
  const existing = users.some(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );
  if (existing) {
    throw new Error("Email already exists");
  }

  const userId = crypto.randomUUID();
  const user = {
    id: userId,
    name: trimmedName,
    email: normalizedEmail,
    username: buildOpaqueEmailDerivedUsername(normalizedEmail),
    avatarPublic: false,
    passwordHash: hashPassword(trimmedPassword),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeUsers(users);
  return toPublicUser(user);
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
  const db = await tryGetD1();
  if (db) {
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
    return toPublicUser(userRowToObject({ ...row, password_hash: newHash, updated_at: now }));
  }
  const users = await readUsers();
  const index = users.findIndex(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );
  if (index < 0) throw new Error("User not found");
  users[index] = {
    ...users[index],
    username: resolveImmutableUsername(users[index]),
    avatarPublic: normalizeAvatarPublic(users[index]?.avatarPublic),
    passwordHash: hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  await writeUsers(users);
  return toPublicUser(users[index]);
}

export async function listUsers() {
  const db = await tryGetD1();
  if (db) {
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
  const users = await readUsers();
  return users
    .map((user) => ({
      id: user?.id || "",
      username: resolveImmutableUsername(user),
      name:
        typeof user?.name === "string" && user.name.trim() !== ""
          ? user.name
          : typeof user?.email === "string"
            ? user.email
            : "Unknown",
      email: typeof user?.email === "string" ? user.email : "",
      avatarPublic: normalizeAvatarPublic(user?.avatarPublic),
      createdAt: user?.createdAt || "",
    }))
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

  const db = await tryGetD1();
  if (db) {
    const existing = await db
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .bind(normalizedEmail)
      .first();

    if (existing) {
      let oauthAccounts = [];
      try { oauthAccounts = JSON.parse(existing.oauth_accounts || "[]"); } catch { /* ignore */ }
      if (!Array.isArray(oauthAccounts)) oauthAccounts = [];
      const exists = oauthAccounts.some(
        (a) => a?.provider === nextOAuthAccount.provider && a?.providerAccountId === nextOAuthAccount.providerAccountId,
      );
      if (!exists) oauthAccounts.push(nextOAuthAccount);
      const now = new Date().toISOString();
      await db
        .prepare("UPDATE users SET name = ?, oauth_accounts = ?, updated_at = ? WHERE id = ?")
        .bind(trimmedName || existing.name, JSON.stringify(oauthAccounts), now, existing.id)
        .run();
      return toPublicUser(userRowToObject({ ...existing, name: trimmedName || existing.name, oauth_accounts: JSON.stringify(oauthAccounts), updated_at: now }));
    }

    const newUserId = crypto.randomUUID();
    const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, '', ?, ?, ?)",
      )
      .bind(newUserId, normalizedEmail, trimmedName || normalizedEmail.split("@")[0], username, JSON.stringify([nextOAuthAccount]), now, now)
      .run();
    return toPublicUser({ id: newUserId, name: trimmedName || normalizedEmail.split("@")[0], email: normalizedEmail, username, avatarPublic: false });
  }

  const users = await readUsers();
  const existingIndex = users.findIndex(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );

  if (existingIndex >= 0) {
    const existing = users[existingIndex];
    const oauthAccounts = Array.isArray(existing.oauthAccounts)
      ? existing.oauthAccounts
      : [];
    const exists = oauthAccounts.some(
      (account) =>
        account?.provider === nextOAuthAccount.provider &&
        account?.providerAccountId === nextOAuthAccount.providerAccountId,
    );
    if (!exists) oauthAccounts.push(nextOAuthAccount);
    users[existingIndex] = {
      ...existing,
      name: trimmedName || existing.name,
      username: resolveImmutableUsername(existing),
      avatarPublic: normalizeAvatarPublic(existing?.avatarPublic),
      oauthAccounts,
      updatedAt: new Date().toISOString(),
    };
    await writeUsers(users);
    return toPublicUser(users[existingIndex]);
  }

  const newUserId = crypto.randomUUID();
  const newUser = {
    id: newUserId,
    name: trimmedName || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    username: buildOpaqueEmailDerivedUsername(normalizedEmail),
    avatarPublic: false,
    passwordHash: "",
    oauthAccounts: [nextOAuthAccount],
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  await writeUsers(users);
  return toPublicUser(newUser);
}
