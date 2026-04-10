import { requireAdmin } from "@/lib/adminRoute";
import { getFontsCatalog, isVariableFont } from "@/lib/googleFontsCatalog";
import { downloadFontToR2 } from "@/lib/fontDownload";
import { upsertDownloadedFont } from "@/lib/downloadedFonts";

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const { family, weights } = body || {};
  if (!family || typeof family !== "string") {
    return jsonError("family is required.");
  }

  // Verify family exists in catalog
  const catalog = await getFontsCatalog();
  const entry = catalog.fonts.find((f) => f.family === family);
  if (!entry) {
    return jsonError(`Font "${family}" not found in catalog.`, 404);
  }

  const variable = isVariableFont(entry.axes);
  const requestedWeights = variable
    ? undefined
    : Array.isArray(weights) && weights.length > 0
      ? weights.map(Number).filter((w) => w > 0)
      : [400, 700];

  let record;
  try {
    record = await downloadFontToR2(family, variable, requestedWeights);
  } catch (err) {
    return jsonError(err?.message || "Font download failed.", 502);
  }

  try {
    await upsertDownloadedFont(record);
  } catch (err) {
    console.error("upsertDownloadedFont failed after R2 upload:", err);
    return jsonError(
      "Font was downloaded to R2 but could not be saved to KV. Try again.",
      500,
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      record,
      fontFaceCss: record.fontFaceCss,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
