import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getD1Database } from "@/lib/d1Bindings";
import { normalizeUsername } from "@/lib/username";

function jsonResponse(payload, init) {
  return NextResponse.json(payload, init);
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeEmail(value) {
  return asString(value).trim().toLowerCase();
}

function makeContactId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parsePayload(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

function normalizeContactRow(row) {
  return {
    id: asString(row?.id),
    email: asString(row?.email),
    phone: asString(row?.phone),
    name: asString(row?.name),
    notes: asString(row?.notes),
    createdAt: asString(row?.created_at),
    updatedAt: asString(row?.updated_at),
    userId: asString(row?.user_id),
    username: asString(row?.username),
    source: asString(row?.source),
  };
}

async function tableExists(db, tableName) {
  const row = await db
    .prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM sqlite_master WHERE type = table AND name = ? LIMIT 1
       ) THEN 1 ELSE 0 END AS table_exists`,
    )
    .bind(tableName)
    .first();
  return Number(row?.table_exists || 0) === 1;
}

async function ensureContactsTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS contacts (
         id TEXT PRIMARY KEY,
         email TEXT NOT NULL DEFAULT  COLLATE NOCASE,
         phone TEXT NOT NULL DEFAULT ,
         name TEXT NOT NULL DEFAULT ,
         notes TEXT NOT NULL DEFAULT ,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
    )
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email)")
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts (updated_at DESC)",
    )
    .run();
}

async function findUserByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return db
    .prepare(
      `SELECT id, email, name, username, created_at, updated_at
       FROM users
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
    )
    .bind(normalized)
    .first();
}

async function findUserById(db, id) {
  const safeId = asString(id).trim();
  if (!safeId) return null;
  return db
    .prepare(
      `SELECT id, email, name, username, created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(safeId)
    .first();
}

function getUsernameSecret() {
  return (
    process.env.USERNAME_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-change-me"
  );
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildOpaqueEmailDerivedUsername(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !crypto?.subtle) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getUsernameSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`username:v1:${normalizedEmail}`),
  );
  return normalizeUsername(bytesToHex(digest).slice(0, 24)) || "";
}

function deriveFallbackName(email, preferredName) {
  const name = asString(preferredName).trim();
  if (name) return name;
  const localPart = normalizeEmail(email).split("@")[0];
  return localPart || "User";
}

async function upsertLinkedUserByEmail(db, email, name, now, preferredId) {
  const normalized = normalizeEmail(email);
  const safeName = deriveFallbackName(normalized, name);
  const existingByEmail = await findUserByEmail(db, normalized);
  if (existingByEmail) {
    await db
      .prepare(
        `UPDATE users
         SET name = CASE WHEN ? !=  THEN ? ELSE name END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(safeName, safeName, now, existingByEmail.id)
      .run();
    return existingByEmail.id;
  }

  const existingByPreferredId = preferredId
    ? await findUserById(db, preferredId)
    : null;
  const userId = existingByPreferredId ? makeUserId() : preferredId || makeUserId();
  const username =
    (await buildOpaqueEmailDerivedUsername(normalized)) ||
    normalizeUsername(userId.replace(/[^0-9a-f]/gi, "").slice(0, 24)) ||
    "0";

  await db
    .prepare(
      `INSERT INTO users (
         id,
         email,
         name,
         username,
         avatar_public,
         password_hash,
         oauth_accounts,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, 0, , [], ?, ?)`,
    )
    .bind(userId, normalized, safeName, username, now, now)
    .run();

  return userId;
}

async function listContactsFromContactsTable(db) {
  const { results } = await db
    .prepare(
      `SELECT
         id,
         email,
         phone,
         name,
         notes,
         created_at,
         updated_at,
          AS user_id,
          AS username,
         contacts AS source
       FROM contacts
       ORDER BY updated_at DESC
       LIMIT 500`,
    )
    .all();
  return (results || [])
    .map((row) => normalizeContactRow(row))
    .filter((item) => item.id && item.email);
}

async function listContactsFromUsers(db, hasContactsTable) {
  if (hasContactsTable) {
    const { results } = await db
      .prepare(
        `SELECT
           merged.id,
           merged.email,
           merged.phone,
           merged.name,
           merged.notes,
           merged.created_at,
           merged.updated_at,
           merged.user_id,
           merged.username,
           merged.source
         FROM (
           SELECT
             COALESCE(c.id, u.id) AS id,
             u.email AS email,
             COALESCE(c.phone, ) AS phone,
             COALESCE(NULLIF(c.name, ), u.name, u.username, ) AS name,
             COALESCE(c.notes, ) AS notes,
             COALESCE(c.created_at, u.created_at, ) AS created_at,
             COALESCE(c.updated_at, u.updated_at, u.created_at) AS updated_at,
             u.id AS user_id,
             u.username AS username,
             users+contacts AS source
           FROM users u
           LEFT JOIN contacts c ON LOWER(c.email) = LOWER(u.email)

           UNION ALL

           SELECT
             c.id AS id,
             c.email AS email,
             c.phone AS phone,
             c.name AS name,
             c.notes AS notes,
             c.created_at AS created_at,
             c.updated_at AS updated_at,
              AS user_id,
              AS username,
             contacts-only AS source
           FROM contacts c
           WHERE NOT EXISTS (
             SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(c.email)
           )
         ) AS merged
         ORDER BY merged.updated_at DESC
         LIMIT 500`,
      )
      .all();
    return (results || [])
      .map((row) => normalizeContactRow(row))
      .filter((item) => item.id && item.email);
  }

  const { results } = await db
    .prepare(
      `SELECT
         u.id AS id,
         u.email AS email,
          AS phone,
         COALESCE(u.name, u.username, ) AS name,
          AS notes,
         COALESCE(u.created_at, ) AS created_at,
         COALESCE(u.updated_at, ) AS updated_at,
         u.id AS user_id,
         u.username AS username,
         users AS source
       FROM users u
       ORDER BY COALESCE(u.updated_at, u.created_at) DESC
       LIMIT 500`,
    )
    .all();
  return (results || [])
    .map((row) => normalizeContactRow(row))
    .filter((item) => item.id && item.email);
}

