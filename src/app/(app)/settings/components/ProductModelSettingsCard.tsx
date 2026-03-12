"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { InputField } from "@/components/ui/InputField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { TextAreaField } from "@/components/ui/TextAreaField";
import {
  erpCoreConstructionColumnKeys,
  inferConstructionSemanticKey,
} from "@/lib/domain/constructionSchema";
import type {
  OrderInputField,
  OrderInputFieldType,
  OrderInputTableColumn,
} from "@/types/orderInputs";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OptionLike = {
  value: string;
  label: string;
};

type ProductModelSettingsCardProps = {
  t: TranslationFn;
  optionLabel: (group: string, value: string, fallback: string) => string;
  orderInputFieldTypeOptions: OptionLike[];
  constructionAttributeTypeOptions: OptionLike[];
  primaryConstructionTableField: OrderInputField | null;
  constructionAttributeFields: OrderInputField[];
  handleCreateConstructionTable: () => Promise<void> | void;
  ensureDefaultOrderInputFields: () => Promise<void> | void;
  updatePrimaryConstructionColumns: (
    nextColumns: OrderInputTableColumn[],
  ) => Promise<void> | void;
  handleDropConstructionColumn: () => Promise<void> | void;
  startInlineConstructionColumnEdit: (columnKey: string, label: string) => void;
  handleSaveInlineConstructionColumn: () => Promise<void> | void;
  cancelInlineConstructionColumnEdit: () => void;
  editingConstructionColumnKey: string | null;
  inlineConstructionColumnLabel: string;
  setInlineConstructionColumnLabel: (value: string) => void;
  draggedConstructionColumnKey: string | null;
  setDraggedConstructionColumnKey: (value: string | null) => void;
  constructionColumnDropIndex: number | null;
  setConstructionColumnDropIndex: (value: number | null) => void;
  getConstructionColumnDisplayLabel: (
    column: OrderInputTableColumn,
    semanticKey: ReturnType<typeof inferConstructionSemanticKey>,
  ) => string;
  getConstructionColumnHelperText: (
    column: OrderInputTableColumn,
    semanticKey: ReturnType<typeof inferConstructionSemanticKey>,
  ) => string;
  handleDropConstructionAttribute: () => Promise<void> | void;
  draggedConstructionFieldId: string | null;
  setDraggedConstructionFieldId: (value: string | null) => void;
  constructionFieldDropIndex: number | null;
  setConstructionFieldDropIndex: (value: number | null) => void;
  editingOrderFieldId: string | null;
  handleEditOrderField: (fieldId: string) => void;
  handleCopyOrderField: (fieldId: string) => void;
  handleDeleteOrderField: (fieldId: string) => void;
  updateOrderInputField: (
    fieldId: string,
    patch: Partial<Omit<OrderInputField, "id">>,
  ) => Promise<void> | void;
  orderFieldLabel: string;
  setOrderFieldLabel: (value: string) => void;
  orderFieldType: OrderInputFieldType;
  setOrderFieldType: (value: OrderInputFieldType) => void;
  orderFieldRequired: boolean;
  setOrderFieldRequired: (value: boolean) => void;
  orderFieldShowInTable: boolean;
  setOrderFieldShowInTable: (value: boolean) => void;
  orderFieldActive: boolean;
  setOrderFieldActive: (value: boolean) => void;
  orderFieldShowInProduction: boolean;
  setOrderFieldShowInProduction: (value: boolean) => void;
  orderFieldUseInBomTable: boolean;
  setOrderFieldUseInBomTable: (value: boolean) => void;
  handleSaveConstructionAttribute: () => Promise<void> | void;
  resetOrderFieldForm: () => void;
  orderFieldUnit: string;
  setOrderFieldUnit: (value: string) => void;
  orderFieldOptions: string;
  setOrderFieldOptions: (value: string) => void;
};

