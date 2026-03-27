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
    <article className="flex flex-col gap-3 rounded-xl bg-[#fffdfb] p-3 ring-1 ring-[#f0d7eb] dark:bg-neutral-900/95 dark:ring-purple-400/30 lg:flex-row lg:items-center lg:gap-4">
      <div className="shrink-0 lg:w-32">
        {badge ? (
          <div>
            <div className="text-3xl font-black leading-none text-purple-700 dark:text-white">
              {badge.day}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold tracking-[0.14em] text-purple-600 dark:text-white">
              {badge.month} {badge.year}
            </div>
          </div>
        ) : (
          <div className="text-sm font-bold text-purple-700 dark:text-white">UPCOMING</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={event.uri}
          className="block text-xl font-semibold leading-tight text-gray-900 hover:text-purple-700 dark:text-white dark:hover:text-white"
          title={title}
        >
          {title}
        </Link>
        {dateLabel && (
          <p className="home-events-date mt-1 text-xs">{dateLabel}</p>
        )}
      </div>

      <Link href={event.uri} className="block overflow-hidden rounded-lg ring-1 ring-[#edd5e8] lg:w-48 lg:flex-none">
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
          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-[#fff8fc] to-[#fff4fa] text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:from-neutral-800 dark:to-neutral-900 dark:text-white lg:h-24">
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
    <section className="border-b border-[#f0d7eb] bg-transparent dark:border-neutral-800">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("common.homeUpcomingEvents", "Upcoming Events")}
          </h2>
          <Link
            href="/events"
            className="text-sm font-medium text-purple-700 hover:underline dark:text-white"
          >
            {t("common.homeViewAll", "View all")} →
          </Link>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#d89bcf] to-transparent" />

        <div className="mt-3 space-y-3">
          {events.slice(0, 8).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  );
}
