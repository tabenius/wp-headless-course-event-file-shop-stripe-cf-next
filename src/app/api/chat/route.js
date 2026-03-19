export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { embedTexts, chatWithContext } from "@/lib/ai";
import { requireAdmin } from "@/lib/adminRoute";
import { buildIndex, cosine } from "@/lib/chat/rag";
import { detectLanguage } from "@/lib/chat/detect";
import {
  IMAGE_SYSTEM_PROMPT,
  handleProducts,
  handleAccess,
  handlePayments,
  handleImageGen,
} from "@/lib/chat/intents";

export async function POST(request) {
  try {
    const body = await request.json();

    // ── Path A: explicit image-prompt intent (no message field required) ──
    if (body?.intent === "image-prompt") {
      const adminAuth = await requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const description = (body?.description || "").trim();
      const prompt = await chatWithContext(IMAGE_SYSTEM_PROMPT + description, [
        { role: "user", content: description || "generate a compelling product image" },
      ]);
      return NextResponse.json({ ok: true, type: "image-generation", prompt: prompt.trim() });
    }

    const message = (body?.message || "").trim();
    const force = body?.rebuild === true;
    if (!message) return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });

    const admin = force ? await requireAdmin(request) : null;
    if (admin?.error) return admin.error;

    const lower = message.toLowerCase();
    const origin = new URL(request.url).origin;

    // ── Intent routing ──
    for (const handler of [handleProducts, handleAccess, handlePayments, handleImageGen]) {
      const res = await handler(message, lower, request, origin);
      if (res) return res;
    }

    // ── RAG fallback ──
    const index = await buildIndex(force);
    if (index.length === 0) return NextResponse.json({ ok: false, error: "No content available" }, { status: 503 });

    const qEmbed = await embedTexts([message]);
    const scores = index.map((c) => ({ score: cosine(qEmbed[0], c.embedding), chunk: c }));
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, 5).map((s) => s.chunk);

    const context = top.map((c) => `Title: ${c.title}\nURI: ${c.uri}\nText: ${c.text}`).join("\n\n---\n\n");
    const language = detectLanguage(message);
    const systemPrompt = `You are RAGBAZ assistant. Be concise. Only use the provided context and never invent URLs. Respond in ${language}.${language === "Swedish" ? " Use Swedish idioms if you can." : language === "Spanish" ? " Usa modismos si puedes." : ""} If unsure, say you don't know.\n\nIf the question is about logs/debugging, explain likely meaning and next steps. Common patterns: \n- 401/403: missing admin session or auth header to WordPress GraphQL\n- 404/500 from /api/admin/*: admin session expired, retry login or check WORDPRESS URL/auth env\n- 4xx from /api/stripe: check STRIPE_SECRET_KEY / webhook\n- Fetch failed to WordPress: verify NEXT_PUBLIC_WORDPRESS_URL and auth token/app password\n- Vary header / cache: advise purge cache endpoint\n\nContext:\n${context}`;
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
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
