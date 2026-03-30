function readFirstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function getResendApiKey() {
  return readFirstEnv("RESEND_API_KEY");
}

export function getResendFromAddress() {
  return readFirstEnv("RESEND_FROM_EMAIL", "RESEND_FROM", "EMAIL_FROM");
}

export function isResendConfigured() {
  return Boolean(getResendApiKey() && getResendFromAddress());
}

