import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnAvatar } from "@/lib/avatarStore";
import {
  listAvatarFeedItems,
  publishAvatarFeedItem,
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
          error: "Create an avatar first before accessing feed items.",
        },
        { status: 400 },
      ),
    };
  }
  return { ownAvatar };
}

export async function GET(request) {
  const check = await requireOwnAvatar();
  if (check.error) return check.error;

  const targetAvatarId =
    request.nextUrl.searchParams.get("avatarId") ||
    request.nextUrl.searchParams.get("avatarHex") ||
    check.ownAvatar.id;
  const feedSlug = request.nextUrl.searchParams.get("feed") || "default";

  try {
    const items = await listAvatarFeedItems({
      viewerAvatarId: check.ownAvatar.id,
      avatarId: targetAvatarId,
      feedSlug,
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load feed items." },
      { status: statusForError(error) },
    );
  }
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
    const item = await publishAvatarFeedItem({
      actorAvatarId: check.ownAvatar.id,
      avatarId: check.ownAvatar.id,
      feedSlug: body?.feedSlug || "default",
      assetId: body?.assetId,
      caption: body?.caption || "",
      note: body?.note || "",
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to publish item." },
      { status: statusForError(error) },
    );
  }
}

