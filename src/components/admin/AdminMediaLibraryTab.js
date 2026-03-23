"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { t } from "@/lib/i18n";
import {
  OPERATION_SCHEMAS,
  cloneOperations,
  bindOperationsToAsset,
} from "@/lib/derivationEngine";
import {
  MAX_IMAGE_BYTES,
  MAX_DATA_ASSET_BYTES,
  MAX_IMAGE_MB,
  MAX_DATA_MB,
  HISTORY_MAX_ENTRIES,
  DATA_ASSET_EXTENSIONS,
  PRESET_CROP_OPTIONS,
  LS_LAST_OPENED_KEY,
  extFromFileName,
  formatBytes,
  formatResolution,
  formatUpdatedAt,
  sourceLabel,
  sourceBadgeClass,
  buildPseudoDerivationName,
  getUnboundParameters,
  describeOperationParameters,
  formatParameterValue,
  isInvalidNumericParam,
  getInvalidOperationParameters,
  canPreviewImage,
  isImageFile,
  detectAssetKind,
  isSupportedUploadFile,
  canOpenDataViewer,
  resolveAssetType,
  parseTimestamp,
  parseSize,
  buildUploadHistoryEntry,
  defaultR2ObjectKey,
  normalizeEditorValue,
  normalizeEditorMultiline,
  normalizeOwnerUri,
  normalizeAssetSlug,
  toEditorState,
  stampOpenAndGetPrevious,
  isNewAsset,
  escXml,
  generateCyberduckBookmark,
  downloadCyberduckBookmark,
} from "@/lib/mediaLibraryHelpers";
import R2ConnectionPanel from "@/components/admin/R2ConnectionPanel";
import MediaViewerPanel from "@/components/admin/MediaViewerPanel";

