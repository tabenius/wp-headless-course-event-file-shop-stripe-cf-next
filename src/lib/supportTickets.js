import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

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
