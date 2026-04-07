const PROVIDERS = {
  google: {
    requiredEnv: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  facebook: {
    requiredEnv: ["AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET"],
    authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email,picture",
    scope: "email public_profile",
  },
  "microsoft-entra-id": {
    requiredEnv: [
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_TENANT",
    ],
    authorizationUrl:
      "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile User.Read",
  },
  apple: {
    requiredEnv: ["AUTH_APPLE_ID", "AUTH_APPLE_SECRET"],
    authorizationUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userInfoUrl: null,
    scope: "name email",
  },
};

const PLACEHOLDER_PATTERNS = [
  /^fake[_-]/i,
  /^your[_-]/i,
  /^xxx/i,
  /^placeholder/i,
  /^test[_-]?key/i,
  /^change[_-]?me/i,
  /^TODO/i,
  /^REPLACE/i,
];

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

function hasEnvVars(keys) {
  return keys.every((key) => {
    const value = process.env[key];
    return (
      typeof value === "string" &&
      value.trim() !== "" &&
      !looksLikePlaceholder(value.trim())
    );
  });
}

function withTenant(url) {
  const tenant = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT || "common";
  return url.replace("{tenant}", tenant);
}

export function getEnabledProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, config]) => hasEnvVars(config.requiredEnv))
    .map(([id]) => id);
}

export function getProviderConfig(providerId) {
  const config = PROVIDERS[providerId];
  if (!config) return null;
  if (!hasEnvVars(config.requiredEnv)) return null;

  if (providerId === "google") {
    return {
      ...config,
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    };
  }

  if (providerId === "facebook") {
    return {
      ...config,
      clientId: process.env.AUTH_FACEBOOK_ID,
      clientSecret: process.env.AUTH_FACEBOOK_SECRET,
    };
  }

  if (providerId === "microsoft-entra-id") {
    return {
      ...config,
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      authorizationUrl: withTenant(config.authorizationUrl),
      tokenUrl: withTenant(config.tokenUrl),
    };
  }

  return {
    ...config,
    clientId: process.env.AUTH_APPLE_ID,
    clientSecret: process.env.AUTH_APPLE_SECRET,
  };
}
