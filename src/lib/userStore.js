import crypto from "node:crypto";
import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const USERS_KV_KEY = process.env.CF_USERS_KV_KEY || "users";
const LOCAL_USERS_FILE = ".data/users.json";
let inMemoryUsers = [];

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
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
  return process.env.USER_STORE_BACKEND === "cloudflare" || isCloudflareKvConfigured();
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
  const data = await readCloudflareKvJson(USERS_KV_KEY);
  if (!data) return [];
  return Array.isArray(data) ? data : [];
}

async function writeCloudflareUsers(users) {
  return writeCloudflareKvJson(USERS_KV_KEY, users);
}

async function readUsers() {
  if (shouldUseCloudflareBackend()) {
    try {
      return await readCloudflareUsers();
    } catch (error) {
      console.error("Cloudflare KV users read failed, falling back to local users:", error);
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
      console.error("Cloudflare KV users write failed, falling back to local users:", error);
    }
  }
  await writeLocalUsers(users);
}

export async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const users = await readUsers();
  return (
    users.find(
      (user) =>
        typeof user?.email === "string" &&
        normalizeEmail(user.email) === normalized,
    ) || null
  );
}

export async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !trimmedName || trimmedPassword.length < 8) {
    throw new Error("Invalid registration input");
  }

  const users = await readUsers();
  const existing = users.some(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );
  if (existing) {
    throw new Error("Email already exists");
  }

  const user = {
    id: crypto.randomUUID(),
    name: trimmedName,
    email: normalizedEmail,
    passwordHash: hashPassword(trimmedPassword),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeUsers(users);
  return { id: user.id, name: user.name, email: user.email };
}

export async function validateUserPassword(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function updateUserPassword(email, newPassword) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || typeof newPassword !== "string" || newPassword.length < 8) {
    throw new Error("Invalid input");
  }
  const users = await readUsers();
  const index = users.findIndex(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );
  if (index < 0) throw new Error("User not found");
  users[index] = {
    ...users[index],
    passwordHash: hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  await writeUsers(users);
  return { id: users[index].id, name: users[index].name, email: users[index].email };
}

export async function listUsers() {
  const users = await readUsers();
  return users
    .map((user) => ({
      id: user?.id || "",
      name:
        typeof user?.name === "string" && user.name.trim() !== ""
          ? user.name
          : typeof user?.email === "string"
            ? user.email
            : "Unknown",
      email: typeof user?.email === "string" ? user.email : "",
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

  const users = await readUsers();
  const existingIndex = users.findIndex(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );

  const nextOAuthAccount = {
    provider,
    providerAccountId: String(providerAccountId || ""),
  };

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
      oauthAccounts,
      updatedAt: new Date().toISOString(),
    };
    await writeUsers(users);
    return {
      id: users[existingIndex].id,
      name: users[existingIndex].name,
      email: users[existingIndex].email,
    };
  }

  const newUser = {
    id: crypto.randomUUID(),
    name: trimmedName || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    passwordHash: "",
    oauthAccounts: [nextOAuthAccount],
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  await writeUsers(users);
  return { id: newUser.id, name: newUser.name, email: newUser.email };
}
