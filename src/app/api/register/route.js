import { NextResponse } from "next/server";
import { createUser } from "@/lib/userStore";

function badRequest(message) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password =
      typeof body?.password === "string" ? body.password : "";

    if (name.length < 2) {
      return badRequest("Namnet måste vara minst 2 tecken.");
    }
    if (!email.includes("@")) {
      return badRequest("Ange en giltig e-postadress.");
    }
    if (password.length < 8) {
      return badRequest("Lösenordet måste vara minst 8 tecken.");
    }

    const user = await createUser({ name, email, password });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registreringen misslyckades.";
    const status = message === "Email already exists" ? 409 : 400;
    const localizedMessage =
      message === "Email already exists"
        ? "E-postadressen används redan."
        : "Registreringen misslyckades. Försök igen.";
    return NextResponse.json({ ok: false, error: localizedMessage }, { status });
  }
}
