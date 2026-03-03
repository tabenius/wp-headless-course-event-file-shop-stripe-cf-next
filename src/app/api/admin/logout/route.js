import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", clearAdminSessionCookie());
  return response;
}
