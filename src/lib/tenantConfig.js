import xtasOverride from "../../tenantoverride/xtas.nu/config.js";

const DEFAULT_TENANT_CONFIG = Object.freeze({
  tenantKey: "default",
  siteUrl: "https://www.example.com",
  supportEmail: "support@example.com",
  notificationBcc: [],
  pseudoExternalHosts: [],
  customDomainExample: "example.com",
  demoCustomerEmails: [
    "alex@example.com",
    "casey@example.com",
    "sam@example.com",
  ],
  brandSignature: "Support Team",
});

const TENANT_OVERRIDES = Object.freeze({
  "xtas.nu": xtasOverride,
});

function readEnv(name) {
  if (typeof process === "undefined" || !process?.env) return "";
  return String(process.env[name] || "").trim();
}

function normalizeHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function hostFromUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return "";
  }
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUniqueStrings(...inputs) {
  const set = new Set();
  for (const input of inputs) {
    for (const item of Array.isArray(input) ? input : []) {
      const normalized = String(item || "")
        .trim()
        .toLowerCase();
      if (normalized) set.add(normalized);
    }
  }
  return Array.from(set);
}

function mergeUniqueHosts(...inputs) {
  const set = new Set();
  for (const input of inputs) {
    for (const item of Array.isArray(input) ? input : []) {
      const normalized = normalizeHost(item);
      if (normalized) set.add(normalized);
    }
  }
  return Array.from(set);
}

function resolveTenantKey() {
  const explicit =
    normalizeHost(readEnv("NEXT_PUBLIC_TENANT_KEY")) ||
    normalizeHost(readEnv("TENANT_KEY"));
  if (explicit) return explicit;

  const derivedCandidates = [
    readEnv("NEXT_PUBLIC_WORDPRESS_URL"),
    readEnv("NEXT_PUBLIC_SITE_URL"),
  ];
  for (const candidate of derivedCandidates) {
    const host = hostFromUrl(candidate);
    if (host) return host;
  }
  return DEFAULT_TENANT_CONFIG.tenantKey;
}

const resolvedTenantKey = resolveTenantKey();
const override =
  TENANT_OVERRIDES[resolvedTenantKey] ||
  TENANT_OVERRIDES[normalizeHost(resolvedTenantKey)];

const runtimePseudoHosts = parseCsvList(
  readEnv("NEXT_PUBLIC_PSEUDO_EXTERNAL_HOSTS") ||
    readEnv("PSEUDO_EXTERNAL_HOSTS"),
);
const runtimeNotificationBcc = parseCsvList(
  readEnv("NEXT_PUBLIC_NOTIFICATION_BCC") || readEnv("NOTIFICATION_BCC"),
);

const resolvedSiteUrl =
  readEnv("NEXT_PUBLIC_SITE_URL") ||
  readEnv("NEXT_PUBLIC_WORDPRESS_URL") ||
  override?.siteUrl ||
  DEFAULT_TENANT_CONFIG.siteUrl;

const resolvedSupportEmail =
  readEnv("SUPPORT_EMAIL") ||
  readEnv("CONTACT_EMAIL") ||
  override?.supportEmail ||
  DEFAULT_TENANT_CONFIG.supportEmail;

export const tenantConfig = Object.freeze({
  ...DEFAULT_TENANT_CONFIG,
  ...(override || {}),
  tenantKey: resolvedTenantKey || DEFAULT_TENANT_CONFIG.tenantKey,
  siteUrl: resolvedSiteUrl,
  supportEmail: resolvedSupportEmail,
  notificationBcc: mergeUniqueStrings(
    DEFAULT_TENANT_CONFIG.notificationBcc,
    override?.notificationBcc,
    runtimeNotificationBcc,
  ),
  pseudoExternalHosts: mergeUniqueHosts(
    DEFAULT_TENANT_CONFIG.pseudoExternalHosts,
    override?.pseudoExternalHosts,
    runtimePseudoHosts,
  ),
});

export function getPseudoExternalHosts(extraHosts = []) {
  return new Set(
    mergeUniqueHosts(tenantConfig.pseudoExternalHosts, extraHosts),
  );
}
