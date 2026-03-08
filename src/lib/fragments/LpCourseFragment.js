import { editorBlocksFragment } from "./editorBlocks";

/**
 * LearnPress Course fragment — only available when lp_course is registered
 * in WPGraphQL. Set NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1 to enable.
 */
const enabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_WORDPRESS_LEARNPRESS === "1";

export const LpCourseFragment = enabled
  ? `
fragment LpCourseFragment on LpCourse {
    __typename
    id
    databaseId
    uri
    title
    content
    ${editorBlocksFragment}
    price
    priceRendered
    duration
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
  }
`
  : "";
