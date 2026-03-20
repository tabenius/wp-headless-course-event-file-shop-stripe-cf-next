import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

const S3_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function isS3BackendEnabled() {
  const raw = String(
    process.env.ENABLE_S3_UPLOAD || process.env.S3_UPLOAD_ENABLED || "",
  )
    .trim()
    .toLowerCase();
  return S3_ENABLED_VALUES.has(raw);
}

function allowedBackends() {
  return isS3BackendEnabled()
    ? new Set(["wordpress", "r2", "s3"])
    : new Set(["wordpress", "r2"]);
}

function resolveBackend(request) {
  const allowed = allowedBackends();
  const url = new URL(request.url);
  const requested = (url.searchParams.get("backend") || "").toLowerCase();
  if (allowed.has(requested)) return requested;
  const envBackend = (process.env.UPLOAD_BACKEND || "wordpress").toLowerCase();
  return allowed.has(envBackend) ? envBackend : "wordpress";
}

function buildR2Endpoint() {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  return accountId ? `${accountId}.r2.cloudflarestorage.com` : "";
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const backend = resolveBackend(request);
  const s3Enabled = isS3BackendEnabled();
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.CF_R2_SECRET_ACCESS_KEY ||
    "";

  if (backend === "wordpress") {
    return NextResponse.json({
      ok: true,
      backend,
      s3Enabled,
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
    s3Enabled,
    endpoint: endpoint || null,
    bucket: bucket || null,
    region: isR2 ? "auto" : process.env.S3_REGION || "us-east-1",
    accessKeyId: accessKeyId || null,
    secretKey: secretKey || null,
    publicUrl: publicUrl || null,
    pathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  });
}
