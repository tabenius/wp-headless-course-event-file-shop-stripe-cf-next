export function buildRagbazDownloadUrl(origin) {
  const configured = String(
    process.env.RAGBAZ_BRIDGE_PLUGIN_DOWNLOAD_URL ||
      process.env.NEXT_PUBLIC_RAGBAZ_BRIDGE_PLUGIN_DOWNLOAD_URL ||
      "",
  ).trim();
  if (configured) {
    if (/^https?:\/\//i.test(configured)) return configured;
    const base = origin ? origin.replace(/\/+$/, "") : "https://ragbaz.xyz";
    return `${base}/${configured.replace(/^\/+/, "")}`;
  }
  return "https://ragbaz.xyz/downloads/ragbaz-bridge/ragbaz-bridge.zip";
}
