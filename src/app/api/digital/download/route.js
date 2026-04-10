import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccessUncached } from "@/lib/digitalAccessStore";
import {
  getDigitalProductById,
  isProductListable,
  resolveFileUrl,
} from "@/lib/digitalProducts";
import {
  createSignedDownloadUrl,
  getBucketObjectStream,
  headBucketObject,
  resolveStorageObjectKey,
} from "@/lib/s3upload";
import { t } from "@/lib/i18n";

function getFileName(fileUrl, fallbackId) {
  const storageCandidate = String(fileUrl || "")
    .trim()
    .replace(/^(?:r2|s3):/i, "");
  if (/\.\w{1,8}$/.test(storageCandidate)) {
    return storageCandidate.split("/").filter(Boolean).pop() || `${fallbackId}.bin`;
  }
  try {
    const pathname = new URL(fileUrl).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const name = (segments.at(-1) || "").trim();
    return name || `${fallbackId}.bin`;
  } catch {
    return `${fallbackId}.bin`;
  }
}

function sanitizeDispositionFilename(raw) {
  return String(raw || "")
    .replace(/[\r\n"\\]/g, "_")
    .trim()
    .slice(0, 180);
}

function buildAttachmentDisposition(fileName) {
  const safe = sanitizeDispositionFilename(fileName);
  return safe ? `attachment; filename="${safe}"` : "attachment";
}

function parseSingleRangeHeader(rangeHeader, totalLength) {
  const safeHeader = String(rangeHeader || "").trim();
  if (!safeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(safeHeader);
  if (!match || !Number.isFinite(totalLength) || totalLength <= 0) {
    return { invalid: true };
  }

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return { invalid: true };

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }
    const length = Math.min(suffixLength, totalLength);
    return {
      start: totalLength - length,
      end: totalLength - 1,
      status: 206,
    };
  }

  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start) || start < 0 || start >= totalLength) {
    return { invalid: true };
  }

  if (!endRaw) {
    return {
      start,
      end: totalLength - 1,
      status: 206,
    };
  }

  const end = Number.parseInt(endRaw, 10);
  if (!Number.isFinite(end) || end < start) return { invalid: true };
  return {
    start,
    end: Math.min(end, totalLength - 1),
    status: 206,
  };
}

async function createStorageDownloadResponse(
  fileUrl,
  downloadFileName,
  rangeHeader,
) {
  const safeUrl = String(fileUrl || "").trim();
  if (!safeUrl) return null;

  const storagePrefixMatch = /^(r2|s3):(.*)$/i.exec(safeUrl);
  const candidates = [];

  if (storagePrefixMatch) {
    const backend = String(storagePrefixMatch[1] || "").toLowerCase();
    const key = String(storagePrefixMatch[2] || "").trim();
    if (key) candidates.push({ backend, key });
  } else {
    for (const backend of ["r2", "s3"]) {
      const key = resolveStorageObjectKey(safeUrl, { backend });
      if (key) candidates.push({ backend, key });
    }
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const head = await headBucketObject(candidate);
      const totalLength = Number(head?.sizeBytes);
      const range = parseSingleRangeHeader(rangeHeader, totalLength);
      if (range?.invalid) {
        return new Response(null, {
          status: 416,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Range": `bytes */${Number.isFinite(totalLength) ? totalLength : "*"}`,
            "Accept-Ranges": "bytes",
          },
        });
      }

      const stream = await getBucketObjectStream({
        ...candidate,
        byteRange:
          range && Number.isInteger(range.start) && Number.isInteger(range.end)
            ? { start: range.start, end: range.end }
            : null,
      });
      const headers = new Headers({
        "Cache-Control": "private, no-store",
        "Content-Disposition": buildAttachmentDisposition(downloadFileName),
        "Content-Type": stream.contentType || "application/octet-stream",
        "Accept-Ranges": "bytes",
      });
      if (
        Number.isFinite(Number(stream.contentLength)) &&
        Number(stream.contentLength) > 0
      ) {
        headers.set("Content-Length", String(stream.contentLength));
      }
      if (stream.lastModified) {
        headers.set("Last-Modified", stream.lastModified);
      }
      if (range && range.status === 206) {
        headers.set(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${Number.isFinite(totalLength) ? totalLength : "*"}`,
        );
      }
      return new Response(stream.body, {
        status: range?.status || 200,
        headers,
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("Digital download storage stream failed:", lastError);
  }
  return null;
}

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.downloadLoginRequired") },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId") || "";
  if (!productId) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.invalidProduct") },
      { status: 400 },
    );
  }

  const product = await getDigitalProductById(productId);
  if (!product || !isProductListable(product)) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.productNotFound") },
      { status: 404 },
    );
  }
  if (product.type !== "digital_file") {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.productNotDownloadable") },
      { status: 400 },
    );
  }

  const canDownload = await hasDigitalAccessUncached(
    product.id,
    session.user.email,
  );
  if (!canDownload) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.noFileAccess") },
      { status: 403 },
    );
  }

  try {
    const fileUrl = await resolveFileUrl(product);
    if (!fileUrl) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.downloadFailed") },
        { status: 404 },
      );
    }

    const rawName = getFileName(fileUrl, product.id);
    const signedUrl = await createSignedDownloadUrl({
      fileUrl,
      expiresIn: 300,
      downloadFileName: rawName,
    });
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
          "Cache-Control": "private, no-store",
        },
      });
    }
    const storageResponse = await createStorageDownloadResponse(
      fileUrl,
      rawName,
      request.headers.get("range"),
    );
    if (storageResponse) return storageResponse;

    if (/^(?:r2|s3):/i.test(fileUrl)) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.downloadFailed") },
        { status: 502 },
      );
    }

    return NextResponse.redirect(fileUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Digital download failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.downloadFailed") },
      { status: 502 },
    );
  }
}
