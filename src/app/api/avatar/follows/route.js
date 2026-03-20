import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnAvatar } from "@/lib/avatarStore";
import {
  followAvatarFeed,
  listAvatarFeedFollows,
  unfollowAvatarFeed,
} from "@/lib/avatarFeedStore";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "You need to sign in." },
    { status: 401 },
  );
}

function statusForError(error) {
  const status = Number(error?.statusCode || error?.status);
  if (Number.isFinite(status) && status >= 400 && status < 600) {
    return status;
  }
  return 400;
}

async function requireOwnAvatar() {
  const session = await auth();
  if (!session?.user?.email) return { error: unauthorized() };
  const ownAvatar = await getOwnAvatar(session.user);
  if (!ownAvatar?.id) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: "Create an avatar first before following feeds.",
        },
        { status: 400 },
      ),
    };
  }
  return { ownAvatar };
}

export async function GET() {
  const check = await requireOwnAvatar();
  if (check.error) return check.error;
  const follows = await listAvatarFeedFollows(check.ownAvatar.id);
  return NextResponse.json({
    ok: true,
    avatarId: check.ownAvatar.uriId,
    follows,
  });
}

export async function POST(request) {
  const check = await requireOwnAvatar();
  if (check.error) return check.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const follow = await followAvatarFeed({
      followerAvatarId: check.ownAvatar.id,
      targetAvatarId: body?.targetAvatarId || body?.avatarId || "",
      feedSlug: body?.feedSlug || "default",
    });
    return NextResponse.json({ ok: true, follow }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to follow feed." },
      { status: statusForError(error) },
    );
  }
}

export async function DELETE(request) {
  const check = await requireOwnAvatar();
  if (check.error) return check.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await unfollowAvatarFeed({
      followerAvatarId: check.ownAvatar.id,
      targetAvatarId: body?.targetAvatarId || body?.avatarId || "",
      feedSlug: body?.feedSlug || "default",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to unfollow feed." },
      { status: statusForError(error) },
    );
  }
}

