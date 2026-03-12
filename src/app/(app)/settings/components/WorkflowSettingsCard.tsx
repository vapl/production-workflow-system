"use client";

import type { Dispatch, SetStateAction } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SelectField } from "@/components/ui/SelectField";
import { TabsContent } from "@/components/ui/Tabs";
import type { UserRole } from "@/contexts/UserContext";
import {
  type ChecklistItem,
  type ProductionCompletionMode,
  type WorkflowRules,
  type WorkflowStatusColor,
  type WorkflowStatusConfig,
  type WorkflowTargetStatus,
} from "@/contexts/WorkflowContext";
import { getStatusBadgeColorClass } from "@/lib/domain/statusBadgeColor";
import type { ExternalJobStatus, OrderStatus } from "@/types/orders";
import type { WorkStation } from "@/types/workstation";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type SaveState = "idle" | "saving" | "saved" | "error";

type WorkflowOption<T extends string> = {
  value: T;
  label: string;
};

type StatusColorOption = {
  value: WorkflowStatusColor;
  label: string;
  swatchClass: string;
};

type AssignmentLabelDrafts = {
  engineer: string;
  manager: string;
};

type WorkflowSettingsCardProps = {
  t: TranslationFn;
  saveError: string | null;
  isLoadedFromDb: boolean;
  rules: WorkflowRules;
  setRules: (patch: Partial<WorkflowRules>) => void;
  displayStations: WorkStation[];
  workflowStatusOptions: WorkflowOption<OrderStatus>[];
  externalJobStatusOptions: WorkflowOption<ExternalJobStatus>[];
  statusColorOptions: StatusColorOption[];
  optionLabel: (group: string, value: string, fallback: string) => string;
  orderStatusConfigDrafts: Record<OrderStatus, WorkflowStatusConfig>;
  setOrderStatusConfigDrafts: Dispatch<
    SetStateAction<Record<OrderStatus, WorkflowStatusConfig>>
  >;
  requiredActiveOrderStatuses: OrderStatus[];
  hasStatusLabelChanges: boolean;
  handleSaveStatusLabels: () => Promise<void> | void;
  statusLabelState: SaveState;
  statusLabelMessage: string;
  externalJobStatusConfigDrafts: Record<
    ExternalJobStatus,
    WorkflowStatusConfig
  >;
  setExternalJobStatusConfigDrafts: Dispatch<
    SetStateAction<Record<ExternalJobStatus, WorkflowStatusConfig>>
  >;
  requiredActiveExternalStatuses: ExternalJobStatus[];
  hasExternalJobStatusLabelChanges: boolean;
  handleSaveExternalJobStatusLabels: () => Promise<void> | void;
  externalJobStatusLabelState: SaveState;
  externalJobStatusLabelMessage: string;
  assignmentLabelDrafts: AssignmentLabelDrafts;
  setAssignmentLabelDrafts: Dispatch<SetStateAction<AssignmentLabelDrafts>>;
  hasAssignmentLabelChanges: boolean;
  handleSaveAssignmentLabels: () => Promise<void> | void;
  assignmentLabelState: SaveState;
  assignmentLabelMessage: string;
  attachmentCategoryDrafts: WorkflowRules["attachmentCategories"];
  setAttachmentCategoryDrafts: Dispatch<
    SetStateAction<WorkflowRules["attachmentCategories"]>
  >;
  newAttachmentCategoryLabel: string;
  setNewAttachmentCategoryLabel: (value: string) => void;
  handleAddAttachmentCategory: () => Promise<void> | void;
  handleRemoveAttachmentCategory: (id: string) => Promise<void> | void;
  attachmentRoles: UserRole[];
  formatUserRoleLabel: (role: UserRole | string) => string;
  attachmentDefaultDrafts: WorkflowRules["attachmentCategoryDefaults"];
  setAttachmentDefaultDrafts: Dispatch<
    SetStateAction<WorkflowRules["attachmentCategoryDefaults"]>
  >;
  hasAttachmentCategoryChanges: boolean;
  handleSaveAttachmentCategories: () => Promise<void> | void;
  attachmentCategoryState: SaveState;
  attachmentCategoryMessage: string;
  isStationOrderSaving: boolean;
  newChecklistLabel: string;
  setNewChecklistLabel: (value: string) => void;
  newChecklistRequired: WorkflowTargetStatus[];
  setNewChecklistRequired: Dispatch<SetStateAction<WorkflowTargetStatus[]>>;
  addChecklistItem: (
    label: string,
    requiredFor: WorkflowTargetStatus[],
  ) => void;
  updateChecklistItem: (
    id: string,
    patch: Partial<Omit<ChecklistItem, "id">>,
  ) => void;
  removeChecklistItem: (id: string) => void;
  confirmRemove: (message: string) => Promise<boolean>;
  newReturnReason: string;
  setNewReturnReason: (value: string) => void;
  addReturnReason: (label: string) => void;
  removeReturnReason: (label: string) => void;
};

