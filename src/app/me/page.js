import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnAvatar, listOwnAvatarRelationships } from "@/lib/avatarStore";
import AvatarMePanel from "@/components/profile/AvatarMePanel";

export const metadata = {
  title: "My Avatar",
  alternates: { canonical: "/me" },
};

export default async function MePage() {
  const session = await auth();
  const user = session?.user || null;
  if (!user?.email) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/me")}`);
  }

  const [avatar, relationshipsOut] = await Promise.all([
    getOwnAvatar(user),
    listOwnAvatarRelationships(user),
  ]);

  return (
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Avatar</h1>
        <p className="text-gray-600 mt-2">
          Configure your avatar profile, canonical name, visibility, and
          relationships.
        </p>
      </div>

      {avatar?.uriId ? (
        <p className="text-sm text-gray-700">
          Public profile URL:{" "}
          <Link
            href={`/profile/${encodeURIComponent(avatar.uriId)}`}
            className="text-teal-700 hover:underline"
          >
            /profile/{avatar.uriId}
          </Link>
        </p>
      ) : null}

      <AvatarMePanel
        initialAvatar={avatar}
        initialRelationships={relationshipsOut}
      />
    </section>
  );
}
