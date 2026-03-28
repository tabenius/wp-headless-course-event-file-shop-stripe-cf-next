import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

function parseEnvInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const catalogCacheTtlMs = parseEnvInt("SHOP_CATALOG_CACHE_TTL_MS", 300000);
  const graphqlEdgeCacheSec = parseEnvInt("GRAPHQL_EDGE_CACHE_SEC", 60);
  const graphqlSwrSec = parseEnvInt("GRAPHQL_SWR_SEC", 120);

  return NextResponse.json({
    ok: true,
    isrRevalidation: 300,
    catalogCacheTtl: Math.round(catalogCacheTtlMs / 1000),
    graphqlEdgeCache: graphqlEdgeCacheSec,
    graphqlStaleWhileRevalidate: graphqlSwrSec,
  });
}
