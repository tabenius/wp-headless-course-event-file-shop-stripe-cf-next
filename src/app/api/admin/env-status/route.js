/**
 * GET /api/admin/env-status
 *
 * Returns the status of every env var the app reads, grouped by service.
 * Values are returned for both secret and non-secret variables.
 * Secret variables remain masked in the UI unless explicitly revealed by admin.
 *
 * Admin-only endpoint.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { readEnvOverrides } from "@/lib/adminSettingsStore";
import { ADMIN_ENV_GROUPS } from "@/lib/adminEnvCatalog";

export const runtime = "nodejs";

/** Read the first set env var from a list; return its value or null. */
function readVal(overrides, ...names) {
  for (const name of names) {
    const v = process.env[name];
    if (v && String(v).trim()) {
      return { value: String(v).trim(), source: "env", activeName: name };
    }
    const ov = overrides?.[name];
    if (ov && String(ov).trim()) {
      return {
        value: String(ov).trim(),
        source: "override",
        activeName: name,
      };
    }
  }
  return { value: null, source: null, activeName: null };
}

/**
 * Build a variable entry.
 * @param {string}   label    - Display label
 * @param {string[]} names    - Env var names to check (first set one wins)
 * @param {boolean}  secret   - If true, value is hidden; only set/not-set returned
 * @param {string}   [hint]   - Optional hint text
 */
function envVar(overrides, label, names, secret = false, hint = "") {
  const resolved = readVal(overrides, ...names);
  const value = resolved.value;
  return {
    label,
    names,
    set: Boolean(value),
    value: value || null,
    secret,
    source: resolved.source,
    activeName: resolved.activeName,
    overridden: resolved.source === "override",
    hint: hint || null,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const overrides = (await readEnvOverrides()).values || {};
  const groups = ADMIN_ENV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    vars: (group.vars || []).map((entry) =>
      envVar(
        overrides,
        entry.label,
        entry.names,
        Boolean(entry.secret),
        entry.hint || "",
      ),
    ),
  }));

  return NextResponse.json({ ok: true, groups });
}
