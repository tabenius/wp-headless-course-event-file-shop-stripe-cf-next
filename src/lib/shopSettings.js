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
  vatByCategory: {},
};

function normalizeVatCategoryKey(key) {
  if (typeof key !== "string") return "";
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeVatByCategory(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeVatCategoryKey(rawKey);
    if (!key) continue;
    const numeric =
      typeof rawValue === "number"
        ? rawValue
        : Number.parseFloat(String(rawValue || "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) continue;
    output[key] = Math.round(numeric * 100) / 100;
  }
  return output;
}

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
            : [...DEFAULTS.visibleTypes],
          vatByCategory: normalizeVatByCategory(data.vatByCategory),
        };
      }
    } catch (error) {
      console.error("Failed to read shop settings from KV:", error);
    }
  }
  return {
    visibleTypes: [...DEFAULTS.visibleTypes],
    vatByCategory: { ...DEFAULTS.vatByCategory },
  };
}

export async function saveShopSettings(settings) {
  const current = await getShopSettings();
  const safe = {
    visibleTypes: Array.isArray(settings?.visibleTypes)
      ? settings.visibleTypes.filter((t) => ALL_TYPES.includes(t))
      : current.visibleTypes,
    vatByCategory:
      settings && Object.prototype.hasOwnProperty.call(settings, "vatByCategory")
        ? normalizeVatByCategory(settings.vatByCategory)
        : current.vatByCategory,
  };
  if (shouldUseCloudflare()) {
    await writeCloudflareKvJson(KV_KEY, safe);
  }
  return safe;
}

export { ALL_TYPES };
