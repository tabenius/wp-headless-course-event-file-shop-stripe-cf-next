import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductById } from "@/lib/digitalProducts";

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
      { ok: false, error: "Du behöver vara inloggad för att ladda ner filer." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId") || "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "Ogiltig produkt." }, { status: 400 });
  }

  const product = await getDigitalProductById(productId);
  if (!product || !product.active) {
    return NextResponse.json({ ok: false, error: "Produkten hittades inte." }, { status: 404 });
  }
  if (product.type !== "digital_file") {
    return NextResponse.json(
      { ok: false, error: "Den här produkten laddas inte ner som fil. Se produktsidan i butiken." },
      { status: 400 },
    );
  }

  const canDownload = await hasDigitalAccess(product.id, session.user.email);
  if (!canDownload) {
    return NextResponse.json(
      { ok: false, error: "Du har inte åtkomst till den här filen ännu." },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(product.fileUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { ok: false, error: "Kunde inte hämta filen just nu." },
        { status: 502 },
      );
    }

    const fileName = getFileName(product.fileUrl, product.id);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
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
      { ok: false, error: "Nedladdningen misslyckades. Försök igen snart." },
      { status: 502 },
    );
  }
}
