import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createOAuthStateCookie } from "@/auth";
import { getProviderConfig } from "@/lib/oauthProviders";

function safeCallbackUrl(value, origin) {
  if (typeof value !== "string" || value.trim() === "") return "/";
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return "/";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}

export async function GET(request, { params: paramsPromise }) {
  const { provider } = await paramsPromise;
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    console.error(`OAuth start unavailable: provider ${provider} is not configured`);
    return NextResponse.redirect(
      new URL("/auth/signin?error=provider_unavailable", request.url),
    );
  }

  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const callbackUrl = safeCallbackUrl(requestUrl.searchParams.get("callbackUrl"), origin);
  const redirectUri = `${origin}/api/auth/oauth/${provider}/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL(providerConfig.authorizationUrl);
  authUrl.searchParams.set("client_id", providerConfig.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", providerConfig.scope);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.headers.append(
    "Set-Cookie",
    createOAuthStateCookie({ state, callbackUrl, provider }),
  );
  return response;
}
