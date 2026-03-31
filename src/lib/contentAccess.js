import {
  getContentAccessConfig as getLocalContentAccessConfig,
  getContentAccessState as getLocalContentAccessState,
  getContentStorageInfo as getLocalStorageInfo,
  grantContentAccess as grantLocalContentAccess,
  hasContentAccess as hasLocalContentAccess,
  setContentAccess as setLocalContentAccess,
} from "@/lib/contentAccessStore";
import { listUsers as listLocalUsers } from "@/lib/userStore";
import { getWordPressGraphqlAuthOptions } from "@/lib/wordpressGraphqlAuth";
import {
  isCloudflareKvConfigured,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

function isWordPressBackend() {
  return process.env.COURSE_ACCESS_BACKEND === "wordpress";
}

function isWordPressBackendConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_WORDPRESS_URL);
}

function getGraphqlEndpoint() {
  const base = process.env.NEXT_PUBLIC_WORDPRESS_URL || "";
  return base ? `${base.replace(/\/$/, "")}/graphql` : "";
}

function normalizeContentUri(courseUri) {
  const value = String(courseUri || "").trim();
  if (!value) return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

async function fetchWordPressGraphQL(query, variables = {}) {
  const endpoint = getGraphqlEndpoint();
  if (!endpoint) {
    throw new Error(
      "NEXT_PUBLIC_WORDPRESS_URL is required for wordpress backend",
    );
  }

  const authOptions = getWordPressGraphqlAuthOptions();
  let lastError = null;
  const delayMs =
    Number.parseInt(process.env.GRAPHQL_DELAY_MS || "0", 10) || 0;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const firstLines = (text, lines = 3) =>
    text ? text.split("\n").slice(0, lines).join("\n") : "";

  for (const auth of authOptions) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(auth.authorization ? { Authorization: auth.authorization } : {}),
      ...(auth.headers || {}),
    };

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      const text = await response.text().catch(() => "<unable to read body>");
      const statusTooMany = response.status === 429 || response.status === 503;
      lastError = `WordPress GraphQL response (${response.status}) ${contentType} ${firstLines(text)}`;
      if (/varnish|too many/i.test(text) || statusTooMany) await sleep(250);
      else await sleep(delayMs || 100);
      continue;
    }
    const json = await response.json();
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      lastError = json.errors[0]?.message || "WordPress GraphQL error";
      continue;
    }
    return json?.data || {};
  }
  throw new Error(lastError || "WordPress GraphQL unavailable");
}

function isActiveSchemaMismatch(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message.includes("active")) return false;
  return (
    message.includes("cannot query field") ||
    message.includes("unknown argument") ||
    message.includes("does not exist") ||
    message.includes("doesn't accept argument")
  );
}

function isVatSchemaMismatch(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message.includes("vatpercent")) return false;
  return (
    message.includes("cannot query field") ||
    message.includes("unknown argument") ||
    message.includes("does not exist") ||
    message.includes("doesn't accept argument")
  );
}

