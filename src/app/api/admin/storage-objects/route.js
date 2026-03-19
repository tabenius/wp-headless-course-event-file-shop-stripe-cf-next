import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { listBucketObjects, isS3Upload } from "@/lib/s3upload";

export const runtime = "nodejs";

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 20;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;
  return parsed;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit") || "20");
  const prefix = url.searchParams.get("prefix") || "uploads/";

  if (!isS3Upload()) {
    return NextResponse.json({
      ok: false,
      error: "List not available for the WordPress backend",
    });
  }

  try {
    const objects = await listBucketObjects({ prefix, limit });
    return NextResponse.json({ ok: true, objects });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to list bucket",
      },
      { status: 400 },
    );
  }
}
