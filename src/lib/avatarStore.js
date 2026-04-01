import crypto from "node:crypto";
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

function avatarRowToObject(row, relationships = []) {
  if (!row) return null;
  let details = {};
  try { details = JSON.parse(row.details || "{}"); } catch { /* ignore */ }
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    isPublic: row.is_public === 1,
    canonicalName: row.canonical_name || "",
    profileImageUrl: row.profile_image_url || "",
    bio: row.bio || "",
    details,
    relationshipsOut: relationships.map((r) => ({
      toAvatarId: r.to_avatar_id,
      kind: r.kind,
      note: r.note || "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function d1GetAvatarWithRels(db, whereClause, bindValues) {
  const row = await db.prepare(`SELECT * FROM avatars WHERE ${whereClause} LIMIT 1`).bind(...bindValues).first();
  if (!row) return null;
  const { results: rels } = await db
    .prepare("SELECT * FROM avatar_relationships WHERE from_avatar_id = ?")
    .bind(row.id)
    .all();
  return avatarRowToObject(row, rels || []);
}

const LOCAL_AVATARS_FILE = ".data/avatars.json";
let inMemoryState = { avatars: [] };
const HEX_RE = /^[0-9a-f]+$/;
const REL_KIND_RE = /^[a-z0-9._:-]{1,48}$/;

function getAvatarsKvKey() {
  return process.env.CF_AVATARS_KV_KEY || "avatars";
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeAvatarId(value) {
  const raw = String(value || "").trim().toLowerCase();
  const withoutPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!withoutPrefix || !HEX_RE.test(withoutPrefix)) return "";
  return withoutPrefix;
}

function avatarIdToUriSegment(value) {
  const normalized = normalizeAvatarId(value);
  return normalized ? `0x${normalized}` : "";
}

function normalizeCanonicalName(value) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return "";
  if (Buffer.byteLength(normalized, "utf8") > 128) return "";
  return normalized;
}

function normalizeRelationshipKind(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (!safe || !REL_KIND_RE.test(safe)) return "follow";
  return safe;
}

function isValidHttpUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, rawVal] of Object.entries(value)) {
    const safeKey = String(key || "").trim().slice(0, 64);
    if (!safeKey) continue;
    const safeValue =
      typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal ?? "");
    const trimmed = safeValue.trim();
    if (!trimmed) continue;
    if (Buffer.byteLength(trimmed, "utf8") > 4096) continue;
    output[safeKey] = trimmed;
    if (Object.keys(output).length >= 64) break;
  }
  return output;
}

function sanitizeRelationships(value, selfAvatarId) {
  if (!Array.isArray(value)) return [];
  const dedupe = new Set();
  const output = [];
  for (const row of value) {
    const toAvatarId = normalizeAvatarId(row?.toAvatarId);
    if (!toAvatarId || toAvatarId === selfAvatarId) continue;
    const kind = normalizeRelationshipKind(row?.kind);
    const dedupeKey = `${kind}:${toAvatarId}`;
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);
    output.push({
      toAvatarId,
      kind,
      createdAt:
        typeof row?.createdAt === "string"
          ? row.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof row?.updatedAt === "string"
          ? row.updatedAt
          : new Date().toISOString(),
      note:
        typeof row?.note === "string" && Buffer.byteLength(row.note, "utf8") <= 512
          ? row.note.trim()
          : "",
    });
    if (output.length >= 4096) break;
  }
  return output;
}

