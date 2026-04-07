import derivationsConfig from "@/config/image-derivations.json";
import { validateDerivationPayload } from "./derivationEngine";

const KV_PREFIX = "derivation:";
const hasKv = typeof DERIVATIONS !== "undefined" && DERIVATIONS?.get;

function mapConfigDerivations() {
  return derivationsConfig.map((item) => ({ ...item }));
}

async function readFromKv(name) {
  if (!hasKv) return null;
  const raw = await DERIVATIONS.get(KV_PREFIX + name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse derivation from KV", name, error);
    return null;
  }
}

async function listFromKv() {
  if (!hasKv) return null;
  try {
    const { keys } = await DERIVATIONS.list({ prefix: KV_PREFIX });
    const entries = await Promise.all(
      keys.map(async (entry) => {
        const data = await DERIVATIONS.get(entry.name);
        if (!data) return null;
        try {
          return JSON.parse(data);
        } catch (error) {
          console.warn("Failed to parse derivation", entry.name, error);
          return null;
        }
      }),
    );
    return entries.filter(Boolean);
  } catch (error) {
    console.warn("Failed to list derivations from KV", error);
    return null;
  }
}

export async function listDerivations() {
  const kvEntries = await listFromKv();
  if (!kvEntries || kvEntries.length === 0) {
    return mapConfigDerivations();
  }
  const configMap = new Map(
    mapConfigDerivations().map((item) => [item.id, item]),
  );
  const merged = mapConfigDerivations().map(
    (item) => kvEntries.find((kv) => kv.id === item.id) || item,
  );
  const extras = kvEntries.filter((entry) => !configMap.has(entry.id));
  return [...merged, ...extras];
}

export async function getDerivationById(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;
  if (hasKv) {
    const kv = await readFromKv(normalizedId);
    if (kv) return kv;
  }
  const config = mapConfigDerivations();
  return config.find((item) => item.id === normalizedId) || null;
}

export async function saveDerivation(payload) {
  if (!hasKv) {
    throw new Error("KV namespace DERIVATIONS is not configured");
  }
  const normalized = validateDerivationPayload(payload);
  await DERIVATIONS.put(KV_PREFIX + normalized.id, JSON.stringify(normalized));
  return normalized;
}
