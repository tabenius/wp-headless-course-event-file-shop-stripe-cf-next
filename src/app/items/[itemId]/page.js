import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnAvatar } from "@/lib/avatarStore";
import { canAvatarReadItem, getFeedItem } from "@/lib/avatarFeedStore";

export const metadata = {
  title: "Feed Item",
};

function decodeSegment(raw) {
  try {
    return decodeURIComponent(raw || "").trim();
  } catch {
    return String(raw || "").trim();
  }
}

export default async function FeedItemPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const itemIdRaw = typeof params?.itemId === "string" ? params.itemId : "";
  const itemId = decodeSegment(itemIdRaw).toLowerCase();
  if (!itemId) notFound();

  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/items/${itemId}`)}`);
  }

  const ownAvatar = await getOwnAvatar(session.user);
  if (!ownAvatar?.id) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-16 space-y-4">
        <h1 className="text-3xl font-bold">Feed Item</h1>
        <p className="text-gray-700">
          Create an avatar first before accessing private feed items.
        </p>
        <Link href="/me" className="text-teal-700 hover:underline">
          Open /me
        </Link>
      </section>
    );
  }

  const [item, canRead] = await Promise.all([
    getFeedItem(itemId),
    canAvatarReadItem({ viewerAvatarId: ownAvatar.id, itemId }),
  ]);
  if (!item || !canRead) notFound();

  return (
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Item {item.itemId}</h1>
        <p className="text-sm text-gray-600">
          Canonical URI: <span className="font-mono">{`/items/${item.itemId}`}</span>
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-2">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Source feed:</span>{" "}
          <Link href={item.feedUri} className="text-teal-700 hover:underline">
            {item.feedUri}
          </Link>
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Published:</span>{" "}
          {item.createdAt || "Unknown"}
        </p>
        {item.caption ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.caption}</p>
        ) : null}
        {item.note ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.note}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-2">
        <h2 className="text-lg font-semibold">Underlying Asset</h2>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Asset ID:</span>{" "}
          <Link
            href={`/assets/${encodeURIComponent(item.assetId)}`}
            className="text-teal-700 hover:underline"
          >
            {item.assetId}
          </Link>
        </p>
        {item.asset?.uri ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Asset URI:</span>{" "}
            <span className="font-mono">{item.asset.uri}</span>
          </p>
        ) : null}
        {item.asset?.creator ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Author:</span>{" "}
            {item.asset.creator.type}:{item.asset.creator.id}
          </p>
        ) : null}
      </div>
    </section>
  );
}

