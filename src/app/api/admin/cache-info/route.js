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
  const graphqlEdgeCacheSec = parseEnvInt(
    "GRAPHQL_EDGE_CACHE_TTL_SECONDS",
    60,
  );
  const graphqlSwrSec = parseEnvInt(
    "GRAPHQL_EDGE_CACHE_STALE_SECONDS",
    120,
  );
  const graphqlDelayMs = parseEnvInt("GRAPHQL_DELAY_MS", 180);
  const graphqlJitterMs = parseEnvInt("GRAPHQL_JITTER_MS", 120);
  const graphqlPersistentCacheTtlSec = parseEnvInt(
    "GRAPHQL_PERSISTENT_CACHE_TTL_SECONDS",
    300,
  );
  const graphqlPersistentCacheStaleSec = parseEnvInt(
    "GRAPHQL_PERSISTENT_CACHE_STALE_SECONDS",
    3600,
  );

  return NextResponse.json({
    ok: true,
    isrRevalidation: 300,
    catalogCacheTtl: Math.round(catalogCacheTtlMs / 1000),
    graphqlEdgeCache: graphqlEdgeCacheSec,
    graphqlStaleWhileRevalidate: graphqlSwrSec,
    graphqlDelayMs,
    graphqlJitterMs,
    graphqlPersistentCache:
      process.env.GRAPHQL_PERSISTENT_CACHE === "0" ? "disabled" : "enabled",
    graphqlPersistentCacheTtl: graphqlPersistentCacheTtlSec,
    graphqlPersistentCacheStale: graphqlPersistentCacheStaleSec,
  });
}
