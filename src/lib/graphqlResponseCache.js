import {
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const DEFAULT_PREFIX = "graphql:response:v1:";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getGraphqlResponseCacheConfig() {
  const freshTtlSeconds = parsePositiveInt(
    process.env.GRAPHQL_PERSISTENT_CACHE_TTL_SECONDS,
    300,
  );
  const staleTtlSeconds = parsePositiveInt(
    process.env.GRAPHQL_PERSISTENT_CACHE_STALE_SECONDS,
    3600,
  );
  return {
    enabled: process.env.GRAPHQL_PERSISTENT_CACHE !== "0",
    bindingName: String(
      process.env.GRAPHQL_PERSISTENT_CACHE_KV_BINDING || "COURSE_ACCESS",
    ).trim(),
    prefix: String(
      process.env.GRAPHQL_PERSISTENT_CACHE_PREFIX || DEFAULT_PREFIX,
    ).trim(),
    freshTtlSeconds,
    staleTtlSeconds,
    maxBytes: parsePositiveInt(
      process.env.GRAPHQL_PERSISTENT_CACHE_MAX_BYTES,
      512000,
    ),
    kvReadCacheTtlSeconds: parsePositiveInt(
      process.env.GRAPHQL_PERSISTENT_CACHE_KV_READ_TTL_SECONDS,
      30,
    ),
  };
}

let cloudflareContextLoader;

async function loadCloudflareContextLoader() {
  if (cloudflareContextLoader !== undefined) return cloudflareContextLoader;
  try {
    const mod = await import("@opennextjs/cloudflare");
    cloudflareContextLoader =
      typeof mod.getCloudflareContext === "function"
        ? mod.getCloudflareContext
        : typeof mod.default?.getCloudflareContext === "function"
          ? mod.default.getCloudflareContext
          : null;
  } catch {
    cloudflareContextLoader = null;
  }
  return cloudflareContextLoader;
}

async function getKvBinding(bindingName) {
  if (!bindingName) return null;
  try {
    const loader = await loadCloudflareContextLoader();
    if (!loader) return null;
    const ctx = await loader({ async: true });
    const binding = ctx?.env?.[bindingName];
    return binding && typeof binding.get === "function" ? binding : null;
  } catch {
    return null;
  }
}

async function digestSha256Hex(value) {
  const input = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildGraphqlResponseCacheKey({
  endpoint,
  query,
  variables,
  cacheEpoch = 0,
} = {}) {
  const config = getGraphqlResponseCacheConfig();
  const digest = await digestSha256Hex(
    JSON.stringify({
      endpoint: endpoint || "",
      query: query || "",
      variables: variables ?? {},
      cacheEpoch: Number.isFinite(cacheEpoch) ? cacheEpoch : 0,
    }),
  );
  return `${config.prefix}${digest}`;
}

function normalizeEntry(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!payload.data || typeof payload.data !== "object") return null;
  const expiresAt = Number.parseInt(String(payload.expiresAt ?? ""), 10);
  const staleUntil = Number.parseInt(String(payload.staleUntil ?? ""), 10);
  return {
    data: payload.data,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    staleUntil: Number.isFinite(staleUntil) ? staleUntil : 0,
    updatedAt:
      typeof payload.updatedAt === "string"
        ? payload.updatedAt
        : new Date(0).toISOString(),
    operationName:
      typeof payload.operationName === "string"
        ? payload.operationName
        : "anonymous",
  };
}

const localCache = new Map();

export function resetGraphqlResponseCacheForTests() {
  localCache.clear();
}

export async function readGraphqlResponseCache(
  key,
  { allowStale = false } = {},
) {
  const config = getGraphqlResponseCacheConfig();
  if (!config.enabled || !key) return null;
  const now = Date.now();
  const local = normalizeEntry(localCache.get(key));
  if (local && (local.expiresAt > now || (allowStale && local.staleUntil > now))) {
    return {
      data: local.data,
      stale: local.expiresAt <= now,
      source: "memory",
      updatedAt: local.updatedAt,
      operationName: local.operationName,
    };
  }

  let payload = null;
  const binding = await getKvBinding(config.bindingName);
  if (binding) {
    const text = await binding.get(key).catch(() => null);
    if (typeof text === "string" && text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
  }
  if (!payload) {
    payload = await readCloudflareKvJsonWithOptions(key, {
      cacheMode: "force-cache",
      revalidateSeconds: config.kvReadCacheTtlSeconds,
    }).catch(() => null);
  }

  const entry = normalizeEntry(payload);
  if (!entry) return null;
  localCache.set(key, entry);
  if (entry.expiresAt <= now && (!allowStale || entry.staleUntil <= now)) {
    return null;
  }
  return {
    data: entry.data,
    stale: entry.expiresAt <= now,
    source: binding ? "kv-binding" : "kv-rest",
    updatedAt: entry.updatedAt,
    operationName: entry.operationName,
  };
}

export async function writeGraphqlResponseCache(
  key,
  data,
  { operationName = "anonymous" } = {},
) {
  const config = getGraphqlResponseCacheConfig();
  if (!config.enabled || !key || !data || typeof data !== "object") {
    return false;
  }
  const now = Date.now();
  const payload = {
    data,
    updatedAt: new Date(now).toISOString(),
    operationName,
    expiresAt: now + config.freshTtlSeconds * 1000,
    staleUntil: now + (config.freshTtlSeconds + config.staleTtlSeconds) * 1000,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > config.maxBytes) return false;

  localCache.set(key, payload);
  const expirationTtl = config.freshTtlSeconds + config.staleTtlSeconds;
  const binding = await getKvBinding(config.bindingName);
  if (binding && typeof binding.put === "function") {
    await binding.put(key, serialized, { expirationTtl }).catch(() => {});
    return true;
  }
  await writeCloudflareKvJson(key, payload, { expirationTtl }).catch(
    () => false,
  );
  return true;
}
