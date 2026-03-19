import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = "shop-settings";

const ALL_TYPES = [
  "product",
  "course",
  "event",
  "digital_file",
  "digital_course",
];

const DEFAULTS = {
  visibleTypes: [...ALL_TYPES],
};

function shouldUseCloudflare() {
  return isCloudflareKvConfigured();
}

export async function getShopSettings() {
  if (shouldUseCloudflare()) {
    try {
      const data = await readCloudflareKvJson(KV_KEY);
      if (data && typeof data === "object") {
        return {
          visibleTypes: Array.isArray(data.visibleTypes)
            ? data.visibleTypes.filter((t) => ALL_TYPES.includes(t))
            : DEFAULTS.visibleTypes,
        };
      }
    } catch (error) {
      console.error("Failed to read shop settings from KV:", error);
    }
  }
  return { ...DEFAULTS };
}

export async function saveShopSettings(settings) {
  const safe = {
    visibleTypes: Array.isArray(settings?.visibleTypes)
      ? settings.visibleTypes.filter((t) => ALL_TYPES.includes(t))
      : DEFAULTS.visibleTypes,
  };
  if (shouldUseCloudflare()) {
    await writeCloudflareKvJson(KV_KEY, safe);
  }
  return safe;
}

export { ALL_TYPES };