function normalizeVatPercent(vatPercent) {
  if (vatPercent === "" || vatPercent === null || vatPercent === undefined) {
    return null;
  }
  const parsed =
    typeof vatPercent === "number"
      ? vatPercent
      : Number.parseFloat(String(vatPercent).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

async function getWordPressAdminState() {
  const queryWithVatAndActive = `
    query GetCourseAccessAdminData {
      courseAccessRules {
        courseUri
        priceCents
        currency
        vatPercent
        active
        allowedUsers
        updatedAt
      }
      users(first: 200) {
        nodes {
          id
          name
          email
        }
      }
    }
  `;
  const queryWithActive = `
    query GetCourseAccessAdminData {
      courseAccessRules {
        courseUri
        priceCents
        currency
        active
        allowedUsers
        updatedAt
      }
      users(first: 200) {
        nodes {
          id
          name
          email
        }
      }
    }
  `;
  const queryLegacy = `
    query GetCourseAccessAdminData {
      courseAccessRules {
        courseUri
        priceCents
        currency
        allowedUsers
        updatedAt
      }
      users(first: 200) {
        nodes {
          id
          name
          email
        }
      }
    }
  `;
  let data;
  try {
    data = await fetchWordPressGraphQL(queryWithVatAndActive);
  } catch (error) {
    if (isVatSchemaMismatch(error)) {
      try {
        data = await fetchWordPressGraphQL(queryWithActive);
      } catch (fallbackError) {
        if (!isActiveSchemaMismatch(fallbackError)) throw fallbackError;
        data = await fetchWordPressGraphQL(queryLegacy);
      }
    } else if (isActiveSchemaMismatch(error)) {
      data = await fetchWordPressGraphQL(queryLegacy);
    } else {
      throw error;
    }
  }
  const rules = Array.isArray(data?.courseAccessRules)
    ? data.courseAccessRules
    : [];
  const courses = {};
  for (const rule of rules) {
    const uri = normalizeContentUri(rule?.courseUri);
    if (!uri) continue;
    courses[uri] = {
      allowedUsers: Array.isArray(rule.allowedUsers) ? rule.allowedUsers : [],
      priceCents:
        typeof rule.priceCents === "number" && rule.priceCents >= 0
          ? rule.priceCents
          : 0,
      currency:
        typeof rule.currency === "string" ? rule.currency.toUpperCase() : "SEK",
      vatPercent: normalizeVatPercent(rule?.vatPercent),
      active: rule?.active !== false,
      updatedAt: typeof rule.updatedAt === "string" ? rule.updatedAt : "",
    };
  }
  const users = Array.isArray(data?.users?.nodes)
    ? data.users.nodes
        .filter(
          (node) => typeof node?.email === "string" && node.email.includes("@"),
        )
        .map((node) => ({
          id: node?.id || "",
          name:
            typeof node?.name === "string" && node.name.trim() !== ""
              ? node.name
              : node.email,
          email: node.email,
          createdAt: "",
        }))
    : [];

  return { courses, users };
}

async function setWordPressCourseAccess({
  courseUri,
  allowedUsers,
  priceCents,
  currency,
  active,
  vatPercent,
}) {
  const normalizedCourseUri = normalizeContentUri(courseUri);
  if (!normalizedCourseUri) {
    throw new Error("Invalid course URI");
  }
  const includesVat = vatPercent !== undefined;
  const safeVatPercent = normalizeVatPercent(vatPercent);
  const mutationWithVatAndActive = `
    mutation SetCourseAccessRule(
      $courseUri: String!
      $allowedUsers: [String!]!
      $priceCents: Int!
      $currency: String!
      $vatPercent: Float
      $active: Boolean!
    ) {
      setCourseAccessRule(
        input: {
          courseUri: $courseUri
          allowedUsers: $allowedUsers
          priceCents: $priceCents
          currency: $currency
          vatPercent: $vatPercent
          active: $active
        }
      ) {
        rule {
          courseUri
          allowedUsers
          priceCents
          currency
          vatPercent
          active
          updatedAt
        }
      }
    }
  `;
  const mutationWithVat = `
    mutation SetCourseAccessRule(
      $courseUri: String!
      $allowedUsers: [String!]!
      $priceCents: Int!
      $currency: String!
      $vatPercent: Float
    ) {
      setCourseAccessRule(
        input: {
          courseUri: $courseUri
          allowedUsers: $allowedUsers
          priceCents: $priceCents
          currency: $currency
          vatPercent: $vatPercent
        }
      ) {
        rule {
          courseUri
          allowedUsers
          priceCents
          currency
          vatPercent
          updatedAt
        }
      }
    }
  `;
  const mutationWithActive = `
    mutation SetCourseAccessRule(
      $courseUri: String!
      $allowedUsers: [String!]!
      $priceCents: Int!
      $currency: String!
      $active: Boolean!
    ) {
      setCourseAccessRule(
        input: {
          courseUri: $courseUri
          allowedUsers: $allowedUsers
          priceCents: $priceCents
          currency: $currency
          active: $active
        }
      ) {
        rule {
          courseUri
          allowedUsers
          priceCents
          currency
          active
          updatedAt
        }
      }
    }
  `;
  const mutationLegacy = `
    mutation SetCourseAccessRule(
      $courseUri: String!
      $allowedUsers: [String!]!
      $priceCents: Int!
      $currency: String!
    ) {
      setCourseAccessRule(
        input: {
          courseUri: $courseUri
          allowedUsers: $allowedUsers
          priceCents: $priceCents
          currency: $currency
        }
      ) {
        rule {
          courseUri
          allowedUsers
          priceCents
          currency
          updatedAt
        }
      }
    }
  `;
  const variables = {
    courseUri: normalizedCourseUri,
    allowedUsers,
    priceCents,
    currency,
  };
  if (typeof active === "boolean" && includesVat) {
    try {
      await fetchWordPressGraphQL(mutationWithVatAndActive, {
        ...variables,
        vatPercent: safeVatPercent,
        active,
      });
    } catch (error) {
      if (isVatSchemaMismatch(error)) {
        try {
          await fetchWordPressGraphQL(mutationWithActive, {
            ...variables,
            active,
          });
        } catch (fallbackError) {
          if (!isActiveSchemaMismatch(fallbackError)) throw fallbackError;
          await fetchWordPressGraphQL(mutationLegacy, variables);
        }
      } else if (isActiveSchemaMismatch(error)) {
        try {
          await fetchWordPressGraphQL(mutationWithVat, {
            ...variables,
            vatPercent: safeVatPercent,
          });
        } catch (fallbackError) {
          if (!isVatSchemaMismatch(fallbackError)) throw fallbackError;
          await fetchWordPressGraphQL(mutationLegacy, variables);
        }
      } else {
        throw error;
      }
    }
  } else if (includesVat) {
    try {
      await fetchWordPressGraphQL(mutationWithVat, {
        ...variables,
        vatPercent: safeVatPercent,
      });
    } catch (error) {
      if (!isVatSchemaMismatch(error)) throw error;
      await fetchWordPressGraphQL(mutationLegacy, variables);
    }
  } else if (typeof active === "boolean") {
    try {
      await fetchWordPressGraphQL(mutationWithActive, {
        ...variables,
        active,
      });
    } catch (error) {
      if (!isActiveSchemaMismatch(error)) throw error;
      await fetchWordPressGraphQL(mutationLegacy, variables);
    }
  } else {
    await fetchWordPressGraphQL(mutationLegacy, variables);
  }
  const state = await getWordPressAdminState();
  return { courses: state.courses };
}

async function hasWordPressCourseAccess(courseUri, email) {
  const normalizedCourseUri = normalizeContentUri(courseUri);
  if (!normalizedCourseUri) return false;
  const query = `
    query CheckCourseAccess($courseUri: String!, $email: String!) {
      courseAccessForUser(courseUri: $courseUri, email: $email) {
        hasAccess
      }
    }
  `;
  const data = await fetchWordPressGraphQL(query, {
    courseUri: normalizedCourseUri,
    email,
  });
  return Boolean(data?.courseAccessForUser?.hasAccess);
}

async function listWordPressAccessibleCourseUris(courseUris, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];
  const uriSet = new Set(
    (Array.isArray(courseUris) ? courseUris : [])
      .map((uri) => normalizeContentUri(uri))
      .filter(Boolean),
  );
  if (uriSet.size === 0) return [];

  const queryWithActive = `
    query ListCourseAccessRules {
      courseAccessRules {
        courseUri
        active
        allowedUsers
      }
    }
  `;
  const queryLegacy = `
    query ListCourseAccessRules {
      courseAccessRules {
        courseUri
        allowedUsers
      }
    }
  `;

  let data;
  try {
    data = await fetchWordPressGraphQL(queryWithActive);
  } catch (error) {
    if (!isActiveSchemaMismatch(error)) throw error;
    data = await fetchWordPressGraphQL(queryLegacy);
  }

  const rules = Array.isArray(data?.courseAccessRules)
    ? data.courseAccessRules
    : [];
  const out = [];
  for (const rule of rules) {
    const uri = normalizeContentUri(rule?.courseUri);
    if (!uri || !uriSet.has(uri) || rule?.active === false) continue;
    const allowedUsers = Array.isArray(rule?.allowedUsers)
      ? rule.allowedUsers
      : [];
    const hasAccess = allowedUsers.some(
      (userEmail) =>
        String(userEmail || "").trim().toLowerCase() === normalizedEmail,
    );
    if (hasAccess) out.push(uri);
  }
  return out;
}

async function listLocalAccessibleCourseUris(courseUris, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];
  const uriSet = new Set(
    (Array.isArray(courseUris) ? courseUris : [])
      .map((uri) => normalizeContentUri(uri))
      .filter(Boolean),
  );
  if (uriSet.size === 0) return [];
  const state = await getLocalContentAccessState();
  const courses = state?.courses || {};
  const out = [];
  for (const [rawUri, config] of Object.entries(courses)) {
    const uri = normalizeContentUri(rawUri);
    if (!uri || !uriSet.has(uri) || config?.active === false) continue;
    const allowedUsers = Array.isArray(config?.allowedUsers)
      ? config.allowedUsers
      : [];
    const hasAccess = allowedUsers.some(
      (userEmail) =>
        String(userEmail || "").trim().toLowerCase() === normalizedEmail,
    );
    if (hasAccess) out.push(uri);
  }
  return out;
}

