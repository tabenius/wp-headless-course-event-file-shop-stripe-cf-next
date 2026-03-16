import { NextResponse } from "next/server";

// Simple endpoint to surface last deployment timestamp.
export async function GET() {
  const ts =
    process.env.LAST_DEPLOYED_AT ||
    process.env.VERCEL_DEPLOYMENT_TIME ||
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
    "";
  return NextResponse.json({
    ok: true,
    timestamp: ts || null,
  });
}
