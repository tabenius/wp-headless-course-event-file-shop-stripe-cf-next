import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { createTicket, listTickets, updateTicket } from "@/lib/supportTickets";
import { t } from "@/lib/i18n";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const tickets = await listTickets();
  return NextResponse.json({ ok: true, tickets });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const priority = String(body?.priority || "moderate").toLowerCase();
    if (!title) {
      return NextResponse.json(
        { ok: false, error: t("admin.requiredField") },
        { status: 400 },
      );
    }
    const buildTime = String(body?.buildTime || "").trim();
    const gitSha = String(body?.gitSha || "").trim();
    const ticket = await createTicket({ title, description, priority, author: "admin", buildTime, gitSha });
    const tickets = await listTickets();
    return NextResponse.json({ ok: true, ticket, tickets });
  } catch (error) {
    console.error("Create ticket failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create ticket" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: t("admin.requiredField") },
        { status: 400 },
      );
    }
    const status = body?.status ? String(body.status).toLowerCase() : undefined;
    const comment = typeof body?.comment === "string" ? body.comment : undefined;
    await updateTicket(id, { status, comment, author: "admin" });
    const tickets = await listTickets();
    return NextResponse.json({ ok: true, tickets });
  } catch (error) {
    console.error("Update ticket failed", error);
    const message = error?.message === "Ticket not found"
      ? t("admin.ticketNotFound", "Ticket not found")
      : t("admin.ticketUpdateFailed", "Could not update ticket");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
