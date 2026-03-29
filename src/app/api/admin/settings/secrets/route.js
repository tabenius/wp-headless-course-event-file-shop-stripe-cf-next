import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { validateAdminCredentials } from "@/auth";
import { readEnvOverrides, saveEnvOverride } from "@/lib/adminSettingsStore";
import {
  ADMIN_ENV_GROUPS,
  envLooksSecret,
  primaryEnvName,
} from "@/lib/adminEnvCatalog";

const NAME_RE = /^[A-Z][A-Z0-9_]{0,95}$/;

function normalizeName(name) {
  const safe = String(name || "")
    .trim()
    .toUpperCase();
  if (!NAME_RE.test(safe)) return "";
  return safe;
}

function buildKnownSecretMap() {
  const map = new Map();
  for (const group of ADMIN_ENV_GROUPS) {
    for (const entry of group.vars || []) {
      const key = primaryEnvName(entry);
      if (!key) continue;
      map.set(key, Boolean(entry.secret));
      for (const alias of entry.names || []) {
        map.set(String(alias), Boolean(entry.secret));
      }
    }
  }
  return map;
}

function maskValue(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 2)}••••••${raw.slice(-2)}`;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  const knownSecretMap = buildKnownSecretMap();
  const settings = await readEnvOverrides();
  const values = settings.values || {};
  const overrides = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => {
      const secret = knownSecretMap.has(name)
        ? Boolean(knownSecretMap.get(name))
        : envLooksSecret(name);
      return {
        name,
        secret,
        hasValue: Boolean(String(value || "").trim()),
        value: secret ? null : String(value || ""),
        masked: secret ? maskValue(value) : null,
      };
    });

  return NextResponse.json({
    ok: true,
    updatedAt: settings.updatedAt || null,
    overrides,
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let payload = {};
  try {
    payload = (await request.json()) || {};
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const name = normalizeName(payload?.name);
  const value = String(payload?.value ?? "");
  const password = String(payload?.password || "");
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Invalid variable name." },
      { status: 400 },
    );
  }
  if (!password) {
    return NextResponse.json(
      { ok: false, error: "Admin password confirmation is required." },
      { status: 400 },
    );
  }

  const email = auth?.session?.email || "";
  const valid = await validateAdminCredentials(email, password);
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation failed." },
      { status: 401 },
    );
  }

  const saved = await saveEnvOverride(name, value);
  const knownSecretMap = buildKnownSecretMap();
  const secret = knownSecretMap.has(name)
    ? Boolean(knownSecretMap.get(name))
    : envLooksSecret(name);
  const savedValue = saved.values?.[name] || "";

  return NextResponse.json({
    ok: true,
    setting: {
      name,
      secret,
      hasValue: Boolean(savedValue),
      value: secret ? null : savedValue,
      masked: secret ? maskValue(savedValue) : null,
    },
    updatedAt: saved.updatedAt || null,
  });
}
