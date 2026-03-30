import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";

export const runtime = "edge";

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function probeWithTimeout(url, init = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      ...init,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body?.url || "").trim();

    if (!isValidHttpUrl(url)) {
      return NextResponse.json(
        {
          ok: false,
          error: "URL must be a valid http(s) address.",
        },
        { status: 400 },
      );
    }

    let response = await probeWithTimeout(url, { method: "HEAD" });
    let method = "HEAD";

    if (response.status === 405 || response.status === 501) {
      response = await probeWithTimeout(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      method = "GET";
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLengthRaw = response.headers.get("content-length");
    const contentLength = Number.parseInt(contentLengthRaw || "", 10);

    return NextResponse.json({
      ok: true,
      reachable: response.ok,
      status: response.status,
      method,
      finalUrl: response.url || url,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.name === "AbortError"
            ? "URL validation timed out."
            : error?.message || "URL validation failed.",
      },
      { status: 502 },
    );
  }
}
