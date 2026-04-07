import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const LOCAL_FILE = ".data/avatar-feed-store.json";
const DEFAULT_FEED_SLUG = "default";
const COMPOSITE_FEED_SLUG = "composite";
const RESERVED_FEED_SLUGS = new Set([DEFAULT_FEED_SLUG, COMPOSITE_FEED_SLUG]);

const HEX_RE = /^[0-9a-f]+$/;
const ASSET_ID_RE = /^[a-z0-9._:-]+$/;
const FEED_SLUG_RE = /^[a-z0-9._-]+$/;
const CREATOR_TYPE_SET = new Set(["admin", "user", "avatar"]);

let inMemoryState = {
  assets: [],
  feeds: [],
  follows: [],
  items: [],
};

function nowIso() {
  return new Date().toISOString();
}

function utf8Length(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

function sanitizeText(value, max = 512) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeLongText(value, max = 4096) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizeIsoDate(value, fallback) {
  const text = sanitizeText(value, 80);
  if (!text) return fallback;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function createHexId(length = 24) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return hex.slice(0, length);
}

function getStoreKvKey() {
  return process.env.CF_AVATAR_FEED_STORE_KEY || "avatar-feed-store";
}

function shouldUseCloudflareBackend() {
  return (
    process.env.AVATAR_FEED_STORE_BACKEND === "cloudflare" ||
    isCloudflareKvConfigured()
  );
}

function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname || "/";
    } catch {
      path = raw;
    }
  }
  let safe = path.replace(/\s+/g, "").replace(/\/{2,}/g, "/");
  if (!safe.startsWith("/")) safe = `/${safe}`;
  if (safe.length > 1) safe = safe.replace(/\/+$/, "");
  return safe.slice(0, max) || "/";
}

function normalizeAssetId(value, max = 96) {
  const raw = sanitizeText(value, max).toLowerCase();
  if (!raw || !ASSET_ID_RE.test(raw)) return "";
  return raw;
}

function normalizeAvatarId(value) {
  const raw = sanitizeText(value, 128).toLowerCase();
  if (!raw) return "";
  const withoutPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!withoutPrefix || !HEX_RE.test(withoutPrefix)) return "";
  return withoutPrefix;
}

function toAvatarUriSegment(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  return normalized ? `0x${normalized}` : "";
}

function normalizeFeedSlug(value) {
  const safe = sanitizeText(value, 64).toLowerCase();
  if (!safe || !FEED_SLUG_RE.test(safe)) return "";
  return safe;
}

function normalizeCreatorType(value) {
  const safe = sanitizeText(value, 16).toLowerCase();
  if (!CREATOR_TYPE_SET.has(safe)) return "admin";
  return safe;
}

function normalizeCreatorId(value, creatorType) {
  if (creatorType === "avatar") return normalizeAvatarId(value);
  if (creatorType === "admin") return "admins";
  return sanitizeText(value, 160) || "";
}

function normalizeRights(raw) {
  const rights = raw && typeof raw === "object" ? raw : {};
  return {
    copyrightHolder: sanitizeText(rights.copyrightHolder, 180),
    license: sanitizeText(rights.license, 180),
  };
}

function normalizeSource(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sizeParsed = Number.parseInt(String(source.sizeBytes ?? ""), 10);
  const widthParsed = Number.parseInt(String(source.width ?? ""), 10);
  const heightParsed = Number.parseInt(String(source.height ?? ""), 10);
  return {
    backend: sanitizeText(source.backend, 32).toLowerCase(),
    sourceId: sanitizeText(source.sourceId, 120),
    key: sanitizeText(source.key, 512),
    url: sanitizeText(source.url, 1200),
    mimeType: sanitizeText(source.mimeType, 120).toLowerCase(),
    sizeBytes:
      Number.isFinite(sizeParsed) && sizeParsed >= 0 ? sizeParsed : null,
    width: Number.isFinite(widthParsed) && widthParsed > 0 ? widthParsed : null,
    height:
      Number.isFinite(heightParsed) && heightParsed > 0 ? heightParsed : null,
    role: sanitizeText(source.role, 40).toLowerCase(),
    format: sanitizeText(source.format, 40).toLowerCase(),
    variantKind: sanitizeText(source.variantKind, 80).toLowerCase(),
    sourceHash: sanitizeText(source.sourceHash, 180),
    originalUrl: sanitizeText(source.originalUrl, 1200),
    originalId: sanitizeText(source.originalId, 120),
  };
}

function sourceIdentity(source) {
  const safe = normalizeSource(source);
  const kind =
    safe.variantKind || safe.role || safe.format || safe.sourceId || safe.url;
  return sanitizeText(kind, 180).toLowerCase();
}

