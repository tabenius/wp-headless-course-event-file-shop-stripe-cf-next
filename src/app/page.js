import { notFound } from "next/navigation";
import { SinglePageFragment } from "@/lib/fragments/SinglePageFragment";
import Page from "@/components/single/Page";
import EventCalendar from "@/components/home/EventCalendar";
import { fetchGraphQL } from "@/lib/client";
import { fetchHomeEvents } from "@/lib/homeEvents";

const GET_CONTENT_QUERY = `
${SinglePageFragment}
query GetNodeByUri($uri: String!) {
  nodeByUri(uri: $uri) {
    __typename
    ...SinglePageFragment
  }
}
`;

export default async function HomePage() {
  const [data, { events, hasDates }] = await Promise.all([
    fetchGraphQL(GET_CONTENT_QUERY, { uri: "/" }, 1800),
    fetchHomeEvents(),
  ]);

  if (!data?.nodeByUri) {
    console.warn("No nodeByUri data found, returning 404");
    notFound();
  }

  const contentType = data?.nodeByUri?.__typename;
  if (contentType === "Page") {
    return (
      <>
        {events.length > 0 && (
          <EventCalendar events={events} hasDates={hasDates} />
        )}
        <Page data={data.nodeByUri} />
      </>
    );
  }
  notFound();
}

// Note: We could generate static params for the pages you want to pre-render (optional) for things like popular posts etc
export async function generateStaticParams() {
  return [];
}
