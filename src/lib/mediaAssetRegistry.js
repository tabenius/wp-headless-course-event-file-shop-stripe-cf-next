import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = process.env.CF_MEDIA_ASSETS_KV_KEY || "media-asset-registry";
let inMemoryState = { assets: [] };

function safeText(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let safe = raw
    .replace(/\s+/g, "")
    .replace(/\/{2,}/g, "/");
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
  return `/asset/${encodeURIComponent(assetId)}`;
}

function sanitizeAssetEntry(entry, existing = null) {
  if (!entry || typeof entry !== "object") return null;
  const now = new Date().toISOString();
  const key = safeText(entry.key, 512).replace(/^\/+/, "");
  if (!key) return null;

  const title = safeText(entry.title, 200) || safeText(key.split("/").pop(), 200);
  const assetId = sanitizeAssetId(entry.asset?.assetId || entry.assetId, 96);
  const ownerUri = normalizeOwnerUri(entry.asset?.ownerUri || entry.ownerUri || "/");
  const assetUriRaw = safeText(entry.asset?.uri || entry.assetUri, 400);
  const assetUri = assetUriRaw || defaultAssetUri(assetId);
  const assetSlug = sanitizeAssetSlug(entry.asset?.slug || entry.assetSlug, 120);
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
      sourceHash: safeText(entry.asset?.sourceHash || entry.sourceHash, 180) || null,
      originalUrl: safeText(entry.asset?.originalUrl, 1200) || safeText(entry.url, 1200) || null,
      originalId: safeText(entry.asset?.originalId || sourceId, 160) || null,
      variants: Array.isArray(entry.asset?.variants) ? entry.asset.variants : [],
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

function sanitizeState(state) {
  const assets = Array.isArray(state?.assets)
    ? state.assets
        .map((entry) => sanitizeAssetEntry(entry))
        .filter(Boolean)
        .sort((left, right) =>
          String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
        )
    : [];
  return { assets };
}

async function readState() {
  if (isCloudflareKvConfigured()) {
    try {
      const fromKv = await readCloudflareKvJson(KV_KEY);
      return sanitizeState(fromKv || { assets: [] });
    } catch (error) {
      console.error("Media asset registry KV read failed", error);
    }
  }
  return sanitizeState(inMemoryState);
}

async function writeState(state) {
  const safe = sanitizeState(state);
  if (isCloudflareKvConfigured()) {
    try {
      await writeCloudflareKvJson(KV_KEY, safe);
      return safe;
    } catch (error) {
      console.error("Media asset registry KV write failed", error);
    }
  }
  inMemoryState = safe;
  return safe;
}

export async function listMediaAssetRegistry() {
  const state = await readState();
  return state.assets;
}

export async function upsertMediaAssetRegistry(entry) {
  const state = await readState();
  const id = safeText(entry?.id, 180) || `r2:${safeText(entry?.key, 512).replace(/^\/+/, "")}`;
  const currentIndex = state.assets.findIndex((row) => row.id === id);
  const current = currentIndex >= 0 ? state.assets[currentIndex] : null;
  const next = sanitizeAssetEntry(
    {
      ...current,
      ...entry,
      id,
    },
    current,
  );
  if (!next) {
    throw new Error("Invalid media asset registry entry.");
  }
  if (currentIndex >= 0) {
    state.assets[currentIndex] = next;
  } else {
    state.assets.unshift(next);
  }
  const saved = await writeState(state);
  return saved.assets.find((row) => row.id === next.id) || next;
}

export function getMediaAssetRegistryStorageInfo() {
  if (isCloudflareKvConfigured()) {
    return {
      provider: "cloudflare-kv",
      key: KV_KEY,
    };
  }
  return { provider: "memory" };
}
