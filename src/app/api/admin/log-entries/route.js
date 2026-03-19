import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  getServerLogs,
  appendServerLog,
  clearServerLogs,
} from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const logs = await getServerLogs();
  return NextResponse.json({ ok: true, logs });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const { level, msg, reqId } = body;
  await appendServerLog({ level, msg, reqId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  await clearServerLogs();
  return NextResponse.json({ ok: true });
}
