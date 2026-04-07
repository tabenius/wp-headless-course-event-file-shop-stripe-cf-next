"use client";

import { t } from "@/lib/i18n";
import { OPERATION_SCHEMAS } from "@/lib/derivationEngine";
import { OPERATION_REGISTRY } from "@/components/admin/DerivationEditor/operationRegistry";
import { formatParameterValue } from "@/lib/mediaLibraryHelpers";
import AdminFieldHelpLink from "@/components/admin/AdminFieldHelpLink";

export default function DerivationWorkspacePanel({
  derivationPanelRef,
  handleDerivationPanelKeyDown,
  startNewDerivationDraft,
  cloneSelectedDerivationTemplate,
  selectedDerivation,
  setActiveAssetFlow,
  selectedDerivationId,
  setSelectedDerivationId,
  setDerivationSaveStatus,
  setDerivationSaveError,
  setDerivationError,
  availableDerivations,
  editorId,
  setEditorId,
  editorName,
  setEditorName,
  editorDescription,
  setEditorDescription,
  editorAssetTypes,
  handleToggleAssetType,
  customOperations,
  derivationPseudoName,
  derivationIsConcrete,
  derivationUnboundParameters,
  derivationInvalidParameters,
  derivationMatrixRows,
  collapseAllOperations,
  expandAllOperations,
  isOperationCollapsed,
  getOperationSummary,
  focusedOperationIndex,
  setFocusedOperationIndex,
  handleOperationEditorKeyDown,
  toggleOperationCollapsed,
  handleMoveOperation,
  handleDuplicateOperation,
  handleBindMissingOperationParams,
  handleResetOperationDefaults,
  handleRemoveOperation,
  renderOperationParamField,
  quickOperationButtons,
  addOperationByType,
  operationSearchInputRef,
  operationSearchTerm,
  setOperationSearchTerm,
  selectedVisibleOperationType,
  filteredOperationPickerGroups,
  setNewOperationType,
  handleAddOperation,
  previewQuality,
  setPreviewQuality,
  applyingDerivation,
  saveDerivationTemplate,
  derivationSaveStatus,
  applySelectedDerivation,
  savingPreview,
  canApplyDerivationNow,
  applyFullQualityAndSave,
  savePreviewToLibrary,
  previewBlob,
  lastPreviewQuality,
  focusedItem,
  applyProgress,
  applyProgressLabel,
  derivationSaveError,
  derivationError,
  previewBlobUrl,
  savePreviewError,
}) {
  return (
    <div
      ref={derivationPanelRef}
      onKeyDown={handleDerivationPanelKeyDown}
      className="rounded border border-slate-200 bg-slate-50 p-4 text-xs space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <span>
              {t("admin.mediaDerivationsTitle", "Derivation templates")}
            </span>
            <AdminFieldHelpLink slug="technical-manual" />
          </p>
          <p className="text-[11px] text-slate-700">
            {t(
              "admin.mediaDerivationsHint",
              "Choose an operation chain and tweak parameters before applying the derivation to the selected asset.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startNewDerivationDraft}
            className="px-3 py-1 rounded border text-[11px] bg-white"
          >
            {t("admin.mediaDerivationNew", "New derivation")}
          </button>
          <button
            type="button"
            onClick={cloneSelectedDerivationTemplate}
            disabled={!selectedDerivation}
            className="px-3 py-1 rounded border text-[11px] bg-white disabled:opacity-50"
          >
            {t("admin.mediaDerivationClone", "Clone derivation")}
          </button>
          <button
            type="button"
            onClick={() => setActiveAssetFlow("details")}
            className="px-3 py-1 rounded border text-[11px] bg-white"
          >
            {t("admin.mediaDerivationCloseFlow", "Back to asset")}
          </button>
          <select
            className="border rounded px-2 py-1 text-xs bg-white"
            value={selectedDerivationId}
            onChange={(event) => {
              setSelectedDerivationId(event.target.value);
              setDerivationSaveStatus("");
              setDerivationSaveError("");
              setDerivationError("");
            }}
          >
            {availableDerivations.map((derivation) => (
              <option key={derivation.id} value={derivation.id}>
                {derivation.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-[11px] text-gray-700">
            <span className="inline-flex items-center gap-1">
              <span>{t("admin.mediaDerivationId", "Derivation ID")}</span>
              <AdminFieldHelpLink slug="technical-manual" />
            </span>
            <input
              type="text"
              value={editorId}
              onChange={(event) => setEditorId(event.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="space-y-1 text-[11px] text-gray-700">
            <span className="inline-flex items-center gap-1">
              <span>{t("admin.mediaDerivationName", "Name")}</span>
              <AdminFieldHelpLink slug="technical-manual" />
            </span>
            <input
              type="text"
              value={editorName}
              onChange={(event) => setEditorName(event.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="space-y-1 text-[11px] text-gray-700 lg:col-span-3">
            <span className="inline-flex items-center gap-1">
              <span>
                {t("admin.mediaDerivationDescription", "Description")}
              </span>
              <AdminFieldHelpLink slug="technical-manual" />
            </span>
            <input
              type="text"
              value={editorDescription}
              onChange={(event) => setEditorDescription(event.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-700">
          <span className="inline-flex items-center gap-1">
            <span>
              {t("admin.mediaDerivationAssetTypes", "Applicable asset types")}
            </span>
            <AdminFieldHelpLink slug="technical-manual" />
          </span>
          {[
            { key: "image", label: t("admin.mediaTypeImage", "Images") },
            { key: "data", label: t("admin.mediaTypeData", "Data files") },
            { key: "other", label: t("admin.mediaTypeOther", "Other") },
          ].map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-1 text-gray-600"
            >
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
        <div className="space-y-3 rounded border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold text-slate-800">
                {t("admin.mediaDerivationSummaryTitle", "Derivation preview")}
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate">
                {editorName?.trim() || derivationPseudoName}
              </p>
              <p className="text-[11px] text-slate-600">
                {t("admin.mediaDerivationPseudoName", {
                  name: derivationPseudoName,
                })}
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
                ? t(
                    "admin.mediaDerivationStatusConcrete",
                    "Concrete derivation",
                  )
                : t(
                    "admin.mediaDerivationStatusAbstract",
                    "Abstract derivation",
                  )}
            </span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-800">
              {t("admin.mediaDerivationUnboundLabel", "Unbound parameters")}
            </p>
            {derivationUnboundParameters.length === 0 ? (
              <p className="text-[11px] text-slate-600">
                {t(
                  "admin.mediaDerivationAllBound",
                  "All operation parameters are bound.",
                )}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {derivationUnboundParameters.map((entry, entryIndex) => (
                  <span
                    key={`${entry.operator}-${entry.param}-${entryIndex}`}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    {entry.operator}: {entry.param}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-800">
              {t(
                "admin.mediaDerivationInvalidNumericLabel",
                "Invalid numeric parameters",
              )}
            </p>
            {derivationInvalidParameters.length === 0 ? (
              <p className="text-[11px] text-slate-600">
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
          <div className="rounded border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-700">
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
                      {t(
                        "admin.mediaDerivationMatrixOperatorHeader",
                        "Operator",
                      )}
                    </th>
                    <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-gray-500">
                      {t(
                        "admin.mediaDerivationMatrixParametersHeader",
                        "Parameters",
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {derivationMatrixRows.map((row) => (
                    <tr key={`${row.operation.type}-${row.index}`}>
                      <td className="px-2 py-1 text-[11px] font-semibold text-slate-800">
                        {row.index + 1}
                      </td>
                      <td className="px-2 py-1">
                        <p className="font-semibold text-slate-800">
                          {row.schema?.label || row.operation.type}
                        </p>
                        {row.operation.type === "source" && (
                          <p className="text-[10px] text-gray-500">
                            {row.operation.params?.assetId
                              ? row.operation.params.assetId
                              : t(
                                  "admin.mediaDerivationSourceUnbound",
                                  "Source is unbound",
                                )}
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
                                    ? "border-slate-200 bg-slate-50 text-slate-800"
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
        <p className="text-[11px] text-slate-700">
          {t(
            "admin.mediaDerivationNoOperations",
            "Select a derivation to edit its operations.",
          )}
        </p>
      )}
      {customOperations.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={collapseAllOperations}
            className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            {t("admin.mediaDerivationCollapseAll", "Collapse all")}
          </button>
          <button
            type="button"
            onClick={expandAllOperations}
            className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            {t("admin.mediaDerivationExpandAll", "Expand all")}
          </button>
        </div>
      )}
      {customOperations.map((operation, index) => {
        const schema = OPERATION_SCHEMAS[operation.type];
        const registrySchema = OPERATION_REGISTRY[operation.type];
        const isFirst = index === 0;
        const isLast = index === customOperations.length - 1;
        const isCollapsed = isOperationCollapsed(index);
        const summaryParts = getOperationSummary(operation);
        const isFocused = focusedOperationIndex === index;
        return (
          <div
            key={`${operation.type}-${index}`}
            className={`rounded border bg-white p-3 space-y-2 outline-none ${
              isFocused
                ? "border-slate-400 ring-2 ring-slate-200"
                : "border-slate-100"
            }`}
            tabIndex={0}
            onKeyDown={(event) => handleOperationEditorKeyDown(event, index)}
            onFocusCapture={() => setFocusedOperationIndex(index)}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800">
                  {schema?.label || operation.type}
                </p>
                {registrySchema?.tip && (
                  <p className="text-[10px] text-slate-700 truncate">
                    {registrySchema.tip}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-600">
                  {t("admin.mediaDerivationStep", { n: index + 1 })}
                </span>
                <button
                  type="button"
                  onClick={() => toggleOperationCollapsed(index)}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                  title={
                    isCollapsed
                      ? t("admin.mediaDerivationExpandStep", "Expand step")
                      : t("admin.mediaDerivationCollapseStep", "Collapse step")
                  }
                >
                  {isCollapsed
                    ? t("admin.mediaDerivationExpandStepShort", "Open")
                    : t("admin.mediaDerivationCollapseStepShort", "Fold")}
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveOperation(index, -1)}
                  disabled={isFirst}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  title={t("admin.mediaDerivationMoveStepUp", "Move step up")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveOperation(index, 1)}
                  disabled={isLast}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  title={t(
                    "admin.mediaDerivationMoveStepDown",
                    "Move step down",
                  )}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicateOperation(index)}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                  title={t(
                    "admin.mediaDerivationDuplicateStep",
                    "Duplicate step",
                  )}
                >
                  {t("admin.mediaDerivationDuplicateStepShort", "Dup")}
                </button>
                <button
                  type="button"
                  onClick={() => handleBindMissingOperationParams(index)}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                  title={t(
                    "admin.mediaDerivationBindMissingParams",
                    "Bind missing params",
                  )}
                >
                  {t("admin.mediaDerivationBindMissingShort", "Bind")}
                </button>
                <button
                  type="button"
                  onClick={() => handleResetOperationDefaults(index)}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                  title={t(
                    "admin.mediaDerivationResetStepDefaults",
                    "Reset to defaults",
                  )}
                >
                  {t("admin.mediaDerivationResetStepDefaultsShort", "Reset")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveOperation(index)}
                  className="rounded border border-red-200 px-1 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                >
                  {t("admin.mediaDerivationRemoveStep", "Remove step")}
                </button>
              </div>
            </div>
            {registrySchema?.techTip && (
              <p className="text-[10px] text-slate-500">
                {registrySchema.techTip}
              </p>
            )}
            {isCollapsed && (
              <div className="flex flex-wrap gap-1">
                {summaryParts.length === 0 ? (
                  <span className="text-[10px] text-slate-500">
                    {t("admin.mediaDerivationNoParams", "No parameters")}
                  </span>
                ) : (
                  summaryParts.map((part, partIndex) => (
                    <span
                      key={`${operation.type}-${index}-summary-${partIndex}`}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-800"
                    >
                      {part}
                    </span>
                  ))
                )}
              </div>
            )}
            {!isCollapsed && (
              <>
                {operation.type === "source" && (
                  <p className="text-[11px] text-slate-600">
                    {t(
                      "admin.mediaDerivationSourceHint",
                      "The source step tracks the asset you select in the table above.",
                    )}
                  </p>
                )}
                {schema?.parameters?.map((param) =>
                  renderOperationParamField(operation, index, param),
                )}
                <p className="text-[10px] text-slate-500">
                  {t(
                    "admin.mediaDerivationStepHotkeys",
                    "Tip: Alt+F fold, Alt+B bind, Alt+R reset, Alt+ArrowUp/Down move.",
                  )}
                </p>
              </>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1">
          <span className="text-[11px] font-semibold text-slate-700">
            {t("admin.mediaDerivationQuickAdd", "Quick add")}
          </span>
          {quickOperationButtons.map((entry) => (
            <button
              key={`quick-add-${entry.type}`}
              type="button"
              onClick={() => addOperationByType(entry.type)}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
            >
              {entry.schema?.icon ? `${entry.schema.icon} ` : ""}
              {entry.schema?.label || entry.type}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-gray-700">
          <span>
            {t("admin.mediaDerivationFindOperation", "Find operation")}
          </span>
          <input
            ref={operationSearchInputRef}
            type="search"
            value={operationSearchTerm}
            onChange={(event) => setOperationSearchTerm(event.target.value)}
            placeholder={t(
              "admin.mediaDerivationFindOperationPlaceholder",
              "Search by name or effect",
            )}
            className="w-56 border rounded px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-700">
          <span className="inline-flex items-center gap-1">
            <span>
              {t("admin.mediaDerivationAddOperationLabel", "Add operation")}
            </span>
            <AdminFieldHelpLink slug="technical-manual" />
          </span>
          <select
            className="border rounded px-2 py-1 text-xs bg-white"
            value={selectedVisibleOperationType}
            onChange={(event) => setNewOperationType(event.target.value)}
          >
            {filteredOperationPickerGroups.length === 0 && (
              <option value="" disabled>
                {t(
                  "admin.mediaDerivationNoMatchingOperations",
                  "No matching operations",
                )}
              </option>
            )}
            {filteredOperationPickerGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.operations.map((operation) => (
                  <option key={operation.type} value={operation.type}>
                    {operation.icon ? `${operation.icon} ` : ""}
                    {operation.label || operation.type}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAddOperation}
          disabled={
            !selectedVisibleOperationType ||
            filteredOperationPickerGroups.length === 0
          }
          className="px-3 py-1 rounded border text-[11px] bg-white"
        >
          {t("admin.mediaDerivationAddOperation", "Add operation")}
        </button>
        <span className="text-[10px] text-slate-600">
          {t(
            "admin.mediaDerivationPanelHotkeys",
            "Panel hotkeys: Alt+/ search, Alt+N add, Alt+E collapse all, Alt+Shift+E expand all.",
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-[11px] text-slate-700">
          <span>
            {t("admin.mediaDerivationPreviewQuality", "Preview quality")}
          </span>
          <select
            className="border rounded px-2 py-1 text-xs bg-white"
            value={previewQuality}
            onChange={(event) => setPreviewQuality(event.target.value)}
            disabled={applyingDerivation}
          >
            <option value="full">
              {t("admin.mediaDerivationPreviewQualityFull", "Full")}
            </option>
            <option value="fast">
              {t("admin.mediaDerivationPreviewQualityFast", "Fast")}
            </option>
          </select>
        </label>
        <button
          type="button"
          onClick={saveDerivationTemplate}
          disabled={derivationSaveStatus === "saving"}
          className="admin-pill-active px-3 py-1.5 rounded text-xs disabled:opacity-50"
        >
          {t("admin.mediaDerivationSave", "Save derivation")}
        </button>
        <button
          type="button"
          onClick={applySelectedDerivation}
          disabled={
            applyingDerivation || savingPreview || !canApplyDerivationNow()
          }
          className="admin-pill-active px-3 py-1.5 rounded text-xs disabled:opacity-50"
        >
          {applyingDerivation
            ? t("admin.mediaDerivationApplying", "Applying…")
            : t("admin.mediaApplyDerivation", "Apply derivation")}
        </button>
        <button
          type="button"
          onClick={applyFullQualityAndSave}
          disabled={
            applyingDerivation || savingPreview || !canApplyDerivationNow()
          }
          className="admin-pill-live px-3 py-1.5 rounded text-xs disabled:opacity-50"
        >
          {applyingDerivation || savingPreview
            ? t("admin.mediaSavingDerivedAsset", "Saving…")
            : t(
                "admin.mediaApplyDerivationAndSave",
                "Apply full-quality and save",
              )}
        </button>
        <button
          type="button"
          onClick={savePreviewToLibrary}
          disabled={
            !previewBlob || savingPreview || lastPreviewQuality === "fast"
          }
          className="admin-pill px-3 py-1.5 rounded border text-[11px] disabled:opacity-50"
        >
          {savingPreview
            ? t("admin.mediaSavingDerivedAsset", "Saving…")
            : t("admin.mediaSaveDerivedAsset", "Save to library")}
        </button>
        {!focusedItem && (
          <span className="text-[11px] text-slate-600">
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
        {previewBlob && lastPreviewQuality === "fast" && (
          <span className="text-[11px] text-amber-700">
            {t(
              "admin.mediaDerivationFastPreviewSaveBlocked",
              "Save is blocked for Fast preview. Use Apply full-quality and save.",
            )}
          </span>
        )}
      </div>
      {applyingDerivation && (
        <div className="space-y-1 py-1">
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-500 transition-all duration-500 ease-out"
              style={{ width: `${applyProgress}%` }}
            />
          </div>
          {applyProgressLabel && (
            <p className="text-[10px] text-slate-400">{applyProgressLabel}</p>
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
        <div className="rounded border border-slate-100 bg-white p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-800">
            {t("admin.mediaDerivationPreview", "Derivation preview")}
          </p>
          {lastPreviewQuality === "fast" && (
            <p className="text-[11px] text-amber-700">
              {t(
                "admin.mediaDerivationPreviewQualityFastHint",
                "Fast preview may be downscaled for speed. Re-run with Full before saving final output.",
              )}
            </p>
          )}
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
  );
}
