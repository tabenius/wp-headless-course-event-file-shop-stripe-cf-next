import { NextResponse } from "next/server";
import { getShopSettings } from "@/lib/shopSettings";

export const runtime = "edge";

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
      { ok: false, error: "Failed to load site style." },
      { status: 500 },
    );
  }
}
