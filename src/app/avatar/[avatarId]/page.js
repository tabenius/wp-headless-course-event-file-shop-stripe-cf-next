import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarForProfileHandle, getOwnAvatar } from "@/lib/avatarStore";

export const dynamic = "force-dynamic";

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
            Manage avatar settings
          </Link>
        ) : (
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(`/avatar/${avatar.uriId}`)}`}
            className="inline-block px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign in
          </Link>
        )}
      </div>
    </section>
  );
}
