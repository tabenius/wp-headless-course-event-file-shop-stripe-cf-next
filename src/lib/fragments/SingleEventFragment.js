export const SingleEventFragment = `
fragment SingleEventFragment on Event {
    __typename
    id
    uri
    title
    content
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
`;
