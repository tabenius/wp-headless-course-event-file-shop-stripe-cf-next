import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { fetchGraphQL } from "@/lib/client";

export const runtime = "nodejs";

const QUERIES = {
  pages: `{ pages(first: 50) { edges { node { id uri title } } } }`,
  posts: `{ posts(first: 50) { edges { node { id uri title } } } }`,
  events: `{ events(first: 50) { edges { node { id uri title } } } }`,
  courses: `{ lpCourses(first: 50) { edges { node { id uri title } } } }`,
  products: `{ products(first: 50, where: { status: "publish" }) { edges { node {
    ... on SimpleProduct   { id: databaseId uri name }
    ... on VariableProduct { id: databaseId uri name }
    ... on ExternalProduct { id: databaseId uri name }
  } } } }`,
};

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";

  if (!QUERIES[type]) {
    return NextResponse.json(
      {
        ok: false,
        error: `type must be one of: ${Object.keys(QUERIES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const data = await fetchGraphQL(QUERIES[type], {}, 120);
    const key = type === "courses" ? "lpCourses" : type;
    const edges = data?.[key]?.edges || data?.products?.edges || [];
    const items = edges
      .map((e) => e.node)
      .filter((n) => n?.name || n?.title)
      .map((n) => ({
        id: n.id,
        uri: n.uri || "",
        title: n.name || n.title || "",
      }));
    return NextResponse.json({ ok: true, type, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Content fetch failed" },
      { status: 500 },
    );
  }
}
