import { NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai";

export const IMAGE_SYSTEM_PROMPT =
  "Write a concise, vivid image generation prompt suited for FLUX (max 60 words). " +
  "Return only the prompt, no explanation, no quotes. Content to base it on: ";

function makeFetch(request, origin) {
  return async function fetchAdminJson(path, options = {}) {
    const res = await fetch(`${origin}${path}`, {
      headers: {
        Cookie: request.headers.get("cookie") || "",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false)
      throw new Error(json?.error || `Failed to load ${path}`);
    return json;
  };
}

function extractEmail(message) {
  const m = message.match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : "";
}

function extractUri(message) {
  const m = message.match(/\/[A-Za-z0-9_\-/.]+/);
  return m ? m[0].replace(/\/+$/, "") : "";
}

function extractPaymentId(message) {
  const m = message.match(/\b(pi_|ch_)[A-Za-z0-9]+/);
  return m ? m[0] : "";
}

function formatCents(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${(currency || "SEK").toUpperCase()}`;
}

// ── Content type listing map (EN / SV / ES) ──
const CONTENT_TYPES = [
  {
    type: "pages",
    re: /list\s*(all\s*)?pages|visa\s*(alla\s*)?sidor|listar\s*(todas\s*(las\s*)?)?p[aá]ginas/i,
  },
  {
    type: "posts",
    re: /list\s*(all\s*)?posts?|visa\s*(alla\s*)?inlägg|listar\s*(todos\s*(los\s*)?)?art[ií]culos/i,
  },
  {
    type: "events",
    re: /list\s*(all\s*)?events?|visa\s*(alla\s*)?evenemang|listar\s*(todos\s*(los\s*)?)?eventos/i,
  },
  {
    type: "courses",
    re: /list\s*(all\s*)?courses?|visa\s*(alla\s*)?kurser|listar\s*(todos\s*(los\s*)?)?cursos/i,
  },
  {
    type: "products",
    re: /list\s*(all\s*)?products?|visa\s*(alla\s*)?produkter|listar\s*(todos\s*(los\s*)?)?productos/i,
  },
];

// ── Multilingual matchers (EN / SV / ES) ──
const RE_SALES = /försäljning|intäkt|omsättning|ventas|ingresos|sales|revenue/i;
const RE_TODAY = /idag|hoy|today/i;
const RE_THIS_WEEK =
  /den\s*här\s*veckan|denna\s*vecka|esta\s*semana|this\s*week/i;
const RE_THIS_MONTH =
  /den\s*här\s*månaden|denna\s*månad|este\s*mes|this\s*month/i;
const RE_WHO_BOUGHT =
  /vem\s*(köpte|har\s*köpt)|qui[eé]n\s*(compr[oó]|ha\s*comprado)|who\s*bought/i;
const RE_GRANT =
  /ge\s*åtkomst|bevilja\s*åtkomst|conceder\s*acceso|dar\s*acceso|grant\s*access/i;
const RE_REVOKE =
  /ta\s*bort\s*åtkomst|återkalla\s*åtkomst|revocar\s*acceso|quitar\s*acceso|revoke\s*access/i;
const RE_REFUND = /återbetal(ning|a)?|reembols[ao]r?|refund/i;
const RE_TOP_PRODUCTS =
  /bästa\s*produkter|mest\s*sålda|bästsäljare|m[aá]s\s*vendidos|mejores\s*productos|top\s*products|best\s*sellers/i;
const RE_REVENUE_TOTAL =
  /total\s*(intäkt|omsättning|revenue)|ingresos\s*totales|revenue\s*total|total\s*revenue|all[\s-]time/i;

// Auth is checked by route.js before calling any handler.
// Return null to fall through to the next handler or RAG.

export async function handleSales(message, lower, request, origin) {
  if (!RE_SALES.test(message)) return null;
  const fetchAdminJson = makeFetch(request, origin);
  const email = extractEmail(message);

  // Date range
  const now = Date.now();
  let fromTs = 0;
  let periodLabel = "all time";
  if (RE_TODAY.test(message)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    fromTs = Math.floor(d.getTime() / 1000);
    periodLabel = "today";
  } else if (RE_THIS_WEEK.test(message)) {
    fromTs = Math.floor(now / 1000 - 7 * 24 * 3600);
    periodLabel = "this week";
  } else if (RE_THIS_MONTH.test(message)) {
    fromTs = Math.floor(now / 1000 - 30 * 24 * 3600);
    periodLabel = "this month";
  }

  let url = `/api/admin/payments?limit=100`;
  if (email) url += `&email=${encodeURIComponent(email)}`;
  if (fromTs) url += `&from=${fromTs}`;

  let json;
  try {
    json = await fetchAdminJson(url);
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Could not load payment data: ${err.message}. Check that STRIPE_SECRET_KEY is configured in your environment.`,
      sources: [],
    });
  }
  const payments = (json.payments || []).filter(
    (p) => p.status === "succeeded",
  );

  if (payments.length === 0) {
    const who = email ? ` for ${email}` : "";
    return NextResponse.json({
      ok: true,
      answer: `No successful payments${who} found for ${periodLabel}.`,
      sources: [],
    });
  }

  const byCurrency = {};
  for (const p of payments) {
    const cur = (p.currency || "sek").toUpperCase();
    byCurrency[cur] = (byCurrency[cur] || 0) + p.amount;
  }
  const totals = Object.entries(byCurrency)
    .map(([cur, cents]) => formatCents(cents, cur))
    .join(", ");

  const who = email ? ` for ${email}` : "";
  return NextResponse.json({
    ok: true,
    answer: `Sales${who} (${periodLabel}): **${totals}** across ${payments.length} payment${payments.length !== 1 ? "s" : ""}.`,
    sources: [],
  });
}

