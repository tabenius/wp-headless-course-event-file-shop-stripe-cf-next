"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import AdminDocsContextLinks from "./AdminDocsContextLinks";

const EMPTY_DRAFT = {
  id: "",
  email: "",
  phone: "",
  name: "",
  notes: "",
};

function makeContactId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function draftEquals(a, b) {
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.name === b.name &&
    a.notes === b.notes
  );
}

function sourceLabel(source) {
  if (source === "users") return "User";
  if (source === "users+contacts") return "User + contact";
  if (source === "contacts-only") return "Contact";
  if (source === "contacts") return "Contact";
  return "Draft";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

function formatPrice(priceCents, currency) {
  if (priceCents === null || priceCents === undefined) return "Price unavailable";
  const amount = priceCents / 100;
  const display = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.00$/, "");
  return `${display} ${String(currency || "SEK").toUpperCase()}`.trim();
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function emitToast(type, message) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("toast", { detail: { type, message } }));
}

export default function AdminContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [original, setOriginal] = useState(EMPTY_DRAFT);
  const [selectedSource, setSelectedSource] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  const openContact = useCallback((contact) => {
    const nextDraft = {
      id: String(contact?.id || ""),
      email: String(contact?.email || ""),
      phone: String(contact?.phone || ""),
      name: String(contact?.name || ""),
      notes: String(contact?.notes || ""),
    };
    setSelectedId(nextDraft.id);
    setDraft(nextDraft);
    setOriginal(nextDraft);
    setSelectedSource(String(contact?.source || ""));
    setEmailLocked(
      ["users", "users+contacts"].includes(String(contact?.source || "")),
    );
  }, []);

  const loadPurchases = useCallback(async (email) => {
    const safeEmail = normalizeEmail(email);
    if (!safeEmail) {
      setPurchases([]);
      setPurchasesLoading(false);
      return;
    }
    setPurchasesLoading(true);
    try {
      const response = await fetch(
        `/api/admin/contacts?email=${encodeURIComponent(safeEmail)}`,
        { cache: "no-store" },
      );
      const json = await parseJsonSafe(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load purchases.");
      }
      setPurchases(Array.isArray(json.purchases) ? json.purchases : []);
    } catch (error) {
      setPurchases([]);
      setStatus(error.message || "Failed to load purchases.");
    } finally {
      setPurchasesLoading(false);
    }
  }, []);

  const loadContacts = useCallback(
    async (preferredId = "") => {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/contacts", {
          cache: "no-store",
        });
        const json = await parseJsonSafe(response);
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load contacts.");
        }
        const nextContacts = Array.isArray(json.contacts) ? json.contacts : [];
        setContacts(nextContacts);
        const keepId = preferredId || selectedId;
        const keepContact = keepId
          ? nextContacts.find((entry) => entry.id === keepId)
          : null;
        if (keepContact) {
          openContact(keepContact);
        } else if (!selectedId && nextContacts[0]) {
          openContact(nextContacts[0]);
        }
      } catch (error) {
        setStatus(error.message || "Failed to load contacts.");
      } finally {
        setLoading(false);
      }
    },
    [openContact, selectedId],
  );

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!draft.email) {
      setPurchases([]);
      setPurchasesLoading(false);
      return;
    }
    void loadPurchases(draft.email);
  }, [draft.email, loadPurchases]);

  const searchableContacts = useMemo(
    () =>
      contacts.map((contact) => ({
        contact,
        haystack:
          `${contact.name}\n${contact.email}\n${contact.phone}\n${contact.notes}`.toLowerCase(),
      })),
    [contacts],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return searchableContacts
      .filter((entry) => entry.haystack.includes(q))
      .map((entry) => entry.contact);
  }, [contacts, search, searchableContacts]);

  const startNewContact = useCallback(() => {
    const nextDraft = { ...EMPTY_DRAFT, id: makeContactId() };
    setSelectedId(nextDraft.id);
    setDraft(nextDraft);
    setOriginal(nextDraft);
    setSelectedSource("draft");
    setEmailLocked(false);
    setPurchases([]);
    setStatus("");
  }, []);

  const saveContact = useCallback(async () => {
    if (!draft.email.trim()) {
      const message = t("admin.contactsEmailRequired", "Email is required.");
      setStatus(message);
      emitToast("error", message);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await parseJsonSafe(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save contact.");
      }
      const savedId = String(json?.contact?.id || draft.id || "");
      const nextContacts = Array.isArray(json?.contacts) ? json.contacts : [];
      setContacts(nextContacts);
      const nextContact = nextContacts.find((entry) => entry.id === savedId);
      if (nextContact) {
        openContact(nextContact);
      } else {
        await loadContacts(savedId);
      }
      const message = t("admin.contactSaved", "Contact saved.");
      setStatus(message);
      emitToast("success", message);
    } catch (error) {
      const message = error.message || "Failed to save contact.";
      setStatus(message);
      emitToast("error", message);
    } finally {
      setSaving(false);
    }
  }, [draft, loadContacts, openContact]);

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("admin.contactsTitle", "Contacts")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t(
              "admin.contactsIntro",
              "Browse customer records, keep contact notes linked to users, and inspect purchased digital products by email.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminDocsContextLinks tab="support" compact />
          <button
            type="button"
            onClick={() => {
              void loadContacts(selectedId);
            }}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? t("common.loading", "Loading") : t("admin.refresh", "Refresh")}
          </button>
          <button
            type="button"
            onClick={startNewContact}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            {t("admin.newContact", "New contact")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 min-w-0">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(
              "admin.contactsSearchPlaceholder",
              "Search contacts by name, email, phone or notes",
            )}
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <div className="max-h-[34rem] overflow-auto pr-1 space-y-2">
            {filteredContacts.length === 0 ? (
              <div className="rounded border border-dashed px-3 py-6 text-sm text-gray-500">
                {contacts.length === 0
                  ? t("admin.noContacts", "No contacts yet.")
                  : t("admin.noMatchingContacts", "No matching contacts.")}
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => openContact(contact)}
                  className={`w-full rounded border px-3 py-3 text-left transition-colors ${
                    draft.id === contact.id
                      ? "border-slate-400 bg-slate-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {contact.name || t("admin.untitledContact", "Unnamed")}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {sourceLabel(contact.source)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-gray-600">
                    {contact.email || "—"}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {contact.phone || t("admin.noPhone", "No phone")}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {formatDate(contact.updatedAt || contact.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-gray-50 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t("admin.contactDetails", "Contact details")}
                  </h3>
                  <span className="rounded-full border bg-white px-2 py-0.5 text-[11px] text-gray-600">
                    {sourceLabel(selectedSource)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t(
                    "admin.contactDetailsHint",
                    "Contacts stay linked by email. Once a record exists in users, the email becomes read-only here.",
                  )}
                </p>
              </div>
              <div className="text-[11px] text-gray-400">
                {draft.id ? `ID ${draft.id}` : ""}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-700">
                  {t("common.email", "Email")}
                </span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  readOnly={emailLocked}
                  aria-readonly={emailLocked}
                  className={`w-full rounded border px-3 py-2 text-sm ${
                    emailLocked ? "bg-gray-100 text-gray-500" : "bg-white"
                  }`}
                  placeholder="name@example.com"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-700">
                  {t("common.name", "Name")}
                </span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                  placeholder={t("admin.contactNamePlaceholder", "Full name")}
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-700">
                  {t("admin.phone", "Phone")}
                </span>
                <input
                  type="text"
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                  placeholder={t("admin.contactPhonePlaceholder", "+46 70 000 00 00")}
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-700">
                  {t("admin.notes", "Notes")}
                </span>
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={6}
                  className="min-h-[10rem] w-full rounded border bg-white px-3 py-2 text-sm"
                  placeholder={t(
                    "admin.contactNotesPlaceholder",
                    "Context, follow-up notes, preferences, delivery details…",
                  )}
                />
              </label>
            </div>

            {emailLocked ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t(
                  "admin.contactEmailLocked",
                  "Email is locked because this contact is already linked to a user account.",
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void saveContact();
                }}
                disabled={saving}
                className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? t("admin.saving", "Saving…") : t("common.save", "Save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(original);
                  setStatus(t("admin.reverted", "Reverted."));
                }}
                disabled={saving || draftEquals(draft, original)}
                className="rounded border px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
              >
                {t("admin.revert", "Revert")}
              </button>
              <div className="text-xs text-gray-500">{status}</div>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {t("admin.purchasedProducts", "Purchased products")}
              </h3>
              <span className="text-xs text-gray-400">
                {draft.email || t("admin.noEmailSelected", "No email selected")}
              </span>
            </div>

            {purchasesLoading ? (
              <div className="text-sm text-gray-500">
                {t("common.loading", "Loading")}
              </div>
            ) : purchases.length === 0 ? (
              <div className="rounded border border-dashed px-3 py-6 text-sm text-gray-500">
                {t(
                  "admin.noPurchasedProducts",
                  "No purchased digital products found for this email.",
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {purchases.map((purchase) => (
                  <div
                    key={`${purchase.productId}-${purchase.grantedAt}`}
                    className="rounded border px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {purchase.title || purchase.productId}
                      </div>
                      <div className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        {formatPrice(purchase.priceCents, purchase.currency)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {purchase.productId}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {formatDate(purchase.grantedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
