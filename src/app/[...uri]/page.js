// Catch all template
import { notFound } from "next/navigation";
import { getSingleEventFragment } from "@/lib/fragments/SingleEventFragment";
import { getLpCourseFragment } from "@/lib/fragments/LpCourseFragment";
import { SinglePageFragment } from "@/lib/fragments/SinglePageFragment";
import { SinglePostFragment } from "@/lib/fragments/SinglePostFragment";
import Post from "@/components/single/Post";
import Event from "@/components/single/Event";
import Product from "@/components/single/Product";
import Course from "@/components/single/Course";
import Paywall from "@/components/single/Paywall";
import { fetchGraphQL, RateLimitError } from "@/lib/client";
import RateLimitPage from "@/components/common/RateLimitPage";
import { auth } from "@/auth";
import {
  getContentAccessConfig,
  grantContentAccess,
  hasContentAccess,
} from "@/lib/contentAccess";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { stripHtml } from "@/lib/slugify";
import site from "@/lib/site";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { decodeEntities } from "@/lib/decodeEntities";
import { parsePriceCents } from "@/lib/parsePrice";
import { t } from "@/lib/i18n";
import { appendServerLog } from "@/lib/serverLog";
import { hashLogEmail } from "@/lib/logIdentity";
import { withWordPressUserAgent } from "@/lib/wordpressUserAgent";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { probeStorefrontRagbazGraphql } from "@/lib/storefrontGraphqlProbe";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { cache, Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { StorefrontArticleSkeleton } from "@/components/common/StorefrontSkeletons";
import { transformContent } from "@/lib/transformContent";
import ContactFormHydrator from "@/components/forms/ContactFormHydrator";
const DEBUG_WP_RESOLVE = process.env.STOREFRONT_RESOLVE_DEBUG === "1";
const DEBUG_METADATA = process.env.STOREFRONT_METADATA_DEBUG === "1";
const DETAIL_EDGE_CACHE_TTL_SECONDS =
  Number.parseInt(process.env.STOREFRONT_DETAIL_EDGE_CACHE_TTL_SECONDS || "300", 10) ||
  300;
const DETAIL_EDGE_CACHE_STALE_SECONDS =
  Number.parseInt(
    process.env.STOREFRONT_DETAIL_EDGE_CACHE_STALE_SECONDS || "900",
    10,
  ) || 900;

// See WPGraphQL docs on nodeByUri: https://www.wpgraphql.com/2021/12/23/query-any-page-by-its-path-using-wpgraphql

const RESOLVE_NODE_TYPE_QUERY = `
  query ResolveNodeByUriType($uri: String!) {
    nodeByUri(uri: $uri) {
      __typename
      ... on ContentNode {
        id
        uri
      }
    }
  }
`;

const COMMON_NODE_FIELDS = `
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
    priceText: price
    shortDescription
  }
  ... on VariableProduct {
    name
    priceText: price
    shortDescription
  }
  ... on ExternalProduct {
    name
    priceText: price
    shortDescription
  }
`;

const typedQueryPromiseByType = new Map();

async function buildTypedContentQuery(typeName) {
  const safeType = String(typeName || "").trim();
  let fragments = "";
  let spread = "";

  if (safeType === "Page") {
    fragments = SinglePageFragment;
    spread = "...SinglePageFragment";
  } else if (safeType === "Post") {
    fragments = SinglePostFragment;
    spread = "...SinglePostFragment";
  } else if (safeType === "Event") {
    const eventFragment = await getSingleEventFragment();
    fragments = eventFragment || "";
    spread = eventFragment ? "...SingleEventFragment" : "";
  } else if (safeType === "LpCourse") {
    const courseFragment = await getLpCourseFragment();
    fragments = courseFragment || "";
    spread = courseFragment ? "...LpCourseFragment" : "";
  }

  const queryNameSuffix = safeType.replace(/[^A-Za-z0-9_]/g, "_") || "Node";
  return `
    ${fragments}
    query GetNodeByUri_${queryNameSuffix}($uri: String!) {
      nodeByUri(uri: $uri) {
        ${COMMON_NODE_FIELDS}
        ${spread}
      }
    }
  `;
}

function getTypedContentQuery(typeName) {
  const key = String(typeName || "").trim() || "Node";
  if (!typedQueryPromiseByType.has(key)) {
    const promise = buildTypedContentQuery(key).catch((error) => {
      typedQueryPromiseByType.delete(key);
      throw error;
    });
    typedQueryPromiseByType.set(key, promise);
  }
  return typedQueryPromiseByType.get(key);
}

function normalizeUriForLookup(uri) {
  const raw = typeof uri === "string" ? uri.trim() : "";
  if (!raw || raw === "/") return "/";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const ensuredLeading = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = ensuredLeading.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

function buildUriLookupAttempts(uri) {
  const normalized = normalizeUriForLookup(uri);
  if (normalized === "/") return ["/"];
  return [normalized, `${normalized}/`];
}

function safePathnameFromUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    return new URL(raw).pathname || "";
  } catch {
    return raw;
  }
}

