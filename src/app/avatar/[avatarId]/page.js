import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarForProfileHandle, getOwnAvatar } from "@/lib/avatarStore";
import { canAvatarReadFeed, listAvatarFeeds } from "@/lib/avatarFeedStore";

export const metadata = {
  title: "Avatar Profile",
};

export default async function AvatarPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const avatarIdRaw =
    typeof params?.avatarId === "string" ? params.avatarId : "";
  const requestedHandle = (() => {
    try {
      return decodeURIComponent(avatarIdRaw).trim();
    } catch {
      return String(avatarIdRaw || "").trim();
    }
  })();
  if (!requestedHandle) notFound();

  const session = await auth();
  const viewerUserId = session?.user?.id || "";
  const [avatar, ownAvatar] = await Promise.all([
    getAvatarForProfileHandle(requestedHandle, { viewerUserId }),
    session?.user?.email ? getOwnAvatar(session.user) : Promise.resolve(null),
  ]);
  if (!avatar) {
    notFound();
  }
  if (requestedHandle !== avatar.uriId) {
    redirect(`/avatar/${encodeURIComponent(avatar.uriId)}`);
  }

  const feeds = await listAvatarFeeds(avatar.id);
  const viewerAvatarId = ownAvatar?.id || "";
  const feedRows = await Promise.all(
    feeds.map(async (feed) => {
      const canRead = viewerAvatarId
        ? await canAvatarReadFeed({
            viewerAvatarId,
            targetAvatarId: avatar.id,
            feedSlug: feed.slug,
          })
        : false;
      return { ...feed, canRead };
    }),
  );

  return (
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          {avatar.canonicalName || avatar.uriId || "Avatar"}
        </h1>
        <p className="text-sm text-gray-600">
          Avatar URI: <span className="font-mono">{`/avatar/${avatar.uriId}`}</span>
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Avatar ID:</span> {avatar.uriId}
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Canonical name:</span>{" "}
          {avatar.canonicalName || "—"}
        </p>
        {avatar.profileImageUrl ? (
          <div className="pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.profileImageUrl}
              alt={avatar.canonicalName || "Avatar image"}
              className="h-28 w-28 rounded-full object-cover border border-gray-200"
            />
          </div>
        ) : null}
        {avatar.bio ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{avatar.bio}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-lg font-semibold">Feeds</h2>
        <p className="text-sm text-gray-700">
          Feeds are private for now. Access is granted to the avatar owner and
          avatars following specific feeds.
        </p>
        <ul className="space-y-2">
          {feedRows.map((feed) => (
            <li
              key={feed.slug}
              className="flex flex-wrap items-center gap-2 text-sm text-gray-700"
            >
              <span className="font-semibold">{feed.title}</span>
              <span className="text-gray-500">({feed.slug})</span>
              {feed.canRead ? (
                <Link href={feed.uri} className="text-teal-700 hover:underline">
                  Open feed
                </Link>
              ) : (
                <span className="text-gray-500">Access requires avatar follow</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        {avatar.isOwner ? (
          <Link
            href="/me"
            className="inline-block px-4 py-2 rounded bg-teal-700 text-white text-sm hover:bg-teal-600"
          >
            Manage avatar
          </Link>
        ) : null}
        {session?.user?.email ? (
          <Link
            href="/me"
            className="inline-block px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Manage avatar/feed settings
          </Link>
        ) : (
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(`/avatar/${avatar.uriId}`)}`}
            className="inline-block px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign in to access feeds
          </Link>
        )}
      </div>
    </section>
  );
}
