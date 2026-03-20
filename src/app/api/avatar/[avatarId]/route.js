import { NextResponse } from "next/server";
import { getPublicAvatarById } from "@/lib/avatarStore";

export async function GET(_request, { params: paramsPromise }) {
  const params = await paramsPromise;
  const avatarIdRaw = typeof params?.avatarId === "string" ? params.avatarId : "";
  const avatar = await getPublicAvatarById(avatarIdRaw);
  if (!avatar) {
    return NextResponse.json(
      { ok: false, error: "Avatar not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, avatar });
}