export function WorkflowSettingsCard(props: WorkflowSettingsCardProps) {
  const {
    t,
    saveError,
    isLoadedFromDb,
    rules,
    setRules,
    displayStations,
    workflowStatusOptions,
    externalJobStatusOptions,
    statusColorOptions,
    optionLabel,
    orderStatusConfigDrafts,
    setOrderStatusConfigDrafts,
    requiredActiveOrderStatuses,
    hasStatusLabelChanges,
    handleSaveStatusLabels,
    statusLabelState,
    statusLabelMessage,
    externalJobStatusConfigDrafts,
    setExternalJobStatusConfigDrafts,
    requiredActiveExternalStatuses,
    hasExternalJobStatusLabelChanges,
    handleSaveExternalJobStatusLabels,
    externalJobStatusLabelState,
    externalJobStatusLabelMessage,
    assignmentLabelDrafts,
    setAssignmentLabelDrafts,
    hasAssignmentLabelChanges,
    handleSaveAssignmentLabels,
    assignmentLabelState,
    assignmentLabelMessage,
    attachmentCategoryDrafts,
    setAttachmentCategoryDrafts,
    newAttachmentCategoryLabel,
    setNewAttachmentCategoryLabel,
    handleAddAttachmentCategory,
    handleRemoveAttachmentCategory,
    attachmentRoles,
    formatUserRoleLabel,
    attachmentDefaultDrafts,
    setAttachmentDefaultDrafts,
    hasAttachmentCategoryChanges,
    handleSaveAttachmentCategories,
    attachmentCategoryState,
    attachmentCategoryMessage,
    isStationOrderSaving,
    newChecklistLabel,
    setNewChecklistLabel,
    newChecklistRequired,
    setNewChecklistRequired,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    confirmRemove,
    newReturnReason,
    setNewReturnReason,
    addReturnReason,
    removeReturnReason,
  } = props;

  return (
    <TabsContent value="workflow">
      <Card>
    <CardHeader>
      <CardTitle>{t("settings.workflow.rulesTitle")}</CardTitle>
      <CardDescription>
        {t("settings.workflow.rulesDescription")}
      </CardDescription>
      {saveError ? (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      ) : null}
    </CardHeader>
    <CardContent className="space-y-6">
      {!isLoadedFromDb ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <LoadingSpinner label={t("settings.workflow.syncing")} />
        </div>
      ) : null}
      <div className="grid gap-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold">
            {t("settings.workflow.coreRules")}
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              {t("settings.workflow.minAttachmentsEngineering")}
              <Input
                type="number"
                min={0}
                value={rules.minAttachmentsForEngineering}
                onChange={(event) =>
                  setRules({
                    minAttachmentsForEngineering:
                      Number(event.target.value) || 0,
                  })
                }
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              {t("settings.workflow.minAttachmentsProduction")}
              <Input
                type="number"
                min={0}
                value={rules.minAttachmentsForProduction}
                onChange={(event) =>
                  setRules({
                    minAttachmentsForProduction:
                      Number(event.target.value) || 0,
                  })
                }
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              {t("settings.workflow.dueSoonThresholdDays")}
              <Input
                type="number"
                min={0}
                value={rules.dueSoonDays}
                onChange={(event) =>
                  setRules({
                    dueSoonDays: Math.max(
                      0,
                      Number(event.target.value) || 0,
                    ),
                  })
                }
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rules.requireCommentForEngineering}
                onChange={(event) =>
                  setRules({
                    requireCommentForEngineering: event.target.checked,
                  })
                }
              />
              {t("settings.workflow.requireCommentEngineering")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rules.requireCommentForProduction}
                onChange={(event) =>
                  setRules({
                    requireCommentForProduction: event.target.checked,
                  })
                }
              />
              {t("settings.workflow.requireCommentProduction")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rules.requireOrderInputsForEngineering}
                onChange={(event) =>
                  setRules({
                    requireOrderInputsForEngineering:
                      event.target.checked,
                  })
                }
              />
              {t("settings.workflow.requireOrderInputsEngineering")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rules.requireOrderInputsForProduction}
                onChange={(event) =>
                  setRules({
                    requireOrderInputsForProduction:
                      event.target.checked,
                  })
                }
              />
              {t("settings.workflow.requireOrderInputsProduction")}
            </label>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={rules.dueIndicatorEnabled}
                onChange={(event) =>
                  setRules({
                    dueIndicatorEnabled: event.target.checked,
                  })
                }
              />
              {t("settings.workflow.enableDueDateIndicators")}
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {workflowStatusOptions.map((option) => {
                const isChecked = rules.dueIndicatorStatuses.includes(
                  option.value,
                );
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={!rules.dueIndicatorEnabled}
                      onChange={(event) => {
                        setRules({
                          dueIndicatorStatuses: event.target.checked
                            ? [
                                ...rules.dueIndicatorStatuses,
                                option.value,
                              ]
                            : rules.dueIndicatorStatuses.filter(
                                (status) => status !== option.value,
                              ),
                        });
                      }}
                    />
                    {optionLabel(
                      "workflowStatus",
                      option.value,
                      option.label,
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold">
            {t("settings.workflow.productionCompletionTitle")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.workflow.productionCompletionDescription")}
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_1fr] lg:items-start">
            <label className="space-y-2 text-sm font-medium">
              {t("settings.workflow.productionCompletionMode")}
              <Select
                value={rules.productionCompletionConfig.mode}
                onValueChange={(value) => {
                  const mode = value as ProductionCompletionMode;
                  setRules({
                    productionCompletionConfig: {
                      ...rules.productionCompletionConfig,
                      mode,
                      completionStationIds:
                        mode === "all_items_done"
                          ? []
                          : rules.productionCompletionConfig
                              .completionStationIds,
                    },
                  });
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_items_done">
                    {t(
                      "settings.workflow.productionCompletionModeAllItems",
                    )}
                  </SelectItem>
                  <SelectItem value="completion_stations_done">
                    {t(
                      "settings.workflow.productionCompletionModeStations",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            {rules.productionCompletionConfig.mode ===
            "completion_stations_done" ? (
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {t(
                    "settings.workflow.productionCompletionStationsTitle",
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {displayStations.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t(
                        "settings.workflow.productionCompletionNoStations",
                      )}
                    </span>
                  ) : (
                    displayStations.map((station) => {
                      const isChecked =
                        rules.productionCompletionConfig.completionStationIds.includes(
                          station.id,
                        );
                      return (
                        <label
                          key={station.id}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            checked={isChecked}
                            onChange={(event) => {
                              const nextIds = event.target.checked
                                ? [
                                    ...rules.productionCompletionConfig
                                      .completionStationIds,
                                    station.id,
                                  ]
                                : rules.productionCompletionConfig.completionStationIds.filter(
                                    (id) => id !== station.id,
                                  );
                              setRules({
                                productionCompletionConfig: {
                                  ...rules.productionCompletionConfig,
                                  completionStationIds: nextIds,
                                },
                              });
                            }}
                          />
                          {station.name}
                        </label>
                      );
                    })
                  )}
                </div>
                {rules.productionCompletionConfig.completionStationIds
                  .length === 0 ? (
                  <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t(
                      "settings.workflow.productionCompletionSelectAtLeastOne",
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold">
              {t("settings.workflow.orderStatusConfiguration")}
            </div>
            <div className="mt-2 space-y-2">
              {workflowStatusOptions.map((option) => {
                const config = orderStatusConfigDrafts[option.value];
                const previewLabel =
                  config?.label?.trim() ||
                  optionLabel(
                    "workflowStatus",
                    option.value,
                    option.label,
                  );
                return (
                  <div
                    key={option.value}
                    className="rounded-lg border border-border bg-background/50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {optionLabel(
                          "workflowStatus",
                          option.value,
                          option.label,
                        )}
                      </div>
                      <span
                        className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                      >
                        {previewLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={
                          config?.label ??
                          optionLabel(
                            "workflowStatus",
                            option.value,
                            option.label,
                          )
                        }
                        onChange={(event) =>
                          setOrderStatusConfigDrafts((prev) => ({
                            ...prev,
                            [option.value]: {
                              ...prev[option.value],
                              label: event.target.value,
                            },
                          }))
                        }
                        className="h-9 min-w-45 flex-1 rounded-lg bg-input-background px-3 text-sm"
                      />
                      <Select
                        value={config?.color ?? "slate"}
                        onValueChange={(value) =>
                          setOrderStatusConfigDrafts((prev) => ({
                            ...prev,
                            [option.value]: {
                              ...prev[option.value],
                              color: value as WorkflowStatusColor,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-9 w-35 rounded-lg border border-border bg-input-background px-3 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusColorOptions.map((colorOption) => (
                            <SelectItem
                              key={colorOption.value}
                              value={colorOption.value}
                            >
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${colorOption.swatchClass}`}
                                />
                                {optionLabel(
                                  "statusColor",
                                  colorOption.value,
                                  colorOption.label,
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex min-w-27.5 items-center gap-2 text-sm">
                        {requiredActiveOrderStatuses.includes(
                          option.value,
                        ) ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Required for workflow transitions"
                          >
                            {t("settings.common.required")}
                          </span>
                        ) : null}
                        <Checkbox
                          checked={config?.isActive ?? true}
                          disabled={requiredActiveOrderStatuses.includes(
                            option.value,
                          )}
                          onChange={(event) =>
                            setOrderStatusConfigDrafts((prev) => ({
                              ...prev,
                              [option.value]: {
                                ...prev[option.value],
                                isActive: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{t("settings.common.active")}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setOrderStatusConfigDrafts(rules.orderStatusConfig)
                }
                disabled={!hasStatusLabelChanges}
              >
                {t("settings.workflow.reset")}
              </Button>
              <Button
                onClick={handleSaveStatusLabels}
                disabled={
                  !hasStatusLabelChanges ||
                  statusLabelState === "saving"
                }
              >
                {statusLabelState === "saving"
                  ? t("settings.users.saving")
                  : t("settings.workflow.saveOrderStatuses")}
              </Button>
              {statusLabelState !== "idle" && statusLabelMessage && (
                <span
                  className={`text-xs ${
                    statusLabelState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {statusLabelMessage}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold">
              {t("settings.workflow.externalJobStatusConfiguration")}
            </div>
            <div className="mt-2 space-y-2">
              {externalJobStatusOptions.map((option) => {
                const config =
                  externalJobStatusConfigDrafts[option.value];
                const previewLabel =
                  config?.label?.trim() ||
                  optionLabel(
                    "externalJobStatus",
                    option.value,
                    option.label,
                  );
                return (
                  <div
                    key={option.value}
                    className="rounded-lg border border-border bg-background/50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {optionLabel(
                          "externalJobStatus",
                          option.value,
                          option.label,
                        )}
                      </div>
                      <span
                        className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                      >
                        {previewLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={
                          config?.label ??
                          optionLabel(
                            "externalJobStatus",
                            option.value,
                            option.label,
                          )
                        }
                        onChange={(event) =>
                          setExternalJobStatusConfigDrafts((prev) => ({
                            ...prev,
                            [option.value]: {
                              ...prev[option.value],
                              label: event.target.value,
                            },
                          }))
                        }
                        className="h-9 min-w-45 flex-1 rounded-lg bg-input-background px-3 text-sm"
                      />
                      <Select
                        value={config?.color ?? "slate"}
                        onValueChange={(value) =>
                          setExternalJobStatusConfigDrafts((prev) => ({
                            ...prev,
                            [option.value]: {
                              ...prev[option.value],
                              color: value as WorkflowStatusColor,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-9 w-35 rounded-lg border border-border bg-input-background px-3 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusColorOptions.map((colorOption) => (
                            <SelectItem
                              key={colorOption.value}
                              value={colorOption.value}
                            >
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${colorOption.swatchClass}`}
                                />
                                {optionLabel(
                                  "statusColor",
                                  colorOption.value,
                                  colorOption.label,
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex min-w-27.5 items-center gap-2 text-sm">
                        {requiredActiveExternalStatuses.includes(
                          option.value,
                        ) ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Required for external job lifecycle"
                          >
                            {t("settings.common.required")}
                          </span>
                        ) : null}
                        <Checkbox
                          checked={config?.isActive ?? true}
                          disabled={requiredActiveExternalStatuses.includes(
                            option.value,
                          )}
                          onChange={(event) =>
                            setExternalJobStatusConfigDrafts(
                              (prev) => ({
                                ...prev,
                                [option.value]: {
                                  ...prev[option.value],
                                  isActive: event.target.checked,
                                },
                              }),
                            )
                          }
                        />
                        <span>{t("settings.common.active")}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setExternalJobStatusConfigDrafts(
                    rules.externalJobStatusConfig,
                  )
                }
                disabled={!hasExternalJobStatusLabelChanges}
              >
                {t("settings.workflow.reset")}
              </Button>
              <Button
                onClick={handleSaveExternalJobStatusLabels}
                disabled={
                  !hasExternalJobStatusLabelChanges ||
                  externalJobStatusLabelState === "saving"
                }
              >
                {externalJobStatusLabelState === "saving"
                  ? t("settings.users.saving")
                  : t("settings.workflow.saveExternalStatuses")}
              </Button>
              {externalJobStatusLabelState !== "idle" &&
                externalJobStatusLabelMessage && (
                  <span
                    className={`text-xs ${
                      externalJobStatusLabelState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {externalJobStatusLabelMessage}
                  </span>
                )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold">
              {t("settings.workflow.assignmentLabels")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.workflow.assignmentLabelsDescription")}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                {t("settings.workflow.engineerRoleLabel")}
                <Input
                  value={assignmentLabelDrafts.engineer}
                  onChange={(event) =>
                    setAssignmentLabelDrafts((prev) => ({
                      ...prev,
                      engineer: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                {t("settings.workflow.managerRoleLabel")}
                <Input
                  value={assignmentLabelDrafts.manager}
                  onChange={(event) =>
                    setAssignmentLabelDrafts((prev) => ({
                      ...prev,
                      manager: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setAssignmentLabelDrafts({
                    engineer:
                      rules.assignmentLabels?.engineer ?? "Engineer",
                    manager:
                      rules.assignmentLabels?.manager ?? "Manager",
                  })
                }
                disabled={!hasAssignmentLabelChanges}
              >
                {t("settings.workflow.reset")}
              </Button>
              <Button
                onClick={handleSaveAssignmentLabels}
                disabled={
                  !hasAssignmentLabelChanges ||
                  assignmentLabelState === "saving"
                }
              >
                {assignmentLabelState === "saving"
                  ? t("settings.users.saving")
                  : t("settings.workflow.saveAssignmentRoleLabels")}
              </Button>
              {assignmentLabelState !== "idle" &&
                assignmentLabelMessage && (
                  <span
                    className={`text-xs ${
                      assignmentLabelState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {assignmentLabelMessage}
                  </span>
                )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold">
            {t("settings.workflow.attachments")}
          </div>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm font-medium">
                {t("settings.workflow.attachmentCategories")}
              </div>
              <div className="grid gap-3">
                {attachmentCategoryDrafts.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3"
                  >
                    <Input
                      value={category.label}
                      onChange={(event) =>
                        setAttachmentCategoryDrafts((prev) =>
                          prev.map((item) =>
                            item.id === category.id
                              ? {
                                  ...item,
                                  label: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                      <Checkbox
                        checked={Boolean(category.aiParseEnabled)}
                        onChange={(event) =>
                          setAttachmentCategoryDrafts((prev) =>
                            prev.map((item) =>
                              item.id === category.id
                                ? {
                                    ...item,
                                    aiParseEnabled:
                                      event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      {t("settings.workflow.useForAiParsing")}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleRemoveAttachmentCategory(category.id)
                      }
                      disabled={attachmentCategoryDrafts.length <= 1}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newAttachmentCategoryLabel}
                  onChange={(event) =>
                    setNewAttachmentCategoryLabel(event.target.value)
                  }
                  placeholder={t(
                    "settings.workflow.addCategoryPlaceholder",
                  )}
                  className="h-10 min-w-50 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
                <Button onClick={handleAddAttachmentCategory}>
                  {t("settings.workflow.addCategory")}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium">
                {t("settings.workflow.defaultCategoryByRole")}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {attachmentRoles.map((role) => (
                  <SelectField
                    key={role}
                    label={formatUserRoleLabel(role)}
                    value={
                      attachmentDefaultDrafts[role] ??
                      attachmentCategoryDrafts[0]?.id ??
                      ""
                    }
                    onValueChange={(value) =>
                      setAttachmentDefaultDrafts((prev) => ({
                        ...prev,
                        [role]: value,
                      }))
                    }
                  >
                    <Select
                      value={
                        attachmentDefaultDrafts[role] ??
                        attachmentCategoryDrafts[0]?.id ??
                        ""
                      }
                      onValueChange={(value) =>
                        setAttachmentDefaultDrafts((prev) => ({
                          ...prev,
                          [role]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {attachmentCategoryDrafts.map((category) => (
                          <SelectItem
                            key={category.id}
                            value={category.id}
                          >
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.workflow.newUploadsHint")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.workflow.aiParsingHint")}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAttachmentCategoryDrafts(rules.attachmentCategories);
                setAttachmentDefaultDrafts(
                  rules.attachmentCategoryDefaults,
                );
              }}
              disabled={!hasAttachmentCategoryChanges}
            >
              {t("settings.workflow.reset")}
            </Button>
            <Button
              onClick={handleSaveAttachmentCategories}
              disabled={
                !hasAttachmentCategoryChanges ||
                attachmentCategoryState === "saving"
              }
            >
              {attachmentCategoryState === "saving"
                ? t("settings.users.saving")
                : t("settings.workflow.saveAttachmentCategories")}
            </Button>
            {attachmentCategoryState !== "idle" &&
              attachmentCategoryMessage && (
                <span
                  className={`text-xs ${
                    attachmentCategoryState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {attachmentCategoryMessage}
                </span>
              )}
          </div>
        </div>

        {isStationOrderSaving ? (
          <div className="text-xs text-muted-foreground">
            {t("settings.workflow.savingStationOrder")}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold">
            {t("settings.workflow.checklistItems")}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Input
                value={newChecklistLabel}
                onChange={(event) =>
                  setNewChecklistLabel(event.target.value)
                }
                placeholder={t(
                  "settings.workflow.checklistItemPlaceholder",
                )}
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
              <Button
                onClick={() => {
                  addChecklistItem(
                    newChecklistLabel,
                    newChecklistRequired,
                  );
                  setNewChecklistLabel("");
                }}
              >
                {t("settings.workflow.addItem")}
              </Button>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={newChecklistRequired.includes(
                      "ready_for_engineering",
                    )}
                    onChange={(event) => {
                      setNewChecklistRequired((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) {
                          next.add("ready_for_engineering");
                        } else {
                          next.delete("ready_for_engineering");
                        }
                        return Array.from(next);
                      });
                    }}
                  />
                  {t("settings.workflow.requiredForEngineering")}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      newChecklistRequired.includes(
                        "ready_for_production",
                      ) ||
                      newChecklistRequired.includes("in_production")
                    }
                    onChange={(event) => {
                      setNewChecklistRequired((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) {
                          next.add("ready_for_production");
                        } else {
                          next.delete("ready_for_production");
                        }
                        return Array.from(next);
                      });
                    }}
                  />
                  {t("settings.workflow.requiredForProduction")}
                </label>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {rules.checklistItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <div className="font-medium">{item.label}</div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={item.requiredFor.includes(
                        "ready_for_engineering",
                      )}
                      onChange={(event) => {
                        const next = new Set(item.requiredFor);
                        if (event.target.checked) {
                          next.add("ready_for_engineering");
                        } else {
                          next.delete("ready_for_engineering");
                        }
                        updateChecklistItem(item.id, {
                          requiredFor: Array.from(next),
                        });
                      }}
                    />
                    {t("settings.workflow.engineeringShort")}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={
                        item.requiredFor.includes(
                          "ready_for_production",
                        ) || item.requiredFor.includes("in_production")
                      }
                      onChange={(event) => {
                        const next = new Set(item.requiredFor);
                        if (event.target.checked) {
                          next.add("ready_for_production");
                        } else {
                          next.delete("ready_for_production");
                        }
                        updateChecklistItem(item.id, {
                          requiredFor: Array.from(next),
                        });
                      }}
                    />
                    {t("settings.workflow.productionShort")}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={item.isActive}
                      onChange={(event) =>
                        updateChecklistItem(item.id, {
                          isActive: event.target.checked,
                        })
                      }
                    />
                    {t("settings.common.active")}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (
                        !(await confirmRemove(
                          t(
                            "settings.workflow.removeChecklistConfirm",
                            {
                              label: item.label,
                            },
                          ),
                        ))
                      ) {
                        return;
                      }
                      removeChecklistItem(item.id);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {rules.checklistItems.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {t("settings.workflow.noChecklistItems")}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-1">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold">
              {t("settings.workflow.returnReasons")}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={newReturnReason}
                onChange={(event) =>
                  setNewReturnReason(event.target.value)
                }
                placeholder={t(
                  "settings.workflow.addReasonPlaceholder",
                )}
                className="h-10 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
              <Button
                onClick={() => {
                  addReturnReason(newReturnReason);
                  setNewReturnReason("");
                }}
              >
                {t("settings.workflow.addReason")}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {rules.returnReasons.map((reason) => (
                <div
                  key={reason}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm"
                >
                  <span>{reason}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (
                        !(await confirmRemove(
                          t("settings.workflow.removeReasonConfirm", {
                            reason,
                          }),
                        ))
                      ) {
                        return;
                      }
                      removeReturnReason(reason);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {rules.returnReasons.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  {t("settings.workflow.noReturnReasons")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
    </TabsContent>
  );
}

