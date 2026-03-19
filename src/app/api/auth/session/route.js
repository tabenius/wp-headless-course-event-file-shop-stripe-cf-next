import { NextResponse } from "next/server";
import { getSessionFromCookieHeader } from "@/auth";

export async function GET(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = await getSessionFromCookieHeader(cookieHeader);
  return NextResponse.json({
    ok: true,
    authenticated: Boolean(session?.user),
    session,
  });
}
