import { fetchGraphQL, hasGraphQLType } from "@/lib/client";

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
    const hasEvent = await hasGraphQLType("Event");
    if (!hasEvent) return { events: [], hasDates: false };

    const data = await fetchGraphQL(HOME_EVENTS_QUERY, {}, 1800);
    const raw = data?.events?.edges?.map((e) => e.node).filter(Boolean) ?? [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = raw.filter((e) => {
      if (!e.startDate) return true; // include if date field missing
      return new Date(e.startDate) >= today;
    });

    const hasDates = upcoming.some((e) => e.startDate);
    return { events: upcoming, hasDates };
  } catch {
    return { events: [], hasDates: false };
  }
}
