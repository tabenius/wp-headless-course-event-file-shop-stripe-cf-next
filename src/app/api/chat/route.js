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

    if (force) {
      const admin = requireAdmin(request);
      if (admin.error) return admin.error;
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

    const systemPrompt = `You are RAGBAZ assistant. Answer concisely using only the provided context. If unsure, say you don't know.\n\nContext:\n${context}`;
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
