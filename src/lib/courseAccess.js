import {
  getCourseAccessConfig as getLocalCourseAccessConfig,
  getCourseAccessState as getLocalCourseAccessState,
  getCourseStorageInfo as getLocalStorageInfo,
  grantCourseAccess as grantLocalCourseAccess,
  hasCourseAccess as hasLocalCourseAccess,
  setCourseAccess as setLocalCourseAccess,
} from "@/lib/courseAccessStore";
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

function normalizeCourseUri(courseUri) {
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
    Number.parseInt(process.env.GRAPHQL_DELAY_MS || "150", 10) || 0;
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

async function getWordPressAdminState() {
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
    data = await fetchWordPressGraphQL(queryWithActive);
  } catch (error) {
    if (!isActiveSchemaMismatch(error)) throw error;
    data = await fetchWordPressGraphQL(queryLegacy);
  }
  const rules = Array.isArray(data?.courseAccessRules)
    ? data.courseAccessRules
    : [];
  const courses = {};
  for (const rule of rules) {
    const uri = normalizeCourseUri(rule?.courseUri);
    if (!uri) continue;
    courses[uri] = {
      allowedUsers: Array.isArray(rule.allowedUsers) ? rule.allowedUsers : [],
      priceCents:
        typeof rule.priceCents === "number" && rule.priceCents >= 0
          ? rule.priceCents
          : 0,
      currency:
        typeof rule.currency === "string" ? rule.currency.toUpperCase() : "SEK",
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
}) {
  const normalizedCourseUri = normalizeCourseUri(courseUri);
  if (!normalizedCourseUri) {
    throw new Error("Invalid course URI");
  }
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
  if (typeof active === "boolean") {
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
  const normalizedCourseUri = normalizeCourseUri(courseUri);
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

async function grantWordPressCourseAccess(courseUri, email) {
  const normalizedCourseUri = normalizeCourseUri(courseUri);
  if (!normalizedCourseUri) {
    throw new Error("Invalid course URI");
  }
  const mutation = `
    mutation GrantCourseAccess($courseUri: String!, $email: String!) {
      grantCourseAccess(input: { courseUri: $courseUri, email: $email }) {
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
  const normalizedCourseUri = normalizeCourseUri(courseUri);
  if (!normalizedCourseUri) return null;
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
    data = await fetchWordPressGraphQL(queryWithActive, {
      courseUri: normalizedCourseUri,
    });
  } catch (error) {
    if (!isActiveSchemaMismatch(error)) throw error;
    data = await fetchWordPressGraphQL(queryLegacy, {
      courseUri: normalizedCourseUri,
    });
  }
  return data?.courseAccessConfig || null;
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

export async function getCourseAccessState() {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return getLocalCourseAccessState();
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
      return getLocalCourseAccessState();
    }
  }
  return getLocalCourseAccessState();
}

export async function setCourseAccess(payload) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return setLocalCourseAccess(payload);
    }
    try {
      const result = await setWordPressCourseAccess(payload);
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        await setLocalCourseAccess(payload);
      }
      return result;
    } catch (error) {
      console.error(
        "WordPress course access update failed. Falling back to local course access store:",
        error,
      );
      return setLocalCourseAccess(payload);
    }
  }
  return setLocalCourseAccess(payload);
}

export async function hasCourseAccess(courseUri, email) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return hasLocalCourseAccess(courseUri, email);
    }
    try {
      const wpHas = await hasWordPressCourseAccess(courseUri, email);
      if (wpHas) return true;
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        return hasLocalCourseAccess(courseUri, email);
      }
      return false;
    } catch (error) {
      console.error(
        "WordPress course access check failed. Falling back to local course access store:",
        error,
      );
      return hasLocalCourseAccess(courseUri, email);
    }
  }
  return hasLocalCourseAccess(courseUri, email);
}

export async function grantCourseAccess(courseUri, email) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return grantLocalCourseAccess(courseUri, email);
    }
    try {
      await grantWordPressCourseAccess(courseUri, email);
      if (
        isCloudflareKvConfigured() ||
        process.env.COURSE_ACCESS_STORE === "cloudflare"
      ) {
        await grantLocalCourseAccess(courseUri, email);
      }
      return;
    } catch (error) {
      console.error(
        "WordPress course access grant failed. Falling back to local course access store:",
        error,
      );
      return grantLocalCourseAccess(courseUri, email);
    }
  }
  return grantLocalCourseAccess(courseUri, email);
}

export async function getCourseAccessConfig(courseUri) {
  if (isWordPressBackend()) {
    if (!isWordPressBackendConfigured()) {
      console.error(
        "WordPress course backend selected but NEXT_PUBLIC_WORDPRESS_URL is missing. Falling back to local course access store.",
      );
      return getLocalCourseAccessConfig(courseUri);
    }
    try {
      return getWordPressCourseAccessConfig(courseUri);
    } catch (error) {
      console.error(
        "WordPress course config lookup failed. Falling back to local course access store:",
        error,
      );
      return getLocalCourseAccessConfig(courseUri);
    }
  }
  return getLocalCourseAccessConfig(courseUri);
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

export function getCourseStorageInfo() {
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
