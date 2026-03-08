import { editorBlocksFragment } from "./editorBlocks";

/**
 * Event fragment — only available when the Event CPT is registered in WPGraphQL.
 * Set NEXT_PUBLIC_WORDPRESS_EVENT_CPT=1 to enable.
 */
const enabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_WORDPRESS_EVENT_CPT === "1";

export const SingleEventFragment = enabled
  ? `
fragment SingleEventFragment on Event {
    __typename
    id
    uri
    title
    content
    ${editorBlocksFragment}
    eventFields {
      date
      startTime
      endTime
    }
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
    location {
      edges {
        node {
          name
        }
      }
    }
  }
`
  : "";
