import {
  getDownloadedFonts,
  getAllFontFaceCss,
  parseFontWeightList,
} from "@/lib/downloadedFonts";

const CORE_FONT_WEIGHTS = parseFontWeightList(
  process.env.SITE_FONTS_CORE_WEIGHTS || "300,400,500,600,700,800",
);

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const mode = String(url.searchParams.get("mode") || "core").toLowerCase();
    const fonts = await getDownloadedFonts();
    const css = getAllFontFaceCss(fonts, {
      trimToWeights: mode === "full" ? [] : CORE_FONT_WEIGHTS,
    });
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