function isMatchingRequestedUri(requestedUri, candidateUri) {
  const requested = normalizeUriForLookup(requestedUri);
  const candidate = normalizeUriForLookup(candidateUri);
  return requested === candidate;
}

function isLikelyCourseUri(uri) {
  const normalized = normalizeUriForLookup(uri);
  return normalized.startsWith("/courses/") && normalized !== "/courses";
}

function isLikelyEventUri(uri) {
  const normalized = normalizeUriForLookup(uri);
  return (
    normalized.startsWith("/events/event/") ||
    normalized.startsWith("/event/")
  );
}

function isLikelyProductUri(uri) {
  const normalized = normalizeUriForLookup(uri);
  return (
    normalized.startsWith("/product/") ||
    normalized.startsWith("/produkt/")
  );
}

function isLikelyBlogUri(uri) {
  const normalized = normalizeUriForLookup(uri);
  return normalized.startsWith("/blog/") && normalized !== "/blog";
}

async function fetchDirectEventNode(uri) {
  const data = await fetchTypedContent(uri, "Event");
  return data?.nodeByUri?.__typename === "Event" ? data.nodeByUri : null;
}

async function fetchDirectProductNode(uri) {
  const data = await fetchTypedContent(uri, "Product");
  return typeof data?.nodeByUri?.__typename === "string" &&
    data.nodeByUri.__typename.includes("Product")
    ? data.nodeByUri
    : null;
}

async function fetchDirectPostNode(uri) {
  const data = await fetchTypedContent(uri, "Post");
  return data?.nodeByUri?.__typename === "Post" ? data.nodeByUri : null;
}

async function fetchNodeType(uri) {
  const attempts = buildUriLookupAttempts(uri);
  let lastData = null;
  let lastError = null;

  for (const candidateUri of attempts) {
    try {
      const data = await fetchGraphQL(
        RESOLVE_NODE_TYPE_QUERY,
        { uri: candidateUri },
        1800,
        {
          edgeCache: true,
          edgeCacheTtlSeconds: DETAIL_EDGE_CACHE_TTL_SECONDS,
          edgeCacheStaleSeconds: DETAIL_EDGE_CACHE_STALE_SECONDS,
        },
      );
      lastData = data;
      if (data?.nodeByUri?.__typename) {
        return {
          nodeByUri: data.nodeByUri,
          resolvedUri: candidateUri,
        };
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw err;
      }
      lastError = err;
      appendServerLog({
        level: "warn",
        msg: `WPGraphQL type lookup failed for ${candidateUri}: ${err?.message || err}`,
        persist: false,
      }).catch(() => {});
    }
  }

  if (!lastData?.nodeByUri?.__typename) {
    const detail = lastError
      ? ` (last error: ${lastError.message || lastError})`
      : "";
    appendServerLog({
      level: "info",
      msg: `WPGraphQL nodeByUri type resolution returned null for: ${normalizeUriForLookup(uri)}${detail}`,
      persist: false,
    }).catch(() => {});
  }

  return lastData || {};
}

