import { auth } from "@/auth";
import {
  recordPagePerformance,
  associateSessionWithUser,
  getPagePerformanceLog,
  clearPagePerformanceLog,
  setRagbazRelayStatus,
  getRagbazRelayStatus,
} from "@/lib/graphqlAvailability";
import {
  isCloudflareKvConfigured,
  getCloudflareKvConfigStatus,
} from "@/lib/cloudflareKv";
import { relayStorefrontVitalsToRagbazHome } from "@/lib/ragbazHomeRelay";

/** POST /api/admin/page-performance — record a page load datapoint (called from client hook) */
export async function POST(request) {
  // Page performance is logged from the client — no admin session required,
  // but we do require the request to come from the same origin.
  const origin = request.headers.get("origin") || "";
  const host = request.headers.get("host") || "";
  if (origin && !origin.includes(host.split(":")[0])) {
    return new Response("Forbidden", { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Fire-and-forget — we don't want to block the client waiting for D1/KV
  recordPagePerformance({
    url: String(body.url || "").slice(0, 500),
    referrer:
      typeof body.referrer === "string" ? body.referrer.slice(0, 500) : "",
    sessionId:
      typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "",
    ttfb: Number(body.ttfb) || 0,
    domComplete: Number(body.domComplete) || 0,
    lcp: body.lcp != null ? Number(body.lcp) : undefined,
    fcp: body.fcp != null ? Number(body.fcp) : undefined,
    inp: body.inp != null ? Number(body.inp) : undefined,
    cls: body.cls != null ? Number(body.cls) : undefined,
    navigationType:
      typeof body.navigationType === "string"
        ? body.navigationType.slice(0, 32)
        : undefined,
  }).catch(() => {});

  // If user is authenticated, tie this browsing session to their identity
  if (body.sessionId) {
    auth()
      .then((session) => {
        if (session?.user?.email) {
          return associateSessionWithUser(body.sessionId, session.user.email);
        }
      })
      .catch(() => {});
  }

  relayStorefrontVitalsToRagbazHome(body, request)
    .then((relayStatus) => setRagbazRelayStatus(relayStatus))
    .catch((error) =>
      setRagbazRelayStatus({
        ok: false,
        skipped: false,
        reason: "relay_exception",
        message:
          error instanceof Error ? error.message : String(error || "unknown"),
      }),
    );

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET /api/admin/page-performance — return log (admin only) */
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [log, relayStatus] = await Promise.all([
    getPagePerformanceLog(),
    getRagbazRelayStatus(),
  ]);
  return new Response(
    JSON.stringify({
      kvConfigured: isCloudflareKvConfigured(),
      kvConfigStatus: getCloudflareKvConfigStatus(),
      log,
      relayStatus,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

/** DELETE /api/admin/page-performance — clear log (admin only) */
export async function DELETE(request) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await clearPagePerformanceLog();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
