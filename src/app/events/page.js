import { fetchGraphQL } from "@/lib/client";
import EventListItem from "@/components/cpt/EventListItem";

export const metadata = {
  title: "Evenemang",
  description: "Kommande evenemang och workshops.",
  alternates: { canonical: "/events" },
};

const LIST_EVENTS_QUERY = `
  query ListEvents {
    events(first: 50) {
      edges {
        node {
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
          eventVenues {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

export default async function EventsPage() {
  const data = await fetchGraphQL(LIST_EVENTS_QUERY, {}, 1800);
  const events = data?.events?.edges?.map((e) => e.node) || [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-24">
      <h1 className="text-4xl font-bold mb-10">Evenemang</h1>
      {events.length === 0 ? (
        <p className="text-gray-600">Inga evenemang just nu.</p>
      ) : (
        <div className="space-y-6">
          {events.map((event) => (
            <EventListItem key={event.id} post={event} />
          ))}
        </div>
      )}
    </main>
  );
}
