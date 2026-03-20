import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOwnAvatar,
  getOwnAvatar,
  listOwnAvatarRelationships,
  updateOwnAvatar,
} from "@/lib/avatarStore";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "You need to sign in." },
    { status: 401 },
  );
}

function statusForAvatarError(error) {
  const message = String(error?.message || "");
  if (message.toLowerCase().includes("not found")) return 404;
  return 400;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const avatar = await getOwnAvatar(session.user);
  const relationships = await listOwnAvatarRelationships(session.user);
  return NextResponse.json({
    ok: true,
    avatar,
    relationshipsOut: relationships,
  });
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await createOwnAvatar(session.user, body);
    return NextResponse.json(
      { ok: true, avatar: result.avatar, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Avatar creation failed." },
      { status: statusForAvatarError(error) },
    );
  }
}

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const avatar = await updateOwnAvatar(session.user, body);
    return NextResponse.json({ ok: true, avatar });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Avatar update failed." },
      { status: statusForAvatarError(error) },
    );
  }
}
