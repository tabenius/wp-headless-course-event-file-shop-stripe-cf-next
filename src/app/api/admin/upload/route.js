import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Du behöver logga in som administratör." },
    { status: 401 },
  );
}

export async function POST(request) {
  const session = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!session) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: "Ingen fil skickades." },
        { status: 400 },
      );
    }

    const wpUrl = (
      process.env.NEXT_PUBLIC_WORDPRESS_URL || ""
    ).replace(/\/+$/, "");
    if (!wpUrl) {
      return NextResponse.json(
        { ok: false, error: "WordPress URL saknas." },
        { status: 500 },
      );
    }

    const auth = getWordPressGraphqlAuth();
    if (!auth.authorization) {
      return NextResponse.json(
        { ok: false, error: "WordPress-autentisering saknas." },
        { status: 500 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
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
      return NextResponse.json(
        { ok: false, error: `Uppladdning misslyckades (${response.status}).` },
        { status: 502 },
      );
    }

    const media = await response.json();
    return NextResponse.json({
      ok: true,
      url: media.source_url || "",
      id: media.id,
      title: media.title?.rendered || file.name,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { ok: false, error: "Uppladdning misslyckades." },
      { status: 500 },
    );
  }
}
