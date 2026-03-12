"use client";

import { useEffect, useMemo, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FileField } from "@/components/ui/FileField";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useI18n } from "@/lib/i18n/useI18n";
import type {
  ConstructionImportLayout,
  ConstructionImportStep,
  ConstructionImportTarget,
} from "../constructionImportConfig";

type RowTypeHints = {
  productLikeRows?: number;
  componentLikeRows?: number;
  unknownRows?: number;
  suggestedTarget?: ConstructionImportTarget;
};

export type ConstructionImportPreviewColumn = {
  id: string;
  label: string;
  draftKey: string;
  editable?: boolean;
};

type ConstructionImportTargetUiMeta = {
  label: string;
  targetTableLabel: string;
  targetDescription: string;
  applyLabel: string;
};

type ConstructionImportMappingField = {
  key: string;
  label: string;
};

type ConstructionImportHeaderOption = {
  value: string;
  label: string;
};

type SavedTemplateItem = {
  id: string;
  name: string;
  isDefault: boolean;
};

type ConstructionImportModalProps = {
  open: boolean;
  onClose: () => void;
  closeButtonLabel: string;
  step: ConstructionImportStep;
  setStep: (step: ConstructionImportStep) => void;
  steps: readonly ConstructionImportStep[];
  target: ConstructionImportTarget;
  setTarget: (target: ConstructionImportTarget) => void;
  targetMetaByValue: Record<
    ConstructionImportTarget,
    ConstructionImportTargetUiMeta
  >;
  parseMode: ConstructionImportLayout;
  targetSchemaColumns: string[];
  previewColumns: ConstructionImportPreviewColumn[];
  onFileChange: (file: File) => void | Promise<void>;
  primaryConstructionFieldId?: string;
  selectedAttachmentId: string;
  onAttachmentChange: (attachmentId: string) => void;
  attachments: Array<{ id: string; name: string }>;
  onImportFromAttachment: () => void | Promise<void>;
  onOpenAiImport: () => void | Promise<void>;
  isOpeningAiImport: boolean;
  onAiBootstrap: () => void | Promise<void>;
  isApplyingAiBootstrap: boolean;
  headers: string[];
  headerOptions: ConstructionImportHeaderOption[];
  mapping: Record<string, string>;
  applyMapping: (nextMapping: Record<string, string>) => void;
  mappingFields: ConstructionImportMappingField[];
  aiNotice: string;
  aiRowTypeHints?: RowTypeHints | null;
  error: string;
  draftRows: Array<Record<string, string>>;
  setDraftRows: (
    updater:
      | Array<Record<string, string>>
      | ((
          prev: Array<Record<string, string>>,
        ) => Array<Record<string, string>>),
  ) => void;
  fileName: string;
  sheetName: string;
  missingMappingKeys: readonly string[];
  invalidRowCount: number;
  profileName: string;
  setProfileName: (value: string) => void;
  onSaveProfile: (makeDefault?: boolean) => void | Promise<void>;
  isSavingProfile: boolean;
  profileNotice: string;
  activeTemplateName?: string | null;
  matchedTemplateName?: string | null;
  parseSource?: "template" | "template_fallback_ai" | "automatic" | null;
  parserModel?: string | null;
  templates?: SavedTemplateItem[];
  onSetDefaultTemplate?: (id: string) => void | Promise<void>;
  onDeleteTemplate?: (id: string) => void | Promise<void>;
  onRenameTemplate?: (id: string, name: string) => void | Promise<void>;
  templateActionId?: string | null;
  isMappingReady: boolean;
  isReviewReady: boolean;
  canEditOrderInputs: boolean;
  isApplyingImport: boolean;
  onApplyImport: () => void | Promise<void>;
};

