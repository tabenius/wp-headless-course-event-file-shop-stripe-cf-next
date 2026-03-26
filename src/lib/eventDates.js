const START_DATE_KEYS = [
  "startDate",
  "eventStartDate",
  "eventDate",
  "date",
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
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getEventStartIso(event) {
  return firstNonEmptyString(event, START_DATE_KEYS);
}

export function getEventEndIso(event) {
  return firstNonEmptyString(event, END_DATE_KEYS);
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
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
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
