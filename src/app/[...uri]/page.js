// Catch all template
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getSingleEventFragment } from "@/lib/fragments/SingleEventFragment";
import { getLpCourseFragment } from "@/lib/fragments/LpCourseFragment";
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
import { stripHtml } from "@/lib/slugify";
import site from "@/lib/site";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { decodeEntities } from "@/lib/decodeEntities";

// Force dynamic rendering — this route uses searchParams and external data
export const dynamic = "force-dynamic";

// See WPGraphQL docs on nodeByUri: https://www.wpgraphql.com/2021/12/23/query-any-page-by-its-path-using-wpgraphql

/** Build the content query dynamically based on which CPTs exist in the schema. */
async function buildContentQuery() {
  const [eventFragment, courseFragment] = await Promise.all([
    getSingleEventFragment(),
    getLpCourseFragment(),
  ]);
  const eventSpread = eventFragment ? "...SingleEventFragment" : "";
  const courseSpread = courseFragment ? "...LpCourseFragment" : "";

  return `
  ${eventFragment}
  ${courseFragment}
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
      ... on SimpleProduct {
        name
        price
        shortDescription
      }
      ... on VariableProduct {
        name
        price
        shortDescription
      }
      ... on ExternalProduct {
        name
        price
        shortDescription
      }
      ...SinglePageFragment
      ...SinglePostFragment
      ${eventSpread}
      ${courseSpread}
    }
  }
`;
}

// Cache the built query so introspection only runs once per process.
// If the promise rejects, clear it so the next request retries.
let _queryPromise = null;
function getContentQuery() {
  if (!_queryPromise) {
    _queryPromise = buildContentQuery().catch((err) => {
      _queryPromise = null;
      throw err;
    });
  }
  return _queryPromise;
}

async function fetchContent(uri) {
  const query = await getContentQuery();
  const data = await fetchGraphQL(query, { uri }, 1800);
  // WPGraphQL sometimes requires trailing slash — retry if first attempt found nothing
  if (!data?.nodeByUri && !uri.endsWith("/")) {
    return await fetchGraphQL(query, { uri: `${uri}/` }, 1800);
  }
  return data;
}

async function fetchRestFallback(uri) {
  const wp = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(/\/+$/, "");
  if (!wp) return null;
  const slug = uri.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const auth = getWordPressGraphqlAuth();
  const endpoints = [
    `${wp}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/event?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/events?slug=${encodeURIComponent(slug)}`,
  ];
  for (const url of endpoints) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(auth.authorization ? { Authorization: auth.authorization } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) continue;
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json) || json.length === 0) continue;
    const page = json[0];
    return {
      __typename: "Page",
      title: decodeEntities(page?.title?.rendered || ""),
      content: page?.content?.rendered || "",
      featuredImage: null,
    };
  }
  return null;
}

async function fetchCourseFallback(uri) {
  const fragment = await getLpCourseFragment();
  if (!fragment) return null;
  const slug = uri.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const wp = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(/\/+$/, "");
  const auth = getWordPressGraphqlAuth();
  const query = `
    ${fragment}
    query LpCourseByUri($uri: ID!) {
      lpCourse(id: $uri, idType: URI) {
        ...LpCourseFragment
      }
    }
  `;
  const data = await fetchGraphQL(query, { uri }, 1800);
  if (data?.lpCourse) return data.lpCourse;
  const dataBySlug = await fetchGraphQL(query, { uri: slug }, 1800);
  if (dataBySlug?.lpCourse) return dataBySlug.lpCourse;

  // REST fallback for LearnPress course
  if (!wp) return null;
  const res = await fetch(`${wp}/wp-json/wp/v2/lp_course?slug=${encodeURIComponent(slug)}`, {
    headers: {
      Accept: "application/json",
      ...(auth.authorization ? { Authorization: auth.authorization } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!Array.isArray(json) || json.length === 0) return null;
  const course = json[0];
  return {
    __typename: "LpCourse",
    title: decodeEntities(course?.title?.rendered || ""),
    content: course?.content?.rendered || "",
    uri: course?.link ? new URL(course.link).pathname : uri,
    featuredImage: null,
    priceRendered: "",
  };
}

function makeExcerpt(content, maxLen = 160) {
  const text = stripHtml(content);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, "") + "…";
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
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
  const type = node?.__typename;
  const title = node?.title || "";
  const description = node?.content ? makeExcerpt(node.content) : "";
  const image = node?.featuredImage?.node?.sourceUrl;
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
        url: site.url,
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
        url: site.url,
      },
    };
  }

  if (type === "Event") {
    const eventFields = node?.eventFields ?? {};
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: title,
      description,
      url,
      ...(image ? { image } : {}),
      ...(eventFields.date ? { startDate: eventFields.date } : {}),
      organizer: {
        "@type": "Organization",
        name: site.name,
        url: site.url,
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

export default async function ContentPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const uriSegments = Array.isArray(params?.uri) ? params.uri : [];
  const normalizedSegments = uriSegments
    .filter((segment) => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const uri =
    normalizedSegments.length > 0 ? `/${normalizedSegments.join("/")}` : "/";
  const data = await fetchContent(uri);

  let node = data?.nodeByUri;
  if (!node) node = await fetchRestFallback(uri);
  if (!node) node = await fetchCourseFallback(uri);
  if (!node) {
    console.warn("No nodeByUri data found, returning 404");
    notFound();
  }
  const contentType = node?.__typename;
  const isProductType =
    typeof contentType === "string" && contentType.includes("Product");
  const isCourseType =
    typeof contentType === "string" && contentType.includes("Course");
  const isEventType = contentType === "Event";
  const isPaidAccessType = isCourseType || isEventType || isProductType;

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
  if (isPaidAccessType) {
    const session = await auth();
    const userEmail = session?.user?.email || "";
    let canAccess = userEmail ? await hasCourseAccess(uri, userEmail) : false;
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
      const defaultPrice = process.env.DEFAULT_COURSE_FEE_CENTS
        ? Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS, 10)
        : undefined;
      const contentKind = isEventType ? "event" : isProductType ? "product" : "course";
      return (
        <Paywall
          courseUri={uri}
          courseTitle={node?.title || node?.name || ""}
          courseContent={node?.content || node?.shortDescription || ""}
          coursePriceRendered={node?.priceRendered || node?.price || ""}
          courseDuration={node?.duration || ""}
          courseImage={node?.featuredImage?.node?.sourceUrl || ""}
          userEmail={userEmail}
          priceCents={accessConfig?.priceCents ?? (Number.isFinite(defaultPrice) ? defaultPrice : undefined)}
          currency={accessConfig?.currency || process.env.DEFAULT_COURSE_FEE_CURRENCY || site.defaultCurrency || "SEK"}
          stripeEnabled={isStripeEnabled()}
          contentKind={contentKind}
        />
      );
    }
    if (isProductType) return <>{ldScript}<Product data={node} /></>;
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
