const CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");
const TIMING_KEY = "__ragbazTiming";

function getTimingStore() {
  try {
    const context = globalThis?.[CONTEXT_SYMBOL];
    const ctx = context?.ctx;
    if (!ctx || typeof ctx !== "object") return null;
    const existing = ctx[TIMING_KEY];
    if (existing && typeof existing === "object") return existing;
    const created = Object.create(null);
    ctx[TIMING_KEY] = created;
    return created;
  } catch {
    return null;
  }
}

function normalizeDurationMs(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

export function addServerTiming(metricName, durationMs) {
  const store = getTimingStore();
  if (!store) return;
  const key = String(metricName || "").trim();
  if (!key) return;
  const duration = normalizeDurationMs(durationMs);
  const totalKey = `${key}Ms`;
  const countKey = `${key}Count`;
  store[totalKey] = Number(store[totalKey] || 0) + duration;
  store[countKey] = Number(store[countKey] || 0) + 1;
}
