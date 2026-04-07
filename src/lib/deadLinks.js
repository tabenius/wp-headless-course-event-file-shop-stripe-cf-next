import { getPseudoExternalHosts } from "./tenantConfig.js";

const HREF_PATTERN =
  /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

export function extractAnchorsFromHtml(html) {
  if (typeof html !== "string" || html.length === 0) return [];
  const anchors = [];
  const seen = new Set();

  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = normalizeText(match[1] || match[2] || match[3] || "");
    if (!href) continue;
    const dedupeKey = href.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    anchors.push(href);
  }
  return anchors;
}

export function classifyHref(
  href,
  { siteHost, origin, pseudoExternalHosts = [] } = {},
) {
  const rawHref = normalizeText(href);
  if (!rawHref) {
    return {
      href: rawHref,
      kind: "empty",
      translatedPath: null,
      checkUrl: null,
    };
  }

  const normalizedSiteHost = normalizeHost(siteHost);
  const normalizedOrigin = normalizeText(origin);
  const pseudoHosts = getPseudoExternalHosts(pseudoExternalHosts);
  const lowerHref = rawHref.toLowerCase();

  if (lowerHref.startsWith("mailto:") || lowerHref.startsWith("tel:")) {
    return {
      href: rawHref,
      kind: "unsupported",
      translatedPath: null,
      checkUrl: null,
    };
  }

  if (lowerHref.startsWith("javascript:")) {
    return {
      href: rawHref,
      kind: "invalid",
      translatedPath: null,
      checkUrl: null,
    };
  }

  if (rawHref.startsWith("#")) {
    const translatedPath = `/${rawHref}`;
    return {
      href: rawHref,
      kind: "internal",
      translatedPath,
      checkUrl: normalizedOrigin
        ? new URL(translatedPath, normalizedOrigin).toString()
        : null,
    };
  }

  if (rawHref.startsWith("/") || rawHref.startsWith("?")) {
    const translatedPath = rawHref.startsWith("/") ? rawHref : `/${rawHref}`;
    return {
      href: rawHref,
      kind: "internal",
      translatedPath,
      checkUrl: normalizedOrigin
        ? new URL(translatedPath, normalizedOrigin).toString()
        : null,
    };
  }

  let parsed;
  try {
    parsed = new URL(rawHref);
  } catch {
    return {
      href: rawHref,
      kind: "invalid",
      translatedPath: null,
      checkUrl: null,
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      href: rawHref,
      kind: "unsupported",
      translatedPath: null,
      checkUrl: null,
    };
  }

  const host = normalizeHost(parsed.hostname);
  const path = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;

  if (normalizedSiteHost && host === normalizedSiteHost) {
    return {
      href: rawHref,
      kind: "internal",
      translatedPath: path,
      checkUrl: normalizedOrigin
        ? new URL(path, normalizedOrigin).toString()
        : parsed.toString(),
    };
  }

  for (const pseudoHost of pseudoHosts) {
    if (host === pseudoHost || host.endsWith(`.${pseudoHost}`)) {
      return {
        href: rawHref,
        kind: "pseudo-external",
        translatedPath: path,
        checkUrl: normalizedOrigin
          ? new URL(path, normalizedOrigin).toString()
          : parsed.toString(),
      };
    }
  }

  return {
    href: rawHref,
    kind: "external",
    translatedPath: null,
    checkUrl: parsed.toString(),
  };
}

export function summarizeLinkKinds(entries) {
  const summary = {
    total: 0,
    internal: 0,
    pseudoExternal: 0,
    external: 0,
    invalid: 0,
    unsupported: 0,
  };
  for (const entry of Array.isArray(entries) ? entries : []) {
    summary.total += 1;
    if (entry?.kind === "internal") summary.internal += 1;
    else if (entry?.kind === "pseudo-external") summary.pseudoExternal += 1;
    else if (entry?.kind === "external") summary.external += 1;
    else if (entry?.kind === "invalid") summary.invalid += 1;
    else if (entry?.kind === "unsupported") summary.unsupported += 1;
  }
  return summary;
}