async function grantWordPressCourseAccess(courseUri, email) {
  const normalizedCourseUri = normalizeContentUri(courseUri);
  if (!normalizedCourseUri) {
    throw new Error("Invalid course URI");
  }
  const mutation = `
    mutation GrantCourseAccess($courseUri: String!, $email: String!) {
      grantContentAccess(input: { courseUri: $courseUri, email: $email }) {
        success
      }
    }
  `;
  await fetchWordPressGraphQL(mutation, {
    courseUri: normalizedCourseUri,
    email,
  });
}

async function getWordPressCourseAccessConfig(courseUri) {
  const normalizedCourseUri = normalizeContentUri(courseUri);
  if (!normalizedCourseUri) return null;
  const queryWithVatAndActive = `
    query CourseAccessConfig($courseUri: String!) {
      courseAccessConfig(courseUri: $courseUri) {
        courseUri
        priceCents
        currency
        vatPercent
        active
        allowedUsers
        updatedAt
      }
    }
  `;
  const queryWithActive = `
    query CourseAccessConfig($courseUri: String!) {
      courseAccessConfig(courseUri: $courseUri) {
        courseUri
        priceCents
        currency
        active
        allowedUsers
        updatedAt
      }
    }
  `;
  const queryLegacy = `
    query CourseAccessConfig($courseUri: String!) {
      courseAccessConfig(courseUri: $courseUri) {
        courseUri
        priceCents
        currency
        allowedUsers
        updatedAt
      }
    }
  `;
  let data;
  try {
    data = await fetchWordPressGraphQL(queryWithVatAndActive, {
      courseUri: normalizedCourseUri,
    });
  } catch (error) {
    if (isVatSchemaMismatch(error)) {
      try {
        data = await fetchWordPressGraphQL(queryWithActive, {
          courseUri: normalizedCourseUri,
        });
      } catch (fallbackError) {
        if (!isActiveSchemaMismatch(fallbackError)) throw fallbackError;
        data = await fetchWordPressGraphQL(queryLegacy, {
          courseUri: normalizedCourseUri,
        });
      }
    } else if (isActiveSchemaMismatch(error)) {
      data = await fetchWordPressGraphQL(queryLegacy, {
        courseUri: normalizedCourseUri,
      });
    } else {
      throw error;
    }
  }
  const config = data?.courseAccessConfig || null;
  if (!config || typeof config !== "object") return null;
  return {
    ...config,
    vatPercent: normalizeVatPercent(config.vatPercent),
  };
}

