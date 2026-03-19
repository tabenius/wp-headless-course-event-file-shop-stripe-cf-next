/**
 * Client-side multipart upload to R2 via presigned URLs.
 * Handles files of any size (up to ~1 TB with 100 MB parts).
 *
 * Usage:
 *   const url = await multipartUpload(file, { onProgress, backend });
 *
 * onProgress receives { loaded, total, percent, currentPart, totalParts }
 */
export async function multipartUpload(file, { onProgress, backend } = {}) {
  const PART_SIZE = 100 * 1024 * 1024; // must match server
  const backendParam = backend ? `&backend=${encodeURIComponent(backend)}` : "";

  // Step 1: Create multipart upload and get presigned URLs for all parts
  const createRes = await fetch(
    `/api/admin/multipart-upload?action=create${backendParam}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileSize: file.size,
      }),
    },
  );
  let createJson;
  try {
    createJson = await createRes.json();
  } catch {
    throw new Error(`Failed to initiate upload (HTTP ${createRes.status}).`);
  }
  if (!createRes.ok || !createJson.ok) {
    throw new Error(createJson?.error || "Failed to initiate upload.");
  }

  const { uploadId, key, parts: signedParts, totalParts } = createJson;

  // Step 2: Upload each part directly to R2
  const completedParts = [];
  let totalUploaded = 0;

  for (let i = 0; i < totalParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const chunk = file.slice(start, end);
    const { partNumber, uploadUrl } = signedParts[i];

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: chunk,
    });

    if (!putRes.ok) {
      // Abort on failure
      await fetch(`/api/admin/multipart-upload?action=abort${backendParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, uploadId }),
      }).catch(() => {});
      throw new Error(`Part ${partNumber} upload failed (${putRes.status}).`);
    }

    const etag = putRes.headers.get("etag");
    if (!etag) {
      await fetch(`/api/admin/multipart-upload?action=abort${backendParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, uploadId }),
      }).catch(() => {});
      throw new Error(`Part ${partNumber} missing ETag header.`);
    }

    completedParts.push({ partNumber, etag });
    totalUploaded += end - start;

    onProgress?.({
      loaded: totalUploaded,
      total: file.size,
      percent: Math.round((totalUploaded / file.size) * 100),
      currentPart: i + 1,
      totalParts,
    });
  }

  // Step 3: Complete the multipart upload
  const completeRes = await fetch(
    `/api/admin/multipart-upload?action=complete${backendParam}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, uploadId, parts: completedParts }),
    },
  );
  let completeJson;
  try {
    completeJson = await completeRes.json();
  } catch {
    throw new Error(`Failed to finalize upload (HTTP ${completeRes.status}).`);
  }
  if (!completeRes.ok || !completeJson.ok) {
    throw new Error(completeJson?.error || "Failed to finalize upload.");
  }

  return completeJson.publicUrl;
}
