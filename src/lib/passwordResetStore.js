import { getD1Database } from "@/lib/d1Bindings";

const DEFAULT_TTL_SECS = 86400; // 24 hours

/**
 * Store a password-reset token in D1 with automatic expiry.
 */
export async function createPasswordResetToken(
  token,
  email,
  ttlSecs = DEFAULT_TTL_SECS,
) {
  const db = await getD1Database();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSecs * 1000).toISOString();

  await db
    .prepare(
      "INSERT INTO password_reset_tokens (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(token, email, now.toISOString(), expiresAt)
    .run();
}

/**
 * Read and validate a password-reset token. Returns { email, createdAt } or null.
 */
export async function readPasswordResetToken(token) {
  const db = await getD1Database();
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      "SELECT email, created_at FROM password_reset_tokens WHERE token = ? AND expires_at > ?",
    )
    .bind(token, now)
    .first();
  if (!row) return null;
  return { email: row.email, createdAt: row.created_at };
}

/**
 * Delete a password-reset token (one-time use).
 */
export async function deletePasswordResetToken(token) {
  const db = await getD1Database();
  await db
    .prepare("DELETE FROM password_reset_tokens WHERE token = ?")
    .bind(token)
    .run();
}

/**
 * Opportunistic cleanup of expired tokens (~1% of reads).
 */
export async function maybeCleanupExpiredTokens() {
  if (Math.random() > 0.01) return;
  try {
    const db = await getD1Database();
    await db
      .prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?")
      .bind(new Date().toISOString())
      .run();
  } catch {
    /* best-effort */
  }
}
