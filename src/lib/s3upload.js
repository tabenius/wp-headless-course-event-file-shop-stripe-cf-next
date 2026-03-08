import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _client = null;

/**
 * Supported UPLOAD_BACKEND values:
 *   "wordpress" — upload to WordPress media library (default)
 *   "r2"        — Cloudflare R2 (S3-compatible, free 10 GB)
 *   "s3"        — any S3-compatible storage (AWS S3, DigitalOcean Spaces, Backblaze B2, MinIO, etc.)
 *
 * For "r2": uses CF_ACCOUNT_ID to derive the endpoint automatically.
 * For "s3": uses S3_ENDPOINT (e.g. https://s3.amazonaws.com or https://nyc3.digitaloceanspaces.com).
 * Both share: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_PUBLIC_URL, S3_REGION.
 *
 * R2-specific env vars (CF_R2_*) are supported as fallbacks for backwards compatibility.
 */
function getS3Client() {
  if (_client) return _client;

  const backend = getUploadBackend();
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY || "";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3-autentisering saknas (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY).");
  }

  let endpoint;
  let region = process.env.S3_REGION || "auto";

  if (backend === "r2") {
    const accountId = process.env.CF_ACCOUNT_ID;
    if (!accountId) throw new Error("CF_ACCOUNT_ID saknas (krävs för R2).");
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    region = "auto";
  } else {
    endpoint = process.env.S3_ENDPOINT;
    if (!endpoint) throw new Error("S3_ENDPOINT saknas.");
  }

  _client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  });
  return _client;
}

function getBucket() {
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  if (!bucket) throw new Error("S3_BUCKET_NAME saknas.");
  return bucket;
}

function getPublicUrl() {
  const url = (
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || ""
  ).replace(/\/+$/, "");
  if (!url) {
    throw new Error("S3_PUBLIC_URL saknas. Ange den offentliga URL:en för din bucket.");
  }
  return url;
}

/**
 * Upload a file to S3-compatible storage.
 * Returns the public URL of the uploaded object.
 */
export async function uploadToS3(buffer, fileName, contentType) {
  const client = getS3Client();
  const bucket = getBucket();
  const publicUrl = getPublicUrl();

  const key = `uploads/${Date.now()}-${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );

  return `${publicUrl}/${key}`;
}

export function getUploadBackend() {
  return (process.env.UPLOAD_BACKEND || "wordpress").toLowerCase();
}

export function isS3Upload() {
  const backend = getUploadBackend();
  return backend === "r2" || backend === "s3";
}
