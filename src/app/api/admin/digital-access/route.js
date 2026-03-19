import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  grantDigitalAccess,
  revokeDigitalAccess,
  listUsersWithProductAccess,
} from "@/lib/digitalAccessStore";

export const runtime = "nodejs";

// GET /api/admin/digital-access?productId=xxx — list users with access
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId") || "";
    if (!productId) {
      return NextResponse.json(
        { ok: false, error: "productId required" },
        { status: 400 },
      );
    }
    const users = await listUsersWithProductAccess(productId);
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}

// POST /api/admin/digital-access — grant access
export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { productId, email } = await request.json();
    if (!productId || !email) {
      return NextResponse.json(
        { ok: false, error: "productId and email required" },
        { status: 400 },
      );
    }
    await grantDigitalAccess(productId, email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/digital-access — revoke access
export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { productId, email } = await request.json();
    if (!productId || !email) {
      return NextResponse.json(
        { ok: false, error: "productId and email required" },
        { status: 400 },
      );
    }
    await revokeDigitalAccess(productId, email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}
