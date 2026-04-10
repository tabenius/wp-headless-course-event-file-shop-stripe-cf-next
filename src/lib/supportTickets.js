import { getD1Database } from "@/lib/d1Bindings";

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

export async function listTickets() {
  const db = await getD1Database();
  const { results: tickets } = await db
    .prepare("SELECT * FROM support_tickets ORDER BY created_at DESC")
    .all();
  const output = [];
  for (const row of tickets || []) {
    const { results: comments } = await db
      .prepare(
        "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at",
      )
      .bind(row.id)
      .all();
    output.push(ticketRowToObject(row, comments || []));
  }
  return output;
}

export async function createTicket({
  title,
  description,
  priority = "moderate",
  author = "admin",
  buildTime = "",
  gitSha = "",
}) {
  const db = await getD1Database();
  const id = crypto.randomUUID?.() || `${Date.now()}`;
  const now = new Date().toISOString();
  const safeTitle = String(title || "Untitled").slice(0, 200);
  const safeDesc = String(description || "").slice(0, 5000);
  const safePriority = ["critical", "moderate", "low"].includes(priority)
    ? priority
    : "moderate";
  const safeBuild = typeof buildTime === "string" ? buildTime.slice(0, 40) : "";
  const safeSha = typeof gitSha === "string" ? gitSha.slice(0, 40) : "";
  await db
    .prepare(
      "INSERT INTO support_tickets (id, title, description, priority, status, build_time, git_sha, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)",
    )
    .bind(id, safeTitle, safeDesc, safePriority, safeBuild, safeSha, now, now)
    .run();
  return {
    id,
    title: safeTitle,
    description: safeDesc,
    priority: safePriority,
    status: "open",
    comments: [],
    buildTime: safeBuild,
    gitSha: safeSha,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTicket(id, { status, comment, author = "admin" }) {
  const db = await getD1Database();
  const row = await db
    .prepare("SELECT * FROM support_tickets WHERE id = ?")
    .bind(id)
    .first();
  if (!row) throw new Error("Ticket not found");

  const now = new Date().toISOString();
  const statements = [];

  if (status && ["open", "will-fix", "resolved"].includes(status)) {
    statements.push(
      db
        .prepare(
          "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?",
        )
        .bind(status, now, id),
    );
  } else {
    statements.push(
      db
        .prepare("UPDATE support_tickets SET updated_at = ? WHERE id = ?")
        .bind(now, id),
    );
  }

  if (comment && comment.trim()) {
    const commentId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    statements.push(
      db
        .prepare(
          "INSERT INTO ticket_comments (id, ticket_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(commentId, id, comment.trim().slice(0, 2000), author, now),
    );
  }

  await db.batch(statements);

  const { results: comments } = await db
    .prepare(
      "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at",
    )
    .bind(id)
    .all();
  const updated = await db
    .prepare("SELECT * FROM support_tickets WHERE id = ?")
    .bind(id)
    .first();
  return ticketRowToObject(updated, comments || []);
}

export function getSupportTicketStorageInfo() {
  return {
    provider: "cloudflare-d1",
    tables: ["support_tickets", "ticket_comments"],
  };
}
