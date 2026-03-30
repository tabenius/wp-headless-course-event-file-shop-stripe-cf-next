import {
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const STOREFRONT_CACHE_STATE_KEY = "storefront:cache:state";
const STOREFRONT_CACHE_EPOCH_TTL_MS =
  Number.parseInt(process.env.STOREFRONT_CACHE_EPOCH_TTL_MS || "60000", 10) ||
  60000;

let localEpoch = 0;
let localEpochExpiresAt = 0;
let epochPending = null;

function toSafeEpoch(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

async function readEpochFromKv() {
  try {
    const payload = await readCloudflareKvJsonWithOptions(
      STOREFRONT_CACHE_STATE_KEY,
      {
        cacheMode: "force-cache",
        revalidateSeconds: Math.max(
          1,
          Math.floor(STOREFRONT_CACHE_EPOCH_TTL_MS / 1000),
        ),
      },
    );
    if (!payload || typeof payload !== "object") return null;
    return toSafeEpoch(payload.epoch);
  } catch {
    return null;
  }
}

export async function getStorefrontCacheEpoch() {
  const now = Date.now();
  if (localEpochExpiresAt > now) return localEpoch;
  if (epochPending) return epochPending;

  epochPending = (async () => {
    const kvEpoch = await readEpochFromKv();
    if (kvEpoch !== null) {
      localEpoch = kvEpoch;
    }
    localEpochExpiresAt = Date.now() + STOREFRONT_CACHE_EPOCH_TTL_MS;
    return localEpoch;
  })().finally(() => {
    epochPending = null;
  });

  return epochPending;
}

export async function bumpStorefrontCacheEpoch() {
  const current = await getStorefrontCacheEpoch();
  const next = Math.max(current, localEpoch) + 1;
  localEpoch = next;
  localEpochExpiresAt = Date.now() + STOREFRONT_CACHE_EPOCH_TTL_MS;
  try {
    await writeCloudflareKvJson(STOREFRONT_CACHE_STATE_KEY, {
      epoch: next,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[storefrontCache] Failed to persist cache epoch:",
      error?.message || error,
    );
  }
  return next;
}
