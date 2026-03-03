export default function cloudflareImageLoader({ src, width, quality }) {
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  const requestedQuality = quality || 75;

  // Keep local dev assets untouched.
  if (src.startsWith("/") && !src.startsWith("//")) {
    return src;
  }

  // Cloudflare Image Resizing endpoint.
  return `/cdn-cgi/image/width=${width},quality=${requestedQuality},format=auto/${src}`;
}
