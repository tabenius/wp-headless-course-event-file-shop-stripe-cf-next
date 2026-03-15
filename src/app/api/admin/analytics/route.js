import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";

const CF_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

function timeRange() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString().slice(0, 19) + "Z",
    until: now.toISOString().slice(0, 19) + "Z",
    dateStart: since.toISOString().slice(0, 10),
    dateEnd: now.toISOString().slice(0, 10),
  };
}

async function cfGraphQL(token, query, variables) {
  const response = await fetch(CF_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    console.error("Cloudflare GraphQL failed:", response.status);
    return null;
  }
  const json = await response.json();
  if (json?.errors?.length > 0) {
    console.error("Cloudflare GraphQL errors:", json.errors);
    return null;
  }
  return json?.data;
}

/**
 * Zone-level analytics — full HTTP analytics including page views,
 * unique visitors, referrers, and hourly breakdown.
 *
 * Available when CF_ZONE_ID is set (i.e. a custom domain is routed
 * through Cloudflare).
 */
async function fetchZoneAnalytics(token, zoneId) {
  const { since, until, dateStart, dateEnd } = timeRange();

  const query = `
    query ZoneAnalytics($zoneTag: string!, $since: Time!, $until: Time!, $dateStart: Date!, $dateEnd: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1hGroups(
            limit: 24
            filter: { datetime_geq: $since, datetime_lt: $until }
            orderBy: [datetime_ASC]
          ) {
            dimensions { datetime }
            sum { requests pageViews }
          }
          httpRequestsAdaptiveGroups(
            limit: 10
            filter: { datetime_geq: $since, datetime_lt: $until, requestSource: "eyeball" }
            orderBy: [count_DESC]
          ) {
            dimensions { clientRefererHost }
            count
          }
          httpRequests1dGroups(
            limit: 2
            filter: { date_geq: $dateStart, date_leq: $dateEnd }
          ) {
            sum { requests pageViews threats bytes }
            uniq { uniques }
          }
        }
      }
    }
  `;

  const data = await cfGraphQL(token, query, {
    zoneTag: zoneId,
    since,
    until,
    dateStart,
    dateEnd,
  });

  const zone = data?.viewer?.zones?.[0];
  if (!zone) return null;

  const hourly = (zone.httpRequests1hGroups || []).map((g) => ({
    time: g.dimensions?.datetime,
    requests: g.sum?.requests || 0,
    pageViews: g.sum?.pageViews || 0,
  }));

  const referrers = (zone.httpRequestsAdaptiveGroups || [])
    .filter((g) => g.dimensions?.clientRefererHost)
    .map((g) => ({
      host: g.dimensions.clientRefererHost,
      count: g.count || 0,
    }));

  const daily = zone.httpRequests1dGroups || [];
  const totals = daily.reduce(
    (acc, d) => ({
      requests: acc.requests + (d.sum?.requests || 0),
      pageViews: acc.pageViews + (d.sum?.pageViews || 0),
      uniques: acc.uniques + (d.uniq?.uniques || 0),
      bytes: acc.bytes + (d.sum?.bytes || 0),
    }),
    { requests: 0, pageViews: 0, uniques: 0, bytes: 0 },
  );

  return { hourly, referrers, totals };
}

/**
 * Workers-level analytics — basic invocation metrics per script.
 *
 * Available when CLOUDFLARE_ACCOUNT_ID is set (always, for workers.dev).
 * No zone needed. Does not provide referrers or page views, only
 * request counts, errors, CPU time, and duration.
 *
 * The worker script name comes from CF_WORKER_NAME or defaults to
 * the wrangler.jsonc "name" field.
 */
async function fetchWorkersAnalytics(token, accountId) {
  const scriptName =
    process.env.CF_WORKER_NAME || "articulate-learnpress-stripe";
  const { since, until } = timeRange();

  const query = `
    query WorkersAnalytics($accountTag: string!, $since: Time!, $until: Time!, $scriptName: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 24
            filter: {
              datetime_geq: $since
              datetime_lt: $until
              scriptName: $scriptName
            }
            orderBy: [datetime_ASC]
          ) {
            dimensions { datetime }
            sum {
              requests
              subrequests
              errors
            }
          }
        }
      }
    }
  `;

  const data = await cfGraphQL(token, query, {
    accountTag: accountId,
    since,
    until,
    scriptName,
  });

  const account = data?.viewer?.accounts?.[0];
  if (!account) return null;

  const groups = account.workersInvocationsAdaptive || [];

  const hourly = groups.map((g) => ({
    time: g.dimensions?.datetime,
    requests: g.sum?.requests || 0,
    pageViews: 0, // not available at worker level
  }));

  const totals = groups.reduce(
    (acc, g) => ({
      requests: acc.requests + (g.sum?.requests || 0),
      subrequests: acc.subrequests + (g.sum?.subrequests || 0),
      errors: acc.errors + (g.sum?.errors || 0),
      pageViews: 0,
      uniques: 0,
      bytes: 0,
    }),
    { requests: 0, subrequests: 0, errors: 0, pageViews: 0, uniques: 0, bytes: 0 },
  );

  return { hourly, referrers: [], totals };
}

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  const token = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  let analytics = null;
  let mode = "none"; // "zone" | "workers" | "none"

  if (token && zoneId) {
    analytics = await fetchZoneAnalytics(token, zoneId);
    if (analytics) mode = "zone";
  }

  if (!analytics && token && accountId) {
    analytics = await fetchWorkersAnalytics(token, accountId);
    if (analytics) mode = "workers";
  }

  return NextResponse.json({
    ok: true,
    analytics,
    mode,
    configured: Boolean(token && (zoneId || accountId)),
  });
}
