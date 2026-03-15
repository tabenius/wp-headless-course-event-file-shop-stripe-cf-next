import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { t } from "@/lib/i18n";
import {
  getCourseAccessState,
  getCourseStorageInfo,
  listAccessUsers,
  setCourseAccess,
} from "@/lib/courseAccess";
import { fetchGraphQL } from "@/lib/client";

async function fetchLearnPressCourses() {
  try {
    const data = await fetchGraphQL(
      `{ lpCourses(first: 100) { edges { node { databaseId uri title price priceRendered duration } } } }`,
      {},
      300,
    );
    return (data?.lpCourses?.edges || []).map((e) => ({
      ...e.node,
      _source: "learnpress",
      _type: "course",
    }));
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
                productCategories { edges { node { name } } }
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
                productCategories { edges { node { name } } }
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
                productCategories { edges { node { name } } }
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
    const data = await fetchGraphQL(
      `{ events(first: 100) { edges { node { databaseId uri title slug featuredImage { node { sourceUrl } } } } } }`,
      {},
      300,
    );
    return (data?.events?.edges || []).map((e) => ({
      ...e.node,
      _source: "wordpress",
      _type: "event",
    }));
  } catch {
    return [];
  }
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: t("apiErrors.adminLoginRequired") }, { status: 401 });
}

export async function GET(request) {
  const session = getAdminSessionFromCookieHeader(request.headers.get("cookie") || "");
  if (!session) return unauthorized();

  const [state, users, wpCourses, wcProducts, wpEvents] = await Promise.all([
    getCourseAccessState(),
    listAccessUsers(),
    fetchLearnPressCourses(),
    fetchWooCommerceProducts(),
    fetchEvents(),
  ]);
  return NextResponse.json({
    ok: true,
    courses: state.courses,
    users,
    wpCourses,
    wcProducts,
    wpEvents,
    storage: getCourseStorageInfo(),
    resendConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
  });
}

export async function PUT(request) {
  const session = getAdminSessionFromCookieHeader(request.headers.get("cookie") || "");
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const courseUri = typeof body?.courseUri === "string" ? body.courseUri : "";
    const allowedUsers = Array.isArray(body?.allowedUsers) ? body.allowedUsers : [];
    const priceCents =
      typeof body?.priceCents === "number"
        ? body.priceCents
        : Number.parseInt(String(body?.priceCents || "0"), 10);
    const currency = typeof body?.currency === "string" ? body.currency.toUpperCase() : "SEK";
    const state = await setCourseAccess({
      courseUri,
      allowedUsers,
      priceCents: Number.isFinite(priceCents) ? priceCents : 0,
      currency,
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
