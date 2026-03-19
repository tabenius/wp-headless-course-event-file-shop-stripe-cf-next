import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import {
  getUploadBackend,
  isS3Configured,
  isS3Upload,
  uploadToS3,
} from "@/lib/s3upload";
import { t } from "@/lib/i18n";

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;

function maxImageUploadBytes() {
  const raw = Number.parseInt(process.env.MAX_IMAGE_UPLOAD_BYTES || "", 10);
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
}

async function uploadToWordPress(arrayBuffer, file) {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(
    /\/+$/,
    "",
  );
  if (!wpUrl) throw new Error(t("apiErrors.wpUrlMissing"));

  const auth = getWordPressGraphqlAuth();
  if (!auth.authorization) throw new Error(t("apiErrors.wpAuthMissing"));

  const response = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: auth.authorization,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: arrayBuffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("WordPress media upload failed:", response.status, text);
    throw new Error(t("apiErrors.uploadWpFailed", { status: response.status }));
  }

  const media = await response.json();
  return {
    url: media.source_url || "",
    id: media.id,
    title: media.title?.rendered || file.name,
  };
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const backend = getUploadBackend(
      request.nextUrl.searchParams.get("backend"),
    );
    const uploadKind = request.nextUrl.searchParams.get("kind");
    const imageOnly = uploadKind === "image";
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.uploadNoFile") },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (imageOnly) {
      const isImageMime =
        typeof file.type === "string" && file.type.startsWith("image/");
      if (!isImageMime) {
        return NextResponse.json(
          { ok: false, error: t("admin.uploadImageTypeInvalid") },
          { status: 400 },
        );
      }
      const maxBytes = maxImageUploadBytes();
      if (arrayBuffer.byteLength > maxBytes) {
        return NextResponse.json(
          {
            ok: false,
            error: t("admin.uploadImageTooLarge", {
              mb: Math.floor(maxBytes / (1024 * 1024)),
            }),
          },
          { status: 413 },
        );
      }
    }

    if (isS3Upload(backend)) {
      if (!isS3Configured(backend)) {
        return NextResponse.json(
          { ok: false, error: "S3/R2 is not fully configured." },
          { status: 400 },
        );
      }
      const url = await uploadToS3(
        new Uint8Array(arrayBuffer),
        file.name,
        file.type,
        backend,
      );
      return NextResponse.json({
        ok: true,
        url,
        title: file.name,
        mimeType: file.type || "application/octet-stream",
      });
    }

    const result = await uploadToWordPress(arrayBuffer, file);
    return NextResponse.json({
      ok: true,
      ...result,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || t("apiErrors.uploadFailed") },
      { status: 500 },
    );
  }
}
