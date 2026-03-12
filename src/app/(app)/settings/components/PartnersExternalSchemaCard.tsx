"use client";

import { Fragment, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { InputField } from "@/components/ui/InputField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import type {
  ExternalJobField,
  ExternalJobFieldRole,
  ExternalJobFieldScope,
  ExternalJobFieldType,
} from "@/types/orders";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OptionLike<T extends string = string> = {
  value: T;
  label: string;
};

type ExternalTableColumnSetting = {
  id: string;
  label?: string;
  visible: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type PartnersExternalSchemaCardProps = {
  t: TranslationFn;
  optionLabel: (group: string, value: string, fallback: string) => string;
  externalJobFields: ExternalJobField[];
  externalPricingEnabled: boolean;
  setExternalPricingEnabled: (value: boolean) => void;
  handleSaveExternalPricingSettings: () => Promise<void> | void;
  externalPricingState: SaveState;
  externalPricingMessage: string;
  externalJobFieldLabel: string;
  setExternalJobFieldLabel: (value: string) => void;
  externalJobFieldType: ExternalJobFieldType;
  setExternalJobFieldType: (value: ExternalJobFieldType) => void;
  externalJobFieldTypeOptions: OptionLike<ExternalJobFieldType>[];
  externalJobFieldScope: ExternalJobFieldScope;
  setExternalJobFieldScope: (value: ExternalJobFieldScope) => void;
  externalJobFieldScopeOptions: OptionLike<ExternalJobFieldScope>[];
  externalJobFieldRole: ExternalJobFieldRole;
  setExternalJobFieldRole: (value: ExternalJobFieldRole) => void;
  externalJobFieldRoleOptions: OptionLike<ExternalJobFieldRole>[];
  externalJobFieldSortOrder: number;
  setExternalJobFieldSortOrder: (value: number) => void;
  handleSaveExternalJobField: () => Promise<void> | void;
  editingExternalJobFieldId: string | null;
  resetExternalJobFieldForm: () => void;
  externalJobFieldUnit: string;
  setExternalJobFieldUnit: (value: string) => void;
  externalJobFieldOptions: string;
  setExternalJobFieldOptions: (value: string) => void;
  externalJobFieldAiAliases: string;
  setExternalJobFieldAiAliases: (value: string) => void;
  externalJobFieldRequired: boolean;
  setExternalJobFieldRequired: (value: boolean) => void;
  externalJobFieldActive: boolean;
  setExternalJobFieldActive: (value: boolean) => void;
  externalJobFieldShowInTable: boolean;
  setExternalJobFieldShowInTable: (value: boolean) => void;
  externalJobFieldAiEnabled: boolean;
  setExternalJobFieldAiEnabled: (value: boolean) => void;
  externalJobFieldAiMatchOnly: boolean;
  setExternalJobFieldAiMatchOnly: (value: boolean) => void;
  selectedExternalJobFieldIds: string[];
  setSelectedExternalJobFieldIds: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  handleSaveExternalTableColumns: () => Promise<void> | void;
  externalTableState: SaveState;
  handleDeleteSelectedExternalJobFields: () => Promise<void> | void;
  externalTableMessage: string;
  externalSchemaTableColumns: Array<{
    id: string;
    label: ReactNode;
    className?: string;
    widthClassName?: string;
    headerClassName?: string;
  }>;
  externalTableColumns: ExternalTableColumnSetting[];
  externalJobFieldById: Record<string, ExternalJobField>;
  externalTableColumnCatalogById: Record<string, { label: string }>;
  dragExternalTableColumnId: string | null;
  setDragExternalTableColumnId: (value: string | null) => void;
  externalTableDropIndex: number | null;
  setExternalTableDropIndex: (value: number | null) => void;
  setExternalTableColumns: Dispatch<
    SetStateAction<ExternalTableColumnSetting[]>
  >;
  reorderExternalTableColumns: (
    columns: ExternalTableColumnSetting[],
    draggedId: string,
    nextIndex: number,
  ) => ExternalTableColumnSetting[];
  handleEditExternalJobField: (fieldId: string) => void;
  handleCopyExternalJobField: (fieldId: string) => Promise<void> | void;
  handleDeleteExternalJobField: (fieldId: string) => Promise<void> | void;
};

export function PartnersExternalSchemaCard(
  props: PartnersExternalSchemaCardProps,
) {
  const {
    t,
    optionLabel,
    externalJobFields,
    externalPricingEnabled,
    setExternalPricingEnabled,
    handleSaveExternalPricingSettings,
    externalPricingState,
    externalPricingMessage,
    externalJobFieldLabel,
    setExternalJobFieldLabel,
    externalJobFieldType,
    setExternalJobFieldType,
    externalJobFieldTypeOptions,
    externalJobFieldScope,
    setExternalJobFieldScope,
    externalJobFieldScopeOptions,
    externalJobFieldRole,
    setExternalJobFieldRole,
    externalJobFieldRoleOptions,
    externalJobFieldSortOrder,
    setExternalJobFieldSortOrder,
    handleSaveExternalJobField,
    editingExternalJobFieldId,
    resetExternalJobFieldForm,
    externalJobFieldUnit,
    setExternalJobFieldUnit,
    externalJobFieldOptions,
    setExternalJobFieldOptions,
    externalJobFieldAiAliases,
    setExternalJobFieldAiAliases,
    externalJobFieldRequired,
    setExternalJobFieldRequired,
    externalJobFieldActive,
    setExternalJobFieldActive,
    externalJobFieldShowInTable,
    setExternalJobFieldShowInTable,
    externalJobFieldAiEnabled,
    setExternalJobFieldAiEnabled,
    externalJobFieldAiMatchOnly,
    setExternalJobFieldAiMatchOnly,
    selectedExternalJobFieldIds,
    setSelectedExternalJobFieldIds,
    handleSaveExternalTableColumns,
    externalTableState,
    handleDeleteSelectedExternalJobFields,
    externalTableMessage,
    externalSchemaTableColumns,
    externalTableColumns,
    externalJobFieldById,
    externalTableColumnCatalogById,
    dragExternalTableColumnId,
    setDragExternalTableColumnId,
    externalTableDropIndex,
    setExternalTableDropIndex,
    setExternalTableColumns,
    reorderExternalTableColumns,
    handleEditExternalJobField,
    handleCopyExternalJobField,
    handleDeleteExternalJobField,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.partners.externalSchemaTitle")}</CardTitle>
        <CardDescription>
          {t("settings.partners.externalSchemaDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {externalJobFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {t("settings.partners.noExternalFields")}
          </div>
        ) : null}

        <div className="text-sm text-muted-foreground">
          {t("settings.partners.externalFieldsHint")}
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={externalPricingEnabled}
                onChange={(event) =>
                  setExternalPricingEnabled(event.target.checked)
                }
              />
              {t("settings.partners.enablePriceReconciliation")}
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSaveExternalPricingSettings()}
                disabled={externalPricingState === "saving"}
              >
                {externalPricingState === "saving"
                  ? t("settings.users.saving")
                  : t("settings.partners.savePricing")}
              </Button>
              {externalPricingState !== "idle" && externalPricingMessage ? (
                <span
                  className={`text-xs ${
                    externalPricingState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {externalPricingMessage}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(140px,0.6fr)_minmax(190px,0.7fr)_minmax(190px,0.7fr)_minmax(120px,0.4fr)_auto] lg:items-end">
          <InputField
            label="Label"
            value={externalJobFieldLabel}
            onChange={(event) => setExternalJobFieldLabel(event.target.value)}
            placeholder="Unit price"
            className="h-10 text-sm"
          />
          <SelectField
            label="Type"
            value={externalJobFieldType}
            onValueChange={(value) => {
              const nextType = value as ExternalJobFieldType;
              setExternalJobFieldType(nextType);
              if (nextType !== "number") {
                setExternalJobFieldRole("none");
              }
            }}
          >
            <Select
              value={externalJobFieldType}
              onValueChange={(value) => {
                const nextType = value as ExternalJobFieldType;
                setExternalJobFieldType(nextType);
                if (nextType !== "number") {
                  setExternalJobFieldRole("none");
                }
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {externalJobFieldTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {optionLabel(
                      "externalFieldType",
                      option.value,
                      option.label,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            label="Scope"
            value={externalJobFieldScope}
            onValueChange={(value) =>
              setExternalJobFieldScope(value as ExternalJobFieldScope)
            }
          >
            <Select
              value={externalJobFieldScope}
              onValueChange={(value) =>
                setExternalJobFieldScope(value as ExternalJobFieldScope)
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {externalJobFieldScopeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {optionLabel(
                      "externalFieldScope",
                      option.value,
                      option.label,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            label="Role"
            value={externalJobFieldRole}
            onValueChange={(value) =>
              setExternalJobFieldRole(value as ExternalJobFieldRole)
            }
          >
            <Select
              value={externalJobFieldRole}
              onValueChange={(value) =>
                setExternalJobFieldRole(value as ExternalJobFieldRole)
              }
              disabled={externalJobFieldType !== "number"}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {externalJobFieldRoleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {optionLabel(
                      "externalFieldRole",
                      option.value,
                      option.label,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <InputField
            label="Order"
            type="number"
            value={externalJobFieldSortOrder}
            onChange={(event) =>
              setExternalJobFieldSortOrder(Number(event.target.value) || 0)
            }
            className="h-10 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => void handleSaveExternalJobField()}>
              {editingExternalJobFieldId ? "Save field" : "Add field"}
            </Button>
            {editingExternalJobFieldId ? (
              <Button variant="outline" onClick={resetExternalJobFieldForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <InputField
            label="Unit (optional)"
            value={externalJobFieldUnit}
            onChange={(event) => setExternalJobFieldUnit(event.target.value)}
            placeholder="EUR"
            className="h-10 text-sm"
          />
          <TextAreaField
            label="Select options (comma, newline, or backslash separated)"
            value={externalJobFieldOptions}
            onChange={(event) => setExternalJobFieldOptions(event.target.value)}
            disabled={externalJobFieldType !== "select"}
            placeholder="EUR, USD"
            className="min-h-20 disabled:opacity-50"
          />
          <TextAreaField
            label="AI aliases (comma, newline, or backslash separated)"
            value={externalJobFieldAiAliases}
            onChange={(event) => setExternalJobFieldAiAliases(event.target.value)}
            disabled={!externalJobFieldAiEnabled}
            placeholder="invoice no, invoice nr, contract number"
            className="min-h-20 disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={externalJobFieldRequired}
              onChange={(event) =>
                setExternalJobFieldRequired(event.target.checked)
              }
            />
            Required
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={externalJobFieldActive}
              onChange={(event) => setExternalJobFieldActive(event.target.checked)}
            />
            Active
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={externalJobFieldShowInTable}
              onChange={(event) =>
                setExternalJobFieldShowInTable(event.target.checked)
              }
            />
            In table
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={externalJobFieldAiEnabled}
              onChange={(event) => {
                const checked = event.target.checked;
                setExternalJobFieldAiEnabled(checked);
                if (!checked) {
                  setExternalJobFieldAiMatchOnly(false);
                }
              }}
            />
            AI extract
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={externalJobFieldAiMatchOnly}
              onChange={(event) =>
                setExternalJobFieldAiMatchOnly(event.target.checked)
              }
              disabled={!externalJobFieldAiEnabled}
            />
            AI match only
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {selectedExternalJobFieldIds.length > 0
              ? `${selectedExternalJobFieldIds.length} selected`
              : " "}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSaveExternalTableColumns()}
              disabled={externalTableState === "saving"}
            >
              {externalTableState === "saving"
                ? "Saving columns..."
                : "Save table columns"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleDeleteSelectedExternalJobFields()}
              disabled={selectedExternalJobFieldIds.length === 0}
            >
              {t("settings.common.removeSelected")}
            </Button>
          </div>
        </div>
        {externalTableState !== "idle" && externalTableMessage ? (
          <div
            className={`text-xs ${
              externalTableState === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {externalTableMessage}
          </div>
        ) : null}

        <DataTable
          mode="custom"
          columns={externalSchemaTableColumns}
          stickyFirstColumn
          wrapperClassName="overflow-x-auto overflow-y-hidden rounded-lg border border-border md:overflow-x-visible"
          tableClassName="w-full table-auto [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm md:[&_th]:px-4 md:[&_td]:px-4"
          customBody={
            <>
              {externalTableColumns.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    {t("settings.partners.noExternalTableColumns")}
                  </td>
                </tr>
              ) : (
                externalTableColumns.map((column, fullIndex) => {
                  const fieldId = column.id.startsWith("field.")
                    ? column.id.slice("field.".length)
                    : null;
                  const field = fieldId ? externalJobFieldById[fieldId] : null;
                  const catalogEntry = externalTableColumnCatalogById[column.id];
                  const defaultLabel =
                    catalogEntry?.label ?? field?.label ?? column.id;

                  return (
                    <Fragment key={`table-column-${column.id}`}>
                      <tr
                        className={`border-t border-border transition-all ${
                          externalTableDropIndex === fullIndex
                            ? "h-4 bg-primary/10"
                            : "h-0"
                        }`}
                      />
                      <tr
                        className={`border-t border-border ${
                          dragExternalTableColumnId === column.id
                            ? "bg-primary/5"
                            : "bg-background"
                        }`}
                        draggable
                        onDragStart={() => {
                          setDragExternalTableColumnId(column.id);
                          setExternalTableDropIndex(fullIndex);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          const before =
                            event.clientY < rect.top + rect.height / 2;
                          setExternalTableDropIndex(
                            before ? fullIndex : fullIndex + 1,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (
                            !dragExternalTableColumnId ||
                            externalTableDropIndex === null
                          ) {
                            return;
                          }
                          setExternalTableColumns((prev) =>
                            reorderExternalTableColumns(
                              prev,
                              dragExternalTableColumnId,
                              externalTableDropIndex,
                            ),
                          );
                          setDragExternalTableColumnId(null);
                          setExternalTableDropIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragExternalTableColumnId(null);
                          setExternalTableDropIndex(null);
                        }}
                      >
                        <td
                          className={`sticky left-0 z-10 min-w-25 px-3 py-2 md:min-w-35 md:px-4 ${
                            dragExternalTableColumnId === column.id
                              ? "bg-primary/5"
                              : "bg-background"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="cursor-grab text-muted-foreground"
                              aria-hidden
                            >
                              ::
                            </span>
                            <div className="min-w-25 flex-1 md:min-w-30">
                              <Input
                                value={column.label ?? ""}
                                onChange={(event) =>
                                  setExternalTableColumns((prev) =>
                                    prev.map((item) =>
                                      item.id === column.id
                                        ? {
                                            ...item,
                                            label: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder={defaultLabel}
                                className="h-8 w-full text-sm"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="min-w-30 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field
                            ? externalJobFieldTypeOptions.find(
                                (option) => option.value === field.fieldType,
                              )?.label ?? field.fieldType
                            : "System"}
                        </td>
                        <td className="min-w-32.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field
                            ? externalJobFieldScopeOptions.find(
                                (option) =>
                                  option.value === (field.scope ?? "manual"),
                              )?.label ?? "Manual entry"
                            : "External table"}
                        </td>
                        <td className="min-w-30 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field
                            ? externalJobFieldRoleOptions.find(
                                (option) =>
                                  option.value === (field.fieldRole ?? "none"),
                              )?.label ?? "None"
                            : "--"}
                        </td>
                        <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field ? field.unit || "--" : "--"}
                        </td>
                        <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {fullIndex}
                        </td>
                        <td className="min-w-22.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field ? (field.isRequired ? "Yes" : "No") : "--"}
                        </td>
                        <td className="min-w-20 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field ? (field.isActive ? "Yes" : "No") : "--"}
                        </td>
                        <td className="min-w-22.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          <Checkbox
                            checked={column.visible}
                            onChange={(event) =>
                              setExternalTableColumns((prev) =>
                                prev.map((item) =>
                                  item.id === column.id
                                    ? {
                                        ...item,
                                        visible: event.target.checked,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field ? (field.aiEnabled ? "Yes" : "No") : "--"}
                        </td>
                        <td className="min-w-27.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                          {field ? (field.aiMatchOnly ? "Yes" : "No") : "--"}
                        </td>
                        <td className="min-w-72.5 px-3 py-2 text-right md:min-w-0 md:px-4">
                          {field ? (
                            <div className="flex flex-nowrap items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                aria-label="Edit field"
                                title="Edit"
                                onClick={() => handleEditExternalJobField(field.id)}
                              >
                                <PencilIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                aria-label="Copy field"
                                title="Copy"
                                onClick={() => void handleCopyExternalJobField(field.id)}
                              >
                                <CopyIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                aria-label="Remove field"
                                title="Remove"
                                onClick={() => void handleDeleteExternalJobField(field.id)}
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                              <Checkbox
                                variant="box"
                                checked={selectedExternalJobFieldIds.includes(
                                  field.id,
                                )}
                                onChange={(event) => {
                                  setSelectedExternalJobFieldIds((prev) => {
                                    if (event.target.checked) {
                                      return [...prev, field.id];
                                    }
                                    return prev.filter((id) => id !== field.id);
                                  });
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {defaultLabel}
                            </span>
                          )}
                        </td>
                      </tr>
                      {fullIndex === externalTableColumns.length - 1 ? (
                        <tr
                          className={`border-t border-border transition-all ${
                            externalTableDropIndex === fullIndex + 1
                              ? "h-4 bg-primary/10"
                              : "h-0"
                          }`}
                        >
                          <td colSpan={12} className="p-0" />
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
