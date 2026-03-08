// Catch all template
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { SingleEventFragment } from "@/lib/fragments/SingleEventFragment";
import { LpCourseFragment } from "@/lib/fragments/LpCourseFragment";
import { SinglePageFragment } from "@/lib/fragments/SinglePageFragment";
import { SinglePostFragment } from "@/lib/fragments/SinglePostFragment";
import Page from "@/components/single/Page";
import Post from "@/components/single/Post";
import Event from "@/components/single/Event";
import Product from "@/components/single/Product";
import Course from "@/components/single/Course";
import Paywall from "@/components/single/Paywall";
import { fetchGraphQL } from "@/lib/client";
import { auth } from "@/auth";
import {
  getCourseAccessConfig,
  grantCourseAccess,
  hasCourseAccess,
} from "@/lib/courseAccess";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import site from "@/lib/site";

// See WPGraphQL docs on nodeByUri: https://www.wpgraphql.com/2021/12/23/query-any-page-by-its-path-using-wpgraphql
// SingleEventFragment is only included when the Event CPT is registered
const eventFragmentDef = SingleEventFragment ? SingleEventFragment : "";
const eventFragmentSpread = SingleEventFragment ? "...SingleEventFragment" : "";
const courseFragmentDef = LpCourseFragment ? LpCourseFragment : "";
const courseFragmentSpread = LpCourseFragment ? "...LpCourseFragment" : "";
const GET_CONTENT_QUERY = `
  ${eventFragmentDef}
  ${courseFragmentDef}
  ${SinglePageFragment}
  ${SinglePostFragment}
  query GetNodeByUri($uri: String!) {
    nodeByUri(uri: $uri) {
      __typename
      ... on NodeWithTitle {
        title
      }
      ... on NodeWithContentEditor {
        content
      }
      ... on ContentNode {
        id
        uri
      }
      ... on NodeWithFeaturedImage {
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
      ...SinglePageFragment
      ...SinglePostFragment
      ${eventFragmentSpread}
      ${courseFragmentSpread}
    }
  }
`;

async function fetchContent(uri) {
  return await fetchGraphQL(
    GET_CONTENT_QUERY,
    {
      uri: uri,
    },
    3600, // Caches for 60 minutes
  );
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function makeExcerpt(content, maxLen = 160) {
  const text = stripHtml(content);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, "") + "…";
}

export async function generateMetadata({ params }) {
  const uriSegments = Array.isArray(params?.uri) ? params.uri : [];
  const uri =
    uriSegments.length > 0
      ? `/${uriSegments.filter(Boolean).join("/")}`
      : "/";
  const data = await fetchContent(uri);
  const node = data?.nodeByUri;
  if (!node) return {};

  const title = node.title || undefined;
  const description = node.excerpt
    ? makeExcerpt(node.excerpt)
    : node.content
      ? makeExcerpt(node.content)
      : undefined;
  const image = node.featuredImage?.node?.sourceUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${site.url}${uri}`,
      type: node.__typename === "Post" ? "article" : "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
    },
    alternates: {
      canonical: `${site.url}${uri}`,
    },
  };
}

function buildJsonLd(node, uri) {
  const type = node.__typename;
  const title = node.title || "";
  const description = node.content ? makeExcerpt(node.content) : "";
  const image = node.featuredImage?.node?.sourceUrl;
  const url = `${site.url}${uri}`;

  if (type === "Post") {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      url,
      ...(image ? { image } : {}),
      publisher: {
        "@type": "Organization",
        name: site.name,
        url: siteUrl,
      },
    };
  }

  if (type === "LpCourse") {
    return {
      "@context": "https://schema.org",
      "@type": "Course",
      name: title,
      description,
      url,
      ...(image ? { image } : {}),
      provider: {
        "@type": "Organization",
        name: site.name,
        url: siteUrl,
      },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    ...(image ? { image } : {}),
  };
}

export default async function ContentPage({ params, searchParams }) {
  const uriSegments = Array.isArray(params?.uri) ? params.uri : [];
  const normalizedSegments = uriSegments
    .filter((segment) => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const uri =
    normalizedSegments.length > 0 ? `/${normalizedSegments.join("/")}` : "/";
  const data = await fetchContent(uri);

  if (!data?.nodeByUri) {
    console.warn("No nodeByUri data found, returning 404");
    notFound();
  }

  const node = data.nodeByUri;
  const contentType = node?.__typename;
  const isProductType =
    typeof contentType === "string" && contentType.includes("Product");
  const isCourseType =
    typeof contentType === "string" && contentType.includes("Course");
  const isEventType = contentType === "Event";
  const isPaidAccessType = isCourseType || isEventType;

  const jsonLd = buildJsonLd(node, uri);
  const ldScript = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );

  // Add your own CPT templates here for single post types
  if (contentType === "Post") return <>{ldScript}<Post data={node} /></>;
  if (contentType === "Page") return <>{ldScript}<Page data={node} /></>;
  if (isProductType) return <>{ldScript}<Product data={node} /></>;
  if (isPaidAccessType) {
    const session = await auth();
    if (!session?.user) {
      redirect(`/auth/signin?callbackUrl=${encodeURIComponent(uri)}`);
    }

    const userEmail = session.user.email || "";
    let canAccess = await hasCourseAccess(uri, userEmail);
    const checkoutStatus =
      typeof searchParams?.checkout === "string" ? searchParams.checkout : "";
    const checkoutSessionId =
      typeof searchParams?.session_id === "string" ? searchParams.session_id : "";

    if (!canAccess && checkoutStatus === "success" && checkoutSessionId) {
      try {
        const stripeSession = await fetchStripeCheckoutSession(checkoutSessionId);
        const paymentStatus = stripeSession?.payment_status;
        const paidEmail = (
          stripeSession?.customer_details?.email ||
          stripeSession?.metadata?.user_email ||
          ""
        ).toLowerCase();
        const paidCourse = stripeSession?.metadata?.course_uri || "";
        if (
          paymentStatus === "paid" &&
          paidEmail === userEmail.toLowerCase() &&
          paidCourse === uri
        ) {
          await grantCourseAccess(uri, userEmail);
          canAccess = true;
        }
      } catch (error) {
        console.error("Failed to confirm Stripe checkout session:", error);
      }
    }

    if (!canAccess) {
      const accessConfig = await getCourseAccessConfig(uri);
      const defaultPrice = Number.parseInt(
        process.env.DEFAULT_COURSE_FEE_CENTS || "0",
        10,
      );
      return (
        <Paywall
          courseUri={uri}
          courseTitle={node?.title}
          userEmail={userEmail}
          priceCents={accessConfig?.priceCents ?? (Number.isFinite(defaultPrice) ? defaultPrice : 0)}
          currency={accessConfig?.currency || process.env.DEFAULT_COURSE_FEE_CURRENCY || "usd"}
          stripeEnabled={isStripeEnabled()}
          contentKind={isEventType ? "event" : "course"}
        />
      );
    }
    return isEventType
      ? <>{ldScript}<Event data={node} /></>
      : <>{ldScript}<Course data={node} /></>;
  }
  notFound();
}

// Note: We could generate static params for the pages you want to pre-render (optional) for things like popular posts etc
export async function generateStaticParams() {
  return [];
}
