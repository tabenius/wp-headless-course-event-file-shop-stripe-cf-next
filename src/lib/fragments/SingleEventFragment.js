import { hasGraphQLType } from "@/lib/client";
import { editorBlocksFragment } from "./editorBlocks";

/**
 * Event fragment — included only when the Event type exists in WPGraphQL.
 * Auto-detected via schema introspection (cached).
 */
export async function getSingleEventFragment() {
  const exists = await hasGraphQLType("Event");
  if (!exists) return "";
  return `
fragment SingleEventFragment on Event {
    __typename
    id
    uri
    title
    content
    date
    ${editorBlocksFragment}
    featuredImage {
      node {
        sourceUrl
        altText
        mediaDetails {
          width
          height
        }
      }
    }
    eventVenues {
      edges {
        node {
          name
        }
      }
    }
  }
`;
}