export default function AdminMediaLibraryTab({
  uploadBackend = "wordpress",
  uploadInfo = null,
  uploadInfoDetails = null,
}) {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("updated-desc");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadHistory, setUploadHistory] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedUploadBackend, setSelectedUploadBackend] = useState("wordpress");
  const [focusedItemId, setFocusedItemId] = useState("");
  const [viewerItem, setViewerItem] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [viewerData, setViewerData] = useState(null);
  const [derivations, setDerivations] = useState([]);
  const [selectedDerivationId, setSelectedDerivationId] = useState("");
  const [customOperations, setCustomOperations] = useState([]);
  const [derivationError, setDerivationError] = useState("");
  const [applyingDerivation, setApplyingDerivation] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyProgressLabel, setApplyProgressLabel] = useState("");
  const [showAllDerivations, setShowAllDerivations] = useState(false);
  const [editorId, setEditorId] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorAssetTypes, setEditorAssetTypes] = useState([]);
  const [newOperationType, setNewOperationType] = useState(Object.keys(OPERATION_SCHEMAS)[0] || "");
  const [derivationSaveStatus, setDerivationSaveStatus] = useState("");
  const [derivationSaveError, setDerivationSaveError] = useState("");
  const [lastDerivedAsset, setLastDerivedAsset] = useState(null);
  const [savedDerivedAssets, setSavedDerivedAssets] = useState([]);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const [savePreviewError, setSavePreviewError] = useState("");
  const [r2ManualInfo, setR2ManualInfo] = useState(uploadInfoDetails?.isR2 ? uploadInfoDetails : null);
  const [r2ManualKey, setR2ManualKey] = useState(defaultR2ObjectKey);
  const [r2ManualTitle, setR2ManualTitle] = useState("");
  const [r2ManualAssetId, setR2ManualAssetId] = useState("");
  const [r2ManualOwnerUri, setR2ManualOwnerUri] = useState("/");
  const [r2ManualAssetSlug, setR2ManualAssetSlug] = useState("");
  const [r2ManualRightsHolder, setR2ManualRightsHolder] = useState("");
  const [r2ManualLicense, setR2ManualLicense] = useState("");
  const [r2ManualPreview, setR2ManualPreview] = useState(null);
  const [r2ManualRegistry, setR2ManualRegistry] = useState([]);
  const [r2ManualStorage, setR2ManualStorage] = useState(null);
  const [r2ManualLoading, setR2ManualLoading] = useState(false);
  const [r2ManualPending, setR2ManualPending] = useState(false);
  const [r2ManualError, setR2ManualError] = useState("");
  const [r2ManualStatus, setR2ManualStatus] = useState("");
  const [lastOpenedAt] = useState(() => stampOpenAndGetPrevious());
  const previewBlobUrlRef = useRef(null);
  const uploadInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const mediaRowsRef = useRef(new Map());

  const imageUploadOptions = useMemo(
    () => [
      {
        id: "wordpress",
        label: t("admin.uploadTargetWordpress"),
        enabled: true,
      },
      {
        id: "r2",
        label: t("admin.uploadTargetR2"),
        enabled: Boolean(uploadInfo?.r2),
      },
      ...(uploadInfo?.s3Enabled
        ? [
            {
              id: "s3",
              label: t("admin.uploadTargetS3"),
              enabled: Boolean(uploadInfo?.s3),
            },
          ]
        : []),
    ],
    [uploadInfo],
  );

  const enabledUploadOptions = useMemo(
    () => imageUploadOptions.filter((option) => option.enabled !== false),
    [imageUploadOptions],
  );

  const preferredUploadBackend = useMemo(
    () =>
      enabledUploadOptions.find((option) => option.id === "wordpress")?.id ||
      enabledUploadOptions.find((option) => option.id === uploadBackend)?.id ||
      enabledUploadOptions[0]?.id ||
      "wordpress",
    [enabledUploadOptions, uploadBackend],
  );

  useEffect(() => {
    const backendExists = enabledUploadOptions.some(
      (option) => option.id === selectedUploadBackend,
    );
    if (!backendExists) {
      setSelectedUploadBackend(preferredUploadBackend);
    }
  }, [enabledUploadOptions, preferredUploadBackend, selectedUploadBackend]);

  const r2ManualPublicUrl = useMemo(
    () =>
      normalizeEditorValue(
        r2ManualInfo?.publicUrl ||
          (uploadInfoDetails?.isR2 ? uploadInfoDetails?.publicUrl : ""),
        1200,
      ),
    [r2ManualInfo, uploadInfoDetails],
  );

  const r2ManualObjectUrl = useMemo(() => {
    const base = String(r2ManualPublicUrl || "").replace(/\/+$/, "");
    const key = String(r2ManualKey || "").trim().replace(/^\/+/, "");
    if (!base || !key) return "";
    return `${base}/${key
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }, [r2ManualPublicUrl, r2ManualKey]);

  const r2ManualStorageLabel = useMemo(() => {
    if (r2ManualStorage?.provider === "cloudflare-kv") {
      return `KV (${r2ManualStorage.key || "media-asset-registry"})`;
    }
    if (r2ManualStorage?.provider) return r2ManualStorage.provider;
    return "memory";
  }, [r2ManualStorage]);

  const r2ManualSuggestedAssetId = useMemo(() => {
    const safeKey = String(r2ManualKey || "").trim().replace(/^\/+/, "");
    if (!safeKey) return "";
    const normalized = safeKey
      .toLowerCase()
      .replace(/[^a-z0-9._:/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "")
      .slice(0, 96);
    return normalized;
  }, [r2ManualKey]);

  const loadR2ManualRegistry = useCallback(async () => {
    setR2ManualLoading(true);
    setR2ManualError("");
    try {
      const [infoResponse, registryResponse] = await Promise.all([
        fetch("/api/admin/upload-info?backend=r2"),
        fetch("/api/admin/media-library/cyberduck-r2"),
      ]);
      const infoJson = await infoResponse.json().catch(() => ({}));
      const registryJson = await registryResponse.json().catch(() => ({}));
      if (infoJson?.ok) {
        setR2ManualInfo(infoJson);
      }
      if (!registryResponse.ok || !registryJson?.ok) {
        throw new Error(
          registryJson?.error ||
            t(
              "admin.mediaR2ManualLoadFailed",
              "Could not load the R2 manual-ingest panel.",
            ),
        );
      }
      setR2ManualRegistry(
        Array.isArray(registryJson.assets) ? registryJson.assets : [],
      );
      setR2ManualStorage(registryJson.storage || null);
    } catch (loadError) {
      setR2ManualRegistry([]);
      setR2ManualStorage(null);
      setR2ManualError(
        loadError instanceof Error
          ? loadError.message
          : t(
              "admin.mediaR2ManualLoadFailed",
              "Could not load the R2 manual-ingest panel.",
            ),
      );
    } finally {
      setR2ManualLoading(false);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "60" });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (searchTerm) params.set("search", searchTerm);
      const response = await fetch(`/api/admin/media-library?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t("admin.mediaLibraryLoadFailed", "Failed to load the media library."),
        );
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setSources(json.sources || null);
      setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
    } catch (fetchError) {
      setItems([]);
      setSources(null);
      setWarnings([]);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("admin.mediaLibraryLoadFailed", "Failed to load the media library."),
      );
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, searchTerm]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary, refreshToken]);

  const loadDerivations = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/derivations");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.mediaDerivationsLoadFailed", "Could not load derivations."));
      }
      setDerivations(Array.isArray(json.derivations) ? json.derivations : []);
    } catch (derivationLoadError) {
      setDerivationError(
        derivationLoadError instanceof Error
          ? derivationLoadError.message
          : t("admin.mediaDerivationsLoadFailed", "Could not load derivations."),
      );
    }
  }, []);

  useEffect(() => {
    loadDerivations();
  }, [loadDerivations]);

  useEffect(() => {
    loadR2ManualRegistry();
  }, [loadR2ManualRegistry]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("savedDerivedAssets");
      if (stored) {
        setSavedDerivedAssets(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("savedDerivedAssets", JSON.stringify(savedDerivedAssets));
  }, [savedDerivedAssets]);

  // Revoke previous blob URL when a new preview is set or component unmounts
  useEffect(() => {
    const prev = previewBlobUrlRef.current;
    previewBlobUrlRef.current = previewBlobUrl;
    if (prev && prev !== previewBlobUrl) URL.revokeObjectURL(prev);
    return () => {
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
    };
  }, [previewBlobUrl]);

  useEffect(() => {
    if (!selectedDerivationId && derivations.length > 0) {
      setSelectedDerivationId(derivations[0].id);
    }
  }, [derivations, selectedDerivationId]);

  const rows = useMemo(() => {
    let nextRows = Array.isArray(items) ? [...items] : [];
    if (typeFilter === "image") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "image");
    } else if (typeFilter === "data") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "data");
    } else if (typeFilter === "other") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "other");
    }

    nextRows.sort((left, right) => {
      if (sortOrder === "name-asc") {
        return String(left?.title || "").localeCompare(String(right?.title || ""));
      }
      if (sortOrder === "name-desc") {
        return String(right?.title || "").localeCompare(String(left?.title || ""));
      }
      if (sortOrder === "size-desc") {
        return parseSize(right?.sizeBytes) - parseSize(left?.sizeBytes);
      }
      if (sortOrder === "size-asc") {
        return parseSize(left?.sizeBytes) - parseSize(right?.sizeBytes);
      }
      if (sortOrder === "updated-asc") {
        return parseTimestamp(left?.updatedAt) - parseTimestamp(right?.updatedAt);
      }
      return parseTimestamp(right?.updatedAt) - parseTimestamp(left?.updatedAt);
    });

    return nextRows;
  }, [items, sortOrder, typeFilter]);

  const focusedItem = useMemo(
    () => rows.find((item) => item.id === focusedItemId) || null,
    [rows, focusedItemId],
  );
  useEffect(() => {
    if (focusedItemId && !focusedItem) {
      setFocusedItemId("");
    }
  }, [focusedItem, focusedItemId]);

  const focusedRowIndex = useMemo(
    () => rows.findIndex((item) => item.id === focusedItemId),
    [focusedItemId, rows],
  );

  const wordpressRowsBySourceId = useMemo(() => {
    const mapping = new Map();
    rows.forEach((item) => {
      if (item?.source !== "wordpress") return;
      const sourceId = Number.parseInt(String(item?.sourceId ?? ""), 10);
      if (!Number.isFinite(sourceId)) return;
      mapping.set(String(sourceId), item);
    });
    return mapping;
  }, [rows]);

  const registerMediaRowRef = useCallback((id, node) => {
    if (!id) return;
    if (node) {
      mediaRowsRef.current.set(id, node);
      return;
    }
    mediaRowsRef.current.delete(id);
  }, []);

  const focusRowByIndex = useCallback(
    (nextIndex) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const boundedIndex = Math.max(0, Math.min(rows.length - 1, nextIndex));
      const target = rows[boundedIndex];
      if (!target) return;
      setFocusedItemId(target.id);
      mediaRowsRef.current.get(target.id)?.scrollIntoView?.({
        block: "nearest",
      });
    },
    [rows],
  );

  const focusItemById = useCallback((itemId) => {
    if (!itemId) return;
    setFocusedItemId(itemId);
    mediaRowsRef.current.get(itemId)?.scrollIntoView?.({
      block: "nearest",
    });
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  const selectedDerivation = useMemo(
    () => derivations.find((entry) => entry.id === selectedDerivationId) || null,
    [derivations, selectedDerivationId],
  );

  const focusedAssetType = useMemo(
    () => (focusedItem ? resolveAssetType(focusedItem) : null),
    [focusedItem],
  );

  const focusedAssetTypeLabel = useMemo(() => {
    if (!focusedAssetType) return "";
    if (focusedAssetType === "image") return t("admin.mediaTypeImage", "Images");
    if (focusedAssetType === "data") return t("admin.mediaTypeData", "Data files");
    return t("admin.mediaTypeOther", "Other");
  }, [focusedAssetType]);

  const focusedAssetLineage = useMemo(() => {
    const asset = focusedItem?.asset;
    if (!asset || typeof asset !== "object") {
      return { hasLineage: false, original: null, variants: [] };
    }
    const parsedOriginalId = Number.parseInt(String(asset.originalId ?? ""), 10);
    const originalSourceId = Number.isFinite(parsedOriginalId) ? parsedOriginalId : null;
    const originalItem =
      originalSourceId != null
        ? wordpressRowsBySourceId.get(String(originalSourceId)) || null
        : null;
    const variants = (Array.isArray(asset.variants) ? asset.variants : [])
      .map((variant, index) => {
        const parsedVariantId = Number.parseInt(String(variant?.sourceId ?? ""), 10);
        const sourceId = Number.isFinite(parsedVariantId) ? parsedVariantId : null;
        const linkedItem =
          sourceId != null
            ? wordpressRowsBySourceId.get(String(sourceId)) || null
            : null;
        return {
          key: sourceId != null ? `wp:${sourceId}` : `idx:${index}`,
          sourceId,
          linkedItem,
          variantKind:
            normalizeEditorValue(variant?.variantKind || "", 80) || null,
          format: normalizeEditorValue(variant?.format || "", 40) || null,
          url: normalizeEditorValue(variant?.url || "", 1024) || null,
        };
      })
      .filter((variant) => variant.sourceId != null || variant.url);

    const hasLineage = Boolean(
      normalizeEditorValue(asset.assetId || "", 96) ||
        originalSourceId != null ||
        normalizeEditorValue(asset.originalUrl || "", 1024) ||
        variants.length > 0,
    );

    return {
      hasLineage,
      original: {
        sourceId: originalSourceId,
        item: originalItem,
        url: normalizeEditorValue(asset.originalUrl || "", 1024) || null,
      },
      variants,
    };
  }, [focusedItem, wordpressRowsBySourceId]);

  const filteredDerivations = useMemo(() => {
    if (showAllDerivations || !focusedAssetType) return derivations;
    return derivations.filter((entry) => {
      const assetTypes = Array.isArray(entry.assetTypes) ? entry.assetTypes : [];
      return assetTypes.length === 0 || assetTypes.includes(focusedAssetType);
    });
  }, [derivations, focusedAssetType, showAllDerivations]);

  const availableDerivations = showAllDerivations ? derivations : filteredDerivations;

  useEffect(() => {
    if (availableDerivations.length === 0) {
      setSelectedDerivationId("");
      return;
    }
    if (
      !selectedDerivationId ||
      !availableDerivations.some((entry) => entry.id === selectedDerivationId)
    ) {
      setSelectedDerivationId(availableDerivations[0].id);
    }
  }, [availableDerivations, selectedDerivationId]);

  const derivationUnboundParameters = useMemo(
    () => getUnboundParameters(customOperations),
    [customOperations],
  );
  const derivationInvalidParameters = useMemo(
    () => getInvalidOperationParameters(customOperations),
    [customOperations],
  );
  const derivationPseudoName = useMemo(
    () => buildPseudoDerivationName(customOperations),
    [customOperations],
  );
  const derivationMatrixRows = useMemo(() => {
    return customOperations.map((operation, index) => {
      const schema = OPERATION_SCHEMAS[operation.type];
      const params = (schema?.parameters || []).map((param) => {
        const value = operation.params?.[param.key];
        return {
          key: param.key,
          label: param.label,
          bound: value != null,
          value,
        };
      });
      return {
        index,
        operation,
        schema,
        params,
      };
    });
  }, [customOperations]);
  const derivationIsConcrete = derivationUnboundParameters.length === 0;

  useEffect(() => {
    if (!selectedDerivation) {
      setCustomOperations([]);
      return;
    }
    setCustomOperations(cloneOperations(selectedDerivation.operations));
    setEditorId(selectedDerivation.id || "");
    setEditorName(selectedDerivation.name || "");
    setEditorDescription(selectedDerivation.description || "");
    setEditorAssetTypes(Array.isArray(selectedDerivation.assetTypes) ? [...selectedDerivation.assetTypes] : []);
  }, [selectedDerivation]);

  useEffect(() => {
    if (!focusedItem) return;
    setCustomOperations((current) => {
      const hasSource = current.some((operation) => operation.type === "source");
      if (!hasSource) return current;
      let updated = null;
      const targetId = focusedItem.id || "";
      updated = current.map((operation) => {
        if (operation.type !== "source") return operation;
        if (operation.params?.assetId === targetId) return operation;
        return {
          ...operation,
          params: {
            ...operation.params,
            assetId: targetId,
          },
        };
      });
      return updated;
    });
  }, [focusedItem]);

  const rowStats = useMemo(() => {
    let imageCount = 0;
    let dataCount = 0;
    let otherCount = 0;
    let totalBytes = 0;
    for (const row of rows) {
      const type = resolveAssetType(row);
      if (type === "image") imageCount += 1;
      else if (type === "data") dataCount += 1;
      else otherCount += 1;
      totalBytes += parseSize(row?.sizeBytes);
    }
    return {
      shownCount: rows.length,
      totalCount: Array.isArray(items) ? items.length : 0,
      totalBytes,
      imageCount,
      dataCount,
      otherCount,
    };
  }, [items, rows]);

  const historyStatusLabel = (status) => {
    if (status === "uploaded") {
      return t("admin.mediaHistoryStatusUploaded", "Uploaded");
    }
    if (status === "error") {
      return t("admin.mediaHistoryStatusError", "Error");
    }
    if (status === "skipped") {
      return t("admin.mediaHistoryStatusSkipped", "Skipped");
    }
    return String(status || "info");
  };

  const openHistoryUrl = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noreferrer");
  };

  const formatHistoryTimestamp = (value) => {
    if (!value) return "";
    const time = Number(value);
    if (!Number.isFinite(time)) return "";
    return new Date(time).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  async function runR2ManualAction({ persist }) {
    const key = normalizeEditorValue(r2ManualKey, 512).replace(/^\/+/, "");
    if (!key) {
      setR2ManualError(
        t(
          "admin.mediaR2ManualKeyRequired",
          "Enter an R2 object key before previewing or saving.",
        ),
      );
      return;
    }
    setR2ManualPending(true);
    setR2ManualError("");
    setR2ManualStatus("");
    try {
      const response = await fetch("/api/admin/media-library/cyberduck-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          persist: Boolean(persist),
          title: normalizeEditorValue(r2ManualTitle, 200),
          assetId: normalizeEditorValue(r2ManualAssetId, 96),
          ownerUri: normalizeOwnerUri(r2ManualOwnerUri),
          assetSlug: normalizeAssetSlug(r2ManualAssetSlug, 120),
          rights: {
            copyrightHolder: normalizeEditorValue(r2ManualRightsHolder, 180),
            license: normalizeEditorValue(r2ManualLicense, 180),
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t(
              "admin.mediaR2ManualSaveFailed",
              "Could not preview or save the R2 object.",
            ),
        );
      }
      const preview = json.preview || null;
      setR2ManualPreview(preview);
      setR2ManualStorage(json.storage || null);
      if (!r2ManualTitle && preview?.title) {
        setR2ManualTitle(preview.title);
      }
      if (!r2ManualAssetId && r2ManualSuggestedAssetId) {
        setR2ManualAssetId(r2ManualSuggestedAssetId);
      }
      if (json.persisted) {
        setR2ManualStatus(
          t(
            "admin.mediaR2ManualSaved",
            "Asset metadata saved to R2 and registry record saved to KV.",
          ),
        );
        await loadR2ManualRegistry();
        setRefreshToken((current) => current + 1);
      } else {
        setR2ManualStatus(
          t(
            "admin.mediaR2ManualPreviewReady",
            "Preview loaded. Save when metadata looks correct.",
          ),
        );
      }
    } catch (saveError) {
      setR2ManualError(
        saveError instanceof Error
          ? saveError.message
          : t(
              "admin.mediaR2ManualSaveFailed",
              "Could not preview or save the R2 object.",
            ),
      );
    } finally {
      setR2ManualPending(false);
    }
  }

  function handleMediaTableKeyDown(event) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const start = focusedRowIndex >= 0 ? focusedRowIndex + 1 : 0;
      focusRowByIndex(start);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const start =
        focusedRowIndex >= 0 ? focusedRowIndex - 1 : rows.length - 1;
      focusRowByIndex(start);
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      focusRowByIndex(focusedRowIndex >= 0 ? focusedRowIndex : 0);
      return;
    }
    const activeItem =
      focusedRowIndex >= 0 ? rows[focusedRowIndex] : rows[0] || null;
    if (!activeItem) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (canOpenDataViewer(activeItem) || canPreviewImage(activeItem)) {
        openViewer(activeItem);
      } else {
        openEditor(activeItem);
      }
      return;
    }
    if (event.key.toLowerCase() === "a") {
      event.preventDefault();
      openEditor(activeItem);
      return;
    }
    if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyUrl(activeItem.url);
    }
  }

  useEffect(() => {
    if (!selectedItem) return;
    setEditor((current) => current || toEditorState(selectedItem));
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem && !viewerItem) return undefined;
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (viewerItem) {
        closeViewer();
        return;
      }
      if (selectedItem) {
        closeEditor();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedItem, viewerItem, closeEditor, closeViewer]);

  async function copyUrl(url) {
    if (!url || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl(""), 1100);
    } catch {
      // Ignore clipboard errors in restricted environments.
    }
  }

  function openEditor(item) {
    setSelectedId(item.id);
    setEditor(toEditorState(item));
    setSaveError("");
    setSaveSuccess("");
  }

  const closeEditor = useCallback(() => {
    setSelectedId("");
    setEditor(null);
    setSaveError("");
    setSaveSuccess("");
  }, []);

  const closeViewer = useCallback(() => {
    setViewerItem(null);
    setViewerData(null);
    setViewerError("");
    setViewerLoading(false);
  }, []);

  function suggestAnnotations() {
    setEditor((current) => {
      if (!current) return current;
      const seed = normalizeEditorValue(
        current.caption ||
          current.description ||
          current.title ||
          selectedItem?.title ||
          "",
        300,
      );
      if (!seed) return current;
      return {
        ...current,
        altText: current.altText || seed,
        tooltip: current.tooltip || seed,
      };
    });
  }

  async function saveAnnotations() {
    if (!selectedItem || !editor || saveLoading) return;
    setSaveLoading(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const payload = {
        source: selectedItem.source,
        sourceId: selectedItem.sourceId,
        key: selectedItem.key,
        metadata: {
          title: normalizeEditorValue(editor.title, 200),
          caption: normalizeEditorValue(editor.caption, 300),
          description: normalizeEditorValue(editor.description, 600),
          altText: normalizeEditorValue(editor.altText, 300),
          tooltip: normalizeEditorValue(editor.tooltip, 300),
          usageNotes: normalizeEditorMultiline(editor.usageNotes, 1200),
          structuredMeta: normalizeEditorMultiline(editor.structuredMeta, 1800),
          schemaRef: normalizeEditorValue(editor.schemaRef, 400),
        },
        asset: {
          assetId: normalizeEditorValue(editor.assetId, 96),
          ownerUri: normalizeOwnerUri(editor.ownerUri, 320),
          uri: normalizeEditorValue(editor.assetUri, 400),
          slug: normalizeAssetSlug(editor.assetSlug, 120),
        },
        rights: {
          copyrightHolder: normalizeEditorValue(editor.copyrightHolder, 180),
          license: normalizeEditorValue(editor.license, 180),
        },
      };
      const response = await fetch("/api/admin/media-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || t("admin.mediaMetaSaveFailed", "Failed to save media metadata."),
        );
      }
      setSaveSuccess(t("admin.mediaMetaSaved", "Metadata saved."));
      await loadLibrary();
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.mediaMetaSaved", "Metadata saved.") },
        }),
      );
    } catch (saveMetadataError) {
      const message =
        saveMetadataError instanceof Error
          ? saveMetadataError.message
          : t("admin.mediaMetaSaveFailed", "Failed to save media metadata.");
      setSaveError(message);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    } finally {
      setSaveLoading(false);
    }
  }

  function openUploadPicker() {
    const input = uploadInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  function extractUploadFiles(sourceData) {
    if (!sourceData) return [];
    const fromFiles = Array.from(sourceData.files || []);
    if (fromFiles.length > 0) {
      return fromFiles.filter((file) => file instanceof File);
    }
    const files = [];
    const items = Array.from(sourceData.items || []);
    for (const item of items) {
      if (!item || item.kind !== "file") continue;
      const file = item.getAsFile?.();
      if (!(file instanceof File)) continue;
      files.push(file);
    }
    return files;
  }

  async function uploadAssetFiles(files) {
    if (uploading) return;
    const list = Array.from(files || []).filter((file) => file instanceof File);
    if (list.length === 0) return;

    const unsupported = list.filter((file) => !isSupportedUploadFile(file));
    const oversized = list.filter((file) => {
      const kind = detectAssetKind(file);
      const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_DATA_ASSET_BYTES;
      return file.size > maxBytes;
    });
    const valid = list.filter((file) => {
      if (!isSupportedUploadFile(file)) return false;
      const kind = detectAssetKind(file);
      const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_DATA_ASSET_BYTES;
      return file.size <= maxBytes;
    });

    const unsupportedMessage = t(
      "admin.mediaUploadUnsupported",
      "Only images, JSON, YAML, CSV, Markdown, and SQLite files are supported.",
    );
    const oversizedMessage = t(
      "admin.mediaUploadTooLargeMixed",
      "Some files exceeded size limits (images: {imageMb} MB, data files: {dataMb} MB).",
      { imageMb: 20, dataMb: 100 },
    );
    const skippedEntries = [
      ...unsupported.map((file) =>
        buildUploadHistoryEntry({
          name: file.name,
          status: "skipped",
          detail: unsupportedMessage,
          backend: selectedUploadBackend,
        }),
      ),
      ...oversized.map((file) =>
        buildUploadHistoryEntry({
          name: file.name,
          status: "skipped",
          detail: oversizedMessage,
          backend: selectedUploadBackend,
        }),
      ),
    ];

    if (valid.length === 0) {
      setUploadHistory((prev) =>
        [...skippedEntries, ...prev].slice(0, HISTORY_MAX_ENTRIES),
      );
      setUploadStatus("");
      setUploadError(unsupported.length > 0 ? unsupportedMessage : oversizedMessage);
      return;
    }

    setUploading(true);
    setUploadCount(valid.length);
    setUploadError("");
    setUploadStatus(t("admin.mediaUploadUploading", { n: valid.length }));
    let succeeded = 0;
    const errors = [];
    const attemptEntries = [];

    for (const file of valid) {
      const entry = buildUploadHistoryEntry({
        name: file.name,
        status: "pending",
        backend: selectedUploadBackend,
      });
      try {
        const formData = new FormData();
        formData.append("file", file, file.name || "media-asset");
        const kind = detectAssetKind(file);
        const query = new URLSearchParams({
          kind: kind === "image" ? "image" : "asset",
        });
        if (selectedUploadBackend) {
          query.set("backend", selectedUploadBackend);
        }
        const response = await fetch(`/api/admin/upload?${query.toString()}`, {
          method: "POST",
          body: formData,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || t("admin.mediaUploadFailed"));
        }
        entry.status = "uploaded";
        entry.url = json?.url || entry.url;
        entry.detail = json?.title || "";
        entry.backend = json?.backend || entry.backend;
        succeeded += 1;
      } catch (uploadSingleError) {
        entry.status = "error";
        const message =
          uploadSingleError instanceof Error
            ? uploadSingleError.message
            : t("admin.mediaUploadFailed");
        entry.detail = message;
        errors.push(message);
      } finally {
        attemptEntries.push(entry);
      }
    }

    const skipped = oversized.length + unsupported.length;
    const failed = errors.length;
    const total = valid.length + skipped;

    if (succeeded > 0) {
      const successText =
        failed > 0 || skipped > 0
          ? t("admin.mediaUploadPartial", {
              ok: succeeded,
              total,
            })
          : t("admin.mediaUploadDone", { n: succeeded });
      setUploadStatus(successText);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: successText },
        }),
      );
      setRefreshToken((value) => value + 1);
    } else {
      setUploadStatus("");
    }

    if (failed > 0 || skipped > 0) {
      const summaryParts = [];
      if (failed > 0) {
        summaryParts.push(t("admin.mediaUploadFailed"));
      }
      if (skipped > 0) {
        if (unsupported.length > 0) summaryParts.push(unsupportedMessage);
        if (oversized.length > 0) summaryParts.push(oversizedMessage);
      }
      if (errors[0]) summaryParts.push(errors[0]);
      const message = summaryParts.filter(Boolean).join(" ");
      setUploadError(message);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    } else {
      setUploadError("");
    }

    const combinedHistory = [...attemptEntries, ...skippedEntries];
    if (combinedHistory.length > 0) {
      setUploadHistory((prev) =>
        [...combinedHistory, ...prev].slice(0, HISTORY_MAX_ENTRIES),
      );
    }

    setUploading(false);
    setUploadCount(0);
  }

  function handleUploadInputChange(event) {
    const files = extractUploadFiles(event.currentTarget);
    uploadAssetFiles(files);
  }

  function handleDropZonePaste(event) {
    const files = extractUploadFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    uploadAssetFiles(files);
  }

  function handleDropZoneDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDropZoneDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDropZoneDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDropZoneDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = extractUploadFiles(event.dataTransfer);
    if (files.length === 0) {
      setUploadError(
        t(
          "admin.mediaUploadUnsupported",
          "Only images, JSON, YAML, CSV, Markdown, and SQLite files are supported.",
        ),
      );
      return;
    }
    uploadAssetFiles(files);
  }

  function handleOperationParamChange(operationIndex, key, rawValue) {
    setCustomOperations((current) =>
      current.map((operation, index) => {
        if (index !== operationIndex) return operation;
        const schemaParam = OPERATION_SCHEMAS[operation.type]?.parameters?.find(
          (param) => param.key === key,
        );
        let value = rawValue;
        if (typeof rawValue === "string" && rawValue.trim() === "") {
          value = undefined;
        } else if (schemaParam?.type === "number") {
          const parsed = Number(rawValue);
          value = Number.isFinite(parsed) ? parsed : rawValue;
        }
        const nextParams = { ...operation.params };
        if (value === undefined) {
          delete nextParams[key];
        } else {
          nextParams[key] = value;
        }
        return {
          ...operation,
          params: nextParams,
        };
      }),
    );
  }

  function handleAddOperation() {
    if (!newOperationType) return;
    const schema = OPERATION_SCHEMAS[newOperationType];
    const defaultParams = {};
    schema?.parameters?.forEach((param) => {
      if (param.type === "number") {
        if (param.key === "x" || param.key === "y") {
          defaultParams[param.key] = 0.5;
        } else if (param.key === "size") {
          defaultParams[param.key] = 24;
        } else {
          defaultParams[param.key] = typeof param.min === "number" ? param.min : 0;
        }
      } else if (param.key === "preset") {
        defaultParams[param.key] = PRESET_CROP_OPTIONS[0]?.value || "";
      } else if (param.key === "typeface") {
        defaultParams[param.key] = "Inter";
      } else if (param.key === "text") {
        defaultParams[param.key] = "Caption";
      } else {
        defaultParams[param.key] = "";
      }
    });
    setCustomOperations((current) => [...current, { type: newOperationType, params: defaultParams }]);
  }

  function handleRemoveOperation(operationIndex) {
    setCustomOperations((current) => current.filter((_, index) => index !== operationIndex));
  }

  function handleToggleAssetType(type) {
    setEditorAssetTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  }

  async function saveDerivationTemplate() {
    if (!editorId.trim() || !editorName.trim() || customOperations.length === 0) {
      setDerivationSaveStatus("error");
      setDerivationSaveError(
        t(
          "admin.mediaDerivationSaveValidation",
          "Derivation id, name, and at least one operation are required.",
        ),
      );
      return;
    }
    setDerivationSaveStatus("saving");
    setDerivationSaveError("");
    try {
      const response = await fetch("/api/admin/derivations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editorId.trim(),
          name: editorName.trim(),
          description: editorDescription.trim(),
          assetTypes: editorAssetTypes,
          operations: customOperations,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.mediaDerivationSaveFailed", "Could not save derivation."));
      }
      setDerivationSaveStatus("saved");
      loadDerivations();
      setSelectedDerivationId(json.derivation?.id || editorId.trim());
    } catch (saveError) {
      setDerivationSaveStatus("error");
      setDerivationSaveError(
        saveError instanceof Error
          ? saveError.message
          : t("admin.mediaDerivationSaveFailed", "Could not save derivation."),
      );
    }
  }

  function handleSaveDerivedAsset() {
    if (!lastDerivedAsset) return;
    const entry = {
      id: lastDerivedAsset.id || `${selectedDerivationId || "derived"}-${Date.now()}`,
      title: lastDerivedAsset.title || selectedDerivation?.name || "Derived asset",
      url: lastDerivedAsset.url || "",
      operations: Array.isArray(lastDerivedAsset.operations) ? lastDerivedAsset.operations : [],
      timestamp: Date.now(),
    };
    setSavedDerivedAssets((current) => {
      const filtered = current.filter((item) => item.id !== entry.id);
      return [entry, ...filtered].slice(0, 20);
    });
  }

  // Maps op type / progress label keys to human-readable strings
  const APPLY_LABELS = {
    fetch:       t("admin.mediaDerivationStepFetch",      "Fetching image…"),
    load:        t("admin.mediaDerivationStepLoad",       "Loading image…"),
    decode_avif: t("admin.mediaDerivationStepDecodeAvif", "Decoding AVIF source…"),
    encode_avif: t("admin.mediaDerivationStepEncodeAvif", "Encoding AVIF output…"),
    encode:      t("admin.mediaDerivationStepEncode",     "Encoding output…"),
    pipeline:    t("admin.mediaDerivationStepPipeline",   "Processing…"),
    // op types
    resize:      t("admin.mediaDerivationOpResize",       "Resizing…"),
    crop:        t("admin.mediaDerivationOpCrop",         "Cropping…"),
    blur:        t("admin.mediaDerivationOpBlur",         "Blurring…"),
    sharpen:     t("admin.mediaDerivationOpSharpen",      "Sharpening…"),
    brightness:  t("admin.mediaDerivationOpBrightness",   "Adjusting brightness…"),
    grayscale:   t("admin.mediaDerivationOpGrayscale",    "Converting to grayscale…"),
    saturation:  t("admin.mediaDerivationOpSaturation",   "Adjusting saturation…"),
    sepia:       t("admin.mediaDerivationOpSepia",        "Applying sepia…"),
    colorBoost:  t("admin.mediaDerivationOpColorBoost",   "Boosting colors…"),
    hueRotate:   t("admin.mediaDerivationOpHueRotate",    "Rotating hue…"),
    tint:        t("admin.mediaDerivationOpTint",         "Tinting…"),
    invert:      t("admin.mediaDerivationOpInvert",       "Inverting…"),
    solarize:    t("admin.mediaDerivationOpSolarize",     "Solarizing…"),
    flip:        t("admin.mediaDerivationOpFlip",         "Flipping…"),
    rotate:      t("admin.mediaDerivationOpRotate",       "Rotating…"),
    padding:     t("admin.mediaDerivationOpPadding",      "Adding padding…"),
    pixelize:    t("admin.mediaDerivationOpPixelize",     "Pixelizing…"),
    duotone:     t("admin.mediaDerivationOpDuotone",      "Applying duotone…"),
    oil:         t("admin.mediaDerivationOpOil",          "Painting oil effect…"),
    presetCrop:  t("admin.mediaDerivationOpPresetCrop",   "Cropping to ratio…"),
    cropCircle:  t("admin.mediaDerivationOpCropCircle",   "Cropping to circle…"),
    textOverlay: t("admin.mediaDerivationOpTextOverlay",  "Adding text overlay…"),
  };

  async function applySelectedDerivation() {
    if (!selectedDerivation || !focusedItem) {
      setDerivationError(t("admin.mediaDerivationRequiresSelection", "Select a derivation and an asset first."));
      return;
    }
    if (derivationInvalidParameters.length > 0) {
      setDerivationError(
        t(
          "admin.mediaDerivationFixInvalidNumeric",
          "Fix invalid numeric parameters before applying the derivation.",
        ),
      );
      return;
    }
    if (derivationUnboundParameters.length > 0) {
      setDerivationError(
        t(
          "admin.mediaDerivationFillParameters",
          "Fill all operation parameters before applying the derivation.",
        ),
      );
      return;
    }
    const operationsToApply = bindOperationsToAsset(customOperations, focusedItem?.id);
    setApplyingDerivation(true);
    setApplyProgress(0);
    setApplyProgressLabel(t("admin.mediaDerivationStepFetch", "Fetching image…"));
    setDerivationError("");
    setSavePreviewError("");
    setPreviewBlobUrl(null);
    setPreviewBlob(null);
    try {
      const response = await fetch("/api/admin/derivations/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          derivationId: selectedDerivation.id,
          asset: focusedItem,
          operations: operationsToApply,
        }),
      });

      if (!response.ok || !response.body) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || t("admin.mediaDerivationFailed", "Could not apply derivation."));
      }

      // Read NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop(); // keep any incomplete trailing line
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try { evt = JSON.parse(line); } catch { continue; }

          if (evt.type === "progress") {
            setApplyProgress(evt.pct ?? 0);
            setApplyProgressLabel(APPLY_LABELS[evt.label] ?? evt.label ?? "");
          } else if (evt.type === "done") {
            // Decode base64 → Blob
            const byteString = atob(evt.data);
            const bytes = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
            const blob = new Blob([bytes], { type: evt.contentType });
            setPreviewBlob(blob);
            setPreviewBlobUrl(URL.createObjectURL(blob));
            setApplyProgress(100);
          } else if (evt.type === "error") {
            throw new Error(evt.message || t("admin.mediaDerivationFailed", "Could not apply derivation."));
          }
        }
      }
    } catch (applyError) {
      setDerivationError(
        applyError instanceof Error
          ? applyError.message
          : t("admin.mediaDerivationFailed", "Could not apply derivation."),
      );
    } finally {
      setApplyingDerivation(false);
    }
  }

  async function savePreviewToLibrary() {
    if (!previewBlob || savingPreview) return;
    setSavingPreview(true);
    setSavePreviewError("");
    try {
      const ext = previewBlob.type === "image/png" ? "png" : previewBlob.type === "image/webp" ? "webp" : previewBlob.type === "image/avif" ? "avif" : "jpg";
      const filename = `${selectedDerivation?.id || "derived"}-${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append("file", previewBlob, filename);
      const query = new URLSearchParams({ backend: selectedUploadBackend });
      const response = await fetch(`/api/admin/upload?${query.toString()}`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.mediaSaveDerivedAssetFailed", "Could not save to library."));
      }
      const entry = buildUploadHistoryEntry({
        name: json.asset?.title || filename,
        status: "uploaded",
        detail: t("admin.mediaDerivationApplied", "Derived asset saved"),
        url: json.asset?.url,
        backend: selectedUploadBackend,
      });
      setUploadHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX_ENTRIES));
      setPreviewBlobUrl(null);
      setPreviewBlob(null);
    } catch (saveErr) {
      setSavePreviewError(
        saveErr instanceof Error
          ? saveErr.message
          : t("admin.mediaSaveDerivedAssetFailed", "Could not save to library."),
      );
    } finally {
      setSavingPreview(false);
    }
  }

  async function openViewer(item) {
    if (!item?.url || viewerLoading) return;
    setViewerItem(item);
    setViewerLoading(true);
    setViewerError("");
    setViewerData(null);
    try {
      const params = new URLSearchParams({
        url: item.url,
        name: item.title || item.key || "asset",
      });
      if (item.mimeType) params.set("mimeType", item.mimeType);
      const response = await fetch(`/api/admin/media-library/view?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || t("admin.mediaViewerLoadFailed", "Could not load file viewer."),
        );
      }
      setViewerData(json);
    } catch (viewerLoadError) {
      setViewerError(
        viewerLoadError instanceof Error
          ? viewerLoadError.message
          : t("admin.mediaViewerLoadFailed", "Could not load file viewer."),
      );
    } finally {
      setViewerLoading(false);
    }
  }

  useEffect(() => {
    if (!focusedItem) return;
    window.dispatchEvent(
      new CustomEvent("mediaAssetSelected", { detail: focusedItem }),
    );
  }, [focusedItem]);

  // ── S3/R2 connection checklist ─────────────────────────────────────────────
  return (
    <div className="border rounded p-5 space-y-4 bg-white min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {t("admin.navMedia", "Media")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t(
              "admin.mediaLibrarySummary",
              "Combined library from WordPress media and Cloudflare R2.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={loading}
          className="px-3 py-2 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {t("admin.mediaRefresh", "Refresh")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: t("admin.mediaAllSources", "All sources") },
          { id: "wordpress", label: "WordPress" },
          { id: "r2", label: "R2" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSourceFilter(option.id)}
            className={`px-3 py-1.5 rounded border text-sm ${
              sourceFilter === option.id
                ? "border-purple-500 bg-purple-50 text-purple-800"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>{t("admin.mediaTypeFilter", "Asset type")}</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="border rounded px-2 py-1 text-xs bg-white"
          >
            <option value="all">{t("admin.mediaTypeAll", "All")}</option>
            <option value="image">{t("admin.mediaTypeImage", "Images")}</option>
            <option value="data">{t("admin.mediaTypeData", "Data files")}</option>
            <option value="other">{t("admin.mediaTypeOther", "Other")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>{t("admin.mediaSortBy", "Sort by")}</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className="border rounded px-2 py-1 text-xs bg-white"
          >
            <option value="updated-desc">
              {t("admin.mediaSortUpdatedDesc", "Newest first")}
            </option>
            <option value="updated-asc">
              {t("admin.mediaSortUpdatedAsc", "Oldest first")}
            </option>
            <option value="size-desc">
              {t("admin.mediaSortSizeDesc", "Largest size")}
            </option>
            <option value="size-asc">
              {t("admin.mediaSortSizeAsc", "Smallest size")}
            </option>
            <option value="name-asc">
              {t("admin.mediaSortNameAsc", "Name A–Z")}
            </option>
            <option value="name-desc">
              {t("admin.mediaSortNameDesc", "Name Z–A")}
            </option>
          </select>
        </label>
        {(sourceFilter !== "all" ||
          typeFilter !== "all" ||
          sortOrder !== "updated-desc" ||
          searchTerm) && (
          <button
            type="button"
            onClick={() => {
              setSourceFilter("all");
              setTypeFilter("all");
              setSortOrder("updated-desc");
              setSearchInput("");
              setSearchTerm("");
            }}
            className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
          >
            {t("admin.mediaClearFilters", "Clear filters")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>
          {t("admin.mediaResultsSummary", "{shown} shown / {total} total", {
            shown: rowStats.shownCount,
            total: rowStats.totalCount,
          })}
        </span>
        <span>
          {t("admin.mediaResultsSize", "Size: {size}", {
            size: formatBytes(rowStats.totalBytes),
          })}
        </span>
        <span>
          {t("admin.mediaResultsBreakdown", "Images: {images} · Data: {data} · Other: {other}", {
            images: rowStats.imageCount,
            data: rowStats.dataCount,
            other: rowStats.otherCount,
          })}
        </span>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchTerm(searchInput.trim());
        }}
      >
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t(
            "admin.mediaSearchPlaceholder",
            "Search by filename, key, or URL",
          )}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded border hover:bg-gray-50 text-sm"
        >
          {t("admin.mediaSearch", "Search")}
        </button>
      </form>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,.json,.yaml,.yml,.csv,.md,.markdown,.sqlite,.sqlite3,.db"
        multiple
        onChange={handleUploadInputChange}
        className="absolute -left-[10000px] top-auto h-px w-px opacity-0"
      />

      <div className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={openUploadPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openUploadPicker();
            }
          }}
          onPaste={handleDropZonePaste}
          onDragEnter={handleDropZoneDragEnter}
          onDragLeave={handleDropZoneDragLeave}
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
          className={`rounded border-2 border-dashed p-4 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 ${
            isDragActive
              ? "border-purple-500 bg-purple-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                {t("admin.mediaDropzoneTitle", "Upload media assets")}
              </p>
              <p className="text-xs text-gray-600">
                {isDragActive
                  ? t("admin.mediaDropzoneActive", "Drop files to upload now.")
                  : t(
                      "admin.mediaDropzoneHint",
                      "Drag and drop files here, or click to select files.",
                    )}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  "admin.mediaDropzoneSupportedHint",
                  "Supported: images, JSON, YAML, CSV, Markdown, and SQLite files.",
                )}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  "admin.mediaDropzonePasteHint",
                  "Paste also works for images: click this area and press Ctrl/Cmd+V.",
                )}
              </p>
              <p className="text-[11px] text-gray-500">
                {t(
                  "admin.mediaUploadLimits",
                  "Images under {imageMb} MB and other assets under {dataMb} MB. WordPress uploads may cap these further.",
                  {
                    imageMb: MAX_IMAGE_MB,
                    dataMb: MAX_DATA_MB,
                  },
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openUploadPicker();
              }}
              disabled={uploading}
              className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100 disabled:opacity-50"
            >
              {t("admin.mediaChooseFiles", "Choose files")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enabledUploadOptions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span>{t("admin.uploadDestinationTitle", "Upload destination")}</span>
              <select
                value={selectedUploadBackend}
                onChange={(event) => setSelectedUploadBackend(event.target.value)}
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                {enabledUploadOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {uploading && (
            <span className="text-xs text-gray-600">
              {t("admin.mediaUploadUploading", { n: uploadCount || 1 })}
            </span>
          )}
          {uploadStatus && !uploading && (
            <span className="text-xs text-emerald-700">{uploadStatus}</span>
          )}
        </div>
        {uploadHistory.length > 0 && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">
                {t("admin.mediaRecentUploads", "Recent uploads")}
              </p>
              <button
                type="button"
                onClick={() => setUploadHistory([])}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                {t("admin.mediaRecentUploadsClear", "Clear")}
              </button>
            </div>
            <div className="space-y-1">
              {uploadHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 break-all">
                      {entry.name}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      <span className="font-semibold">
                        {historyStatusLabel(entry.status)}
                      </span>
                      {entry.detail && ` · ${entry.detail}`}
                      {entry.backend && ` · ${sourceLabel(entry.backend)}`}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatHistoryTimestamp(entry.timestamp)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {entry.url && (
                      <button
                        type="button"
                        onClick={() => copyUrl(entry.url)}
                        className="px-2 py-0.5 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {t("admin.bucketCopyUrl", "Copy URL")}
                      </button>
                    )}
                    {entry.url && (
                      <button
                        type="button"
                        onClick={() => openHistoryUrl(entry.url)}
                        className="px-2 py-0.5 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {t("admin.mediaHistoryView", "Open")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {uploadError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {uploadError}
          </p>
        )}

        <div className="border-t pt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-700">
                {t(
                  "admin.mediaR2ManualTitle",
                  "R2 manual ingest (CyberDuck workflow)",
                )}
              </p>
              <p className="text-[11px] text-gray-500">
                {t(
                  "admin.mediaR2ManualHint",
                  "Upload with CyberDuck, then preview by object key and save a KV asset record.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={loadR2ManualRegistry}
              disabled={r2ManualLoading || r2ManualPending}
              className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100 disabled:opacity-50"
            >
              {r2ManualLoading
                ? t("common.loading", "Loading…")
                : t("admin.mediaRefresh", "Refresh")}
            </button>
          </div>

          {r2ManualInfo?.ok ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] space-y-2">
              <p className="font-semibold text-amber-800">
                {t("admin.clientChecklistTitle", "Client checklist")}
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <p className="text-amber-900">
                  {t("admin.clientProtocol", "Protocol")}: S3
                </p>
                <p className="text-amber-900 break-all">
                  {t("admin.clientHost", "Host")}: {r2ManualInfo.endpoint || "—"}
                </p>
                <p className="text-amber-900">
                  {t("admin.clientRegion", "Region")}: {r2ManualInfo.region || "auto"}
                </p>
                <p className="text-amber-900">
                  {t("admin.clientBucket", "Bucket")}: {r2ManualInfo.bucket || "—"}
                </p>
                <p className="text-amber-900 break-all sm:col-span-2">
                  {t("admin.clientPublicUrl", "Public URL")}: {r2ManualPublicUrl || "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {t(
                "admin.mediaR2ManualNotConfigured",
                "R2 is not configured. Configure endpoint, bucket, keys, and public URL first.",
              )}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-gray-700 sm:col-span-2">
              <span>
                {t("admin.mediaR2ManualKey", "R2 object key")}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  className="flex-1 min-w-0 border rounded px-2 py-1 text-xs"
                  value={r2ManualKey}
                  onChange={(event) => setR2ManualKey(event.target.value)}
                  placeholder="uploads/manual/your-asset.png"
                  disabled={r2ManualPending}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100"
                  onClick={() => setR2ManualKey(defaultR2ObjectKey())}
                  disabled={r2ManualPending}
                >
                  {t("admin.mediaR2ManualNewKey", "New key")}
                </button>
              </div>
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaTitle", "Title")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualTitle}
                onChange={(event) => setR2ManualTitle(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaAssetId", "Asset ID")}</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={r2ManualAssetId}
                  onChange={(event) => setR2ManualAssetId(event.target.value)}
                  disabled={r2ManualPending}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100"
                  onClick={() => setR2ManualAssetId(r2ManualSuggestedAssetId)}
                  disabled={!r2ManualSuggestedAssetId || r2ManualPending}
                >
                  {t("admin.mediaR2ManualSuggest", "Suggest")}
                </button>
              </div>
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaOwnerUri", "Owner URI")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualOwnerUri}
                onChange={(event) => setR2ManualOwnerUri(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaAssetSlug", "Asset slug (optional)")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualAssetSlug}
                onChange={(event) => setR2ManualAssetSlug(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaCopyrightHolder", "Copyright holder")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualRightsHolder}
                onChange={(event) => setR2ManualRightsHolder(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaLicense", "License")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualLicense}
                onChange={(event) => setR2ManualLicense(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700 sm:col-span-2">
              <span>{t("admin.mediaR2ManualUrl", "Resolved R2 URL")}</span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  readOnly
                  value={r2ManualObjectUrl}
                  className="flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => copyUrl(r2ManualObjectUrl)}
                  disabled={!r2ManualObjectUrl}
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100 disabled:opacity-50"
                >
                  {t("admin.bucketCopyUrl", "Copy URL")}
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runR2ManualAction({ persist: false })}
              disabled={!r2ManualKey.trim() || r2ManualPending}
              className="px-3 py-1 rounded border text-xs hover:bg-gray-100 disabled:opacity-50"
            >
              {r2ManualPending
                ? t("common.loading", "Loading…")
                : t("admin.mediaR2ManualPreview", "Preview object")}
            </button>
            <button
              type="button"
              onClick={() => runR2ManualAction({ persist: true })}
              disabled={!r2ManualKey.trim() || r2ManualPending}
              className="px-3 py-1 rounded border text-xs bg-purple-600 text-white border-purple-700 hover:bg-purple-700 disabled:opacity-50"
            >
              {r2ManualPending
                ? t("common.loading", "Loading…")
                : t("admin.mediaR2ManualSave", "Save asset to KV")}
            </button>
            <span className="text-[11px] text-gray-500">
              {t("admin.mediaR2ManualStorage", "Registry storage")}:{" "}
              <code>{r2ManualStorageLabel}</code>
            </span>
          </div>

          {r2ManualError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {r2ManualError}
            </p>
          )}
          {r2ManualStatus && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              {r2ManualStatus}
            </p>
          )}
          {r2ManualPreview && (
            <div className="rounded border border-purple-200 bg-purple-50 p-2 text-xs space-y-2">
              <p className="font-semibold text-purple-800">
                {t("admin.mediaR2ManualPreviewTitle", "Preview")}
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <p className="text-purple-900 break-all">
                  {t("admin.mediaR2ManualObject", "Object")}: {r2ManualPreview.key}
                </p>
                <p className="text-purple-900">
                  {t("admin.mediaTypeLabel", "Type")}: {r2ManualPreview.mimeType || "—"}
                </p>
                <p className="text-purple-900">
                  {t("admin.bucketSize", "Size")}: {formatBytes(r2ManualPreview.sizeBytes)}
                </p>
                <p className="text-purple-900">
                  {t("admin.resolution", "Resolution")}:{" "}
                  {formatResolution(r2ManualPreview.width, r2ManualPreview.height)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={r2ManualPreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-purple-700 hover:underline break-all"
                >
                  {r2ManualPreview.url}
                </a>
                <button
                  type="button"
                  onClick={() => copyUrl(r2ManualPreview.url)}
                  disabled={!r2ManualPreview.url}
                  className="px-2 py-0.5 rounded border text-[11px] text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {t("admin.bucketCopyUrl", "Copy URL")}
                </button>
              </div>
              {r2ManualPreview.isImage && r2ManualPreview.url && (
                <div className="rounded border border-purple-200 bg-white p-2 inline-block max-w-full">
                  <Image
                    src={r2ManualPreview.url}
                    alt={r2ManualPreview.title || r2ManualPreview.key || "R2 preview"}
                    width={Math.max(1, Number(r2ManualPreview.width) || 640)}
                    height={Math.max(1, Number(r2ManualPreview.height) || 360)}
                    unoptimized
                    className="max-h-44 h-auto w-auto rounded"
                  />
                </div>
              )}
            </div>
          )}

          {r2ManualRegistry.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs space-y-1">
              <p className="font-semibold text-gray-700">
                {t("admin.mediaR2ManualSavedList", "Recently saved KV records")}
              </p>
              {r2ManualRegistry.slice(0, 6).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-800 break-all">
                      {item.title || item.key}
                    </p>
                    <p className="text-[10px] text-gray-500 break-all">
                      {item.key}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {item.url && (
                      <button
                        type="button"
                        onClick={() => copyUrl(item.url)}
                        className="px-2 py-0.5 rounded border text-[10px] hover:bg-gray-100"
                      >
                        {t("admin.bucketCopyUrl", "Copy URL")}
                      </button>
                    )}
                    {item.url && (
                      <button
                        type="button"
                        onClick={() => openHistoryUrl(item.url)}
                        className="px-2 py-0.5 rounded border text-[10px] hover:bg-gray-100"
                      >
                        {t("admin.mediaHistoryView", "Open")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {sources && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`px-2 py-1 rounded ${sources.wordpress?.ok ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}
          >
            WordPress: {sources.wordpress?.count ?? 0}
          </span>
          <span
            className={`px-2 py-1 rounded ${sources.r2?.ok ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
          >
            R2: {sources.r2?.count ?? 0}
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-500">{t("common.loading", "Loading…")}</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-gray-500">
          {t(
            "admin.mediaLibraryEmpty",
            "No media files matched this filter.",
          )}
        </p>
      )}

      {rows.length > 0 && (
        <div
          className="overflow-auto border rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
          tabIndex={0}
          onFocus={() => {
            if (!focusedItemId && rows.length > 0) {
              setFocusedItemId(rows[0].id);
            }
          }}
          onKeyDown={handleMediaTableKeyDown}
          aria-label={t(
            "admin.mediaTableAriaLabel",
            "Asset table. Use arrow keys to move, Enter to open, A to annotate, C to copy URL.",
          )}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">{t("admin.preview", "Preview")}</th>
                <th className="text-left px-3 py-2">{t("common.name", "Name")}</th>
                <th className="text-left px-3 py-2">{t("admin.source", "Source")}</th>
                <th className="text-left px-3 py-2">{t("admin.fileType", "File type")}</th>
                <th className="text-left px-3 py-2">{t("admin.bucketSize", "Size")}</th>
                <th className="text-left px-3 py-2">{t("admin.resolution", "Resolution")}</th>
                <th className="text-left px-3 py-2">{t("admin.bucketLastModified", "Updated")}</th>
                <th className="text-left px-3 py-2">
                  {t("admin.mediaMetadata", "Metadata")}
                </th>
                <th className="text-left px-3 py-2">{t("admin.fileUrl", "URL")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
              <tr
                key={item.id}
                ref={(node) => registerMediaRowRef(item.id, node)}
                onClick={() => setFocusedItemId(item.id)}
                className={`border-t align-top ${
                  focusedItemId === item.id ? "bg-purple-50" : ""
                }`}
              >
                  <td className="px-3 py-2">
                    {canPreviewImage(item) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt=""
                        className="h-12 w-12 rounded border object-cover bg-gray-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                        {item.fileType || "FILE"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800 break-all flex flex-wrap items-baseline gap-1.5">
                      <span>{item.title || "—"}</span>
                      {isNewAsset(item.updatedAt, lastOpenedAt) && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 leading-none">
                          {t("admin.mediaNewBadge", "New")}
                        </span>
                      )}
                    </p>
                    {item.key && (
                      <p className="text-xs text-gray-500 break-all">{item.key}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${sourceBadgeClass(item.source)}`}
                    >
                      {sourceLabel(item.source)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{item.fileType || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatBytes(item.sizeBytes)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatResolution(item.width, item.height)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatUpdatedAt(item.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1 text-xs">
                      {(item.metadata?.altText || item.metadata?.caption) && (
                        <p className="text-gray-700 line-clamp-2">
                          {item.metadata?.altText || item.metadata?.caption}
                        </p>
                      )}
                      {(item.rights?.copyrightHolder || item.rights?.license) && (
                        <p className="text-gray-500 line-clamp-2">
                          {[item.rights?.copyrightHolder, item.rights?.license]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {canOpenDataViewer(item) && (
                        <button
                          type="button"
                          onClick={() => openViewer(item)}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          {t("admin.mediaViewFile", "View")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditor(item)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {t("admin.mediaAnnotate", "Annotate")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusedItemId(item.id)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        aria-pressed={focusedItemId === item.id}
                      >
                        {focusedItemId === item.id
                          ? t("admin.mediaSelected", "Selected")
                          : t("admin.mediaSelect", "Select")}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-purple-700 hover:underline break-all"
                      >
                        {item.url}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyUrl(item.url)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {copiedUrl === item.url
                          ? t("admin.clientCopied", "Copied")
                          : t("admin.bucketCopyUrl", "Copy URL")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {focusedItem && (
        <div className="rounded border border-purple-200 bg-purple-50 p-4 text-xs space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-purple-800">
                {t("admin.mediaSelectedAsset", "Selected asset")}
              </p>
              <p className="text-[11px] text-purple-700 break-all">
                {focusedItem.title || focusedItem.key || focusedItem.url}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocusedItemId("")}
              className="px-3 py-1 rounded border text-[11px] hover:bg-purple-100 text-purple-700"
            >
              {t("common.clear", "Clear")}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <p className="text-purple-700">
              {t("admin.mediaTypeLabel", "Type")}: {resolveAssetType(focusedItem)}
            </p>
            <p className="text-purple-700">
              {t("admin.source", "Source")}: {sourceLabel(focusedItem.source)}
            </p>
            <p className="text-purple-700">
              {t("admin.bucketSize", "Size")}: {formatBytes(focusedItem.sizeBytes)}
            </p>
            <p className="text-purple-700">
              {t("admin.resolution", "Resolution")}:{" "}
              {formatResolution(focusedItem.width, focusedItem.height)}
            </p>
            <p className="text-purple-700">
              {t("admin.bucketLastModified", "Updated")}: {formatUpdatedAt(focusedItem.updatedAt)}
            </p>
            {focusedItem.source === "wordpress" && focusedItem.sourceId && (
              <p className="text-purple-700">
                {t("admin.mediaWordPressId", "WordPress ID")}: {focusedItem.sourceId}
              </p>
            )}
          </div>
          {focusedAssetLineage.hasLineage && (
            <div className="rounded border border-purple-200 bg-white/70 p-2 space-y-2">
              <div>
                <p className="text-[11px] font-semibold text-purple-800">
                  {t("admin.mediaAssetLineageTitle", "Asset lineage")}
                </p>
                <p className="text-[11px] text-purple-700">
                  {t(
                    "admin.mediaAssetLineageHint",
                    "Jump between original and variant attachments that share the same asset ID.",
                  )}
                </p>
              </div>
              {(focusedAssetLineage.original?.item ||
                focusedAssetLineage.original?.url) && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-purple-800">
                    {t("admin.mediaAssetOriginal", "Original")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {focusedAssetLineage.original.item ? (
                      <button
                        type="button"
                        onClick={() =>
                          focusItemById(focusedAssetLineage.original.item.id)
                        }
                        className="px-2 py-1 rounded border text-[11px] bg-white text-purple-700 hover:bg-purple-100"
                      >
                        {focusedAssetLineage.original.item.title ||
                          `${t("admin.mediaWordPressId", "WordPress ID")} #${focusedAssetLineage.original.item.sourceId}`}
                      </button>
                    ) : (
                      <a
                        href={focusedAssetLineage.original.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-purple-700 hover:underline break-all"
                      >
                        {focusedAssetLineage.original.url}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {focusedAssetLineage.variants.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-purple-800">
                    {t("admin.mediaAssetVariants", "Variants")} (
                    {focusedAssetLineage.variants.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {focusedAssetLineage.variants.map((variant) => {
                      const isCurrent =
                        variant.sourceId != null &&
                        Number(variant.sourceId) === Number(focusedItem.sourceId);
                      const labelParts = [
                        variant.variantKind || t("admin.mediaVariant", "Variant"),
                        variant.format || "",
                        variant.sourceId != null
                          ? `#${variant.sourceId}`
                          : "",
                        isCurrent ? t("admin.mediaCurrent", "current") : "",
                      ].filter(Boolean);
                      const label = labelParts.join(" · ");
                      if (variant.linkedItem) {
                        return (
                          <button
                            key={variant.key}
                            type="button"
                            onClick={() => focusItemById(variant.linkedItem.id)}
                            className={`px-2 py-1 rounded border text-[11px] ${
                              isCurrent
                                ? "bg-purple-200 text-purple-900 border-purple-400"
                                : "bg-white text-purple-700 hover:bg-purple-100"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      }
                      if (variant.url) {
                        return (
                          <a
                            key={variant.key}
                            href={variant.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`px-2 py-1 rounded border text-[11px] ${
                              isCurrent
                                ? "bg-purple-200 text-purple-900 border-purple-400"
                                : "bg-white text-purple-700 hover:bg-purple-100"
                            }`}
                          >
                            {label}
                          </a>
                        );
                      }
                      return (
                        <span
                          key={variant.key}
                          className={`px-2 py-1 rounded border text-[11px] ${
                            isCurrent
                              ? "bg-purple-200 text-purple-900 border-purple-400"
                              : "bg-white text-purple-700"
                          }`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyUrl(focusedItem.url)}
              className="px-3 py-1.5 rounded border text-[11px] hover:bg-purple-100 text-purple-700"
            >
              {t("admin.bucketCopyUrl", "Copy URL")}
            </button>
            {(canOpenDataViewer(focusedItem) || canPreviewImage(focusedItem)) && (
              <button
                type="button"
                onClick={() => openViewer(focusedItem)}
                className="px-3 py-1.5 rounded border text-[11px] hover:bg-purple-100 text-purple-700"
              >
                {t("admin.mediaViewFile", "View")}
              </button>
            )}
            <button
              type="button"
              onClick={() => openEditor(focusedItem)}
              className="px-3 py-1.5 rounded border text-[11px] hover:bg-purple-100 text-purple-700"
            >
              {t("admin.mediaAnnotate", "Annotate")}
            </button>
          </div>
        </div>
      )}

      {derivations.length > 0 && (
        <div className="rounded border border-indigo-200 bg-indigo-50 p-4 text-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-800">
                {t("admin.mediaDerivationsTitle", "Derivation templates")}
              </p>
              <p className="text-[11px] text-indigo-700">
                {t(
                  "admin.mediaDerivationsHint",
                  "Choose an operation chain and tweak parameters before applying the derivation to the selected asset.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllDerivations((current) => !current)}
                className="px-3 py-1 rounded border text-[11px] bg-white"
              >
                {showAllDerivations
                  ? t("admin.mediaDerivationShowMatching", "Show matching derivations")
                  : t("admin.mediaDerivationShowAll", "Show all derivations")}
              </button>
              <select
                className="border rounded px-2 py-1 text-xs bg-white"
                value={selectedDerivationId}
                onChange={(event) => setSelectedDerivationId(event.target.value)}
              >
                {availableDerivations.map((derivation) => (
                  <option key={derivation.id} value={derivation.id}>
                    {derivation.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-indigo-700">
            {showAllDerivations
              ? t("admin.mediaDerivationShowAllHint", "Showing all derivations.")
              : focusedAssetType
                ? t(
                    "admin.mediaDerivationMatchingHint",
                    "Showing derivations for {type} assets.",
                    { type: focusedAssetTypeLabel },
                  )
                : t(
                    "admin.mediaDerivationSelectAssetHint",
                    "Select an asset to narrow derivation suggestions.",
                  )}
          </p>
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="space-y-1 text-[11px] text-gray-700">
                <span>{t("admin.mediaDerivationId", "Derivation ID")}</span>
                <input
                  type="text"
                  value={editorId}
                  onChange={(event) => setEditorId(event.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="space-y-1 text-[11px] text-gray-700">
                <span>{t("admin.mediaDerivationName", "Name")}</span>
                <input
                  type="text"
                  value={editorName}
                  onChange={(event) => setEditorName(event.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="space-y-1 text-[11px] text-gray-700 lg:col-span-3">
                <span>{t("admin.mediaDerivationDescription", "Description")}</span>
                <input
                  type="text"
                  value={editorDescription}
                  onChange={(event) => setEditorDescription(event.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-700">
              <span>{t("admin.mediaDerivationAssetTypes", "Applicable asset types")}</span>
              {[
                { key: "image", label: t("admin.mediaTypeImage", "Images") },
                { key: "data", label: t("admin.mediaTypeData", "Data files") },
                { key: "other", label: t("admin.mediaTypeOther", "Other") },
              ].map((option) => (
                <label key={option.key} className="flex items-center gap-1 text-gray-600">
                  <input
                    type="checkbox"
                    checked={editorAssetTypes.includes(option.key)}
                    onChange={() => handleToggleAssetType(option.key)}
                    className="h-4 w-4"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          {customOperations.length > 0 && (
            <div className="space-y-3 rounded border border-indigo-100 bg-indigo-50 p-3 text-[11px] text-indigo-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold text-indigo-800">
                    {t("admin.mediaDerivationSummaryTitle", "Derivation preview")}
                  </p>
                  <p className="text-sm font-semibold text-indigo-900 truncate">
                    {editorName?.trim() || derivationPseudoName}
                  </p>
                  <p className="text-[11px] text-indigo-600">
                    {t(
                      "admin.mediaDerivationPseudoName",
                      "Pseudo name: {name}",
                      { name: derivationPseudoName },
                    )}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    derivationIsConcrete
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {derivationIsConcrete
                    ? t("admin.mediaDerivationStatusConcrete", "Concrete derivation")
                    : t("admin.mediaDerivationStatusAbstract", "Abstract derivation")}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-indigo-800">
                  {t("admin.mediaDerivationUnboundLabel", "Unbound parameters")}
                </p>
                {derivationUnboundParameters.length === 0 ? (
                  <p className="text-[11px] text-indigo-600">
                    {t("admin.mediaDerivationAllBound", "All operation parameters are bound.")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {derivationUnboundParameters.map((entry, entryIndex) => (
                      <span
                        key={`${entry.operator}-${entry.param}-${entryIndex}`}
                        className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] text-indigo-700"
                      >
                        {entry.operator}: {entry.param}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-indigo-800">
                  {t(
                    "admin.mediaDerivationInvalidNumericLabel",
                    "Invalid numeric parameters",
                  )}
                </p>
                {derivationInvalidParameters.length === 0 ? (
                  <p className="text-[11px] text-indigo-600">
                    {t(
                      "admin.mediaDerivationAllNumericValid",
                      "All numeric parameters are valid.",
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {derivationInvalidParameters.map((entry, entryIndex) => (
                      <span
                        key={`${entry.operator}-${entry.param}-invalid-${entryIndex}`}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                      >
                        {entry.operator}: {entry.param}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded border border-indigo-100 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-indigo-700">
                    {t("admin.mediaDerivationMatrixTitle", "Operation matrix")}
                  </p>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-[11px] text-gray-600">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-gray-500">
                          {t("admin.mediaDerivationMatrixStepHeader", "Step")}
                        </th>
                        <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-gray-500">
                          {t("admin.mediaDerivationMatrixOperatorHeader", "Operator")}
                        </th>
                        <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-gray-500">
                          {t("admin.mediaDerivationMatrixParametersHeader", "Parameters")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {derivationMatrixRows.map((row) => (
                        <tr key={`${row.operation.type}-${row.index}`}>
                          <td className="px-2 py-1 text-[11px] font-semibold text-indigo-800">
                            {row.index + 1}
                          </td>
                          <td className="px-2 py-1">
                            <p className="font-semibold text-indigo-800">
                              {row.schema?.label || row.operation.type}
                            </p>
                            {row.operation.type === "source" && (
                              <p className="text-[10px] text-gray-500">
                                {row.operation.params?.assetId
                                  ? row.operation.params.assetId
                                  : t("admin.mediaDerivationSourceUnbound", "Source is unbound")}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {row.params.length === 0 ? (
                              <span className="text-[10px] text-gray-500">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.params.map((param) => (
                                  <span
                                    key={`${row.index}-${param.key}`}
                                    className={`rounded-full px-2 py-0.5 border text-[10px] ${
                                      param.bound
                                        ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                                        : "border-amber-200 bg-amber-50 text-amber-800"
                                    }`}
                                  >
                                    {param.bound
                                      ? `${param.key}=${formatParameterValue(param.value)}`
                                      : param.key}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {customOperations.length === 0 && (
            <p className="text-[11px] text-indigo-700">
              {t("admin.mediaDerivationNoOperations", "Select a derivation to edit its operations.")}
            </p>
          )}
          {customOperations.map((operation, index) => {
            const schema = OPERATION_SCHEMAS[operation.type];
            return (
              <div
                key={`${operation.type}-${index}`}
                className="rounded border border-indigo-100 bg-white p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-indigo-800">
                    {schema?.label || operation.type}
                  </p>
                  <span className="text-[11px] text-indigo-600">
                    {t("admin.mediaDerivationStep", "Step {n}", { n: index + 1 })}
                  </span>
                </div>
                {operation.type === "source" && (
                  <p className="text-[11px] text-indigo-600">
                    {t(
                      "admin.mediaDerivationSourceHint",
                      "The source step tracks the asset you select in the table above.",
                    )}
                  </p>
                )}
                {schema?.parameters?.map((param) => (
                  <label key={param.key} className="flex flex-col text-[11px] text-gray-700">
                    <span>{param.label}</span>
                    {(() => {
                      const currentValue = operation.params?.[param.key];
                      const isInvalid = isInvalidNumericParam(param, currentValue);
                      return (
                        <input
                          type={param.type}
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={currentValue ?? ""}
                          onChange={(event) =>
                            handleOperationParamChange(index, param.key, event.target.value)
                          }
                          aria-invalid={isInvalid || undefined}
                          className={`border rounded px-2 py-1 text-xs ${
                            isInvalid
                              ? "border-red-400 bg-red-50 text-red-900"
                              : ""
                          }`}
                        />
                      );
                    })()}
                  </label>
                ))}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveOperation(index)}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    {t("admin.mediaDerivationRemoveStep", "Remove step")}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-gray-700">
              <span>{t("admin.mediaDerivationAddOperationLabel", "Add operation")}</span>
              <select
                className="border rounded px-2 py-1 text-xs bg-white"
                value={newOperationType}
                onChange={(event) => setNewOperationType(event.target.value)}
              >
                {Object.entries(OPERATION_SCHEMAS).map(([type, schema]) => (
                  <option key={type} value={type}>
                    {schema?.label || type}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAddOperation}
              className="px-3 py-1 rounded border text-[11px] bg-white"
            >
              {t("admin.mediaDerivationAddOperation", "Add operation")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveDerivationTemplate}
              disabled={derivationSaveStatus === "saving"}
              className="px-3 py-1.5 rounded bg-indigo-700 text-white text-xs hover:bg-indigo-600 disabled:opacity-50"
            >
              {t("admin.mediaDerivationSave", "Save derivation")}
            </button>
            <button
              type="button"
              onClick={applySelectedDerivation}
              disabled={
                applyingDerivation ||
                !focusedItem ||
                derivationUnboundParameters.length > 0 ||
                derivationInvalidParameters.length > 0
              }
              className="px-3 py-1.5 rounded bg-indigo-700 text-white text-xs hover:bg-indigo-600 disabled:opacity-50"
            >
              {applyingDerivation
                ? t("admin.mediaDerivationApplying", "Applying…")
                : t("admin.mediaApplyDerivation", "Apply derivation")}

            </button>
            <button
              type="button"
              onClick={savePreviewToLibrary}
              disabled={!previewBlob || savingPreview}
              className="px-3 py-1.5 rounded border text-[11px] bg-white disabled:opacity-50"
            >
              {savingPreview
                ? t("admin.mediaSavingDerivedAsset", "Saving…")
                : t("admin.mediaSaveDerivedAsset", "Save to library")}
            </button>
            {!focusedItem && (
              <span className="text-[11px] text-indigo-600">
                {t("admin.mediaDerivationRequiresAsset", "Select an asset first.")}
              </span>
            )}
            {focusedItem && derivationUnboundParameters.length > 0 && (
              <span className="text-[11px] text-amber-700">
                {t(
                  "admin.mediaDerivationFillParameters",
                  "Fill all operation parameters before applying the derivation.",
                )}
              </span>
            )}
            {focusedItem && derivationInvalidParameters.length > 0 && (
              <span className="text-[11px] text-red-700">
                {t(
                  "admin.mediaDerivationFixInvalidNumeric",
                  "Fix invalid numeric parameters before applying the derivation.",
                )}
              </span>
            )}
          </div>
          {applyingDerivation && (
            <div className="space-y-1 py-1">
              <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-out"
                  style={{ width: `${applyProgress}%` }}
                />
              </div>
              {applyProgressLabel && (
                <p className="text-[10px] text-indigo-400">{applyProgressLabel}</p>
              )}
            </div>
          )}
          {derivationSaveStatus === "saved" && (
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              {t("admin.mediaDerivationSaveSuccess", "Derivation saved.")}
            </p>
          )}
          {(derivationSaveError || derivationError) && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {derivationSaveError || derivationError}
            </p>
          )}
          {previewBlobUrl && (
            <div className="rounded border border-indigo-100 bg-white p-3 space-y-2">
              <p className="text-[11px] font-semibold text-indigo-800">
                {t("admin.mediaDerivationPreview", "Derivation preview")}
              </p>
              <img
                src={previewBlobUrl}
                alt={t("admin.mediaDerivationPreviewAlt", "Derived image preview")}
                className="max-w-full rounded border"
                style={{ maxHeight: 300 }}
              />
              {savePreviewError && (
                <p className="text-[11px] text-red-700">{savePreviewError}</p>
              )}
            </div>
          )}
        </div>
      )}

      <MediaViewerPanel
        viewerItem={viewerItem}
        viewerLoading={viewerLoading}
        viewerError={viewerError}
        viewerData={viewerData}
        onClose={closeViewer}
      />
      {selectedItem && editor && (
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
              <span>{t("admin.mediaStructuredMeta", "Structured metadata (JSON/YAML)")}</span>
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
                placeholder={t("admin.mediaAssetSlugPlaceholder", "optional-human-readable-label")}
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
                placeholder={t("admin.mediaAssetUriPlaceholder", "/asset/<asset-id>")}
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageCopyrightHolderLabel", "Copyright holder")}</span>
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

      <R2ConnectionPanel
        uploadBackend={uploadBackend}
        uploadInfo={uploadInfo}
        uploadInfoDetails={uploadInfoDetails}
      />
    </div>
  );
}
