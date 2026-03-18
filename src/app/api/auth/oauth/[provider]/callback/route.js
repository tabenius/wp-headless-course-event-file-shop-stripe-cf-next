import { NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  createSessionCookie,
  createSessionToken,
  getOAuthStateFromCookieHeader,
} from "@/auth";
import { getProviderConfig } from "@/lib/oauthProviders";
import { upsertOAuthUser } from "@/lib/userStore";

function decodeJwtPayload(token) {
  if (typeof token !== "string" || token.split(".").length < 2) return {};
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function providerProfile(provider, json) {
  if (provider === "google") {
    return { id: json.sub, email: json.email, name: json.name };
  }
  if (provider === "facebook") {
    return { id: json.id, email: json.email, name: json.name };
  }
  if (provider === "microsoft-entra-id") {
    return {
      id: json.sub || json.oid,
      email: json.email || json.preferred_username,
      name: json.name,
    };
  }
  return {
    id: json.sub,
    email: json.email,
    name: json.name || json.email,
  };
}

async function getAccessToken(provider, providerConfig, code, redirectUri) {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", providerConfig.clientId);
  body.set("client_secret", providerConfig.clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const tokenResponse = await fetch(providerConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => "");
    throw new Error(`Token exchange failed for ${provider}: ${tokenResponse.status} ${text.slice(0, 200)}`);
  }
  const tokenJson = await tokenResponse.json();
  return tokenJson;
}

export async function GET(request, { params: paramsPromise }) {
  const { provider } = await paramsPromise;
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return NextResponse.redirect(new URL("/auth/signin?error=provider", request.url));
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") || "";
  const statePayload = await getOAuthStateFromCookieHeader(cookieHeader);
  const redirectUri = `${requestUrl.origin}/api/auth/oauth/${provider}/callback`;

  if (
    !code ||
    !state ||
    !statePayload ||
    statePayload.provider !== provider ||
    statePayload.state !== state
  ) {
    const failure = NextResponse.redirect(
      new URL("/auth/signin?error=state", request.url),
    );
    failure.headers.append("Set-Cookie", clearOAuthStateCookie());
    return failure;
  }

  try {
    const tokenJson = await getAccessToken(provider, providerConfig, code, redirectUri);
    let profile = {};

    if (provider === "apple") {
      profile = providerProfile(provider, decodeJwtPayload(tokenJson.id_token));
    } else {
      const userResponse = await fetch(providerConfig.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (!userResponse.ok) {
        throw new Error(`UserInfo request failed for ${provider}: ${userResponse.status}`);
      }
      const userJson = await userResponse.json();
      profile = providerProfile(provider, userJson);
    }

    const user = await upsertOAuthUser({
      email: profile.email,
      name: profile.name,
      provider,
      providerAccountId: profile.id,
    });
    const sessionToken = await createSessionToken(user);
    const destination =
      typeof statePayload.callbackUrl === "string" ? statePayload.callbackUrl : "/";
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.append("Set-Cookie", createSessionCookie(sessionToken));
    response.headers.append("Set-Cookie", clearOAuthStateCookie());
    return response;
  } catch {
    const failure = NextResponse.redirect(
      new URL("/auth/signin?error=oauth", request.url),
    );
    failure.headers.append("Set-Cookie", clearOAuthStateCookie());
    return failure;
  }
}
