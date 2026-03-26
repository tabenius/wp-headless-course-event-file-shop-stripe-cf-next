export function buildRagbazDownloadUrl(origin) {
  const base = origin ? origin.replace(/\/+$/, "") : "";
  return `${base}/downloads/ragbaz-bridge/ragbaz-bridge.zip`;
}
