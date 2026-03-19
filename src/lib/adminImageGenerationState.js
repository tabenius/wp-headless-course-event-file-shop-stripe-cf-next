export const IMAGE_GENERATION_SNAPSHOT_KEY = "ragbaz-admin-image-gen-snapshot";

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeText(value, maxLen = 1200) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeIsoDate(value) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeSnapshot(rawValue) {
  if (!rawValue || typeof rawValue !== "object") return null;
  const prompt = normalizeText(rawValue.prompt, 2000);
  const size = normalizeText(rawValue.size, 64);
  const status = normalizeText(rawValue.status, 64);
  const requestId = normalizeText(rawValue.requestId, 128);
  const count = clampInteger(rawValue.count, 1, 3, 1);
  const generatedCount = clampInteger(rawValue.generatedCount, 0, 3, 0);

  return {
    prompt,
    size: size || "portrait-4-5",
    count,
    generatedCount,
    status: status || "idle",
    requestId: requestId || "",
    updatedAt: normalizeIsoDate(rawValue.updatedAt),
  };
}

function resolveStorage(storageOverride) {
  if (storageOverride) return storageOverride;
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function readImageGenerationSnapshot(storageOverride) {
  const storage = resolveStorage(storageOverride);
  if (!storage) return null;
  try {
    const raw = storage.getItem(IMAGE_GENERATION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeSnapshot(parsed);
  } catch {
    return null;
  }
}

export function writeImageGenerationSnapshot(
  patch,
  storageOverride,
  now = new Date(),
) {
  const storage = resolveStorage(storageOverride);
  if (!storage) return null;
  try {
    const previous = readImageGenerationSnapshot(storage) || {};
    const merged = normalizeSnapshot({
      ...previous,
      ...patch,
      updatedAt: patch?.updatedAt || now.toISOString(),
    });
    if (!merged) return null;
    storage.setItem(IMAGE_GENERATION_SNAPSHOT_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}