function sanitizeAvatarRecord(raw, canonicalNameMap) {
  const id = normalizeAvatarId(raw?.id);
  const ownerUserId = String(raw?.ownerUserId || "").trim();
  if (!id || !ownerUserId) return null;

  const canonicalName = normalizeCanonicalName(raw?.canonicalName);
  const canonicalNameKey = canonicalName.toLocaleLowerCase("und");
  const uniqueCanonicalName =
    canonicalName && !canonicalNameMap.has(canonicalNameKey)
      ? canonicalName
      : "";
  if (uniqueCanonicalName) canonicalNameMap.set(canonicalNameKey, id);

  const profileImageUrl =
    typeof raw?.profileImageUrl === "string" && isValidHttpUrl(raw.profileImageUrl)
      ? raw.profileImageUrl.trim()
      : "";

  const bio =
    typeof raw?.bio === "string" && Buffer.byteLength(raw.bio, "utf8") <= 8192
      ? raw.bio.trim()
      : "";

  return {
    id,
    ownerUserId,
    isPublic: raw?.isPublic === true,
    canonicalName: uniqueCanonicalName,
    profileImageUrl,
    bio,
    details: sanitizeDetails(raw?.details),
    relationshipsOut: sanitizeRelationships(raw?.relationshipsOut, id),
    createdAt:
      typeof raw?.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof raw?.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function sanitizeState(rawState) {
  const source = Array.isArray(rawState?.avatars) ? rawState.avatars : [];
  const canonicalNameMap = new Map();
  const avatars = [];
  const seenIds = new Set();
  for (const row of source) {
    const safe = sanitizeAvatarRecord(row, canonicalNameMap);
    if (!safe || seenIds.has(safe.id)) continue;
    seenIds.add(safe.id);
    avatars.push(safe);
  }
  return { avatars };
}

function shouldUseCloudflareBackend() {
  return (
    process.env.AVATAR_STORE_BACKEND === "cloudflare" ||
    isCloudflareKvConfigured()
  );
}

async function ensureLocalStore() {
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const avatarsFile = path.join(process.cwd(), LOCAL_AVATARS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(avatarsFile);
  } catch {
    await fs.writeFile(avatarsFile, JSON.stringify({ avatars: [] }, null, 2));
  }
}

async function readLocalState() {
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const avatarsFile = path.join(process.cwd(), LOCAL_AVATARS_FILE);
    const raw = await fs.readFile(avatarsFile, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    console.error(
      "Local avatar store unavailable. Using in-memory avatar store fallback:",
      error,
    );
    return sanitizeState(inMemoryState);
  }
}

async function writeLocalState(state) {
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const avatarsFile = path.join(process.cwd(), LOCAL_AVATARS_FILE);
    const safeState = sanitizeState(state);
    await fs.writeFile(avatarsFile, JSON.stringify(safeState, null, 2), "utf8");
  } catch (error) {
    console.error(
      "Local avatar store write unavailable. Updating in-memory avatar store fallback:",
      error,
    );
    inMemoryState = sanitizeState(state);
  }
}

async function readCloudflareState() {
  const data = await readCloudflareKvJson(getAvatarsKvKey());
  return sanitizeState(data || { avatars: [] });
}

async function writeCloudflareState(state) {
  return writeCloudflareKvJson(getAvatarsKvKey(), sanitizeState(state));
}

async function getState() {
  if (shouldUseCloudflareBackend()) {
    try {
      return await readCloudflareState();
    } catch (error) {
      console.error(
        "Cloudflare KV avatar read failed, falling back to local avatar store:",
        error,
      );
    }
  }
  return readLocalState();
}

async function saveState(state) {
  const safeState = sanitizeState(state);
  if (shouldUseCloudflareBackend()) {
    try {
      const wrote = await writeCloudflareState(safeState);
      if (wrote) return safeState;
    } catch (error) {
      console.error(
        "Cloudflare KV avatar write failed, falling back to local avatar store:",
        error,
      );
    }
  }
  await writeLocalState(safeState);
  return safeState;
}

function getAvatarSecret() {
  return (
    process.env.AVATAR_ID_SECRET ||
    process.env.USERNAME_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-change-me"
  );
}

function deriveAvatarIdFromEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "";
  return crypto
    .createHmac("sha256", getAvatarSecret())
    .update(`avatar:v1:${normalizedEmail}`)
    .digest("hex")
    .slice(0, 24);
}

function findAvatarIndexByOwner(avatars, ownerUserId) {
  return avatars.findIndex((avatar) => avatar.ownerUserId === ownerUserId);
}

function findAvatarIndexById(avatars, avatarId) {
  return avatars.findIndex((avatar) => avatar.id === avatarId);
}

function findAvatarIndexByCanonicalName(avatars, canonicalName) {
  const normalized = normalizeCanonicalName(canonicalName);
  if (!normalized) return -1;
  const key = normalized.toLocaleLowerCase("und");
  return avatars.findIndex(
    (avatar) =>
      typeof avatar?.canonicalName === "string" &&
      avatar.canonicalName.toLocaleLowerCase("und") === key,
  );
}

