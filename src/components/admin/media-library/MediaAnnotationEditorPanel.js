"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";

export default function MediaAnnotationEditorPanel({
  selectedItem,
  editor,
  setEditor,
  closeEditor,
  saveError,
  saveSuccess,
  suggestAnnotations,
  saveAnnotations,
  saveLoading,
}) {
  if (!selectedItem || !editor) return null;

  const hasAnnotations = Boolean(
    editor.title?.trim() ||
      editor.caption?.trim() ||
      editor.altText?.trim() ||
      editor.tooltip?.trim() ||
      editor.description?.trim() ||
      editor.usageNotes?.trim() ||
      editor.structuredMeta?.trim() ||
      editor.schemaRef?.trim() ||
      editor.ownerUri?.trim() ||
      editor.assetSlug?.trim() ||
      editor.assetUri?.trim() ||
      editor.copyrightHolder?.trim() ||
      editor.license?.trim(),
  );

  return (
    <MediaAnnotationDrawer
      selectedItem={selectedItem}
      editor={editor}
      setEditor={setEditor}
      hasAnnotations={hasAnnotations}
      saveError={saveError}
      saveSuccess={saveSuccess}
      suggestAnnotations={suggestAnnotations}
      saveAnnotations={saveAnnotations}
      saveLoading={saveLoading}
    />
  );
}

function MediaAnnotationDrawer({
  selectedItem,
  editor,
  setEditor,
  hasAnnotations,
  saveError,
  saveSuccess,
  suggestAnnotations,
  saveAnnotations,
  saveLoading,
}) {
  const [isOpen, setIsOpen] = useState(hasAnnotations);

  return (
    <section className="rounded-xl border border-slate-300 bg-gradient-to-br from-white via-slate-50 to-blue-50 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.65)]">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full border border-slate-300 bg-white text-xs text-slate-600 transition ${
              isOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            &gt;
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              {t("admin.assetAnnotationsLabel", "Asset annotations")}
            </span>
            <span className="block text-[11px] text-slate-500 break-all">
              {selectedItem.title || selectedItem.url}
            </span>
          </span>
        </span>
        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {isOpen
            ? t("common.hide", "Hide")
            : hasAnnotations
              ? t("admin.annotationStatusConfigured", "Configured")
              : t("common.show", "Show")}
        </span>
      </button>
      {isOpen && (
        <div className="space-y-3 border-t border-slate-200 px-3.5 pb-3.5 pt-3">
          <p className="text-[11px] text-slate-500">
            {t(
              "admin.mediaAnnotateHint",
              "Manage caption, alt text, tooltip, and rights metadata for this asset.",
            )}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("common.name", "Name")}</span>
              <input
                type="text"
                value={editor.title}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageLicenseLabel", "License")}</span>
              <input
                type="text"
                value={editor.license}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    license: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.imageCaption", "Caption")}</span>
              <input
                type="text"
                value={editor.caption}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    caption: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageAltText", "Alt text")}</span>
              <input
                type="text"
                value={editor.altText}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    altText: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageTooltip", "Tooltip")}</span>
              <input
                type="text"
                value={editor.tooltip}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    tooltip: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.imageDescription", "Description")}</span>
              <textarea
                value={editor.description}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.mediaUsageNotes", "Usage notes")}</span>
              <textarea
                value={editor.usageNotes}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    usageNotes: event.target.value,
                  }))
                }
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
                placeholder={t(
                  "admin.mediaUsageNotesPlaceholder",
                  "How should this asset be used, and by which systems?",
                )}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>
                {t(
                  "admin.mediaStructuredMeta",
                  "Structured metadata (JSON/YAML)",
                )}
              </span>
              <textarea
                value={editor.structuredMeta}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    structuredMeta: event.target.value,
                  }))
                }
                rows={5}
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800 font-mono"
                placeholder={t(
                  "admin.mediaStructuredMetaPlaceholder",
                  "Example: columns with types, schema version, table semantics, etc.",
                )}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.mediaSchemaRef", "Schema reference")}</span>
              <input
                type="text"
                value={editor.schemaRef}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    schemaRef: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
                placeholder={t(
                  "admin.mediaSchemaRefPlaceholder",
                  "URL or key to external schema/contract documentation",
                )}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.mediaOwnerUri", "Owner URI")}</span>
              <input
                type="text"
                value={editor.ownerUri}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    ownerUri: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
                placeholder={t("admin.mediaOwnerUriPlaceholder", "/")}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>
                {t("admin.mediaAssetSlug", "Asset slug (optional)")}
              </span>
              <input
                type="text"
                value={editor.assetSlug}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    assetSlug: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
                placeholder={t(
                  "admin.mediaAssetSlugPlaceholder",
                  "optional-human-readable-label",
                )}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>
                {t("admin.mediaAssetUri", "Asset URI (asset-id based)")}
              </span>
              <input
                type="text"
                value={editor.assetUri}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    assetUri: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
                placeholder={t(
                  "admin.mediaAssetUriPlaceholder",
                  "/assets/<asset-id>",
                )}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>
                {t("admin.imageCopyrightHolderLabel", "Copyright holder")}
              </span>
              <input
                type="text"
                value={editor.copyrightHolder}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    copyrightHolder: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
          </div>

          {saveError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              {saveSuccess}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={suggestAnnotations}
              className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100"
            >
              {t("admin.mediaSuggestAlt", "Suggest alt/tooltip")}
            </button>
            <button
              type="button"
              onClick={saveAnnotations}
              disabled={saveLoading}
              className="px-3 py-1.5 rounded bg-gray-800 text-white text-xs hover:bg-gray-700 disabled:opacity-50"
            >
              {saveLoading
                ? t("admin.mediaSavingMetadata", "Saving…")
                : t("admin.mediaSaveMetadata", "Save metadata")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