export async function handleWhoBought(message, lower, request, origin) {
  if (!RE_WHO_BOUGHT.test(message)) return null;
  const fetchAdminJson = makeFetch(request, origin);
  const uri = extractUri(message);
  if (!uri) {
    return NextResponse.json({
      ok: true,
      answer:
        "Please include a URI or product slug. Example: who bought /course-name",
      sources: [],
    });
  }

  // Try course access first
  try {
    const json = await fetchAdminJson("/api/admin/course-access");
    const cfg = (json.courses || {})[uri];
    if (cfg) {
      const users =
        Array.isArray(cfg.allowedUsers) && cfg.allowedUsers.length > 0
          ? cfg.allowedUsers.join(", ")
          : "nobody yet";
      return NextResponse.json({
        ok: true,
        answer: `Users with access to ${uri}: ${users}`,
        sources: [],
      });
    }
  } catch {
    // fall through to digital check
  }

  // Try digital product (strip leading /shop/ if present)
  const slug = uri.replace(/^\/shop\//, "").replace(/^\//, "");
  try {
    const dJson = await fetchAdminJson(
      `/api/admin/digital-access?productId=${encodeURIComponent(slug)}`,
    );
    const users = dJson.users || [];
    return NextResponse.json({
      ok: true,
      answer:
        users.length > 0
          ? `Users with access to "${slug}": ${users.join(", ")}`
          : `No users found with access to "${slug}".`,
      sources: [],
    });
  } catch {
    return NextResponse.json({
      ok: true,
      answer: `No access records found for ${uri}.`,
      sources: [],
    });
  }
}

export async function handleGrantAccess(message, lower, request, origin) {
  if (!RE_GRANT.test(message)) return null;
  const email = extractEmail(message);
  const uri = extractUri(message);

  if (!email || !uri) {
    return NextResponse.json({
      ok: true,
      answer:
        "Please include an email and a URI. Example: grant access user@example.com /course-name",
      sources: [],
    });
  }

  const fetchAdminJson = makeFetch(request, origin);

  // Digital product path: /shop/slug
  if (uri.startsWith("/shop/")) {
    const productId = uri.replace(/^\/shop\//, "");
    try {
      await fetchAdminJson("/api/admin/digital-access", {
        method: "POST",
        body: JSON.stringify({ productId, email }),
      });
      return NextResponse.json({
        ok: true,
        answer: `Digital access granted: ${email} → ${uri}`,
        sources: [],
      });
    } catch (err) {
      return NextResponse.json({
        ok: true,
        answer: `Failed to grant digital access: ${err.message}`,
        sources: [],
      });
    }
  }

  // Course / event / product URI path
  try {
    const state = await fetchAdminJson("/api/admin/course-access");
    const cfg = (state.courses || {})[uri] || {
      allowedUsers: [],
      priceCents: 0,
      currency: "SEK",
    };
    const allowedUsers = Array.isArray(cfg.allowedUsers)
      ? [...cfg.allowedUsers]
      : [];
    if (!allowedUsers.includes(email)) allowedUsers.push(email);

    await fetchAdminJson("/api/admin/course-access", {
      method: "PUT",
      body: JSON.stringify({
        courseUri: uri,
        allowedUsers,
        priceCents: cfg.priceCents || 0,
        currency: cfg.currency || "SEK",
      }),
    });

    return NextResponse.json({
      ok: true,
      answer: `Access granted: ${email} → ${uri}`,
      sources: [],
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Failed to grant access: ${err.message}`,
      sources: [],
    });
  }
}

export async function handleRevokeAccess(message, lower, request, origin) {
  if (!RE_REVOKE.test(message)) return null;
  const email = extractEmail(message);
  const uri = extractUri(message);

  if (!email || !uri) {
    return NextResponse.json({
      ok: true,
      answer:
        "Please include an email and a URI. Example: revoke access user@example.com /course-name",
      sources: [],
    });
  }

  const fetchAdminJson = makeFetch(request, origin);

  if (uri.startsWith("/shop/")) {
    const productId = uri.replace(/^\/shop\//, "");
    try {
      await fetchAdminJson("/api/admin/digital-access", {
        method: "DELETE",
        body: JSON.stringify({ productId, email }),
      });
      return NextResponse.json({
        ok: true,
        answer: `Digital access revoked: ${email} removed from ${uri}`,
        sources: [],
      });
    } catch (err) {
      return NextResponse.json({
        ok: true,
        answer: `Failed to revoke digital access: ${err.message}`,
        sources: [],
      });
    }
  }

  try {
    const state = await fetchAdminJson("/api/admin/course-access");
    const cfg = (state.courses || {})[uri];
    if (!cfg) {
      return NextResponse.json({
        ok: true,
        answer: `No access rule found for ${uri}.`,
        sources: [],
      });
    }
    const allowedUsers = (
      Array.isArray(cfg.allowedUsers) ? cfg.allowedUsers : []
    ).filter((u) => u !== email);

    await fetchAdminJson("/api/admin/course-access", {
      method: "PUT",
      body: JSON.stringify({
        courseUri: uri,
        allowedUsers,
        priceCents: cfg.priceCents || 0,
        currency: cfg.currency || "SEK",
      }),
    });

    return NextResponse.json({
      ok: true,
      answer: `Access revoked: ${email} removed from ${uri}`,
      sources: [],
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Failed to revoke access: ${err.message}`,
      sources: [],
    });
  }
}

export async function handleRefund(message, lower, request, origin) {
  if (!RE_REFUND.test(message)) return null;
  const paymentId = extractPaymentId(message);

  if (!paymentId) {
    return NextResponse.json({
      ok: true,
      answer:
        "Please include a payment ID. Example: refund pi_3abc123 or refund ch_xxx",
      sources: [],
    });
  }

  const fetchAdminJson = makeFetch(request, origin);
  try {
    const body = paymentId.startsWith("pi_")
      ? { paymentIntentId: paymentId }
      : { chargeId: paymentId };
    const json = await fetchAdminJson("/api/admin/refund", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json({
      ok: true,
      answer: `Refund created: **${formatCents(json.refund.amount, json.refund.currency)}** — status: ${json.refund.status} (ID: ${json.refund.id})`,
      sources: [],
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Refund failed: ${err.message}`,
      sources: [],
    });
  }
}

export async function handleTopProducts(message, lower, request, origin) {
  if (!RE_TOP_PRODUCTS.test(message)) return null;
  const fetchAdminJson = makeFetch(request, origin);

  let json;
  try {
    json = await fetchAdminJson("/api/admin/payments?limit=100");
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Could not load payment data: ${err.message}.`,
      sources: [],
    });
  }
  const payments = (json.payments || []).filter(
    (p) => p.status === "succeeded",
  );

  const counts = {};
  for (const p of payments) {
    const key = p.description || "Unknown";
    if (!counts[key])
      counts[key] = { count: 0, totalCents: 0, currency: p.currency };
    counts[key].count += 1;
    counts[key].totalCents += p.amount;
  }

  const ranked = Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  if (ranked.length === 0) {
    return NextResponse.json({
      ok: true,
      answer: "No sales data found.",
      sources: [],
    });
  }

  const rows = ranked
    .map(
      ([desc, data], i) =>
        `${i + 1}. **${desc}** — ${data.count} sale${data.count !== 1 ? "s" : ""}, ${formatCents(data.totalCents, data.currency)}`,
    )
    .join("\n");

  return NextResponse.json({
    ok: true,
    answer: `Top products by sales:\n${rows}`,
    sources: [],
  });
}

export async function handleRevenueTotal(message, lower, request, origin) {
  if (!RE_REVENUE_TOTAL.test(message)) return null;
  const fetchAdminJson = makeFetch(request, origin);

  let json;
  try {
    json = await fetchAdminJson("/api/admin/payments?limit=100");
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Could not load payment data: ${err.message}.`,
      sources: [],
    });
  }
  const payments = (json.payments || []).filter(
    (p) => p.status === "succeeded",
  );

  if (payments.length === 0) {
    return NextResponse.json({
      ok: true,
      answer: "No successful payments found.",
      sources: [],
    });
  }

  const byCurrency = {};
  for (const p of payments) {
    const cur = (p.currency || "sek").toUpperCase();
    byCurrency[cur] = (byCurrency[cur] || 0) + p.amount;
  }
  const totals = Object.entries(byCurrency)
    .map(([cur, cents]) => formatCents(cents, cur))
    .join(", ");

  return NextResponse.json({
    ok: true,
    answer: `Total revenue (last 100 charges): **${totals}** across ${payments.length} payment${payments.length !== 1 ? "s" : ""}.`,
    sources: [],
  });
}

export async function handleProducts(message, lower, request, origin) {
  if (!lower.includes("products") && !lower.includes("items in shop"))
    return null;
  const fetchAdminJson = makeFetch(request, origin);
  const json = await fetchAdminJson("/api/admin/products");
  const rows = Array.isArray(json.products) ? json.products : [];
  const summary = rows
    .slice(0, 10)
    .map(
      (p) =>
        `${p.name || "Unnamed"} — ${p.type || ""} — ${p.priceCents ? p.priceCents / 100 + " " + (p.currency || "SEK") : "no price"}`,
    )
    .join("\n");
  return NextResponse.json({
    ok: true,
    answer:
      rows.length === 0 ? "No products found." : `Top products:\n${summary}`,
    sources: [],
  });
}

export async function handleAccess(message, lower, request, origin) {
  if (!lower.includes("access") && !lower.includes("price")) return null;
  // Let the more specific grant/revoke handlers take these
  if (RE_GRANT.test(message) || RE_REVOKE.test(message)) return null;
  const fetchAdminJson = makeFetch(request, origin);
  const uri = extractUri(message);
  const json = await fetchAdminJson("/api/admin/course-access");
  const courses = json.courses || {};
  if (uri && courses[uri]) {
    const cfg = courses[uri];
    const users = Array.isArray(cfg.allowedUsers)
      ? cfg.allowedUsers.join(", ")
      : "none";
    const price = cfg.priceCents
      ? `${(cfg.priceCents / 100).toFixed(2)} ${cfg.currency || "SEK"}`
      : "not set";
    return NextResponse.json({
      ok: true,
      answer: `Access for ${uri}: price ${price}; allowed users: ${users}`,
      sources: [],
    });
  }
  return NextResponse.json({
    ok: true,
    answer:
      "I could not find an access rule for that URI. Use the admin Content & access tab to configure it.",
    sources: [],
  });
}

export async function handlePayments(message, lower, request, origin) {
  if (!lower.includes("payment") && !lower.includes("receipt")) return null;
  const email = extractEmail(message);
  const fetchAdminJson = makeFetch(request, origin);
  const url = email
    ? `/api/admin/payments?email=${encodeURIComponent(email)}&limit=10`
    : `/api/admin/payments?limit=6`;
  let json;
  try {
    json = await fetchAdminJson(url);
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Could not load payments: ${err.message}.`,
      sources: [],
    });
  }
  const tableRows = (json.payments || []).slice(0, 6).map((p) => {
    const receipt = p.receiptUrl ? `[Receipt](${p.receiptUrl})` : "—";
    return `| ${new Date(p.created).toLocaleString("sv-SE")} | ${(p.amount / 100).toFixed(2)} ${p.currency?.toUpperCase()} | ${p.status} | ${p.email || "—"} | ${receipt} |`;
  });
  const table = [
    "| Date | Amount | Status | Email | Receipt |",
    "| --- | --- | --- | --- | --- |",
    ...tableRows,
  ].join("\n");
  return NextResponse.json({
    ok: true,
    answer: `Payments${email ? ` for ${email}` : ""}:\n\n${table}`,
    sources: [],
  });
}

export async function handleListContent(message, lower, request, origin) {
  const match = CONTENT_TYPES.find(({ re }) => re.test(message));
  if (!match) return null;
  const fetchAdminJson = makeFetch(request, origin);
  try {
    const json = await fetchAdminJson(`/api/admin/content?type=${match.type}`);
    const items = json.items || [];
    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        answer: `No ${match.type} found.`,
        sources: [],
      });
    }
    const rows = items
      .map((i) => `- **${i.title}** — ${i.uri || "no URI"}`)
      .join("\n");
    return NextResponse.json({
      ok: true,
      answer: `${match.type.charAt(0).toUpperCase() + match.type.slice(1)} (${items.length}):\n${rows}`,
      sources: items.map((i) => ({
        uri: i.uri,
        title: i.title,
        kind: match.type.replace(/s$/, ""),
      })),
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      answer: `Failed to list ${match.type}: ${err.message}`,
      sources: [],
    });
  }
}

export async function handleImageGen(message, lower, request, origin) {
  const imageKeywords = [
    "generate image",
    "create image",
    "make image",
    "skapa bild",
    "genera imagen",
  ];
  if (!imageKeywords.some((kw) => lower.includes(kw))) return null;
  const prompt = await chatWithContext(IMAGE_SYSTEM_PROMPT + message, [
    { role: "user", content: message },
  ]);
  return NextResponse.json({
    ok: true,
    type: "image-generation",
    prompt: prompt.trim(),
  });
}
