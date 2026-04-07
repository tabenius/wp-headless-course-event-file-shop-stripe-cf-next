function toSafeNumber(value, fallback) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampToAxis(value, axis) {
  const min = toSafeNumber(axis?.min, 0);
  const max = toSafeNumber(axis?.max, min);
  const safe = Math.max(min, Math.min(max, value));
  return safe;
}

export function roundToStep(value, axis) {
  const min = toSafeNumber(axis?.min, 0);
  const step = Math.max(0.0001, toSafeNumber(axis?.step, 1));
  const rounded = Math.round((value - min) / step) * step + min;
  const precision = Math.max(0, String(step).split(".")[1]?.length || 0);
  return Number.parseFloat(rounded.toFixed(Math.min(6, precision + 2)));
}

export function normalizeAxisValue(value, axis) {
  const fallback = toSafeNumber(axis?.default, toSafeNumber(axis?.min, 0));
  const numeric = toSafeNumber(value, fallback);
  return clampToAxis(roundToStep(numeric, axis), axis);
}

export function collectInitialAxisValues(axes, previous = {}) {
  const next = {};
  for (const axis of Array.isArray(axes) ? axes : []) {
    next[axis.tag] = normalizeAxisValue(previous[axis.tag], axis);
  }
  return next;
}

export function normalizeAxisState(axisValues, axes) {
  const safe = {};
  for (const axis of Array.isArray(axes) ? axes : []) {
    safe[axis.tag] = normalizeAxisValue(axisValues?.[axis.tag], axis);
  }
  return safe;
}

export function buildVariationSettings(axisValues, axes) {
  const safe = normalizeAxisState(axisValues, axes);
  return (Array.isArray(axes) ? axes : [])
    .map((axis) => `'${axis.tag}' ${safe[axis.tag]}`)
    .join(", ");
}

export function scoreFontSimilarity(selected, candidate) {
  if (!selected || !candidate) return Number.NEGATIVE_INFINITY;
  if (selected.family === candidate.family) return Number.NEGATIVE_INFINITY;

  const selectedLower = String(selected.family || "").toLowerCase();
  const candidateLower = String(candidate.family || "").toLowerCase();
  const selectedTokens = selectedLower.split(/\s+/).filter(Boolean);

  let score = 0;
  if (selected.category && selected.category === candidate.category) score += 3;
  if (candidateLower.startsWith(selectedTokens[0] || "")) score += 2;
  if (
    candidateLower.includes(selectedLower) ||
    selectedLower.includes(candidateLower)
  ) {
    score += 4;
  }
  for (const token of selectedTokens) {
    if (token.length > 2 && candidateLower.includes(token)) score += 2;
  }
  return score;
}

export function getSimilarFonts(selected, fonts, limit = 5) {
  return (Array.isArray(fonts) ? fonts : [])
    .map((font) => ({ font, score: scoreFontSimilarity(selected, font) }))
    .filter((row) => Number.isFinite(row.score) && row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.font.family || "").localeCompare(
        String(b.font.family || ""),
      );
    })
    .slice(0, Math.max(0, limit))
    .map((row) => row.font);
}

export function buildCssSnippet({ family, fontSize, variationSettings }) {
  const safeFamily = String(family || "Inter").trim() || "Inter";
  const size = Math.max(8, Math.min(300, toSafeNumber(fontSize, 52)));
  return [
    `font-family: '${safeFamily}', system-ui, sans-serif;`,
    `font-size: ${size}px;`,
    variationSettings ? `font-variation-settings: ${variationSettings};` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