function mergeVariantSources(existingVariants = [], incomingSource = null) {
  const merged = [];
  const seen = new Set();
  const push = (entry) => {
    const safe = normalizeSource(entry);
    if (!safe.url && !safe.sourceId && !safe.variantKind) return;
    const key = sourceIdentity(safe);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(safe);
  };

  for (const variant of Array.isArray(existingVariants)
    ? existingVariants
    : []) {
    push(variant);
  }
  if (incomingSource) push(incomingSource);
  return merged;
}

function pickPrimarySource(variants = [], fallbackSource = null) {
  const list = Array.isArray(variants) ? variants : [];
  const rank = {
    "responsive-md": 0,
    compressed: 1,
    "derived-work": 2,
    "responsive-lg": 3,
    "responsive-sm": 4,
    original: 5,
  };
  const scored = list
    .map((entry) => {
      const safe = normalizeSource(entry);
      const key = sanitizeText(safe.variantKind, 80).toLowerCase();
      const base = Number.isFinite(rank[key]) ? rank[key] : 20;
      const sizeBias =
        Number.isFinite(safe.width) && safe.width > 0
          ? Math.abs(safe.width - 1280) / 10000
          : 5;
      return { safe, score: base + sizeBias };
    })
    .sort((left, right) => left.score - right.score);
  if (scored.length > 0) return scored[0].safe;
  return normalizeSource(fallbackSource);
}

function normalizeAssetRecord(raw) {
  const assetId = normalizeAssetId(raw?.assetId);
  if (!assetId) return null;
  const creatorType = normalizeCreatorType(raw?.creatorType);
  let creatorId = normalizeCreatorId(raw?.creatorId, creatorType);
  let safeCreatorType = creatorType;
  if (!creatorId) {
    safeCreatorType = "admin";
    creatorId = "admins";
  }
  const createdAtFallback = nowIso();
  const createdAt = normalizeIsoDate(raw?.createdAt, createdAtFallback);
  const updatedAt = normalizeIsoDate(raw?.updatedAt, createdAt);
  const uri =
    sanitizeText(raw?.uri, 400) || `/assets/${encodeURIComponent(assetId)}`;
  const normalizedSource = normalizeSource(raw?.source);
  const normalizedVariants = mergeVariantSources(
    raw?.variants,
    normalizedSource,
  );
  return {
    assetId,
    ownerUri: normalizeOwnerUri(raw?.ownerUri || "/"),
    uri,
    slug: sanitizeText(raw?.slug, 120).toLowerCase(),
    title: sanitizeText(raw?.title, 200),
    creatorType: safeCreatorType,
    creatorId,
    rights: normalizeRights(raw?.rights),
    source: pickPrimarySource(normalizedVariants, normalizedSource),
    variants: normalizedVariants,
    createdAt,
    updatedAt,
  };
}

function normalizeFeedReference(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const avatarId = normalizeAvatarId(source.avatarId || source.avatarHex);
  const feedSlug = normalizeFeedSlug(source.feedSlug || source.slug);
  if (!avatarId || !feedSlug) return null;
  return { avatarId, feedSlug };
}

