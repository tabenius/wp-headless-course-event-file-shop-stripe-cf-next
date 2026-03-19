const textEncoder = new TextEncoder();

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashHex(data) {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return toHex(buf);
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return signature;
}

async function deriveSigningKey(secret, date, region, service) {
  const kDate = await hmac(
    textEncoder.encode(`AWS4${secret}`),
    textEncoder.encode(date),
  );
  const kRegion = await hmac(kDate, textEncoder.encode(region));
  const kService = await hmac(kRegion, textEncoder.encode(service));
  const kSigning = await hmac(kService, textEncoder.encode("aws4_request"));
  return kSigning;
}

function formatAmzDate(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function dateStamp(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  return `${yyyy}${mm}${dd}`;
}

/**
 * Sign a single R2 S3-compatible request (PUT).
 * Returns headers including Authorization, x-amz-date, x-amz-content-sha256.
 */
async function signCanonical({
  method,
  url,
  headers = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region = "auto",
}) {
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const datestamp = dateStamp(now);

  const urlObj = new URL(url);
  const host = urlObj.host;
  const canonicalUri = urlObj.pathname;
  const canonicalQuery = urlObj.searchParams.toString();

  const lowerHeaders = Object.fromEntries(
    Object.entries({
      host,
      ...headers,
    }).map(([k, v]) => [k.toLowerCase(), String(v).trim()]),
  );

  const sortedHeaderKeys = Object.keys(lowerHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${lowerHeaders[k]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${datestamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    toHex(
      await crypto.subtle.digest(
        "SHA-256",
        textEncoder.encode(canonicalRequest),
      ),
    ),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    secretAccessKey,
    datestamp,
    region,
    "s3",
  );
  const signature = toHex(
    await hmac(signingKey, textEncoder.encode(stringToSign)),
  );

  const authorization = [
    "AWS4-HMAC-SHA256 Credential=" + accessKeyId + "/" + credentialScope,
    "SignedHeaders=" + signedHeaders,
    "Signature=" + signature,
  ].join(", ");

  return { authorization, amzDate, signedHeaders, signature, payloadHash };
}

export async function signR2Put({
  url,
  body,
  accessKeyId,
  secretAccessKey,
  region = "auto",
}) {
  const payloadHash = toHex(await crypto.subtle.digest("SHA-256", body));
  const { authorization, amzDate } = await signCanonical({
    method: "PUT",
    url,
    headers: { "x-amz-content-sha256": payloadHash },
    payloadHash,
    accessKeyId,
    secretAccessKey,
    region,
  });
  return {
    Authorization: authorization,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
}

export async function signR2Request({
  method,
  url,
  headers = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region = "auto",
}) {
  const hash = payloadHash || "UNSIGNED-PAYLOAD";
  const { authorization, amzDate } = await signCanonical({
    method,
    url,
    headers: { ...headers, "x-amz-content-sha256": hash },
    payloadHash: hash,
    accessKeyId,
    secretAccessKey,
    region,
  });
  return {
    Authorization: authorization,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": hash,
  };
}

export async function presignR2Url({
  method,
  url,
  expiresIn = 3600,
  accessKeyId,
  secretAccessKey,
  region = "auto",
}) {
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const datestamp = dateStamp(now);

  const urlObj = new URL(url);
  urlObj.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  urlObj.searchParams.set(
    "X-Amz-Credential",
    `${accessKeyId}/${datestamp}/${region}/s3/aws4_request`,
  );
  urlObj.searchParams.set("X-Amz-Date", amzDate);
  urlObj.searchParams.set("X-Amz-Expires", String(expiresIn));
  urlObj.searchParams.set("X-Amz-SignedHeaders", "host");

  const canonicalRequest = [
    method.toUpperCase(),
    urlObj.pathname,
    urlObj.searchParams.toString(),
    `host:${urlObj.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const credentialScope = `${datestamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    toHex(
      await crypto.subtle.digest(
        "SHA-256",
        textEncoder.encode(canonicalRequest),
      ),
    ),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    secretAccessKey,
    datestamp,
    region,
    "s3",
  );
  const signature = toHex(
    await hmac(signingKey, textEncoder.encode(stringToSign)),
  );
  urlObj.searchParams.set("X-Amz-Signature", signature);
  return urlObj.toString();
}

export function buildR2Url({ accountId, bucket, key }) {
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}
