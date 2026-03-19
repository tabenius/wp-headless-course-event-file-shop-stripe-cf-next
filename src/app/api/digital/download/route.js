import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductById } from "@/lib/digitalProducts";
import { t } from "@/lib/i18n";

function getFileName(fileUrl, fallbackId) {
  try {
    const pathname = new URL(fileUrl).pathname;
    const name = path.basename(pathname || "").trim();
    return name || `${fallbackId}.bin`;
  } catch {
    return `${fallbackId}.bin`;
  }
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
  if (!product || !product.active) {
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

  const canDownload = await hasDigitalAccess(product.id, session.user.email);
  if (!canDownload) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.noFileAccess") },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(product.fileUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.fileFetchFailed") },
        { status: 502 },
      );
    }

    const fileName = getFileName(product.fileUrl, product.id);
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
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
