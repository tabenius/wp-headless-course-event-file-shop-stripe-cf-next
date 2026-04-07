import { fetchGraphQL } from "@/lib/client";

const STOREFRONT_RAGBAZ_PROBE_QUERY = `
query StorefrontRagbazProbe {
  rootQuery: __type(name: "RootQuery") {
    fields {
      name
    }
  }
  ragbazInfoType: __type(name: "RagbazInfo") {
    name
    fields {
      name
    }
  }
}
`;

const STOREFRONT_GRAPHQL_PROBE_TTL_MS =
  Number.parseInt(
    process.env.STOREFRONT_GRAPHQL_PROBE_TTL_MS || "900000",
    10,
  ) || 900000;

let lastProbeAt = 0;
let pendingProbe = null;

function normalizeIntendedUri(uri) {
  const raw = typeof uri === "string" ? uri.trim() : "";
  if (!raw) return "/";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

export async function probeStorefrontRagbazGraphql(intendedUri) {
  const now = Date.now();
  if (lastProbeAt > 0 && now - lastProbeAt < STOREFRONT_GRAPHQL_PROBE_TTL_MS) {
    return;
  }
  if (pendingProbe) {
    return pendingProbe;
  }
  const uri = normalizeIntendedUri(intendedUri);
  pendingProbe = (async () => {
    try {
      const data = await fetchGraphQL(STOREFRONT_RAGBAZ_PROBE_QUERY, {}, 900);
      const rootFields = Array.isArray(data?.rootQuery?.fields)
        ? data.rootQuery.fields
        : [];
      const ragbazRootFields = rootFields
        .map((field) => String(field?.name || ""))
        .filter((name) => /^ragbaz/i.test(name));
      const ragbazInfoFields = Array.isArray(data?.ragbazInfoType?.fields)
        ? data.ragbazInfoType.fields
            .map((field) => String(field?.name || ""))
            .filter(Boolean)
        : [];

      console.log(
        "[StorefrontGraphQLProbe]",
        JSON.stringify({
          intendedUri: uri,
          hasRagbazRootFields: ragbazRootFields.length > 0,
          ragbazRootFields,
          hasRagbazInfoType: Boolean(data?.ragbazInfoType?.name),
          ragbazInfoFields,
        }),
      );
    } catch (error) {
      console.warn(
        "[StorefrontGraphQLProbe]",
        JSON.stringify({
          intendedUri: uri,
          error: error?.message || String(error),
        }),
      );
    } finally {
      lastProbeAt = Date.now();
    }
  })().finally(() => {
    pendingProbe = null;
  });
  return pendingProbe;
}
