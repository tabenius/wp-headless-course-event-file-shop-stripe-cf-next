import sv from "./sv.json";
import en from "./en.json";
import es from "@/lib/i18n/es.runtime";

export const ES_LOCALE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ES_LOCALE === "1";

const locales = ES_LOCALE_ENABLED ? { sv, en, es } : { sv, en };
export const AVAILABLE_LOCALES = Object.freeze(Object.keys(locales));
const LOCALE_STORAGE_KEY = "ragbaz-admin-locale";

function normalizeLocale(locale) {
  const safe = typeof locale === "string" ? locale.trim().toLowerCase() : "";
  return Object.prototype.hasOwnProperty.call(locales, safe) ? safe : "sv";
}

function getStoredLocale() {
  if (typeof window === "undefined") return null;
  const pathname = String(window.location?.pathname || "");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isAdminRoute) return null;
  const stored = window?.localStorage?.getItem?.(LOCALE_STORAGE_KEY);
  if (stored) return normalizeLocale(stored);
  return normalizeLocale(window.__SITE_LOCALE__ || null);
}

/**
 * Get the active locale from storage, site override, or env.
 */
export function getLocale() {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.__SITE_LOCALE__) {
    return normalizeLocale(window.__SITE_LOCALE__);
  }
  return normalizeLocale(process.env.NEXT_PUBLIC_LOCALE || "sv");
}

export function setLocale(locale) {
  const safeLocale = normalizeLocale(locale);
  if (typeof window !== "undefined") {
    window.__SITE_LOCALE__ = safeLocale;
    try {
      window.localStorage?.setItem?.(LOCALE_STORAGE_KEY, safeLocale);
    } catch {
      // ignore storage failures
    }
  }
  return safeLocale;
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

function translate(locale, key, params) {
  const fallback = typeof params === "string" ? params : null;
  const interpolationParams =
    params && typeof params === "object" && !Array.isArray(params)
      ? params
      : null;
  const safeLocale = normalizeLocale(locale);
  const dict = locales[safeLocale] || locales.sv;
  let value = resolve(dict, key);

  if (value === undefined && safeLocale !== "sv") {
    value = resolve(locales.sv, key);
  }

  if (value === undefined) return fallback || key;
  if (typeof value !== "string") return fallback || key;

  if (interpolationParams) {
    return value.replace(/\{(\w+)\}/g, (_, name) =>
      interpolationParams[name] !== undefined
        ? String(interpolationParams[name])
        : `{${name}}`,
    );
  }

  return value;
}

export function tForLocale(locale, key, params) {
  return translate(locale, key, params);
}

/**
 * Translate a key with optional interpolation.
 *
 * Usage:
 *   t("auth.signInTitle")              → "Logga in"
 *   t("authErrors.passwordTooShort", { min: 8 }) → "Lösenord måste vara minst 8 tecken."
 */
export function t(key, params) {
  return translate(getLocale(), key, params);
}

export default t;
