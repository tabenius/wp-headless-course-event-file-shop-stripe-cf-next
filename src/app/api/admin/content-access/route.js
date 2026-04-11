import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";
import {
  getContentAccessState,
  getContentStorageInfo,
  listAccessUsers,
  setContentAccess,
} from "@/lib/contentAccess";
import { fetchGraphQL } from "@/lib/client";
import { deriveCategories } from "@/lib/contentCategories";
import {
  getUploadBackend,
  isS3BackendEnabled,
  isS3Configured,
  isS3Upload,
} from "@/lib/s3upload";
import { isResendConfigured } from "@/lib/resendConfig";

const graphqlFieldSupportCache = new Map();

async function hasGraphQLField(typeName, fieldName) {
  const cacheKey = `${typeName}:${fieldName}`;
  if (graphqlFieldSupportCache.has(cacheKey)) {
    return graphqlFieldSupportCache.get(cacheKey);
  }
  try {
    const data = await fetchGraphQL(
      `query IntrospectField($name: String!) {
        __type(name: $name) {
          fields { name }
        }
      }`,
      { name: typeName },
      1800,
    );
    const exists = (data?.__type?.fields || []).some(
      (field) => field?.name === fieldName,
    );
    graphqlFieldSupportCache.set(cacheKey, exists);
    return exists;
  } catch {
    graphqlFieldSupportCache.set(cacheKey, false);
    return false;
  }
}

async function fetchLearnPressCourses() {
  try {
    const hasCourseCategories = await hasGraphQLField(
      "LpCourse",
      "lpCourseCategory",
    );
    const categoryFragment = hasCourseCategories
      ? "lpCourseCategory { nodes { name slug } }"
      : "";
    const data = await fetchGraphQL(
      `{
        lpCourses(first: 100) {
          edges {
            node {
              databaseId
              uri
              title
              price
              priceRendered
              duration
              ${categoryFragment}
            }
          }
        }
      }`,
      {},
      300,
    );
    return (data?.lpCourses?.edges || []).map((e) => {
      const node = e.node || {};
      return {
        ...node,
        ...deriveCategories({
          explicit: node.lpCourseCategory,
          implied: ["Course", "LearnPress"],
        }),
        _source: "learnpress",
        _type: "course",
      };
    });
  } catch {
    return [];
  }
}

async function fetchWooCommerceProducts() {
  try {
    const data = await fetchGraphQL(
      `{
        products(first: 100, where: { status: "publish" }) {
          edges {
            node {
              __typename
              ... on SimpleProduct {
                databaseId
                name
                slug
                uri
                price
                regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
                productCategories { edges { node { name slug } } }
              }
              ... on VariableProduct {
                databaseId
                name
                slug
                uri
                price
                regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
                productCategories { edges { node { name slug } } }
              }
              ... on ExternalProduct {
                databaseId
                name
                slug
                uri
                price
                regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
                productCategories { edges { node { name slug } } }
              }
            }
          }
        }
      }`,
      {},
      300,
    );
    return (data?.products?.edges || [])
      .map((e) => e.node)
      .filter((n) => n?.name)
      .map((n) => ({
        ...n,
        ...deriveCategories({
          explicit: n.productCategories,
          implied: ["Product", "WooCommerce"],
        }),
        title: n.name,
        _source: "woocommerce",
        _type: "product",
      }));
  } catch {
    return [];
  }
}

async function fetchEvents() {
  try {
    const hasEventCategories = await hasGraphQLField(
      "Event",
      "eventCategories",
    );
    const categoryFragment = hasEventCategories
      ? "eventCategories { nodes { name slug } }"
      : "";
    const data = await fetchGraphQL(
      `{
        events(first: 100, where: { orderby: { field: DATE, order: ASC } }) {
          edges {
            node {
              databaseId
              uri
              title
              slug
              startDate
              endDate
              featuredImage { node { sourceUrl } }
              ${categoryFragment}
            }
          }
        }
      }`,
      {},
      300,
    );
    return (data?.events?.edges || []).map((e) => {
      const node = e.node || {};
      return {
        ...node,
        ...deriveCategories({
          explicit: node.eventCategories,
          implied: ["Event", "WordPress"],
        }),
        _source: "wordpress",
        _type: "event",
      };
    });
  } catch {
    return [];
  }
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const [state, users, wpCourses, wcProducts, wpEvents] = await Promise.all([
      getContentAccessState(),
      listAccessUsers(),
      fetchLearnPressCourses(),
      fetchWooCommerceProducts(),
      fetchEvents(),
    ]);
    const uploadBackend = getUploadBackend();
    const r2Configured = isS3Upload("r2") && isS3Configured("r2");
    const s3Enabled = isS3BackendEnabled();
    const s3Configured = s3Enabled && isS3Upload("s3") && isS3Configured("s3");
    return NextResponse.json({
      ok: true,
      courses: state.courses,
      users,
      wpCourses,
      wcProducts,
      wpEvents,
      storage: getContentStorageInfo(),
      resendConfigured: isResendConfigured(),
      upload: {
        backend: uploadBackend,
        wordpress: true,
        r2: r2Configured,
        s3: s3Configured,
        s3Enabled,
      },
    });
  } catch (error) {
    console.error("Admin course access GET failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.loadCourseAccessFailed") },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const courseUri =
      typeof body?.contentUri === "string" ? body.contentUri : "";
    const allowedUsers = Array.isArray(body?.allowedUsers)
      ? body.allowedUsers
      : [];
    const priceCents =
      typeof body?.priceCents === "number"
        ? body.priceCents
        : Number.parseInt(String(body?.priceCents || "0"), 10);
    const currency =
      typeof body?.currency === "string" ? body.currency.toUpperCase() : "SEK";
    const hasVatPercent = Object.prototype.hasOwnProperty.call(
      body || {},
      "vatPercent",
    );
    const vatPercentRaw = hasVatPercent ? body?.vatPercent : undefined;
    const parsedVatPercent =
      vatPercentRaw === "" ||
      vatPercentRaw === null ||
      vatPercentRaw === undefined
        ? null
        : Number.parseFloat(String(vatPercentRaw).replace(",", "."));
    const active = typeof body?.active === "boolean" ? body.active : undefined;
    const annotations =
      body?.annotations && typeof body.annotations === "object"
        ? body.annotations
        : {};
    const state = await setContentAccess({
      courseUri,
      allowedUsers,
      priceCents: Number.isFinite(priceCents) ? priceCents : 0,
      currency,
      ...(hasVatPercent
        ? {
            vatPercent:
              Number.isFinite(parsedVatPercent) &&
              parsedVatPercent >= 0 &&
              parsedVatPercent <= 100
                ? Math.round(parsedVatPercent * 100) / 100
                : null,
          }
        : {}),
      active,
      duration:
        typeof annotations.duration === "string"
          ? annotations.duration
          : typeof body?.duration === "string"
            ? body.duration
            : undefined,
      startDate:
        typeof annotations.startDate === "string"
          ? annotations.startDate
          : typeof body?.startDate === "string"
            ? body.startDate
            : undefined,
      endDate:
        typeof annotations.endDate === "string"
          ? annotations.endDate
          : typeof body?.endDate === "string"
            ? body.endDate
            : undefined,
      metadata:
        annotations.metadata && typeof annotations.metadata === "object"
          ? annotations.metadata
          : body?.metadata && typeof body.metadata === "object"
            ? body.metadata
            : undefined,
    });
    return NextResponse.json({ ok: true, courses: state.courses });
  } catch (error) {
    console.error("Admin course access update failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.saveCourseAccessFailed") },
      { status: 400 },
    );
  }
}
