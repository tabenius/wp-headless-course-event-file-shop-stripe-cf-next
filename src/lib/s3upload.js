import { t } from "@/lib/i18n";
import { deriveObjectKeyFromPublicUrl } from "@/lib/storageObjectKey";
import {
  signR2Put,
  signR2Request,
  presignR2Url,
  buildR2Url,
  toHex,
} from "@/lib/r2Edge";
import { getR2Bucket } from "@/lib/r2Bindings";

const _clients = new Map();
let _awsSdkPromise = null;
const S3_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
// FIXME: error due to detection of process
/*
const isNodeRuntime =
  typeof process !== "undefined" &&
  process?.versions?.node &&
  process?.env?.NEXT_RUNTIME !== "edge";
const isEdgeRuntime =
  typeof EdgeRuntime !== "undefined" || process?.env?.NEXT_RUNTIME === "edge";
  */
const isNodeRuntime =
  typeof process !== "undefined" &&
  !!process.versions?.node &&
  process?.env?.NEXT_RUNTIME !== "edge";
const isEdgeRuntime =
  typeof EdgeRuntime !== "undefined" || process?.env?.NEXT_RUNTIME === "edge";
export const EDGE_R2_MAX_BYTES = 100 * 1024 * 1024; // 100 MB cap for edge uploads

function isS3Enabled() {
  const raw = String(
    process.env.ENABLE_S3_UPLOAD || process.env.S3_UPLOAD_ENABLED || "",
  )
    .trim()
    .toLowerCase();
  return S3_ENABLED_VALUES.has(raw);
}

async function loadAwsSdk() {
  if (!_awsSdkPromise) {
    _awsSdkPromise = Promise.all([
      import(/* webpackIgnore: true */ "@aws-sdk/client-s3"),
      import(/* webpackIgnore: true */ "@aws-sdk/s3-request-presigner"),
    ]).then(([s3, presigner]) => ({
      ...s3,
      getSignedUrl: presigner.getSignedUrl,
    }));
  }
  return _awsSdkPromise;
}

function resolveBackend(preferred) {
  const requested = String(
    preferred || process.env.UPLOAD_BACKEND || "wordpress",
  )
    .trim()
    .toLowerCase();
  if (requested === "wordpress" || requested === "r2") return requested;
  if (requested === "s3" && isS3Enabled()) return "s3";
  return "wordpress";
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
async function getS3Client(backend = resolveBackend()) {
  if (!isNodeRuntime) {
    throw new Error(
      "S3/R2 uploads via AWS SDK are not available in edge runtime; use WordPress backend or the edge R2 path.",
    );
  }
  if (_clients.has(backend)) return _clients.get(backend);
  const { S3Client } = await loadAwsSdk();
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.CF_R2_SECRET_ACCESS_KEY ||
    "";

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

function getBucket(backend = resolveBackend()) {
  const bucket =
    backend === "r2"
      ? process.env.CF_R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || ""
      : process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  if (!bucket) throw new Error(t("s3.bucketMissing"));
  return bucket;
}

function getPublicUrl(backend = resolveBackend()) {
  const rawUrl =
    backend === "r2"
      ? process.env.CF_R2_PUBLIC_URL || process.env.S3_PUBLIC_URL || ""
      : process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "";
  const url = String(rawUrl).replace(/\/+$/, "");
  if (!url) {
    throw new Error(t("s3.publicUrlMissing"));
  }
  return url;
}

function assertNodeS3Support(backend) {
  if (!isNodeRuntime) {
    throw new Error(
      backend === "r2"
        ? "R2 uploads via SDK require Node runtime; on edge we use a signed fetch path."
        : "S3 uploads require Node runtime.",
    );
  }
}

function assertEdgeR2Support() {
  if (!isEdgeRuntime) {
    throw new Error("Edge R2 path only applies on edge runtime.");
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for R2 uploads.");
  }
  if (!process.env.S3_ACCESS_KEY_ID && !process.env.CF_R2_ACCESS_KEY_ID) {
    throw new Error("R2 access key is missing.");
  }
  if (
    !process.env.S3_SECRET_ACCESS_KEY &&
    !process.env.CF_R2_SECRET_ACCESS_KEY
  ) {
    throw new Error("R2 secret key is missing.");
  }
  if (!process.env.S3_BUCKET_NAME && !process.env.CF_R2_BUCKET_NAME) {
    throw new Error("R2 bucket is missing.");
  }
  if (!process.env.S3_PUBLIC_URL && !process.env.CF_R2_PUBLIC_URL) {
    throw new Error("R2 public URL is missing.");
  }
}

function normalizeStorageMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  const normalized = {};
  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = String(key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64);
    if (!safeKey) continue;
    const safeValue = String(value ?? "")
      .trim()
      .slice(0, 1024);
    if (!safeValue) continue;
    normalized[safeKey] = safeValue;
  }
  return normalized;
}

