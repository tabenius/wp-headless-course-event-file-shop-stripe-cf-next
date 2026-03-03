import { NextResponse } from "next/server";
import { getSessionFromCookieHeader } from "@/auth";

export async function GET(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = getSessionFromCookieHeader(cookieHeader);
  return NextResponse.json({ authenticated: Boolean(session?.user), session });
}
