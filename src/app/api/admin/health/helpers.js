export function buildRagbazDownloadUrl(origin) {
  const base = origin ? origin.replace(/\/+$/, "") : "";
  return `${base}/downloads/ragbaz-articulate/Ragbaz-Articulate.zip`;
}
