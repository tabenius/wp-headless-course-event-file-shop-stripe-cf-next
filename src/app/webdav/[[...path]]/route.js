/**
 * WebDAV server mounted at /webdav/
 *
 * Exposes the R2/S3 media library as a WebDAV filesystem.
 * Supports CyberDuck, Finder, Windows Explorer, rclone, and any RFC 4918
 * Level 1 client.
 *
 * Auth: HTTP Basic (username + password matching admin credentials).
 * Depth: infinity is capped to 1.
 *
 * Supported methods: OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL.
 */
import { validateAdminCredentials } from "@/auth";
import {
  isS3Configured,
  listBucketDirectory,
  headBucketObject,
  getBucketObjectStream,
  putBucketObject,
  deleteBucketObject,
} from "@/lib/s3upload";

export const runtime = "nodejs";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAV_BASE = "/webdav";
const BACKEND = "r2";
const DAV_METHODS = "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="WebDAV Media Library"',
      "Content-Type": "text/plain",
    },
  });
}

async function verifyBasicAuth(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 1) return false;
  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  return validateAdminCredentials(username, password);
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Convert a request pathname to an S3 object key. */
function pathnameToKey(pathname) {
  // Strip /webdav prefix and leading slash
  const stripped = pathname.replace(/^\/webdav\/?/, "");
  return stripped; // may end with "/" (directory) or not (file/unknown)
}

/** True when the key represents a directory (empty = root, or ends with /). */
function isDirectoryKey(key) {
  return key === "" || key.endsWith("/");
}