function randomAvatarId(existingIds) {
  for (let i = 0; i < 5; i += 1) {
    const next = crypto.randomBytes(12).toString("hex");
    if (!existingIds.has(next)) return next;
  }
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

function serializeAvatarForOwner(avatar) {
  return {
    id: avatar.id,
    uriId: avatarIdToUriSegment(avatar.id),
    ownerUserId: avatar.ownerUserId,
    isPublic: avatar.isPublic === true,
    canonicalName: avatar.canonicalName || "",
    profileImageUrl: avatar.profileImageUrl || "",
    bio: avatar.bio || "",
    details: avatar.details || {},
    relationshipsOut: Array.isArray(avatar.relationshipsOut)
      ? avatar.relationshipsOut
      : [],
    createdAt: avatar.createdAt || "",
    updatedAt: avatar.updatedAt || "",
  };
}

function serializeAvatarForPublic(avatar) {
  return {
    id: avatar.id,
    uriId: avatarIdToUriSegment(avatar.id),
    canonicalName: avatar.canonicalName || "",
    profileImageUrl: avatar.profileImageUrl || "",
    bio: avatar.bio || "",
    details: avatar.details || {},
    relationshipsOutCount: Array.isArray(avatar.relationshipsOut)
      ? avatar.relationshipsOut.length
      : 0,
    createdAt: avatar.createdAt || "",
    updatedAt: avatar.updatedAt || "",
  };
}

function buildCanonicalAvatarProfilePath(avatar) {
  const uriId = avatarIdToUriSegment(avatar?.id || "");
  return uriId ? `/profile/${encodeURIComponent(uriId)}` : "/profile";
}

async function findOwnAvatarWithState(user) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) return null;
  const state = await getState();
  const index = findAvatarIndexByOwner(state.avatars, ownerUserId);
  if (index < 0) return { state, index: -1, avatar: null };
  return { state, index, avatar: state.avatars[index] };
}

function applyAvatarPatch({ state, index, current, patch = {} }) {
  const next = { ...current };

  if (patch && Object.prototype.hasOwnProperty.call(patch, "isPublic")) {
    next.isPublic = patch.isPublic === true;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "canonicalName")) {
    const canonicalName = normalizeCanonicalName(patch.canonicalName);
    if (patch.canonicalName && !canonicalName) {
      throw new Error("Invalid canonical name (must be UTF-8 up to 128 bytes).");
    }
    const canonicalKey = canonicalName.toLocaleLowerCase("und");
    if (canonicalName) {
      const collision = state.avatars.find(
        (avatar, avatarIndex) =>
          avatarIndex !== index &&
          typeof avatar?.canonicalName === "string" &&
          avatar.canonicalName.toLocaleLowerCase("und") === canonicalKey,
      );
      if (collision) {
        throw new Error("Canonical name is already registered by another avatar.");
      }
    }
    next.canonicalName = canonicalName;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "profileImageUrl")) {
    const profileImageUrl =
      typeof patch.profileImageUrl === "string" ? patch.profileImageUrl.trim() : "";
    if (!isValidHttpUrl(profileImageUrl)) {
      throw new Error("Invalid profile image URL.");
    }
    next.profileImageUrl = profileImageUrl;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "bio")) {
    const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
    if (Buffer.byteLength(bio, "utf8") > 8192) {
      throw new Error("Bio is too long.");
    }
    next.bio = bio;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "details")) {
    next.details = sanitizeDetails(patch.details);
  }

  return next;
}

export async function getOwnAvatar(user) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) return null;

  const db = await tryGetD1();
  if (db) {
    const avatar = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    return avatar ? serializeAvatarForOwner(avatar) : null;
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  if (!resolved?.avatar) return null;
  return serializeAvatarForOwner(resolved.avatar);
}