async function listContacts(db) {
  const [hasUsersTable, hasContactsTable] = await Promise.all([
    tableExists(db, "users"),
    tableExists(db, "contacts"),
  ]);
  if (hasUsersTable) return listContactsFromUsers(db, hasContactsTable);
  if (hasContactsTable) return listContactsFromContactsTable(db);
  return [];
}

async function listPurchasesByEmail(db, email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return [];
  const { results } = await db
    .prepare(
      `SELECT
         da.product_id,
         COALESCE(da.granted_at, ) AS granted_at,
         COALESCE(p.title, p.name, da.product_id) AS title,
         COALESCE(p.currency, ) AS currency,
         p.price_cents
       FROM digital_access da
       LEFT JOIN products p ON p.slug = da.product_id
       WHERE LOWER(da.email) = LOWER(?)
       ORDER BY da.granted_at DESC
       LIMIT 200`,
    )
    .bind(safeEmail)
    .all();
  return (results || []).map((row) => ({
    productId: asString(row.product_id),
    title: asString(row.title),
    grantedAt: asString(row.granted_at),
    currency: asString(row.currency),
    priceCents:
      typeof row.price_cents === "number" && Number.isFinite(row.price_cents)
        ? row.price_cents
        : null,
  }));
}

async function requireDb() {
  const db = await getD1Database();
  if (!db) {
    return jsonResponse(
      { ok: false, error: "D1 binding DB is not available in this runtime." },
      { status: 500 },
    );
  }
  return db;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const db = await requireDb();
  if (db instanceof Response) return db;

  const { searchParams } = new URL(request.url);
  const email = normalizeEmail(searchParams.get("email") || "");

  try {
    if (email) {
      const purchases = await listPurchasesByEmail(db, email);
      return jsonResponse({ ok: true, purchases });
    }
    const contacts = await listContacts(db);
    return jsonResponse({ ok: true, contacts });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: email ? "Failed to load purchases." : "Failed to load contacts.",
        details: String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const db = await requireDb();
  if (db instanceof Response) return db;

  await ensureContactsTable(db);
  const hasUsersTable = await tableExists(db, "users");

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const payload = parsePayload(body);
  const id = asString(payload.id).trim() || makeContactId();
  const email = normalizeEmail(payload.email);
  const phone = asString(payload.phone).trim();
  const name = asString(payload.name).trim();
  const notes = asString(payload.notes);
  const now = new Date().toISOString();

  if (!id) {
    return jsonResponse(
      { ok: false, error: "Missing contact id." },
      { status: 400 },
    );
  }
  if (!email) {
    return jsonResponse(
      { ok: false, error: "Email is required." },
      { status: 400 },
    );
  }

  try {
    const existingContact = await db
      .prepare(
        "SELECT id, email, phone, name, notes, created_at, updated_at FROM contacts WHERE id = ? LIMIT 1",
      )
      .bind(id)
      .first();

    if (hasUsersTable) {
      const userById = await findUserById(db, id);
      if (userById) {
        const lockedEmail = normalizeEmail(userById.email);
        if (email !== lockedEmail) {
          return jsonResponse(
            {
              ok: false,
              error: "Email is read-only for records linked to users.",
            },
            { status: 400 },
          );
        }
      }

      if (existingContact?.email) {
        const linkedUser = await findUserByEmail(db, existingContact.email);
        if (linkedUser) {
          const lockedEmail = normalizeEmail(existingContact.email);
          if (email !== lockedEmail) {
            return jsonResponse(
              {
                ok: false,
                error: "Email is read-only for records linked to users.",
              },
              { status: 400 },
            );
          }
        }
      }
    }

    await db
      .prepare(
        `INSERT INTO contacts (id, email, phone, name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           phone = excluded.phone,
           name = excluded.name,
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
      )
      .bind(id, email, phone, name, notes, now, now)
      .run();

    if (hasUsersTable) {
      await upsertLinkedUserByEmail(db, email, name, now, id);
    }

    const contacts = await listContacts(db);
    const contact =
      contacts.find(
        (entry) =>
          entry.id === id || normalizeEmail(entry.email) === normalizeEmail(email),
      ) || null;
    return jsonResponse({ ok: true, contact, contacts });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: "Failed to save contact.", details: String(error) },
      { status: 500 },
    );
  }
}
