import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  createPresignedUpload,
  getUploadBackend,
  isS3Configured,
  isS3Upload,
} from "@/lib/s3upload";
import { t } from "@/lib/i18n";

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const backend = getUploadBackend(request.nextUrl.searchParams.get("backend"));

  if (!isS3Upload(backend)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Presigned uploads require UPLOAD_BACKEND=r2 or s3.",
      },
      { status: 400 },
    );
  }

  if (!isS3Configured(backend)) {
    return NextResponse.json(
      { ok: false, error: "S3/R2 credentials missing." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const fileName =
      typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const contentType =
      typeof body?.contentType === "string"
        ? body.contentType
        : "application/octet-stream";

    if (!fileName) {
      return NextResponse.json(
        { ok: false, error: "fileName is required." },
        { status: 400 },
      );
    }

    const result = await createPresignedUpload(
      fileName,
      contentType,
      3600,
      backend,
    );

    return NextResponse.json({
      ok: true,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
      expiresIn: result.expiresIn,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      maxSize: "5 GB",
      instructions: [
        `Upload your file with: curl -X PUT -H "Content-Type: ${contentType}" --upload-file YOUR_FILE "${result.uploadUrl}"`,
        `Or use any S3/HTTP client that supports PUT requests.`,
        `The URL expires in ${result.expiresIn} seconds (1 hour).`,
        `After upload, the file is publicly available at: ${result.publicUrl}`,
      ],
    });
  } catch (error) {
    console.error("Presigned upload error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || t("apiErrors.uploadFailed") },
      { status: 500 },
    );
  }
}
