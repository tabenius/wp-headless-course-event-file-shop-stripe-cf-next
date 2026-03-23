import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  createMultipartUpload,
  signMultipartParts,
  completeMultipartUpload,
  abortMultipartUpload,
  getUploadBackend,
  isS3Upload,
  isS3Configured,
} from "@/lib/s3upload";

const PART_SIZE = 100 * 1024 * 1024; // 100 MB per part
const MAX_PARTS = 10000;

/**
 * POST /api/admin/multipart-upload
 *
 * Actions via ?action= query param:
 *   create     — initiate a new multipart upload
 *   sign-parts — get presigned URLs for part numbers
 *   complete   — finalize the upload
 *   abort      — cancel and clean up
 */
export async function POST(request) {
  if (process.env.UPLOAD_ENABLED !== "1")
    return NextResponse.json(
      { ok: false, error: "Upload is not enabled in this environment. Set UPLOAD_ENABLED=1." },
      { status: 503 },
    );
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const backend = getUploadBackend(
    new URL(request.url).searchParams.get("backend"),
  );

  if (!isS3Upload(backend)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Multipart upload requires UPLOAD_BACKEND=r2 or s3.",
      },
      { status: 400 },
    );
  }
  if (!isS3Configured(backend)) {
    return NextResponse.json(
      { ok: false, error: "S3/R2 credentials are missing." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";

  try {
    const body = await request.json();

    if (action === "create") {
      const fileName =
        typeof body?.fileName === "string" ? body.fileName.trim() : "";
      const contentType =
        typeof body?.contentType === "string"
          ? body.contentType
          : "application/octet-stream";
      const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;

      if (!fileName) {
        return NextResponse.json(
          { ok: false, error: "fileName is required." },
          { status: 400 },
        );
      }

      const totalParts = fileSize > 0 ? Math.ceil(fileSize / PART_SIZE) : 1;
      if (totalParts > MAX_PARTS) {
        return NextResponse.json(
          {
            ok: false,
            error: `File too large. Max ${MAX_PARTS} parts of ${PART_SIZE / 1024 / 1024} MB = ${(MAX_PARTS * PART_SIZE) / (1024 * 1024 * 1024)} GB.`,
          },
          { status: 400 },
        );
      }

      const result = await createMultipartUpload(
        fileName,
        contentType,
        backend,
      );

      // Pre-sign all parts so the client has everything in one call
      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      const signedParts = await signMultipartParts(
        result.key,
        result.uploadId,
        partNumbers,
        3600,
        backend,
      );

      return NextResponse.json({
        ok: true,
        uploadId: result.uploadId,
        key: result.key,
        publicUrl: result.publicUrl,
        partSize: PART_SIZE,
        totalParts,
        parts: signedParts,
        instructions: [
          `Split your file into ${totalParts} part(s) of ${PART_SIZE / 1024 / 1024} MB each (last part can be smaller).`,
          "For each part, PUT the chunk to the corresponding uploadUrl.",
          "Collect the ETag header from each PUT response.",
          "Then call ?action=complete with the uploadId, key, and parts array.",
        ],
      });
    }

    if (action === "sign-parts") {
      const { key, uploadId, partNumbers } = body || {};
      if (
        !key ||
        !uploadId ||
        !Array.isArray(partNumbers) ||
        partNumbers.length === 0
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "key, uploadId, and partNumbers[] are required.",
          },
          { status: 400 },
        );
      }
      const signed = await signMultipartParts(
        key,
        uploadId,
        partNumbers,
        3600,
        backend,
      );
      return NextResponse.json({ ok: true, parts: signed });
    }

    if (action === "complete") {
      const { key, uploadId, parts } = body || {};
      if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "key, uploadId, and parts[] (with partNumber + etag) are required.",
          },
          { status: 400 },
        );
      }
      const publicUrl = await completeMultipartUpload(
        key,
        uploadId,
        parts,
        backend,
      );
      return NextResponse.json({ ok: true, publicUrl });
    }

    if (action === "abort") {
      const { key, uploadId } = body || {};
      if (!key || !uploadId) {
        return NextResponse.json(
          { ok: false, error: "key and uploadId are required." },
          { status: 400 },
        );
      }
      await abortMultipartUpload(key, uploadId, backend);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Unknown action. Use ?action=create|sign-parts|complete|abort",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Multipart upload error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Multipart upload failed." },
      { status: 500 },
    );
  }
}
