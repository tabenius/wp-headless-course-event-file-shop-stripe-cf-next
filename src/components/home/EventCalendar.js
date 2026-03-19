import Link from "next/link";
import { decodeEntities } from "@/lib/decodeEntities";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonthGrid(year, month) {
  // month is 0-based (Date convention)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Week starts Monday (ISO)
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const totalDays = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateKey(dateStr) {
  // Normalise to YYYY-MM-DD regardless of ISO vs plain format
  return dateStr?.slice(0, 10) ?? null;
}

function buildEventMap(events) {
  const map = new Map(); // "YYYY-MM-DD" → Event[]
  for (const ev of events) {
    const key = toDateKey(ev.startDate);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return map;
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Month calendar ────────────────────────────────────────────────────────────

function MonthGrid({ year, month, eventMap, todayKey }) {
  const cells = getMonthGrid(year, month);
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{monthLabel}</h3>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-xs">
        {DOW_LABELS.map((d) => (
          <div
            key={d}
            className="bg-gray-100 text-center text-gray-500 font-medium py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="bg-white py-1" />;
          }
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventMap.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;

          return (
            <div
              key={dateKey}
              className={`bg-white p-1 min-h-[2.5rem] ${isToday ? "ring-2 ring-inset ring-purple-400" : ""}`}
            >
              <span
                className={`block text-center text-[11px] font-medium leading-tight mb-0.5 ${isToday ? "text-purple-700" : "text-gray-600"}`}
              >
                {day}
              </span>
              {dayEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.uri}
                  className="block truncate text-[10px] leading-tight px-0.5 py-px rounded bg-purple-100 text-purple-800 hover:bg-purple-200 mb-px"
                  title={decodeEntities(ev.title)}
                >
                  {decodeEntities(ev.title)}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Simple list (no dates) ────────────────────────────────────────────────────

function EventList({ events }) {
  return (
    <ul className="divide-y divide-gray-100">
      {events.slice(0, 8).map((ev) => (
        <li key={ev.id} className="py-2">
          <Link
            href={ev.uri}
            className="text-sm font-medium text-gray-800 hover:text-purple-700 hover:underline"
          >
            {decodeEntities(ev.title)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventCalendar({ events, hasDates }) {
  if (!events?.length) return null;

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Determine which months to show (current + next, or months containing events)
  let months;
  if (hasDates) {
    const eventMap = buildEventMap(events);
    // Collect distinct year-months from events, cap at 2
    const seen = new Set();
    for (const key of eventMap.keys()) {
      const ym = key.slice(0, 7); // "YYYY-MM"
      seen.add(ym);
    }
    // Always include current month
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    seen.add(currentYM);
    months = [...seen]
      .sort()
      .filter((ym) => ym >= currentYM)
      .slice(0, 2)
      .map((ym) => {
        const [y, m] = ym.split("-").map(Number);
        return { year: y, month: m - 1 };
      });
    if (months.length === 0) {
      months = [{ year: now.getFullYear(), month: now.getMonth() }];
    }

    return (
      <section className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Events
            </h2>
            <Link
              href="/events"
              className="text-sm text-purple-700 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row gap-6">
            {months.map(({ year, month }) => (
              <MonthGrid
                key={`${year}-${month}`}
                year={year}
                month={month}
                eventMap={eventMap}
                todayKey={todayKey}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Fallback: simple list without calendar grid
  return (
    <section className="bg-gray-50 border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Upcoming Events
          </h2>
          <Link
            href="/events"
            className="text-sm text-purple-700 hover:underline"
          >
            View all →
          </Link>
        </div>
        <EventList events={events} />
      </div>
    </section>
  );
}
