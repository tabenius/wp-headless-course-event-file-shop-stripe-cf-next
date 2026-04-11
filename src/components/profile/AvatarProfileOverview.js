import Link from "next/link";
import CopyProfileUrlButton from "@/components/profile/CopyProfileUrlButton";

function getDetailRows(avatar) {
  return avatar?.details && typeof avatar.details === "object"
    ? Object.entries(avatar.details)
    : [];
}

export default function AvatarProfileOverview({
  avatar,
  subtitle = "",
  actions = null,
  footerActions = null,
  relationshipsOut = [],
  actionSectionTitle = "",
}) {
  const detailRows = getDetailRows(avatar);
  const canonicalName = avatar?.canonicalName || avatar?.uriId || "Avatar";
  const displayName = avatar?.canonicalName
    ? canonicalName.toLocaleUpperCase()
    : canonicalName;
  const profileHref = avatar?.uriId
    ? `/profile/${encodeURIComponent(avatar.uriId)}`
    : "";
  const sectionLabelClass =
    "font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b1d68]";

  return (
    <div className="space-y-6 text-slate-700">
      <section className="overflow-hidden rounded-[2rem] border border-slate-700 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.45)] bg-white">
        <div className="flex flex-col gap-8 px-6 py-8 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex w-52 aspect-[4/5] items-center justify-center overflow-hidden rounded-[1.15rem] border-2 border-black shadow-[0_22px_44px_-20px_rgba(15,23,42,0.45)]">
              {avatar?.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar.profileImageUrl}
                  alt={canonicalName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-sans text-3xl font-semibold uppercase tracking-[0.18em]">
                  {canonicalName.slice(0, 2)}
                </span>
              )}
            </div>
          <div className="space-y-3 lg:max-w-sm lg:text-left">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  {displayName}
                </h1>
                {subtitle ? (
                  <p className="max-w-2xl text-sm leading-6 md:text-base">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-2 px-3 py-1">
                  <span>Avatar ID:</span>
                  <span className="inline-flex items-center gap-1">
                    <span>{avatar?.uriId || "—"}</span>
                    {profileHref ? <CopyProfileUrlButton href={profileHref} /> : null}
                  </span>
                </span>
                {avatar?.isOwner ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-white">
                      ME
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 ${
                      avatar?.isPublic
                        ? "border-emerald-900 bg-emerald-700 text-white"
                        : "border-amber-900 bg-amber-700 text-white"
                      }`}
                    >
                      {avatar?.isPublic ? "Public" : "Private"}
                    </span>
                  </span>
                ) : null}
	     {actions ? (
                <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div>
              ) : null}
	     {footerActions ? (
		  <div className="px-6 py-4 md:px-8">
		    <div className="flex flex-wrap gap-3">{footerActions}</div>
		  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
        <div className="space-y-4">
          <div>
            <p className={sectionLabelClass}>
              BIO
            </p>
            {avatar?.bio ? (
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
                {avatar.bio}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No bio has been added yet.
              </p>
            )}
          </div>
        </div>
      </section>

      {detailRows.length > 0 ? (
        <section className="rounded-[1.75rem] border border-slate-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
          <div className="space-y-4">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Details
              </p>
            </div>
            <dl className="grid gap-3 md:grid-cols-2">
              {detailRows.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-slate-700 bg-slate-50/80 px-4 py-3"
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {key}
                  </dt>
                  <dd className="mt-1 break-words text-sm leading-6 text-slate-700">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {avatar?.isOwner ? (
        <section className="rounded-[1.75rem] border border-slate-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
          <div className="space-y-4">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {actionSectionTitle || "Outgoing relationships"}
              </p>
            </div>
            {relationshipsOut.length === 0 ? (
              <p className="text-sm text-slate-500">No relationships yet.</p>
            ) : (
              <ul className="space-y-3">
                {relationshipsOut.map((row) => (
                  <li
                    key={`${row.kind}:${row.toAvatarId}`}
                    className="rounded-2xl border border-slate-700 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                  >
                    {row.kind} → 0x{row.toAvatarId}
                    {row.note ? ` (${row.note})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
