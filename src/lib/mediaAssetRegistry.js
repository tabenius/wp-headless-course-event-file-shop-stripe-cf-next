import { getD1Database } from "@/lib/d1Bindings";

function assetRowToObject(row) {
  if (!row) return null;
  let metadata = {},
    rights = {},
    assetInfo = {};
  try {
    metadata = JSON.parse(row.metadata || "{}");
  } catch {
    /* ignore */
  }
  try {
    rights = JSON.parse(row.rights || "{}");
  } catch {
    /* ignore */
  }
  try {
    assetInfo = JSON.parse(row.asset_info || "{}");
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    key: row.key,
    title: row.title,
    url: row.url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    metadata,
    rights,
    asset: assetInfo,
    createdAt: row.created_at,
    savedAt: row.saved_at,
    updatedAt: row.saved_at,
  };
}

function safeText(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let safe = raw.replace(/\s+/g, "").replace(/\/{2,}/g, "/");
  if (!safe.startsWith("/")) safe = `/${safe}`;
  if (safe.length > 1) safe = safe.replace(/\/+$/, "");
  return safe.slice(0, max) || "/";
}

function sanitizeAssetSlug(value, max = 120) {
  const raw = safeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, max);
}

function sanitizeAssetId(value, max = 96) {
  const raw = safeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw.replace(/[^a-z0-9._:-]/g, "");
}

function normalizeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function normalizeIsoDate(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function defaultAssetUri(assetId) {
  if (!assetId) return "";
  return `/assets/${encodeURIComponent(assetId)}`;
}

function sanitizeAssetEntry(entry, existing = null) {
  if (!entry || typeof entry !== "object") return null;
  const now = new Date().toISOString();
  const key = safeText(entry.key, 512).replace(/^\/+/, "");
  if (!key) return null;

  const title =
    safeText(entry.title, 200) || safeText(key.split("/").pop(), 200);
  const assetId = sanitizeAssetId(entry.asset?.assetId || entry.assetId, 96);
  const ownerUri = normalizeOwnerUri(
    entry.asset?.ownerUri || entry.ownerUri || "/",
  );
  const assetUriRaw = safeText(entry.asset?.uri || entry.assetUri, 400);
  const assetUri = assetUriRaw || defaultAssetUri(assetId);
  const assetSlug = sanitizeAssetSlug(
    entry.asset?.slug || entry.assetSlug,
    120,
  );
  const sourceId = safeText(entry.sourceId || key, 160);
  const format =
    safeText(entry.asset?.format || entry.format, 40) ||
    safeText(key.split(".").pop(), 24).toLowerCase();

  const next = {
    id: safeText(entry.id, 180) || `r2:${key}`,
    source: "r2",
    sourceId: sourceId || key,
    key,
    title,
    url: safeText(entry.url, 1200),
    mimeType: safeText(entry.mimeType, 120),
    sizeBytes: normalizeInteger(entry.sizeBytes),
    width: normalizeInteger(entry.width),
    height: normalizeInteger(entry.height),
    updatedAt: normalizeIsoDate(entry.updatedAt) || now,
    metadata: {
      title,
      caption: safeText(entry.metadata?.caption, 300),
      description: safeText(entry.metadata?.description, 1200),
      altText: safeText(entry.metadata?.altText, 300),
      tooltip: safeText(entry.metadata?.tooltip, 300),
      usageNotes: safeText(entry.metadata?.usageNotes, 1200),
      structuredMeta: safeText(entry.metadata?.structuredMeta, 1800),
      schemaRef: safeText(entry.metadata?.schemaRef, 400),
    },
    rights: {
      copyrightHolder: safeText(
        entry.rights?.copyrightHolder || entry.copyrightHolder,
        180,
      ),
      license: safeText(entry.rights?.license || entry.license, 180),
    },
    asset: {
      assetId: assetId || null,
      ownerUri,
      uri: assetUri || null,
      slug: assetSlug || null,
      accessInheritance: "owner",
      role: safeText(entry.asset?.role, 40) || "original",
      format: format || null,
      variantKind: safeText(entry.asset?.variantKind, 80) || "original",
      sourceHash:
        safeText(entry.asset?.sourceHash || entry.sourceHash, 180) || null,
      originalUrl:
        safeText(entry.asset?.originalUrl, 1200) ||
        safeText(entry.url, 1200) ||
        null,
      originalId: safeText(entry.asset?.originalId || sourceId, 160) || null,
      variants: Array.isArray(entry.asset?.variants)
        ? entry.asset.variants
        : [],
      author: {
        type: "admin",
        id: "admins",
      },
    },
    createdAt: normalizeIsoDate(existing?.createdAt) || now,
    savedAt: now,
  };
  return next;
}

export async function listMediaAssetRegistry() {
  const db = await getD1Database();
  const { results } = await db
    .prepare("SELECT * FROM media_assets ORDER BY saved_at DESC")
    .all();
  return (results || []).map(assetRowToObject).filter(Boolean);
}

export async function findMediaAssetByAssetId(assetId) {
  if (!assetId) return null;
  const db = await getD1Database();
  const row = await db
    .prepare(
      "SELECT * FROM media_assets WHERE json_extract(asset_info, '$.assetId') = ? LIMIT 1",
    )
    .bind(assetId)
    .first();
  return assetRowToObject(row);
}

export async function upsertMediaAssetRegistry(entry) {
  const id =
    safeText(entry?.id, 180) ||
    `r2:${safeText(entry?.key, 512).replace(/^\/+/, "")}`;

  const db = await getD1Database();
  const existingRow = await db
    .prepare("SELECT * FROM media_assets WHERE id = ?")
    .bind(id)
    .first();
  const existing = existingRow ? assetRowToObject(existingRow) : null;
  const next = sanitizeAssetEntry({ ...existing, ...entry, id }, existing);
  if (!next) throw new Error("Invalid media asset registry entry.");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO media_assets (id, source, source_id, key, title, url, mime_type, size_bytes, width, height, metadata, rights, asset_info, created_at, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source=excluded.source, source_id=excluded.source_id, key=excluded.key,
         title=excluded.title, url=excluded.url, mime_type=excluded.mime_type,
         size_bytes=excluded.size_bytes, width=excluded.width, height=excluded.height,
         metadata=excluded.metadata, rights=excluded.rights, asset_info=excluded.asset_info,
         saved_at=excluded.saved_at`,
    )
    .bind(
      next.id,
      next.source || "r2",
      next.sourceId || "",
      next.key,
      next.title,
      next.url,
      next.mimeType || "",
      next.sizeBytes ?? null,
      next.width ?? null,
      next.height ?? null,
      JSON.stringify(next.metadata || {}),
      JSON.stringify(next.rights || {}),
      JSON.stringify(next.asset || {}),
      next.createdAt || now,
      now,
    )
    .run();
  return next;
}

export function getMediaAssetRegistryStorageInfo() {
  return { provider: "cloudflare-d1", table: "media_assets" };
}
