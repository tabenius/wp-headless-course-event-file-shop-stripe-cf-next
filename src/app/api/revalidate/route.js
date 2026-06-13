import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resetGraphqlClientCaches } from "@/lib/client";
import { purgeMenuSnapshot, resetMenuCaches } from "@/lib/menu";
import { resetShopProductsCaches } from "@/lib/shopProducts";
import { bumpStorefrontCacheEpoch } from "@/lib/storefrontCache";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const REVALIDATE_PATHS = ["/", "/events", "/courses", "/shop", "/blog"];
const REVALIDATE_RATE_LIMIT = 10;
const REVALIDATE_RATE_WINDOW_SECS = 60;

if (!process.env.STOREFRONT_REVALIDATE_SECRET) {
  console.warn(
    "STOREFRONT_REVALIDATE_SECRET is not set — /api/revalidate will always return 401",
  );
}

function isAuthorized(request) {
  const configured = process.env.STOREFRONT_REVALIDATE_SECRET || "";
  if (!configured) return false;
  const provided = request.headers.get("x-revalidate-secret") || "";
  return provided === configured;
}

export async function POST(request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit("revalidate", ip, REVALIDATE_RATE_LIMIT, REVALIDATE_RATE_WINDOW_SECS);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many revalidation requests" }, { status: 429 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const paths = body.paths || [];
  const tags = body.tags || [];

  try {
    resetGraphqlClientCaches();
    resetMenuCaches();
    resetShopProductsCaches();
    await purgeMenuSnapshot();

    const toRevalidate = paths.length > 0 ? paths : REVALIDATE_PATHS;
    for (const path of toRevalidate) {
      revalidatePath(path);
    }
    revalidatePath("/", "layout");
    const epoch = await bumpStorefrontCacheEpoch();

    return NextResponse.json({
      ok: true,
      revalidatedPaths: toRevalidate,
      revalidatedTags: tags,
      cacheEpoch: epoch,
    });
  } catch (err) {
    console.error("Revalidate failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to revalidate cache" },
      { status: 500 },
    );
  }
}
