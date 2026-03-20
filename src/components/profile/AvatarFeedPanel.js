import Link from "next/link";

export default function AvatarFeedPanel({ avatar, feed, items = [] }) {
  return (
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{feed?.title || "Feed"}</h1>
        <p className="text-sm text-gray-600">
          Avatar:{" "}
          <Link
            href={`/avatar/${encodeURIComponent(avatar.uriId)}`}
            className="text-teal-700 hover:underline"
          >
            {avatar.canonicalName || avatar.uriId}
          </Link>
        </p>
        <p className="text-sm text-gray-600">
          Feed URI: <span className="font-mono">{feed?.uri}</span>
        </p>
      </div>

      {feed?.description ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {feed.description}
          </p>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-700">No items in this feed yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.itemId}
              className="rounded-lg border border-gray-200 bg-white p-5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold break-all">
                  Item {item.itemId}
                </h2>
                <Link
                  href={`/items/${encodeURIComponent(item.itemId)}`}
                  className="text-sm text-teal-700 hover:underline"
                >
                  Open item
                </Link>
              </div>
              {item.caption ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.caption}</p>
              ) : null}
              <div className="grid gap-1 text-sm text-gray-700">
                <p>
                  <span className="font-semibold">Asset:</span>{" "}
                  <Link
                    href={`/assets/${encodeURIComponent(item.assetId)}`}
                    className="text-teal-700 hover:underline"
                  >
                    {item.assetId}
                  </Link>
                </p>
                <p>
                  <span className="font-semibold">Published:</span>{" "}
                  {item.createdAt || "Unknown"}
                </p>
                {item.asset?.creator ? (
                  <p>
                    <span className="font-semibold">Asset author:</span>{" "}
                    {item.asset.creator.type}:{item.asset.creator.id}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

