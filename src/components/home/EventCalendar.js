import Link from "next/link";
import Image from "next/image";
import { decodeEntities } from "@/lib/decodeEntities";
import { formatEventDateRange, getEventEndIso, getEventStartIso } from "@/lib/eventDates";
import { t } from "@/lib/i18n";

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateBadge(event) {
  const start = parseDate(getEventStartIso(event));
  const end = parseDate(getEventEndIso(event));
  const date = start || end;
  if (!date) return null;

  const day = new Intl.DateTimeFormat("sv-SE", { day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(date);
  const year = new Intl.DateTimeFormat("sv-SE", { year: "numeric" }).format(date);
  return { day, month: month.toUpperCase(), year };
}

function EventRow({ event }) {
  const title = decodeEntities(event.title || "Untitled event");
  const dateLabel = formatEventDateRange(event, "sv-SE");
  const badge = formatDateBadge(event);

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-[var(--color-background)] p-3 ring-1 ring-[var(--color-muted)] lg:flex-row lg:items-center lg:gap-4">
      <div className="shrink-0 lg:w-32">
        {badge ? (
          <div>
            <div className="text-3xl font-black leading-none text-[var(--color-primary)]">
              {badge.day}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--color-primary)]">
              {badge.month} {badge.year}
            </div>
          </div>
        ) : (
          <div className="text-sm font-bold text-[var(--color-primary)]">UPCOMING</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={event.uri}
          className="block text-xl font-semibold leading-tight text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
          title={title}
        >
          {title}
        </Link>
        {dateLabel && (
          <p className="home-events-date mt-1 text-xs">{dateLabel}</p>
        )}
      </div>

      <Link href={event.uri} className="block overflow-hidden rounded-lg ring-1 ring-[var(--color-muted)] lg:w-48 lg:flex-none">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.imageAlt || title}
            width={384}
            height={192}
            sizes="(min-width: 1024px) 12rem, 100vw"
            className="h-32 w-full object-cover lg:h-24"
            loading="lazy"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-[var(--color-muted)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-foreground)] lg:h-24">
            {t("common.homeNoImage", "No image")}
          </div>
        )}
      </Link>
    </article>
  );
}

export default function EventCalendar({ events }) {
  if (!events?.length) return null;

  return (
    <section className="border-b border-[var(--color-muted)] bg-transparent">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            {t("common.homeUpcomingEvents", "Upcoming Events")}
          </h2>
          <Link
            href="/events"
            className="text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            {t("common.homeViewAll", "View all")} →
          </Link>
        </div>

        <div className="h-px w-full bg-[var(--color-muted)]" />

        <div className="mt-3 space-y-3">
          {events.slice(0, 8).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  );
}
