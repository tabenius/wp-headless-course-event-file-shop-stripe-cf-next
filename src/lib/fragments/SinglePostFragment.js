export const SinglePostFragment = `
  fragment Comment on Comment {
    id
    content
    date
    author {
      node {
        name
      }
    }
  }
  fragment SinglePostFragment on Post {
    __typename
    id
    databaseId
    date
    uri
    content
    title
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
    comments {
      edges {
        node {
          ...Comment
        }
      }
    }
    author {
      node {
        name
      }
    }
  }
`;
