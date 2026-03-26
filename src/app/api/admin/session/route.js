import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";

export async function GET(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = await getAdminSessionFromCookieHeader(cookieHeader);
  return NextResponse.json({ authenticated: Boolean(session), session });
}
