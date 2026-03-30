import { fetchGraphQL } from "@/lib/client";
import { getEventEndIso, getEventStartIso, isEventUpcoming } from "@/lib/eventDates";

/**
 * Compatibility-first event loading:
 * 1) Try enriched fields (start/end/date) for calendar/date rendering.
 * 2) Fall back to minimal event fields when upstream schema is stricter.
 */
const HOME_EVENTS_QUERY = `
  query HomeEvents {
    events(first: 50) {
      edges {
        node {
          id
          title
          uri
          startDate
          endDate
          date
          featuredImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

const HOME_EVENTS_FALLBACK_QUERY = `
  query HomeEventsFallback {
    events(first: 50) {
      edges {
        node {
          id
          title
          uri
          featuredImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

function extractEventNodes(data) {
  return data?.events?.edges?.map((edge) => edge?.node).filter(Boolean) ?? [];
}

function normalizeEventUri(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname || "/";
    return path === "/" ? "/" : path.replace(/\/+$/, "");
  } catch {
    if (!raw.startsWith("/")) return "";
    return raw === "/" ? "/" : raw.replace(/\/+$/, "");
  }
}

function toRenderableEvents(nodes) {
  return nodes
    .map((node) => {
      const uri = normalizeEventUri(node?.uri);
      const title = typeof node?.title === "string" ? node.title.trim() : "";
      if (!uri || !title) return null;
      return {
        id: node.id || `${uri}:${title}`,
        title,
        uri,
        startDate: getEventStartIso(node) || null,
        endDate: getEventEndIso(node) || null,
        imageUrl: node?.featuredImage?.node?.sourceUrl || "",
        imageAlt: node?.featuredImage?.node?.altText || title,
      };
    })
    .filter(Boolean);
}

function sortByStartDateAsc(events) {
  return [...events].sort((a, b) => {
    const aTime = new Date(a.startDate || a.endDate || "").getTime();
    const bTime = new Date(b.startDate || b.endDate || "").getTime();
    const aSafe = Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY;
    const bSafe = Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY;
    return aSafe - bSafe;
  });
}

function filterUpcomingEvents(events) {
  return events.filter((event) => isEventUpcoming(event));
}

/**
 * Fetch upcoming events for the home page.
 * Returns { events, hasDates }.
 *
 * - If Event type is not registered (plugin absent), returns empty immediately.
 * - startDate/endDate come from the ragbaz-bridge plugin; if somehow absent
 *   (older plugin version) we fall back gracefully without crashing.
 */
export async function fetchHomeEvents() {
  try {
    const data = await fetchGraphQL(HOME_EVENTS_QUERY, {}, 1800, {
      edgeCache: true,
    });
    const raw = toRenderableEvents(extractEventNodes(data));

    // Fallback when custom date fields are unavailable or blocked by upstream GraphQL policy.
    if (raw.length === 0) {
      const fallbackData = await fetchGraphQL(
        HOME_EVENTS_FALLBACK_QUERY,
        {},
        1800,
        { edgeCache: true },
      );
      const fallbackRaw = toRenderableEvents(extractEventNodes(fallbackData));
      const fallbackUpcoming = sortByStartDateAsc(filterUpcomingEvents(fallbackRaw));
      return { events: fallbackUpcoming, hasDates: false };
    }

    const withDates = sortByStartDateAsc(raw);
    const upcoming = filterUpcomingEvents(withDates);
    const display = sortByStartDateAsc(upcoming);
    const hasDates = display.some((e) => e.startDate || e.endDate);
    return { events: display, hasDates };
  } catch {
    return { events: [], hasDates: false };
  }
}