function normalizeCollectionFeed(raw) {
  const avatarId = normalizeAvatarId(raw?.avatarId);
  const slug = normalizeFeedSlug(raw?.slug);
  if (!avatarId || !slug || RESERVED_FEED_SLUGS.has(slug)) return null;
  const feedIdRaw = sanitizeText(raw?.feedId || raw?.id, 64).toLowerCase();
  const feedId =
    feedIdRaw && HEX_RE.test(feedIdRaw) ? feedIdRaw : createHexId(24);
  const referencesRaw = Array.isArray(raw?.references) ? raw.references : [];
  const references = [];
  const seen = new Set();
  for (const row of referencesRaw) {
    const normalized = normalizeFeedReference(row);
    if (!normalized) continue;
    const dedupe = `${normalized.avatarId}:${normalized.feedSlug}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    references.push(normalized);
    if (references.length >= 256) break;
  }
  const createdAtFallback = nowIso();
  const createdAt = normalizeIsoDate(raw?.createdAt, createdAtFallback);
  const updatedAt = normalizeIsoDate(raw?.updatedAt, createdAt);
  return {
    feedId,
    avatarId,
    slug,
    kind: "collection",
    title: sanitizeText(raw?.title || slug, 120),
    description: sanitizeLongText(raw?.description, 2400),
    references,
    createdAt,
    updatedAt,
  };
}

function normalizeFollow(raw) {
  const followerAvatarId = normalizeAvatarId(raw?.followerAvatarId);
  const targetAvatarId = normalizeAvatarId(raw?.targetAvatarId);
  if (!followerAvatarId || !targetAvatarId) return null;
  const rawSlug = sanitizeText(raw?.feedSlug, 64).toLowerCase();
  const feedSlug = rawSlug === "*" ? "*" : normalizeFeedSlug(rawSlug);
  if (!feedSlug) return null;
  const createdAtFallback = nowIso();
  const createdAt = normalizeIsoDate(raw?.createdAt, createdAtFallback);
  return {
    followerAvatarId,
    targetAvatarId,
    feedSlug,
    createdAt,
  };
}

function normalizeItem(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const itemIdRaw = sanitizeText(source.itemId || source.id, 64).toLowerCase();
  const itemId = itemIdRaw && HEX_RE.test(itemIdRaw) ? itemIdRaw : "";
  const avatarId = normalizeAvatarId(source.avatarId);
  const feedSlug = normalizeFeedSlug(source.feedSlug);
  const assetId = normalizeAssetId(source.assetId);
  if (!itemId || !avatarId || !feedSlug || !assetId) return null;
  const createdAtFallback = nowIso();
  const createdAt = normalizeIsoDate(source.createdAt, createdAtFallback);
  const updatedAt = normalizeIsoDate(source.updatedAt, createdAt);
  return {
    itemId,
    avatarId,
    feedSlug,
    assetId,
    caption: sanitizeLongText(source.caption, 1200),
    note: sanitizeLongText(source.note, 1800),
    createdAt,
    updatedAt,
  };
}

function sanitizeState(rawState) {
  const source = rawState && typeof rawState === "object" ? rawState : {};

  const assets = [];
  const assetIds = new Set();
  for (const row of Array.isArray(source.assets) ? source.assets : []) {
    const safe = normalizeAssetRecord(row);
    if (!safe) continue;
    if (assetIds.has(safe.assetId)) continue;
    assetIds.add(safe.assetId);
    assets.push(safe);
  }

  const feeds = [];
  const feedKeys = new Set();
  for (const row of Array.isArray(source.feeds) ? source.feeds : []) {
    const safe = normalizeCollectionFeed(row);
    if (!safe) continue;
    const key = `${safe.avatarId}:${safe.slug}`;
    if (feedKeys.has(key)) continue;
    feedKeys.add(key);
    feeds.push(safe);
  }

  const follows = [];
  const followKeys = new Set();
  for (const row of Array.isArray(source.follows) ? source.follows : []) {
    const safe = normalizeFollow(row);
    if (!safe) continue;
    const key = `${safe.followerAvatarId}:${safe.targetAvatarId}:${safe.feedSlug}`;
    if (followKeys.has(key)) continue;
    followKeys.add(key);
    follows.push(safe);
  }

  const items = [];
  const itemIds = new Set();
  for (const row of Array.isArray(source.items) ? source.items : []) {
    const safe = normalizeItem(row);
    if (!safe) continue;
    if (itemIds.has(safe.itemId)) continue;
    itemIds.add(safe.itemId);
    items.push(safe);
  }

  return { assets, feeds, follows, items };
}

async function ensureLocalStore() {
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const filePath = path.join(process.cwd(), LOCAL_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(sanitizeState(inMemoryState), null, 2),
      "utf8",
    );
  }
}

async function readLocalState() {
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const filePath = path.join(process.cwd(), LOCAL_FILE);
    const raw = await fs.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    console.error(
      "Local avatar feed store unavailable. Using in-memory fallback:",
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
    const filePath = path.join(process.cwd(), LOCAL_FILE);
    const safe = sanitizeState(state);
    await fs.writeFile(filePath, JSON.stringify(safe, null, 2), "utf8");
  } catch (error) {
    console.error(
      "Local avatar feed store write unavailable. Updating in-memory fallback:",
      error,
    );
    inMemoryState = sanitizeState(state);
  }
}

async function readCloudflareState() {
  const data = await readCloudflareKvJson(getStoreKvKey());
  return sanitizeState(data || {});
}

async function writeCloudflareState(state) {
  return writeCloudflareKvJson(getStoreKvKey(), sanitizeState(state));
}

async function getState() {
  if (shouldUseCloudflareBackend()) {
    try {
      return await readCloudflareState();
    } catch (error) {
      console.error(
        "Cloudflare avatar feed store read failed; using in-memory fallback:",
        error,
      );
      return sanitizeState(inMemoryState);
    }
  }
  // Local file I/O is not available in edge/Cloudflare Workers runtime
  if (process.env.NEXT_RUNTIME === "edge") {
    return sanitizeState(inMemoryState);
  }
  return readLocalState();
}

async function saveState(state) {
  const safe = sanitizeState(state);
  if (shouldUseCloudflareBackend()) {
    try {
      const wrote = await writeCloudflareState(safe);
      if (wrote) return safe;
    } catch (error) {
      console.error(
        "Cloudflare avatar feed store write failed; updating in-memory fallback:",
        error,
      );
      inMemoryState = safe;
      return safe;
    }
  }
  // Local file I/O is not available in edge/Cloudflare Workers runtime
  if (process.env.NEXT_RUNTIME === "edge") {
    inMemoryState = safe;
    return safe;
  }
  await writeLocalState(safe);
  return safe;
}

function getCollectionFeed(state, avatarId, feedSlug) {
  return (
    state.feeds.find(
      (row) => row.avatarId === avatarId && row.slug === feedSlug,
    ) || null
  );
}

function feedExists(state, avatarId, feedSlug) {
  if (!avatarId || !feedSlug) return false;
  if (feedSlug === DEFAULT_FEED_SLUG || feedSlug === COMPOSITE_FEED_SLUG) {
    return true;
  }
  return Boolean(getCollectionFeed(state, avatarId, feedSlug));
}

function buildFeedUri(avatarId, feedSlug) {
  const avatarHex = toAvatarUriSegment(avatarId);
  if (!avatarHex) return "";
  if (feedSlug === DEFAULT_FEED_SLUG || feedSlug === COMPOSITE_FEED_SLUG) {
    return `/avatar/${encodeURIComponent(avatarHex)}/${feedSlug}`;
  }
  return `/avatar/${encodeURIComponent(avatarHex)}/feeds/${encodeURIComponent(feedSlug)}`;
}

function sortNewestFirst(rows) {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left?.createdAt || "") || 0;
    const rightTs = Date.parse(right?.createdAt || "") || 0;
    if (rightTs !== leftTs) return rightTs - leftTs;
    return String(left?.itemId || "").localeCompare(
      String(right?.itemId || ""),
    );
  });
}

function serializeAsset(row) {
  const asset = normalizeAssetRecord(row);
  if (!asset) return null;
  const creatorUri =
    asset.creatorType === "avatar"
      ? `/avatar/${encodeURIComponent(toAvatarUriSegment(asset.creatorId))}`
      : asset.creatorType === "user"
        ? `/users/${encodeURIComponent(asset.creatorId)}`
        : "/admins";
  return {
    assetId: asset.assetId,
    ownerUri: asset.ownerUri,
    uri: asset.uri,
    slug: asset.slug || null,
    title: asset.title || null,
    creator: {
      type: asset.creatorType,
      id: asset.creatorId,
      uri: creatorUri,
    },
    rights: asset.rights,
    source: asset.source,
    variants: Array.isArray(asset.variants) ? asset.variants : [asset.source],
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function serializeFeedDescriptor(avatarId, row) {
  const safeAvatarId = normalizeAvatarId(avatarId);
  if (!safeAvatarId) return null;
  if (row === DEFAULT_FEED_SLUG) {
    return {
      avatarId: safeAvatarId,
      avatarUriId: toAvatarUriSegment(safeAvatarId),
      slug: DEFAULT_FEED_SLUG,
      kind: "default",
      title: "Default feed",
      description: "",
      isVirtual: false,
      canPublish: true,
      uri: buildFeedUri(safeAvatarId, DEFAULT_FEED_SLUG),
      references: [],
    };
  }
  if (row === COMPOSITE_FEED_SLUG) {
    return {
      avatarId: safeAvatarId,
      avatarUriId: toAvatarUriSegment(safeAvatarId),
      slug: COMPOSITE_FEED_SLUG,
      kind: "composite",
      title: "Composite feed",
      description:
        "Virtual stream that combines own default feed, collection feeds, and followed feeds.",
      isVirtual: true,
      canPublish: false,
      uri: buildFeedUri(safeAvatarId, COMPOSITE_FEED_SLUG),
      references: [],
    };
  }
  const safe = normalizeCollectionFeed(row);
  if (!safe || safe.avatarId !== safeAvatarId) return null;
  return {
    avatarId: safe.avatarId,
    avatarUriId: toAvatarUriSegment(safe.avatarId),
    feedId: safe.feedId,
    slug: safe.slug,
    kind: safe.kind,
    title: safe.title || safe.slug,
    description: safe.description || "",
    isVirtual: true,
    canPublish: false,
    uri: buildFeedUri(safe.avatarId, safe.slug),
    references: safe.references,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  };
}

function assertFeedSlug(feedSlug) {
  const normalized = normalizeFeedSlug(feedSlug);
  if (!normalized) {
    const error = new Error("Invalid feed slug.");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function assertAvatarId(avatarId, message = "Invalid avatar id.") {
  const normalized = normalizeAvatarId(avatarId);
  if (!normalized) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function assertAssetId(assetId) {
  const normalized = normalizeAssetId(assetId);
  if (!normalized) {
    const error = new Error("Invalid asset id.");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeItemId(itemId) {
  const raw = sanitizeText(itemId, 64).toLowerCase();
  if (!raw || !HEX_RE.test(raw)) return "";
  return raw;
}

function assertItemId(itemId) {
  const normalized = normalizeItemId(itemId);
  if (!normalized) {
    const error = new Error("Invalid item id.");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function resolveFeedReferences(
  state,
  avatarId,
  feedSlug,
  seen = new Set(),
  depth = 0,
) {
  const key = `${avatarId}:${feedSlug}`;
  if (seen.has(key) || depth > 8) return [];
  seen.add(key);

  if (feedSlug === COMPOSITE_FEED_SLUG) {
    const ownDefault = resolveFeedReferences(
      state,
      avatarId,
      DEFAULT_FEED_SLUG,
      seen,
      depth + 1,
    );
    const ownCollectionRefs = state.feeds
      .filter((row) => row.avatarId === avatarId)
      .flatMap((row) =>
        resolveFeedReferences(state, avatarId, row.slug, seen, depth + 1),
      );
    const followedRefs = state.follows
      .filter((row) => row.followerAvatarId === avatarId)
      .flatMap((row) => {
        if (row.feedSlug === "*") {
          return resolveFeedReferences(
            state,
            row.targetAvatarId,
            DEFAULT_FEED_SLUG,
            seen,
            depth + 1,
          );
        }
        return resolveFeedReferences(
          state,
          row.targetAvatarId,
          row.feedSlug,
          seen,
          depth + 1,
        );
      });
    return [...ownDefault, ...ownCollectionRefs, ...followedRefs];
  }

  if (feedSlug === DEFAULT_FEED_SLUG) {
    return [{ avatarId, feedSlug: DEFAULT_FEED_SLUG }];
  }

  const collection = getCollectionFeed(state, avatarId, feedSlug);
  if (!collection) return [];
  const refs = collection.references.flatMap((row) =>
    resolveFeedReferences(state, row.avatarId, row.feedSlug, seen, depth + 1),
  );
  return refs;
}

function dedupeFeedRefs(rows) {
  const output = [];
  const seen = new Set();
  for (const row of rows) {
    const avatarId = normalizeAvatarId(row?.avatarId);
    const feedSlug = normalizeFeedSlug(row?.feedSlug);
    if (!avatarId || !feedSlug) continue;
    const key = `${avatarId}:${feedSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ avatarId, feedSlug });
  }
  return output;
}

