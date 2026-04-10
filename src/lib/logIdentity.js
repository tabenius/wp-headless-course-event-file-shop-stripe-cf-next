function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashLogValue(value) {
  const normalized = normalize(value);
  if (!normalized) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return bytesToHex(new Uint8Array(digest)).slice(0, 12);
}

export async function hashLogEmail(email) {
  return hashLogValue(email);
}
