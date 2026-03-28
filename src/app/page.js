import { SinglePageFragment } from "@/lib/fragments/SinglePageFragment";
import Page from "@/components/single/Page";
import EventCalendar from "@/components/home/EventCalendar";
import { fetchGraphQL, RateLimitError } from "@/lib/client";
import { fetchHomeEvents } from "@/lib/homeEvents";
import RateLimitPage from "@/components/common/RateLimitPage";
import WordPressSetupPage from "@/components/setup/WordPressSetupPage";
import { notFound } from "next/navigation";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { probeStorefrontRagbazGraphql } from "@/lib/storefrontGraphqlProbe";
import { shouldSkipUpstreamDuringBuild } from "@/lib/buildUpstreamGuard";

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
  if (shouldSkipUpstreamDuringBuild()) {
    return <WordPressSetupPage />;
  }

  // If no WordPress host is configured (env var or cookie), show the setup page.
  // This also makes the build succeed without a live WordPress instance.
  const wpUrl = await resolveWordPressUrl();
  if (!wpUrl) {
    return <WordPressSetupPage />;
  }

  let data, events, hasDates;
  try {
    await probeStorefrontRagbazGraphql("/");
    [data, { events, hasDates }] = await Promise.all([
      fetchGraphQL(GET_CONTENT_QUERY, { uri: "/" }, 1800, { edgeCache: true }),
      fetchHomeEvents(),
    ]);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return (
        <RateLimitPage
          responseBody={err.responseBody}
          history={err.history}
          status={err.status}
        />
      );
    }
    throw err;
  }

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

// No static params — pages are rendered on-demand (ISR via revalidate in fetchGraphQL)
export async function generateStaticParams() {
  return [];
}
