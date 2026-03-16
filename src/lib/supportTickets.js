import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

function getKvKey() {
  return process.env.CF_TICKETS_KV_KEY || "support-tickets";
}

const LOCAL_FILE = ".data/support-tickets.json";
let inMemoryState = { tickets: [] };

function canUseFs() {
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
    id: typeof ticket.id === "string" && ticket.id ? ticket.id : crypto.randomUUID?.() || `${Date.now()}`,
    title: String(ticket.title || "Untitled").slice(0, 200),
    description: String(ticket.description || "").slice(0, 5000),
    priority: ["critical", "moderate", "low"].includes(ticket.priority)
      ? ticket.priority
      : "moderate",
    status: ["open", "will-fix", "resolved"].includes(ticket.status)
      ? ticket.status
      : "open",
    comments: Array.isArray(ticket.comments)
      ? ticket.comments.map((c) => ({
          id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          text: String(c.text || "").slice(0, 2000),
          author: c.author ? String(c.author).slice(0, 120) : null,
          createdAt: c.createdAt || now,
        })).filter((c) => c.text)
      : [],
    createdAt: ticket.createdAt || now,
    updatedAt: ticket.updatedAt || now,
  };
}

function sanitizeState(state) {
  const safeTickets = Array.isArray(state?.tickets) ? state.tickets.map(sanitizeTicket).filter(Boolean) : [];
  safeTickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { tickets: safeTickets };
}

function shouldUseKv() {
  return process.env.SUPPORT_TICKETS_BACKEND === "cloudflare" || isCloudflareKvConfigured();
}

async function ensureLocalFile() {
  if (!canUseFs()) return;
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const filePath = path.join(process.cwd(), LOCAL_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify({ tickets: [] }, null, 2), "utf8");
  }
}

async function readLocalState() {
  if (!canUseFs()) return sanitizeState(inMemoryState);
  try {
    await ensureLocalFile();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const filePath = path.join(process.cwd(), LOCAL_FILE);
    const raw = await fs.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    console.error("Support tickets local read failed; using memory fallback", error);
    return sanitizeState(inMemoryState);
  }
}

async function writeLocalState(state) {
  const safe = sanitizeState(state);
  if (!canUseFs()) {
    inMemoryState = safe;
    return safe;
  }
  try {
    await ensureLocalFile();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const filePath = path.join(process.cwd(), LOCAL_FILE);
    await fs.writeFile(filePath, JSON.stringify(safe, null, 2), "utf8");
  } catch (error) {
    console.error("Support tickets local write failed; storing in memory", error);
    inMemoryState = safe;
  }
  return safe;
}

async function readKvState() {
  const value = await readCloudflareKvJson(getKvKey());
  return sanitizeState(value || { tickets: [] });
}

async function writeKvState(state) {
  const safe = sanitizeState(state);
  await writeCloudflareKvJson(getKvKey(), safe);
  return safe;
}

async function getState() {
  if (shouldUseKv()) {
    try {
      return await readKvState();
    } catch (error) {
      console.error("Support tickets KV read failed, falling back to local", error);
    }
  }
  return readLocalState();
}

async function saveState(state) {
  const safe = sanitizeState(state);
  if (shouldUseKv()) {
    try {
      const wrote = await writeKvState(safe);
      if (wrote) return safe;
    } catch (error) {
      console.error("Support tickets KV write failed, persisting locally", error);
    }
  }
  return writeLocalState(safe);
}

export async function listTickets() {
  const state = await getState();
  return state.tickets;
}

export async function createTicket({ title, description, priority = "moderate", author = "admin" }) {
  const state = await getState();
  const ticket = sanitizeTicket({ title, description, priority, status: "open", comments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author });
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
  return shouldUseKv()
    ? { provider: "cloudflare-kv", key: getKvKey() }
    : { provider: "local-file", path: LOCAL_FILE };
}
