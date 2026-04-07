const HEX_USERNAME_RE = /^[0-9a-f]+$/;

export function normalizeUsername(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const withoutPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!withoutPrefix) return "";
  if (!HEX_USERNAME_RE.test(withoutPrefix)) return "";
  return withoutPrefix;
}

export function usernameToUriSegment(value) {
  const hex = normalizeUsername(value);
  if (!hex) return "";
  return `0x${hex}`;
}

export function resolveSessionUsername(user) {
  const existing = normalizeUsername(user?.username || "");
  if (existing) return existing;

  const idHex = String(user?.id || "")
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 24);
  return idHex || "0";
}
