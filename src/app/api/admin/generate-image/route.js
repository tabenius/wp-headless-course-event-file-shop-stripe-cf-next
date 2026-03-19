export const runtime = "edge";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { generateImage } from "@/lib/ai";
import {
  resolveSize,
  clampCount,
  computeResetsAt,
  arrayBufferToBase64,
} from "@/lib/imageQuota";
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

function kvKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `ai-image-quota-${y}-${m}-${d}`;
}

async function readQuota() {
  try {
    const data = await readCloudflareKvJson(kvKey());
    return { count: Number(data?.count) || 0 };
  } catch {
    return { count: 0 };
  }
}

async function incrementQuota(currentCount, by) {
  if (by <= 0) return;
  try {
    await writeCloudflareKvJson(
      kvKey(),
      { count: currentCount + by },
      { expirationTtl: 30 * 3600 },
    );
  } catch {
    // fail open — quota undercount is acceptable
  }
}

function buildQuotaResponse(used, limit) {
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, resetsAt: computeResetsAt() };
}

function resolveDailyLimit() {
  const raw = Number.parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

function resolveImageTimeoutMs() {
  const raw = Number.parseInt(process.env.AI_IMAGE_TIMEOUT_MS ?? "45000", 10);
  return Number.isFinite(raw) && raw >= 5000 && raw <= 180000 ? raw : 45000;
}

function sanitizePrompt(rawPrompt) {
  return String(rawPrompt || "")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyImageError(error) {
  const code = String(error?.code || "").trim() || "image_generation_failed";
  const rawMessage = String(error?.message || "").trim();
  const message = rawMessage || "Image generation failed";

  if (code === "cf_account_missing") {
    return {
      code,
      message: "Cloudflare account ID is not configured.",
      hint: "Set CLOUDFLARE_ACCOUNT_ID for Workers AI REST fallback.",
    };
  }
  if (code === "cf_api_token_missing") {
    return {
      code,
      message: "Cloudflare API token is not configured.",
      hint: "Set CF_API_TOKEN for Workers AI REST fallback.",
    };
  }
  if (code.includes("network")) {
    return {
      code,
      message: "Could not reach Cloudflare Workers AI.",
      hint: "Check network/connectivity and retry.",
    };
  }
  if (code.includes("http_error")) {
    return {
      code,
      message: "Cloudflare Workers AI returned an error.",
      hint: "Verify model availability, account permissions, and retry.",
    };
  }
  if (code === "image_generation_timeout") {
    return {
      code,
      message: "Image generation timed out.",
      hint: "Retry with fewer images or a simpler prompt.",
    };
  }
  if (code.includes("decode")) {
    return {
      code,
      message: "Image response could not be decoded.",
      hint: "Retry and inspect provider logs if the issue persists.",
    };
  }
  return { code, message, hint: "Retry and inspect server logs for details." };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const timeoutError = new Error("Image generation timed out");
        timeoutError.code = "image_generation_timeout";
        reject(timeoutError);
      }, timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    }),
  ]);
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  const limit = resolveDailyLimit();
  const { count: used } = await readQuota();
  return NextResponse.json({
    ok: true,
    quota: buildQuotaResponse(used, limit),
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const requestId = crypto.randomUUID();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const prompt = sanitizePrompt(body?.prompt);
  if (!prompt)
    return NextResponse.json(
      { ok: false, error: "prompt required" },
      { status: 400 },
    );
  if (prompt.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "prompt too long (max 2000 chars)" },
      { status: 400 },
    );
  }

  const count = clampCount(body?.count);
  const { width, height } = resolveSize(body?.size);
  const limit = resolveDailyLimit();
  const timeoutMs = resolveImageTimeoutMs();
  const model =
    process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";

  const { count: used } = await readQuota();
  if (used + count > limit) {
    return NextResponse.json(
      {
        ok: false,
        error: "Daily limit reached",
        quota: buildQuotaResponse(used, limit),
      },
      { status: 429 },
    );
  }

  const results = await Promise.allSettled(
    Array.from({ length: count }, () =>
      withTimeout(generateImage(prompt, width, height), timeoutMs),
    ),
  );
  const buffers = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const failures = results
    .map((result, index) => ({ result, index }))
    .filter((entry) => entry.result.status === "rejected")
    .map(({ result, index }) => {
      const classified = classifyImageError(result.reason);
      return {
        index,
        ...classified,
        raw: String(result.reason?.message || "").slice(0, 240),
      };
    });

  if (buffers.length === 0) {
    const primary = failures[0] || {
      code: "image_generation_failed",
      message: "All image generation calls failed.",
      hint: "Retry and inspect provider logs.",
      raw: "",
    };
    console.error("image generation failed", {
      requestId,
      count,
      size: { width, height },
      model,
      failures,
    });
    return NextResponse.json(
      {
        ok: false,
        requestId,
        code: primary.code,
        error: primary.message,
        hint: primary.hint,
        diagnostics: {
          failed: failures.length,
          attempted: count,
          model,
          size: `${width}x${height}`,
        },
      },
      { status: 502 },
    );
  }

  const images = buffers.map(arrayBufferToBase64);

  // Use pre-read `used` count to avoid extra KV round-trip (read-then-write is accepted race)
  await incrementQuota(used, images.length);
  const newUsed = used + images.length;

  return NextResponse.json({
    ok: true,
    images,
    quota: buildQuotaResponse(newUsed, limit),
    requestId,
    warnings:
      failures.length > 0
        ? failures.map((failure) => ({
            index: failure.index,
            code: failure.code,
            message: failure.message,
          }))
        : [],
  });
}