function toR2MetadataHeaders(metadata) {
  const safe = normalizeStorageMetadata(metadata);
  const headers = {};
  for (const [key, value] of Object.entries(safe)) {
    headers[`x-amz-meta-${key}`] = value;
  }
  return headers;
}

function encodeS3CopySource(bucket, key) {
  const safeBucket = String(bucket || "").trim();
  const safeKey = String(key || "");
  const encodedKey = safeKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${safeBucket}/${encodedKey}`;
}

// ---------------------------------------------------------------------------
// R2 Binding helpers — used when running on CF Workers
// ---------------------------------------------------------------------------

function r2HttpMetadata(contentType) {
  const meta = {};
  if (contentType) meta.contentType = contentType;
  return meta;
}

function r2ObjectToHead(obj) {
  return {
    metadata: normalizeStorageMetadata(obj.customMetadata || {}),
    contentType: obj.httpMetadata?.contentType || "",
    cacheControl: obj.httpMetadata?.cacheControl || "",
    contentDisposition: obj.httpMetadata?.contentDisposition || "",
    contentEncoding: obj.httpMetadata?.contentEncoding || "",
    contentLanguage: obj.httpMetadata?.contentLanguage || "",
    sizeBytes: obj.size ?? null,
    lastModified: obj.uploaded ? obj.uploaded.toISOString() : "",
    expires: obj.httpMetadata?.expiration
      ? new Date(obj.httpMetadata.expiration).toISOString()
      : "",
  };
}

// ---------------------------------------------------------------------------
// Edge R2 helpers (signed fetch — no SDK)
// ---------------------------------------------------------------------------

function getEdgeR2Creds() {
  return {
    accessKeyId:
      process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    bucket: process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME,
    publicBaseUrl: (
      process.env.S3_PUBLIC_URL ||
      process.env.CF_R2_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, ""),
  };
}

function clampSignedUrlExpiresIn(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return 300;
  if (parsed < 30) return 30;
  if (parsed > 3600) return 3600;
  return parsed;
}

function buildContentDisposition(fileName, mode = "attachment") {
  const safe = String(fileName || "")
    .replace(/[\r\n"]/g, " ")
    .trim()
    .slice(0, 180);
  const safeMode = String(mode || "").trim().toLowerCase();
  if (safeMode !== "attachment" && safeMode !== "inline") return "";
  if (!safe) return safeMode;
  return `${safeMode}; filename="${safe}"`;
}

export function resolveStorageObjectKey(fileUrl, { backend } = {}) {
  const backendToUse = backend || resolveBackend();
  if (backendToUse !== "r2" && backendToUse !== "s3") return "";
  let publicUrl = "";
  try {
    publicUrl = getPublicUrl(backendToUse);
  } catch {
    publicUrl = "";
  }
  return deriveObjectKeyFromPublicUrl(fileUrl, publicUrl);
}

async function createR2SignedDownloadUrl({
  objectKey,
  expiresIn,
  downloadFileName,
  dispositionMode = "attachment",
}) {
  const { accessKeyId, secretAccessKey, accountId, bucket } = getEdgeR2Creds();
  if (!accessKeyId || !secretAccessKey || !accountId || !bucket) return null;

  const baseUrl = buildR2Url({ accountId, bucket, key: objectKey });
  const requestUrl = new URL(baseUrl);
  const disposition = buildContentDisposition(
    downloadFileName,
    dispositionMode,
  );
  if (disposition) {
    requestUrl.searchParams.set("response-content-disposition", disposition);
  }
  requestUrl.searchParams.set("X-Amz-Expires", String(expiresIn));
  const { AwsClient } = await import("aws4fetch");
  const signer = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const signed = await signer.sign(
    new Request(requestUrl.toString(), { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

async function createS3SignedDownloadUrl({
  objectKey,
  expiresIn,
  downloadFileName,
  dispositionMode = "attachment",
}) {
  if (!isNodeRuntime || !isS3Enabled()) return null;

  const { GetObjectCommand, getSignedUrl } = await loadAwsSdk();
  const client = await getS3Client("s3");
  const bucketName = getBucket("s3");
  const disposition = buildContentDisposition(
    downloadFileName,
    dispositionMode,
  );
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    ...(disposition ? { ResponseContentDisposition: disposition } : {}),
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Returns a short-lived signed GET URL for objects under configured storage public URLs.
 * Returns null when the file URL does not map to our configured bucket.
 */
export async function createSignedDownloadUrl({
  fileUrl,
  backend = "r2",
  expiresIn = 300,
  downloadFileName = "",
  dispositionMode = "attachment",
} = {}) {
  let resolvedUrl = String(fileUrl || "").trim();
  if (!resolvedUrl) return null;

  const candidates = [];

  const ttl = clampSignedUrlExpiresIn(expiresIn);
  if (
    resolvedUrl.substring(0, 3) === "r2:" ||
    resolvedUrl.substring(0, 3) === "s3:"
  ) {
    backend = resolvedUrl.substring(0, 2);
    resolvedUrl = resolvedUrl.substring(3);
    candidates.push(backend);
  } else {
    const requested = String(backend || "")
      .trim()
      .toLowerCase();
    if (requested === "r2" || requested === "s3") candidates.push(requested);
    if (!candidates.includes("r2")) candidates.push("r2");
    if (!candidates.includes("s3")) candidates.push("s3");
  }

  for (const candidate of candidates) {
    const objectKey = resolveStorageObjectKey(resolvedUrl, {
      backend: candidate,
    });
    if (!objectKey) continue;
    try {
      if (candidate === "r2") {
        return await createR2SignedDownloadUrl({
          objectKey,
          expiresIn: ttl,
          downloadFileName,
          dispositionMode,
        });
      }
      if (candidate === "s3") {
        return await createS3SignedDownloadUrl({
          objectKey,
          expiresIn: ttl,
          downloadFileName,
          dispositionMode,
        });
      }
    } catch (error) {
      console.error(
        `[s3upload] failed to create ${candidate.toUpperCase()} signed download URL:`,
        error,
      );
    }
  }
  return null;
}

async function uploadToR2Edge(buffer, fileName, contentType, metadata = {}) {
  assertEdgeR2Support();
  if (buffer.byteLength > EDGE_R2_MAX_BYTES) {
    throw new Error(
      `File too large for edge R2 upload (max ${EDGE_R2_MAX_BYTES / (1024 * 1024)} MB).`,
    );
  }
  const { accessKeyId, secretAccessKey, accountId, bucket, publicBaseUrl } =
    getEdgeR2Creds();
  const key = `uploads/${Date.now()}-${fileName}`;
  const url = buildR2Url({ accountId, bucket, key });
  const metadataHeaders = toR2MetadataHeaders(metadata);
  const requestHeaders = {
    "content-type": contentType || "application/octet-stream",
    ...metadataHeaders,
  };

  const signedHeaders = await signR2Put({
    url,
    body: buffer,
    headers: requestHeaders,
    accessKeyId,
    secretAccessKey,
    region: "auto",
  });

  const res = await fetch(url, {
    method: "PUT",
    headers: signedHeaders,
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return `${publicBaseUrl}/${key}`;
}

// ---------------------------------------------------------------------------
// Public API — each function tries R2 binding → edge R2 → SDK fallback
// ---------------------------------------------------------------------------

/**
 * Upload a file to S3-compatible storage.
 * Returns the public URL of the uploaded object.
 */
export async function uploadToS3(
  buffer,
  fileName,
  contentType,
  backend = resolveBackend(),
  options = {},
) {
  const metadata = normalizeStorageMetadata(options?.metadata);

  // R2 binding path (CF Workers — no SDK needed)
  if (backend === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const key = `uploads/${Date.now()}-${fileName}`;
      await bucket.put(key, buffer, {
        httpMetadata: r2HttpMetadata(contentType),
        customMetadata: metadata,
      });
      return `${publicBaseUrl}/${key}`;
    }
    if (isEdgeRuntime)
      return uploadToR2Edge(buffer, fileName, contentType, metadata);
  }

  assertNodeS3Support(backend);
  const { PutObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  const publicUrl = getPublicUrl();
  const key = `uploads/${Date.now()}-${fileName}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
      ...(Object.keys(metadata).length > 0 ? { Metadata: metadata } : {}),
    }),
  );
  return `${publicUrl}/${key}`;
}

