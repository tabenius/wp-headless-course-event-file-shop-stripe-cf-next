import { NextResponse } from "next/server";
import { DEFAULT_SITE_STYLE, getShopSettings } from "@/lib/shopSettings";

//export const runtime = "edge";

export async function GET() {
  try {
    const settings = await getShopSettings();
    return NextResponse.json(
      {
        ok: true,
        siteStyle:
          settings?.siteStyle && typeof settings.siteStyle === "object"
            ? settings.siteStyle
            : null,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("Site style API error:", error);
    return NextResponse.json(
      {
        ok: true,
        fallback: true,
        warning: "Failed to load site style. Served default style.",
        siteStyle: { ...DEFAULT_SITE_STYLE },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
        },
      },
    );
  }
}
