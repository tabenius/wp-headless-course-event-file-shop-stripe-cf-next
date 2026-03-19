export const SIZE_PRESETS = {
  square: { width: 512, height: 512 },
  landscape: { width: 896, height: 512 },
  portrait: { width: 512, height: 768 },
  "portrait-4-5": { width: 640, height: 800 },
  "portrait-3-4": { width: 768, height: 1024 },
  "landscape-16-9": { width: 1024, height: 576 },
  "story-9-16": { width: 576, height: 1024 },
  "a6-150dpi": { width: 624, height: 880 },
};

export function resolveSize(key) {
  return SIZE_PRESETS[key] ?? SIZE_PRESETS.square;
}

export function clampCount(raw) {
  return Math.max(1, Math.min(3, Math.floor(Number(raw) || 1)));
}

export function computeResetsAt() {
  const now = new Date();
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1)).toISOString();
}

export function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return "data:image/png;base64," + btoa(binary);
}