export function ProductModelSettingsCard(props: ProductModelSettingsCardProps) {
  const stickyGapPx = 48;
  const showAdvancedUnitFields = false;

  const {
    t,
    optionLabel,
    orderInputFieldTypeOptions,
    constructionAttributeTypeOptions,
    primaryConstructionTableField,
    constructionAttributeFields,
    handleCreateConstructionTable,
    ensureDefaultOrderInputFields,
    updatePrimaryConstructionColumns,
    handleDropConstructionColumn,
    startInlineConstructionColumnEdit,
    handleSaveInlineConstructionColumn,
    cancelInlineConstructionColumnEdit,
    editingConstructionColumnKey,
    inlineConstructionColumnLabel,
    setInlineConstructionColumnLabel,
    draggedConstructionColumnKey,
    setDraggedConstructionColumnKey,
    constructionColumnDropIndex,
    setConstructionColumnDropIndex,
    getConstructionColumnDisplayLabel,
    getConstructionColumnHelperText,
    handleDropConstructionAttribute,
    draggedConstructionFieldId,
    setDraggedConstructionFieldId,
    constructionFieldDropIndex,
    setConstructionFieldDropIndex,
    editingOrderFieldId,
    handleEditOrderField,
    handleCopyOrderField,
    handleDeleteOrderField,
    updateOrderInputField,
    orderFieldLabel,
    setOrderFieldLabel,
    orderFieldType,
    setOrderFieldType,
    orderFieldRequired,
    setOrderFieldRequired,
    orderFieldShowInTable,
    setOrderFieldShowInTable,
    orderFieldActive,
    setOrderFieldActive,
    orderFieldShowInProduction,
    setOrderFieldShowInProduction,
    orderFieldUseInBomTable,
    setOrderFieldUseInBomTable,
    handleSaveConstructionAttribute,
    resetOrderFieldForm,
    orderFieldUnit,
    setOrderFieldUnit,
    orderFieldOptions,
    setOrderFieldOptions,
  } = props;

  const stickyContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTopPx, setStickyTopPx] = useState(240);
  const [isTablePinned, setIsTablePinned] = useState(false);

  useEffect(() => {
    const stickyHeader = document.querySelector<HTMLElement>(
      ".settings-sticky-header",
    );
    const stickyContainer = stickyContainerRef.current;

    if (!stickyHeader || !stickyContainer) {
      return;
    }

    const updateStickyLayout = () => {
      const nextStickyTop = 64 + stickyHeader.offsetHeight + stickyGapPx;
      setStickyTopPx(nextStickyTop);
      setIsTablePinned(
        window.innerWidth >= 768 &&
          stickyContainer.getBoundingClientRect().top <= nextStickyTop,
      );
    };

    updateStickyLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateStickyLayout();
    });

    resizeObserver.observe(stickyHeader);
    window.addEventListener("scroll", updateStickyLayout, { passive: true });
    window.addEventListener("resize", updateStickyLayout);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateStickyLayout);
      window.removeEventListener("resize", updateStickyLayout);
    };
  }, [stickyGapPx]);

  const stickyStyle = {
    top: `${stickyTopPx}px`,
  };

  const tableScrollStyle = isTablePinned
    ? {
        maxHeight: `calc(100vh - ${stickyTopPx}px - ${stickyGapPx}px)`,
      }
    : undefined;
  const visiblePrimaryColumns = (primaryConstructionTableField?.columns ?? []).filter(
    (column) =>
      showAdvancedUnitFields ||
      !erpCoreConstructionColumnKeys.has(column.key.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.orderInputs.title")}</CardTitle>
        <CardDescription>
          {t("settings.orderInputs.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {primaryConstructionTableField === null && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {t("settings.orderInputs.empty")}
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateConstructionTable}
                >
                  {t("settings.orderInputs.createConstructionTable")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void ensureDefaultOrderInputFields();
                    void handleCreateConstructionTable();
                  }}
                >
                  {t("settings.orderInputs.addDefaultFields")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div ref={stickyContainerRef} className="md:sticky" style={stickyStyle}>
          <div className="overflow-hidden rounded-lg border border-border">
            <div
              className={`scrollbar-hidden overflow-x-auto ${
                isTablePinned ? "md:overflow-y-auto" : "md:overflow-y-visible"
              }`}
              style={tableScrollStyle}
            >
              <table className="min-w-190 w-full table-fixed text-sm [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top">
                <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground">
                  <tr>
                    <th className="w-12 px-2 py-2 text-left font-medium">
                      <span className="sr-only">Drag</span>
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.orderInputs.label")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.orderInputs.type")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.common.required")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.orderInputs.inTable")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.common.active")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.orderInputs.production")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("settings.orderInputs.bom")}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("settings.common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {primaryConstructionTableField ? (
                    <>
                      <tr className="border-t border-border bg-muted/20">
                        <td
                          colSpan={9}
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {t("settings.orderInputs.coreColumnsTitle")}
                        </td>
                      </tr>
                      {visiblePrimaryColumns.map(
                        (column, rowIndex) => {
                          const semanticKey =
                            inferConstructionSemanticKey(column);
                          const isInlineEditing =
                            editingConstructionColumnKey === column.key;
                          const showErpDivider =
                            showAdvancedUnitFields &&
                            rowIndex > 0 &&
                            erpCoreConstructionColumnKeys.has(
                              column.key.toLowerCase(),
                            ) &&
                            !erpCoreConstructionColumnKeys.has(
                              (visiblePrimaryColumns[
                                rowIndex - 1
                              ]?.key ?? "").toLowerCase(),
                            );
                          return (
                            <Fragment key={column.key}>
                              {showErpDivider ? (
                                <tr className="border-t border-border bg-muted/10">
                                  <td
                                    colSpan={9}
                                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                  >
                                    {t("settings.orderInputs.advancedColumnsTitle")}
                                  </td>
                                </tr>
                              ) : null}
                              <tr
                                className={`border-t border-border transition-all ${
                                  constructionColumnDropIndex === rowIndex &&
                                  draggedConstructionColumnKey
                                    ? "h-4 bg-primary/10"
                                    : "h-0"
                                }`}
                              />
                              <tr
                                className={`border-t border-border ${
                                  draggedConstructionColumnKey === column.key
                                    ? "bg-primary/5"
                                    : "bg-background"
                                }`}
                                draggable={!isInlineEditing}
                                onDragStart={() => {
                                  setDraggedConstructionColumnKey(column.key);
                                  setConstructionColumnDropIndex(rowIndex);
                                }}
                                onDragOver={(event) => {
                                  if (!draggedConstructionColumnKey) {
                                    return;
                                  }
                                  event.preventDefault();
                                  const rect =
                                    event.currentTarget.getBoundingClientRect();
                                  const before =
                                    event.clientY < rect.top + rect.height / 2;
                                  setConstructionColumnDropIndex(
                                    before ? rowIndex : rowIndex + 1,
                                  );
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  void handleDropConstructionColumn();
                                }}
                                onDragEnd={() => {
                                  setDraggedConstructionColumnKey(null);
                                  setConstructionColumnDropIndex(null);
                                }}
                              >
                                <td className="px-2 py-2 align-middle text-muted-foreground">
                                  <span
                                    className="cursor-grab select-none"
                                    aria-hidden
                                  >
                                    ::
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  {isInlineEditing ? (
                                    <Input
                                      value={inlineConstructionColumnLabel}
                                      onChange={(event) =>
                                        setInlineConstructionColumnLabel(
                                          event.target.value,
                                        )
                                      }
                                      className="h-9 text-sm"
                                    />
                                  ) : (
                                    <div className="font-medium">
                                      {getConstructionColumnDisplayLabel(
                                        column,
                                        semanticKey,
                                      )}
                                    </div>
                                  )}
                                  <div className="text-xs text-muted-foreground">
                                    {getConstructionColumnHelperText(
                                      column,
                                      semanticKey,
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  {orderInputFieldTypeOptions.find(
                                    (option) =>
                                      option.value === column.fieldType,
                                  )?.label ?? column.fieldType}
                                </td>
                                <td className="px-4 py-2">
                                  <Checkbox
                                    variant="toggle"
                                    checked={column.isRequired ?? false}
                                    onChange={(event) => {
                                      const nextColumns = (
                                        primaryConstructionTableField.columns ??
                                        []
                                      ).map((currentColumn) =>
                                        currentColumn.key === column.key
                                          ? {
                                              ...currentColumn,
                                              isRequired: event.target.checked,
                                            }
                                          : currentColumn,
                                      );
                                      void updatePrimaryConstructionColumns(
                                        nextColumns,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <Checkbox
                                    variant="toggle"
                                    checked={column.showInTable ?? true}
                                    onChange={(event) => {
                                      const nextColumns = (
                                        primaryConstructionTableField.columns ??
                                        []
                                      ).map((currentColumn) =>
                                        currentColumn.key === column.key
                                          ? {
                                              ...currentColumn,
                                              showInTable: event.target.checked,
                                            }
                                          : currentColumn,
                                      );
                                      void updatePrimaryConstructionColumns(
                                        nextColumns,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <Checkbox
                                    variant="toggle"
                                    checked={column.isActive ?? true}
                                    onChange={(event) => {
                                      const nextColumns = (
                                        primaryConstructionTableField.columns ??
                                        []
                                      ).map((currentColumn) =>
                                        currentColumn.key === column.key
                                          ? {
                                              ...currentColumn,
                                              isActive: event.target.checked,
                                            }
                                          : currentColumn,
                                      );
                                      void updatePrimaryConstructionColumns(
                                        nextColumns,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <Checkbox
                                    variant="toggle"
                                    checked={column.showInProduction ?? true}
                                    onChange={(event) => {
                                      const nextColumns = (
                                        primaryConstructionTableField.columns ??
                                        []
                                      ).map((currentColumn) =>
                                        currentColumn.key === column.key
                                          ? {
                                              ...currentColumn,
                                              showInProduction:
                                                event.target.checked,
                                            }
                                          : currentColumn,
                                      );
                                      void updatePrimaryConstructionColumns(
                                        nextColumns,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <Checkbox
                                    variant="toggle"
                                    checked={column.useInBomTable ?? false}
                                    onChange={(event) => {
                                      const nextColumns = (
                                        primaryConstructionTableField.columns ??
                                        []
                                      ).map((currentColumn) =>
                                        currentColumn.key === column.key
                                          ? {
                                              ...currentColumn,
                                              useInBomTable:
                                                event.target.checked,
                                            }
                                          : currentColumn,
                                      );
                                      void updatePrimaryConstructionColumns(
                                        nextColumns,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex justify-end gap-2">
                                    {isInlineEditing ? (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            void handleSaveInlineConstructionColumn()
                                          }
                                          disabled={
                                            !inlineConstructionColumnLabel.trim()
                                          }
                                        >
                                          {t("settings.orderFields.saveField")}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={
                                            cancelInlineConstructionColumnEdit
                                          }
                                        >
                                          {t("settings.common.cancel")}
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          startInlineConstructionColumnEdit(
                                            column.key,
                                            column.label,
                                          )
                                        }
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            </Fragment>
                          );
                        },
                      )}
                      <tr
                        className={`border-t border-border transition-all ${
                          constructionColumnDropIndex ===
                            visiblePrimaryColumns.length &&
                          draggedConstructionColumnKey
                            ? "h-4 bg-primary/10"
                            : "h-0"
                        }`}
                      />
                    </>
                  ) : null}
                  <tr className="border-t border-border bg-muted/20">
                    <td
                      colSpan={9}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {t("settings.orderInputs.customFieldsTitle")}
                    </td>
                  </tr>
                  {constructionAttributeFields.map((field, rowIndex) => (
                    <Fragment key={field.id}>
                      <tr
                        className={`border-t border-border transition-all ${
                          constructionFieldDropIndex === rowIndex &&
                          draggedConstructionFieldId
                            ? "h-4 bg-primary/10"
                            : "h-0"
                        }`}
                      />
                      <tr
                        className={`border-t border-border ${
                          draggedConstructionFieldId === field.id
                            ? "bg-primary/5"
                            : "bg-background"
                        }`}
                        draggable={editingOrderFieldId !== field.id}
                        onDragStart={() => {
                          setDraggedConstructionFieldId(field.id);
                          setConstructionFieldDropIndex(rowIndex);
                        }}
                        onDragOver={(event) => {
                          if (!draggedConstructionFieldId) {
                            return;
                          }
                          event.preventDefault();
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          const before =
                            event.clientY < rect.top + rect.height / 2;
                          setConstructionFieldDropIndex(
                            before ? rowIndex : rowIndex + 1,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void handleDropConstructionAttribute();
                        }}
                        onDragEnd={() => {
                          setDraggedConstructionFieldId(null);
                          setConstructionFieldDropIndex(null);
                        }}
                      >
                        <td className="px-2 py-2 align-middle text-muted-foreground">
                          <span className="cursor-grab select-none" aria-hidden>
                            ::
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{field.label}</div>
                          {field.unit ? (
                            <div className="text-xs text-muted-foreground">
                              {field.unit}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {orderInputFieldTypeOptions.find(
                            (option) => option.value === field.fieldType,
                          )?.label ?? field.fieldType}
                        </td>
                        <td className="px-4 py-2">
                          <Checkbox
                            variant="toggle"
                            checked={field.isRequired}
                            onChange={(event) =>
                              updateOrderInputField(field.id, {
                                isRequired: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Checkbox
                            variant="toggle"
                            checked={field.showInTable ?? true}
                            onChange={(event) =>
                              updateOrderInputField(field.id, {
                                showInTable: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Checkbox
                            variant="toggle"
                            checked={field.isActive}
                            onChange={(event) =>
                              updateOrderInputField(field.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Checkbox
                            variant="toggle"
                            checked={field.showInProduction ?? false}
                            onChange={(event) =>
                              updateOrderInputField(field.id, {
                                showInProduction: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Checkbox
                            variant="toggle"
                            checked={field.useInBomTable ?? false}
                            onChange={(event) =>
                              updateOrderInputField(field.id, {
                                useInBomTable: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditOrderField(field.id)}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyOrderField(field.id)}
                            >
                              <CopyIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteOrderField(field.id)}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr
                    className={`border-t border-border transition-all ${
                      constructionFieldDropIndex ===
                        constructionAttributeFields.length &&
                      draggedConstructionFieldId
                        ? "h-4 bg-primary/10"
                        : "h-0"
                    }`}
                  />
                  <tr className="border-t border-border bg-muted/10">
                    <td className="px-2 py-2 align-middle text-center text-lg text-muted-foreground">
                      +
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={orderFieldLabel}
                        onChange={(event) =>
                          setOrderFieldLabel(event.target.value)
                        }
                        placeholder={t("settings.orderInputs.inlineAddHint")}
                        className="h-9 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={orderFieldType}
                        onValueChange={(value) =>
                          setOrderFieldType(value as OrderInputFieldType)
                        }
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {constructionAttributeTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {optionLabel(
                                "orderInputFieldType",
                                option.value,
                                option.label,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        variant="box"
                        checked={orderFieldRequired}
                        onChange={(event) =>
                          setOrderFieldRequired(event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        variant="box"
                        checked={orderFieldShowInTable}
                        onChange={(event) =>
                          setOrderFieldShowInTable(event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        variant="box"
                        checked={orderFieldActive}
                        onChange={(event) =>
                          setOrderFieldActive(event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        variant="box"
                        checked={orderFieldShowInProduction}
                        onChange={(event) =>
                          setOrderFieldShowInProduction(event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        variant="box"
                        checked={orderFieldUseInBomTable}
                        onChange={(event) =>
                          setOrderFieldUseInBomTable(event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveConstructionAttribute}
                          disabled={!orderFieldLabel.trim()}
                        >
                          {editingOrderFieldId
                            ? t("settings.orderInputs.saveField")
                            : t("settings.orderInputs.addField")}
                        </Button>
                        {editingOrderFieldId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={resetOrderFieldForm}
                          >
                            {t("settings.common.cancel")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-border bg-muted/5">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <InputField
                          label={t("settings.orderInputs.unitOptional")}
                          value={orderFieldUnit}
                          onChange={(event) =>
                            setOrderFieldUnit(event.target.value)
                          }
                          placeholder="pcs"
                          className="h-9 text-sm"
                        />
                        <TextAreaField
                          label={t("settings.orderInputs.selectOptions")}
                          value={orderFieldOptions}
                          onChange={(event) =>
                            setOrderFieldOptions(event.target.value)
                          }
                          disabled={orderFieldType !== "select"}
                          placeholder={t(
                            "settings.orderInputs.selectOptionsPlaceholder",
                          )}
                          className="min-h-18 disabled:opacity-50"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
