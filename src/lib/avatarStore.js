import crypto from "node:crypto";
import { getD1Database } from "@/lib/d1Bindings";

function avatarRowToObject(row, relationships = []) {
  if (!row) return null;
  let details = {};
  try {
    details = JSON.parse(row.details || "{}");
  } catch {
    /* ignore */
  }
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
  const row = await db
    .prepare(`SELECT * FROM avatars WHERE ${whereClause} LIMIT 1`)
    .bind(...bindValues)
    .first();
  if (!row) return null;
  const { results: rels } = await db
    .prepare("SELECT * FROM avatar_relationships WHERE from_avatar_id = ?")
    .bind(row.id)
    .all();
  return avatarRowToObject(row, rels || []);
}

const HEX_RE = /^[0-9a-f]+$/;
const REL_KIND_RE = /^[a-z0-9._:-]{1,48}$/;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeAvatarId(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
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

async function assertCanonicalNameAvailable(db, canonicalName, excludeAvatarId = "") {
  const safeCanonicalName = normalizeCanonicalName(canonicalName);
  if (!safeCanonicalName) return;
  const existing = await db
    .prepare(
      "SELECT id FROM avatars WHERE canonical_name = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(safeCanonicalName)
    .first();
  if (!existing) return;
  if (excludeAvatarId && String(existing.id || "") === String(excludeAvatarId)) {
    return;
  }
  throw new Error("Canonical name is already registered by another avatar.");
}

function normalizeRelationshipKind(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
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
    const safeKey = String(key || "")
      .trim()
      .slice(0, 64);
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

export async function getOwnAvatar(user) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) return null;

  const db = await getD1Database();
  const avatar = await d1GetAvatarWithRels(db, "owner_user_id = ?", [
    ownerUserId,
  ]);
  return avatar ? serializeAvatarForOwner(avatar) : null;
}

export async function createOwnAvatar(user, initialPatch = {}) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) throw new Error("Invalid user identity.");

  const db = await getD1Database();
  const existing = await d1GetAvatarWithRels(db, "owner_user_id = ?", [
    ownerUserId,
  ]);
  if (existing)
    return { avatar: serializeAvatarForOwner(existing), created: false };

  const ownerEmail = normalizeEmail(user?.email || "");
  const preferredId = deriveAvatarIdFromEmail(ownerEmail);
  const idCheck = preferredId
    ? await db
        .prepare("SELECT 1 FROM avatars WHERE id = ?")
        .bind(preferredId)
        .first()
    : true;
  const avatarId =
    preferredId && !idCheck ? preferredId : randomAvatarId(new Set());
  const now = new Date().toISOString();

  const canonicalName = normalizeCanonicalName(
    initialPatch?.canonicalName || "",
  );
  const isPublic = initialPatch?.isPublic === true ? 1 : 0;
  const profileImageUrl =
    typeof initialPatch?.profileImageUrl === "string" &&
    isValidHttpUrl(initialPatch.profileImageUrl)
      ? initialPatch.profileImageUrl.trim()
      : "";
  const bio =
    typeof initialPatch?.bio === "string" ? initialPatch.bio.trim() : "";
  const details = JSON.stringify(sanitizeDetails(initialPatch?.details || {}));

  if (canonicalName) {
    await assertCanonicalNameAvailable(db, canonicalName);
  }

  try {
    await db
      .prepare(
        "INSERT INTO avatars (id, owner_user_id, canonical_name, is_public, profile_image_url, bio, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        avatarId,
        ownerUserId,
        canonicalName || null,
        isPublic,
        profileImageUrl,
        bio,
        details,
        now,
        now,
      )
      .run();
  } catch (err) {
    if (
      String(err).includes("UNIQUE constraint failed") &&
      String(err).includes("canonical_name")
    ) {
      throw new Error(
        "Canonical name is already registered by another avatar.",
      );
    }
    throw err;
  }

  const created = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
  return { avatar: serializeAvatarForOwner(created), created: true };
}

