import { PostListFragment } from "@/lib/fragments/PostListFragment";
import { BlogListingTemplate } from "@/components/blog/BlogListingTemplate";
import { StorefrontListSkeleton } from "@/components/common/StorefrontSkeletons";
import { Suspense } from "react";

const CAT_POSTS_QUERY = `
  ${PostListFragment}
  query ListPostsForCategory($slug: String!, $after: String, $first: Int = 5) {
    posts(where: { categoryName: $slug }, after: $after, first: $first) {
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

async function CategoryPageContent({ params: paramsPromise }) {
  const params = await paramsPromise;
  return BlogListingTemplate(CAT_POSTS_QUERY, params, "Category");
}

export default function CategoryPage(props) {
  return (
    <Suspense fallback={<StorefrontListSkeleton items={5} withImage />}>
      <CategoryPageContent {...props} />
    </Suspense>
  );
}
