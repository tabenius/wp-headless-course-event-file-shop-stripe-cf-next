import Link from "next/link";
import { decodeEntities } from "@/lib/decodeEntities";
import { formatEventDateRange, getEventEndIso, getEventStartIso } from "@/lib/eventDates";

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
    <article className="flex flex-col gap-4 rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-purple-100 lg:flex-row lg:items-center lg:gap-6">
      <div className="shrink-0 lg:w-40">
        {badge ? (
          <div>
            <div className="text-4xl font-black leading-none text-purple-700">
              {badge.day}
            </div>
            <div className="mt-1 text-sm font-semibold tracking-[0.16em] text-purple-600">
              {badge.month} {badge.year}
            </div>
          </div>
        ) : (
          <div className="text-base font-bold text-purple-700">UPCOMING</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={event.uri}
          className="block text-2xl font-semibold leading-tight text-gray-900 hover:text-purple-700"
          title={title}
        >
          {title}
        </Link>
        {dateLabel && <p className="mt-2 text-sm text-purple-800/90">{dateLabel}</p>}
      </div>

      <Link
        href={event.uri}
        className="block overflow-hidden rounded-xl ring-1 ring-purple-200 lg:w-64 lg:flex-none"
      >
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.imageAlt || title}
            className="h-44 w-full object-cover lg:h-36"
            loading="lazy"
          />
        ) : (
          <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-purple-100 to-purple-50 text-xs font-semibold uppercase tracking-wide text-purple-600 lg:h-36">
            No image
          </div>
        )}
      </Link>
    </article>
  );
}

export default function EventCalendar({ events }) {
  if (!events?.length) return null;

  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Upcoming Events</h2>
          <Link href="/events" className="text-sm font-medium text-purple-700 hover:underline">
            View all →
          </Link>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-purple-400 to-transparent" />

        <div className="mt-5 space-y-5">
          {events.slice(0, 8).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  );
}
