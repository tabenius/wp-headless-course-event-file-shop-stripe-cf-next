import { getD1Database } from "@/lib/d1Bindings";

/**
 * Fixed-window rate limiter backed by D1 (atomic).
 * Fails open — if D1 is unreachable the request is allowed through.
 */
export async function checkRateLimit(
  endpoint,
  identifier,
  limit,
  windowSecs = 3600,
) {
  try {
    const db = await getD1Database();
    const window = Math.floor(Date.now() / (windowSecs * 1000));
    const key = `rl:${endpoint}:${identifier}:${window}`;
    const expiresAt = new Date((window + 2) * windowSecs * 1000).toISOString();

    // Opportunistic cleanup of expired rows (~1% of requests)
    if (Math.random() < 0.01) {
      db.prepare("DELETE FROM rate_limits WHERE expires_at < datetime('now')")
        .run()
        .catch(() => {});
    }
    const row = await db
      .prepare(
        "INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count",
      )
      .bind(key, expiresAt)
      .first();
    const count = row?.count ?? 0;
    if (count > limit) return { limited: true, remaining: 0 };
    return { limited: false, remaining: limit - count };
  } catch {
    return { limited: false, remaining: -1 };
  }
}

/**
 * Extract the best available client IP from a Next.js / Cloudflare request.
 */
export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
