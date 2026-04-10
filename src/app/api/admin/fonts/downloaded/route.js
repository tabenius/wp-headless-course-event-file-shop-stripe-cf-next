import { requireAdmin } from "@/lib/adminRoute";
import { getDownloadedFonts } from "@/lib/downloadedFonts";

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
    const fonts = await getDownloadedFonts();
    return new Response(JSON.stringify({ ok: true, fonts }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load downloaded fonts.", 500);
  }
}
