import { cookies } from "next/headers";

/**
 * POST /api/config
 * Body: { wpUrl: string, secretKey?: string }
 *
 * Saves the WordPress connection config as a cookie so SSR can pick it up
 * when NEXT_PUBLIC_WORDPRESS_URL is not set in the environment.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const wpUrl = (body.wpUrl || "").trim().replace(/\/+$/, "");
  const secretKey = (body.secretKey || "").trim();

  if (!wpUrl) {
    return new Response("wpUrl is required", { status: 400 });
  }

  try {
    new URL(wpUrl);
  } catch {
    return new Response("wpUrl must be a valid URL", { status: 400 });
  }

  const config = JSON.stringify({ wpUrl, secretKey });
  const encoded = Buffer.from(config, "utf8").toString("base64");

  const cookieStore = await cookies();
  cookieStore.set("ragbaz_wp_config", encoded, {
    path: "/",
    sameSite: "lax",
    // Not httpOnly so the setup page can read it for pre-filling the form.
    // The secret is low-sensitivity for a personal-use storefront.
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365, // 1 year
    secure: process.env.NODE_ENV === "production",
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * DELETE /api/config
 * Clears the stored WordPress config cookie (reset/logout).
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("ragbaz_wp_config");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
