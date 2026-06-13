import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    kv: false,
    graphql: false,
  };

  try {
    const { getGraphqlClient } = await import("@/lib/client");
    const client = getGraphqlClient();
    const result = await client.query(
      `
      query HealthCheck {
        generalSettings {
          title
        }
      }
    `,
    );
    checks.graphql = !!result?.data?.generalSettings?.title;
  } catch {
    checks.graphql = false;
  }

  try {
    const { getStorefrontCacheEpoch } = await import(
      "@/lib/storefrontCache"
    );
    const epoch = await getStorefrontCacheEpoch();
    checks.kv = typeof epoch === "number";
  } catch {
    checks.kv = false;
  }

  const healthy = checks.graphql && checks.kv;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      healthy,
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
