import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarForProfileHandle } from "@/lib/avatarStore";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Avatar Profile",
};

export default async function AvatarProfilePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const rawHandle = typeof params?.username === "string" ? params.username : "";
  const requestedHandle = (() => {
    try {
      return decodeURIComponent(rawHandle).trim();
    } catch {
      return String(rawHandle || "").trim();
    }
  })();
  if (!requestedHandle) notFound();

  const session = await auth();
  const viewerUserId = session?.user?.id || "";
  const avatar = await getAvatarForProfileHandle(requestedHandle, {
    viewerUserId,
  });
  if (!avatar) notFound();

  if (requestedHandle !== avatar.uriId) {
    redirect(avatar.canonicalProfilePath || `/profile/${avatar.uriId}`);
  }

  const detailRows =
    avatar.details && typeof avatar.details === "object"
      ? Object.entries(avatar.details)
      : [];
  const relationshipsOut = Array.isArray(avatar.relationshipsOut)
    ? avatar.relationshipsOut
    : [];

  return (
    <section className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {avatar.canonicalName || avatar.uriId || "Avatar"}
        </h1>
        <p className="text-gray-600 mt-2">
          {avatar.isOwner
            ? "This is your avatar profile."
            : "Public avatar profile."}
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
        {avatar.isOwner ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Visibility:</span>{" "}
            {avatar.isPublic ? "Public" : "Private"}
          </p>
        ) : null}
        {avatar.profileImageUrl ? (
          <div className="pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.profileImageUrl}
              alt={avatar.canonicalName || "Avatar profile image"}
              className="h-28 w-28 rounded-full object-cover border border-gray-200"
            />
          </div>
        ) : null}
        {avatar.bio ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {avatar.bio}
          </p>
        ) : null}
      </div>

      {detailRows.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="text-lg font-semibold">Details</h2>
          {detailRows.map(([key, value]) => (
            <p key={key} className="text-sm text-gray-700 break-words">
              <span className="font-semibold">{key}:</span> {String(value)}
            </p>
          ))}
        </div>
      ) : null}

      {avatar.isOwner ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="text-lg font-semibold">Outgoing relationships</h2>
          {relationshipsOut.length === 0 ? (
            <p className="text-sm text-gray-600">No relationships yet.</p>
          ) : (
            <ul className="space-y-2">
              {relationshipsOut.map((row) => (
                <li
                  key={`${row.kind}:${row.toAvatarId}`}
                  className="text-sm text-gray-700"
                >
                  {row.kind} → 0x{row.toAvatarId}
                  {row.note ? ` (${row.note})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {avatar.isOwner ? (
          <Link
            href="/me"
            className="inline-block px-4 py-2 rounded bg-teal-700 text-white text-sm hover:bg-teal-600"
          >
            Manage avatar
          </Link>
        ) : null}
        <Link
          href="/shop"
          className="inline-block px-4 py-2 rounded bg-gray-800 text-white text-sm hover:bg-gray-700"
        >
          Open shop
        </Link>
      </div>
    </section>
  );
}
