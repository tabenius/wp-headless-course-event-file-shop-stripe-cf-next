import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

export const runtime = "edge";

const MAX_VIEW_BYTES = 2 * 1024 * 1024;
const MAX_VIEW_TEXT_CHARS = 120_000;

const YAML_EXTENSIONS = new Set(["yaml", "yml"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const SQLITE_EXTENSIONS = new Set(["sqlite", "sqlite3", "db"]);

function safeText(value, max = 2048) {
  return String(value ?? "").trim().slice(0, max);
}

function extFromName(name) {
  const safe = safeText(name, 512).toLowerCase();
  const match = safe.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function hostFromUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function buildAllowedHosts(request) {
  const hosts = new Set();
  const originHost = hostFromUrl(request?.nextUrl?.origin || "");
  if (originHost) hosts.add(originHost);
  const wpHost = hostFromUrl(
    process.env.NEXT_PUBLIC_WORDPRESS_URL || process.env.WORDPRESS_API_URL || "",
  );
  if (wpHost) hosts.add(wpHost);
  const r2Host = hostFromUrl(
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "",
  );
  if (r2Host) hosts.add(r2Host);
  return hosts;
}

function inferViewerType({ fileName, contentType }) {
  const ext = extFromName(fileName);
  const mime = safeText(contentType, 120).toLowerCase();
  if (ext === "json" || mime.includes("application/json")) return "json";
  if (
    YAML_EXTENSIONS.has(ext) ||
    mime.includes("yaml") ||
    mime.includes("x-yaml")
  ) {
    return "yaml";
  }
  if (ext === "csv" || mime.includes("text/csv")) return "csv";
  if (
    MARKDOWN_EXTENSIONS.has(ext) ||
    mime.includes("text/markdown") ||
    mime.includes("markdown")
  ) {
    return "markdown";
  }
  if (SQLITE_EXTENSIONS.has(ext) || mime.includes("sqlite")) return "sqlite";
  return "text";
}

function decodeUtf8(bytes) {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(bytes);
}

function truncateText(text, max = MAX_VIEW_TEXT_CHARS) {
  const safe = String(text || "");
  if (safe.length <= max) return { text: safe, truncated: false };
  return {
    text: safe.slice(0, max),
    truncated: true,
  };
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function normalizeCsvCell(value) {
  return String(value ?? "").trim();
}

function inferCsvType(values) {
  const samples = values.map((value) => normalizeCsvCell(value)).filter(Boolean);
  if (samples.length === 0) return "string";
  const allInteger = samples.every((value) => /^-?\d+$/.test(value));
  const allNumber = samples.every((value) => /^-?\d+(?:\.\d+)?$/.test(value));
  if (allInteger) {
    const asNumbers = samples.map((value) => Number.parseInt(value, 10));
    const looksLikeTimeT = asNumbers.every(
      (value) => Number.isFinite(value) && value >= 631152000 && value <= 4102444800,
    );
    return looksLikeTimeT ? "time_t" : "integer";
  }
  if (allNumber) return "scalar";
  const allBoolean = samples.every((value) =>
    /^(true|false|0|1|yes|no)$/i.test(value),
  );
  if (allBoolean) return "boolean";
  const allDatetime = samples.every((value) => Number.isFinite(Date.parse(value)));
  if (allDatetime) return "datetime";
  return "string";
}

function parseHeaderAnnotation(header) {
  const safe = normalizeCsvCell(header);
  const colon = safe.match(/^(.+?):([a-zA-Z_][a-zA-Z0-9_-]*)$/);
  if (colon) {
    return { name: colon[1].trim(), annotatedType: colon[2].trim() };
  }
  const paren = safe.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (paren) {
    return { name: paren[1].trim(), annotatedType: paren[2].trim() };
  }
  return { name: safe, annotatedType: "" };
}

function buildCsvViewer(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0)
    .slice(0, 220);
  if (lines.length === 0) {
    return {
      columns: [],
      rows: [],
    };
  }
  const rows = lines.map((line) => parseCsvLine(line));
  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const columnCount = headerRow.length;
  const columns = Array.from({ length: columnCount }).map((_, index) => {
    const header = parseHeaderAnnotation(headerRow[index] || `column_${index + 1}`);
    const values = dataRows.map((row) => row[index] || "");
    return {
      index: index + 1,
      name: header.name || `column_${index + 1}`,
      annotatedType: header.annotatedType || "",
      inferredType: inferCsvType(values),
      sample: normalizeCsvCell(values.find((value) => normalizeCsvCell(value)) || ""),
    };
  });
  const previewRows = dataRows.slice(0, 30).map((row) =>
    Array.from({ length: columnCount }).map((_, index) => normalizeCsvCell(row[index] || "")),
  );
  return {
    columns,
    rows: previewRows,
  };
}

function buildYamlSummary(text) {
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-zA-Z0-9_.-]+)\s*:/);
    if (!match) continue;
    const key = match[1];
    if (keys.includes(key)) continue;
    keys.push(key);
    if (keys.length >= 30) break;
  }
  return keys;
}

