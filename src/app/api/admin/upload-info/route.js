import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

function resolveBackend() {
  return (process.env.UPLOAD_BACKEND || "wordpress").toLowerCase();
}

function buildR2Endpoint() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  return accountId ? `${accountId}.r2.cloudflarestorage.com` : "";
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const backend = resolveBackend();
  const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";

  if (backend === "wordpress") {
    return NextResponse.json({
      ok: true,
      backend,
      message: "Using WordPress media library. No S3/R2 settings required.",
    });
  }

  const isR2 = backend === "r2";
  const endpoint = isR2
    ? buildR2Endpoint()
    : (process.env.S3_ENDPOINT || "").replace(/^https?:\/\//, "");

  return NextResponse.json({
    ok: true,
    backend,
    isR2,
    endpoint: endpoint || null,
    bucket: bucket || null,
    region: isR2 ? "auto" : process.env.S3_REGION || "us-east-1",
    accessKeyId: accessKeyId || null,
    publicUrl: publicUrl || null,
    pathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    note: "Secret/access key not exposed here. Use .env values.",
  });
}
