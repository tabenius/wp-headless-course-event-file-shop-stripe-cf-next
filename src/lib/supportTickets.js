import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function ticketRowToObject(row, comments = []) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    comments: comments.map((c) => ({
      id: c.id,
      text: c.text,
      author: c.author,
      createdAt: c.created_at,
    })),
    buildTime: row.build_time,
    gitSha: row.git_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const KV_KEY = process.env.CF_TICKETS_KV_KEY || "support-tickets";
const R2_KEY = process.env.CF_TICKETS_R2_KEY || "support-tickets.json";
let inMemoryState = { tickets: [] };

function canUseNode() {
  return (
    typeof process !== "undefined" &&
    process.versions?.node &&
    process.env.NEXT_RUNTIME !== "edge"
  );
}

function sanitizeTicket(ticket) {
  if (!ticket || typeof ticket !== "object") return null;
  const now = new Date().toISOString();
  return {
    id:
      typeof ticket.id === "string" && ticket.id
        ? ticket.id
        : crypto.randomUUID?.() || `${Date.now()}`,
    title: String(ticket.title || "Untitled").slice(0, 200),
    description: String(ticket.description || "").slice(0, 5000),
    priority: ["critical", "moderate", "low"].includes(ticket.priority)
      ? ticket.priority
      : "moderate",
    status: ["open", "will-fix", "resolved"].includes(ticket.status)
      ? ticket.status
      : "open",
    comments: Array.isArray(ticket.comments)
      ? ticket.comments
          .map((c) => ({
            id:
              typeof c.id === "string" && c.id
                ? c.id
                : crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            text: String(c.text || "").slice(0, 2000),
            author: c.author ? String(c.author).slice(0, 120) : null,
            createdAt: c.createdAt || now,
          }))
          .filter((c) => c.text)
      : [],
    buildTime:
      typeof ticket.buildTime === "string" ? ticket.buildTime.slice(0, 40) : "",
    gitSha: typeof ticket.gitSha === "string" ? ticket.gitSha.slice(0, 40) : "",
    createdAt: ticket.createdAt || now,
    updatedAt: ticket.updatedAt || now,
  };
}

function sanitizeState(state) {
  const safeTickets = Array.isArray(state?.tickets)
    ? state.tickets.map(sanitizeTicket).filter(Boolean)
    : [];
  safeTickets.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return { tickets: safeTickets };
}

function isR2Configured() {
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
  const secret =
    process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  return Boolean(accessKeyId && secret && bucket && accountId && canUseNode());
}

function getR2Bucket() {
  return process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
}

async function readKvState() {
  const value = await readCloudflareKvJson(KV_KEY);
  return sanitizeState(value || { tickets: [] });
}

async function writeKvState(state) {
  const safe = sanitizeState(state);
  await writeCloudflareKvJson(KV_KEY, safe);
  return safe;
}

async function getState() {
  if (isCloudflareKvConfigured()) {
    try {
      return await readKvState();
    } catch (error) {
      console.error("KV support tickets read failed", error);
    }
  }
  console.warn(
    "No R2 or KV configured for support tickets; using in-memory only.",
  );
  return sanitizeState(inMemoryState);
}

async function saveState(state) {
  const safe = sanitizeState(state);
  if (isCloudflareKvConfigured()) {
    try {
      return await writeKvState(safe);
    } catch (error) {
      console.error("KV support tickets write failed", error);
    }
  }
  inMemoryState = safe;
  return safe;
}

export async function listTickets() {
  const db = await tryGetD1();
  if (db) {
    const { results: tickets } = await db
      .prepare("SELECT * FROM support_tickets ORDER BY created_at DESC")
      .all();
    const output = [];
    for (const row of tickets || []) {
      const { results: comments } = await db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at")
        .bind(row.id)
        .all();
      output.push(ticketRowToObject(row, comments || []));
    }
    return output;
  }

  // existing KV path (unchanged)
  const state = await getState();
  return state.tickets;
}

export async function createTicket({
  title,
  description,
  priority = "moderate",
  author = "admin",
  buildTime = "",
  gitSha = "",
}) {
  const db = await tryGetD1();
  if (db) {
    const id = crypto.randomUUID?.() || `${Date.now()}`;
    const now = new Date().toISOString();
    const safeTitle = String(title || "Untitled").slice(0, 200);
    const safeDesc = String(description || "").slice(0, 5000);
    const safePriority = ["critical", "moderate", "low"].includes(priority) ? priority : "moderate";
    const safeBuild = typeof buildTime === "string" ? buildTime.slice(0, 40) : "";
    const safeSha = typeof gitSha === "string" ? gitSha.slice(0, 40) : "";
    await db
      .prepare(
        "INSERT INTO support_tickets (id, title, description, priority, status, build_time, git_sha, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)",
      )
      .bind(id, safeTitle, safeDesc, safePriority, safeBuild, safeSha, now, now)
      .run();
    return { id, title: safeTitle, description: safeDesc, priority: safePriority, status: "open", comments: [], buildTime: safeBuild, gitSha: safeSha, createdAt: now, updatedAt: now };
  }

  // existing KV path (unchanged)
  const state = await getState();
  const ticket = sanitizeTicket({
    title,
    description,
    priority,
    status: "open",
    comments: [],
    buildTime,
    gitSha,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author,
  });
  state.tickets = [ticket, ...state.tickets];
  await saveState(state);
  return ticket;
}

export async function updateTicket(id, { status, comment, author = "admin" }) {
  const db = await tryGetD1();
  if (db) {
    const row = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
    if (!row) throw new Error("Ticket not found");

    const now = new Date().toISOString();
    if (status && ["open", "will-fix", "resolved"].includes(status)) {
      await db.prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
    } else {
      await db.prepare("UPDATE support_tickets SET updated_at = ? WHERE id = ?").bind(now, id).run();
    }
    if (comment && comment.trim()) {
      const commentId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      await db
        .prepare("INSERT INTO ticket_comments (id, ticket_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(commentId, id, comment.trim().slice(0, 2000), author, now)
        .run();
    }
    const { results: comments } = await db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at")
      .bind(id)
      .all();
    const updated = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
    return ticketRowToObject(updated, comments || []);
  }

  // existing KV path (unchanged)
  const state = await getState();
  const idx = state.tickets.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Ticket not found");

  const ticket = { ...state.tickets[idx] };
  if (status && ["open", "will-fix", "resolved"].includes(status)) {
    ticket.status = status;
  }
  if (comment && comment.trim()) {
    ticket.comments = [
      ...ticket.comments,
      {
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        text: comment.trim().slice(0, 2000),
        author,
        createdAt: new Date().toISOString(),
      },
    ];
  }
  ticket.updatedAt = new Date().toISOString();
  state.tickets[idx] = sanitizeTicket(ticket);
  const saved = await saveState(state);
  return saved.tickets.find((t) => t.id === ticket.id) || ticket;
}

export function getSupportTicketStorageInfo() {
  if (isCloudflareKvConfigured()) {
    return { provider: "cloudflare-kv", key: KV_KEY };
  }
  return { provider: "memory" };
}
