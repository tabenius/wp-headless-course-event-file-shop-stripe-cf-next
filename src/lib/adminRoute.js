import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { t } from "@/lib/i18n";

/** Standard 401 response for unauthenticated admin requests. */
export function unauthorized() {
  return NextResponse.json(
    { ok: false, error: t("apiErrors.adminLoginRequired") },
    { status: 401 },
  );
}

/**
 * Verify admin session from request cookies.
 * Returns the session object, or null if not authenticated.
 */
export function getAdminSession(request) {
  return getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
}

/**
 * Guard an admin route handler. Returns the unauthorized response
 * if no valid session, otherwise returns null (caller proceeds).
 */
export function requireAdmin(request) {
  const session = getAdminSession(request);
  if (!session) return { error: unauthorized() };
  return { session };
}