async function fetchTypedContent(uri, nodeType) {
  const query = await getTypedContentQuery(nodeType);
  const attempts = buildUriLookupAttempts(uri);

  for (const candidateUri of attempts) {
    try {
      const data = await fetchGraphQL(query, { uri: candidateUri }, 1800, {
        edgeCache: true,
        edgeCacheTtlSeconds: DETAIL_EDGE_CACHE_TTL_SECONDS,
        edgeCacheStaleSeconds: DETAIL_EDGE_CACHE_STALE_SECONDS,
      });
      if (data?.nodeByUri) return data;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      appendServerLog({
        level: "warn",
        msg: `WPGraphQL typed lookup failed for ${candidateUri} (${nodeType}): ${err?.message || err}`,
        persist: false,
      }).catch(() => {});
    }
  }
  return {};
}

/**
 * Enhanced Resolver with Parallel Fallbacks
 */
const resolveNodeByUri = cache(async function resolveNodeByUri(uri) {
  const normalizedUri = normalizeUriForLookup(uri);
  if (DEBUG_WP_RESOLVE) {
    console.log(`[WP-Resolve] Attempting to resolve: ${normalizedUri}`);
  }

  const wordpressUrl = await resolveWordPressUrl();

  if (isLikelyCourseUri(normalizedUri)) {
    try {
      const directCourseNode = await fetchCourseFallback(
        normalizedUri,
        wordpressUrl,
      );
      if (directCourseNode) {
        if (DEBUG_WP_RESOLVE) {
          console.log(
            `[WP-Resolve] Fast course path succeeded for ${normalizedUri}`,
          );
        }
        return directCourseNode;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw err;
      }
      if (DEBUG_WP_RESOLVE) {
        console.error(
          `[WP-Resolve] Fast course path failed for ${normalizedUri}:`,
          err?.message || err,
        );
      }
    }
  }

  if (isLikelyEventUri(normalizedUri)) {
    try {
      const directEventNode = await fetchDirectEventNode(normalizedUri);
      if (directEventNode) {
        if (DEBUG_WP_RESOLVE) {
          console.log(
            `[WP-Resolve] Fast event path succeeded for ${normalizedUri}`,
          );
        }
        return directEventNode;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw err;
      }
      if (DEBUG_WP_RESOLVE) {
        console.error(
          `[WP-Resolve] Fast event path failed for ${normalizedUri}:`,
          err?.message || err,
        );
      }
    }
  }

  if (isLikelyProductUri(normalizedUri)) {
    try {
      const directProductNode = await fetchDirectProductNode(normalizedUri);
      if (directProductNode) {
        if (DEBUG_WP_RESOLVE) {
          console.log(
            `[WP-Resolve] Fast product path succeeded for ${normalizedUri}`,
          );
        }
        return directProductNode;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw err;
      }
      if (DEBUG_WP_RESOLVE) {
        console.error(
          `[WP-Resolve] Fast product path failed for ${normalizedUri}:`,
          err?.message || err,
        );
      }
    }
  }

  if (isLikelyBlogUri(normalizedUri)) {
    try {
      const directPostNode = await fetchDirectPostNode(normalizedUri);
      if (directPostNode) {
        if (DEBUG_WP_RESOLVE) {
          console.log(
            `[WP-Resolve] Fast blog path succeeded for ${normalizedUri}`,
          );
        }
        return directPostNode;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw err;
      }
      if (DEBUG_WP_RESOLVE) {
        console.error(
          `[WP-Resolve] Fast blog path failed for ${normalizedUri}:`,
          err?.message || err,
        );
      }
    }
  }

  try {
    await probeStorefrontRagbazGraphql(normalizedUri);
    const typeData = await fetchNodeType(normalizedUri);
    const resolvedType = typeData?.nodeByUri?.__typename || "";
    if (resolvedType) {
      const resolvedUri = typeData?.resolvedUri || normalizedUri;
      const data = await fetchTypedContent(resolvedUri, resolvedType);
      if (data?.nodeByUri) {
        if (DEBUG_WP_RESOLVE) {
          console.log(
            `[WP-Resolve] Success: Found ${data.nodeByUri.__typename} for ${normalizedUri}`,
          );
        }
        return data.nodeByUri;
      }
    }
    if (typeData?.nodeByUri) {
      if (DEBUG_WP_RESOLVE) {
        console.log(
          `[WP-Resolve] Type resolved but typed fetch empty for ${normalizedUri}: ${resolvedType}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw err;
    }
    if (DEBUG_WP_RESOLVE) {
      console.error(
        `[WP-Resolve] GraphQL Error for ${normalizedUri}:`,
        err?.message || err,
      );
    }
  }

  // If GraphQL fails, try REST and Course fallbacks
  if (DEBUG_WP_RESOLVE) {
    console.log(
      `[WP-Resolve] GraphQL failed for ${normalizedUri}. Entering Fallback mode...`,
    );
  }

  const [restNode, courseNode] = await Promise.all([
    fetchRestFallback(normalizedUri, wordpressUrl).catch((e) => {
      if (e instanceof RateLimitError) throw e;
      if (DEBUG_WP_RESOLVE) {
        console.error("[WP-Resolve] REST Fallback error:", e?.message || e);
      }
      return null;
    }),
    fetchCourseFallback(normalizedUri, wordpressUrl).catch((e) => {
      if (e instanceof RateLimitError) throw e;
      if (DEBUG_WP_RESOLVE) {
        console.error("[WP-Resolve] Course Fallback error:", e?.message || e);
      }
      return null;
    }),
  ]);

  const finalResult = restNode || courseNode;
  if (!finalResult && DEBUG_WP_RESOLVE) {
    console.warn(
      `[WP-Resolve] 404: No data found for ${normalizedUri} in GraphQL or REST.`,
    );
  }

  return finalResult;
});

async function fetchRestFallback(uri, wordpressUrl = null) {
  const wp =
    typeof wordpressUrl === "string" && wordpressUrl.trim()
      ? wordpressUrl.trim().replace(/\/+$/, "")
      : "";
  if (!wp) return null;
  const slug = uri.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const auth = await getWordPressGraphqlAuth();
  const endpoints = [
    `${wp}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/event?slug=${encodeURIComponent(slug)}`,
    `${wp}/wp-json/wp/v2/events?slug=${encodeURIComponent(slug)}`,
  ];
  for (const url of endpoints) {
    let res;
    try {
      res = await fetch(url, {
        headers: withWordPressUserAgent({
          Accept: "application/json",
          ...(auth.authorization ? { Authorization: auth.authorization } : {}),
        }),
        cache: "force-cache",
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      appendServerLog({
        level: "warn",
        msg: `REST fallback fetch failed for ${uri} (${url}): ${err?.message || err}`,
        persist: false,
      }).catch(() => {});
      continue;
    }
    if (!res.ok) continue;
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json) || json.length === 0) continue;
    const page = json.find((entry) => {
      const candidateUri = entry?.uri || safePathnameFromUrl(entry?.link || "");
      if (!candidateUri) return false;
      return isMatchingRequestedUri(uri, candidateUri);
    });
    if (!page) continue;
    return {
      __typename: "Page",
      title: decodeEntities(page?.title?.rendered || ""),
      content: decodeEntities(page?.content?.rendered || ""),
      featuredImage: null,
    };
  }
  return null;
}

async function fetchCourseFallback(uri, wordpressUrl = null) {
  const fragment = await getLpCourseFragment();
  if (!fragment) return null;
  const slug = uri.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const wp =
    typeof wordpressUrl === "string" && wordpressUrl.trim()
      ? wordpressUrl.trim().replace(/\/+$/, "")
      : "";
  const auth = await getWordPressGraphqlAuth();
  const query = `
    ${fragment}
    query LpCourseByUri($uri: ID!) {
      lpCourse(id: $uri, idType: URI) {
        ...LpCourseFragment
      }
    }
  `;
  const data = await fetchGraphQL(query, { uri }, 1800, {
    edgeCache: true,
    edgeCacheTtlSeconds: DETAIL_EDGE_CACHE_TTL_SECONDS,
    edgeCacheStaleSeconds: DETAIL_EDGE_CACHE_STALE_SECONDS,
  });
  if (data?.lpCourse) return data.lpCourse;

  // REST fallback for LearnPress course
  if (!wp) return null;
  let res;
  try {
    res = await fetch(
      `${wp}/wp-json/wp/v2/lp_course?slug=${encodeURIComponent(slug)}`,
      {
        headers: withWordPressUserAgent({
          Accept: "application/json",
          ...(auth.authorization ? { Authorization: auth.authorization } : {}),
        }),
        cache: "force-cache",
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch (err) {
    appendServerLog({
      level: "warn",
      msg: `Course REST fallback failed for ${uri}: ${err?.message || err}`,
      persist: false,
    }).catch(() => {});
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!Array.isArray(json) || json.length === 0) return null;
  const course = json.find((entry) => {
    const candidateUri = entry?.uri || safePathnameFromUrl(entry?.link || "");
    if (!candidateUri) return false;
    return isMatchingRequestedUri(uri, candidateUri);
  });
  if (!course) return null;
  return {
    __typename: "LpCourse",
    title: decodeEntities(course?.title?.rendered || ""),
    content: decodeEntities(course?.content?.rendered || ""),
    uri: safePathnameFromUrl(course?.link) || uri,
    featuredImage: null,
    priceRendered: "",
  };
}
function makeExcerpt(content, maxLen = 160) {
  const text = stripHtml(content);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, "") + "…";
}

function safeAbsoluteUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
}

function safeCanonicalUrl(uri) {
  const base = safeAbsoluteUrl(site.url);
  if (!base) return "";
  try {
    return new URL(uri, base).toString();
  } catch {
    return "";
  }
}

function formatAccessPriceLabel(priceCents, currency) {
  if (!(typeof priceCents === "number" && Number.isFinite(priceCents) && priceCents > 0)) {
    return "";
  }
  return `${(priceCents / 100).toFixed(0)} ${String(currency || "SEK").toUpperCase()}`;
}

function normalizeContentUri(value) {
  const safe = typeof value === "string" ? value.trim() : "";
  if (!safe) return "";
  const withLeadingSlash = safe.startsWith("/") ? safe : `/${safe}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

const getLinkedBuyableByContentUri = cache(async (contentUri) => {
  const normalizedUri = normalizeContentUri(contentUri);
  if (!normalizedUri) return null;

  const products = await listDigitalProducts({ includeInactive: true }).catch(
    () => [],
  );
  return (
    products.find((product) => {
      if (!product || product.active === false) return false;
      if (product.productMode !== "manual_uri") return false;
      return normalizeContentUri(product.contentUri) === normalizedUri;
    }) || null
  );
});

export async function generateMetadata({ params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const uriSegments = Array.isArray(params?.uri) ? params.uri : [];
    const uri =
      uriSegments.length > 0
        ? `/${uriSegments.filter(Boolean).join("/")}`
        : "/";
    const node = await resolveNodeByUri(uri);
    if (!node) return {};

    const title = node.title || undefined;
    const description = node.excerpt
      ? makeExcerpt(node.excerpt)
      : node.content
        ? makeExcerpt(node.content)
        : undefined;
    const image = safeAbsoluteUrl(node.featuredImage?.node?.sourceUrl);
    const canonical = safeCanonicalUrl(uri);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        ...(canonical ? { url: canonical } : {}),
        type: node.__typename === "Post" ? "article" : "website",
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        card: image ? "summary_large_image" : "summary",
        title,
        description,
      },
      alternates: canonical
        ? {
            canonical,
          }
        : undefined,
    };
  } catch (err) {
    if (DEBUG_METADATA) {
      console.error("[Metadata] Failed to build metadata:", err?.message || err);
    }
    return {};
  }
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

async function ContentPageInner({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}) {
  const params = await paramsPromise;
  const uriSegments = Array.isArray(params?.uri) ? params.uri : [];
  const normalizedSegments = uriSegments
    .filter((segment) => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const uri =
    normalizedSegments.length > 0 ? `/${normalizedSegments.join("/")}` : "/";
  let node;
  try {
    node = await resolveNodeByUri(uri);
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
  if (!node) {
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
  if (contentType === "Post")
    return (
      <>
        {ldScript}
        <Post data={node} />
      </>
    );
  if (contentType === "Page")
    return (
      <>
        {ldScript}
        <article className="max-w-2xl px-6 py-24 mx-auto space-y-8">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            {decodeEntities(node?.title || "")}
          </h1>
          <div
            className="text-gray-800 prose prose-p:my-4 max-w-none wp-content text-xl"
            dangerouslySetInnerHTML={{
              __html: transformContent(node?.content || ""),
            }}
          />
        </article>
        <ContactFormHydrator />
      </>
    );
  if (isPaidAccessType) {
    // Paid access depends on session identity and checkout query params.
    // Keep these responses request-bound to avoid leaking user-specific state.
    noStore();
    const session = await auth().catch(() => null);
    const userEmail = session?.user?.email || "";
    let canAccess = false;
    let accessCheckFailed = false;
    if (userEmail) {
      try {
        canAccess = await hasContentAccess(uri, userEmail);
      } catch (err) {
        accessCheckFailed = true;
        appendServerLog({
          level: "error",
          msg: `hasCourseAccess failed uri=${uri} userHash=${(await hashLogEmail(userEmail)) || "<anon>"} err=${err?.message || err}`,
          persist: false,
        }).catch(() => {});
      }
    }
    const searchParams = await searchParamsPromise;
    const checkoutStatus =
      typeof searchParams?.checkout === "string" ? searchParams.checkout : "";
    const checkoutSessionId =
      typeof searchParams?.session_id === "string"
        ? searchParams.session_id
        : "";

    if (!canAccess && checkoutStatus === "success" && checkoutSessionId) {
      try {
        const stripeSession =
          await fetchStripeCheckoutSession(checkoutSessionId);
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
          await grantContentAccess(uri, userEmail);
          canAccess = true;
        }
      } catch (error) {
        console.error("Failed to confirm Stripe checkout session:", error);
      }
    }

    const accessConfig = await getContentAccessConfig(uri).catch(() => null);
    const linkedBuyable = isEventType
      ? await getLinkedBuyableByContentUri(uri).catch(() => null)
      : null;

    if (!canAccess) {
      if (accessConfig?.active === false) {
        notFound();
      }
      const wpPriceCents = parsePriceCents(
        node?.priceRendered || node?.priceText || node?.price || "",
      );
      const defaultPrice = process.env.DEFAULT_COURSE_FEE_CENTS
        ? Number.parseInt(process.env.DEFAULT_COURSE_FEE_CENTS, 10)
        : undefined;
      const contentKind = isEventType
        ? "event"
        : isProductType
          ? "product"
          : "course";
      return (
        <Paywall
          courseUri={uri}
          courseTitle={node?.title || node?.name || ""}
          courseContent={node?.content || node?.shortDescription || ""}
          coursePriceRendered={
            node?.priceRendered || node?.priceText || node?.price || ""
          }
          courseDuration={node?.duration || ""}
          courseImage={node?.featuredImage?.node?.sourceUrl || ""}
          userEmail={userEmail}
          priceCents={
            (typeof accessConfig?.priceCents === "number" &&
            accessConfig.priceCents > 0
              ? accessConfig.priceCents
              : wpPriceCents > 0
                ? wpPriceCents
                : undefined) ??
            (Number.isFinite(defaultPrice) ? defaultPrice : undefined)
          }
          currency={
            accessConfig?.currency ||
            process.env.DEFAULT_CURRENCY ||
            process.env.DEFAULT_COURSE_FEE_CURRENCY ||
            site.defaultCurrency ||
            "SEK"
          }
          stripeEnabled={isStripeEnabled()}
          contentKind={contentKind}
          accessCheckFailed={accessCheckFailed && Boolean(userEmail)}
        />
      );
    }
    if (isProductType)
      return (
        <>
          {ldScript}
          <Product
            data={node}
            footer={
              (() => {
                const wpPriceCents = parsePriceCents(
                  node?.priceRendered || node?.priceText || node?.price || "",
                );
                const displayPrice = formatAccessPriceLabel(
                  typeof accessConfig?.priceCents === "number" &&
                    accessConfig.priceCents > 0
                    ? accessConfig.priceCents
                    : wpPriceCents > 0
                      ? wpPriceCents
                      : Number.parseInt(
                          process.env.DEFAULT_COURSE_FEE_CENTS || "0",
                          10,
                        ) || 0,
                  accessConfig?.currency ||
                    process.env.DEFAULT_CURRENCY ||
                    process.env.DEFAULT_COURSE_FEE_CURRENCY ||
                    site.defaultCurrency ||
                    "SEK",
                );
                return (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200 pb-3">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                        {t("shop.accessLabel", "Access")}
                      </p>
                      <span className="rounded-full border border-teal-300 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 shadow-sm">
                        {t("inventory.grantedAccess")}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-[var(--color-foreground)]">
                      {displayPrice ? (
                        <p className="text-base">
                          <span className="font-semibold">{t("paywall.fee")}:</span>{" "}
                          {displayPrice}
                        </p>
                      ) : null}
                      <p className="text-sm text-slate-700">
                        {t(
                          "inventory.grantedDescription",
                          "You have been granted access to this content.",
                        )}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <a
                        href="/inventory"
                        className="inline-flex items-center justify-center rounded border border-teal-300 bg-white px-4 py-2 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-teal-800 hover:bg-teal-100"
                      >
                        {t("common.inventory", "Inventory")}
                      </a>
                    </div>
                  </div>
                );
              })()
            }
          />
        </>
      );
    return isEventType ? (
      <>
        {ldScript}
        <Event
          data={node}
          footer={
            (() => {
              const wpPriceCents = parsePriceCents(
                node?.priceRendered || node?.priceText || node?.price || "",
              );
              const linkedPriceCents =
                typeof linkedBuyable?.priceCents === "number" &&
                linkedBuyable.priceCents > 0
                  ? linkedBuyable.priceCents
                  : 0;
              const displayPrice = formatAccessPriceLabel(
                typeof accessConfig?.priceCents === "number" &&
                  accessConfig.priceCents > 0
                  ? accessConfig.priceCents
                  : linkedPriceCents > 0
                    ? linkedPriceCents
                  : wpPriceCents > 0
                    ? wpPriceCents
                    : Number.parseInt(
                        process.env.DEFAULT_COURSE_FEE_CENTS || "0",
                        10,
                      ) || 0,
                accessConfig?.currency ||
                  linkedBuyable?.currency ||
                  process.env.DEFAULT_CURRENCY ||
                  process.env.DEFAULT_COURSE_FEE_CURRENCY ||
                  site.defaultCurrency ||
                  "SEK",
              );
              const shopHref =
                linkedBuyable?.slug
                  ? `/shop/${encodeURIComponent(linkedBuyable.slug)}`
                  : "";
              const hasExternalBooking =
                linkedBuyable?.externalBookingEnabled === true &&
                typeof linkedBuyable?.externalBookingUrl === "string" &&
                linkedBuyable.externalBookingUrl.trim() !== "";
              return (
                <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200 pb-3">
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                      {t("shop.bookingLabel", "Booking")}
                    </p>
                    <span className="rounded-full border border-teal-300 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 shadow-sm">
                      {t("inventory.grantedAccess")}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-[var(--color-foreground)]">
                    {displayPrice ? (
                      <p className="text-base">
                        <span className="font-semibold">{t("paywall.fee")}:</span>{" "}
                        {displayPrice}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-700">
                      {t(
                        "inventory.grantedDescription",
                        "You have been granted access to this content.",
                      )}
                    </p>
                  </div>
                  {hasExternalBooking ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-teal-200 bg-white/90 p-3">
                      <a
                        href={linkedBuyable.externalBookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center rounded bg-teal-700 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-teal-600"
                      >
                        {linkedBuyable.externalBookingLabel ||
                          t("shop.externalBookingCta", "Book externally")}
                      </a>
                    </div>
                  ) : shopHref ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-teal-200 bg-white/90 p-3">
                      <a
                        href={shopHref}
                        className="inline-flex w-full items-center justify-center rounded border border-teal-300 bg-white px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-teal-800 hover:bg-teal-100"
                      >
                        {t("shop.openShop", "Open shop")}
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })()
          }
        />
      </>
    ) : (
      <>
        {ldScript}
        <Course data={node} />
      </>
    );
  }
  notFound();
}

export default function ContentPage(props) {
  return (
    <Suspense fallback={<StorefrontArticleSkeleton paragraphs={10} />}>
      <ContentPageInner {...props} />
    </Suspense>
  );
}
