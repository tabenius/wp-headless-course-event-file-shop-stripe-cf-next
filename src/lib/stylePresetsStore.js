import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "./cloudflareKv.js";
import { normalizeCtaStyle } from "./shopSettings.js";

const KV_KEY = "style-presets";
const VALID_TYPES = new Set(["cta", "typography"]);

/** Normalize raw KV value → { cta: [], typography: [] } */
export function normalizePresets(raw) {
  if (!raw || typeof raw !== "object") return { cta: [], typography: [] };
  const normalize = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.id.trim() &&
        typeof entry.name === "string" &&
        entry.name.trim(),
    );
  };
  return {
    cta: normalize(raw.cta),
    typography: normalize(raw.typography),
  };
}

/**
 * Validate POST body fields. Returns an error string or null.
 */
export function validatePresetInput(type, name, style) {
  if (!VALID_TYPES.has(type)) return "type must be 'cta' or 'typography'";
  if (!name || typeof name !== "string" || !name.trim()) return "name is required";
  if (name.trim().length > 80) return "name must be 80 characters or fewer";
  if (!style || typeof style !== "object") return "style is required";
  return null;
}

/** Pure: return new presets with entry appended to the correct array. */
export function applyAddPreset(presets, type, entry) {
  return {
    ...presets,
    [type]: [...presets[type], entry],
  };
}

/** Pure: return new presets with matching entry removed from the correct array. */
export function applyRemovePreset(presets, type, id) {
  return {
    ...presets,
    [type]: presets[type].filter((entry) => entry.id !== id),
  };
}

/** Read style-presets from KV, normalize, return { cta, typography }. */
export async function getStylePresets() {
  const raw = await readCloudflareKvJson(KV_KEY);
  return normalizePresets(raw);
}

/**
 * Add a preset. For CTA type, normalizes style through normalizeCtaStyle.
 * Returns { ok: true, preset } or { ok: false, error }.
 */
export async function addStylePreset(type, name, style) {
  const validationError = validatePresetInput(type, name, style);
  if (validationError) return { ok: false, error: validationError };

  let normalizedStyle = style;
  if (type === "cta") {
    const normalized = normalizeCtaStyle(style);
    if (normalized.type === "upstream") {
      return { ok: false, error: "Cannot save upstream as a named CTA preset" };
    }
    normalizedStyle = normalized;
  }

  const id = crypto.randomUUID();
  const preset = { id, name: name.trim(), style: normalizedStyle };

  const presets = await getStylePresets();
  const next = applyAddPreset(presets, type, preset);
  await writeCloudflareKvJson(KV_KEY, next);

  return { ok: true, preset };
}

/**
 * Remove a preset by id and type. Idempotent.
 * Returns { ok: true }.
 */
export async function removeStylePreset(type, id) {
  if (!VALID_TYPES.has(type)) return { ok: false, error: "Invalid type" };
  const presets = await getStylePresets();
  const next = applyRemovePreset(presets, type, id);
  await writeCloudflareKvJson(KV_KEY, next);
  return { ok: true };
}
