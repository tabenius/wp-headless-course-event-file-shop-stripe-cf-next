/**
 * GET /api/admin/env-status
 *
 * Returns the status of every env var the app reads, grouped by service.
 * Secret values are returned as { set: true, secret: true, value: null }.
 * Non-secret values are returned with their actual string value.
 *
 * Admin-only endpoint.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

export const runtime = "nodejs";

/** Read the first set env var from a list; return its value or null. */
function readVal(...names) {
  for (const name of names) {
    const v = process.env[name];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

/** Check whether any of the listed env vars is set (non-empty). */
function isSet(...names) {
  return names.some((n) => {
    const v = process.env[n];
    return Boolean(v && String(v).trim());
  });
}

/**
 * Build a variable entry.
 * @param {string}   label    - Display label
 * @param {string[]} names    - Env var names to check (first set one wins)
 * @param {boolean}  secret   - If true, value is hidden; only set/not-set returned
 * @param {string}   [hint]   - Optional hint text
 */
function envVar(label, names, secret = false, hint = "") {
  const value = readVal(...names);
  return {
    label,
    names,
    set: Boolean(value),
    value: secret ? null : (value || null),
    secret,
    hint: hint || null,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  const isR2 = isSet("CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID");
  const isS3 = isSet("S3_ENDPOINT");

  const groups = [
    {
      id: "app",
      label: "App / Auth",
      vars: [
        envVar("Site URL", ["NEXT_PUBLIC_SITE_URL"]),
        envVar("Admin username", ["ADMIN_USERNAME"]),
        envVar("Admin password hash", ["ADMIN_PASSWORD_HASH"], true, "bcrypt hash of admin password"),
        envVar("JWT secret", ["JWT_SECRET"], true, "Signs session tokens"),
        envVar("Next.js runtime", ["NEXT_RUNTIME"]),
      ],
    },
    {
      id: "wordpress",
      label: "WordPress",
      vars: [
        envVar("Site URL", ["NEXT_PUBLIC_WORDPRESS_URL", "WORDPRESS_API_URL"]),
        envVar("GraphQL endpoint", ["WORDPRESS_GRAPHQL_ENDPOINT"]),
        envVar("WP application password", ["WORDPRESS_APPLICATION_PASSWORD"], true),
        envVar("WP app password user", ["WORDPRESS_APPLICATION_PASSWORD_USER"]),
      ],
    },
    {
      id: "r2s3",
      label: isR2 ? "Cloudflare R2 / S3" : "S3 Upload",
      vars: [
        envVar("Backend", ["UPLOAD_BACKEND"]),
        envVar("Enable S3", ["ENABLE_S3_UPLOAD", "S3_UPLOAD_ENABLED"]),
        ...(isR2
          ? [envVar("Account ID", ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"])]
          : []),
        ...(isS3
          ? [envVar("S3 endpoint", ["S3_ENDPOINT"])]
          : []),
        envVar("Bucket name", ["S3_BUCKET_NAME", "CF_R2_BUCKET_NAME"]),
        envVar("Region", ["S3_REGION"]),
        envVar("Public base URL", ["S3_PUBLIC_URL", "CF_R2_PUBLIC_URL"]),
        envVar("Access Key ID", ["S3_ACCESS_KEY_ID", "CF_R2_ACCESS_KEY_ID"]),
        envVar("Secret Access Key", ["S3_SECRET_ACCESS_KEY", "CF_R2_SECRET_ACCESS_KEY"], true),
        envVar("Force path style", ["S3_FORCE_PATH_STYLE"]),
      ],
    },
    {
      id: "stripe",
      label: "Stripe",
      vars: [
        envVar("Secret key", ["STRIPE_SECRET_KEY"], true),
        envVar("Publishable key", ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]),
        envVar("Default currency", ["DEFAULT_COURSE_FEE_CURRENCY"]),
        envVar("Webhook secret", ["STRIPE_WEBHOOK_SECRET"], true),
      ],
    },
    {
      id: "cloudflare",
      label: "Cloudflare Analytics",
      vars: [
        envVar("Account ID", ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"]),
        envVar("Zone ID", ["CF_ZONE_ID"]),
        envVar("API token", ["CF_API_TOKEN", "CLOUDFLARE_API_TOKEN"], true),
        envVar("Worker name", ["CF_WORKER_NAME"]),
      ],
    },
    {
      id: "email",
      label: "Email (Resend)",
      vars: [
        envVar("API key", ["RESEND_API_KEY"], true),
        envVar("From address", ["RESEND_FROM", "EMAIL_FROM"]),
      ],
    },
  ];

  return NextResponse.json({ ok: true, groups });
}
