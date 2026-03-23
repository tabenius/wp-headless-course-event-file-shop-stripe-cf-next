import { auth } from "@/auth";
import {
  getAvailabilitySettings,
  setAvailabilityLoggingEnabled,
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

  const [settings, log] = await Promise.all([
    getAvailabilitySettings(),
    getAvailabilityLog(),
  ]);

  return new Response(
    JSON.stringify({
      kvConfigured: isCloudflareKvConfigured(),
      settings,
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
  return new Response(JSON.stringify({ ok: true, enabled: body.enabled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
