import { t } from "@/lib/i18n";
import {
  signR2Put,
  signR2Request,
  presignR2Url,
  buildR2Url,
  toHex,
} from "@/lib/r2Edge";

const _clients = new Map();
let _awsSdkPromise = null;
const isNodeRuntime =
  typeof process !== "undefined" &&
  process.versions?.node &&
  process.env.NEXT_RUNTIME !== "edge";
const isEdgeRuntime =
  typeof EdgeRuntime !== "undefined" || process.env.NEXT_RUNTIME === "edge";
export const EDGE_R2_MAX_BYTES = 100 * 1024 * 1024; // 100 MB cap for edge uploads

async function loadAwsSdk() {
  if (!_awsSdkPromise) {
    _awsSdkPromise = Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/s3-request-presigner"),
    ]).then(([s3, presigner]) => ({
      ...s3,
      getSignedUrl: presigner.getSignedUrl,
    }));
  }
  return _awsSdkPromise;
}

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

function getBucket() {
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  if (!bucket) throw new Error(t("s3.bucketMissing"));
  return bucket;
}

function getPublicUrl() {
  const url = (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
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

async function uploadToR2Edge(buffer, fileName, contentType) {
  assertEdgeR2Support();
  if (buffer.byteLength > EDGE_R2_MAX_BYTES) {
    throw new Error(
      `File too large for edge R2 upload (max ${EDGE_R2_MAX_BYTES / (1024 * 1024)} MB).`,
    );
  }
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
  const key = `uploads/${Date.now()}-${fileName}`;
  const url = buildR2Url({ accountId, bucket, key });

  const signedHeaders = await signR2Put({
    url,
    body: buffer,
    accessKeyId,
    secretAccessKey,
    region: "auto",
  });

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...signedHeaders,
      "content-type": contentType || "application/octet-stream",
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return `${publicUrl}/${key}`;
}

/**
 * Upload a file to S3-compatible storage.
 * Returns the public URL of the uploaded object.
 */
export async function uploadToS3(
  buffer,
  fileName,
  contentType,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    return uploadToR2Edge(buffer, fileName, contentType);
  }
  assertNodeS3Support(backend);
  const { PutObjectCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
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
export async function createPresignedUpload(
  fileName,
  contentType,
  expiresIn = 3600,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    throw new Error(
      "Presigned browser uploads to R2 are not supported on edge runtime. Use direct upload path.",
    );
  }
  const { PutObjectCommand, getSignedUrl } = await loadAwsSdk();
  const client = await getS3Client(backend);
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
export async function createMultipartUpload(
  fileName,
  contentType,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    assertEdgeR2Support();
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
    const publicBaseUrl = (
      process.env.S3_PUBLIC_URL ||
      process.env.CF_R2_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, "");
    const key = `uploads/${Date.now()}-${fileName}`;
    const url = buildR2Url({ accountId, bucket, key }) + "?uploads";
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
    if (!uploadId) throw new Error("R2 multipart create failed (no uploadId)");
    return { uploadId, key, publicUrl: `${publicBaseUrl}/${key}` };
  }
  const { CreateMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
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
export async function signMultipartParts(
  key,
  uploadId,
  partNumbers,
  expiresIn = 3600,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    assertEdgeR2Support();
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;

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
export async function completeMultipartUpload(
  key,
  uploadId,
  parts,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    assertEdgeR2Support();
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
    const publicBaseUrl = (
      process.env.S3_PUBLIC_URL ||
      process.env.CF_R2_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, "");

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
      buildR2Url({ accountId, bucket, key }) +
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
  const { CompleteMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
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
export async function abortMultipartUpload(
  key,
  uploadId,
  backend = resolveBackend(),
) {
  if (backend === "r2" && isEdgeRuntime) {
    assertEdgeR2Support();
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
    const url =
      buildR2Url({ accountId, bucket, key }) +
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
  const { AbortMultipartUploadCommand } = await loadAwsSdk();
  const client = await getS3Client(backend);
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
    throw new Error("Bucket listing is not available for the WordPress backend.");
  }
  assertNodeS3Support(backendToUse);
  const { ListObjectsV2Command } = await loadAwsSdk();
  const client = await getS3Client(backendToUse);
  const bucket = getBucket();
  const publicBaseUrl = getPublicUrl();
  const clampedLimit = Math.min(Math.max(Number(limit) || 0, 1), 100);
  const command = new ListObjectsV2Command({
    Bucket: bucket,
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
      lastModified: item.LastModified
        ? item.LastModified.toISOString()
        : null,
    }))
    .sort((a, b) => {
      if (!a.lastModified) return 1;
      if (!b.lastModified) return -1;
      return b.lastModified.localeCompare(a.lastModified);
    });
}
