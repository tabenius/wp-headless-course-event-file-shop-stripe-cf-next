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
  OPERATION_REGISTRY,
  buildDefaultParams,
  getOperationsByCategory,
} from "@/components/admin/DerivationEditor/operationRegistry";
import {
  MAX_IMAGE_BYTES,
  MAX_DATA_ASSET_BYTES,
  MAX_IMAGE_MB,
  MAX_DATA_MB,
  HISTORY_MAX_ENTRIES,
  LS_LAST_OPENED_KEY,
  formatBytes,
  formatResolution,
  formatUpdatedAt,
  sourceLabel,
  sourceBadgeClass,
  buildPseudoDerivationName,
  getUnboundParameters,
  formatParameterValue,
  isInvalidNumericParam,
  getInvalidOperationParameters,
  canPreviewImage,
  isImageFile,
  detectAssetKind,
  canOpenDataViewer,
  resolveAssetType,
  parseTimestamp,
  parseSize,
  buildUploadHistoryEntry,
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
import AdminDocsContextLinks from "@/components/admin/AdminDocsContextLinks";
import DerivationWorkspacePanel from "@/components/admin/media-library/DerivationWorkspacePanel";
import FilePreviewTile from "@/components/admin/media-library/FilePreviewTile";
import MediaAnnotationEditorPanel from "@/components/admin/media-library/MediaAnnotationEditorPanel";

const RGB_CHANNELS = ["r", "g", "b"];
const QUICK_OPERATION_TYPES = [
  "presetCrop",
  "tiltShift",
  "textOverlay",
  "saturation",
  "sepia",
  "cropCircle",
];

function clampRgbChannel(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(255, Math.round(parsed)));
}

function normalizeRgbObject(value, fallback = { r: 0, g: 0, b: 0 }) {
  const fallbackColor = {
    r: clampRgbChannel(fallback?.r, 0),
    g: clampRgbChannel(fallback?.g, 0),
    b: clampRgbChannel(fallback?.b, 0),
  };
  if (!value || typeof value !== "object") return fallbackColor;
  return {
    r: clampRgbChannel(value.r, fallbackColor.r),
    g: clampRgbChannel(value.g, fallbackColor.g),
    b: clampRgbChannel(value.b, fallbackColor.b),
  };
}

