import { requireAdmin } from "@/lib/adminRoute";
import { getFontsCatalog } from "@/lib/googleFontsCatalog";

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  try {
    const catalog = await getFontsCatalog();
    return new Response(JSON.stringify({ ok: true, ...catalog }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load font catalog.", 500);
  }
}
