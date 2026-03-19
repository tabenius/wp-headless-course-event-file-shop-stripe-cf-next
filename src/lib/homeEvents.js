import { fetchGraphQL, hasGraphQLType } from "@/lib/client";

const EVENTS_WITH_DATES_QUERY = `
  query HomeEventsWithDates {
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

const EVENTS_BASIC_QUERY = `
  query HomeEventsBasic {
    events(first: 20) {
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

/**
 * Fetch upcoming events for the home page.
 * Returns { events, hasDates } where events is an array of event objects
 * and hasDates indicates whether startDate/endDate were available.
 *
 * Falls back gracefully if the Event type or date fields don't exist.
 */
export async function fetchHomeEvents() {
  try {
    const hasEvent = await hasGraphQLType("Event");
    if (!hasEvent) return { events: [], hasDates: false };

    // Try the richer query with date fields first
    try {
      const data = await fetchGraphQL(EVENTS_WITH_DATES_QUERY, {}, 1800);
      const raw = data?.events?.edges?.map((e) => e.node).filter(Boolean) ?? [];
      // If at least one event has a startDate the schema supports it
      if (raw.some((e) => e.startDate)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = raw.filter((e) => {
          if (!e.startDate) return true; // include dateless events
          return new Date(e.startDate) >= today;
        });
        return { events: upcoming, hasDates: true };
      }
      // Dates came back null — fall through to basic query
      if (raw.length > 0) return { events: raw, hasDates: false };
    } catch {
      // startDate/endDate not in schema — fall through
    }

    // Basic query without date fields
    const data = await fetchGraphQL(EVENTS_BASIC_QUERY, {}, 1800);
    const events =
      data?.events?.edges?.map((e) => e.node).filter(Boolean) ?? [];
    return { events, hasDates: false };
  } catch {
    return { events: [], hasDates: false };
  }
}