export async function getPublicAvatarById(avatarId) {
  const safeAvatarId = normalizeAvatarId(avatarId);
  if (!safeAvatarId) return null;

  const db = await getD1Database();
  const avatar = await d1GetAvatarWithRels(db, "id = ? AND is_public = 1", [
    safeAvatarId,
  ]);
  return avatar ? serializeAvatarForPublic(avatar) : null;
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

  const db = await getD1Database();
  const avatarId = normalizeAvatarId(safeHandle);
  let avatar = null;
  if (avatarId) {
    avatar = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
  } else {
    avatar = await d1GetAvatarWithRels(
      db,
      "canonical_name = ? COLLATE NOCASE",
      [safeHandle],
    );
  }
  if (!avatar) return null;
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

  const db = await getD1Database();
  const current = await d1GetAvatarWithRels(db, "owner_user_id = ?", [
    ownerUserId,
  ]);
  if (!current) throw new Error("Avatar not found. Create an avatar first.");

  const updates = [];
  const binds = [];

  if (Object.prototype.hasOwnProperty.call(patch, "isPublic")) {
    updates.push("is_public = ?");
    binds.push(patch.isPublic === true ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "canonicalName")) {
    const cn = normalizeCanonicalName(patch.canonicalName);
    if (patch.canonicalName && !cn)
      throw new Error(
        "Invalid canonical name (must be UTF-8 up to 128 bytes).",
      );
    if (cn) {
      await assertCanonicalNameAvailable(db, cn, current.id);
    }
    updates.push("canonical_name = ?");
    binds.push(cn || null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "profileImageUrl")) {
    const url =
      typeof patch.profileImageUrl === "string"
        ? patch.profileImageUrl.trim()
        : "";
    if (!isValidHttpUrl(url)) throw new Error("Invalid profile image URL.");
    updates.push("profile_image_url = ?");
    binds.push(url);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "bio")) {
    const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
    if (Buffer.byteLength(bio, "utf8") > 8192)
      throw new Error("Bio is too long.");
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
      await db
        .prepare(`UPDATE avatars SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
    } catch (err) {
      if (
        String(err).includes("UNIQUE constraint failed") &&
        String(err).includes("canonical_name")
      ) {
        throw new Error(
          "Canonical name is already registered by another avatar.",
        );
      }
      throw err;
    }
  }

  const updated = await d1GetAvatarWithRels(db, "id = ?", [current.id]);
  return serializeAvatarForOwner(updated);
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

  const db = await getD1Database();
  const ownerUserId = String(user?.id || "").trim();
  const source = await db
    .prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1")
    .bind(ownerUserId)
    .first();
  if (!source) throw new Error("Avatar not found. Create an avatar first.");
  if (source.id === safeToAvatarId)
    throw new Error(
      "Avatar relationship target must be different from source.",
    );
  const target = await db
    .prepare("SELECT 1 FROM avatars WHERE id = ?")
    .bind(safeToAvatarId)
    .first();
  if (!target) throw new Error("Target avatar not found.");

  const safeKind = normalizeRelationshipKind(kind);
  const safeNote =
    typeof note === "string" && Buffer.byteLength(note, "utf8") <= 512
      ? note.trim()
      : "";
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

export async function removeOwnAvatarRelationship(
  user,
  { toAvatarId, kind = "follow" } = {},
) {
  const safeToAvatarId = normalizeAvatarId(toAvatarId);
  if (!safeToAvatarId) {
    throw new Error("Invalid target avatar id.");
  }
  const safeKind = normalizeRelationshipKind(kind);

  const db = await getD1Database();
  const ownerUserId = String(user?.id || "").trim();
  const source = await db
    .prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1")
    .bind(ownerUserId)
    .first();
  if (!source) throw new Error("Avatar not found. Create an avatar first.");
  await db
    .prepare(
      "DELETE FROM avatar_relationships WHERE from_avatar_id = ? AND to_avatar_id = ? AND kind = ?",
    )
    .bind(source.id, safeToAvatarId, safeKind)
    .run();

  const updated = await d1GetAvatarWithRels(db, "id = ?", [source.id]);
  return serializeAvatarForOwner(updated);
}

export function getAvatarStorageInfo() {
  return {
    provider: "cloudflare-d1",
    tables: ["avatars", "avatar_relationships"],
  };
}

export function toAvatarUriId(avatarId) {
  return avatarIdToUriSegment(avatarId);
}
