import { hasGraphQLType } from "@/lib/client";

/**
 * Event list fragment — included only when the Event type exists in WPGraphQL.
 * Auto-detected via schema introspection (cached).
 */
export async function getEventListFragment() {
  const exists = await hasGraphQLType("Event");
  if (!exists) return "";
  return `
fragment EventListFragment on Event {
    id
    title
    uri
    content
    eventVenues {
      edges {
        node {
          name
        }
      }
    }
    featuredImage {
      node {
        sourceUrl
        altText
      }
    }
    author {
      node {
        name
        avatar {
          url
        }
      }
    }
  }
`;
}
