import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import {
  getCourseAccessState,
  getCourseStorageInfo,
  listAccessUsers,
  setCourseAccess,
} from "@/lib/courseAccess";
import { fetchGraphQL } from "@/lib/client";

async function fetchLearnPressCourses() {
  if (process.env.NEXT_PUBLIC_WORDPRESS_LEARNPRESS !== "1") return [];
  try {
    const data = await fetchGraphQL(
      `{ lpCourses(first: 100) { edges { node { databaseId uri title price priceRendered duration } } } }`,
      {},
      300,
    );
    return (data?.lpCourses?.edges || []).map((e) => e.node);
  } catch {
    return [];
  }
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Du behöver logga in som administratör." }, { status: 401 });
}

export async function GET(request) {
  const session = getAdminSessionFromCookieHeader(request.headers.get("cookie") || "");
  if (!session) return unauthorized();

  const [state, users, wpCourses] = await Promise.all([
    getCourseAccessState(),
    listAccessUsers(),
    fetchLearnPressCourses(),
  ]);
  return NextResponse.json({
    ok: true,
    courses: state.courses,
    users,
    wpCourses,
    storage: getCourseStorageInfo(),
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
    const currency = typeof body?.currency === "string" ? body.currency : "usd";
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
      { ok: false, error: "Det gick inte att spara åtkomstinställningarna." },
      { status: 400 },
    );
  }
}
