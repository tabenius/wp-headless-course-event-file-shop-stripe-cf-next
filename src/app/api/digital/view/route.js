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

function isBrowserViewableMime(mimeType) {
  const safe = String(mimeType || "").trim().toLowerCase();
  return (
    safe.startsWith("video/") ||
    safe.startsWith("audio/") ||
    safe.startsWith("image/") ||
    safe === "application/pdf"
  );
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
  if (product.type !== "digital_file" || !isBrowserViewableMime(product.mimeType)) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.productNotDownloadable") },
      { status: 400 },
    );
  }

  const canAccess = await hasDigitalAccessUncached(product.id, session.user.email);
  if (!canAccess) {
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

    const signedUrl = await createSignedDownloadUrl({
      fileUrl,
      expiresIn: 3600,
      downloadFileName: getFileName(fileUrl, product.id),
      dispositionMode: "inline",
    });
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
          "Cache-Control": "private, no-store",
        },
      });
    }

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
    console.error("Digital view failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.downloadFailed") },
      { status: 502 },
    );
  }
}
