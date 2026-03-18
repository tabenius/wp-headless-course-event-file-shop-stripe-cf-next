export const runtime = "edge";

import { NextResponse } from "next/server";
import { fetchGraphQL } from "@/lib/client";
import { embedTexts, chatWithContext } from "@/lib/ai";
import { stripHtml } from "@/lib/stripHtml";
import { requireAdmin } from "@/lib/adminRoute";

const INDEX_CACHE = { ts: 0, chunks: [] };
const CACHE_TTL_MS = 10 * 60 * 1000;

function chunkText(text, maxLen = 900) {
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

async function buildIndex(force = false) {
  const now = Date.now();
  if (!force && INDEX_CACHE.chunks.length > 0 && now - INDEX_CACHE.ts < CACHE_TTL_MS) {
    return INDEX_CACHE.chunks;
  }

  const data = await fetchGraphQL(
    `query RagbazIndex {
      posts(first: 10) { edges { node { id uri title content } } }
      pages(first: 10) { edges { node { id uri title content } } }
      events(first: 10) { edges { node { id uri title content } } }
      lpCourses(first: 10) { edges { node { id uri title content } } }
    }`,
    {},
    120,
  );

  const nodes = [
    ...(data?.posts?.edges || []).map((e) => ({ ...e.node, kind: "post" })),
    ...(data?.pages?.edges || []).map((e) => ({ ...e.node, kind: "page" })),
    ...(data?.events?.edges || []).map((e) => ({ ...e.node, kind: "event" })),
    ...(data?.lpCourses?.edges || []).map((e) => ({ ...e.node, kind: "course" })),
  ];

  const chunks = [];
  for (const n of nodes) {
    const text = stripHtml(n.content || "").replace(/\s+/g, " ").trim();
    const base = `${n.title || ""}\n\n${text}`;
    for (const chunk of chunkText(base)) {
      chunks.push({
        id: `${n.id}-${chunks.length}`,
        uri: n.uri,
        title: n.title,
        kind: n.kind,
        text: chunk,
      });
    }
  }

  const embeddings = await embedTexts(chunks.map((c) => c.text));
  INDEX_CACHE.chunks = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
  INDEX_CACHE.ts = now;
  return INDEX_CACHE.chunks;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const message = (body?.message || "").trim();
    const force = body?.rebuild === true;
    if (!message) return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });

    const admin = force ? requireAdmin(request) : null;
    if (admin?.error) return admin.error;

    // Lightweight intent routing for admin-only helpers
    const lower = message.toLowerCase();
    const origin = new URL(request.url).origin;

    async function fetchAdminJson(path) {
      const res = await fetch(`${origin}${path}`, {
        headers: { Cookie: request.headers.get("cookie") || "" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `Failed to load ${path}`);
      return json;
    }

    // List products / items
    if (lower.includes("products") || lower.includes("items in shop")) {
      const adminAuth = requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const json = await fetchAdminJson("/api/admin/products");
      const rows = Array.isArray(json.products) ? json.products : [];
      const summary = rows
        .slice(0, 10)
        .map((p) => `${p.name || "Unnamed"} — ${p.type || ""} — ${p.priceCents ? p.priceCents / 100 + " " + (p.currency || "SEK") : "no price"}`)
        .join("\n");
      return NextResponse.json({
        ok: true,
        answer: rows.length === 0 ? "No products found." : `Top products:\n${summary}`,
        sources: [],
      });
    }

    // Access / price lookup for a specific URI
    if (lower.includes("access") || lower.includes("price")) {
      const adminAuth = requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const uriMatch = message.match(/\\/[A-Za-z0-9\\-\\/]+/);
      const targetUri = uriMatch ? uriMatch[0].replace(/\\/+$/, "") : "";
      const json = await fetchAdminJson("/api/admin/course-access");
      const courses = json.courses || {};
      if (targetUri && courses[targetUri]) {
        const cfg = courses[targetUri];
        const users = Array.isArray(cfg.allowedUsers) ? cfg.allowedUsers.join(", ") : "none";
        const price = cfg.priceCents ? `${(cfg.priceCents / 100).toFixed(2)} ${cfg.currency || "SEK"}` : "not set";
        return NextResponse.json({
          ok: true,
          answer: `Access for ${targetUri}: price ${price}; allowed users: ${users}`,
          sources: [],
        });
      }
      return NextResponse.json({
        ok: true,
        answer: "I could not find an access rule for that URI. Use the admin Content & access tab to configure it.",
        sources: [],
      });
    }

    // Payments / receipts
    if (lower.includes("payment") || lower.includes("receipt")) {
      const adminAuth = requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const emailMatch = message.match(/\\b[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b/);
      const email = emailMatch ? emailMatch[0] : "";
      const url = new URL(`${origin}/api/admin/payments`);
      if (email) url.searchParams.set("email", email);
      const res = await fetch(url.toString(), { headers: { Cookie: request.headers.get("cookie") || "" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        return NextResponse.json({ ok: false, error: json?.error || "Payment lookup failed" }, { status: 500 });
      }
      const rows = Array.isArray(json.payments) ? json.payments : [];
      if (rows.length === 0) {
        return NextResponse.json({ ok: true, answer: "No payments found.", sources: [] });
      }
      const summary = rows
        .slice(0, 5)
        .map((p) => `${new Date(p.created).toLocaleString("sv-SE")}: ${(p.amount / 100).toFixed(2)} ${p.currency?.toUpperCase()} — ${p.status} — ${p.email || "no email"}${p.receiptUrl ? ` (receipt: ${p.receiptUrl})` : ""}`)
        .join(\"\\n\");
      return NextResponse.json({ ok: true, answer: summary, sources: [] });
    }

    const index = await buildIndex(force);
    if (index.length === 0) return NextResponse.json({ ok: false, error: "No content available" }, { status: 503 });

    const qEmbed = await embedTexts([message]);
    const scores = index.map((c) => ({
      score: cosine(qEmbed[0], c.embedding),
      chunk: c,
    }));
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, 5).map((s) => s.chunk);

    const context = top
      .map((c) => `Title: ${c.title}\nURI: ${c.uri}\nText: ${c.text}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are RAGBAZ assistant. Be concise. Only use the provided context and never invent URLs. If unsure, say you don't know.\n\nIf the question is about logs/debugging, explain likely meaning and next steps. Common patterns: 
- 401/403: missing admin session or auth header to WordPress GraphQL
- 404/500 from /api/admin/*: admin session expired, retry login or check WORDPRESS URL/auth env
- 4xx from /api/stripe: check STRIPE_SECRET_KEY / webhook
- Fetch failed to WordPress: verify NEXT_PUBLIC_WORDPRESS_URL and auth token/app password
- Vary header / cache: advise purge cache endpoint\n\nContext:\n${context}`;
    const history = Array.isArray(body?.history) ? body.history : [];
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];
    const answer = await chatWithContext(systemPrompt, messages);

    return NextResponse.json({
      ok: true,
      answer,
      sources: top.map((c) => ({ uri: c.uri, title: c.title, kind: c.kind })),
    });
  } catch (error) {
    console.error("chat error", error);
    return NextResponse.json({ ok: false, error: error.message || "Chat failed" }, { status: 500 });
  }
}
