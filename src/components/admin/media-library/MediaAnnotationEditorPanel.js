"use client";

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

  return (
    <div className="rounded border bg-gray-50 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            {t("admin.mediaAnnotate", "Annotate")}
          </h3>
          <p className="text-xs text-gray-500 break-all">
            {selectedItem.title || selectedItem.url}
          </p>
          <p className="text-xs text-gray-500">
            {t(
              "admin.mediaAnnotateHint",
              "Manage caption, alt text, tooltip, and rights metadata for this asset.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={closeEditor}
          className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100"
        >
          {t("common.close", "Close")}
        </button>
      </div>

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
            {t("admin.mediaStructuredMeta", "Structured metadata (JSON/YAML)")}
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
          <span>{t("admin.mediaAssetSlug", "Asset slug (optional)")}</span>
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
          <span>{t("admin.mediaAssetUri", "Asset URI (asset-id based)")}</span>
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
  );
}
