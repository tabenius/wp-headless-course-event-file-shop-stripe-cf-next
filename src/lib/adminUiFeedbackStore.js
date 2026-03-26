import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = process.env.CF_UI_FEEDBACK_KV_KEY || "admin-ui-feedback";
const VALID_VALUES = new Set(["up", "heart", "down"]);
let memoryStore = { fields: {} };

function normalizeFieldId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const value = String(entry.value || "").trim().toLowerCase();
  if (!VALID_VALUES.has(value)) return null;
  const by = String(entry.by || "").trim().toLowerCase().slice(0, 160);
  const updatedAt = String(entry.updatedAt || "").trim();
  return { value, by, updatedAt };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") return { fields: {} };
  const input = raw.fields && typeof raw.fields === "object" ? raw.fields : {};
  const fields = {};
  for (const [key, entry] of Object.entries(input)) {
    const normalizedKey = normalizeFieldId(key);
    const normalizedEntry = normalizeEntry(entry);
    if (!normalizedKey || !normalizedEntry) continue;
    fields[normalizedKey] = normalizedEntry;
  }
  return { fields };
}

export function isValidUiFeedbackValue(value) {
  return VALID_VALUES.has(String(value || "").trim().toLowerCase());
}

export function normalizeUiFeedbackFieldId(value) {
  return normalizeFieldId(value);
}

export async function getAdminUiFeedback() {
  try {
    const fromKv = await readCloudflareKvJson(KV_KEY);
    if (fromKv && typeof fromKv === "object") {
      const normalized = normalizeStore(fromKv);
      memoryStore = normalized;
      return normalized;
    }
  } catch (error) {
    console.error("Admin UI feedback KV read failed", error);
  }
  return memoryStore;
}

export async function setAdminUiFeedback(fieldId, value, by) {
  const normalizedFieldId = normalizeFieldId(fieldId);
  const normalizedValue = String(value || "").trim().toLowerCase();
  const normalizedBy = String(by || "").trim().toLowerCase().slice(0, 160);
  if (!normalizedFieldId) throw new Error("fieldId is required");
  if (!VALID_VALUES.has(normalizedValue)) throw new Error("Invalid feedback value");

  const current = await getAdminUiFeedback();
  const next = {
    ...current,
    fields: {
      ...(current.fields || {}),
      [normalizedFieldId]: {
        value: normalizedValue,
        by: normalizedBy,
        updatedAt: new Date().toISOString(),
      },
    },
  };

  try {
    await writeCloudflareKvJson(KV_KEY, next);
  } catch (error) {
    console.error("Admin UI feedback KV write failed", error);
  }
  memoryStore = next;
  return next;
}

