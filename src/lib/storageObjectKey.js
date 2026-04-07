export function deriveObjectKeyFromPublicUrl(fileUrl, publicBaseUrl) {
  const safeFileUrl = String(fileUrl || "").trim();
  const safeBase = String(publicBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!safeFileUrl || !safeBase) return "";

  try {
    const target = new URL(safeFileUrl);
    const base = new URL(safeBase);
    if (target.origin !== base.origin) return "";
    const basePath = base.pathname.replace(/\/+$/, "");
    const targetPath = target.pathname;
    if (basePath && !targetPath.startsWith(`${basePath}/`)) return "";
    const rawKey = targetPath.slice(basePath.length).replace(/^\/+/, "");
    return decodeURIComponent(rawKey);
  } catch {
    return "";
  }
}