function canReadFeedSync(state, viewerAvatarId, targetAvatarId, feedSlug) {
  if (!feedExists(state, targetAvatarId, feedSlug)) return false;
  if (!viewerAvatarId) return false;
  if (viewerAvatarId === targetAvatarId) return true;
  return state.follows.some(
    (row) =>
      row.followerAvatarId === viewerAvatarId &&
      row.targetAvatarId === targetAvatarId &&
      (row.feedSlug === "*" || row.feedSlug === feedSlug),
  );
}

function serializeItem(row, assetsById) {
  const safe = normalizeItem(row);
  if (!safe) return null;
  const asset = serializeAsset(assetsById.get(safe.assetId));
  return {
    itemId: safe.itemId,
    uri: `/items/${encodeURIComponent(safe.itemId)}`,
    avatarId: safe.avatarId,
    avatarUriId: toAvatarUriSegment(safe.avatarId),
    feedSlug: safe.feedSlug,
    feedUri: buildFeedUri(safe.avatarId, safe.feedSlug),
    assetId: safe.assetId,
    asset: asset || null,
    caption: safe.caption || "",
    note: safe.note || "",
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  };
}

export function getAvatarFeedStoreInfo() {
  return shouldUseCloudflareBackend()
    ? { provider: "cloudflare-kv", key: getStoreKvKey() }
    : { provider: "local-file", path: LOCAL_FILE };
}

