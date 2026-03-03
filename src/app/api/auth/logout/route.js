import { NextResponse } from "next/server";
import { clearSessionCookie, clearOAuthStateCookie } from "@/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", clearSessionCookie());
  response.headers.append("Set-Cookie", clearOAuthStateCookie());
  return response;
}
