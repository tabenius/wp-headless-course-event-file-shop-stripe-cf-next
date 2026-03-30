import { PostListFragment } from "@/lib/fragments/PostListFragment";
import { BlogListingTemplate } from "@/components/blog/BlogListingTemplate";
import { StorefrontListSkeleton } from "@/components/common/StorefrontSkeletons";
import site from "@/lib/site";
import { Suspense } from "react";

export const metadata = {
  title: site.pages.blog.title,
  description: site.pages.blog.description,
  alternates: { canonical: "/blog" },
};

const LIST_POSTS_QUERY = `
  ${PostListFragment}
  query ListPosts($after: String, $first: Int = 5) {
    posts(after: $after, first: $first) {
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

async function BlogPageContent(params) {
  return BlogListingTemplate(LIST_POSTS_QUERY, params, "Blog");
}

export default function BlogPage(params) {
  return (
    <Suspense fallback={<StorefrontListSkeleton items={5} withImage />}>
      <BlogPageContent {...params} />
    </Suspense>
  );
}