async function replicateToCloudflare(state) {
  const key = process.env.CF_KV_KEY || "course-access";
  const shouldReplica =
    process.env.COURSE_ACCESS_STORE === "cloudflare" ||
    isCloudflareKvConfigured();
  if (!shouldReplica) return;
  try {
    await writeCloudflareKvJson(key, state);
  } catch (error) {
    console.error("Failed to replicate course access to Cloudflare KV:", error);
  }
}

export async function getContentAccessState() {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return getLocalContentAccessState();
    }
    try {
      const data = await getWordPressAdminState();
      const state = { courses: data.courses };
      await replicateToCloudflare(state);
      return state;
    } catch (error) {
      console.error(
        "WordPress course access read failed. Falling back to local course access store:",
        error,
      );
      return getLocalContentAccessState();
    }
  }
  return getLocalContentAccessState();
}

export async function setContentAccess(payload) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return setLocalContentAccess(payload);
    }
    try {
      const result = await setWordPressCourseAccess(payload);
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        await setLocalContentAccess(payload);
      }
      return result;
    } catch (error) {
      console.error(
        "WordPress course access update failed. Falling back to local course access store:",
        error,
      );
      return setLocalContentAccess(payload);
    }
  }
  return setLocalContentAccess(payload);
}

export async function hasContentAccess(courseUri, email) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return hasLocalContentAccess(courseUri, email);
    }
    try {
      const wpHas = await hasWordPressCourseAccess(courseUri, email);
      if (wpHas) return true;
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        return hasLocalContentAccess(courseUri, email);
      }
      return false;
    } catch (error) {
      console.error(
        "WordPress course access check failed. Falling back to local course access store:",
        error,
      );
      return hasLocalContentAccess(courseUri, email);
    }
  }
  return hasLocalContentAccess(courseUri, email);
}

