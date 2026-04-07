"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import AdminFieldHelpLink from "./AdminFieldHelpLink";

const NAME_RE = /^[A-Z][A-Z0-9_]{0,95}$/;

function normalizeName(name) {
  const safe = String(name || "")
    .trim()
    .toUpperCase();
  return NAME_RE.test(safe) ? safe : "";
}

function looksSecret(name) {
  const key = String(name || "").toUpperCase();
  return (
    key.includes("SECRET") ||
    key.includes("PASSWORD") ||
    key.includes("TOKEN") ||
    key.endsWith("_KEY")
  );
}

export default function AdminSecretsPanel() {
  const [envGroups, setEnvGroups] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [drafts, setDrafts] = useState({});
  const [pendingName, setPendingName] = useState("");
  const [statusByName, setStatusByName] = useState({});
  const [showByName, setShowByName] = useState({});
  const [customName, setCustomName] = useState("");
  const [customValue, setCustomValue] = useState("");

  const overridesByName = useMemo(() => {
    const map = new Map();
    for (const item of overrides) {
      map.set(item.name, item);
    }
    return map;
  }, [overrides]);

  const knownNames = useMemo(() => {
    const set = new Set();
    for (const group of envGroups) {
      for (const v of group.vars || []) {
        if (v?.names?.[0]) set.add(String(v.names[0]));
      }
    }
    return set;
  }, [envGroups]);

  const customOverrides = useMemo(
    () => overrides.filter((item) => !knownNames.has(item.name)),
    [overrides, knownNames],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [envRes, secRes] = await Promise.all([
        fetch("/api/admin/env-status", { cache: "no-store" }),
        fetch("/api/admin/settings/secrets", { cache: "no-store" }),
      ]);
      const [envJson, secJson] = await Promise.all([
        envRes.json().catch(() => ({})),
        secRes.json().catch(() => ({})),
      ]);
      if (!envRes.ok || !envJson?.ok) {
        throw new Error(envJson?.error || "Failed to load environment status.");
      }
      if (!secRes.ok || !secJson?.ok) {
        throw new Error(secJson?.error || "Failed to load secret overrides.");
      }
      setEnvGroups(Array.isArray(envJson.groups) ? envJson.groups : []);
      const nextOverrides = Array.isArray(secJson.overrides)
        ? secJson.overrides
        : [];
      setOverrides(nextOverrides);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of nextOverrides) {
          if (item.secret) continue;
          if (next[item.name] === undefined) {
            next[item.name] = item.value || "";
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError?.message || "Failed to load secrets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveOverride(name, value) {
    const varName = normalizeName(name);
    if (!varName) return;
    setPendingName(varName);
    setStatusByName((prev) => ({ ...prev, [varName]: "" }));
    try {
      const response = await fetch("/api/admin/settings/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: varName,
          value: String(value || ""),
          password: password,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save override.");
      }
      await load();
      setStatusByName((prev) => ({
        ...prev,
        [varName]: t("admin.clientSaved", "Saved"),
      }));
    } catch (saveError) {
      setStatusByName((prev) => ({
        ...prev,
        [varName]: saveError?.message || "Failed",
      }));
    } finally {
      setPendingName("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded p-5 bg-white space-y-3">
        <div className="inline-flex items-center gap-1">
          <h3 className="text-base font-semibold text-gray-900">
            {t("admin.secretEnvTitle", "Secret / Env overrides")}
          </h3>
          <AdminFieldHelpLink slug="technical-manual" />
        </div>
        <p className="text-xs text-gray-500">
          {t(
            "admin.secretEnvHint",
            "Fill missing environment values and store runtime overrides in KV. Confirm with admin password for each change.",
          )}
        </p>
        <div className="max-w-md">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t("admin.confirmPassword", "Confirm admin password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t(
              "admin.confirmPasswordPlaceholder",
              "Required to save changes",
            )}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="border rounded p-5 bg-white space-y-3">
        <h3 className="text-base font-semibold text-gray-900">
          {t("admin.secretKnownVars", "Known variables")}
        </h3>
        {loading && (
          <p className="text-xs text-gray-400">
            {t("common.loading", "Loading…")}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!loading &&
          !error &&
          envGroups.map((group) => (
            <details
              key={group.id}
              className="rounded border border-gray-200 bg-gray-50 p-3"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-800">
                  {group.label}
                </span>
                <span className="text-xs text-gray-500">
                  {(group.vars || []).filter((v) => v.set).length}/
                  {(group.vars || []).length} set
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {(group.vars || []).map((v) => {
                  const name = String(v.names?.[0] || "");
                  if (!name) return null;
                  const isSecret = Boolean(v.secret);
                  const override = overridesByName.get(name);
                  const hasOverride = Boolean(override?.hasValue);
                  const draftValue = drafts[name] ?? "";
                  const showValue = Boolean(showByName[name]);
                  const pending = pendingName === name;
                  const currentValue = !v.set
                    ? t("admin.envVarNotSet", "not set")
                    : isSecret
                      ? "••••••••"
                      : v.value || "";
                  return (
                    <div
                      key={`${group.id}:${name}`}
                      className="rounded border bg-white p-2 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-gray-700 break-all">
                            {name}
                          </p>
                          <p className="text-[11px] text-gray-500">{v.label}</p>
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {v.set ? (
                            <span>
                              {t("admin.currentValue", "Current")}:{" "}
                              <span className="font-mono">
                                {showValue ? currentValue : "••••••••"}
                              </span>
                              {v.source === "override" ? " (override)" : ""}
                            </span>
                          ) : (
                            <span className="text-red-500 italic">
                              {t("admin.envVarNotSet", "not set")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center">
                        <input
                          type={isSecret && !showValue ? "password" : "text"}
                          value={isSecret ? (drafts[name] ?? "") : draftValue}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [name]: event.target.value,
                            }))
                          }
                          placeholder={
                            isSecret
                              ? hasOverride
                                ? t(
                                    "admin.secretStoredPlaceholder",
                                    "Stored. Type to replace.",
                                  )
                                : t(
                                    "admin.secretSetPlaceholder",
                                    "Set secret override",
                                  )
                              : t(
                                  "admin.envOverridePlaceholder",
                                  "Override value (leave blank to clear)",
                                )
                          }
                          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowByName((prev) => ({
                              ...prev,
                              [name]: !prev[name],
                            }))
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {showValue
                            ? t("admin.hideSecret", "Hide")
                            : t("admin.showSecret", "Show")}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveOverride(name, drafts[name] ?? "")}
                          disabled={pending || !password}
                          className="rounded border border-slate-700 bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                        >
                          {pending
                            ? t("admin.saving", "Saving…")
                            : t("common.save", "Save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrafts((prev) => ({ ...prev, [name]: "" }));
                            saveOverride(name, "");
                          }}
                          disabled={pending || !password}
                          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {t("admin.clearOverride", "Clear")}
                        </button>
                      </div>
                      {statusByName[name] && (
                        <p className="text-[11px] text-gray-500">
                          {statusByName[name]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
      </div>

      <div className="border rounded p-5 bg-white space-y-3">
        <h3 className="text-base font-semibold text-gray-900">
          {t("admin.secretCustomVars", "Custom variables")}
        </h3>
        <p className="text-xs text-gray-500">
          {t(
            "admin.secretCustomHint",
            "Use uppercase names like FEATURE_FLAG_X. These values are stored in KV as runtime overrides.",
          )}
        </p>
        <div className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_auto] items-center">
          <input
            type="text"
            value={customName}
            onChange={(event) =>
              setCustomName(event.target.value.toUpperCase())
            }
            placeholder="MY_CUSTOM_ENV"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          <input
            type={
              looksSecret(customName) && !showByName.__custom
                ? "password"
                : "text"
            }
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder={t("admin.envOverridePlaceholder", "Override value")}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setShowByName((prev) => ({ ...prev, __custom: !prev.__custom }))
              }
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {showByName.__custom
                ? t("admin.hideSecret", "Hide")
                : t("admin.showSecret", "Show")}
            </button>
            <button
              type="button"
              disabled={!password}
              onClick={async () => {
                const name = normalizeName(customName);
                if (!name) {
                  setError(
                    "Invalid variable name. Use A-Z, 0-9 and underscore.",
                  );
                  return;
                }
                await saveOverride(name, customValue);
                setCustomName("");
                setCustomValue("");
              }}
              className="rounded border border-slate-700 bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {t("admin.addOverride", "Add / update")}
            </button>
          </div>
        </div>
        {customOverrides.length > 0 && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-1.5">
            {customOverrides.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-mono text-gray-700">{item.name}</span>
                <span className="text-gray-500">
                  {item.secret ? item.masked || "••••••••" : item.value || ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
