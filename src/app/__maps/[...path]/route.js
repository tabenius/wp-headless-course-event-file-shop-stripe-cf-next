import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parts = Array.isArray(params?.path) ? params.path : [];
  const suffix = parts.join("/");
  if (!suffix)
    return NextResponse.json(
      { ok: false, error: "Missing path" },
      { status: 400 },
    );

  const target = new URL(`/_next/${suffix.replace(/^\/+/, "")}`, request.url);
  const upstream = await fetch(target.toString(), {
    headers: {
      Accept: request.headers.get("accept") || "*/*",
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