export async function createOwnAvatar(user, initialPatch = {}) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) throw new Error("Invalid user identity.");

  const db = await tryGetD1();
  if (db) {
    const existing = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    if (existing) return { avatar: serializeAvatarForOwner(existing), created: false };

    const ownerEmail = normalizeEmail(user?.email || "");
    const preferredId = deriveAvatarIdFromEmail(ownerEmail);
    const idCheck = preferredId ? await db.prepare("SELECT 1 FROM avatars WHERE id = ?").bind(preferredId).first() : true;
    const avatarId = (preferredId && !idCheck) ? preferredId : randomAvatarId(new Set());
    const now = new Date().toISOString();

    const canonicalName = normalizeCanonicalName(initialPatch?.canonicalName || "");
    const isPublic = initialPatch?.isPublic === true ? 1 : 0;
    const profileImageUrl = typeof initialPatch?.profileImageUrl === "string" && isValidHttpUrl(initialPatch.profileImageUrl) ? initialPatch.profileImageUrl.trim() : "";
    const bio = typeof initialPatch?.bio === "string" ? initialPatch.bio.trim() : "";
    const details = JSON.stringify(sanitizeDetails(initialPatch?.details || {}));

    try {
      await db
        .prepare(
          "INSERT INTO avatars (id, owner_user_id, canonical_name, is_public, profile_image_url, bio, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(avatarId, ownerUserId, canonicalName || null, isPublic, profileImageUrl, bio, details, now, now)
        .run();
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed") && String(err).includes("canonical_name")) {
        throw new Error("Canonical name is already registered by another avatar.");
      }
      throw err;
    }

    const created = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
    return { avatar: serializeAvatarForOwner(created), created: true };
  }

  // existing KV/local path (unchanged)
  const existing = await findOwnAvatarWithState(user);
  if (existing?.avatar) {
    return { avatar: serializeAvatarForOwner(existing.avatar), created: false };
  }

  const state = existing?.state || (await getState());
  const ownerEmail = normalizeEmail(user?.email || "");
  const preferredId = deriveAvatarIdFromEmail(ownerEmail);
  const existingIds = new Set(state.avatars.map((avatar) => avatar.id));
  let avatarId = preferredId;
  if (!avatarId || existingIds.has(avatarId)) {
    avatarId = randomAvatarId(existingIds);
  }

  const now = new Date().toISOString();
  const baseAvatar = {
    id: avatarId,
    ownerUserId,
    isPublic: false,
    canonicalName: "",
    profileImageUrl: "",
    bio: "",
    details: {},
    relationshipsOut: [],
    createdAt: now,
    updatedAt: now,
  };
  const nextAvatar = applyAvatarPatch({
    state,
    index: state.avatars.length,
    current: baseAvatar,
    patch: initialPatch,
  });
  state.avatars.push({
    ...nextAvatar,
    createdAt: now,
    updatedAt: now,
  });

  const saved = await saveState(state);
  const savedIndex = findAvatarIndexByOwner(saved.avatars, ownerUserId);
  const savedAvatar = savedIndex >= 0 ? saved.avatars[savedIndex] : null;
  if (!savedAvatar) {
    throw new Error("Avatar creation failed.");
  }
  return { avatar: serializeAvatarForOwner(savedAvatar), created: true };
}

export async function getPublicAvatarById(avatarId) {
  const safeAvatarId = normalizeAvatarId(avatarId);
  if (!safeAvatarId) return null;

  const db = await tryGetD1();
  if (db) {
    const avatar = await d1GetAvatarWithRels(db, "id = ? AND is_public = 1", [safeAvatarId]);
    return avatar ? serializeAvatarForPublic(avatar) : null;
  }

  // existing KV/local path (unchanged)
  const state = await getState();
  const index = findAvatarIndexById(state.avatars, safeAvatarId);
  if (index < 0) return null;
  const avatar = state.avatars[index];
  if (avatar?.isPublic !== true) return null;
  return serializeAvatarForPublic(avatar);
}

