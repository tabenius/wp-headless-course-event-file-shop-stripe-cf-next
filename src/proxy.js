import { NextResponse } from "next/server";

export const runtime = "edge";

function shouldTag(request) {
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/__maps")
  );
}

/**
 * WebDAV clients use non-standard HTTP methods (PROPFIND, MKCOL) that Next.js
 * App Router does not natively route.  Intercept them here and forward as POST
 * to the same URL with an `x-dav-method` header so the route handler can pick
 * up the real intent.  A `x-dav-forwarded` guard prevents re-entry loops.
 */
async function forwardDavMethod(request) {
  const headers = new Headers(request.headers);
  headers.set("x-dav-method", request.method.toUpperCase());
  headers.set("x-dav-forwarded", "1");
  return fetch(request.nextUrl.href, {
    method: "POST",
    headers,
    // MKCOL has no body; PROPFIND has an XML body (usually small).
    body: request.body,
    // @ts-expect-error – duplex is required by some runtimes for streaming bodies
    duplex: "half",
  });
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // Forward WebDAV extension methods to the route handler via POST.
  if (
    pathname.startsWith("/webdav") &&
    (method === "PROPFIND" || method === "MKCOL") &&
    !request.headers.get("x-dav-forwarded")
  ) {
    return forwardDavMethod(request);
  }

  if (!shouldTag(request)) return NextResponse.next();

  const reqId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", reqId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", reqId);
  response.cookies.set("reqid", reqId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 30,
  });
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/__maps/:path*", "/webdav/:path*"],
};
