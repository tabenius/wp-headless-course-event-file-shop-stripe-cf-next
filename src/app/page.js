import { SinglePageFragment } from "@/lib/fragments/SinglePageFragment";
import Page from "@/components/single/Page";
import EventCalendar from "@/components/home/EventCalendar";
import { fetchGraphQL, RateLimitError } from "@/lib/client";
import { fetchHomeEvents } from "@/lib/homeEvents";
import RateLimitPage from "@/components/common/RateLimitPage";
import {
  StorefrontArticleSkeleton,
  StorefrontListSkeleton,
} from "@/components/common/StorefrontSkeletons";
import WordPressSetupPage from "@/components/setup/WordPressSetupPage";
import { notFound } from "next/navigation";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { probeStorefrontRagbazGraphql } from "@/lib/storefrontGraphqlProbe";
import { shouldSkipUpstreamDuringBuild } from "@/lib/buildUpstreamGuard";
import { Suspense } from "react";

const GET_CONTENT_QUERY = `
${SinglePageFragment}
query GetNodeByUri($uri: String!) {
  nodeByUri(uri: $uri) {
    __typename
    ...SinglePageFragment
  }
}
`;
const log = (...args) => {
  // Console output is streamed by wrangler tail in production.
  console.error("[app/page]", ...args);
};

export default async function HomePage() {
  log("before WordPressSetupPage");
  if (shouldSkipUpstreamDuringBuild()) {
    return <WordPressSetupPage />;
  }

  // If no WordPress host is configured (env var or cookie), show the setup page.
  // This also makes the build succeed without a live WordPress instance.
  const wpUrl = await resolveWordPressUrl();
  if (!wpUrl) {
    return <WordPressSetupPage />;
  }
  log("past WordPressSetupPage");

  return (
    <>
      <Suspense
        fallback={<StorefrontListSkeleton items={2} withImage={true} />}
      >
        <HomeEventsSection />
      </Suspense>
      <Suspense fallback={<StorefrontArticleSkeleton paragraphs={9} />}>
        <HomeContentSection />
      </Suspense>
    </>
  );
}

async function HomeEventsSection() {
  try {
    const { events, hasDates } = await fetchHomeEvents();
    if (!events.length) return null;
    return <EventCalendar events={events} hasDates={hasDates} />;
  } catch {
    return null;
  }
}

async function HomeContentSection() {
  let data;
  try {
    await probeStorefrontRagbazGraphql("/");
    data = await fetchGraphQL(GET_CONTENT_QUERY, { uri: "/" }, 1800, {
      edgeCache: true,
    });
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
    const reason = err?.message || String(err) || "Unknown error";
    console.error("[HomePage] Content fetch failed:", reason);
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center space-y-4">
        <p className="text-5xl">⚠️</p>
        <h1 className="text-2xl font-semibold text-gray-800">
          This site is temporarily unavailable
        </h1>
        <p className="text-gray-500 max-w-md">
          The content server could not be reached. This is usually a temporary
          issue — please try again in a moment.
        </p>
        <p className="text-xs text-gray-400 font-mono">{reason}</p>
      </div>
    );
  }

  if (!data?.nodeByUri) {
    console.warn("No nodeByUri data found, returning 404");
    notFound();
  }

  const contentType = data?.nodeByUri?.__typename;
  if (contentType === "Page") {
    return <Page data={data.nodeByUri} />;
  }
  notFound();
}

// No static params — pages are rendered on-demand (ISR via revalidate in fetchGraphQL)
export async function generateStaticParams() {
  return [];
}
