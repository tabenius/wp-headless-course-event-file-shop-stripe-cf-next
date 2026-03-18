import sv from "./sv.json";
import en from "./en.json";
import es from "./es.json";

const locales = { sv, en, es };
const LOCALE_STORAGE_KEY = "ragbaz-admin-locale";

function getStoredLocale() {
  if (typeof window === "undefined") return null;
  const stored = window?.localStorage?.getItem?.(LOCALE_STORAGE_KEY);
  if (stored) return stored;
  return window.__SITE_LOCALE__;
}

/**
 * Get the active locale from storage, site override, or env.
 */
export function getLocale() {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.__SITE_LOCALE__) {
    return window.__SITE_LOCALE__;
  }
  return process.env.NEXT_PUBLIC_LOCALE || "sv";
}

export function setLocale(locale) {
  if (typeof window !== "undefined") {
    window.__SITE_LOCALE__ = locale;
    try {
      window.localStorage?.setItem?.(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage failures
    }
  }
  return locale;
}

/**
 * Resolve a dotted key path like "auth.signInTitle" from a locale object.
 */
function resolve(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Translate a key with optional interpolation.
 *
 * Usage:
 *   t("auth.signInTitle")              → "Logga in"
 *   t("authErrors.passwordTooShort", { min: 8 }) → "Lösenord måste vara minst 8 tecken."
 *
 * Falls back to Swedish if the key is missing in the active locale,
 * then to the key itself if missing everywhere.
 */
export function t(key, params) {
  const locale = getLocale();
  const dict = locales[locale] || locales.sv;
  let value = resolve(dict, key);

  // Fallback to Swedish
  if (value === undefined && locale !== "sv") {
    value = resolve(locales.sv, key);
  }

  // Fallback to key
  if (value === undefined) return key;

  if (typeof value !== "string") return key;

  // Interpolate {param} placeholders
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] !== undefined ? String(params[name]) : `{${name}}`,
    );
  }

  return value;
}

export default t;
