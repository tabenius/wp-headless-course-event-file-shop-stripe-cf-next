"use client";

import { useEffect, useMemo } from "react";

const CHUNK_RELOAD_GUARD_KEY = "ragbaz_admin_chunk_reload_once";

function isChunkLoadError(error) {
  const message = String(error?.message || "");
  if (!message) return false;
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk")
  );
}

function buildAdminReloadUrl() {
  if (typeof window === "undefined") return "/admin";
  const hash = window.location.hash || "";
  return `/admin?reload=${Date.now()}${hash}`;
}

export default function AdminError({ error, reset }) {
  const chunkFailure = useMemo(() => isChunkLoadError(error), [error]);

  useEffect(() => {
    if (!chunkFailure || typeof window === "undefined") return;
    const alreadyRetried =
      window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
    if (alreadyRetried) return;
    window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
    window.location.replace(buildAdminReloadUrl());
  }, [chunkFailure]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Admin Error</h1>
        <p className="text-gray-600">
          {chunkFailure
            ? "A stale admin bundle was detected after deployment. Reloading assets usually fixes this."
            : error?.message || "An unexpected error occurred."}
        </p>
        {error?.digest && (
          <p className="text-xs text-gray-400">Digest: {error.digest}</p>
        )}
        {error?.stack && (
          <details className="text-left rounded border border-gray-300 bg-gray-50 p-3 text-xs text-gray-700">
            <summary className="cursor-pointer font-semibold">
              Debug stack (use with source maps)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{error.stack}</pre>
          </details>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
                window.location.replace(buildAdminReloadUrl());
              }
            }}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            Reload admin
          </button>
        </div>
      </div>
    </div>
  );
}
