import {
  getCourseAccessConfig as getLocalCourseAccessConfig,
  getCourseAccessState as getLocalCourseAccessState,
  getCourseStorageInfo as getLocalStorageInfo,
  grantCourseAccess as grantLocalCourseAccess,
  hasCourseAccess as hasLocalCourseAccess,
  setCourseAccess as setLocalCourseAccess,
} from "@/lib/courseAccessStore";
import { listUsers as listLocalUsers } from "@/lib/userStore";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";

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

async function fetchWordPressGraphQL(query, variables = {}) {
  const endpoint = getGraphqlEndpoint();
  if (!endpoint) {
    throw new Error("NEXT_PUBLIC_WORDPRESS_URL is required for wordpress backend");
  }

  const auth = getWordPressGraphqlAuth();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(auth.authorization ? { Authorization: auth.authorization } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || (Array.isArray(json?.errors) && json.errors.length > 0)) {
    const message =
      json?.errors?.[0]?.message || `WordPress GraphQL error (${response.status})`;
    throw new Error(message);
  }
  return json?.data || {};
}

async function getWordPressAdminState() {
  const query = `
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
  const data = await fetchWordPressGraphQL(query);
  const rules = Array.isArray(data?.courseAccessRules) ? data.courseAccessRules : [];
  const courses = {};
  for (const rule of rules) {
    if (!rule?.courseUri) continue;
    courses[rule.courseUri] = {
      allowedUsers: Array.isArray(rule.allowedUsers) ? rule.allowedUsers : [],
      priceCents:
        typeof rule.priceCents === "number" && rule.priceCents >= 0
          ? rule.priceCents
          : 0,
      currency: typeof rule.currency === "string" ? rule.currency.toUpperCase() : "SEK",
      updatedAt: typeof rule.updatedAt === "string" ? rule.updatedAt : "",
    };
  }
  const users = Array.isArray(data?.users?.nodes)
    ? data.users.nodes
        .filter((node) => typeof node?.email === "string" && node.email.includes("@"))
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

async function setWordPressCourseAccess({ courseUri, allowedUsers, priceCents, currency }) {
  const mutation = `
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
  await fetchWordPressGraphQL(mutation, {
    courseUri,
    allowedUsers,
    priceCents,
    currency,
  });
  const state = await getWordPressAdminState();
  return { courses: state.courses };
}

async function hasWordPressCourseAccess(courseUri, email) {
  const query = `
    query CheckCourseAccess($courseUri: String!, $email: String!) {
      courseAccessForUser(courseUri: $courseUri, email: $email) {
        hasAccess
      }
    }
  `;
  const data = await fetchWordPressGraphQL(query, { courseUri, email });
  return Boolean(data?.courseAccessForUser?.hasAccess);
}

async function grantWordPressCourseAccess(courseUri, email) {
  const mutation = `
    mutation GrantCourseAccess($courseUri: String!, $email: String!) {
      grantCourseAccess(input: { courseUri: $courseUri, email: $email }) {
        success
      }
    }
  `;
  await fetchWordPressGraphQL(mutation, { courseUri, email });
}

async function getWordPressCourseAccessConfig(courseUri) {
  const query = `
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
  const data = await fetchWordPressGraphQL(query, { courseUri });
  return data?.courseAccessConfig || null;
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
      return { courses: data.courses };
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
      return setWordPressCourseAccess(payload);
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
      return hasWordPressCourseAccess(courseUri, email);
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
      return grantWordPressCourseAccess(courseUri, email);
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
    return { provider: "wordpress-graphql-user-meta" };
  }
  return getLocalStorageInfo();
}