/** Build the WebDAV href for a key. */
function keyToHref(key) {
  if (key === "") return `${DAV_BASE}/`;
  // URL-encode each segment but keep slashes
  const encoded = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${DAV_BASE}/${encoded}`;
}

/** Extract the display name (last non-empty path segment). */
function displayName(key) {
  const parts = key.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "webdav";
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRfc7231(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toUTCString();
  } catch {
    return "";
  }
}

function propResponse(href, isDir, { size, lastModified, contentType } = {}) {
  const rfc = toRfc7231(lastModified);
  const resourceType = isDir
    ? "<D:resourcetype><D:collection/></D:resourcetype>"
    : "<D:resourcetype/>";
  const fileProps = isDir
    ? ""
    : `
        <D:getcontentlength>${Number(size) || 0}</D:getcontentlength>
        <D:getcontenttype>${escXml(contentType || "application/octet-stream")}</D:getcontenttype>`;

  return `  <D:response>
    <D:href>${escXml(href)}</D:href>
    <D:propstat>
      <D:prop>
        ${resourceType}
        <D:displayname>${escXml(displayName(href.replace(`${DAV_BASE}/`, "")))}</D:displayname>${fileProps}${rfc ? `\n        <D:getlastmodified>${escXml(rfc)}</D:getlastmodified>` : ""}${lastModified ? `\n        <D:creationdate>${escXml(lastModified)}</D:creationdate>` : ""}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

function multistatus(responses) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join("\n")}
</D:multistatus>`;
}

function xmlResponse(body, status = 207) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      DAV: "1",
    },
  });
}

// ─── Method handlers ──────────────────────────────────────────────────────────

function handleOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      DAV: "1",
      Allow: DAV_METHODS,
      "Content-Length": "0",
    },
  });
}

async function handlePropfind(request, key) {
  const rawDepth = (request.headers.get("depth") || "1").trim().toLowerCase();
  // Cap infinity to 1
  const depth = rawDepth === "0" ? 0 : 1;

  const isDir = isDirectoryKey(key);

  if (!isDir) {
    // It's (probably) a file — verify it exists
    let head;
    try {
      head = await headBucketObject({ key, backend: BACKEND });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
    const href = keyToHref(key);
    const xml = multistatus([
      propResponse(href, false, {
        size: null,
        lastModified: null,
        contentType: head.contentType,
      }),
    ]);
    return xmlResponse(xml);
  }

  // Directory listing
  const prefix = key; // already ends with "/" or is ""
  const { dirs, files } = await listBucketDirectory({ prefix, backend: BACKEND });

  // Self entry
  const selfHref = keyToHref(key);
  const responses = [propResponse(selfHref, true, {})];

  if (depth === 1) {
    for (const dir of dirs) {
      responses.push(propResponse(keyToHref(dir.key), true, {}));
    }
    for (const file of files) {
      const mimeType = mimeFromKey(file.key);
      responses.push(
        propResponse(keyToHref(file.key), false, {
          size: file.size,
          lastModified: file.lastModified,
          contentType: mimeType,
        }),
      );
    }
  }

  return xmlResponse(multistatus(responses));
}

async function handleGet(key, headOnly) {
  if (isDirectoryKey(key)) {
    // Return a minimal HTML directory index for browser visits
    const { dirs, files } = await listBucketDirectory({
      prefix: key,
      backend: BACKEND,
    });
    const items = [
      ...dirs.map((d) => `<li><a href="${encodeURIComponent(displayName(d.key))}">${escXml(displayName(d.key))}/</a></li>`),
      ...files.map((f) => `<li><a href="${encodeURIComponent(displayName(f.key))}">${escXml(displayName(f.key))}</a> (${f.size} bytes)</li>`),
    ];
    const html = `<!DOCTYPE html><html><body><ul>${items.join("")}</ul></body></html>`;
    return new Response(headOnly ? null : html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let stream;
  try {
    stream = await getBucketObjectStream({ key, backend: BACKEND });
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  const headers = {
    "Content-Type": stream.contentType,
    "Cache-Control": "no-store",
  };
  if (stream.contentLength != null) {
    headers["Content-Length"] = String(stream.contentLength);
  }
  if (stream.lastModified) {
    headers["Last-Modified"] = toRfc7231(stream.lastModified);
  }

  return new Response(headOnly ? null : stream.body, { status: 200, headers });
}

async function handlePut(request, key) {
  if (isDirectoryKey(key)) {
    return new Response("Cannot PUT to a directory path", { status: 409 });
  }
  const contentType =
    request.headers.get("content-type") || "application/octet-stream";
  const body = await request.arrayBuffer();
  try {
    await putBucketObject({
      key,
      body: Buffer.from(body),
      contentType,
      backend: BACKEND,
    });
  } catch (err) {
    return new Response(String(err?.message || "Upload failed"), { status: 502 });
  }
  return new Response(null, { status: 201, headers: { "Content-Location": keyToHref(key) } });
}

async function handleDelete(key) {
  if (isDirectoryKey(key)) {
    // Deleting a virtual directory isn't meaningful on a flat object store
    return new Response(null, { status: 204 });
  }
  try {
    await deleteBucketObject({ key, backend: BACKEND });
  } catch (err) {
    return new Response(String(err?.message || "Delete failed"), { status: 502 });
  }
  return new Response(null, { status: 204 });
}

function handleMkcol() {
  // R2 is a flat object store — virtual directories emerge from key prefixes.
  // Pretend the collection was created without doing anything.
  return new Response(null, { status: 201 });
}

// ─── Tiny MIME helper ─────────────────────────────────────────────────────────

const MIME_MAP = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", pdf: "application/pdf",
  mp4: "video/mp4", mp3: "audio/mpeg", txt: "text/plain", json: "application/json",
  csv: "text/csv", zip: "application/zip", mov: "video/quicktime",
};

function mimeFromKey(key) {
  const ext = String(key || "").split(".").pop().toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handle(request) {
  // Basic auth
  const authed = await verifyBasicAuth(request);
  if (!authed) return unauthorized();

  // R2 must be configured
  if (!isS3Configured(BACKEND)) {
    return new Response("R2 storage is not configured.", { status: 503 });
  }

  const pathname = new URL(request.url).pathname;
  const key = pathnameToKey(pathname);
  // PROPFIND/MKCOL arrive as POST (forwarded by middleware); read real method.
  const method =
    (request.headers.get("x-dav-method") || request.method).toUpperCase();

  switch (method) {
    case "OPTIONS":
      return handleOptions();
    case "PROPFIND":
      return handlePropfind(request, key);
    case "GET":
      return handleGet(key, false);
    case "HEAD":
      return handleGet(key, true);
    case "PUT":
      return handlePut(request, key);
    case "DELETE":
      return handleDelete(key);
    case "MKCOL":
      return handleMkcol();
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: DAV_METHODS },
      });
  }
}

// Standard Next.js App Router method exports
export const GET = handle;
export const HEAD = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;

/**
 * POST is used by the middleware shim to forward PROPFIND and MKCOL requests,
 * which Next.js App Router doesn't natively route.  The real method is in
 * the `x-dav-method` request header.
 */
export async function POST(request) {
  return handle(request);
}
