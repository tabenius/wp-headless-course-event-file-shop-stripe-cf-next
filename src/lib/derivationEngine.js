export const OPERATION_SCHEMAS = {
  crop: {
    label: "Crop",
    parameters: [
      { key: "width", label: "Width", type: "number", min: 32, max: 4000, step: 1 },
      { key: "height", label: "Height", type: "number", min: 32, max: 4000, step: 1 },
    ],
  },
  resize: {
    label: "Resize",
    parameters: [
      { key: "width", label: "Width", type: "number", min: 64, max: 4000, step: 1 },
      { key: "height", label: "Height", type: "number", min: 64, max: 4000, step: 1 },
    ],
  },
  sharpen: {
    label: "Sharpen",
    parameters: [],
  },
  colorBoost: {
    label: "Color boost",
    parameters: [
      { key: "vibrance", label: "Vibrance", type: "number", min: -1, max: 1, step: 0.05 },
      { key: "contrast", label: "Contrast", type: "number", min: -1, max: 1, step: 0.05 },
    ],
  },
  saturation: {
    label: "Saturation",
    parameters: [
      { key: "amount", label: "Amount", type: "number", min: -1, max: 1, step: 0.05 },
    ],
  },
  sepia: {
    label: "Sepia",
    parameters: [],
  },
  cropCircle: {
    label: "Circle crop",
    parameters: [
      { key: "diameter", label: "Diameter", type: "number", min: 32, max: 4000, step: 1 },
      { key: "centerX", label: "Center X (%)", type: "number", min: 0, max: 100, step: 1 },
      { key: "centerY", label: "Center Y (%)", type: "number", min: 0, max: 100, step: 1 },
    ],
  },
  presetCrop: {
    label: "Preset crop",
    parameters: [
      {
        key: "preset",
        label: "Aspect",
        type: "text",
      },
      {
        key: "scale",
        label: "Scale",
        type: "number",
        min: 0.5,
        max: 1,
        step: 0.05,
      },
    ],
  },
  textOverlay: {
    label: "Text overlay",
    parameters: [
      { key: "text", label: "Text", type: "text" },
      { key: "x", label: "X (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "y", label: "Y (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "typeface", label: "Typeface", type: "text" },
      { key: "size", label: "Size (pt)", type: "number", min: 6, max: 200, step: 1 },
    ],
  },
  source: {
    label: "Source asset",
    parameters: [
      {
        key: "assetId",
        label: "Asset ID",
        type: "text",
      },
    ],
  },
};

export function cloneOperations(operations) {
  if (!Array.isArray(operations)) return [];
  return operations.map((operation) => ({
    type: operation.type,
    params: operation.params ? { ...operation.params } : {},
  }));
}

export function bindOperationsToAsset(operations, assetId) {
  if (!Array.isArray(operations)) return [];
  const normalized = cloneOperations(operations);
  if (!assetId) return normalized;
  return normalized.map((operation) => {
    if (operation.type !== "source") return operation;
    return {
      ...operation,
      params: {
        ...operation.params,
        assetId,
      },
    };
  });
}

export function validateDerivationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Derivation payload must be an object.");
  }
  const { id, name, operations } = payload;
  if (!id || typeof id !== "string") {
    throw new Error("Derivation must include an id.");
  }
  if (!name || typeof name !== "string") {
    throw new Error("Derivation must include a name.");
  }
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("Derivation requires an operations array.");
  }
  const normalizedOperations = operations.map((operation, index) => {
    if (!operation || typeof operation !== "object") {
      throw new Error(`Operation ${index} must be an object.`);
    }
    const { type, params } = operation;
    if (!type || typeof type !== "string") {
      throw new Error(`Operation ${index} is missing a type.`);
    }
    return {
      type,
      params: params && typeof params === "object" ? { ...params } : {},
    };
  });
  const assetTypes = Array.isArray(payload.assetTypes)
    ? payload.assetTypes
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry)
    : [];
  return {
    id: id.trim(),
    name: name.trim(),
    description: typeof payload.description === "string" ? payload.description.trim() : "",
    operations: normalizedOperations,
    assetTypes,
  };
}

export function buildDerivedAsset({ derivation, operations, source }) {
  const suffix = operations.map((op) => (op.type || "")[0] || "d").join("");
  const derivedId = `derived-${derivation.id}-${source?.id || "asset"}-${Date.now()}`;
  const cachedUrl = `${String(source?.url || "/").replace(/\?.*$/, "")}?derived=${derivation.id}-${suffix}`;
  return {
    id: derivedId,
    key: derivedId,
    title: `${derivation.name} (${source?.title || "asset"})`,
    source: "derived",
    derivationId: derivation.id,
    derivedFrom: source?.id || null,
    url: cachedUrl,
    mimeType: source?.mimeType || "image/jpeg",
    sizeBytes: source?.sizeBytes || source?.asset?.sizeBytes || 0,
    width: source?.width || source?.asset?.width || null,
    height: source?.height || source?.asset?.height || null,
    metadata: source?.metadata || {},
    rights: source?.rights || {},
    operations,
    cachedAt: new Date().toISOString(),
  };
}
