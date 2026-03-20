import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarForProfileHandle, getOwnAvatar } from "@/lib/avatarStore";
import {
  getDefaultFeedSlug,
  listAvatarFeedItems,
  listAvatarFeeds,
} from "@/lib/avatarFeedStore";
import AvatarFeedPanel from "@/components/profile/AvatarFeedPanel";

export const metadata = {
  title: "Avatar Default Feed",
};

export default async function AvatarDefaultFeedPage({ params: paramsPromise }) {
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
  if (!session?.user?.email) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/avatar/${requestedHandle}/default`)}`,
    );
  }

  const [avatar, ownAvatar] = await Promise.all([
    getAvatarForProfileHandle(requestedHandle, {
      viewerUserId: session.user.id || "",
    }),
    getOwnAvatar(session.user),
  ]);
  if (!avatar) notFound();

  if (!ownAvatar?.id) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-16 space-y-4">
        <h1 className="text-3xl font-bold">Default Feed</h1>
        <p className="text-gray-700">
          Create an avatar first before accessing private feeds.
        </p>
        <Link href="/me" className="text-teal-700 hover:underline">
          Open /me
        </Link>
      </section>
    );
  }

  const feedSlug = getDefaultFeedSlug();
  const feeds = await listAvatarFeeds(avatar.id);
  const feed = feeds.find((row) => row.slug === feedSlug);
  if (!feed) notFound();

  try {
    const items = await listAvatarFeedItems({
      viewerAvatarId: ownAvatar.id,
      avatarId: avatar.id,
      feedSlug,
    });
    return <AvatarFeedPanel avatar={avatar} feed={feed} items={items} />;
  } catch (error) {
    if (Number(error?.statusCode) === 403 || Number(error?.statusCode) === 404) {
      notFound();
    }
    throw error;
  }
}

