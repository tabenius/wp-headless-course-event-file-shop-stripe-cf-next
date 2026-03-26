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
          startDate
          endDate
          date
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

const LIST_EVENTS_FALLBACK_QUERY = `
  query ListEventsFallback {
    events(first: 50) {
      edges {
        node {
          id
          uri
          title
          content
          date
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

function extractEvents(data) {
  return data?.events?.edges?.map((e) => e?.node).filter(Boolean) || [];
}

export default async function EventsPage() {
  const data = await fetchGraphQL(LIST_EVENTS_QUERY, {}, 1800);
  let events = extractEvents(data);
  if (events.length === 0) {
    const fallback = await fetchGraphQL(LIST_EVENTS_FALLBACK_QUERY, {}, 1800);
    events = extractEvents(fallback);
  }

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
