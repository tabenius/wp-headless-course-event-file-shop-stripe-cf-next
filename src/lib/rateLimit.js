import { readCloudflareKvJson, writeCloudflareKvJson } from "./cloudflareKv";

/**
 * Fixed-window rate limiter backed by Cloudflare KV.
 * Fails open — if KV is unavailable the request is allowed through.
 *
 * @param {string} endpoint  Short label, e.g. "contact"
 * @param {string} identifier  Client IP or user identifier
 * @param {number} limit  Max requests per window
 * @param {number} windowSecs  Window size in seconds (default 1 hour)
 * @returns {{ limited: boolean, remaining: number }}
 */
export async function checkRateLimit(
  endpoint,
  identifier,
  limit,
  windowSecs = 3600,
) {
  try {
    const window = Math.floor(Date.now() / (windowSecs * 1000));
    const key = `rl:${endpoint}:${identifier}:${window}`;
    const current = (await readCloudflareKvJson(key)) ?? { count: 0 };
    const count = (current.count ?? 0) + 1;
    if (count > limit) return { limited: true, remaining: 0 };
    await writeCloudflareKvJson(
      key,
      { count },
      { expirationTtl: windowSecs * 2 },
    );
    return { limited: false, remaining: limit - count };
  } catch {
    // Fail open — do not block requests when KV is unavailable.
    return { limited: false, remaining: -1 };
  }
}

/**
 * Extract the best available client IP from a Next.js / Cloudflare request.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
