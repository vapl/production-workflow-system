"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
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
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { OrderFieldSetting } from "../OrderFieldSettingsContext";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OrderFieldsSettingsCardProps = {
  t: TranslationFn;
  isLoading: boolean;
  sortedFields: OrderFieldSetting[];
  inlineEditingFieldId: string | null;
  inlineFieldName: string;
  setInlineFieldName: (value: string) => void;
  draggedFieldId: string | null;
  setDraggedFieldId: (value: string | null) => void;
  fieldDropIndex: number | null;
  setFieldDropIndex: (value: number | null) => void;
  lockedFieldKeys: Set<string>;
  defaultFieldDescriptions: Record<string, string>;
  updateOrderField: (
    fieldId: string,
    patch: Partial<OrderFieldSetting>,
  ) => Promise<void> | void;
  handleDropField: () => Promise<void> | void;
  handleSaveInlineField: () => Promise<void> | void;
  startInlineFieldEdit: (fieldId: string) => void;
  cancelInlineFieldEdit: () => void;
  confirmRemove: (message: string) => Promise<boolean>;
  removeOrderField: (fieldId: string) => Promise<void> | void;
  fieldName: string;
  setFieldName: (value: string) => void;
  fieldRequired: boolean;
  setFieldRequired: (value: boolean) => void;
  fieldActive: boolean;
  setFieldActive: (value: boolean) => void;
  fieldShowInTable: boolean;
  setFieldShowInTable: (value: boolean) => void;
  handleSaveField: () => Promise<void> | void;
};

