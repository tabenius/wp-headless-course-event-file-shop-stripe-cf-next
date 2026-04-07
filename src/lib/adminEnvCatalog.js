export const ADMIN_ENV_GROUPS = [
  {
    id: "app",
    label: "App / Auth",
    vars: [
      {
        label: "Site URL",
        names: ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_WORDPRESS_URL"],
      },
      { label: "Admin emails", names: ["ADMIN_EMAILS"] },
      { label: "Admin passwords", names: ["ADMIN_PASSWORDS"], secret: true },
      { label: "Admin username (legacy)", names: ["ADMIN_USERNAME"] },
      {
        label: "Admin password hash",
        names: ["ADMIN_PASSWORD_HASH"],
        secret: true,
        hint: "bcrypt hash of admin password",
      },
      { label: "Auth secret", names: ["AUTH_SECRET"], secret: true },
      {
        label: "JWT secret",
        names: ["JWT_SECRET"],
        secret: true,
        hint: "Signs session tokens",
      },
      { label: "Next.js runtime", names: ["NEXT_RUNTIME"] },
    ],
  },
  {
    id: "wordpress",
    label: "WordPress",
    vars: [
      {
        label: "Site URL",
        names: ["NEXT_PUBLIC_WORDPRESS_URL", "WORDPRESS_API_URL"],
      },
      { label: "GraphQL endpoint", names: ["WORDPRESS_GRAPHQL_ENDPOINT"] },
      {
        label: "WP app password",
        names: [
          "WORDPRESS_APPLICATION_PASSWORD",
          "WORDPRESS_GRAPHQL_APPLICATION_PASSWORD",
        ],
        secret: true,
      },
      {
        label: "WP app password user",
        names: ["WORDPRESS_APPLICATION_PASSWORD_USER"],
      },
      {
        label: "Faust secret",
        names: ["FAUST_SECRET_KEY", "FAUSTWP_SECRET_KEY"],
        secret: true,
      },
    ],
  },
  {
    id: "r2s3",
    label: "Cloudflare R2 / S3",
    vars: [
      { label: "Backend", names: ["UPLOAD_BACKEND"] },
      { label: "Enable S3", names: ["ENABLE_S3_UPLOAD", "S3_UPLOAD_ENABLED"] },
      {
        label: "Account ID",
        names: ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"],
      },
      { label: "S3 endpoint", names: ["S3_ENDPOINT"] },
      { label: "Bucket name", names: ["S3_BUCKET_NAME", "CF_R2_BUCKET_NAME"] },
      { label: "Region", names: ["S3_REGION"] },
      {
        label: "Public base URL",
        names: ["S3_PUBLIC_URL", "CF_R2_PUBLIC_URL"],
      },
      {
        label: "Access Key ID",
        names: ["S3_ACCESS_KEY_ID", "CF_R2_ACCESS_KEY_ID"],
      },
      {
        label: "Secret Access Key",
        names: ["S3_SECRET_ACCESS_KEY", "CF_R2_SECRET_ACCESS_KEY"],
        secret: true,
      },
      { label: "Force path style", names: ["S3_FORCE_PATH_STYLE"] },
    ],
  },
  {
    id: "stripe",
    label: "Stripe",
    vars: [
      { label: "Secret key", names: ["STRIPE_SECRET_KEY"], secret: true },
      {
        label: "Publishable key",
        names: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      },
      {
        label: "Default currency",
        names: ["DEFAULT_CURRENCY", "DEFAULT_COURSE_FEE_CURRENCY"],
      },
      {
        label: "Webhook secret",
        names: ["STRIPE_WEBHOOK_SECRET"],
        secret: true,
      },
    ],
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    vars: [
      {
        label: "Account ID",
        names: ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"],
      },
      { label: "Zone ID", names: ["CF_ZONE_ID"] },
      {
        label: "API token",
        names: ["CF_API_TOKEN", "CLOUDFLARE_API_TOKEN"],
        secret: true,
      },
      { label: "KV namespace", names: ["CF_KV_NAMESPACE_ID"] },
      { label: "Worker name", names: ["CF_WORKER_NAME"] },
    ],
  },
  {
    id: "ai",
    label: "AI",
    vars: [
      { label: "Image daily limit", names: ["AI_IMAGE_DAILY_LIMIT"] },
      { label: "Image model", names: ["CF_IMAGE_MODEL"] },
      { label: "Embedding model", names: ["CF_EMBED_MODEL"] },
      { label: "Chat model", names: ["CF_CHAT_MODEL"] },
    ],
  },
  {
    id: "email",
    label: "Email (Resend)",
    vars: [
      { label: "API key", names: ["RESEND_API_KEY"], secret: true },
      {
        label: "From address",
        names: ["RESEND_FROM_EMAIL", "RESEND_FROM", "EMAIL_FROM"],
      },
    ],
  },
];

export function primaryEnvName(entry) {
  return Array.isArray(entry?.names) && entry.names.length > 0
    ? String(entry.names[0])
    : "";
}

export function envLooksSecret(name) {
  const key = String(name || "").toUpperCase();
  return (
    key.includes("SECRET") ||
    key.includes("PASSWORD") ||
    key.includes("TOKEN") ||
    key.endsWith("_KEY")
  );
}
