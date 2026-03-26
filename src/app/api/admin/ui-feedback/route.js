import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  getAdminUiFeedback,
  isValidUiFeedbackValue,
  normalizeUiFeedbackFieldId,
  setAdminUiFeedback,
} from "@/lib/adminUiFeedbackStore";

function canEditFeedback(session) {
  const email = String(session?.email || "").trim().toLowerCase();
  return email.startsWith("sofia");
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const feedback = await getAdminUiFeedback();
  return NextResponse.json({
    ok: true,
    editable: canEditFeedback(auth.session),
    fields: feedback.fields || {},
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  if (!canEditFeedback(auth.session)) {
    return NextResponse.json(
      { ok: false, error: "Only Sofia can update UI feedback." },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const fieldId = normalizeUiFeedbackFieldId(body?.fieldId);
  const value = String(body?.value || "").trim().toLowerCase();
  if (!fieldId) {
    return NextResponse.json({ ok: false, error: "fieldId is required." }, { status: 400 });
  }
  if (!isValidUiFeedbackValue(value)) {
    return NextResponse.json({ ok: false, error: "Invalid feedback value." }, { status: 400 });
  }

  const next = await setAdminUiFeedback(fieldId, value, auth.session?.email || "");
  return NextResponse.json({ ok: true, fields: next.fields || {} });
}

