import { getDownloadedFonts, getAllFontFaceCss } from "@/lib/downloadedFonts";

export async function GET() {
  try {
    const fonts = await getDownloadedFonts();
    const css = getAllFontFaceCss(fonts);
    return new Response(css, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    // Return empty CSS rather than an error — the site degrades gracefully
    console.error("site-fonts route error:", err);
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8" },
    });
  }
}
