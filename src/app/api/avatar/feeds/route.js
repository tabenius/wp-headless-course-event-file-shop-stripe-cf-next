import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnAvatar } from "@/lib/avatarStore";
import {
  canAvatarReadFeed,
  createCollectionFeed,
  getCompositeFeedSlug,
  getDefaultFeedSlug,
  listAvatarFeeds,
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

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const ownAvatar = await getOwnAvatar(session.user);
  const requestedAvatar =
    request.nextUrl.searchParams.get("avatarId") ||
    request.nextUrl.searchParams.get("avatarHex") ||
    "";
  const targetAvatarId = requestedAvatar || ownAvatar?.id || "";
  if (!targetAvatarId) {
    return NextResponse.json(
      {
        ok: false,
        error: "No avatar specified. Create an avatar first.",
      },
      { status: 400 },
    );
  }

  try {
    const feeds = await listAvatarFeeds(targetAvatarId);
    const viewerAvatarId = ownAvatar?.id || "";
    const feedsWithAccess = await Promise.all(
      feeds.map(async (feed) => {
        const canRead = viewerAvatarId
          ? await canAvatarReadFeed({
              viewerAvatarId,
              targetAvatarId: feed.avatarId,
              feedSlug: feed.slug,
            })
          : false;
        return { ...feed, canRead };
      }),
    );
    return NextResponse.json({
      ok: true,
      avatarId: feedsWithAccess[0]?.avatarUriId || null,
      viewerAvatarId: ownAvatar?.uriId || null,
      feeds: feedsWithAccess,
      hardcoded: {
        default: getDefaultFeedSlug(),
        composite: getCompositeFeedSlug(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load feeds." },
      { status: statusForError(error) },
    );
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const ownAvatar = await getOwnAvatar(session.user);
  if (!ownAvatar?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Create an avatar first before creating feeds.",
      },
      { status: 400 },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const feed = await createCollectionFeed({
      avatarId: ownAvatar.id,
      slug: body?.slug,
      title: body?.title,
      description: body?.description,
      references: Array.isArray(body?.references) ? body.references : [],
    });
    return NextResponse.json({ ok: true, feed }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to create feed." },
      { status: statusForError(error) },
    );
  }
}

