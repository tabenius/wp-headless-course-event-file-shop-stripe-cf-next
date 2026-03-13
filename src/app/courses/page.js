import Link from "next/link";
import { fetchGraphQL, hasGraphQLType } from "@/lib/client";
import { FeaturedImage } from "@/components/image/FeaturedImage";
import site from "@/lib/site";

export const metadata = {
  title: site.pages.courses.title,
  description: site.pages.courses.description,
  alternates: { canonical: "/courses" },
};

const LIST_COURSES_QUERY = `
  query ListCourses {
    lpCourses(first: 50) {
      edges {
        node {
          id
          databaseId
          uri
          title
          excerpt
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
      }
    }
  }
`;

export default async function CoursesPage() {
  const hasLpCourse = await hasGraphQLType("LpCourse");
  if (!hasLpCourse) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold mb-6">Onlinekurser</h1>
        <p className="text-gray-600">
          Kurssidan kräver LearnPress med WPGraphQL-stöd.
        </p>
      </main>
    );
  }

  const data = await fetchGraphQL(LIST_COURSES_QUERY, {}, 1800);
  const courses = data?.lpCourses?.edges?.map((e) => e.node) || [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-24">
      <h1 className="text-4xl font-bold mb-10">Onlinekurser</h1>
      {courses.length === 0 ? (
        <p className="text-gray-600">Inga kurser tillgangliga just nu.</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={course.uri || "#"}
              className="block border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              <FeaturedImage
                post={course}
                title={course.title}
                classNames="h-48 relative"
              />
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-2">{course.title}</h2>
                {course.excerpt && (
                  <div
                    className="text-gray-600 text-sm mb-3 line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: course.excerpt }}
                  />
                )}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  {course.priceRendered && <span>{course.priceRendered}</span>}
                  {course.duration && <span>{course.duration}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
