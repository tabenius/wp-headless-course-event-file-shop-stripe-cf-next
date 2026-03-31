"use client";

import { useState } from "react";

export default function UserAccessPanel({
  users,
  courses,
  allWpContent,
  products,
  storage,
}) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [panelMsg, setPanelMsg] = useState("");

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name || "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  // All URIs that have access configs
  const allUris = Object.keys(courses).sort();

  // Which URIs this user has access to
  const userAccess = selectedUser
    ? allUris.filter(
        (uri) =>
          Array.isArray(courses[uri]?.allowedUsers) &&
          courses[uri].allowedUsers.includes(selectedUser.email),
      )
    : [];

  function uriLabel(uri) {
    const wp = allWpContent.find((item) => item.uri === uri);
    if (wp) return wp.title || wp.name || uri;
    const shop = products.find((p) => p.contentUri === uri);
    if (shop) return shop.name || uri;
    return uri;
  }

  async function toggleAccess(uri, grant) {
    if (!selectedUser) return;
    setSaving(true);
    setPanelMsg("");
    try {
      const config = courses[uri] || {
        allowedUsers: [],
        priceCents: 0,
        currency: "SEK",
      };
      const currentUsers = Array.isArray(config.allowedUsers)
        ? [...config.allowedUsers]
        : [];
      const nextUsers = grant
        ? [...new Set([...currentUsers, selectedUser.email])]
        : currentUsers.filter((e) => e !== selectedUser.email);
      const res = await fetch("/api/admin/course-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseUri: uri,
          allowedUsers: nextUsers,
          priceCents: config.priceCents || 0,
          currency: config.currency || "SEK",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      // Update courses in parent — use a custom event
      window.dispatchEvent(
        new CustomEvent("admin:coursesUpdated", { detail: json.courses }),
      );
      setPanelMsg(grant ? "Access granted." : "Access revoked.");
    } catch (err) {
      setPanelMsg(err.message || "Failed to update access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full border rounded px-3 py-2 text-sm"
      />
      {filtered.length > 0 && (
        <div className="border rounded max-h-40 overflow-auto divide-y">
          {filtered.slice(0, 20).map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                selectedUser?.email === u.email ? "bg-blue-50 font-medium" : ""
              }`}
            >
              {u.name} <span className="text-gray-400">({u.email})</span>
            </button>
          ))}
        </div>
      )}
      {selectedUser && (
        <div className="border rounded p-4 space-y-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">{selectedUser.name}</div>
              <div className="text-xs text-gray-500">{selectedUser.email}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>

          {/* Access replication */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Access backends
            </h3>
            <p className="text-xs text-gray-500">
              Course access is written to WordPress via GraphQL, and mirrored to
              Cloudflare KV if it is configured.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded bg-green-50 text-green-800 border border-green-200">
                WordPress GraphQL: active
              </span>
              {storage?.replicas?.includes?.("cloudflare-kv") ? (
                <span className="px-3 py-1 rounded bg-green-50 text-green-800 border border-green-200">
                  Cloudflare KV mirror: active
                </span>
              ) : (
                <span className="px-3 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Cloudflare KV mirror: disabled
                </span>
              )}
            </div>
          </div>
          <div className="text-xs font-medium text-gray-600">
            Content access:
          </div>
          {allUris.length === 0 ? (
            <p className="text-xs text-gray-400">
              No content items configured yet.
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-auto">
              {allUris.map((uri) => {
                const hasAccess = userAccess.includes(uri);
                return (
                  <label key={uri} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hasAccess}
                      disabled={saving}
                      onChange={() => toggleAccess(uri, !hasAccess)}
                    />
                    <span
                      className={hasAccess ? "text-gray-900" : "text-gray-500"}
                    >
                      {uriLabel(uri)}
                    </span>
                    <span className="text-[10px] text-gray-400">{uri}</span>
                  </label>
                );
              })}
            </div>
          )}
          {panelMsg && <p className="text-xs text-green-700">{panelMsg}</p>}
        </div>
      )}
    </div>
  );
}