/**
 * Generate a presigned PUT URL for direct browser-to-R2/S3 upload.
 * Bypasses the Worker entirely — supports files up to 5 GB.
 * Returns { uploadUrl, publicUrl, key, expiresIn }.
 */
export async function createPresignedUpload(
  fileName,
  contentType,
  expiresIn = 3600,
  backend = resolveBackend(),
) {
  // R2 bindings can't generate presigned URLs — use r2Edge signing instead.
  if (backend === "r2") {
    const { accessKeyId, secretAccessKey, accountId, bucket, publicBaseUrl } =
      getEdgeR2Creds();
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("R2 credentials missing for presigned URL generation.");
    }
    const key = `uploads/${Date.now()}-${fileName}`;
    const url = buildR2Url({ accountId, bucket, key });
    const uploadUrl = await presignR2Url({
      method: "PUT",
      url,
      expiresIn,
      accessKeyId,
      secretAccessKey,
      region: "auto",
    });
    return { uploadUrl, publicUrl: `${publicBaseUrl}/${key}`, key, expiresIn };
  }

  const { PutObjectCommand, getSignedUrl } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  const key = `uploads/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, publicUrl: `${publicBaseUrl}/${key}`, key, expiresIn };
}

/**
 * Initiate a multipart upload. Returns { uploadId, key, publicUrl }.
 */
export async function createMultipartUpload(
  fileName,
  contentType,
  backend = resolveBackend(),
) {
  if (backend === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const key = `uploads/${Date.now()}-${fileName}`;
      const mpu = await bucket.createMultipartUpload(key, {
        httpMetadata: r2HttpMetadata(contentType),
      });
      return {
        uploadId: mpu.uploadId,
        key,
        publicUrl: `${publicBaseUrl}/${key}`,
      };
    }
    if (isEdgeRuntime) {
      assertEdgeR2Support();
      const {
        accessKeyId,
        secretAccessKey,
        accountId,
        bucket: bucketName,
        publicBaseUrl,
      } = getEdgeR2Creds();
      const key = `uploads/${Date.now()}-${fileName}`;
      const url =
        buildR2Url({ accountId, bucket: bucketName, key }) + "?uploads";
      const signedHeaders = await signR2Request({
        method: "POST",
        url,
        headers: {},
        payloadHash: "UNSIGNED-PAYLOAD",
        accessKeyId,
        secretAccessKey,
        region: "auto",
      });
      const res = await fetch(url, { method: "POST", headers: signedHeaders });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `R2 multipart create failed (${res.status}): ${text.slice(0, 200)}`,
        );
      }
      const xml = await res.text();
      const uploadIdMatch = xml.match(/<UploadId>([^<]+)<\/UploadId>/i);
      const uploadId = uploadIdMatch ? uploadIdMatch[1] : null;
      if (!uploadId)
        throw new Error("R2 multipart create failed (no uploadId)");
      return { uploadId, key, publicUrl: `${publicBaseUrl}/${key}` };
    }
  }

  const { CreateMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  const key = `uploads/${Date.now()}-${fileName}`;
  const { UploadId } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return { uploadId: UploadId, key, publicUrl: `${publicBaseUrl}/${key}` };
}

/**
 * Generate presigned URLs for one or more parts of a multipart upload.
 * Always uses r2Edge signing for R2 (no SDK needed).
 */
export async function signMultipartParts(
  key,
  uploadId,
  partNumbers,
  expiresIn = 3600,
  backend = resolveBackend(),
) {
  if (backend === "r2") {
    const { accessKeyId, secretAccessKey, accountId, bucket } =
      getEdgeR2Creds();
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("R2 credentials missing for multipart signing.");
    }
    const signed = [];
    for (const partNumber of partNumbers) {
      const url =
        buildR2Url({ accountId, bucket, key }) +
        `?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
      const signedUrl = await presignR2Url({
        method: "PUT",
        url,
        expiresIn,
        accessKeyId,
        secretAccessKey,
        region: "auto",
      });
      signed.push({ partNumber, uploadUrl: signedUrl });
    }
    return signed;
  }

  const { UploadPartCommand, getSignedUrl } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  const signed = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: bucketName,
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
 */
