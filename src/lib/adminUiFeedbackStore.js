import { getD1Database } from "@/lib/d1Bindings";

const VALID_VALUES = new Set(["up", "heart", "down"]);

function normalizeFieldId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function isValidUiFeedbackValue(value) {
  return VALID_VALUES.has(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

export function normalizeUiFeedbackFieldId(value) {
  return normalizeFieldId(value);
}

export async function getAdminUiFeedback() {
  try {
    const db = await getD1Database();
    const { results } = await db
      .prepare(
        "SELECT field_id, value, updated_by, updated_at FROM admin_ui_feedback",
      )
      .all();
    const fields = {};
    for (const row of results || []) {
      fields[row.field_id] = {
        value: row.value,
        by: row.updated_by || "",
        updatedAt: row.updated_at,
      };
    }
    return { fields };
  } catch (error) {
    console.error("Admin UI feedback D1 read failed", error);
    return { fields: {} };
  }
}

export async function setAdminUiFeedback(fieldId, value, by) {
  const normalizedFieldId = normalizeFieldId(fieldId);
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();
  const normalizedBy = String(by || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (!normalizedFieldId) throw new Error("fieldId is required");
  if (!VALID_VALUES.has(normalizedValue))
    throw new Error("Invalid feedback value");

  const db = await getD1Database();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO admin_ui_feedback (field_id, value, updated_by, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(field_id) DO UPDATE SET
         value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    )
    .bind(normalizedFieldId, normalizedValue, normalizedBy, now)
    .run();

  return getAdminUiFeedback();
}
