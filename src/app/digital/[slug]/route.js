import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  hasDigitalAccessUncached,
  grantDigitalAccess,
} from "@/lib/digitalAccessStore";
import {
  getDigitalProductBySlug,
  isProductListable,
  resolveFileUrl,
} from "@/lib/digitalProducts";
import {
  createSignedDownloadUrl,
  getBucketObjectStream,
  headBucketObject,
  resolveStorageObjectKey,
} from "@/lib/s3upload";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const log = (...args) => {
  console.error("[/digital/]", ...args);
};

function getFileName(product) {
  const candidates = [product.name, product.assetId, product.slug, product.id];
  for (const candidate of candidates) {
    const safe = String(candidate || "").trim();
    if (!safe) continue;
    const withoutStoragePrefix = safe.replace(/^(?:r2|s3):/i, "");
    const lastSegment = withoutStoragePrefix.split("/").filter(Boolean).pop() || "";
    if (/\.\w{1,8}$/.test(lastSegment)) return lastSegment;
    if (/\.\w{1,8}$/.test(withoutStoragePrefix)) return withoutStoragePrefix;
    const ext = mimeToExtension(product.mimeType);
    return ext ? `${safe}${ext}` : safe;
  }
  return "download.bin";
}

function mimeToExtension(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  const map = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
    "application/json": ".json",
    "text/csv": ".csv",
    "text/markdown": ".md",
  };
  return map[mime] || "";
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
    console.error("Digital storage stream failed:", lastError);
  }
  return null;
}

export async function GET(request, { params }) {
  log("GET");
  const { slug } = await params;
  log(slug);
  const product = await getDigitalProductBySlug(slug);

  if (!product || !isProductListable(product)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (product.type !== "digital_file") {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    const loginUrl = `/auth/signin?callbackUrl=${encodeURIComponent(`/digital/${encodeURIComponent(slug)}`)}`;
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  let canDownload = await hasDigitalAccessUncached(
    product.id,
    session.user.email,
  );
  const isFreeProduct =
    product.free === true || Number(product.priceCents || 0) <= 0;
  if (!canDownload && isFreeProduct) {
    const ip = getClientIp(request);
    const rl = await checkRateLimit("free-claim", ip, 20);
    if (rl.limited) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded for free product claims",
          limit: 20,
          remaining: rl.remaining,
          retryAfterSeconds: 3600,
        },
        {
          status: 429,
          headers: { "Retry-After": "3600" },
        },
      );
    }
    await grantDigitalAccess(product.id, session.user.email);
    canDownload = true;
  }
  if (!canDownload) {
    const shopUrl = `/shop/${encodeURIComponent(product.slug || product.id)}`;
    return NextResponse.redirect(new URL(shopUrl, request.url));
  }

  const fileUrl = await resolveFileUrl(product);
  if (!fileUrl) {
    return new NextResponse("File not available", { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl({
      fileUrl,
      expiresIn: 300,
      downloadFileName: getFileName(product),
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
      getFileName(product),
      request.headers.get("range"),
    );
    if (storageResponse) return storageResponse;

    if (/^(?:r2|s3):/i.test(fileUrl)) {
      return new NextResponse("Download unavailable", { status: 502 });
    }

    return NextResponse.redirect(fileUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Digital download proxy failed:", error);
    return new NextResponse("Download failed", { status: 502 });
  }
}
