import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listOwnAvatarRelationships,
  removeOwnAvatarRelationship,
  upsertOwnAvatarRelationship,
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
  const relationshipsOut = await listOwnAvatarRelationships(session.user);
  return NextResponse.json({ ok: true, relationshipsOut });
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
    const avatar = await upsertOwnAvatarRelationship(session.user, body);
    return NextResponse.json({ ok: true, avatar });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Relationship update failed." },
      { status: statusForAvatarError(error) },
    );
  }
}

export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const avatar = await removeOwnAvatarRelationship(session.user, body);
    return NextResponse.json({ ok: true, avatar });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Relationship removal failed." },
      { status: statusForAvatarError(error) },
    );
  }
}
