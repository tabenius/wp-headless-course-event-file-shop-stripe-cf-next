"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

// ─── CyberDuck bookmark generator ────────────────────────────────────────────

function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateCyberduckBookmark({ endpoint, bucket, region, accessKeyId }) {
  const hostname = String(endpoint || "").replace(/^https?:\/\//, "").split("/")[0];
  const safeBucket = String(bucket || "");
  const safeRegion = String(region || "auto");
  const safeKey = String(accessKeyId || "");
  const nickname = safeBucket ? `R2 · ${safeBucket}` : "R2 bucket";
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Protocol</key>
\t<string>s3</string>
\t<key>Nickname</key>
\t<string>${escXml(nickname)}</string>
\t<key>Hostname</key>
\t<string>${escXml(hostname)}</string>
\t<key>Port</key>
\t<string>443</string>
\t<key>Region</key>
\t<string>${escXml(safeRegion)}</string>
\t<key>Username</key>
\t<string>${escXml(safeKey)}</string>
\t<key>Path</key>
\t<string>${safeBucket ? `/${escXml(safeBucket)}` : ""}</string>
\t<key>Anonymous Login</key>
\t<false/>
\t<key>UUID</key>
\t<string>${escXml(uuid)}</string>
</dict>
</plist>`;
}

function downloadCyberduckBookmark(details) {
  const xml = generateCyberduckBookmark(details);
  const blob = new Blob([xml], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(details.bucket || "r2-bucket").replace(/[^a-z0-9._-]/gi, "-")}.duck`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminStorageTab({
  storage,
  uploadInfo,
  uploadBackend,
  setUploadBackend,
  uploadInfoDetails,
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState("");
  const [envGroups, setEnvGroups] = useState(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState("");
  const [revealedSecrets, setRevealedSecrets] = useState(new Set());
  const [copiedEnv, setCopiedEnv] = useState("");

  useEffect(() => {
    setEnvLoading(true);
    fetch("/api/admin/env-status")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEnvGroups(json.groups || []);
        else setEnvError(json?.error || "Failed to load env status.");
      })
      .catch(() => setEnvError("Failed to load env status."))
      .finally(() => setEnvLoading(false));
  }, []);
  const clientDetails = uploadInfoDetails || {};
  const s3Enabled = Boolean(uploadInfo?.s3Enabled || clientDetails.s3Enabled);
  const backendMode = (() => {
    if (uploadBackend === "r2") return "r2";
    if (uploadBackend === "s3" && s3Enabled) return "s3";
    if (clientDetails.isR2) return "r2";
    if (uploadInfo?.r2) return "r2";
    if (s3Enabled && uploadInfo?.s3) return "s3";
    return null;
  })();
  const showR2Docs = backendMode === "r2";
  const showS3Docs = backendMode === "s3";
  const remotePath = clientDetails.bucket ? `/${clientDetails.bucket}` : "";
  const protocol = "S3";
  const pathStyleValue =
    typeof clientDetails.pathStyle === "boolean"
      ? clientDetails.pathStyle
        ? t("admin.pathStyleEnabled")
        : t("admin.pathStyleDisabled")
      : t("common.noDetails");

  async function copyEnvValue(key, value) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEnv(key);
      setTimeout(() => setCopiedEnv(""), 1200);
    } catch {
      // ignore
    }
  }

  async function copyValue(fieldId, value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text === t("common.noDetails")) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(""), 1200);
    } catch {
      // Ignore clipboard errors in restricted environments.
    }
  }

  const checklistRows = [
    {
      id: "protocol",
      label: t("admin.clientProtocol"),
      value: protocol,
    },
    {
      id: "host",
      label: t("admin.clientHost"),
      value: clientDetails.endpoint || t("common.noDetails"),
    },
    {
      id: "region",
      label: t("admin.clientRegion"),
      value: clientDetails.region || t("admin.clientRegionAuto"),
    },
    {
      id: "bucket",
      label: t("admin.clientBucket"),
      value: clientDetails.bucket || t("common.noDetails"),
    },
    {
      id: "remotePath",
      label: t("admin.clientRemotePath"),
      value: remotePath || t("common.noDetails"),
    },
    {
      id: "pathStyle",
      label: t("admin.clientPathStyle"),
      value: pathStyleValue,
    },
    {
      id: "accessKey",
      label: t("admin.clientAccessKey"),
      value: clientDetails.accessKeyId || t("common.noDetails"),
    },
    {
      id: "secretKey",
      label: t("admin.clientSecretKey"),
      value: clientDetails.secretKey || t("common.noDetails"),
      secret: true,
    },
    {
      id: "publicUrl",
      label: t("admin.clientPublicUrl"),
      value: clientDetails.publicUrl || t("common.noDetails"),
    },
  ];

  const storageOptions = [
    {
      id: "cloudflare-kv",
      name: t("admin.storageProviderKvName"),
      desc: t("admin.storageProviderKvDesc"),
      active: storage?.provider === "cloudflare-kv",
    },
    {
      id: "wordpress-graphql-user-meta",
      name: t("admin.storageProviderWpName"),
      desc: t("admin.storageProviderWpDesc"),
      active: storage?.provider === "wordpress-graphql-user-meta",
    },
    {
      id: "local-file",
      name: t("admin.storageProviderLocalName"),
      desc: t("admin.storageProviderLocalDesc"),
      active: storage?.provider === "local-file",
    },
  ];

  const uploadTargets = [
    { id: "wordpress", label: t("admin.uploadTargetWordpress"), enabled: true },
    { id: "r2", label: t("admin.uploadTargetR2"), enabled: uploadInfo?.r2 },
    ...(s3Enabled
      ? [{ id: "s3", label: t("admin.uploadTargetS3"), enabled: uploadInfo?.s3 }]
      : []),
  ];

  return (
    <div className="space-y-6 min-w-0">
      <div className="border rounded p-5 bg-white space-y-8">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("admin.storageBackend")}
          </h2>
          <p className="text-sm text-gray-500">
            {t("admin.storageBackendHelp")}{" "}
            <code className="bg-gray-100 px-1 rounded">COURSE_ACCESS_BACKEND</code>
            .
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {storageOptions.map((opt) => (
              <div
                key={opt.id}
                className={`border-2 rounded p-4 space-y-2 ${
                  opt.active
                    ? "border-green-400 bg-green-50"
                    : "border-gray-200 bg-white opacity-70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${opt.active ? "bg-green-600" : "bg-gray-300"}`}
                  />
                  <span className="font-medium text-sm">{opt.name}</span>
                </div>
                <p className="text-xs text-gray-500">{opt.desc}</p>
                {opt.active && (
                  <span className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                    {t("admin.storageActive")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("admin.uploadDestinationTitle")}
          </h3>
          <p className="text-xs text-gray-500">
            {t("admin.uploadDestinationHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {uploadTargets.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={!opt.enabled}
                onClick={() => setUploadBackend(opt.id)}
                className={`px-3 py-1.5 rounded border text-sm ${
                  uploadBackend === opt.id
                    ? "border-green-500 text-green-800 bg-green-50"
                    : "border-gray-200 text-gray-700"
                } ${!opt.enabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!uploadInfo?.s3 && !uploadInfo?.r2 && (
            <p className="text-[11px] text-gray-500">
              {t("admin.uploadCredentialsHint")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
            {showR2Docs && (
              <a
                href="https://developers.cloudflare.com/r2/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
              >
                <span className="w-4 h-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <circle cx="12" cy="12" r="10" fill="#fbbf24" />
                    <path
                      d="M12 4v16M4 12h16"
                      stroke="#0f172a"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span>{t("admin.r2Docs")}</span>
              </a>
            )}
            {showS3Docs && (
              <a
                href="https://aws.amazon.com/s3/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
              >
                <span className="w-4 h-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <rect
                      x="3"
                      y="7"
                      width="18"
                      height="10"
                      rx="2"
                      fill="#f5af19"
                    />
                    <path
                      d="M6 16 4 9h4l2 7h4l2-7h4l-2 7"
                      stroke="#1f2937"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{t("admin.s3Docs")}</span>
              </a>
            )}
          </div>
          {uploadBackend !== "wordpress" && (
            <div className="mt-3 space-y-3">
              <div className="border rounded-xl p-3 bg-indigo-50/70 border-indigo-200 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-indigo-900">
                      {t("admin.clientChecklistTitle")}
                    </p>
                    <p className="text-[11px] text-indigo-700">
                      {t("admin.clientChecklistHint")}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    {uploadBackend === "r2"
                      ? t("admin.uploadClientModeR2")
                      : t("admin.uploadClientModeS3")}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {checklistRows.map((row) => {
                    const rawValue = row.value || t("common.noDetails");
                    const isNoDetails = rawValue === t("common.noDetails");
                    const displayValue =
                      row.secret && !showSecret && !isNoDetails
                        ? "••••••••••••••••"
                        : rawValue;
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] gap-2 items-center bg-white border rounded px-2 py-1.5"
                      >
                        <span className="text-[11px] font-medium text-gray-500">
                          {row.label}
                        </span>
                        <span
                          className={`font-mono text-[12px] break-all ${row.secret && !showSecret && !isNoDetails ? "text-gray-300 tracking-widest" : "text-gray-700"}`}
                        >
                          {displayValue}
                        </span>
                        <div className="flex items-center gap-1">
                          {row.secret && !isNoDetails && (
                            <button
                              type="button"
                              onClick={() => setShowSecret((prev) => !prev)}
                              className="text-[10px] text-purple-700 hover:underline"
                            >
                              {showSecret
                                ? t("admin.hideSecret")
                                : t("admin.showSecret")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyValue(row.id, rawValue)}
                            disabled={isNoDetails}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {copiedField === row.id
                              ? t("admin.clientCopied")
                              : t("common.copy")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("admin.manualClientsTitle")}
        </h3>
        <p className="text-xs text-gray-500">{t("admin.manualClientsHint")}</p>
        <p className="text-[11px] text-gray-500">
          {t("admin.clientChecklistHint")}
        </p>

        <details className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-indigo-300 open:bg-indigo-50/30">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="h-7 w-7 flex-shrink-0">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <rect x="2" y="7" width="28" height="18" rx="4" fill="#1c3f94" />
                  <path
                    d="M8 12h16"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 18h12"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="24" cy="23" r="2" fill="#fcd34d" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">
                  {t("admin.winscpTitle")}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {t("admin.winscpSummary")}
                </span>
              </span>
            </span>
            <a
              href="https://winscp.net/eng/docs/start"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientDocs")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
            <p>{t("admin.winscpStepProtocol")}</p>
            <p>{t("admin.winscpStepHost")}</p>
            <p>{t("admin.winscpStepAuth")}</p>
            <p>{t("admin.winscpStepRemotePath")}</p>
          </div>
        </details>

        <details className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-amber-300 open:bg-amber-50/30">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="h-7 w-7 flex-shrink-0">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <path
                    d="M4 18c0-6 6-10 12-10s12 4 12 10c0 5-6 10-12 10S4 23 4 18"
                    fill="#f59e0b"
                  />
                  <path
                    d="M10 16c0-2 2-4 5-4s5 2 5 4-2 4-5 4-5-2-5-4z"
                    fill="#fff"
                  />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">
                  {t("admin.cyberduckTitle")}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {t("admin.cyberduckSummary")}
                </span>
              </span>
            </span>
            <a
              href="https://cyberduck.io"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientWebsite")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
            <p>{t("admin.cyberduckStepProtocol")}</p>
            <p>{t("admin.cyberduckStepServer")}</p>
            <p>{t("admin.cyberduckStepAuth")}</p>
            <p>{t("admin.cyberduckStepPath")}</p>
          </div>
          {clientDetails.endpoint && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-[11px] text-gray-500 mb-2">
                {t("admin.cyberduckProfileHint", "Download a pre-filled bookmark file. Double-click it to open directly in CyberDuck. You will be prompted for the secret key on first connect.")}
              </p>
              <button
                type="button"
                onClick={() => downloadCyberduckBookmark(clientDetails)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-700"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M8 12l-5-5h3V2h4v5h3L8 12z"/>
                  <rect x="2" y="13" width="12" height="1.5" rx=".75"/>
                </svg>
                {t("admin.cyberduckDownloadProfile", "Download .duck bookmark")}
              </button>
            </div>
          )}
        </details>
      </div>

      {/* ── Environment variables reference ─────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("admin.envVarsTitle", "Environment variables")}
        </h3>
        <p className="text-xs text-gray-500">
          {t("admin.envVarsHint", "All env vars the app reads, grouped by service. Secret values are masked.")}
        </p>

        {envLoading && (
          <p className="text-xs text-gray-400">{t("common.loading", "Loading…")}</p>
        )}
        {envError && (
          <p className="text-xs text-red-600">{envError}</p>
        )}
        {envGroups && envGroups.map((group) => (
          <details
            key={group.id}
            className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-purple-300 open:bg-purple-50/20"
          >
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-gray-800">{group.label}</span>
              <span className="text-[11px] text-gray-400">
                {group.vars.filter((v) => v.set).length}/{group.vars.length} set
              </span>
            </summary>
            <div className="mt-3 space-y-1">
              {group.vars.map((v) => {
                const key = `${group.id}:${v.names[0]}`;
                const isRevealed = revealedSecrets.has(key);
                const displayValue = v.secret
                  ? isRevealed
                    ? "(secret — not available client-side)"
                    : "••••••••"
                  : (v.value || "");
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] gap-2 items-center bg-white border rounded px-2 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className={`font-mono ${v.set ? "text-gray-700" : "text-gray-400"}`}>
                        {v.names[0]}
                      </span>
                      {v.names.length > 1 && (
                        <span className="block text-[10px] text-gray-400">
                          or {v.names.slice(1).join(", ")}
                        </span>
                      )}
                      {v.hint && (
                        <span className="block text-[10px] text-gray-400">{v.hint}</span>
                      )}
                    </div>
                    <span
                      className={`font-mono break-all ${
                        !v.set
                          ? "text-red-400 italic"
                          : v.secret && !isRevealed
                          ? "text-gray-300 tracking-widest"
                          : "text-gray-700"
                      }`}
                    >
                      {!v.set
                        ? t("admin.envVarNotSet", "not set")
                        : displayValue}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {v.set && v.secret && (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSecrets((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          className="text-[10px] text-purple-700 hover:underline"
                        >
                          {isRevealed ? t("admin.hideSecret", "Hide") : t("admin.showSecret", "Show")}
                        </button>
                      )}
                      {v.set && !v.secret && v.value && (
                        <button
                          type="button"
                          onClick={() => copyEnvValue(key, v.value)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 text-purple-700 hover:bg-purple-50"
                        >
                          {copiedEnv === key
                            ? t("admin.clientCopied", "Copied")
                            : t("common.copy", "Copy")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