function hasValue(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function detectDraftRowKind(
  row: Record<string, string>,
): "product" | "component" | "unknown" {
  const hasParentArticle = hasValue(row.parent_article);
  const hasItemType = hasValue(row.item_type);
  const hasItemName = hasValue(row.item_name);
  const hasPosition = hasValue(row.position);
  const hasQty = hasValue(row.qty);
  const hasMaterial = hasValue(row.material);
  const hasDimensions = hasValue(row.dimensions);

  if (hasParentArticle) {
    return "component";
  }

  if (hasItemType) {
    return "product";
  }

  if (hasItemName && hasQty && hasDimensions && !hasMaterial) {
    return "product";
  }

  if (
    (hasPosition && hasQty) ||
    (hasMaterial && hasQty) ||
    (hasDimensions && hasQty)
  ) {
    return "component";
  }

  return "unknown";
}

export function ConstructionImportModal({
  open,
  onClose,
  closeButtonLabel,
  step,
  setStep,
  steps,
  target,
  setTarget,
  targetMetaByValue,
  parseMode,
  targetSchemaColumns,
  previewColumns,
  onFileChange,
  primaryConstructionFieldId,
  selectedAttachmentId,
  onAttachmentChange,
  attachments,
  onImportFromAttachment,
  onOpenAiImport,
  isOpeningAiImport,
  onAiBootstrap,
  isApplyingAiBootstrap,
  headers,
  headerOptions,
  mapping,
  applyMapping,
  mappingFields,
  aiNotice,
  aiRowTypeHints,
  error,
  draftRows,
  setDraftRows,
  fileName,
  sheetName,
  missingMappingKeys,
  invalidRowCount,
  profileName,
  setProfileName,
  onSaveProfile,
  isSavingProfile,
  profileNotice,
  activeTemplateName,
  matchedTemplateName,
  parseSource,
  parserModel,
  templates = [],
  onSetDefaultTemplate,
  onDeleteTemplate,
  onRenameTemplate,
  templateActionId,
  isMappingReady,
  isReviewReady,
  canEditOrderInputs,
  isApplyingImport,
  onApplyImport,
}: ConstructionImportModalProps) {
  const { t } = useI18n();
  const [selectedRowRefs, setSelectedRowRefs] = useState<string[]>([]);
  const [isRunningAttachmentAction, setIsRunningAttachmentAction] =
    useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [showSourceControls, setShowSourceControls] = useState(true);
  const targetMeta = targetMetaByValue[target];
  const reviewCopy =
    target === "bom"
      ? {
          rowNoun: t("orders.detail.importModal.rowNouns.components"),
          previewTitle: t("orders.detail.importModal.preview.componentsTitle"),
        }
      : {
          rowNoun: t("orders.detail.importModal.rowNouns.products"),
          previewTitle: t("orders.detail.importModal.preview.productsTitle"),
        };

  const analyzedRows = useMemo(
    () =>
      draftRows.map((row, index) => {
        const kind = detectDraftRowKind(row);
        const hasName = hasValue(row.item_name);
        const isMismatch =
          kind !== "unknown" &&
          ((target === "items" && kind === "component") ||
            (target === "bom" && kind === "product"));

        return {
          row,
          rowIndex: index,
          kind,
          hasName,
          isMismatch,
        };
      }),
    [draftRows, target],
  );

  const validNamedRowCount = analyzedRows.filter(
    (entry) => entry.hasName,
  ).length;
  const productLikeCount = analyzedRows.filter(
    (entry) => entry.kind === "product",
  ).length;
  const componentLikeCount = analyzedRows.filter(
    (entry) => entry.kind === "component",
  ).length;
  const mismatchCount = analyzedRows.filter((entry) => entry.isMismatch).length;
  const unknownCount = analyzedRows.filter(
    (entry) => entry.kind === "unknown",
  ).length;

  const localSuggestedTarget: ConstructionImportTarget | null =
    draftRows.length === 0
      ? null
      : componentLikeCount > productLikeCount
        ? "bom"
        : "items";
  const effectiveSuggestedTarget =
    aiRowTypeHints?.suggestedTarget ?? localSuggestedTarget;
  const showSuggestedTargetBanner =
    effectiveSuggestedTarget != null &&
    effectiveSuggestedTarget !== target &&
    draftRows.length > 0;

  const filteredRows = analyzedRows;
  const filteredRowRefs = filteredRows.map((entry) => entry.row.source_row_ref);
  const allFilteredSelected =
    filteredRowRefs.length > 0 &&
    filteredRowRefs.every((rowRef) => selectedRowRefs.includes(rowRef));

  useEffect(() => {
    setSelectedRowRefs((prev) =>
      prev.filter((rowRef) =>
        draftRows.some((row) => row.source_row_ref === rowRef),
      ),
    );
  }, [draftRows]);

  const selectedAttachment =
    attachments.find((attachment) => attachment.id === selectedAttachmentId) ??
    null;
  const selectedAttachmentName = selectedAttachment?.name.toLowerCase() ?? "";
  const selectedAttachmentIsPdf = selectedAttachmentName.endsWith(".pdf");
  const selectedFileName = fileName || selectedAttachment?.name || "";
  const selectedFileNameLower = selectedFileName.toLowerCase();
  const selectedFileKind = selectedFileNameLower.endsWith(".pdf")
    ? "pdf"
    : selectedFileNameLower.endsWith(".csv")
      ? "csv"
      : selectedFileNameLower.endsWith(".xlsx") ||
          selectedFileNameLower.endsWith(".xls")
        ? "spreadsheet"
        : "";
  const stepLabels: Record<ConstructionImportStep, string> = {
    source: t("orders.detail.importModal.steps.source"),
    mapping: t("orders.detail.importModal.steps.mapping"),
    review: t("orders.detail.importModal.steps.review"),
    save: t("orders.detail.importModal.steps.save"),
  };
  const attachmentActionLabel = selectedAttachmentIsPdf
    ? isOpeningAiImport
      ? t("orders.detail.aiImport.adding")
      : t("orders.detail.importModal.openAiImport")
    : t("orders.detail.importModal.importFromAttachment");
  const isAttachmentActionLoading =
    isRunningAttachmentAction || isOpeningAiImport;
  const isPdfFlow = selectedFileKind === "pdf";
  const fieldsWithDetectedValues = new Set(
    previewColumns
      .filter((column) =>
        draftRows.some((row) => hasValue(row[column.draftKey])),
      )
      .map((column) => column.draftKey),
  );
  const pdfCorrectionFields = isPdfFlow
    ? mappingFields.filter((field) => !fieldsWithDetectedValues.has(field.key))
    : mappingFields;
  const pdfDetectedFields = isPdfFlow
    ? mappingFields.filter((field) => fieldsWithDetectedValues.has(field.key))
    : [];
  const pdfRowsMissingName = isPdfFlow
    ? draftRows.filter((row) => !hasValue(row.item_name)).length
    : 0;
  const showPdfReviewFixNotice = isPdfFlow && invalidRowCount > 0;
  const showGenericMissingMappingNotice =
    !isPdfFlow && missingMappingKeys.length > 0;
  const hasUsefulPdfCorrectionStep =
    isPdfFlow && pdfCorrectionFields.length > 0 && headerOptions.length > 0;
  const canJumpToReviewFromSource =
    step === "source" && Boolean(matchedTemplateName) && draftRows.length > 0;
  const shouldCompressSource =
    Boolean(matchedTemplateName) && draftRows.length > 0;
  const visibleSteps = steps.filter((wizardStep) => {
    if (wizardStep === "mapping") {
      if (shouldCompressSource) {
        return false;
      }
      if (isPdfFlow) {
        return false;
      }
    }
    return true;
  });
  const currentStepIndex = visibleSteps.indexOf(step);
  const canStepBack = step !== "source";
  const canStepForward =
    (step === "source" &&
      (isPdfFlow ? isReviewReady : isMappingReady)) ||
    (step === "mapping" && isReviewReady) ||
    step === "review";
  const compactFileSummary = selectedFileName ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
      <span className="font-medium text-foreground">
        {t("orders.detail.importModal.selectedFile")}:
      </span>
      <span className="rounded-full bg-muted px-2 py-1 text-foreground">
        {selectedFileName}
      </span>
      {selectedFileKind ? (
        <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
          {selectedFileKind === "pdf"
            ? t("orders.detail.importModal.fileKinds.pdf")
            : selectedFileKind === "csv"
              ? t("orders.detail.importModal.fileKinds.csv")
              : t("orders.detail.importModal.fileKinds.spreadsheet")}
        </span>
      ) : null}
      {selectedFileKind ? (
        <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
          {selectedFileKind === "pdf"
            ? t("orders.detail.importModal.processingModes.ai")
            : t("orders.detail.importModal.processingModes.mapping")}
        </span>
      ) : null}
    </div>
  ) : null;

  useEffect(() => {
    setShowSourceControls(!shouldCompressSource);
  }, [shouldCompressSource, open]);

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      ariaLabel={t("orders.detail.importModal.title")}
      title={t("orders.detail.importModal.title")}
      closeButtonLabel={closeButtonLabel}
      desktopPanelClassName="w-[min(96vw,1440px)]"
      desktopBodyClassName="min-h-0"
    >
      <div className="flex h-[74dvh] min-h-0 flex-col md:h-full">
        <div className="border-b border-border/70 bg-card px-3 pb-3 pt-2 md:px-4">
          <p className="text-xs mb-2 text-muted-foreground">
            {t("orders.detail.importModal.description")}
          </p>
          <div
            role="tablist"
            aria-label={t("orders.detail.importModal.wizard")}
            className={`grid gap-2 ${visibleSteps.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}
          >
            {visibleSteps.map((wizardStep, index) => {
              const isActive = step === wizardStep;
              const currentStepIndex = visibleSteps.indexOf(step);
              const isDone = currentStepIndex > index;
              const isReachable = index <= currentStepIndex;
              return (
                <button
                  type="button"
                  key={`wizard-step-${wizardStep}`}
                  role="tab"
                  aria-selected={isActive}
                  disabled={!isReachable}
                  onClick={() => {
                    if (!isReachable) return;
                    setStep(wizardStep);
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] ${
                    isActive
                      ? "border-primary bg-primary/5 text-primary"
                      : isDone
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-border bg-background text-muted-foreground"
                  } ${isReachable ? "cursor-pointer" : "cursor-default opacity-70"}`}
                >
                  {stepLabels[wizardStep]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
          <div className="space-y-4 pb-4">
            {step === "source" ? (
              <>
            <div className="grid gap-2 md:max-w-85">
              <div className="text-xs text-muted-foreground">
                {t("orders.detail.importModal.addFromImport")}
              </div>
              <Select
                value={target}
                onValueChange={(value) =>
                  setTarget(value === "bom" ? "bom" : "items")
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue
                    placeholder={t("orders.detail.importModal.selectTarget")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(targetMetaByValue).map(([value, option]) => (
                    <SelectItem key={value} value={value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showSuggestedTargetBanner ? (
              <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-900">
                <div className="font-medium">
                  {t("orders.detail.importModal.suggestedTargetBanner", {
                    target:
                      targetMetaByValue[
                        effectiveSuggestedTarget
                      ].label.toLowerCase(),
                  })}
                </div>
                <div className="mt-1 text-amber-800">
                  {t("orders.detail.importModal.rowAnalysis", {
                    products:
                      aiRowTypeHints?.productLikeRows ?? productLikeCount,
                    components:
                      aiRowTypeHints?.componentLikeRows ?? componentLikeCount,
                    unknown: aiRowTypeHints?.unknownRows ?? unknownCount,
                  })}
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(effectiveSuggestedTarget)}
                  >
                    {t("orders.detail.importModal.useSuggestedTarget")}
                  </Button>
                </div>
              </div>
            ) : null}

            {selectedFileName ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                <span className="font-medium text-foreground">
                  {t("orders.detail.importModal.selectedFile")}:
                </span>
                <span className="rounded-full bg-muted px-2 py-1 text-foreground">
                  {selectedFileName}
                </span>
                {selectedFileKind ? (
                  <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
                    {selectedFileKind === "pdf"
                      ? t("orders.detail.importModal.fileKinds.pdf")
                      : selectedFileKind === "csv"
                        ? t("orders.detail.importModal.fileKinds.csv")
                        : t("orders.detail.importModal.fileKinds.spreadsheet")}
                  </span>
                ) : null}
                {selectedFileKind ? (
                  <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
                    {selectedFileKind === "pdf"
                      ? t("orders.detail.importModal.processingModes.ai")
                      : t("orders.detail.importModal.processingModes.mapping")}
                  </span>
                ) : null}
              </div>
            ) : null}

            {activeTemplateName || matchedTemplateName ? (
              <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  {activeTemplateName ? (
                    <span className="rounded-full border border-border bg-background px-2 py-1 text-foreground">
                      {t("orders.detail.importModal.activeTemplateTitle")}:{" "}
                      {activeTemplateName}
                    </span>
                  ) : null}
                  {matchedTemplateName ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                      {t("orders.detail.importModal.matchedTemplateTitle")}:{" "}
                      {matchedTemplateName}
                    </span>
                  ) : null}
                  {parseSource ? (
                    <span className="rounded-full border border-border bg-background px-2 py-1">
                      {parseSource === "template"
                        ? t("orders.detail.importModal.parseSources.template")
                        : parseSource === "template_fallback_ai"
                          ? t(
                              "orders.detail.importModal.parseSources.templateFallback",
                            )
                          : t(
                              "orders.detail.importModal.parseSources.automatic",
                            )}
                    </span>
                  ) : null}
                  {parserModel ? (
                    <span className="rounded-full border border-border bg-background px-2 py-1">
                      {parserModel}
                    </span>
                  ) : null}
                </div>
                {canJumpToReviewFromSource ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setStep("review")}
                    >
                      {t("orders.detail.importModal.reviewImport")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowSourceControls((prev) => !prev)}
                    >
                      {showSourceControls
                        ? t("orders.detail.importModal.hideFileOptions")
                        : t("orders.detail.importModal.changeFile")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showSourceControls ? (
              <>
                <FileField
                  label={t("orders.detail.importModal.fileLabel")}
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) return;
                    void onFileChange(file);
                  }}
                />

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">
                    {t("orders.detail.importModal.attachmentPrompt")}
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <Select
                      value={selectedAttachmentId || "__none__"}
                      onValueChange={(value) =>
                        onAttachmentChange(value === "__none__" ? "" : value)
                      }
                      disabled={!primaryConstructionFieldId}
                    >
                      <SelectTrigger className="h-9 w-full md:w-90">
                        <SelectValue
                          placeholder={t(
                            "orders.detail.importModal.selectAttachment",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t("orders.detail.importModal.selectAttachment")}
                        </SelectItem>
                        {attachments.map((attachment) => (
                          <SelectItem
                            key={`construction-modal-attachment-${attachment.id}`}
                            value={attachment.id}
                          >
                            {attachment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setIsRunningAttachmentAction(true);
                        try {
                          if (selectedAttachmentIsPdf) {
                            await onOpenAiImport();
                            return;
                          }
                          await onImportFromAttachment();
                        } finally {
                          setIsRunningAttachmentAction(false);
                        }
                      }}
                      disabled={isAttachmentActionLoading}
                    >
                      {isAttachmentActionLoading ? (
                        <LoadingSpinner
                          label={attachmentActionLabel}
                          className="gap-1.5"
                          labelClassName="text-inherit"
                          spinnerClassName="h-3.5 w-3.5 border-current border-t-transparent"
                        />
                      ) : (
                        attachmentActionLabel
                      )}
                    </Button>
                  </div>
                  {selectedAttachmentIsPdf ? (
                    <div className="text-xs text-muted-foreground">
                      {t("orders.detail.importModal.pdfUseAi")}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

              </>
            ) : (
              compactFileSummary
            )}

            {step === "mapping" ? (
              <>
                {isPdfFlow ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {t("orders.detail.importModal.pdfDetectedFieldsHint")}
                    </div>
                    {pdfDetectedFields.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {pdfDetectedFields.map((field) => (
                          <span
                            key={`detected-field-${field.key}`}
                            className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground"
                          >
                            {field.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {pdfCorrectionFields.length > 0 ? (
                      <>
                        <div className="text-xs text-muted-foreground">
                          {t("orders.detail.importModal.pdfCorrectionHint")}
                        </div>
                        {headerOptions.length > 0 ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {pdfCorrectionFields.map((field) => (
                              <div
                                key={`modal-mapping-field-${field.key}`}
                                className="space-y-1"
                              >
                                <div className="text-xs text-muted-foreground">
                                  {field.label}
                                </div>
                                <Select
                                  value={mapping[field.key] || "__none__"}
                                  onValueChange={(value) => {
                                    const nextMapping = {
                                      ...mapping,
                                      [field.key]:
                                        value === "__none__" ? "" : value,
                                    };
                                    applyMapping(nextMapping);
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full">
                                    <SelectValue placeholder={field.label} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      {t("orders.detail.importModal.unmapped", {
                                        key: field.label,
                                      })}
                                    </SelectItem>
                                    {headerOptions.map((header) => (
                                      <SelectItem
                                        key={`modal-${field.key}-${header.value}`}
                                        value={header.value}
                                      >
                                        {header.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                            <div>
                              {pdfRowsMissingName > 0
                                ? t("orders.detail.importModal.pdfFixInReview", {
                                    count: pdfRowsMissingName,
                                  })
                                : t(
                                    "orders.detail.importModal.pdfNoSourceFieldsHint",
                                  )}
                            </div>
                            <div className="mt-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setStep("review")}
                              >
                                {t("orders.detail.importModal.reviewImport")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : pdfRowsMissingName > 0 ? (
                      <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                        <div>
                          {t("orders.detail.importModal.pdfFixInReview", {
                            count: pdfRowsMissingName,
                          })}
                        </div>
                        <div className="mt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setStep("review")}
                          >
                            {t("orders.detail.importModal.reviewImport")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {t("orders.detail.importModal.mappingHint")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onAiBootstrap()}
                        disabled={isApplyingAiBootstrap || headers.length === 0}
                      >
                        {isApplyingAiBootstrap ? (
                          <LoadingSpinner
                            label={t("orders.detail.importModal.aiAnalyzing")}
                            className="gap-1.5"
                            labelClassName="text-inherit"
                            spinnerClassName="h-3.5 w-3.5 border-current border-t-transparent"
                          />
                        ) : (
                          t("orders.detail.importModal.aiBootstrap")
                        )}
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        {t("orders.detail.importModal.aiBootstrapHint")}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {mappingFields.map((field) => (
                        <div
                          key={`modal-mapping-field-${field.key}`}
                          className="space-y-1"
                        >
                          <div className="text-xs text-muted-foreground">
                            {field.label}
                          </div>
                          <Select
                            value={mapping[field.key] || "__none__"}
                            onValueChange={(value) => {
                              const nextMapping = {
                                ...mapping,
                                [field.key]: value === "__none__" ? "" : value,
                              };
                              applyMapping(nextMapping);
                            }}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder={field.label} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                {t("orders.detail.importModal.unmapped", {
                                  key: field.label,
                                })}
                              </SelectItem>
                              {headerOptions.map((header) => (
                                <SelectItem
                                  key={`modal-${field.key}-${header.value}`}
                                  value={header.value}
                                >
                                  {header.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}

            {aiNotice && step === "mapping" && !isPdfFlow ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                {aiNotice}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {step === "review" && draftRows.length > 0 ? (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  {fileName}
                  {sheetName
                    ? ` · ${t("orders.detail.importModal.sheetPrefix")}: ${sheetName}`
                    : ""}
                  {` · ${draftRows.length} ${reviewCopy.rowNoun}`}
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("orders.detail.importModal.stats.target")}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {targetMeta.label}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("orders.detail.importModal.stats.rows")}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {draftRows.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("orders.detail.importModal.stats.named")}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {validNamedRowCount}
                    </div>
                  </div>
                </div>

                <div className="text-sm font-medium text-foreground">
                  {reviewCopy.previewTitle}
                </div>

                {mismatchCount > 0 ? (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                    {target === "items"
                      ? t("orders.detail.importModal.mismatchProducts", {
                          count: mismatchCount,
                        })
                      : t("orders.detail.importModal.mismatchComponents", {
                          count: mismatchCount,
                        })}
                  </div>
                ) : null}

                {showGenericMissingMappingNotice ? (
                  <div className="text-xs text-amber-700">
                    {t("orders.detail.importModal.missingMapping", {
                      keys: missingMappingKeys.join(", "),
                    })}
                  </div>
                ) : null}
                {showPdfReviewFixNotice ? (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                    <div>
                      {t("orders.detail.importModal.pdfFixInReview", {
                        count: invalidRowCount,
                      })}
                    </div>
                  </div>
                ) : null}
                {invalidRowCount > 0 ? (
                  <div className="text-xs text-amber-700">
                    {t("orders.detail.importModal.invalidRows", {
                      count: invalidRowCount,
                    })}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelectedRowRefs((prev) =>
                          allFilteredSelected
                            ? prev.filter(
                                (rowRef) => !filteredRowRefs.includes(rowRef),
                              )
                            : Array.from(
                                new Set([...prev, ...filteredRowRefs]),
                              ),
                        )
                      }
                    >
                      {allFilteredSelected
                        ? t("orders.detail.importModal.clearSelected")
                        : t("orders.detail.importModal.selectVisible")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedRowRefs.length === 0}
                      onClick={() => {
                        setDraftRows((prev) =>
                          prev.filter(
                            (row) =>
                              !selectedRowRefs.includes(row.source_row_ref),
                          ),
                        );
                        setSelectedRowRefs([]);
                      }}
                    >
                      {t("orders.detail.importModal.removeSelectedRows")}
                    </Button>
                  </div>
                </div>

                <div className="max-h-[48vh] overflow-auto rounded-lg border border-border bg-background">
                  <table className="min-w-full table-fixed text-xs">
                    <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur supports-backdrop-filter:bg-muted/80">
                      <tr>
                        <th className="w-12 px-2 py-1 text-left">#</th>
                        {previewColumns.map((column) => (
                          <th
                            key={`head-${column.id}`}
                            className="min-w-40 px-2 py-1 text-left"
                          >
                            {column.label}
                          </th>
                        ))}
                        <th className="w-28 px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span>
                              {t("orders.detail.importModal.actionsColumn")}
                            </span>
                            <Checkbox
                              variant="box"
                              checked={allFilteredSelected}
                              onChange={() =>
                                setSelectedRowRefs((prev) =>
                                  allFilteredSelected
                                    ? prev.filter(
                                        (rowRef) =>
                                          !filteredRowRefs.includes(rowRef),
                                      )
                                    : Array.from(
                                        new Set([...prev, ...filteredRowRefs]),
                                      ),
                                )
                              }
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(
                        ({ row, rowIndex, hasName, isMismatch }) => (
                          <tr
                            key={`modal-preview-${row.source_row_ref}`}
                            className={
                              !hasName
                                ? "bg-destructive/5"
                                : isMismatch
                                  ? "bg-amber-50/60"
                                  : undefined
                            }
                          >
                            <td className="px-2 py-1 text-muted-foreground">
                              {rowIndex + 1}
                            </td>
                            {previewColumns.map((column) => (
                              <td
                                key={`cell-${row.source_row_ref}-${column.id}`}
                                className="min-w-40 px-2 py-1 align-top"
                              >
                                {column.editable === false ? (
                                  <div className="flex min-h-8 items-center rounded-md border border-input bg-muted/40 px-3 text-foreground">
                                    {String(row[column.draftKey] ?? "")}
                                  </div>
                                ) : (
                                  <Input
                                    value={String(row[column.draftKey] ?? "")}
                                    onChange={(event) =>
                                      setDraftRows((prev) => {
                                        const next = [...prev];
                                        if (!next[rowIndex]) return prev;
                                        next[rowIndex] = {
                                          ...next[rowIndex],
                                          [column.draftKey]: event.target.value,
                                        };
                                        return next;
                                      })
                                    }
                                    className="h-8 min-w-35"
                                  />
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right align-top">
                              <div className="flex items-center justify-end gap-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setDraftRows((prev) =>
                                      prev.filter(
                                        (_, index) => index !== rowIndex,
                                      ),
                                    )
                                  }
                                  aria-label={t(
                                    "orders.detail.importModal.removeRow",
                                  )}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                                <Checkbox
                                  variant="box"
                                  checked={selectedRowRefs.includes(
                                    row.source_row_ref,
                                  )}
                                  onChange={() =>
                                    setSelectedRowRefs((prev) =>
                                      prev.includes(row.source_row_ref)
                                        ? prev.filter(
                                            (rowRef) =>
                                              rowRef !== row.source_row_ref,
                                          )
                                        : [...prev, row.source_row_ref],
                                    )
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {step === "save" ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                  <div className="text-sm font-medium text-foreground">
                    {t("orders.detail.importModal.saveTemplateTitle")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("orders.detail.importModal.saveHint")}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                  <Input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder={t("orders.detail.importModal.profileName")}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onSaveProfile(false)}
                    disabled={
                      isSavingProfile ||
                      (headers.length === 0 && draftRows.length === 0)
                    }
                  >
                    {isSavingProfile ? (
                      <LoadingSpinner
                        label={t("orders.detail.importModal.savingProfile")}
                        className="gap-1.5"
                        labelClassName="text-inherit"
                        spinnerClassName="h-3.5 w-3.5 border-current border-t-transparent"
                      />
                    ) : (
                      t("orders.detail.importModal.saveTemplate")
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onSaveProfile(true)}
                    disabled={
                      isSavingProfile ||
                      (headers.length === 0 && draftRows.length === 0)
                    }
                  >
                    {isSavingProfile ? (
                      <LoadingSpinner
                        label={t("orders.detail.importModal.savingProfile")}
                        className="gap-1.5"
                        labelClassName="text-inherit"
                        spinnerClassName="h-3.5 w-3.5 border-current border-t-transparent"
                      />
                    ) : (
                      t("orders.detail.importModal.saveDefaultProfile")
                    )}
                  </Button>
                </div>
                {profileNotice ? (
                  <div className="text-xs text-muted-foreground">
                    {profileNotice}
                  </div>
                ) : null}
                {templates.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
                    <div className="text-sm font-medium text-foreground">
                      {t("orders.detail.importModal.savedTemplatesTitle")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("orders.detail.importModal.savedTemplatesHint")}
                    </div>
                    <div className="space-y-2">
                  {templates.map((template) => {
                        const isBusy = templateActionId === template.id;
                        return (
                          <div
                            key={`saved-template-${template.id}`}
                            className="flex flex-col gap-2 rounded-md border border-border/70 px-3 py-2 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="min-w-0">
                              {editingTemplateId === template.id ? (
                                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                  <Input
                                    value={editingTemplateName}
                                    onChange={(event) =>
                                      setEditingTemplateName(event.target.value)
                                    }
                                    className="h-8 md:w-80"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        isBusy ||
                                        editingTemplateName.trim().length === 0
                                      }
                                      onClick={async () => {
                                        await onRenameTemplate?.(
                                          template.id,
                                          editingTemplateName.trim(),
                                        );
                                        setEditingTemplateId(null);
                                        setEditingTemplateName("");
                                      }}
                                    >
                                      {t("orders.detail.importModal.renameTemplateSave")}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingTemplateId(null);
                                        setEditingTemplateName("");
                                      }}
                                    >
                                      {t("orders.detail.importModal.renameTemplateCancel")}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {template.name}
                                  </span>
                                  {template.isDefault ? (
                                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                      {t("orders.detail.importModal.defaultTemplateBadge")}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={isBusy || editingTemplateId === template.id}
                                onClick={() => {
                                  setEditingTemplateId(template.id);
                                  setEditingTemplateName(template.name);
                                }}
                              >
                                <PencilIcon className="h-4 w-4" />
                              </Button>
                              {!template.isDefault ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void onSetDefaultTemplate?.(template.id)
                                  }
                                >
                                  {t("orders.detail.importModal.setDefaultTemplate")}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                onClick={() =>
                                  void onDeleteTemplate?.(template.id)
                                }
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border bg-card px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (currentStepIndex <= 0) return;
                  setStep(visibleSteps[currentStepIndex - 1]);
                }}
                disabled={!canStepBack}
              >
                {t("profile.back")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (step === "source") {
                    if (!isMappingReady) return;
                    setStep(canJumpToReviewFromSource ? "review" : "mapping");
                    return;
                  }
                  if (step === "mapping") {
                    if (!isReviewReady) return;
                    setStep("review");
                    return;
                  }
                  if (step === "review") setStep("save");
                }}
                disabled={step === "save" || !canStepForward}
              >
                {t("orders.detail.importModal.next")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("profile.close")}
              </Button>
              <Button
                type="button"
                onClick={() => void onApplyImport()}
                disabled={
                  isApplyingImport ||
                  !canEditOrderInputs ||
                  draftRows.length === 0 ||
                  invalidRowCount > 0
                }
              >
                {isApplyingImport ? (
                  <LoadingSpinner
                    label={targetMeta.applyLabel}
                    className="gap-1.5"
                    labelClassName="text-primary-foreground"
                    spinnerClassName="h-3.5 w-3.5 border-primary-foreground border-t-transparent"
                  />
                ) : (
                  targetMeta.applyLabel
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
