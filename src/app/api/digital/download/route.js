import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccessUncached } from "@/lib/digitalAccessStore";
import {
  getDigitalProductById,
  isProductListable,
  resolveFileUrl,
} from "@/lib/digitalProducts";
import { createSignedDownloadUrl } from "@/lib/s3upload";
import { t } from "@/lib/i18n";

export const runtime = "edge";

function getFileName(fileUrl, fallbackId) {
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

function getSignedUrlTtlSeconds() {
  const raw = process.env.DIGITAL_DOWNLOAD_SIGNED_URL_TTL_SECONDS;
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 300;
  if (parsed < 30) return 30;
  if (parsed > 3600) return 3600;
  return parsed;
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

  // Use uncached read — user may have just claimed access moments ago
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
    const fileUrl = resolveFileUrl(product);
    if (!fileUrl) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.downloadFailed") },
        { status: 404 },
      );
    }
    const rawName = getFileName(fileUrl, product.id);
    const signedUrl = await createSignedDownloadUrl({
      fileUrl,
      expiresIn: getSignedUrlTtlSeconds(),
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

    // Fallback: redirect to raw URL (avoid proxying large files through the worker)
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
