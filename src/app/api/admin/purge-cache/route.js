import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminRoute";
import { resetGraphqlClientCaches } from "@/lib/client";
import { purgeMenuSnapshot, resetMenuCaches } from "@/lib/menu";
import { resetShopProductsCaches } from "@/lib/shopProducts";
import { bumpStorefrontCacheEpoch } from "@/lib/storefrontCache";

const REVALIDATE_PATHS = ["/", "/events", "/courses", "/shop", "/blog"];

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    resetGraphqlClientCaches();
    resetMenuCaches();
    resetShopProductsCaches();
    await purgeMenuSnapshot();

    for (const path of REVALIDATE_PATHS) {
      revalidatePath(path);
    }
    revalidatePath("/", "layout");
    const epoch = await bumpStorefrontCacheEpoch();

    return NextResponse.json({
      ok: true,
      message: "Cache purged",
      cacheEpoch: epoch,
      paths: REVALIDATE_PATHS,
    });
  } catch (err) {
    console.error("Purge cache failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to purge cache" },
      { status: 500 },
    );
  }
}
