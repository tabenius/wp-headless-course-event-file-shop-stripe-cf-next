import { auth } from "@/auth";
import {
  getAvailabilitySettings,
  setAvailabilityLoggingEnabled,
  getAvailabilityTemporaryEnabledUntil,
  enableAvailabilityLoggingTemporarily,
  clearAvailabilityTemporaryWindow,
  getAvailabilityLog,
  clearAvailabilityLog,
} from "@/lib/graphqlAvailability";
import { isCloudflareKvConfigured } from "@/lib/cloudflareKv";

async function requireAdmin(request) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/** GET /api/admin/graphql-availability — return settings + log */
export async function GET(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;

  const [settings, temporaryEnabledUntil, log] = await Promise.all([
    getAvailabilitySettings(),
    getAvailabilityTemporaryEnabledUntil(),
    getAvailabilityLog(),
  ]);

  return new Response(
    JSON.stringify({
      kvConfigured: isCloudflareKvConfigured(),
      settings,
      temporaryEnabledUntil,
      effectiveEnabled: Boolean(settings?.enabled || temporaryEnabledUntil),
      log,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}

/** POST /api/admin/graphql-availability — update settings */
export async function POST(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return new Response("enabled must be a boolean", { status: 400 });
  }

  await setAvailabilityLoggingEnabled(body.enabled);
  if (body.enabled === false) {
    await clearAvailabilityTemporaryWindow();
  }
  return new Response(JSON.stringify({ ok: true, enabled: body.enabled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** PATCH /api/admin/graphql-availability — enable temporary logging window */
export async function PATCH(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const seconds = Number.parseInt(String(body?.enableForSeconds ?? 3600), 10);
  const until = await enableAvailabilityLoggingTemporarily(seconds);
  return new Response(
    JSON.stringify({
      ok: true,
      temporaryEnabledUntil: until,
      effectiveEnabled: true,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/** DELETE /api/admin/graphql-availability — clear log */
export async function DELETE(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;

  await clearAvailabilityLog();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
