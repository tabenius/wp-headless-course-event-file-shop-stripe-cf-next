"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import AdminFieldHelpLink from "./AdminFieldHelpLink";

const TIERS = ["basic", "advanced", "developer"];
const TIER_STORAGE_KEY = "ragbaz_admin_settings_tier";

function normalizeTier(value) {
  const safe = String(value || "").toLowerCase();
  if (safe === "developer") return "developer";
  if (safe === "advanced") return "advanced";
  return "basic";
}

function tierAllows(tier, minimum) {
  const rank = { basic: 0, advanced: 1, developer: 2 };
  return (rank[tier] ?? 0) >= (rank[minimum] ?? 0);
}

function formatTimestamp(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminSettingsPanel() {
  const [tier, setTier] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingWcProxy, setSavingWcProxy] = useState(false);
  const [savingStripe, setSavingStripe] = useState(false);
  const [wcProxy, setWcProxy] = useState({
    enabled: false,
    url: "",
    updatedAt: null,
  });
  const [stripe, setStripe] = useState({
    enabled: false,
    hasSecretKey: false,
    secretKeyMasked: "",
    publishableKey: "",
    updatedAt: null,
  });
  const [stripeSecretInput, setStripeSecretInput] = useState("");
  const [stripePublishableInput, setStripePublishableInput] = useState("");

  const canSeeAdvanced = tierAllows(tier, "advanced");
  const canSeeDeveloper = tierAllows(tier, "developer");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTier(normalizeTier(window.localStorage.getItem(TIER_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TIER_STORAGE_KEY, tier);
  }, [tier]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [wcRes, stripeRes] = await Promise.all([
        fetch("/api/admin/settings/wc-proxy", { cache: "no-store" }),
        fetch("/api/admin/settings/stripe-keys", { cache: "no-store" }),
      ]);
      const [wcJson, stripeJson] = await Promise.all([
        wcRes.json().catch(() => ({})),
        stripeRes.json().catch(() => ({})),
      ]);
      if (!wcRes.ok || !wcJson?.ok) {
        throw new Error(wcJson?.error || "Could not load WC proxy settings.");
      }
      if (!stripeRes.ok || !stripeJson?.ok) {
        throw new Error(
          stripeJson?.error || "Could not load Stripe override settings.",
        );
      }
      setWcProxy({
        enabled: Boolean(wcJson.settings?.enabled),
        url: wcJson.settings?.url || "",
        updatedAt: wcJson.settings?.updatedAt || null,
      });
      setStripe({
        enabled: Boolean(stripeJson.settings?.enabled),
        hasSecretKey: Boolean(stripeJson.settings?.hasSecretKey),
        secretKeyMasked: stripeJson.settings?.secretKeyMasked || "",
        publishableKey: stripeJson.settings?.publishableKey || "",
        updatedAt: stripeJson.settings?.updatedAt || null,
      });
      setStripePublishableInput(stripeJson.settings?.publishableKey || "");
      setStripeSecretInput("");
    } catch (loadError) {
      setError(loadError?.message || "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveWcProxy() {
    setSavingWcProxy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/settings/wc-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: wcProxy.enabled,
          url: wcProxy.url,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Could not save WC proxy settings.");
      }
      setWcProxy({
        enabled: Boolean(json.settings?.enabled),
        url: json.settings?.url || "",
        updatedAt: json.settings?.updatedAt || null,
      });
    } catch (saveError) {
      setError(saveError?.message || "Could not save WC proxy settings.");
    } finally {
      setSavingWcProxy(false);
    }
  }

  async function saveStripeOverrides() {
    setSavingStripe(true);
    setError("");
    try {
      if (stripe.enabled && !stripe.hasSecretKey && !stripeSecretInput.trim()) {
        throw new Error("Set a Stripe secret key before enabling overrides.");
      }
      const response = await fetch("/api/admin/settings/stripe-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: stripe.enabled,
          secretKey: stripeSecretInput.trim(),
          publishableKey: stripePublishableInput.trim(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Could not save Stripe overrides.");
      }
      setStripe({
        enabled: Boolean(json.settings?.enabled),
        hasSecretKey: Boolean(json.settings?.hasSecretKey),
        secretKeyMasked: json.settings?.secretKeyMasked || "",
        publishableKey: json.settings?.publishableKey || "",
        updatedAt: json.settings?.updatedAt || null,
      });
      setStripeSecretInput("");
    } catch (saveError) {
      setError(saveError?.message || "Could not save Stripe overrides.");
    } finally {
      setSavingStripe(false);
    }
  }

  async function clearStripeOverrides() {
    setSavingStripe(true);
    setError("");
    try {
      const response = await fetch("/api/admin/settings/stripe-keys", {
        method: "DELETE",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Could not clear Stripe overrides.");
      }
      await load();
    } catch (deleteError) {
      setError(deleteError?.message || "Could not clear Stripe overrides.");
    } finally {
      setSavingStripe(false);
    }
  }

  const tierOptions = useMemo(
    () => [
      { id: "basic", label: "Basic" },
      { id: "advanced", label: "Advanced" },
      { id: "developer", label: "Developer" },
    ],
    [],
  );

  return (
    <div className="border rounded p-5 bg-white space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1">
          <h2 className="text-xl font-semibold">
            {t("admin.settingsTieredTitle", "Tiered settings")}
          </h2>
          <AdminFieldHelpLink slug="technical-manual" />
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm"
          disabled={loading}
        >
          {loading ? t("admin.loading", "Loading…") : t("admin.reload", "Reload")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tierOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTier(option.id)}
            className={`rounded border px-3 py-1.5 text-sm ${
              tier === option.id
                ? "border-purple-700 bg-purple-700 text-white"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded border bg-gray-50 p-4 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">
          {t("admin.settingsBasicSummaryTitle", "Basic")}
        </p>
        <p className="mt-1">
          {t(
            "admin.settingsBasicSummaryBody",
            "Keep day-to-day operations simple. Advanced and developer controls stay hidden until you need them.",
          )}
        </p>
      </div>

      {canSeeAdvanced && (
        <div className="rounded border p-4 space-y-3">
          <div className="inline-flex items-center gap-1">
            <h3 className="text-lg font-semibold text-gray-900">
              {t("admin.settingsWcProxyTitle", "Advanced: WooCommerce proxy relay")}
            </h3>
            <AdminFieldHelpLink slug="technical-manual" />
          </div>
          <p className="text-sm text-gray-600">
            {t(
              "admin.settingsWcProxyHint",
              "Forward Stripe webhook payloads to a legacy WooCommerce endpoint when required by older integrations.",
            )}
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={wcProxy.enabled}
              onChange={(event) =>
                setWcProxy((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            <span>{t("admin.settingsEnabledLabel", "Enabled")}</span>
          </label>
          <input
            type="url"
            value={wcProxy.url}
            onChange={(event) =>
              setWcProxy((current) => ({ ...current, url: event.target.value }))
            }
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="https://example.com/wp-json/wc/v3/ragbaz/relay"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {t("admin.settingsLastUpdated", "Last updated")}:{" "}
              {formatTimestamp(wcProxy.updatedAt)}
            </p>
            <button
              type="button"
              onClick={saveWcProxy}
              disabled={savingWcProxy}
              className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {savingWcProxy
                ? t("admin.saving", "Saving…")
                : t("common.save", "Save")}
            </button>
          </div>
        </div>
      )}

      {canSeeDeveloper && (
        <div className="rounded border p-4 space-y-3">
          <div className="inline-flex items-center gap-1">
            <h3 className="text-lg font-semibold text-gray-900">
              {t("admin.settingsStripeOverrideTitle", "Developer: Stripe key overrides")}
            </h3>
            <AdminFieldHelpLink slug="technical-manual" />
          </div>
          <p className="text-sm text-gray-600">
            {t(
              "admin.settingsStripeOverrideHint",
              "Store Stripe keys in KV and override environment defaults without redeploying.",
            )}
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={stripe.enabled}
              onChange={(event) =>
                setStripe((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            <span>{t("admin.settingsEnabledLabel", "Enabled")}</span>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">
                Stripe secret key
              </span>
              <input
                type="password"
                value={stripeSecretInput}
                onChange={(event) => setStripeSecretInput(event.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={stripe.hasSecretKey ? "Leave blank to keep current key" : "sk_live_..."}
              />
              {stripe.hasSecretKey && (
                <span className="mt-1 block text-xs text-gray-500">
                  Current: {stripe.secretKeyMasked || "saved"}
                </span>
              )}
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">
                Stripe publishable key
              </span>
              <input
                type="text"
                value={stripePublishableInput}
                onChange={(event) =>
                  setStripePublishableInput(event.target.value)
                }
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="pk_live_..."
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {t("admin.settingsLastUpdated", "Last updated")}:{" "}
              {formatTimestamp(stripe.updatedAt)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearStripeOverrides}
                disabled={savingStripe}
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {t("admin.clear", "Clear")}
              </button>
              <button
                type="button"
                onClick={saveStripeOverrides}
                disabled={savingStripe}
                className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {savingStripe
                  ? t("admin.saving", "Saving…")
                  : t("common.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