export async function listAccessibleContentUris(courseUris, email) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return listLocalAccessibleCourseUris(courseUris, email);
    }
    try {
      const wordpressUris = await listWordPressAccessibleCourseUris(
        courseUris,
        email,
      );
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        const localUris = await listLocalAccessibleCourseUris(courseUris, email);
        return [...new Set([...wordpressUris, ...localUris])];
      }
      return wordpressUris;
    } catch (error) {
      console.error(
        "WordPress course access list failed. Falling back to local course access store:",
        error,
      );
      return listLocalAccessibleCourseUris(courseUris, email);
    }
  }
  return listLocalAccessibleCourseUris(courseUris, email);
}

export async function grantContentAccess(courseUri, email) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return grantLocalContentAccess(courseUri, email);
    }
    try {
      await grantWordPressCourseAccess(courseUri, email);
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        await grantLocalContentAccess(courseUri, email);
      }
      return;
    } catch (error) {
      console.error(
        "WordPress course access grant failed. Falling back to local course access store:",
        error,
      );
      return grantLocalContentAccess(courseUri, email);
    }
  }
  return grantLocalContentAccess(courseUri, email);
}

export async function getContentAccessConfig(courseUri) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return getLocalContentAccessConfig(courseUri);
    }
    try {
      return getWordPressCourseAccessConfig(courseUri);
    } catch (error) {
      console.error(
        "WordPress course config lookup failed. Falling back to local course access store:",
        error,
      );
      return getLocalContentAccessConfig(courseUri);
    }
  }
  return getLocalContentAccessConfig(courseUri);
}

export async function listAccessUsers() {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local users.",
      );
      return listLocalUsers();
    }
    try {
      const data = await getWordPressAdminState();
      return data.users;
    } catch (error) {
      console.error(
        "WordPress users lookup failed. Falling back to local users:",
        error,
      );
      return listLocalUsers();
    }
  }
  return listLocalUsers();
}

export function getContentStorageInfo() {
  if (isWordPressBackend()) {
    const replicas = [];
    if (
      isCloudflareKvConfigured() ||
      process.env.COURSE_ACCESS_STORE === "cloudflare"
    ) {
      replicas.push("cloudflare-kv");
    }
    return { provider: "wordpress-graphql-user-meta", replicas };
  }
  return getLocalStorageInfo();
}
