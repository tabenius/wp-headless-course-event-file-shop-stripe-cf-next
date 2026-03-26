import { fetchGraphQL } from "@/lib/client";

/**
 * RAGBAZ Bridge registers startDate and endDate on the Event type via
 * register_graphql_field. When the plugin is active these fields are always
 * present, so we query them directly.
 */
const HOME_EVENTS_QUERY = `
  query HomeEvents {
    events(first: 50, where: { orderby: { field: DATE, order: ASC } }) {
      edges {
        node {
          id
          title
          uri
          startDate
          endDate
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
        startDate: node.startDate || null,
        endDate: node.endDate || null,
      };
    })
    .filter(Boolean);
}

function sortByStartDateAsc(events) {
  return [...events].sort((a, b) => {
    const aTime = a.startDate ? Date.parse(a.startDate) : Number.POSITIVE_INFINITY;
    const bTime = b.startDate ? Date.parse(b.startDate) : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
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
    const data = await fetchGraphQL(HOME_EVENTS_QUERY, {}, 1800);
    const raw = toRenderableEvents(extractEventNodes(data));

    // Fallback when custom date fields are unavailable or blocked by upstream GraphQL policy.
    if (raw.length === 0) {
      const fallbackData = await fetchGraphQL(HOME_EVENTS_FALLBACK_QUERY, {}, 1800);
      const fallbackRaw = toRenderableEvents(extractEventNodes(fallbackData));
      return { events: fallbackRaw, hasDates: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const withDates = sortByStartDateAsc(raw);
    const upcoming = withDates.filter((e) => {
      if (!e.startDate) return true; // include if date field missing
      return new Date(e.startDate) >= today;
    });
    const display = upcoming.length > 0 ? upcoming : withDates;

    const hasDates = display.some((e) => e.startDate);
    return { events: display, hasDates };
  } catch {
    return { events: [], hasDates: false };
  }
}
