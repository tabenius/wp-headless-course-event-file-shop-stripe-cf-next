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

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth?.error) return auth.error;

  const limit = parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10);
  const { count: used } = await readQuota();
  return NextResponse.json({
    ok: true,
    quota: buildQuotaResponse(used, limit),
  });
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth?.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const prompt = (body?.prompt || "").trim();
  if (!prompt)
    return NextResponse.json(
      { ok: false, error: "prompt required" },
      { status: 400 },
    );

  const count = clampCount(body?.count);
  const { width, height } = resolveSize(body?.size);
  const limit = parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10);

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
    Array.from({ length: count }, () => generateImage(prompt, width, height)),
  );
  const buffers = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  if (buffers.length === 0) {
    const firstError =
      results.find((r) => r.status === "rejected")?.reason?.message ||
      "All FLUX calls failed";
    return NextResponse.json({ ok: false, error: firstError }, { status: 502 });
  }

  const images = buffers.map(arrayBufferToBase64);

  // Use pre-read `used` count to avoid extra KV round-trip (read-then-write is accepted race)
  await incrementQuota(used, images.length);
  const newUsed = used + images.length;

  return NextResponse.json({
    ok: true,
    images,
    quota: buildQuotaResponse(newUsed, limit),
  });
}
