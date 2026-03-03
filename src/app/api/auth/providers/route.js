import { NextResponse } from "next/server";
import { getEnabledProviders } from "@/lib/oauthProviders";

export async function GET() {
  return NextResponse.json({
    credentials: true,
    oauth: getEnabledProviders(),
  });
}