export async function completeMultipartUpload(
  key,
  uploadId,
  parts,
  backend = resolveBackend(),
) {
  if (backend === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const mpu = bucket.resumeMultipartUpload(key, uploadId);
      const sortedParts = parts
        .slice()
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((p) => ({
          partNumber: p.partNumber,
          etag: p.etag,
        }));
      await mpu.complete(sortedParts);
      return `${publicBaseUrl}/${key}`;
    }
    if (isEdgeRuntime) {
      assertEdgeR2Support();
      const {
        accessKeyId,
        secretAccessKey,
        accountId,
        bucket: bucketName,
        publicBaseUrl,
      } = getEdgeR2Creds();
      const sortedParts = parts
        .slice()
        .sort((a, b) => a.partNumber - b.partNumber);
      const body = `<CompleteMultipartUpload>${sortedParts
        .map(
          (p) =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`,
        )
        .join("")}</CompleteMultipartUpload>`;
      const url =
        buildR2Url({ accountId, bucket: bucketName, key }) +
        `?uploadId=${encodeURIComponent(uploadId)}`;
      const payloadHash = toHex(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
      );
      const signedHeaders = await signR2Request({
        method: "POST",
        url,
        headers: { "content-type": "application/xml" },
        payloadHash,
        accessKeyId,
        secretAccessKey,
        region: "auto",
      });
      const res = await fetch(url, {
        method: "POST",
        headers: signedHeaders,
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `R2 multipart complete failed (${res.status}): ${text.slice(0, 200)}`,
        );
      }
      return `${publicBaseUrl}/${key}`;
    }
  }

  const { CompleteMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
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
export async function abortMultipartUpload(
  key,
  uploadId,
  backend = resolveBackend(),
) {
  if (backend === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const mpu = bucket.resumeMultipartUpload(key, uploadId);
      await mpu.abort();
      return;
    }
    if (isEdgeRuntime) {
      assertEdgeR2Support();
      const {
        accessKeyId,
        secretAccessKey,
        accountId,
        bucket: bucketName,
      } = getEdgeR2Creds();
      const url =
        buildR2Url({ accountId, bucket: bucketName, key }) +
        `?uploadId=${encodeURIComponent(uploadId)}`;
      const signedHeaders = await signR2Request({
        method: "DELETE",
        url,
        headers: {},
        payloadHash: "UNSIGNED-PAYLOAD",
        accessKeyId,
        secretAccessKey,
        region: "auto",
      });
      await fetch(url, { method: "DELETE", headers: signedHeaders });
      return;
    }
  }

  const { AbortMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
  const bucketName = getBucket();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucketName,
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
  return backend === "r2" || (backend === "s3" && isS3Enabled());
}

export function isS3BackendEnabled() {
  return isS3Enabled();
}

export function isS3Configured(preferred) {
  const backend = resolveBackend(preferred);
  if (backend !== "r2" && backend !== "s3") return false;
  if (backend === "s3" && !isS3Enabled()) return false;
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.CF_R2_SECRET_ACCESS_KEY ||
    "";
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
  if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl) return false;
  if (backend === "r2") {
    if (isEdgeRuntime) {
      return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
    }
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
  }
  if (!isNodeRuntime) return false;
  return Boolean(process.env.S3_ENDPOINT);
}

export async function listBucketObjects({
  prefix = "uploads/",
  limit = 20,
  backend,
} = {}) {
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Bucket listing is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const clampedLimit = Math.min(Math.max(Number(limit) || 0, 1), 100);
      const result = await bucket.list({
        prefix,
        limit: clampedLimit,
      });
      return (result.objects ?? [])
        .map((item) => ({
          key: item.key,
          url: item.key ? `${publicBaseUrl}/${item.key}` : null,
          size: item.size ?? 0,
          lastModified: item.uploaded ? item.uploaded.toISOString() : null,
        }))
        .sort((a, b) => {
          if (!a.lastModified) return 1;
          if (!b.lastModified) return -1;
          return b.lastModified.localeCompare(a.lastModified);
        });
    }
  }

  assertNodeS3Support(backendToUse);
  const { ListObjectsV2Command } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  const clampedLimit = Math.min(Math.max(Number(limit) || 0, 1), 100);
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
    MaxKeys: clampedLimit,
  });
  const result = await client.send(command);
  const contents = result.Contents ?? [];
  return contents
    .map((item) => ({
      key: item.Key,
      url: item.Key ? `${publicBaseUrl}/${item.Key}` : null,
      size: item.Size ?? 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : null,
    }))
    .sort((a, b) => {
      if (!a.lastModified) return 1;
      if (!b.lastModified) return -1;
      return b.lastModified.localeCompare(a.lastModified);
    });
}

export async function headBucketObject({ key, backend } = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("Object key is required.");
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Object metadata is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const obj = await bucket.head(safeKey);
      if (!obj) throw new Error(`Object not found: ${safeKey}`);
      return r2ObjectToHead(obj);
    }
  }

  assertNodeS3Support(backendToUse);
  const { HeadObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  const result = await client.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    }),
  );
  return {
    metadata: normalizeStorageMetadata(result?.Metadata || {}),
    contentType: result?.ContentType || "",
    cacheControl: result?.CacheControl || "",
    contentDisposition: result?.ContentDisposition || "",
    contentEncoding: result?.ContentEncoding || "",
    contentLanguage: result?.ContentLanguage || "",
    sizeBytes: result?.ContentLength ?? null,
    lastModified: result?.LastModified
      ? new Date(result.LastModified).toISOString()
      : "",
    expires: result?.Expires
      ? new Date(result.Expires).toISOString()
      : result?.ExpiresString || "",
  };
}

export async function replaceBucketObjectMetadata({
  key,
  metadata = {},
  backend,
  replaceKeys = [],
} = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("Object key is required.");
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Object metadata replacement is not available for WordPress.",
    );
  }

  // R2 binding path — get object and re-put with updated metadata.
  // R2 bindings don't have CopyObject, but for small metadata objects the
  // get+put round-trip is fast over the internal CF backbone.
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const current = await bucket.head(safeKey);
      if (!current) throw new Error(`Object not found: ${safeKey}`);

      const incoming = normalizeStorageMetadata(metadata);
      const replaced = { ...(current.customMetadata || {}) };
      for (const rawKey of Array.isArray(replaceKeys) ? replaceKeys : []) {
        const safeMetaKey = String(rawKey || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 64);
        if (safeMetaKey) delete replaced[safeMetaKey];
      }
      for (const [metaKey, metaValue] of Object.entries(incoming)) {
        replaced[metaKey] = metaValue;
      }

      // Get the full object body so we can re-put with updated metadata.
      const obj = await bucket.get(safeKey);
      if (!obj) throw new Error(`Object not found: ${safeKey}`);
      await bucket.put(safeKey, obj.body, {
        httpMetadata: current.httpMetadata || {},
        customMetadata: replaced,
      });

      return {
        key: safeKey,
        metadata: replaced,
        contentType: current.httpMetadata?.contentType || "",
      };
    }
  }

  assertNodeS3Support(backendToUse);
  const bucketName = getBucket();
  const client = await getS3Client(backendToUse);
  const current = await headBucketObject({
    key: safeKey,
    backend: backendToUse,
  });
  const incoming = normalizeStorageMetadata(metadata);
  const replaced = { ...current.metadata };
  for (const rawKey of Array.isArray(replaceKeys) ? replaceKeys : []) {
    const safeMetaKey = String(rawKey || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64);
    if (!safeMetaKey) continue;
    delete replaced[safeMetaKey];
  }
  for (const [metaKey, metaValue] of Object.entries(incoming)) {
    replaced[metaKey] = metaValue;
  }

  const { CopyObjectCommand } = await loadAwsSdk();
  await client.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
      CopySource: encodeS3CopySource(bucketName, safeKey),
      MetadataDirective: "REPLACE",
      Metadata: replaced,
      ...(current.contentType ? { ContentType: current.contentType } : {}),
      ...(current.cacheControl ? { CacheControl: current.cacheControl } : {}),
      ...(current.contentDisposition
        ? { ContentDisposition: current.contentDisposition }
        : {}),
      ...(current.contentEncoding
        ? { ContentEncoding: current.contentEncoding }
        : {}),
      ...(current.contentLanguage
        ? { ContentLanguage: current.contentLanguage }
        : {}),
    }),
  );

  return {
    key: safeKey,
    metadata: replaced,
    contentType: current.contentType || "",
  };
}

/**
 * List objects in a "directory" using a `/` delimiter.
 * Returns { dirs: [{key, isDirectory}], files: [{key, url, size, lastModified}] }
 */
export async function listBucketDirectory({ prefix = "", backend } = {}) {
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Directory listing is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const safePrefix = String(prefix || "");
      const result = await bucket.list({
        prefix: safePrefix,
        delimiter: "/",
        limit: 1000,
      });
      const dirs = (result.delimitedPrefixes ?? []).map((dp) => ({
        key: dp,
        isDirectory: true,
        size: 0,
        lastModified: null,
      }));
      const files = (result.objects ?? [])
        .filter((item) => item.key !== safePrefix)
        .map((item) => ({
          key: item.key,
          url: item.key ? `${publicBaseUrl}/${item.key}` : null,
          size: item.size ?? 0,
          lastModified: item.uploaded ? item.uploaded.toISOString() : null,
          isDirectory: false,
        }));
      return { dirs, files };
    }
  }

  assertNodeS3Support(backendToUse);
  const { ListObjectsV2Command } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  const safePrefix = String(prefix || "");
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: safePrefix,
      Delimiter: "/",
      MaxKeys: 1000,
    }),
  );
  const dirs = (result.CommonPrefixes ?? []).map((cp) => ({
    key: cp.Prefix,
    isDirectory: true,
    size: 0,
    lastModified: null,
  }));
  const files = (result.Contents ?? [])
    .filter((item) => item.Key !== safePrefix)
    .map((item) => ({
      key: item.Key,
      url: item.Key ? `${publicBaseUrl}/${item.Key}` : null,
      size: item.Size ?? 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      isDirectory: false,
    }));
  return { dirs, files };
}

/**
 * Put an object at a specific key (bypasses the auto-prefixed path in uploadToS3).
 * Returns the public URL.
 */
export async function putBucketObject({
  key,
  body,
  contentType,
  metadata = {},
  backend,
} = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("Object key is required.");
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Direct object put is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const publicBaseUrl = getPublicUrl();
      const safeMetadata = normalizeStorageMetadata(metadata);
      await bucket.put(safeKey, body, {
        httpMetadata: r2HttpMetadata(contentType),
        customMetadata: safeMetadata,
      });
      return `${publicBaseUrl}/${safeKey}`;
    }
  }

  assertNodeS3Support(backendToUse);
  const { PutObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  const publicBaseUrl = getPublicUrl();
  const safeMetadata = normalizeStorageMetadata(metadata);
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      ...(Object.keys(safeMetadata).length > 0
        ? { Metadata: safeMetadata }
        : {}),
    }),
  );
  return `${publicBaseUrl}/${safeKey}`;
}

/** Delete a specific object by key. */
export async function deleteBucketObject({ key, backend } = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("Object key is required.");
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Object deletion is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      await bucket.delete(safeKey);
      return;
    }
  }

  assertNodeS3Support(backendToUse);
  const { DeleteObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: safeKey }),
  );
}

/**
 * Stream an object's content from S3/R2.
 * Returns { body: ReadableStream, contentType, contentLength, totalLength, lastModified }.
 */
export async function getBucketObjectStream({ key, backend, byteRange } = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("Object key is required.");
  const backendToUse = backend || resolveBackend();
  if (backendToUse === "wordpress") {
    throw new Error(
      "Object streaming is not available for the WordPress backend.",
    );
  }

  // R2 binding path
  if (backendToUse === "r2") {
    const bucket = await getR2Bucket();
    if (bucket) {
      const options =
        byteRange &&
        Number.isInteger(byteRange.start) &&
        Number.isInteger(byteRange.end) &&
        byteRange.end >= byteRange.start
          ? {
              range: {
                offset: byteRange.start,
                length: byteRange.end - byteRange.start + 1,
              },
            }
          : undefined;
      const obj = await bucket.get(safeKey, options);
      if (!obj) throw new Error(`Object not found: ${safeKey}`);
      return {
        body: obj.body,
        contentType:
          obj.httpMetadata?.contentType || "application/octet-stream",
        contentLength: obj.size ?? null,
        totalLength: obj.size ?? null,
        lastModified: obj.uploaded ? obj.uploaded.toISOString() : null,
      };
    }
  }

  assertNodeS3Support(backendToUse);
  const { GetObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucketName = getBucket();
  const command = {
    Bucket: bucketName,
    Key: safeKey,
  };
  if (
    byteRange &&
    Number.isInteger(byteRange.start) &&
    Number.isInteger(byteRange.end) &&
    byteRange.end >= byteRange.start
  ) {
    command.Range = `bytes=${byteRange.start}-${byteRange.end}`;
  }
  const result = await client.send(new GetObjectCommand(command));
  const totalLengthFromRange = String(result.ContentRange || "").match(
    /\/(\d+)$/,
  );
  return {
    body: result.Body.transformToWebStream(),
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength ?? null,
    totalLength: totalLengthFromRange
      ? Number.parseInt(totalLengthFromRange[1], 10)
      : result.ContentLength ?? null,
    lastModified: result.LastModified
      ? result.LastModified.toISOString()
      : null,
  };
}
