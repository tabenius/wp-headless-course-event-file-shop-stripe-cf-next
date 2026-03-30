"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "ragbaz_wp_config";
const BRIDGE_PLUGIN_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_RAGBAZ_BRIDGE_PLUGIN_DOWNLOAD_URL ||
  "https://ragbaz.xyz/downloads/ragbaz-bridge/ragbaz-bridge.zip";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function WordPressSetupPage() {
  const router = useRouter();
  const [wpUrl, setWpUrl] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | error | done
  const [errorMsg, setErrorMsg] = useState("");

  // Pre-fill from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved?.wpUrl) setWpUrl(saved.wpUrl);
    if (saved?.secretKey) setSecretKey(saved.secretKey);
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg("");

    const cleanUrl = wpUrl.trim().replace(/\/+$/, "");
    if (!cleanUrl) {
      setStatus("error");
      setErrorMsg("WordPress URL is required.");
      return;
    }

    try {
      new URL(cleanUrl);
    } catch {
      setStatus("error");
      setErrorMsg("Please enter a valid URL (e.g. https://mysite.com).");
      return;
    }

    const config = { wpUrl: cleanUrl, secretKey: secretKey.trim() };

    // 1. Save to localStorage for persistence
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}

    // 2. POST to API to set a cookie so SSR picks it up
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setStatus("error");
      setErrorMsg(`Failed to save configuration: ${err.message}`);
      return;
    }

    setStatus("done");
    // Give the browser a moment to set the cookie before navigating
    setTimeout(() => router.push("/"), 300);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="max-w-xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="text-4xl mb-3" aria-hidden>🔗</div>
          <h1 className="text-3xl font-bold text-gray-900">
            Connect to WordPress
          </h1>
          <p className="mt-2 text-gray-500">
            This storefront needs a WordPress site with the RAGBAZ Bridge plugin
            installed. Enter your site details below to get started.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6"
        >
          <div className="space-y-1">
            <label
              htmlFor="wp-url"
              className="block text-sm font-medium text-gray-700"
            >
              WordPress site URL
            </label>
            <input
              id="wp-url"
              type="url"
              placeholder="https://mysite.com"
              value={wpUrl}
              onChange={(e) => setWpUrl(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="text-xs text-gray-400">
              The root URL of your WordPress installation — no trailing slash.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="secret-key"
              className="block text-sm font-medium text-gray-700"
            >
              Headless secret key{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="secret-key"
              type="password"
              placeholder="your-faust-secret-key"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="text-xs text-gray-400">
              Found in <strong>WP Admin → Settings → Headless</strong> (Faust /
              FaustWP). Required for authenticated GraphQL queries.
            </p>
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "saving" || status === "done"}
            className="w-full rounded-lg bg-gray-900 text-white py-2.5 text-sm font-semibold hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {status === "saving"
              ? "Saving…"
              : status === "done"
                ? "Saved! Redirecting…"
                : "Save and connect"}
          </button>
        </form>

        {/* Instructions */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
          <h2 className="font-semibold text-gray-800">
            How to set up your WordPress site
          </h2>

          <ol className="space-y-4 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <div>
                <p className="font-medium text-gray-800">
                  Install the RAGBAZ Bridge plugin
                </p>
                <p className="mt-0.5">
                  Download{" "}
                  <a
                    href={BRIDGE_PLUGIN_DOWNLOAD_URL}
                    className="text-blue-600 hover:underline font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ragbaz-bridge.zip
                  </a>{" "}
                  and upload it via{" "}
                  <strong>WP Admin → Plugins → Add New → Upload Plugin</strong>.
                  Activate the plugin.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <div>
                <p className="font-medium text-gray-800">Install WPGraphQL</p>
                <p className="mt-0.5">
                  Search for <strong>WPGraphQL</strong> in the plugin directory
                  and install it. It provides the <code>/graphql</code> endpoint
                  this storefront talks to.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <div>
                <p className="font-medium text-gray-800">
                  Get the headless secret key
                </p>
                <p className="mt-0.5">
                  Go to{" "}
                  <strong>WP Admin → Settings → Headless</strong> (installed by
                  the RAGBAZ Bridge plugin or FaustWP). Copy the{" "}
                  <strong>Secret Key</strong> and paste it above.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                4
              </span>
              <div>
                <p className="font-medium text-gray-800">Save and connect</p>
                <p className="mt-0.5">
                  Click <strong>Save and connect</strong> above. The storefront
                  will reload and pull content from your WordPress site.
                </p>
              </div>
            </li>
          </ol>

          <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            Your configuration is stored in this browser&rsquo;s localStorage.
            To configure a different WordPress site, visit{" "}
            <Link href="/setup" className="text-blue-600 hover:underline">
              /setup
            </Link>{" "}
            again.
          </p>
        </div>
      </div>
    </div>
  );
}