export async function getAvatarForProfileHandle(
  handle,
  { viewerUserId = "" } = {},
) {
  const rawHandle = String(handle || "").trim();
  if (!rawHandle) return null;

  let decoded = rawHandle;
  try {
    decoded = decodeURIComponent(rawHandle);
  } catch {
    decoded = rawHandle;
  }
  const safeHandle = decoded.trim();
  if (!safeHandle) return null;

  const db = await tryGetD1();
  if (db) {
    const avatarId = normalizeAvatarId(safeHandle);
    let avatar = null;
    if (avatarId) {
      avatar = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
    } else {
      avatar = await d1GetAvatarWithRels(db, "canonical_name = ? COLLATE NOCASE", [safeHandle]);
    }
    if (!avatar) return null;
    const isOwner = typeof viewerUserId === "string" && viewerUserId.trim() !== "" && avatar.ownerUserId === viewerUserId.trim();
    if (avatar.isPublic !== true && !isOwner) return null;
    const base = isOwner ? serializeAvatarForOwner(avatar) : serializeAvatarForPublic(avatar);
    return { ...base, isOwner, isPublic: avatar.isPublic === true, canonicalProfilePath: buildCanonicalAvatarProfilePath(avatar) };
  }

  // existing KV/local path (unchanged)
  const state = await getState();
  let index = -1;
  const avatarId = normalizeAvatarId(safeHandle);
  if (avatarId) {
    index = findAvatarIndexById(state.avatars, avatarId);
  } else {
    index = findAvatarIndexByCanonicalName(state.avatars, safeHandle);
  }

  if (index < 0) return null;
  const avatar = state.avatars[index];
  const isOwner =
    typeof viewerUserId === "string" &&
    viewerUserId.trim() !== "" &&
    avatar.ownerUserId === viewerUserId.trim();
  if (avatar.isPublic !== true && !isOwner) return null;

  const base = isOwner
    ? serializeAvatarForOwner(avatar)
    : serializeAvatarForPublic(avatar);
  return {
    ...base,
    isOwner,
    isPublic: avatar.isPublic === true,
    canonicalProfilePath: buildCanonicalAvatarProfilePath(avatar),
  };
}