function rgbToHex(value) {
  const color = normalizeRgbObject(value);
  const toHex = (channel) => channel.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function hexToRgb(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const match = normalized.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function CopyIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function resolveAssetLineageRole(item) {
  const asset = item?.asset;
  if (!asset || typeof asset !== "object") return "untracked";
  const variantKind = normalizeEditorValue(
    String(asset.variantKind || asset.role || ""),
    80,
  ).toLowerCase();
  if (variantKind === "derived-work") {
    return "derived";
  }
  return "original";
}

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
  const [lineageFilter, setLineageFilter] = useState("all");
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
  const [creatingProductFromAsset, setCreatingProductFromAsset] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadHistory, setUploadHistory] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedUploadBackend, setSelectedUploadBackend] = useState("wordpress");
  const [focusedItemId, setFocusedItemId] = useState("");
  const [showFocusedLineageOnly, setShowFocusedLineageOnly] = useState(false);
  const [pendingFocusItemId, setPendingFocusItemId] = useState("");
  const [flashFocusedItemId, setFlashFocusedItemId] = useState("");
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
  const [previewQuality, setPreviewQuality] = useState("full");
  const [lastPreviewQuality, setLastPreviewQuality] = useState("full");
  const [activeAssetFlow, setActiveAssetFlow] = useState("details");
  const [editorId, setEditorId] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorAssetTypes, setEditorAssetTypes] = useState([]);
  const [operationSearchTerm, setOperationSearchTerm] = useState("");
  const [newOperationType, setNewOperationType] = useState(Object.keys(OPERATION_REGISTRY)[0] || "");
  const [collapsedOperationIndexes, setCollapsedOperationIndexes] = useState([]);
  const [focusedOperationIndex, setFocusedOperationIndex] = useState(-1);
  const [derivationSaveStatus, setDerivationSaveStatus] = useState("");
  const [derivationSaveError, setDerivationSaveError] = useState("");
  const [lastDerivedAsset, setLastDerivedAsset] = useState(null);
  const [savedDerivedAssets, setSavedDerivedAssets] = useState([]);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const [savePreviewError, setSavePreviewError] = useState("");
  const [lastOpenedAt] = useState(() => stampOpenAndGetPrevious());
  const previewBlobUrlRef = useRef(null);
  const uploadInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const mediaRowsRef = useRef(new Map());
  const derivationPanelRef = useRef(null);
  const operationSearchInputRef = useRef(null);

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

  const sourceFilterOptions = useMemo(
    () => [
      { id: "all", label: t("admin.mediaAllSources", "All sources") },
      { id: "wordpress", label: "WordPress" },
      { id: "r2", label: "R2" },
      ...(uploadInfo?.s3Enabled ? [{ id: "s3", label: "S3" }] : []),
    ],
    [uploadInfo?.s3Enabled],
  );

  const operationPickerGroups = useMemo(() => getOperationsByCategory(), []);
  const addableOperationTypes = useMemo(
    () => operationPickerGroups.flatMap((group) => group.operations.map((entry) => entry.type)),
    [operationPickerGroups],
  );
  const filteredOperationPickerGroups = useMemo(() => {
    const q = operationSearchTerm.trim().toLowerCase();
    if (!q) return operationPickerGroups;
    return operationPickerGroups
      .map((group) => ({
        ...group,
        operations: group.operations.filter((operation) => {
          const haystack = [
            operation.type,
            operation.label,
            operation.tip,
            operation.techTip,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group) => group.operations.length > 0);
  }, [operationPickerGroups, operationSearchTerm]);
  const visibleAddableOperationTypes = useMemo(
    () =>
      filteredOperationPickerGroups.flatMap((group) =>
        group.operations.map((entry) => entry.type),
      ),
    [filteredOperationPickerGroups],
  );
  const selectedVisibleOperationType = useMemo(
    () =>
      visibleAddableOperationTypes.includes(newOperationType)
        ? newOperationType
        : "",
    [newOperationType, visibleAddableOperationTypes],
  );
  const quickOperationButtons = useMemo(
    () =>
      QUICK_OPERATION_TYPES.map((type) => ({
        type,
        schema: OPERATION_REGISTRY[type],
      })).filter((entry) => entry.schema),
    [],
  );

  useEffect(() => {
    const backendExists = enabledUploadOptions.some(
      (option) => option.id === selectedUploadBackend,
    );
    if (!backendExists) {
      setSelectedUploadBackend(preferredUploadBackend);
    }
  }, [enabledUploadOptions, preferredUploadBackend, selectedUploadBackend]);

  useEffect(() => {
    const sourceExists = sourceFilterOptions.some((option) => option.id === sourceFilter);
    if (!sourceExists) {
      setSourceFilter("all");
    }
  }, [sourceFilter, sourceFilterOptions]);

  useEffect(() => {
    if (addableOperationTypes.length === 0) {
      setNewOperationType("");
      return;
    }
    if (!newOperationType || !addableOperationTypes.includes(newOperationType)) {
      setNewOperationType(addableOperationTypes[0]);
    }
  }, [addableOperationTypes, newOperationType]);

  useEffect(() => {
    if (!operationSearchTerm.trim()) return;
    if (visibleAddableOperationTypes.length === 0) return;
    if (!visibleAddableOperationTypes.includes(newOperationType)) {
      setNewOperationType(visibleAddableOperationTypes[0]);
    }
  }, [visibleAddableOperationTypes, newOperationType, operationSearchTerm]);

  useEffect(() => {
    setCollapsedOperationIndexes((current) =>
      current.filter((index) => Number.isInteger(index) && index >= 0 && index < customOperations.length),
    );
  }, [customOperations.length]);

  useEffect(() => {
    if (customOperations.length === 0) {
      setFocusedOperationIndex(-1);
      return;
    }
    if (focusedOperationIndex >= customOperations.length) {
      setFocusedOperationIndex(customOperations.length - 1);
    }
  }, [customOperations.length, focusedOperationIndex]);

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

  const focusedItemFromItems = useMemo(
    () => items.find((item) => item.id === focusedItemId) || null,
    [items, focusedItemId],
  );

  const wordpressRowsBySourceId = useMemo(() => {
    const mapping = new Map();
    items.forEach((item) => {
      if (item?.source !== "wordpress") return;
      const sourceId = Number.parseInt(String(item?.sourceId ?? ""), 10);
      if (!Number.isFinite(sourceId)) return;
      mapping.set(String(sourceId), item);
    });
    return mapping;
  }, [items]);

  const focusedLineageItemIds = useMemo(() => {
    const ids = new Set();
    if (!focusedItemFromItems?.id) return ids;
    ids.add(focusedItemFromItems.id);
    const asset = focusedItemFromItems?.asset;
    if (!asset || typeof asset !== "object") return ids;

    const originalId = Number.parseInt(String(asset.originalId ?? ""), 10);
    if (Number.isFinite(originalId)) {
      const originalItem = wordpressRowsBySourceId.get(String(originalId));
      if (originalItem?.id) ids.add(originalItem.id);
    }

    const variants = Array.isArray(asset.variants) ? asset.variants : [];
    for (const variant of variants) {
      const variantId = Number.parseInt(String(variant?.sourceId ?? ""), 10);
      if (!Number.isFinite(variantId)) continue;
      const linkedVariant = wordpressRowsBySourceId.get(String(variantId));
      if (linkedVariant?.id) ids.add(linkedVariant.id);
    }
    return ids;
  }, [focusedItemFromItems, wordpressRowsBySourceId]);

  const rows = useMemo(() => {
    let nextRows = Array.isArray(items) ? [...items] : [];
    if (typeFilter === "image") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "image");
    } else if (typeFilter === "data") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "data");
    } else if (typeFilter === "other") {
      nextRows = nextRows.filter((item) => resolveAssetType(item) === "other");
    }

    if (lineageFilter === "original") {
      nextRows = nextRows.filter((item) => {
        const role = resolveAssetLineageRole(item);
        return role === "original" || role === "untracked";
      });
    } else if (lineageFilter === "derived") {
      nextRows = nextRows.filter((item) => resolveAssetLineageRole(item) === "derived");
    }

    if (showFocusedLineageOnly) {
      if (focusedLineageItemIds.size === 0) {
        nextRows = [];
      } else {
        nextRows = nextRows.filter((item) => focusedLineageItemIds.has(item.id));
      }
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
  }, [
    focusedLineageItemIds,
    items,
    lineageFilter,
    showFocusedLineageOnly,
    sortOrder,
    typeFilter,
  ]);

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

  useEffect(() => {
    if (!showFocusedLineageOnly) return;
    if (focusedLineageItemIds.size === 0) {
      setShowFocusedLineageOnly(false);
    }
  }, [focusedLineageItemIds, showFocusedLineageOnly]);

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

  useEffect(() => {
    if (!pendingFocusItemId) return undefined;
    const rowExists = rows.some((item) => item.id === pendingFocusItemId);
    if (!rowExists) return undefined;

    setFocusedItemId(pendingFocusItemId);
    setFlashFocusedItemId(pendingFocusItemId);
    requestAnimationFrame(() => {
      mediaRowsRef.current.get(pendingFocusItemId)?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
    });
    setPendingFocusItemId("");
    const highlightedId = pendingFocusItemId;
    const timeoutId = window.setTimeout(() => {
      setFlashFocusedItemId((current) =>
        current === highlightedId ? "" : current,
      );
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [pendingFocusItemId, rows]);

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

  const focusedAssetSupportsDerivations = focusedAssetType === "image";

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

  const availableDerivations = useMemo(() => {
    if (!focusedAssetSupportsDerivations || !focusedAssetType) return [];
    return derivations.filter((entry) => {
      const assetTypes = Array.isArray(entry.assetTypes) ? entry.assetTypes : [];
      return assetTypes.length === 0 || assetTypes.includes(focusedAssetType);
    });
  }, [derivations, focusedAssetSupportsDerivations, focusedAssetType]);

  const hasDerivationsForItem = useCallback(
    (item) => {
      if (!item || resolveAssetType(item) !== "image") return false;
      return derivations.some((entry) => {
        const assetTypes = Array.isArray(entry.assetTypes) ? entry.assetTypes : [];
        return assetTypes.length === 0 || assetTypes.includes("image");
      });
    },
    [derivations],
  );

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

  useEffect(() => {
    if (!focusedAssetSupportsDerivations && activeAssetFlow !== "details") {
      setActiveAssetFlow("details");
    }
  }, [activeAssetFlow, focusedAssetSupportsDerivations]);

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

  const resolveUploadedItemId = useCallback((uploadJson, fallbackBackend) => {
    const backend = String(
      uploadJson?.backend || fallbackBackend || "",
    ).toLowerCase();
    if (backend === "wordpress") {
      const sourceId = Number.parseInt(
        String(uploadJson?.id ?? uploadJson?.sourceId ?? ""),
        10,
      );
      if (Number.isFinite(sourceId) && sourceId > 0) {
        return `wordpress:${sourceId}`;
      }
      return "";
    }
    if (backend === "r2") {
      const key = String(uploadJson?.key || "").trim();
      if (key) return `r2:${key}`;
      return "";
    }
    return "";
  }, []);

  const formatHistoryTimestamp = (value) => {
    if (!value) return "";
    const time = Number(value);
    if (!Number.isFinite(time)) return "";
    return new Date(time).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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

  async function createProductFromAsset(item) {
    if (!item || creatingProductFromAsset) return;
    setCreatingProductFromAsset(true);
    try {
      const payload = {
        source: item.source || "",
        sourceId: item.sourceId ?? null,
        key: item.key || "",
        title: item.title || "",
        url: item.url || "",
        mimeType: item.mimeType || "",
        imageUrl: canPreviewImage(item) ? item.url || "" : "",
        asset: item.asset || null,
        assetId: item.asset?.assetId || "",
      };
      const response = await fetch("/api/admin/products/from-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t(
              "admin.mediaCreateProductFailed",
              "Could not create a product from this asset.",
            ),
        );
      }
      const baseMessage =
        json?.created === false
          ? t(
              "admin.mediaProductAlreadyExists",
              "A product for this asset already exists.",
            )
          : t(
              "admin.mediaProductCreated",
              "Product created from the selected asset.",
            );
      const productName = String(json?.product?.name || "").trim();
      const toastMessage = productName
        ? `${baseMessage} ${productName}`
        : baseMessage;
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            type: json?.created === false ? "info" : "success",
            message: toastMessage,
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("admin:switchTab", { detail: "products" }),
      );
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : t(
              "admin.mediaCreateProductFailed",
              "Could not create a product from this asset.",
            );
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    } finally {
      setCreatingProductFromAsset(false);
    }
  }

  function openEditor(item) {
    setSelectedId(item.id);
    setEditor(toEditorState(item));
    setSaveError("");
    setSaveSuccess("");
  }

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

    const oversized = list.filter((file) => {
      const kind = detectAssetKind(file);
      const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_DATA_ASSET_BYTES;
      return file.size > maxBytes;
    });
    const valid = list.filter((file) => {
      const kind = detectAssetKind(file);
      const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_DATA_ASSET_BYTES;
      return file.size <= maxBytes;
    });

    const oversizedMessage = t("admin.mediaUploadTooLargeMixed", {
      imageMb: 20,
      dataMb: 100,
    });
    const skippedEntries = oversized.map((file) =>
      buildUploadHistoryEntry({
        name: file.name,
        status: "skipped",
        detail: oversizedMessage,
        backend: selectedUploadBackend,
      }),
    );

    if (valid.length === 0) {
      setUploadHistory((prev) =>
        [...skippedEntries, ...prev].slice(0, HISTORY_MAX_ENTRIES),
      );
      setUploadStatus("");
      setUploadError(oversizedMessage);
      return;
    }

    setUploading(true);
    setUploadCount(valid.length);
    setUploadError("");
    setUploadStatus(t("admin.mediaUploadUploading", { n: valid.length }));
    let succeeded = 0;
    const errors = [];
    const attemptEntries = [];
    let firstUploadedItemId = "";

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
        entry.mimeType = json?.mimeType || file.type || "";
        entry.itemId = resolveUploadedItemId(json, selectedUploadBackend);
        if (!firstUploadedItemId && entry.itemId) {
          firstUploadedItemId = entry.itemId;
        }
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

    const skipped = oversized.length;
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
      if (firstUploadedItemId) {
        setPendingFocusItemId(firstUploadedItemId);
      }
    } else {
      setUploadStatus("");
    }

    if (failed > 0 || skipped > 0) {
      const summaryParts = [];
      if (failed > 0) {
        summaryParts.push(t("admin.mediaUploadFailed"));
      }
      if (skipped > 0) {
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
          "admin.mediaDropzoneNoFiles",
          "No files were detected. Drag files from your computer or click to choose files.",
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
        if (schemaParam?.type === "number") {
          if (typeof rawValue === "string" && rawValue.trim() === "") {
            value = undefined;
          } else {
            const parsed = Number(rawValue);
            value = Number.isFinite(parsed) ? parsed : rawValue;
          }
        } else if (schemaParam?.type === "color") {
          if (rawValue == null || rawValue === "") {
            value = undefined;
          } else if (typeof rawValue === "string") {
            value = hexToRgb(rawValue) || undefined;
          } else if (typeof rawValue === "object") {
            value = normalizeRgbObject(rawValue, schemaParam.defaultValue);
          } else {
            value = undefined;
          }
        } else if (typeof rawValue === "string" && rawValue.trim() === "") {
          value = undefined;
        } else if (schemaParam?.type === "select" && rawValue === "") {
          value = undefined;
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

  function handleColorChannelChange(operationIndex, key, channel, rawValue) {
    setCustomOperations((current) =>
      current.map((operation, index) => {
        if (index !== operationIndex) return operation;
        const schemaParam = OPERATION_SCHEMAS[operation.type]?.parameters?.find(
          (param) => param.key === key,
        );
        if (!schemaParam || schemaParam.type !== "color") return operation;
        const currentColor = normalizeRgbObject(
          operation.params?.[key],
          schemaParam.defaultValue,
        );
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) return operation;
        const nextColor = {
          ...currentColor,
          [channel]: clampRgbChannel(parsed, currentColor[channel]),
        };
        return {
          ...operation,
          params: {
            ...operation.params,
            [key]: nextColor,
          },
        };
      }),
    );
  }

  function handleMoveOperation(operationIndex, direction) {
    const targetIndex = operationIndex + direction;
    setCustomOperations((current) => {
      if (
        operationIndex < 0 ||
        targetIndex < 0 ||
        operationIndex >= current.length ||
        targetIndex >= current.length
      ) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(operationIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setFocusedOperationIndex((currentFocused) =>
      currentFocused === operationIndex ? targetIndex : currentFocused,
    );
  }

  function handleDuplicateOperation(operationIndex) {
    setCustomOperations((current) => {
      if (operationIndex < 0 || operationIndex >= current.length) return current;
      const duplicate = cloneOperations([current[operationIndex]])[0];
      if (!duplicate) return current;
      const next = [...current];
      next.splice(operationIndex + 1, 0, duplicate);
      return next;
    });
    setFocusedOperationIndex(operationIndex + 1);
  }

  function handleOperationEditorKeyDown(event, operationIndex) {
    if (!event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "arrowup") {
      event.preventDefault();
      handleMoveOperation(operationIndex, -1);
      return;
    }
    if (key === "arrowdown") {
      event.preventDefault();
      handleMoveOperation(operationIndex, 1);
      return;
    }
    if (key === "f") {
      event.preventDefault();
      toggleOperationCollapsed(operationIndex);
      return;
    }
    if (key === "b") {
      event.preventDefault();
      handleBindMissingOperationParams(operationIndex);
      return;
    }
    if (key === "r") {
      event.preventDefault();
      handleResetOperationDefaults(operationIndex);
    }
  }

  function addOperationByType(typeToAdd) {
    if (!typeToAdd) return;
    const defaultParams = buildDefaultParams(typeToAdd);
    setNewOperationType(typeToAdd);
    let nextIndex = -1;
    setCustomOperations((current) => {
      nextIndex = current.length;
      return [...current, { type: typeToAdd, params: defaultParams }];
    });
    if (nextIndex >= 0) setFocusedOperationIndex(nextIndex);
  }

  function handleAddOperation() {
    const typeToAdd = selectedVisibleOperationType || newOperationType;
    if (!typeToAdd) return;
    addOperationByType(typeToAdd);
  }

  function handleRemoveOperation(operationIndex) {
    setCustomOperations((current) => current.filter((_, index) => index !== operationIndex));
    setCollapsedOperationIndexes((current) =>
      current
        .filter((index) => index !== operationIndex)
        .map((index) => (index > operationIndex ? index - 1 : index)),
    );
    setFocusedOperationIndex((currentFocused) => {
      if (currentFocused === operationIndex) return Math.max(0, operationIndex - 1);
      if (currentFocused > operationIndex) return currentFocused - 1;
      return currentFocused;
    });
  }

  function handleResetOperationDefaults(operationIndex) {
    setCustomOperations((current) =>
      current.map((operation, index) => {
        if (index !== operationIndex) return operation;
        return {
          ...operation,
          params: buildDefaultParams(operation.type),
        };
      }),
    );
  }

  function handleBindMissingOperationParams(operationIndex) {
    setCustomOperations((current) =>
      current.map((operation, index) => {
        if (index !== operationIndex) return operation;
        const defaults = buildDefaultParams(operation.type);
        const nextParams = { ...(operation.params || {}) };
        Object.entries(defaults).forEach(([key, value]) => {
          if (nextParams[key] == null || nextParams[key] === "") {
            nextParams[key] = value;
          }
        });
        return {
          ...operation,
          params: nextParams,
        };
      }),
    );
  }

  function toggleOperationCollapsed(operationIndex) {
    setCollapsedOperationIndexes((current) => {
      if (current.includes(operationIndex)) {
        return current.filter((index) => index !== operationIndex);
      }
      return [...current, operationIndex];
    });
  }

  function collapseAllOperations() {
    setCollapsedOperationIndexes(customOperations.map((_, index) => index));
  }

  function expandAllOperations() {
    setCollapsedOperationIndexes([]);
  }

  function isOperationCollapsed(operationIndex) {
    return collapsedOperationIndexes.includes(operationIndex);
  }

  function getOperationSummary(operation) {
    const schema = OPERATION_SCHEMAS[operation.type];
    const entries = (schema?.parameters || []).map((param) => {
      const value = operation.params?.[param.key];
      if (value == null || value === "") return param.key;
      return `${param.key}=${formatParameterValue(value)}`;
    });
    return entries.filter(Boolean);
  }

  function handleDerivationPanelKeyDown(event) {
    if (!event.altKey) return;
    const key = String(event.key || "").toLowerCase();
    const targetTag = String(event.target?.tagName || "").toUpperCase();
    const isTextControl = ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag);
    if (key === "/") {
      event.preventDefault();
      operationSearchInputRef.current?.focus();
      operationSearchInputRef.current?.select();
      return;
    }
    if (isTextControl) return;
    if (key === "n") {
      event.preventDefault();
      handleAddOperation();
      return;
    }
    if (key === "e" && event.shiftKey) {
      event.preventDefault();
      expandAllOperations();
      return;
    }
    if (key === "e") {
      event.preventDefault();
      collapseAllOperations();
    }
  }

  function renderOperationParamField(operation, operationIndex, param) {
    const currentValue = operation.params?.[param.key];
    const isInvalid = isInvalidNumericParam(param, currentValue);
    const isUnbound = currentValue == null || currentValue === "";
    const numericRange = [
      typeof param.min === "number" ? param.min : null,
      typeof param.max === "number" ? param.max : null,
    ];
    const rangeHint =
      numericRange[0] != null || numericRange[1] != null
        ? `${numericRange[0] ?? "−∞"}..${numericRange[1] ?? "∞"}`
        : null;

    if (param.type === "select") {
      return (
        <div key={`${operationIndex}-${param.key}`} className="space-y-1">
          <label className="flex flex-col text-[11px] text-gray-700">
            <span>{param.label}</span>
            <select
              value={currentValue ?? ""}
              onChange={(event) =>
                handleOperationParamChange(operationIndex, param.key, event.target.value)
              }
              className="border rounded px-2 py-1 text-xs bg-white"
            >
              <option value="">
                {t("admin.mediaDerivationParamUnboundOption", "Unbound")}
              </option>
              {(param.options || []).map((option) => (
                <option key={String(option.value)} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    }

    if (param.type === "color") {
      const colorValue = normalizeRgbObject(currentValue, param.defaultValue);
      const colorHex = rgbToHex(colorValue);
      return (
        <div key={`${operationIndex}-${param.key}`} className="space-y-1">
          <label className="flex items-center justify-between text-[11px] text-gray-700">
            <span>{param.label}</span>
            <button
              type="button"
              onClick={() =>
                handleOperationParamChange(
                  operationIndex,
                  param.key,
                  isUnbound ? colorValue : "",
                )
              }
              className="text-[10px] text-slate-700 hover:underline"
            >
              {isUnbound
                ? t("admin.mediaDerivationBindParam", "Bind")
                : t("admin.mediaDerivationUnbindParam", "Unbind")}
            </button>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(event) =>
                handleOperationParamChange(operationIndex, param.key, event.target.value)
              }
              className="h-8 w-10 rounded border"
            />
            <code className="rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-700">
              {colorHex}
            </code>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {RGB_CHANNELS.map((channel) => (
              <label key={channel} className="text-[10px] text-gray-600">
                <span className="uppercase">{channel}</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  step={1}
                  value={colorValue[channel]}
                  onChange={(event) =>
                    handleColorChannelChange(
                      operationIndex,
                      param.key,
                      channel,
                      event.target.value,
                    )
                  }
                  className="mt-1 w-full border rounded px-2 py-1 text-xs"
                />
              </label>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={`${operationIndex}-${param.key}`} className="space-y-1">
        <label className="flex items-center justify-between text-[11px] text-gray-700">
          <span>{param.label}</span>
          <button
            type="button"
            onClick={() => handleOperationParamChange(operationIndex, param.key, "")}
            className="text-[10px] text-slate-700 hover:underline"
          >
            {t("admin.mediaDerivationUnbindParam", "Unbind")}
          </button>
        </label>
        <input
          type={param.type === "number" ? "number" : "text"}
          min={param.min}
          max={param.max}
          step={param.step}
          value={currentValue ?? ""}
          onChange={(event) =>
            handleOperationParamChange(operationIndex, param.key, event.target.value)
          }
          placeholder={rangeHint ? `${param.label} (${rangeHint})` : ""}
          aria-invalid={isInvalid || undefined}
          className={`w-full border rounded px-2 py-1 text-xs ${
            isInvalid
              ? "border-red-400 bg-red-50 text-red-900"
              : ""
          }`}
        />
        {param.type === "number" && Array.isArray(param.shortcuts) && param.shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {param.shortcuts.map((shortcut) => (
              <button
                key={`${operationIndex}-${param.key}-${shortcut}`}
                type="button"
                onClick={() => handleOperationParamChange(operationIndex, param.key, shortcut)}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
              >
                {shortcut}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function handleToggleAssetType(type) {
    setEditorAssetTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  }

  function buildDraftDerivationId(seed = "image-derivation") {
    const base = String(seed || "image-derivation")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image-derivation";
    return `${base}-${Date.now().toString(36)}`;
  }

  function openDerivationFlow(targetItem = null) {
    const candidate = targetItem || focusedItem || null;
    if (candidate && candidate.id && candidate.id !== focusedItemId) {
      setFocusedItemId(candidate.id);
    }
    if (candidate && !hasDerivationsForItem(candidate)) return;
    if (!candidate && !derivations.length) return;
    setActiveAssetFlow("derivation");
    requestAnimationFrame(() => {
      derivationPanelRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function startNewDerivationDraft() {
    const sourceAssetId = focusedItem?.id || "";
    setEditorId(buildDraftDerivationId("image-derivation"));
    setEditorName("");
    setEditorDescription("");
    setEditorAssetTypes(["image"]);
    setCollapsedOperationIndexes([]);
    setFocusedOperationIndex(0);
    setDerivationSaveStatus("");
    setDerivationSaveError("");
    setDerivationError("");
    setCustomOperations([
      {
        type: "source",
        params: sourceAssetId ? { assetId: sourceAssetId } : {},
      },
    ]);
    openDerivationFlow();
  }

  function cloneSelectedDerivationTemplate() {
    if (!selectedDerivation) return;
    setEditorId(buildDraftDerivationId(`${selectedDerivation.id}-copy`));
    setEditorName(
      `${selectedDerivation.name || t("admin.mediaDerivationsTitle", "Derivation templates")} ${t("admin.mediaDerivationCloneSuffix", "copy")}`,
    );
    setEditorDescription(selectedDerivation.description || "");
    setEditorAssetTypes(
      Array.isArray(selectedDerivation.assetTypes) && selectedDerivation.assetTypes.length > 0
        ? [...selectedDerivation.assetTypes]
        : ["image"],
    );
    setCollapsedOperationIndexes([]);
    setFocusedOperationIndex(-1);
    setDerivationSaveStatus("");
    setDerivationSaveError("");
    setDerivationError("");
    setCustomOperations(cloneOperations(selectedDerivation.operations || []));
    openDerivationFlow();
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
    preview_downscale: t("admin.mediaDerivationStepPreviewDownscale", "Building faster preview…"),
    decode_avif: t("admin.mediaDerivationStepDecodeAvif", "Decoding AVIF source…"),
    encode_avif: t("admin.mediaDerivationStepEncodeAvif", "Encoding AVIF output…"),
    encode:      t("admin.mediaDerivationStepEncode",     "Encoding output…"),
    pipeline:    t("admin.mediaDerivationStepPipeline",   "Processing…"),
    // op types
    resize:      t("admin.mediaDerivationOpResize",       "Resizing…"),
    crop:        t("admin.mediaDerivationOpCrop",         "Cropping…"),
    blur:        t("admin.mediaDerivationOpBlur",         "Blurring…"),
    tiltShift:   t("admin.mediaDerivationOpTiltShift",    "Applying tilt shift…"),
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

  function canApplyDerivationNow() {
    return Boolean(
      selectedDerivation &&
        focusedItem &&
        derivationUnboundParameters.length === 0 &&
        derivationInvalidParameters.length === 0,
    );
  }

  async function runDerivationApply({ quality = previewQuality } = {}) {
    if (!selectedDerivation || !focusedItem) {
      setDerivationError(t("admin.mediaDerivationRequiresSelection", "Select a derivation and an asset first."));
      return null;
    }
    if (derivationInvalidParameters.length > 0) {
      setDerivationError(
        t(
          "admin.mediaDerivationFixInvalidNumeric",
          "Fix invalid numeric parameters before applying the derivation.",
        ),
      );
      return null;
    }
    if (derivationUnboundParameters.length > 0) {
      setDerivationError(
        t(
          "admin.mediaDerivationFillParameters",
          "Fill all operation parameters before applying the derivation.",
        ),
      );
      return null;
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
          previewQuality: quality,
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
            setLastPreviewQuality(evt.previewQuality || quality);
            setApplyProgress(100);
            return { blob, contentType: evt.contentType, previewQuality: evt.previewQuality || quality };
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
      return null;
    } finally {
      setApplyingDerivation(false);
    }
    return null;
  }

  async function applySelectedDerivation() {
    await runDerivationApply({ quality: previewQuality });
  }

  async function uploadDerivedBlobToLibrary(blob, { qualityHint = lastPreviewQuality } = {}) {
    if (!blob || savingPreview) return false;
    if (qualityHint === "fast") {
      setSavePreviewError(
        t(
          "admin.mediaDerivationSaveRequiresFullQuality",
          "Fast preview cannot be saved. Re-run with Full quality or use Apply full-quality and save.",
        ),
      );
      return false;
    }
    setSavingPreview(true);
    setSavePreviewError("");
    try {
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/avif" ? "avif" : "jpg";
      const filename = `${selectedDerivation?.id || "derived"}-${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("assetRole", "variant");
      formData.append("variantKind", "derived-work");
      if (focusedItem?.url) {
        formData.append("originalUrl", String(focusedItem.url));
      }
      if (
        focusedItem?.source === "wordpress" &&
        Number.isFinite(Number.parseInt(String(focusedItem?.sourceId ?? ""), 10))
      ) {
        formData.append("originalId", String(focusedItem.sourceId));
      }
      const sourceAssetId = normalizeEditorValue(focusedItem?.asset?.assetId || "", 96);
      if (sourceAssetId) {
        formData.append("assetId", sourceAssetId);
      }
      const sourceOwnerUri = normalizeOwnerUri(focusedItem?.asset?.ownerUri || "/");
      if (sourceOwnerUri) {
        formData.append("ownerUri", sourceOwnerUri);
      }
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
        mimeType: json?.mimeType || blob.type || "",
        itemId: resolveUploadedItemId(json, selectedUploadBackend),
      });
      setUploadHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX_ENTRIES));
      setRefreshToken((value) => value + 1);
      if (entry.itemId) {
        setPendingFocusItemId(entry.itemId);
      }
      setPreviewBlobUrl(null);
      setPreviewBlob(null);
      return true;
    } catch (saveErr) {
      setSavePreviewError(
        saveErr instanceof Error
          ? saveErr.message
          : t("admin.mediaSaveDerivedAssetFailed", "Could not save to library."),
      );
      return false;
    } finally {
      setSavingPreview(false);
    }
  }

  async function applyFullQualityAndSave() {
    const result = await runDerivationApply({ quality: "full" });
    if (!result?.blob) return;
    await uploadDerivedBlobToLibrary(result.blob, { qualityHint: "full" });
  }

  async function savePreviewToLibrary() {
    await uploadDerivedBlobToLibrary(previewBlob, { qualityHint: lastPreviewQuality });
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
              "Combined library from WordPress media and configured bucket storage.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminDocsContextLinks tab="media" compact />
          <button
            type="button"
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading}
            className="px-3 py-2 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {t("admin.mediaRefresh", "Refresh")}
          </button>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        onChange={handleUploadInputChange}
        className="absolute -left-[10000px] top-auto h-px w-px opacity-0"
      />

      <div className="space-y-2 font-sans">
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

        <details className="rounded border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-800">
            {t(
              "admin.mediaExternalUploadToggle",
              "Upload using external software",
            )}
          </summary>
          <div className="border-t border-slate-200 px-3 py-3">
            <R2ConnectionPanel
              uploadBackend={uploadBackend}
              uploadInfo={uploadInfo}
              uploadInfoDetails={uploadInfoDetails}
            />
          </div>
        </details>

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
          className={`rounded border-2 border-dashed p-4 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500 ${
            isDragActive
              ? "border-slate-500 bg-slate-50"
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
                  "admin.mediaDropzonePasteHint",
                  "Paste also works for images: click this area and press Ctrl/Cmd+V.",
                )}
              </p>
              <p className="text-[11px] text-gray-500">
                {t("admin.mediaUploadLimits", {
                  imageMb: MAX_IMAGE_MB,
                  dataMb: MAX_DATA_MB,
                })}
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

        {uploadError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {uploadError}
          </p>
        )}

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
                  <div className="min-w-0 flex items-start gap-2">
                    {entry.status === "uploaded" && entry.url ? (
                      canPreviewImage(entry) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.url}
                          alt=""
                          className="h-10 w-10 rounded border object-cover bg-gray-100 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <FilePreviewTile item={entry} compact />
                      )
                    ) : null}
                    <div className="min-w-0">
                      {entry.itemId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFlashFocusedItemId(entry.itemId);
                            focusItemById(entry.itemId);
                          }}
                          className="text-xs font-medium text-slate-800 break-all hover:underline text-left"
                        >
                          {entry.name}
                        </button>
                      ) : (
                        <p className="text-xs font-medium text-gray-800 break-all">
                          {entry.name}
                        </p>
                      )}
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
                  </div>
                  <div className="flex gap-1">
                    {entry.itemId && (
                      <button
                        type="button"
                        onClick={() => {
                          setFlashFocusedItemId(entry.itemId);
                          focusItemById(entry.itemId);
                        }}
                        className="px-2 py-0.5 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {t("admin.mediaLocate", "Locate")}
                      </button>
                    )}
                    {entry.url && (
                      <button
                        type="button"
                        onClick={() => copyUrl(entry.url)}
                        className="inline-flex items-center justify-center px-1.5 py-1 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                        aria-label={t("admin.bucketCopyUrl", "Copy URL")}
                        title={t("admin.bucketCopyUrl", "Copy URL")}
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                        <span className="sr-only">{t("admin.bucketCopyUrl", "Copy URL")}</span>
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
      </div>

      <div className="flex flex-wrap gap-2">
        {sourceFilterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSourceFilter(option.id)}
            className={`admin-pill px-3 py-1.5 rounded border text-sm ${
              sourceFilter === option.id ? "admin-pill-active" : ""
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
          <span>{t("admin.mediaLineageFilter", "Asset role")}</span>
          <select
            value={lineageFilter}
            onChange={(event) => setLineageFilter(event.target.value)}
            className="border rounded px-2 py-1 text-xs bg-white"
          >
            <option value="all">{t("admin.mediaLineageAll", "All assets")}</option>
            <option value="original">
              {t("admin.mediaLineageOriginal", "Original")}
            </option>
            <option value="derived">
              {t("admin.mediaLineageDerived", "Derived")}
            </option>
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
          lineageFilter !== "all" ||
          showFocusedLineageOnly ||
          sortOrder !== "updated-desc" ||
          searchTerm) && (
          <button
            type="button"
            onClick={() => {
              setSourceFilter("all");
              setTypeFilter("all");
              setLineageFilter("all");
              setShowFocusedLineageOnly(false);
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

      {focusedAssetLineage.hasLineage && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowFocusedLineageOnly((current) => !current)}
            className={`px-2 py-1 rounded border ${
              showFocusedLineageOnly ? "admin-pill-active" : "admin-pill"
            }`}
          >
            {showFocusedLineageOnly
              ? t("admin.mediaLineageAllRows", "Show all assets")
              : t("admin.mediaLineageOnly", "Show lineage only")}
          </button>
          <span className="text-gray-500">
            {t("admin.mediaAssetLineageHint", "Jump between original and variant attachments that share the same asset ID.")}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>
          {t("admin.mediaResultsSummary", {
            shown: rowStats.shownCount,
            total: rowStats.totalCount,
          })}
        </span>
        <span>
          {t("admin.mediaResultsSize", {
            size: formatBytes(rowStats.totalBytes),
          })}
        </span>
        <span>
          {t("admin.mediaResultsBreakdown", {
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

      {sources && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`admin-status-pill px-2 py-1 rounded ${sources.wordpress?.ok ? "admin-status-pill-info" : "admin-status-pill-muted"}`}
          >
            WordPress: {sources.wordpress?.count ?? 0}
          </span>
          <span
            className={`admin-status-pill px-2 py-1 rounded ${sources.r2?.ok ? "admin-status-pill-success" : "admin-status-pill-muted"}`}
          >
            R2: {sources.r2?.count ?? 0}
          </span>
          {(sources.s3?.enabled || sources.s3?.ok || sources.s3?.count) && (
            <span
              className={`admin-status-pill px-2 py-1 rounded ${sources.s3?.ok ? "admin-status-pill-warning" : "admin-status-pill-muted"}`}
            >
              S3: {sources.s3?.count ?? 0}
            </span>
          )}
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
          className="overflow-auto border rounded focus:outline-none focus:ring-2 focus:ring-slate-500"
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
              {rows.map((item) => {
                const isFocusedRow = focusedItemId === item.id;
                const rowLineageRole = resolveAssetLineageRole(item);
                const rowVariantKind = normalizeEditorValue(
                  item?.asset?.variantKind || "",
                  80,
                );
                const rowCanOpenDerivation = hasDerivationsForItem(item);
                return (
                <tr
                  key={item.id}
                  ref={(node) => registerMediaRowRef(item.id, node)}
                  onClick={() => setFocusedItemId(item.id)}
                  className={`border-t align-top ${
                    isFocusedRow
                      ? "bg-slate-200"
                      : flashFocusedItemId === item.id
                        ? "bg-emerald-50"
                        : ""
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
                      <FilePreviewTile item={item} />
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
                      {rowLineageRole !== "untracked" && (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700">
                          {rowLineageRole === "derived"
                            ? t("admin.mediaLineageDerived", "Derived")
                            : t("admin.mediaLineageOriginal", "Original")}
                          {rowLineageRole === "derived" &&
                            rowVariantKind &&
                            rowVariantKind.toLowerCase() !== "original" && (
                              <span className="ml-1 normal-case font-medium">
                                {rowVariantKind}
                              </span>
                            )}
                        </span>
                      )}
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
                        onClick={() => createProductFromAsset(item)}
                        disabled={creatingProductFromAsset}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingProductFromAsset
                          ? t("common.loading", "Loading…")
                          : t("admin.mediaCreateProductFromAsset", "Create product")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(item)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {t("admin.mediaAnnotate", "Annotate")}
                      </button>
                      {rowCanOpenDerivation && (
                        <button
                          type="button"
                          onClick={() => openDerivationFlow(item)}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          {t("admin.mediaApplyDerivation", "Apply derivation")}
                        </button>
                      )}
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
                      {isFocusedRow && focusedAssetLineage.hasLineage && (
                        <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-1">
                          <p className="text-[11px] font-semibold text-slate-700">
                            {t("admin.mediaAssetLineageTitle", "Asset lineage")}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {focusedAssetLineage.original?.item &&
                              focusedAssetLineage.original.item.id !== item.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    focusItemById(focusedAssetLineage.original.item.id)
                                  }
                                  className="admin-pill px-2 py-1 rounded border text-[11px]"
                                >
                                  {t("admin.mediaAssetOriginal", "Original")}
                                </button>
                              )}
                            {focusedAssetLineage.variants
                              .filter(
                                (variant) =>
                                  variant?.linkedItem?.id &&
                                  variant.linkedItem.id !== item.id,
                              )
                              .map((variant) => (
                                <button
                                  key={variant.key}
                                  type="button"
                                  onClick={() => focusItemById(variant.linkedItem.id)}
                                  className="admin-pill px-2 py-1 rounded border text-[11px]"
                                >
                                  {variant.variantKind ||
                                    t("admin.mediaVariant", "Variant")}
                                </button>
                              ))}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowFocusedLineageOnly((current) => !current)
                            }
                            className={`text-[11px] px-2 py-1 rounded border ${
                              showFocusedLineageOnly
                                ? "admin-pill-active"
                                : "admin-pill"
                            }`}
                          >
                            {showFocusedLineageOnly
                              ? t("admin.mediaLineageAllRows", "Show all assets")
                              : t("admin.mediaLineageOnly", "Show lineage only")}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-700 hover:underline break-all"
                      >
                        {item.url}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyUrl(item.url)}
                        className="inline-flex items-center justify-center text-xs px-1.5 py-1 rounded border hover:bg-gray-50"
                        aria-label={
                          copiedUrl === item.url
                            ? t("admin.clientCopied", "Copied")
                            : t("admin.bucketCopyUrl", "Copy URL")
                        }
                        title={
                          copiedUrl === item.url
                            ? t("admin.clientCopied", "Copied")
                            : t("admin.bucketCopyUrl", "Copy URL")
                        }
                      >
                        <CopyIcon
                          className={`h-3.5 w-3.5 ${
                            copiedUrl === item.url ? "text-emerald-700" : ""
                          }`}
                        />
                        <span className="sr-only">
                          {copiedUrl === item.url
                            ? t("admin.clientCopied", "Copied")
                            : t("admin.bucketCopyUrl", "Copy URL")}
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {focusedAssetSupportsDerivations &&
        activeAssetFlow === "derivation" &&
        availableDerivations.length > 0 && (
        <DerivationWorkspacePanel
          derivationPanelRef={derivationPanelRef}
          handleDerivationPanelKeyDown={handleDerivationPanelKeyDown}
          startNewDerivationDraft={startNewDerivationDraft}
          cloneSelectedDerivationTemplate={cloneSelectedDerivationTemplate}
          selectedDerivation={selectedDerivation}
          setActiveAssetFlow={setActiveAssetFlow}
          selectedDerivationId={selectedDerivationId}
          setSelectedDerivationId={setSelectedDerivationId}
          setDerivationSaveStatus={setDerivationSaveStatus}
          setDerivationSaveError={setDerivationSaveError}
          setDerivationError={setDerivationError}
          availableDerivations={availableDerivations}
          editorId={editorId}
          setEditorId={setEditorId}
          editorName={editorName}
          setEditorName={setEditorName}
          editorDescription={editorDescription}
          setEditorDescription={setEditorDescription}
          editorAssetTypes={editorAssetTypes}
          handleToggleAssetType={handleToggleAssetType}
          customOperations={customOperations}
          derivationPseudoName={derivationPseudoName}
          derivationIsConcrete={derivationIsConcrete}
          derivationUnboundParameters={derivationUnboundParameters}
          derivationInvalidParameters={derivationInvalidParameters}
          derivationMatrixRows={derivationMatrixRows}
          collapseAllOperations={collapseAllOperations}
          expandAllOperations={expandAllOperations}
          isOperationCollapsed={isOperationCollapsed}
          getOperationSummary={getOperationSummary}
          focusedOperationIndex={focusedOperationIndex}
          setFocusedOperationIndex={setFocusedOperationIndex}
          handleOperationEditorKeyDown={handleOperationEditorKeyDown}
          toggleOperationCollapsed={toggleOperationCollapsed}
          handleMoveOperation={handleMoveOperation}
          handleDuplicateOperation={handleDuplicateOperation}
          handleBindMissingOperationParams={handleBindMissingOperationParams}
          handleResetOperationDefaults={handleResetOperationDefaults}
          handleRemoveOperation={handleRemoveOperation}
          renderOperationParamField={renderOperationParamField}
          quickOperationButtons={quickOperationButtons}
          addOperationByType={addOperationByType}
          operationSearchInputRef={operationSearchInputRef}
          operationSearchTerm={operationSearchTerm}
          setOperationSearchTerm={setOperationSearchTerm}
          selectedVisibleOperationType={selectedVisibleOperationType}
          filteredOperationPickerGroups={filteredOperationPickerGroups}
          setNewOperationType={setNewOperationType}
          handleAddOperation={handleAddOperation}
          previewQuality={previewQuality}
          setPreviewQuality={setPreviewQuality}
          applyingDerivation={applyingDerivation}
          saveDerivationTemplate={saveDerivationTemplate}
          derivationSaveStatus={derivationSaveStatus}
          applySelectedDerivation={applySelectedDerivation}
          savingPreview={savingPreview}
          canApplyDerivationNow={canApplyDerivationNow}
          applyFullQualityAndSave={applyFullQualityAndSave}
          savePreviewToLibrary={savePreviewToLibrary}
          previewBlob={previewBlob}
          lastPreviewQuality={lastPreviewQuality}
          focusedItem={focusedItem}
          applyProgress={applyProgress}
          applyProgressLabel={applyProgressLabel}
          derivationSaveError={derivationSaveError}
          derivationError={derivationError}
          previewBlobUrl={previewBlobUrl}
          savePreviewError={savePreviewError}
        />
      )}

      <MediaViewerPanel
        viewerItem={viewerItem}
        viewerLoading={viewerLoading}
        viewerError={viewerError}
        viewerData={viewerData}
        onClose={closeViewer}
      />
      <MediaAnnotationEditorPanel
        selectedItem={selectedItem}
        editor={editor}
        setEditor={setEditor}
        closeEditor={closeEditor}
        saveError={saveError}
        saveSuccess={saveSuccess}
        suggestAnnotations={suggestAnnotations}
        saveAnnotations={saveAnnotations}
        saveLoading={saveLoading}
      />

    </div>
  );
}
