import { getD1Database } from "@/lib/d1Bindings";

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeProductId(productId) {
  return typeof productId === "string" ? productId.trim() : "";
}

// ── D1 backend ──────────────────────────────────────────────────────────────

async function getD1() {
  const db = await getD1Database();
  if (!db)
    throw new Error("D1 database is not configured for digital access store.");
  return db;
}

async function d1Grant(db, productId, email) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO digital_access (email, product_id) VALUES (?, ?)",
    )
    .bind(email, productId)
    .run();
}

async function d1Has(db, productId, email) {
  const row = await db
    .prepare(
      "SELECT 1 FROM digital_access WHERE email = ? AND product_id = ? LIMIT 1",
    )
    .bind(email, productId)
    .first();
  return Boolean(row);
}

async function d1ListProducts(db, email) {
  const { results } = await db
    .prepare("SELECT product_id FROM digital_access WHERE email = ?")
    .bind(email)
    .all();
  return (results || []).map((r) => r.product_id);
}

async function d1Revoke(db, productId, email) {
  await db
    .prepare("DELETE FROM digital_access WHERE email = ? AND product_id = ?")
    .bind(email, productId)
    .run();
}

async function d1ListUsers(db, productId) {
  const { results } = await db
    .prepare("SELECT email FROM digital_access WHERE product_id = ?")
    .bind(productId)
    .all();
  return (results || []).map((r) => r.email);
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function grantDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return;
  const db = await getD1();
  await d1Grant(db, pid, em);
}

export async function hasDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return false;
  const db = await getD1();
  return d1Has(db, pid, em);
}

export async function hasDigitalAccessUncached(productId, email) {
  // D1 reads are always consistent — no cache concern
  return hasDigitalAccess(productId, email);
}

export async function listAccessibleDigitalProductIds(email) {
  const em = normalizeEmail(email);
  if (!em) return [];
  const db = await getD1();
  return d1ListProducts(db, em);
}

export async function revokeDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return;
  const db = await getD1();
  await d1Revoke(db, pid, em);
}

export async function listUsersWithProductAccess(productId) {
  const pid = normalizeProductId(productId);
  if (!pid) return [];
  const db = await getD1();
  return d1ListUsers(db, pid);
}

export function getDigitalStorageInfo() {
  return {
    provider: "d1",
  };
}
