import { NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai";

export const IMAGE_SYSTEM_PROMPT =
  "Write a concise, vivid image generation prompt suited for FLUX (max 60 words). " +
  "Return only the prompt, no explanation, no quotes. Content to base it on: ";

function makeFetch(request, origin) {
  return async function fetchAdminJson(path) {
    const res = await fetch(`${origin}${path}`, {
      headers: { Cookie: request.headers.get("cookie") || "" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false)
      throw new Error(json?.error || `Failed to load ${path}`);
    return json;
  };
}

// Auth is checked by route.js before calling any handler.
// Return null to fall through to the next handler or RAG.

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
  const fetchAdminJson = makeFetch(request, origin);
  const uriMatch = message.match(/\/[A-Za-z0-9\-\/]+/);
  const targetUri = uriMatch ? uriMatch[0].replace(/\/+$/, "") : "";
  const json = await fetchAdminJson("/api/admin/course-access");
  const courses = json.courses || {};
  if (targetUri && courses[targetUri]) {
    const cfg = courses[targetUri];
    const users = Array.isArray(cfg.allowedUsers)
      ? cfg.allowedUsers.join(", ")
      : "none";
    const price = cfg.priceCents
      ? `${(cfg.priceCents / 100).toFixed(2)} ${cfg.currency || "SEK"}`
      : "not set";
    return NextResponse.json({
      ok: true,
      answer: `Access for ${targetUri}: price ${price}; allowed users: ${users}`,
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
  const emailMatch = message.match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0] : "";
  const url = new URL(`${origin}/api/admin/payments`);
  if (email) url.searchParams.set("email", email);
  const res = await fetch(url.toString(), {
    headers: { Cookie: request.headers.get("cookie") || "" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    return NextResponse.json(
      { ok: false, error: json?.error || "Payment lookup failed" },
      { status: 500 },
    );
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
    answer: `Here are the latest payments:\n\n${table}`,
    sources: [],
  });
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
