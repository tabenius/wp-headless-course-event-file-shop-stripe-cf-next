import { requireAdmin } from "@/lib/adminRoute";

const S3_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeEndpointHost(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .trim();
}

function buildR2ServerHost(accountId) {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) return "";
  return `${safeAccountId}.r2.cloudflarestorage.com`;
}

function safeFileToken(value, fallback = "r2-bucket") {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || fallback;
}

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

function buildBookmarkXml({ server, bucket, region, accessKeyId, backend }) {
  const safeServer = normalizeEndpointHost(server);
  const safeBucket = String(bucket || "").trim();
  const safeRegion = String(region || "auto");
  const safeKey = String(accessKeyId || "").trim();
  const nickname = safeBucket
    ? `${String(backend || "r2").toUpperCase()} · ${safeBucket}`
    : String(backend || "r2").toUpperCase();
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Protocol</key>
\t<string>s3</string>
\t<key>Nickname</key>
\t<string>${escXml(nickname)}</string>
\t<key>Hostname</key>
\t<string>${escXml(safeServer)}</string>
\t<key>Port</key>
\t<string>443</string>
\t<key>Region</key>
\t<string>${escXml(safeRegion)}</string>
\t<key>Username</key>
\t<string>${escXml(safeKey)}</string>
\t<key>Path</key>
\t<string>${safeBucket ? `/${escXml(safeBucket)}` : ""}</string>
\t<key>Anonymous Login</key>
\t<false/>
\t<key>UUID</key>
\t<string>${escXml(uuid)}</string>
</dict>
</plist>`;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const backend = resolveBackend(request);
  if (backend === "wordpress") {
    return Response.json(
      { ok: false, error: "Cyberduck bookmark is available only for R2/S3 backends." },
      { status: 400 },
    );
  }

  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const server =
    backend === "r2"
      ? buildR2ServerHost(
          process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "",
        )
      : normalizeEndpointHost(process.env.S3_ENDPOINT || "");
  const region = backend === "r2" ? "auto" : process.env.S3_REGION || "us-east-1";

  const missing = [];
  if (!server) missing.push("server");
  if (!bucket) missing.push("bucket");
  if (!accessKeyId) missing.push("accessKeyId");

  if (missing.length > 0) {
    return Response.json(
      {
        ok: false,
        error: `Missing required storage configuration: ${missing.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const xml = buildBookmarkXml({
    server,
    bucket,
    region,
    accessKeyId,
    backend,
  });
  const fileToken = safeFileToken(bucket, backend);
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream; charset=utf-8",
      "content-disposition": `attachment; filename="${fileToken}.duck"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
