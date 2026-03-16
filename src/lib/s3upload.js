import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { t } from "@/lib/i18n";

const _clients = new Map();

function resolveBackend(preferred) {
  return (preferred || process.env.UPLOAD_BACKEND || "wordpress").toLowerCase();
}

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
function getS3Client(backend = resolveBackend()) {
  if (_clients.has(backend)) return _clients.get(backend);
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY || "";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(t("s3.authMissing"));
  }

  let endpoint;
  let region = process.env.S3_REGION || "auto";

  if (backend === "r2") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) throw new Error(t("s3.accountIdMissing"));
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    region = "auto";
  } else {
    endpoint = process.env.S3_ENDPOINT;
    if (!endpoint) throw new Error(t("s3.endpointMissing"));
  }

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  });
  _clients.set(backend, client);
  return client;
}

function getBucket() {
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  if (!bucket) throw new Error(t("s3.bucketMissing"));
  return bucket;
}

function getPublicUrl() {
  const url = (
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || ""
  ).replace(/\/+$/, "");
  if (!url) {
    throw new Error(t("s3.publicUrlMissing"));
  }
  return url;
}

/**
 * Upload a file to S3-compatible storage.
 * Returns the public URL of the uploaded object.
 */
export async function uploadToS3(buffer, fileName, contentType, backend = resolveBackend()) {
  const client = getS3Client(backend);
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

/**
 * Generate a presigned PUT URL for direct browser-to-R2/S3 upload.
 * Bypasses the Worker entirely — supports files up to 5 GB.
 * Returns { uploadUrl, publicUrl, key, expiresIn }.
 */
export async function createPresignedUpload(fileName, contentType, expiresIn = 3600, backend = resolveBackend()) {
  const client = getS3Client(backend);
  const bucket = getBucket();
  const publicBaseUrl = getPublicUrl();

  const key = `uploads/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    uploadUrl,
    publicUrl: `${publicBaseUrl}/${key}`,
    key,
    expiresIn,
  };
}

/**
 * Initiate a multipart upload. Returns { uploadId, key, publicUrl }.
 * The client then requests presigned URLs for each part.
 */
export async function createMultipartUpload(fileName, contentType, backend = resolveBackend()) {
  const client = getS3Client(backend);
  const bucket = getBucket();
  const publicBaseUrl = getPublicUrl();
  const key = `uploads/${Date.now()}-${fileName}`;

  const { UploadId } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
  );

  return { uploadId: UploadId, key, publicUrl: `${publicBaseUrl}/${key}` };
}

/**
 * Generate presigned URLs for one or more parts of a multipart upload.
 * partNumbers is an array of 1-based part numbers.
 * Returns an array of { partNumber, uploadUrl }.
 */
export async function signMultipartParts(key, uploadId, partNumbers, expiresIn = 3600, backend = resolveBackend()) {
  const client = getS3Client(backend);
  const bucket = getBucket();

  const signed = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      return { partNumber, uploadUrl };
    }),
  );

  return signed;
}

/**
 * Complete a multipart upload.
 * parts is an array of { partNumber, etag } (etag from each PUT response).
 */
export async function completeMultipartUpload(key, uploadId, parts, backend = resolveBackend()) {
  const client = getS3Client(backend);
  const bucket = getBucket();
  const publicBaseUrl = getPublicUrl();

  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
      },
    }),
  );

  return `${publicBaseUrl}/${key}`;
}

/**
 * Abort a multipart upload (cleanup on failure).
 */
export async function abortMultipartUpload(key, uploadId, backend = resolveBackend()) {
  const client = getS3Client(backend);
  const bucket = getBucket();

  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export function getUploadBackend(preferred) {
  return resolveBackend(preferred);
}

export function isS3Upload(preferred) {
  const backend = resolveBackend(preferred);
  return backend === "r2" || backend === "s3";
}

export function isS3Configured(preferred) {
  const backend = resolveBackend(preferred);
  if (backend !== "r2" && backend !== "s3") return false;
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY || "";
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const publicUrl =
    (process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl) return false;
  if (backend === "r2") {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
  }
  return Boolean(process.env.S3_ENDPOINT);
}
