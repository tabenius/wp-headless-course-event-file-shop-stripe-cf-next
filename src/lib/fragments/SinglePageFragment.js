export const SinglePageFragment = `
  fragment SinglePageFragment on Page {
    __typename
    id
    uri
    title
    content
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
    editorBlocks(flat: false) {
      name
      renderedHtml
      attributesJSON
      innerBlocks {
        name
        renderedHtml
        attributesJSON
        innerBlocks {
          name
          renderedHtml
          attributesJSON
        }
      }
    }
  }
`;
