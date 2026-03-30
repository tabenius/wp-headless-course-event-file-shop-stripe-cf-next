import { PostListFragment } from "@/lib/fragments/PostListFragment";
import { BlogListingTemplate } from "@/components/blog/BlogListingTemplate";
import { StorefrontListSkeleton } from "@/components/common/StorefrontSkeletons";
import { Suspense } from "react";

const TAG_POSTS_QUERY = `
  ${PostListFragment}
  query ListPostsForTag($slug: String!, $after: String, $first: Int = 5) {
    posts(where: { tag: $slug }, after: $after, first: $first) {
      edges {
        node {
          ...PostListFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function TagPageContent({ params: paramsPromise }) {
  const params = await paramsPromise;
  return BlogListingTemplate(TAG_POSTS_QUERY, params, "Tag");
}

export default function TagPage(props) {
  return (
    <Suspense fallback={<StorefrontListSkeleton items={5} withImage />}>
      <TagPageContent {...props} />
    </Suspense>
  );
}