export function OrderFieldsSettingsCard(props: OrderFieldsSettingsCardProps) {
  const stickyGapPx = 48;

  const {
    t,
    isLoading,
    sortedFields,
    inlineEditingFieldId,
    inlineFieldName,
    setInlineFieldName,
    draggedFieldId,
    setDraggedFieldId,
    fieldDropIndex,
    setFieldDropIndex,
    lockedFieldKeys,
    defaultFieldDescriptions,
    updateOrderField,
    handleDropField,
    handleSaveInlineField,
    startInlineFieldEdit,
    cancelInlineFieldEdit,
    confirmRemove,
    removeOrderField,
    fieldName,
    setFieldName,
    fieldRequired,
    setFieldRequired,
    fieldActive,
    setFieldActive,
    fieldShowInTable,
    setFieldShowInTable,
    handleSaveField,
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

  return (
    <div className="space-y-6">
      {isLoading ? (
        <Card className="min-w-0">
          <CardContent className="py-10">
            <LoadingSpinner label={t("settings.loadingOrderFields")} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.orderFields.title")}</CardTitle>
          <CardDescription>
            {t("settings.orderFields.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("settings.orderFields.defaultMeaningHint")}
          </p>

          <div
            ref={stickyContainerRef}
            className="md:sticky"
            style={stickyStyle}
          >
            <div className="overflow-hidden rounded-lg border border-border">
              <div
                className={`scrollbar-hidden overflow-x-auto ${
                  isTablePinned ? "md:overflow-y-auto" : "md:overflow-y-visible"
                }`}
                style={tableScrollStyle}
              >
                <table className="min-w-160 w-full table-auto text-sm [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm md:[&_th]:px-4 md:[&_td]:px-4">
                  <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground">
                    <tr>
                      <th className="w-12 px-2 py-2 text-left font-medium">
                        <span className="sr-only">Drag</span>
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("settings.orderFields.field")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("settings.common.required")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("settings.common.active")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("settings.orderFields.inTable")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("settings.common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFields.map((field, rowIndex) => {
                      const isInlineEditing = inlineEditingFieldId === field.id;
                      return (
                        <Fragment key={field.id}>
                          <tr
                            className={`border-t border-border transition-all ${
                              fieldDropIndex === rowIndex && draggedFieldId
                                ? "h-4 bg-primary/10"
                                : "h-0"
                            }`}
                          />
                          <tr
                            className={`border-t border-border ${
                              draggedFieldId === field.id
                                ? "bg-primary/5"
                                : "bg-background"
                            }`}
                            draggable={!isInlineEditing}
                            onDragStart={() => {
                              setDraggedFieldId(field.id);
                              setFieldDropIndex(rowIndex);
                            }}
                            onDragOver={(event) => {
                              if (!draggedFieldId) {
                                return;
                              }
                              event.preventDefault();
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const before =
                                event.clientY < rect.top + rect.height / 2;
                              setFieldDropIndex(
                                before ? rowIndex : rowIndex + 1,
                              );
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              void handleDropField();
                            }}
                            onDragEnd={() => {
                              setDraggedFieldId(null);
                              setFieldDropIndex(null);
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
                                  value={inlineFieldName}
                                  onChange={(event) =>
                                    setInlineFieldName(event.target.value)
                                  }
                                  className="h-9 text-sm"
                                />
                              ) : (
                                <div className="font-medium">
                                  {field.name}
                                  {lockedFieldKeys.has(field.key) ? (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {t("settings.common.default")}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                              {lockedFieldKeys.has(field.key) &&
                              defaultFieldDescriptions[field.key] ? (
                                <div className="text-xs text-muted-foreground">
                                  {defaultFieldDescriptions[field.key]}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-2">
                              <Checkbox
                                checked={field.isRequired}
                                onChange={(event) =>
                                  updateOrderField(field.id, {
                                    isRequired: event.target.checked,
                                  })
                                }
                                label={
                                  field.isRequired
                                    ? t("settings.common.yes")
                                    : t("settings.common.no")
                                }
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Checkbox
                                checked={field.isActive}
                                onChange={(event) =>
                                  updateOrderField(field.id, {
                                    isActive: event.target.checked,
                                  })
                                }
                                label={
                                  field.isActive
                                    ? t("settings.common.active")
                                    : t("settings.common.hidden")
                                }
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Checkbox
                                checked={field.showInTable}
                                onChange={(event) =>
                                  updateOrderField(field.id, {
                                    showInTable: event.target.checked,
                                  })
                                }
                                label={
                                  field.showInTable
                                    ? t("settings.common.shown")
                                    : t("settings.common.hidden")
                                }
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
                                        void handleSaveInlineField()
                                      }
                                      disabled={!inlineFieldName.trim()}
                                    >
                                      {t("settings.orderFields.saveField")}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={cancelInlineFieldEdit}
                                    >
                                      {t("settings.common.cancel")}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        startInlineFieldEdit(field.id)
                                      }
                                    >
                                      <PencilIcon className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        if (
                                          !(await confirmRemove(
                                            t(
                                              "settings.orderFields.removeFieldConfirm",
                                              { name: field.name },
                                            ),
                                          ))
                                        ) {
                                          return;
                                        }
                                        await removeOrderField(field.id);
                                      }}
                                      disabled={lockedFieldKeys.has(field.key)}
                                    >
                                      <Trash2Icon className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    <tr
                      className={`border-t border-border transition-all ${
                        fieldDropIndex === sortedFields.length && draggedFieldId
                          ? "h-4 bg-primary/10"
                          : "h-0"
                      }`}
                    />
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-2 py-2" />
                      <td className="px-4 py-2">
                        <Input
                          aria-label={t("settings.orderFields.fieldLabel")}
                          value={fieldName}
                          onChange={(event) => {
                            setFieldName(event.target.value);
                          }}
                          placeholder={t(
                            "settings.orderFields.fieldLabelPlaceholder",
                          )}
                          className="h-9 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Checkbox
                          checked={fieldRequired}
                          onChange={(event) =>
                            setFieldRequired(event.target.checked)
                          }
                          label={t("settings.common.required")}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Checkbox
                          checked={fieldActive}
                          onChange={(event) =>
                            setFieldActive(event.target.checked)
                          }
                          label={t("settings.common.active")}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Checkbox
                          checked={fieldShowInTable}
                          onChange={(event) =>
                            setFieldShowInTable(event.target.checked)
                          }
                          label={t("settings.orderFields.showInTable")}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          onClick={() => void handleSaveField()}
                          disabled={!fieldName.trim()}
                        >
                          {t("settings.orderFields.addField")}
                        </Button>
                      </td>
                    </tr>
                    {sortedFields.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          {t("settings.orderFields.addFirstField")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
