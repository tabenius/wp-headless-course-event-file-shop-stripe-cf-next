"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function prettyJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function normalizeRelationshipId(raw) {
  const safe = String(raw || "")
    .trim()
    .toLowerCase();
  if (!safe) return "";
  return safe;
}

export default function AvatarMePanel({
  initialAvatar,
  initialRelationships = [],
  title = "Avatar profile",
  description = "",
}) {
  const [avatar, setAvatar] = useState(initialAvatar || null);
  const [relationships, setRelationships] = useState(
    Array.isArray(initialRelationships) ? initialRelationships : [],
  );
  const [canonicalName, setCanonicalName] = useState(
    initialAvatar?.canonicalName || "",
  );
  const [isPublic, setIsPublic] = useState(initialAvatar?.isPublic === true);
  const [profileImageUrl, setProfileImageUrl] = useState(
    initialAvatar?.profileImageUrl || "",
  );
  const [bio, setBio] = useState(initialAvatar?.bio || "");
  const [detailsJson, setDetailsJson] = useState(
    prettyJson(initialAvatar?.details),
  );

  const [targetAvatarId, setTargetAvatarId] = useState("");
  const [relationshipKind, setRelationshipKind] = useState("follow");
  const [relationshipNote, setRelationshipNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [busyRelationship, setBusyRelationship] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasAvatar = Boolean(avatar?.id);

  const canonicalProfileHref = useMemo(() => {
    if (!avatar?.uriId) return "";
    return `/profile/${encodeURIComponent(avatar.uriId)}`;
  }, [avatar?.uriId]);

  async function refreshAvatarState() {
    const response = await fetch("/api/avatar/me", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || "Failed to refresh avatar.");
    }
    setAvatar(json.avatar || null);
    setRelationships(
      Array.isArray(json.relationshipsOut) ? json.relationshipsOut : [],
    );
    setCanonicalName(json.avatar?.canonicalName || "");
    setIsPublic(json.avatar?.isPublic === true);
    setProfileImageUrl(json.avatar?.profileImageUrl || "");
    setBio(json.avatar?.bio || "");
    setDetailsJson(prettyJson(json.avatar?.details));
  }

  async function saveAvatar() {
    setSaving(true);
    setMessage("");
    setError("");

    let parsedDetails = {};
    try {
      parsedDetails = detailsJson.trim() ? JSON.parse(detailsJson) : {};
      if (
        !parsedDetails ||
        typeof parsedDetails !== "object" ||
        Array.isArray(parsedDetails)
      ) {
        throw new Error("Details must be a JSON object.");
      }
    } catch (parseError) {
      setSaving(false);
      setError(parseError?.message || "Invalid details JSON.");
      return;
    }

    const creating = !hasAvatar;
    try {
      const response = await fetch("/api/avatar/me", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName,
          isPublic,
          profileImageUrl,
          bio,
          details: parsedDetails,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            (creating ? "Avatar creation failed." : "Avatar save failed."),
        );
      }
      await refreshAvatarState();
      setMessage(
        creating
          ? json?.created === false
            ? "Avatar already exists."
            : "Avatar created."
          : "Avatar updated.",
      );
    } catch (saveError) {
      setError(
        saveError?.message ||
          (creating ? "Avatar creation failed." : "Avatar save failed."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function addRelationship() {
    if (!avatar?.id) {
      setError("Create an avatar first.");
      setMessage("");
      return;
    }
    setBusyRelationship(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/avatar/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAvatarId: normalizeRelationshipId(targetAvatarId),
          kind: relationshipKind,
          note: relationshipNote,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Could not add relationship.");
      }
      setTargetAvatarId("");
      setRelationshipNote("");
      await refreshAvatarState();
      setMessage("Relationship saved.");
    } catch (relationError) {
      setError(relationError?.message || "Could not add relationship.");
    } finally {
      setBusyRelationship(false);
    }
  }

  async function removeRelationship(row) {
    if (!avatar?.id) {
      setError("Create an avatar first.");
      setMessage("");
      return;
    }
    setBusyRelationship(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/avatar/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAvatarId: row?.toAvatarId || "",
          kind: row?.kind || "follow",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Could not remove relationship.");
      }
      await refreshAvatarState();
      setMessage("Relationship removed.");
    } catch (relationError) {
      setError(relationError?.message || "Could not remove relationship.");
    } finally {
      setBusyRelationship(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-[1.75rem] border border-gray-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
        <div className="space-y-2">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b1d68]">
            {title}
          </p>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {!hasAvatar ? (
          <p className="text-sm text-gray-700">
            You do not have an avatar yet. Create one below and set a canonical
            name and metadata.
          </p>
        ) : null}
        {hasAvatar ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Avatar ID:</span>{" "}
            {avatar?.uriId || "—"}
          </p>
        ) : null}
        {canonicalProfileHref ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Profile URL:</span>{" "}
            <Link
              href={canonicalProfileHref}
              className="text-teal-700 hover:underline"
            >
              {canonicalProfileHref}
            </Link>
          </p>
        ) : null}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Canonical name
          </span>
          <input
            type="text"
            value={canonicalName}
            onChange={(event) => setCanonicalName(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Unique UTF-8 name (max 128 bytes)"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Expose avatar publicly
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Profile image URL
          </span>
          <input
            type="url"
            value={profileImageUrl}
            onChange={(event) => setProfileImageUrl(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Bio</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Details (JSON object)
          </span>
          <textarea
            value={detailsJson}
            onChange={(event) => setDetailsJson(event.target.value)}
            rows={8}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveAvatar}
            disabled={saving}
            aria-label={saving ? "Saving avatar" : hasAvatar ? "Save avatar" : "Create avatar"}
            title={saving ? "Saving..." : hasAvatar ? "Save avatar" : "Create avatar"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => refreshAvatarState().catch(() => {})}
            className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {hasAvatar ? (
        <div className="space-y-4 rounded-[1.75rem] border border-gray-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
          <h2 className="text-xl font-semibold">Relationships</h2>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">
                Target avatar ID
              </span>
              <input
                type="text"
                value={targetAvatarId}
                onChange={(event) => setTargetAvatarId(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="0x..."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">Kind</span>
              <select
                value={relationshipKind}
                onChange={(event) => setRelationshipKind(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="follow">follow</option>
                <option value="ally">ally</option>
                <option value="block">block</option>
                <option value="observe">observe</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">Note</span>
              <input
                type="text"
                value={relationshipNote}
                onChange={(event) => setRelationshipNote(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optional note"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={addRelationship}
            disabled={busyRelationship}
            className="px-4 py-2 rounded bg-gray-800 text-white text-sm hover:bg-gray-700 disabled:opacity-60"
          >
            {busyRelationship ? "Working..." : "Add relationship"}
          </button>

          {relationships.length === 0 ? (
            <p className="text-sm text-gray-600">No relationships yet.</p>
          ) : (
            <ul className="space-y-2">
              {relationships.map((row) => (
                <li
                  key={`${row.kind}:${row.toAvatarId}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-700 px-3 py-2"
                >
                  <span className="text-sm text-gray-700 break-all">
                    {row.kind} → 0x{row.toAvatarId}
                    {row.note ? ` (${row.note})` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRelationship(row)}
                    disabled={busyRelationship}
                    className="px-2 py-1 rounded border border-red-300 text-red-700 text-xs hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-[1.75rem] border border-gray-700 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.38)]">
          <p className="text-sm text-gray-700">
            Create your avatar first to configure relationships.
          </p>
        </div>
      )}
    </div>
  );
}
