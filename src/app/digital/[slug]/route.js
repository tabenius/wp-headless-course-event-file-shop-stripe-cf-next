import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccessUncached, grantDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductBySlug, isProductListable } from "@/lib/digitalProducts";
import { createSignedDownloadUrl } from "@/lib/s3upload";

export const runtime = "edge";

function getFileName(product) {
  const candidates = [product.name, product.assetId, product.slug, product.id];
  for (const candidate of candidates) {
    const safe = String(candidate || "").trim();
    if (!safe) continue;
    if (/\.\w{1,8}$/.test(safe)) return safe;
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

function resolveFileUrl(product) {
  if (product.fileUrl) return product.fileUrl;
  if (product.imageUrl && product.productMode === "asset") return product.imageUrl;
  return "";
}

function getSignedUrlTtlSeconds() {
  const raw = process.env.DIGITAL_DOWNLOAD_SIGNED_URL_TTL_SECONDS;
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 300;
  if (parsed < 30) return 30;
  if (parsed > 3600) return 3600;
  return parsed;
}

export async function GET(request, { params }) {
  const { slug } = await params;
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

  // Use uncached read — user may have just claimed moments ago
  let canDownload = await hasDigitalAccessUncached(product.id, session.user.email);
  const isFreeProduct =
    product.free === true || Number(product.priceCents || 0) <= 0;
  if (!canDownload && isFreeProduct) {
    // Auto-grant for free products on first visit
    await grantDigitalAccess(product.id, session.user.email);
    canDownload = true;
  }
  if (!canDownload) {
    const shopUrl = `/shop/${encodeURIComponent(product.slug || product.id)}`;
    return NextResponse.redirect(new URL(shopUrl, request.url));
  }

  const fileUrl = resolveFileUrl(product);
  if (!fileUrl) {
    return new NextResponse("File not available", { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl({
      fileUrl,
      expiresIn: getSignedUrlTtlSeconds(),
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

    // Fallback: redirect to raw URL (avoid proxying large files through the worker)
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
