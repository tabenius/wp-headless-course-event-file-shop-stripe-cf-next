const START_DATE_KEYS = [
  "startDate",
  "eventStartDate",
  "eventDate",
  // "date" is deliberately excluded — WordPress returns the post *publish*
  // date under that key, which has nothing to do with the event schedule.
  "startsAt",
  "start",
];

const END_DATE_KEYS = ["endDate", "eventEndDate", "endsAt", "end"];

function firstNonEmptyString(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

function parseDate(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasExplicitTime(value) {
  return /T\d{2}:\d{2}/.test(String(value || ""));
}

function isSameDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function toEndOfDay(date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export function getEventStartIso(event) {
  return firstNonEmptyString(event, START_DATE_KEYS);
}

export function getEventEndIso(event) {
  return firstNonEmptyString(event, END_DATE_KEYS);
}

/**
 * Resolve the effective end boundary for an event.
 * Returns null if the event has no parseable dates.
 */
function getEffectiveBoundary(event) {
  const startRaw = getEventStartIso(event);
  const endRaw = getEventEndIso(event);
  const boundaryRaw = endRaw || startRaw;
  if (!boundaryRaw) return null;

  const boundary = parseDate(boundaryRaw);
  if (!boundary) return null;
  // When we have an explicit endDate with a time component, use it as-is.
  // Otherwise (date-only, or falling back to startDate), keep the event
  // visible until end-of-day so it doesn't vanish once its start time passes.
  return endRaw && hasExplicitTime(endRaw) ? boundary : toEndOfDay(boundary);
}

export function isEventUpcoming(event, now = new Date()) {
  const boundary = getEffectiveBoundary(event);
  // Events with no dates are treated as upcoming (not silently dropped).
  if (!boundary) return true;
  return boundary.getTime() >= now.getTime();
}

export function isEventPassed(event, now = new Date()) {
  const boundary = getEffectiveBoundary(event);
  // Events with no dates are never considered passed.
  if (!boundary) return false;
  return boundary.getTime() < now.getTime();
}

export function formatEventDateRange(event, locale = "sv-SE") {
  const startRaw = getEventStartIso(event);
  if (!startRaw) return "";
  const start = parseDate(startRaw);
  if (!start) return startRaw;

  const endRaw = getEventEndIso(event);
  const end = parseDate(endRaw);
  const showTime = hasExplicitTime(startRaw) || hasExplicitTime(endRaw);

  const dateFmt = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  if (!end) {
    return showTime
      ? `${dateFmt.format(start)} ${timeFmt.format(start)}`
      : dateFmt.format(start);
  }

  if (isSameDay(start, end)) {
    if (showTime) {
      return `${dateFmt.format(start)} ${timeFmt.format(start)}–${timeFmt.format(end)}`;
    }
    return dateFmt.format(start);
  }

  return `${dateFmt.format(start)} - ${dateFmt.format(end)}`;
}
