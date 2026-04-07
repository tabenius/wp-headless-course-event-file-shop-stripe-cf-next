import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getStripeSecretKey } from "@/lib/stripe";

export const runtime = "nodejs";

const CF_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

// ─── Stripe ──────────────────────────────────────────────────────────────────

async function stripeRequest(path, params = {}) {
  const key = await getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");

  const url = new URL(`https://api.stripe.com${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.set(k, String(v));
  });
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Stripe API ${response.status}`);
  return response.json();
}

/**
 * Fetch up to `pages` pages of succeeded charges (100 per page).
 * Returns aggregated revenue by currency, unique customer count,
 * and total transaction count.
 */
async function fetchStripeSummary(maxPages = 5) {
  const revenue = {}; // { currency: totalAmountInSmallestUnit }
  const emails = new Set();
  let transactions = 0;
  let startingAfter;

  for (let page = 0; page < maxPages; page++) {
    const payload = await stripeRequest("/v1/charges", {
      limit: 100,
      starting_after: startingAfter,
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    for (const charge of rows) {
      if (charge.status !== "succeeded") continue;
      transactions++;
      const currency = String(charge.currency || "").toUpperCase();
      revenue[currency] = (revenue[currency] || 0) + (charge.amount || 0);
      const email = String(
        charge.receipt_email || charge.billing_details?.email || "",
      )
        .toLowerCase()
        .trim();
      if (email) emails.add(email);
    }

    if (!payload?.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1]?.id;
    if (!startingAfter) break;
  }

  const customers = emails.size;
  const salesPerUser = customers > 0 ? transactions / customers : null;
  return { revenue, transactions, customers, salesPerUser };
}

// ─── Cloudflare Analytics ─────────────────────────────────────────────────────

async function cfGraphQL(token, query, variables) {
  const response = await fetch(CF_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) return null;
  const json = await response.json();
  if (json?.errors?.length > 0) return null;
  return json?.data;
}

/** Fetch 7-day total requests from zone analytics (hits/day average). */
async function fetchWeeklyHitsZone(token, zoneId) {
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = week.toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);

  const query = `
    query WeeklyHits($zoneTag: string!, $since: Date!, $until: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 8
            filter: { date_geq: $since, date_leq: $until }
          ) {
            sum { requests }
          }
        }
      }
    }
  `;

  const data = await cfGraphQL(token, query, { zoneTag: zoneId, since, until });
  const groups = data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const total = groups.reduce((sum, g) => sum + (g.sum?.requests || 0), 0);
  const days = Math.max(1, groups.length);
  return Math.round(total / days);
}

/** Fetch 7-day total from Workers analytics as fallback. */
async function fetchWeeklyHitsWorkers(token, accountId) {
  const now = new Date();
  const since =
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19) + "Z";
  const until = now.toISOString().slice(0, 19) + "Z";
  const scriptName =
    process.env.CF_WORKER_NAME || "articulate-learnpress-stripe";

  const query = `
    query WeeklyWorkers($accountTag: string!, $since: Time!, $until: Time!, $scriptName: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 168
            filter: { datetime_geq: $since, datetime_lt: $until, scriptName: $scriptName }
          ) {
            sum { requests }
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
  const groups = data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  const total = groups.reduce((sum, g) => sum + (g.sum?.requests || 0), 0);
  return Math.round(total / 7);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  try {
    const stripeSecretKey = await getStripeSecretKey();
    const results = await Promise.allSettled([
      // Stripe summary
      stripeSecretKey
        ? fetchStripeSummary()
        : Promise.reject(new Error("no stripe key")),

      // Weekly hits
      (() => {
        const token =
          process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
        const zoneId = process.env.CF_ZONE_ID;
        const accountId =
          process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
        if (!token) return Promise.reject(new Error("no cf token"));
        if (zoneId) return fetchWeeklyHitsZone(token, zoneId);
        if (accountId) return fetchWeeklyHitsWorkers(token, accountId);
        return Promise.reject(new Error("no cf zone or account"));
      })(),
    ]);

    const stripeResult = results[0];
    const hitsResult = results[1];

    const stripeSummary =
      stripeResult.status === "fulfilled" ? stripeResult.value : null;
    const weeklyAvgHitsPerDay =
      hitsResult.status === "fulfilled" ? hitsResult.value : null;

    const defaultCurrency = (
      process.env.DEFAULT_CURRENCY ||
      process.env.DEFAULT_COURSE_FEE_CURRENCY ||
      "SEK"
    ).toUpperCase();

    return NextResponse.json({
      ok: true,
      stats: {
        revenue: stripeSummary?.revenue ?? null,
        currency: defaultCurrency,
        transactions: stripeSummary?.transactions ?? null,
        customers: stripeSummary?.customers ?? null,
        salesPerUser: stripeSummary?.salesPerUser ?? null,
        weeklyAvgHitsPerDay,
      },
      availableStripe: stripeResult.status === "fulfilled",
      availableAnalytics: hitsResult.status === "fulfilled",
    });
  } catch (error) {
    console.error("Stats ticker error:", error);
    return NextResponse.json({
      ok: true,
      stats: {
        revenue: null,
        currency: "SEK",
        transactions: null,
        customers: null,
        salesPerUser: null,
        weeklyAvgHitsPerDay: null,
      },
      availableStripe: false,
      availableAnalytics: false,
      error: error?.message || "unknown",
    });
  }
}
