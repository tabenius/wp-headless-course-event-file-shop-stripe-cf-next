export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { embedTexts, chatWithContext } from "@/lib/ai";
import { requireAdmin } from "@/lib/adminRoute";
import { buildIndex, cosine } from "@/lib/chat/rag";
import { detectLanguage } from "@/lib/chat/detect";
import {
  saveChatHistory,
  getChatHistory,
  deleteCloudflareKv,
} from "@/lib/cloudflareKv";
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

    // All chat paths require admin auth
    const auth = await requireAdmin(request);
    if (auth?.error) return auth.error;
    // Single-admin system — use a fixed history key
    const historyKey = "admin";
    const chatHistory = await getChatHistory(historyKey);

    // ── Path A: explicit image-prompt intent (no message field required) ──
    if (body?.intent === "image-prompt") {
      const description = (body?.description || "").trim();
      const prompt = await chatWithContext(IMAGE_SYSTEM_PROMPT + description, [
        {
          role: "user",
          content: description || "generate a compelling product image",
        },
      ]);

      // Update chat history — cap at 40 entries (20 turns) to avoid unbounded KV growth
      const updatedHistory = [
        ...chatHistory,
        { role: "user", content: `Image prompt: ${description}` },
        { role: "assistant", content: prompt.trim() },
      ].slice(-40);
      await saveChatHistory(historyKey, updatedHistory);

      return NextResponse.json({
        ok: true,
        type: "image-generation",
        prompt: prompt.trim(),
        history: updatedHistory,
      });
    }

    const message = (body?.message || "").trim();
    const force = body?.rebuild === true;
    if (!message)
      return NextResponse.json(
        { ok: false, error: "Message required" },
        { status: 400 },
      );

    const lower = message.toLowerCase();
    const origin = new URL(request.url).origin;

    // ── Intent routing ──
    for (const handler of [
      handleProducts,
      handleAccess,
      handlePayments,
      handleImageGen,
    ]) {
      const res = await handler(message, lower, request, origin);
      if (res) return res;
    }

    // ── RAG fallback ──
    const index = await buildIndex(force);
    if (index.length === 0)
      return NextResponse.json(
        { ok: false, error: "No content available" },
        { status: 503 },
      );

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
    const language = detectLanguage(message);
    const systemPrompt = `You are RAGBAZ assistant. Be concise. Only use the provided context and never invent URLs. Respond in ${language}.${language === "Swedish" ? " Use Swedish idioms if you can." : language === "Spanish" ? " Usa modismos si puedes." : ""} If unsure, say you don't know.\n\nIf the question is about logs/debugging, explain likely meaning and next steps. Common patterns: \n- 401/403: missing admin session or auth header to WordPress GraphQL\n- 404/500 from /api/admin/*: admin session expired, retry login or check WORDPRESS URL/auth env\n- 4xx from /api/stripe: check STRIPE_SECRET_KEY / webhook\n- Fetch failed to WordPress: verify NEXT_PUBLIC_WORDPRESS_URL and auth token/app password\n- Vary header / cache: advise purge cache endpoint\n\nContext:\n${context}`;

    // Include chat history in the messages
    const history = Array.isArray(chatHistory) ? chatHistory.slice(-10) : [];
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];
    const answer = await chatWithContext(systemPrompt, messages);

    // Update chat history — cap at 40 entries (20 turns) to avoid unbounded KV growth
    const updatedHistory = [
      ...chatHistory,
      { role: "user", content: message },
      { role: "assistant", content: answer },
    ].slice(-40);
    await saveChatHistory(historyKey, updatedHistory);

    return NextResponse.json({
      ok: true,
      answer,
      sources: top.map((c) => ({ uri: c.uri, title: c.title, kind: c.kind })),
      history: updatedHistory,
    });
  } catch (error) {
    console.error("chat error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Chat failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  try {
    await deleteCloudflareKv("chat_history:admin");
  } catch (err) {
    console.error("clear chat history error", err);
  }
  return NextResponse.json({ ok: true });
}
