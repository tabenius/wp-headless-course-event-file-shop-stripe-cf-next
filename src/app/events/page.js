import { fetchGraphQL } from "@/lib/client";
import EventListItem from "@/components/cpt/EventListItem";
import { StorefrontListSkeleton } from "@/components/common/StorefrontSkeletons";
import { getEventEndIso, getEventStartIso, isEventPassed } from "@/lib/eventDates";
import { Suspense } from "react";

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

function eventSortTime(event) {
  const raw = getEventStartIso(event) || getEventEndIso(event) || "";
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function sortEventsForDisplay(events) {
  const now = new Date();
  return [...events].sort((a, b) => {
    const aPast = isEventPassed(a, now);
    const bPast = isEventPassed(b, now);
    if (aPast !== bPast) return aPast ? 1 : -1;
    return eventSortTime(a) - eventSortTime(b);
  });
}

async function EventsPageContent() {
  const data = await fetchGraphQL(LIST_EVENTS_QUERY, {}, 1800, {
    edgeCache: true,
  });
  let events = extractEvents(data);
  if (events.length === 0) {
    const fallback = await fetchGraphQL(LIST_EVENTS_FALLBACK_QUERY, {}, 1800, {
      edgeCache: true,
    });
    events = extractEvents(fallback);
  }
  const sortedEvents = sortEventsForDisplay(events);

  return (
    <main className="max-w-4xl mx-auto px-6 py-24">
      <h1 className="text-4xl font-bold mb-10">Evenemang</h1>
      {sortedEvents.length === 0 ? (
        <p className="text-gray-600">Inga evenemang just nu.</p>
      ) : (
        <div className="space-y-6">
          {sortedEvents.map((event) => (
            <EventListItem key={event.id} post={event} />
          ))}
        </div>
      )}
    </main>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<StorefrontListSkeleton items={5} withImage />}>
      <EventsPageContent />
    </Suspense>
  );
}
