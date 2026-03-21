import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnAvatar } from "@/lib/avatarStore";
import {
  listAssetsByCreator,
  upsertAssetRecord,
} from "@/lib/avatarFeedStore";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "You need to sign in." },
    { status: 401 },
  );
}

function createAssetId() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function statusForError(error) {
  const status = Number(error?.statusCode || error?.status);
  if (Number.isFinite(status) && status >= 400 && status < 600) {
    return status;
  }
  return 400;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const userId = String(session.user.id || session.user.email || "").trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Session user id is missing." },
      { status: 400 },
    );
  }

  const ownAvatar = await getOwnAvatar(session.user);
  const [userAssets, avatarAssets] = await Promise.all([
    listAssetsByCreator({ creatorType: "user", creatorId: userId }),
    ownAvatar?.id
      ? listAssetsByCreator({ creatorType: "avatar", creatorId: ownAvatar.id })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    avatarId: ownAvatar?.uriId || null,
    assets: [...userAssets, ...avatarAssets],
  });
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const userId = String(session.user.id || session.user.email || "").trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Session user id is missing." },
      { status: 400 },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ownAvatar = await getOwnAvatar(session.user);
  const authorMode = String(body?.authorMode || "user")
    .trim()
    .toLowerCase();
  const useAvatarAuthor = authorMode === "avatar";
  if (useAvatarAuthor && !ownAvatar?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Create an avatar first before authoring assets as avatar.",
      },
      { status: 400 },
    );
  }

  const creatorType = useAvatarAuthor ? "avatar" : "user";
  const creatorId = useAvatarAuthor ? ownAvatar.id : userId;

  try {
    const asset = await upsertAssetRecord({
      assetId: body?.assetId || createAssetId(),
      ownerUri: body?.ownerUri || "/",
      uri: body?.uri || "",
      slug: body?.slug || "",
      title: body?.title || "",
      rights: body?.rights || {},
      source: body?.source || {},
      creatorType,
      creatorId,
    });
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to create asset." },
      { status: statusForError(error) },
    );
  }
}

