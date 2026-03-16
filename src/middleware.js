import { NextResponse } from "next/server";

function shouldTag(request) {
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/__maps")
  );
}

export function middleware(request) {
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
  matcher: ["/admin/:path*", "/api/admin/:path*", "/__maps/:path*"],
};
