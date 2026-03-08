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

  const contentType = data?.nodeByUri?.__typename;
  const isProductType =
    typeof contentType === "string" && contentType.includes("Product");
  const isCourseType =
    typeof contentType === "string" && contentType.includes("Course");
  const isEventType = contentType === "Event";
  const isPaidAccessType = isCourseType || isEventType;

  // Add your own CPT templates here for single post types
  if (contentType === "Post") return <Post data={data.nodeByUri} />;
  if (contentType === "Page") return <Page data={data.nodeByUri} />;
  if (isProductType) return <Product data={data.nodeByUri} />;
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
          courseTitle={data?.nodeByUri?.title}
          userEmail={userEmail}
          priceCents={accessConfig?.priceCents ?? (Number.isFinite(defaultPrice) ? defaultPrice : 0)}
          currency={accessConfig?.currency || process.env.DEFAULT_COURSE_FEE_CURRENCY || "usd"}
          stripeEnabled={isStripeEnabled()}
          contentKind={isEventType ? "event" : "course"}
        />
      );
    }
    return isEventType ? <Event data={data.nodeByUri} /> : <Course data={data.nodeByUri} />;
  }
  notFound();
}

// Note: We could generate static params for the pages you want to pre-render (optional) for things like popular posts etc
export async function generateStaticParams() {
  return [];
}