function buildMarkdownSummary(text) {
  const headings = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      text: safeText(match[2], 180),
    });
    if (headings.length >= 30) break;
  }
  return headings;
}

function parseSqliteHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 100) return null;
  const signature = decodeUtf8(bytes.slice(0, 16));
  if (!signature.startsWith("SQLite format 3")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const textEncodingCode = view.getUint32(56, false);
  const textEncoding =
    textEncodingCode === 1
      ? "UTF-8"
      : textEncodingCode === 2
        ? "UTF-16le"
        : textEncodingCode === 3
          ? "UTF-16be"
          : "unknown";
  return {
    pageSize,
    writeVersion: bytes[18],
    readVersion: bytes[19],
    reservedSpaceBytes: bytes[20],
    schemaCookie: view.getUint32(40, false),
    userVersion: view.getUint32(60, false),
    pageCount: view.getUint32(28, false),
    textEncoding,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const targetUrl = safeText(request.nextUrl.searchParams.get("url"), 2000);
    const fileName = safeText(request.nextUrl.searchParams.get("name"), 512);
    const requestedMimeType = safeText(
      request.nextUrl.searchParams.get("mimeType"),
      140,
    );
    if (!targetUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing file URL." },
        { status: 400 },
      );
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid file URL." },
        { status: 400 },
      );
    }

    const allowedHosts = buildAllowedHosts(request);
    if (!allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
      return NextResponse.json(
        { ok: false, error: "Host is not allowed for media viewing." },
        { status: 400 },
      );
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: { Range: `bytes=0-${MAX_VIEW_BYTES - 1}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Could not load asset (${response.status}) ${body.slice(0, 120)}`.trim(),
        },
        { status: 400 },
      );
    }

    const contentType = safeText(response.headers.get("content-type"), 140);
    const effectiveContentType =
      contentType && contentType !== "application/octet-stream"
        ? contentType
        : requestedMimeType || contentType;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const viewerType = inferViewerType({
      fileName,
      contentType: effectiveContentType,
    });
    const byteTruncated = bytes.length >= MAX_VIEW_BYTES;

    if (viewerType === "sqlite") {
      const sqlite = parseSqliteHeader(bytes);
      if (!sqlite) {
        return NextResponse.json(
          { ok: false, error: "File does not look like a valid SQLite database." },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        viewerType,
        contentType: effectiveContentType,
        truncated: byteTruncated,
        sqlite,
        suggestions: [
          "Store table/column semantics in asset metadata annotations.",
          "Link to a schema contract document via schemaRef metadata.",
        ],
      });
    }

    const rawText = decodeUtf8(bytes);
    const trimmed = truncateText(rawText);

    if (viewerType === "json") {
      let parsed = null;
      let parseError = "";
      try {
        parsed = JSON.parse(trimmed.text);
      } catch (error) {
        parseError = error instanceof Error ? error.message : "Invalid JSON.";
      }
      return NextResponse.json({
        ok: true,
        viewerType,
        contentType: effectiveContentType,
        truncated: byteTruncated || trimmed.truncated,
        parseError,
        pretty: parsed ? JSON.stringify(parsed, null, 2) : trimmed.text,
        summary: parsed
          ? {
              rootType: Array.isArray(parsed) ? "array" : typeof parsed,
              keyCount:
                parsed && typeof parsed === "object" && !Array.isArray(parsed)
                  ? Object.keys(parsed).length
                  : null,
            }
          : null,
      });
    }

    if (viewerType === "csv") {
      const csv = buildCsvViewer(trimmed.text);
      return NextResponse.json({
        ok: true,
        viewerType,
        contentType: effectiveContentType,
        truncated: byteTruncated || trimmed.truncated,
        csv,
      });
    }

    if (viewerType === "yaml") {
      return NextResponse.json({
        ok: true,
        viewerType,
        contentType: effectiveContentType,
        truncated: byteTruncated || trimmed.truncated,
        text: trimmed.text,
        topLevelKeys: buildYamlSummary(trimmed.text),
      });
    }

    if (viewerType === "markdown") {
      return NextResponse.json({
        ok: true,
        viewerType,
        contentType: effectiveContentType,
        truncated: byteTruncated || trimmed.truncated,
        text: trimmed.text,
        headings: buildMarkdownSummary(trimmed.text),
      });
    }

    return NextResponse.json({
      ok: true,
      viewerType: "text",
      contentType: effectiveContentType,
      truncated: byteTruncated || trimmed.truncated,
      text: trimmed.text,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load asset view.",
      },
      { status: 500 },
    );
  }
}