export function getDefaultFeedSlug() {
  return DEFAULT_FEED_SLUG;
}

export function getCompositeFeedSlug() {
  return COMPOSITE_FEED_SLUG;
}

export function buildAvatarFeedUri(avatarId, feedSlug) {
  return buildFeedUri(avatarId, feedSlug);
}

export async function upsertAssetRecord(input = {}) {
  const assetId = assertAssetId(input.assetId);
  const state = await getState();
  const index = state.assets.findIndex((row) => row.assetId === assetId);
  const existing = index >= 0 ? state.assets[index] : null;
  const incomingSource = normalizeSource(input?.source);
  const existingVariants = Array.isArray(existing?.variants)
    ? existing.variants
    : existing?.source
      ? [existing.source]
      : [];
  const mergedVariants = mergeVariantSources(existingVariants, incomingSource);
  const primarySource = pickPrimarySource(mergedVariants, incomingSource);
  const next = normalizeAssetRecord({
    ...(existing || {}),
    ...input,
    assetId,
    source: primarySource,
    variants: mergedVariants,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  if (!next) {
    const error = new Error("Invalid asset payload.");
    error.statusCode = 400;
    throw error;
  }
  if (index >= 0) {
    state.assets[index] = next;
  } else {
    state.assets.push(next);
  }
  const saved = await saveState(state);
  const savedRow = saved.assets.find((row) => row.assetId === assetId) || next;
  return serializeAsset(savedRow);
}

export async function registerUploadedAsset({
  asset,
  uploadResult,
  creatorType = "admin",
  creatorId = "admins",
} = {}) {
  const sourceAsset = asset && typeof asset === "object" ? asset : {};
  const sourceResult =
    uploadResult && typeof uploadResult === "object" ? uploadResult : {};
  const assetId = normalizeAssetId(sourceAsset.assetId);
  if (!assetId) return null;

  const input = {
    assetId,
    ownerUri: sourceAsset.ownerUri || "/",
    uri:
      sanitizeText(sourceAsset.uri, 400) ||
      `/assets/${encodeURIComponent(assetId)}`,
    slug: sanitizeText(sourceAsset.slug, 120).toLowerCase(),
    creatorType,
    creatorId,
    rights: {
      copyrightHolder: sanitizeText(sourceAsset?.rights?.copyrightHolder, 180),
      license: sanitizeText(sourceAsset?.rights?.license, 180),
    },
    source: {
      backend: sanitizeText(sourceAsset.backend, 32).toLowerCase(),
      sourceId: sanitizeText(sourceResult.id, 120),
      key: sanitizeText(sourceResult.key, 512),
      url: sanitizeText(sourceResult.url, 1200),
      mimeType: sanitizeText(sourceResult.mimeType, 120).toLowerCase(),
      sizeBytes: sourceResult.sizeBytes,
      width: sourceResult.width,
      height: sourceResult.height,
      role: sanitizeText(sourceAsset.role, 40).toLowerCase(),
      format: sanitizeText(sourceAsset.format, 40).toLowerCase(),
      variantKind: sanitizeText(sourceAsset.variantKind, 80).toLowerCase(),
      sourceHash: sanitizeText(sourceAsset.sourceHash, 180),
      originalUrl: sanitizeText(sourceAsset?.original?.url, 1200),
      originalId: sanitizeText(sourceAsset?.original?.id, 120),
    },
    updatedAt: nowIso(),
  };
  return upsertAssetRecord(input);
}

export async function getAssetRecord(assetId) {
  const safeAssetId = normalizeAssetId(assetId);
  if (!safeAssetId) return null;
  const state = await getState();
  const row = state.assets.find((item) => item.assetId === safeAssetId);
  return serializeAsset(row);
}

export async function listAssetsByCreator({ creatorType, creatorId } = {}) {
  const safeType = normalizeCreatorType(creatorType);
  const safeId = normalizeCreatorId(creatorId, safeType);
  if (!safeId) return [];
  const state = await getState();
  return state.assets
    .filter((row) => row.creatorType === safeType && row.creatorId === safeId)
    .map((row) => serializeAsset(row))
    .filter(Boolean);
}

export async function listAvatarFeeds(avatarId) {
  const safeAvatarId = assertAvatarId(avatarId, "Invalid avatar id.");
  const state = await getState();
  const custom = state.feeds
    .filter((row) => row.avatarId === safeAvatarId)
    .sort((left, right) => {
      const leftTs = Date.parse(left.createdAt || "") || 0;
      const rightTs = Date.parse(right.createdAt || "") || 0;
      if (rightTs !== leftTs) return rightTs - leftTs;
      return left.slug.localeCompare(right.slug);
    });
  return [
    serializeFeedDescriptor(safeAvatarId, DEFAULT_FEED_SLUG),
    serializeFeedDescriptor(safeAvatarId, COMPOSITE_FEED_SLUG),
    ...custom.map((row) => serializeFeedDescriptor(safeAvatarId, row)),
  ].filter(Boolean);
}

export async function createCollectionFeed({
  avatarId,
  slug,
  title,
  description,
  references = [],
} = {}) {
  const safeAvatarId = assertAvatarId(avatarId, "Invalid avatar id.");
  const safeSlug = assertFeedSlug(slug);
  if (RESERVED_FEED_SLUGS.has(safeSlug)) {
    const error = new Error("Reserved feed slug.");
    error.statusCode = 400;
    throw error;
  }

  const state = await getState();
  const existing = state.feeds.find(
    (row) => row.avatarId === safeAvatarId && row.slug === safeSlug,
  );
  if (existing) {
    const error = new Error("Feed slug already exists for avatar.");
    error.statusCode = 409;
    throw error;
  }

  const safeReferences = dedupeFeedRefs(references)
    .filter((row) => feedExists(state, row.avatarId, row.feedSlug))
    .slice(0, 256);
  const now = nowIso();
  const row = normalizeCollectionFeed({
    feedId: createHexId(24),
    avatarId: safeAvatarId,
    slug: safeSlug,
    title: sanitizeText(title || safeSlug, 120),
    description: sanitizeLongText(description, 2400),
    references: safeReferences,
    createdAt: now,
    updatedAt: now,
  });
  if (!row) {
    const error = new Error("Invalid collection feed payload.");
    error.statusCode = 400;
    throw error;
  }
  state.feeds.push(row);
  const saved = await saveState(state);
  const savedRow = saved.feeds.find(
    (feed) => feed.avatarId === safeAvatarId && feed.slug === safeSlug,
  );
  return serializeFeedDescriptor(safeAvatarId, savedRow || row);
}

export async function listAvatarFeedFollows(avatarId) {
  const safeAvatarId = assertAvatarId(avatarId, "Invalid avatar id.");
  const state = await getState();
  return state.follows
    .filter((row) => row.followerAvatarId === safeAvatarId)
    .map((row) => ({
      followerAvatarId: row.followerAvatarId,
      targetAvatarId: row.targetAvatarId,
      targetAvatarUriId: toAvatarUriSegment(row.targetAvatarId),
      feedSlug: row.feedSlug,
      feedUri:
        row.feedSlug === "*"
          ? `/avatar/${encodeURIComponent(toAvatarUriSegment(row.targetAvatarId))}`
          : buildFeedUri(row.targetAvatarId, row.feedSlug),
      createdAt: row.createdAt,
    }));
}

export async function followAvatarFeed({
  followerAvatarId,
  targetAvatarId,
  feedSlug = DEFAULT_FEED_SLUG,
} = {}) {
  const safeFollower = assertAvatarId(
    followerAvatarId,
    "Invalid follower avatar id.",
  );
  const safeTarget = assertAvatarId(
    targetAvatarId,
    "Invalid target avatar id.",
  );
  const safeSlugRaw = sanitizeText(feedSlug, 64).toLowerCase();
  const safeSlug = safeSlugRaw === "*" ? "*" : assertFeedSlug(safeSlugRaw);

  if (safeFollower === safeTarget && safeSlug !== COMPOSITE_FEED_SLUG) {
    const error = new Error("Following own feeds is not supported.");
    error.statusCode = 400;
    throw error;
  }

  const state = await getState();
  if (safeSlug !== "*" && !feedExists(state, safeTarget, safeSlug)) {
    const error = new Error("Target feed not found.");
    error.statusCode = 404;
    throw error;
  }

  const key = `${safeFollower}:${safeTarget}:${safeSlug}`;
  const exists = state.follows.some(
    (row) =>
      `${row.followerAvatarId}:${row.targetAvatarId}:${row.feedSlug}` === key,
  );
  if (!exists) {
    state.follows.push(
      normalizeFollow({
        followerAvatarId: safeFollower,
        targetAvatarId: safeTarget,
        feedSlug: safeSlug,
        createdAt: nowIso(),
      }),
    );
    await saveState(state);
  }

  return {
    followerAvatarId: safeFollower,
    targetAvatarId: safeTarget,
    targetAvatarUriId: toAvatarUriSegment(safeTarget),
    feedSlug: safeSlug,
    feedUri:
      safeSlug === "*"
        ? `/avatar/${encodeURIComponent(toAvatarUriSegment(safeTarget))}`
        : buildFeedUri(safeTarget, safeSlug),
  };
}

export async function unfollowAvatarFeed({
  followerAvatarId,
  targetAvatarId,
  feedSlug = DEFAULT_FEED_SLUG,
} = {}) {
  const safeFollower = assertAvatarId(
    followerAvatarId,
    "Invalid follower avatar id.",
  );
  const safeTarget = assertAvatarId(
    targetAvatarId,
    "Invalid target avatar id.",
  );
  const safeSlugRaw = sanitizeText(feedSlug, 64).toLowerCase();
  const safeSlug = safeSlugRaw === "*" ? "*" : assertFeedSlug(safeSlugRaw);

  const state = await getState();
  const before = state.follows.length;
  state.follows = state.follows.filter(
    (row) =>
      !(
        row.followerAvatarId === safeFollower &&
        row.targetAvatarId === safeTarget &&
        row.feedSlug === safeSlug
      ),
  );
  if (state.follows.length !== before) {
    await saveState(state);
  }
  return { removed: state.follows.length !== before };
}

export async function canAvatarReadFeed({
  viewerAvatarId,
  targetAvatarId,
  feedSlug,
} = {}) {
  const safeViewer = normalizeAvatarId(viewerAvatarId);
  const safeTarget = normalizeAvatarId(targetAvatarId);
  const safeFeed = normalizeFeedSlug(feedSlug);
  if (!safeViewer || !safeTarget || !safeFeed) return false;
  const state = await getState();
  return canReadFeedSync(state, safeViewer, safeTarget, safeFeed);
}

export async function publishAvatarFeedItem({
  actorAvatarId,
  avatarId,
  feedSlug = DEFAULT_FEED_SLUG,
  assetId,
  caption = "",
  note = "",
} = {}) {
  const safeActor = assertAvatarId(actorAvatarId, "Invalid avatar id.");
  const safeOwner = assertAvatarId(
    avatarId || actorAvatarId,
    "Invalid avatar id.",
  );
  const safeFeed = assertFeedSlug(feedSlug);
  const safeAssetId = assertAssetId(assetId);

  if (safeActor !== safeOwner) {
    const error = new Error("Avatar may only publish to own feeds.");
    error.statusCode = 403;
    throw error;
  }
  if (safeFeed === COMPOSITE_FEED_SLUG) {
    const error = new Error(
      "Composite feed is virtual and cannot accept items.",
    );
    error.statusCode = 400;
    throw error;
  }

  const state = await getState();
  if (!feedExists(state, safeOwner, safeFeed)) {
    const error = new Error("Target feed not found.");
    error.statusCode = 404;
    throw error;
  }
  const feed = getCollectionFeed(state, safeOwner, safeFeed);
  if (feed?.kind === "collection") {
    const error = new Error(
      "Collection feeds are virtual and cannot accept items.",
    );
    error.statusCode = 400;
    throw error;
  }
  const asset = state.assets.find((row) => row.assetId === safeAssetId);
  if (!asset) {
    const error = new Error("Underlying asset was not found.");
    error.statusCode = 404;
    throw error;
  }

  const now = nowIso();
  const item = normalizeItem({
    itemId: createHexId(24),
    avatarId: safeOwner,
    feedSlug: safeFeed,
    assetId: safeAssetId,
    caption,
    note,
    createdAt: now,
    updatedAt: now,
  });
  if (!item) {
    const error = new Error("Invalid feed item payload.");
    error.statusCode = 400;
    throw error;
  }
  state.items.push(item);
  const saved = await saveState(state);
  const savedItem =
    saved.items.find((row) => row.itemId === item.itemId) || item;
  const assetsById = new Map(saved.assets.map((row) => [row.assetId, row]));
  return serializeItem(savedItem, assetsById);
}

export async function listAvatarFeedItems({
  viewerAvatarId,
  avatarId,
  feedSlug = DEFAULT_FEED_SLUG,
} = {}) {
  const safeViewer = assertAvatarId(
    viewerAvatarId,
    "A viewer avatar is required to read feeds.",
  );
  const safeOwner = assertAvatarId(avatarId, "Invalid avatar id.");
  const safeFeed = assertFeedSlug(feedSlug);

  const state = await getState();
  if (!canReadFeedSync(state, safeViewer, safeOwner, safeFeed)) {
    const error = new Error("Feed access denied.");
    error.statusCode = 403;
    throw error;
  }
  const refs = dedupeFeedRefs(
    resolveFeedReferences(state, safeOwner, safeFeed, new Set(), 0),
  );
  const directItems = state.items.filter((item) =>
    refs.some(
      (ref) => ref.avatarId === item.avatarId && ref.feedSlug === item.feedSlug,
    ),
  );
  const assetsById = new Map(state.assets.map((row) => [row.assetId, row]));
  return sortNewestFirst(directItems)
    .map((row) => serializeItem(row, assetsById))
    .filter(Boolean);
}

export async function getFeedItem(itemId) {
  const safeItemId = assertItemId(itemId);
  const state = await getState();
  const row = state.items.find((item) => item.itemId === safeItemId);
  if (!row) return null;
  const assetsById = new Map(
    state.assets.map((asset) => [asset.assetId, asset]),
  );
  return serializeItem(row, assetsById);
}

export async function canAvatarReadItem({ viewerAvatarId, itemId } = {}) {
  const safeViewer = normalizeAvatarId(viewerAvatarId);
  const safeItemId = normalizeItemId(itemId);
  if (!safeViewer || !safeItemId) return false;
  const state = await getState();
  const item = state.items.find((row) => row.itemId === safeItemId);
  if (!item) return false;
  return canReadFeedSync(state, safeViewer, item.avatarId, item.feedSlug);
}