export async function updateOwnAvatar(user, patch = {}) {
  const ownerUserId = String(user?.id || "").trim();

  const db = await tryGetD1();
  if (db) {
    const current = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    if (!current) throw new Error("Avatar not found. Create an avatar first.");

    const updates = [];
    const binds = [];

    if (Object.prototype.hasOwnProperty.call(patch, "isPublic")) {
      updates.push("is_public = ?");
      binds.push(patch.isPublic === true ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "canonicalName")) {
      const cn = normalizeCanonicalName(patch.canonicalName);
      if (patch.canonicalName && !cn) throw new Error("Invalid canonical name (must be UTF-8 up to 128 bytes).");
      updates.push("canonical_name = ?");
      binds.push(cn || null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "profileImageUrl")) {
      const url = typeof patch.profileImageUrl === "string" ? patch.profileImageUrl.trim() : "";
      if (!isValidHttpUrl(url)) throw new Error("Invalid profile image URL.");
      updates.push("profile_image_url = ?");
      binds.push(url);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "bio")) {
      const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
      if (Buffer.byteLength(bio, "utf8") > 8192) throw new Error("Bio is too long.");
      updates.push("bio = ?");
      binds.push(bio);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "details")) {
      updates.push("details = ?");
      binds.push(JSON.stringify(sanitizeDetails(patch.details)));
    }

    if (updates.length > 0) {
      const now = new Date().toISOString();
      updates.push("updated_at = ?");
      binds.push(now, current.id);
      try {
        await db.prepare(`UPDATE avatars SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
      } catch (err) {
        if (String(err).includes("UNIQUE constraint failed") && String(err).includes("canonical_name")) {
          throw new Error("Canonical name is already registered by another avatar.");
        }
        throw err;
      }
    }

    const updated = await d1GetAvatarWithRels(db, "id = ?", [current.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  if (!resolved?.avatar) {
    throw new Error("Avatar not found. Create an avatar first.");
  }

  const state = resolved.state;
  const index = resolved.index;
  const current = state.avatars[index];
  const next = applyAvatarPatch({ state, index, current, patch });

  next.updatedAt = new Date().toISOString();
  state.avatars[index] = next;
  const saved = await saveState(state);
  const savedAvatar = saved.avatars[index];
  return serializeAvatarForOwner(savedAvatar);
}

export async function listOwnAvatarRelationships(user) {
  const avatar = await getOwnAvatar(user);
  if (!avatar) return [];
  return Array.isArray(avatar.relationshipsOut) ? avatar.relationshipsOut : [];
}

export async function upsertOwnAvatarRelationship(
  user,
  { toAvatarId, kind = "follow", note = "" } = {},
) {
  const safeToAvatarId = normalizeAvatarId(toAvatarId);
  if (!safeToAvatarId) {
    throw new Error("Invalid target avatar id.");
  }

  const db = await tryGetD1();
  if (db) {
    const ownerUserId = String(user?.id || "").trim();
    const source = await db.prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1").bind(ownerUserId).first();
    if (!source) throw new Error("Avatar not found. Create an avatar first.");
    if (source.id === safeToAvatarId) throw new Error("Avatar relationship target must be different from source.");
    const target = await db.prepare("SELECT 1 FROM avatars WHERE id = ?").bind(safeToAvatarId).first();
    if (!target) throw new Error("Target avatar not found.");

    const safeKind = normalizeRelationshipKind(kind);
    const safeNote = typeof note === "string" && Buffer.byteLength(note, "utf8") <= 512 ? note.trim() : "";
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO avatar_relationships (from_avatar_id, to_avatar_id, kind, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(from_avatar_id, to_avatar_id, kind) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
      )
      .bind(source.id, safeToAvatarId, safeKind, safeNote, now, now)
      .run();

    const updated = await d1GetAvatarWithRels(db, "id = ?", [source.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  if (!resolved?.avatar) {
    throw new Error("Avatar not found. Create an avatar first.");
  }
  const state = resolved.state;
  const index = resolved.index;
  const source = state.avatars[index];
  if (source.id === safeToAvatarId) {
    throw new Error("Avatar relationship target must be different from source.");
  }

  const targetIndex = findAvatarIndexById(state.avatars, safeToAvatarId);
  if (targetIndex < 0) {
    throw new Error("Target avatar not found.");
  }

  const safeKind = normalizeRelationshipKind(kind);
  const safeNote =
    typeof note === "string" && Buffer.byteLength(note, "utf8") <= 512
      ? note.trim()
      : "";
  const now = new Date().toISOString();
  const rows = Array.isArray(source.relationshipsOut)
    ? [...source.relationshipsOut]
    : [];
  const existingIndex = rows.findIndex(
    (row) => row.toAvatarId === safeToAvatarId && row.kind === safeKind,
  );
  if (existingIndex >= 0) {
    rows[existingIndex] = {
      ...rows[existingIndex],
      note: safeNote,
      updatedAt: now,
    };
  } else {
    rows.push({
      toAvatarId: safeToAvatarId,
      kind: safeKind,
      note: safeNote,
      createdAt: now,
      updatedAt: now,
    });
  }

  state.avatars[index] = {
    ...source,
    relationshipsOut: sanitizeRelationships(rows, source.id),
    updatedAt: now,
  };
  const saved = await saveState(state);
  return serializeAvatarForOwner(saved.avatars[index]);
}

export async function removeOwnAvatarRelationship(
  user,
  { toAvatarId, kind = "follow" } = {},
) {
  const safeToAvatarId = normalizeAvatarId(toAvatarId);
  if (!safeToAvatarId) {
    throw new Error("Invalid target avatar id.");
  }
  const safeKind = normalizeRelationshipKind(kind);

  const db = await tryGetD1();
  if (db) {
    const ownerUserId = String(user?.id || "").trim();
    const source = await db.prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1").bind(ownerUserId).first();
    if (!source) throw new Error("Avatar not found. Create an avatar first.");
    await db
      .prepare("DELETE FROM avatar_relationships WHERE from_avatar_id = ? AND to_avatar_id = ? AND kind = ?")
      .bind(source.id, safeToAvatarId, safeKind)
      .run();

    const updated = await d1GetAvatarWithRels(db, "id = ?", [source.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  if (!resolved?.avatar) {
    throw new Error("Avatar not found. Create an avatar first.");
  }
  const state = resolved.state;
  const index = resolved.index;
  const source = state.avatars[index];

  const rows = Array.isArray(source.relationshipsOut)
    ? source.relationshipsOut.filter(
        (row) => !(row.toAvatarId === safeToAvatarId && row.kind === safeKind),
      )
    : [];

  state.avatars[index] = {
    ...source,
    relationshipsOut: sanitizeRelationships(rows, source.id),
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveState(state);
  return serializeAvatarForOwner(saved.avatars[index]);
}

export function getAvatarStorageInfo() {
  return shouldUseCloudflareBackend()
    ? { provider: "cloudflare-kv", key: getAvatarsKvKey() }
    : { provider: "local-file", path: LOCAL_AVATARS_FILE };
}

export function toAvatarUriId(avatarId) {
  return avatarIdToUriSegment(avatarId);
}
