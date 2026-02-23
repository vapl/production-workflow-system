"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SelectField } from "@/components/ui/SelectField";
import { Checkbox } from "@/components/ui/Checkbox";
import { FileField } from "@/components/ui/FileField";
import { DownloadIcon, FileSpreadsheetIcon, XIcon } from "lucide-react";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useOrders } from "@/app/orders/OrdersContext";
import { useNotifications } from "@/components/ui/Notifications";
import {
  buildOrdersTemplate,
  parseOrdersWorkbook,
} from "@/lib/excel/ordersExcel";
import { createId } from "@/lib/utils/createId";
import type { OrderStatus } from "@/types/orders";
import { useI18n } from "@/lib/i18n/useI18n";

const requiredFields = [
  { key: "orderNumber", labelKey: "orders.page.orderNumberShort", required: true },
  { key: "customerName", labelKey: "orders.page.customer", required: true },
  { key: "dueDate", labelKey: "orders.page.dueDate", required: true },
];

const optionalFields = [
  { key: "customerEmail", labelKey: "orders.modal.customerEmail" },
  { key: "productName", labelKey: "orders.modal.product" },
  { key: "quantity", labelKey: "orders.page.quantity" },
  { key: "priority", labelKey: "orders.page.priority" },
  { key: "status", labelKey: "orders.page.status" },
  { key: "notes", labelKey: "orders.modal.notes" },
];

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

function parseDateCell(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeEnum(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const { t } = useI18n();
  const { levels, nodes, addNode } = useHierarchy();
  const { importOrdersFromExcel } = useOrders();
  const { notify } = useNotifications();
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [statusMapping, setStatusMapping] = useState<
    Record<string, OrderStatus>
  >({});
  const [priorityMapping, setPriorityMapping] = useState<
    Record<string, "low" | "normal" | "high" | "urgent">
  >({});
  const [createHierarchyItems, setCreateHierarchyItems] = useState(false);
  const [ackLargeImport, setAckLargeImport] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<
    Array<{ row: number; message: string }>
  >([]);
  const [isImporting, setIsImporting] = useState(false);

  const hierarchyFields = useMemo(
    () =>
      levels
        .filter((level) => level.key !== "engineer" && level.key !== "manager")
        .map((level) => ({
          key: `hierarchy:${level.id}`,
          label: `Hierarchy:${level.name}`,
          levelId: level.id,
        })),
    [levels],
  );

  function resetWizard() {
    setStep("upload");
    setFileName("");
    setRows([]);
    setHeaders([]);
    setMapping({});
    setStatusMapping({});
    setPriorityMapping({});
    setCreateHierarchyItems(false);
    setAckLargeImport(false);
    setPreviewErrors([]);
    setIsImporting(false);
  }

  function handleDownloadTemplate() {
    const levelNames = levels
      .filter((level) => level.key !== "engineer" && level.key !== "manager")
      .map((level) => level.name);
    const blob = buildOrdersTemplate(levelNames);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pws-orders-template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const isSupported =
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".csv");
    if (!isSupported) {
      notify({
        title: t("orders.import.unsupportedTypeTitle"),
        description: t("orders.import.unsupportedTypeDescription"),
        variant: "error",
      });
      return;
    }
    const parsed = await parseOrdersWorkbook(file);
    if (parsed.length === 0) {
      notify({
        title: t("orders.import.failedTitle"),
        description: t("orders.import.noRowsFound"),
        variant: "error",
      });
      return;
    }
    const headerSet = new Set<string>();
    Object.keys(parsed[0] ?? {}).forEach((key) => headerSet.add(key.trim()));
    setHeaders(Array.from(headerSet));
    setRows(parsed);
    setFileName(file.name);
    setStep("map");
  }

  function getMappedValue(row: Record<string, unknown>, fieldKey: string) {
    const header = mapping[fieldKey];
    if (!header) {
      return "";
    }
    return row[header] ?? "";
  }

  const statusColumn = mapping.status ?? "";
  const priorityColumn = mapping.priority ?? "";

  const uniqueStatusValues = useMemo(() => {
    if (!statusColumn) {
      return [];
    }
    const values = new Set<string>();
    rows.forEach((row) => {
      const value = String(row[statusColumn] ?? "").trim();
      if (value) {
        values.add(value);
      }
    });
    return Array.from(values);
  }, [rows, statusColumn]);

  const uniquePriorityValues = useMemo(() => {
    if (!priorityColumn) {
      return [];
    }
    const values = new Set<string>();
    rows.forEach((row) => {
      const value = String(row[priorityColumn] ?? "").trim();
      if (value) {
        values.add(value);
      }
    });
    return Array.from(values);
  }, [rows, priorityColumn]);

  useEffect(() => {
    if (!statusColumn || uniqueStatusValues.length === 0) {
      return;
    }
    setStatusMapping((prev) => {
      const next = { ...prev };
      uniqueStatusValues.forEach((value) => {
        if (next[value]) {
          return;
        }
        const normalized = normalizeEnum(value);
        if (
          normalized === "draft" ||
          normalized === "ready_for_engineering" ||
          normalized === "in_engineering" ||
          normalized === "engineering_blocked" ||
          normalized === "ready_for_production" ||
          normalized === "in_production"
        ) {
          next[value] = normalized as OrderStatus;
        } else {
          next[value] = "draft";
        }
      });
      return next;
    });
  }, [statusColumn, uniqueStatusValues]);

  useEffect(() => {
    if (!priorityColumn || uniquePriorityValues.length === 0) {
      return;
    }
    setPriorityMapping((prev) => {
      const next = { ...prev };
      uniquePriorityValues.forEach((value) => {
        if (next[value]) {
          return;
        }
        const normalized = normalizeEnum(value);
        if (
          normalized === "low" ||
          normalized === "normal" ||
          normalized === "high" ||
          normalized === "urgent"
        ) {
          next[value] = normalized as "low" | "normal" | "high" | "urgent";
        } else {
          next[value] = "normal";
        }
      });
      return next;
    });
  }, [priorityColumn, uniquePriorityValues]);

  function buildImportRows() {
    const missingMapping = requiredFields.filter((field) => !mapping[field.key]);
    if (missingMapping.length > 0) {
      return {
        rows: [],
        errors: [
          {
            row: 0,
            message: t("orders.import.mapRequiredFields", {
              fields: missingMapping.map((field) => t(field.labelKey)).join(", "),
            }),
          },
        ],
      };
    }

    const seenOrderNumbers = new Set<string>();
    const rowErrors: Array<{ row: number; message: string }> = [];
    const importRows: Array<{
      orderNumber: string;
      customerName: string;
      customerEmail?: string;
      productName?: string;
      quantity?: number;
      dueDate: string;
      priority: "low" | "normal" | "high" | "urgent";
      status: OrderStatus;
      notes?: string;
      hierarchy?: Record<string, string>;
      sourcePayload?: Record<string, unknown>;
    }> = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const orderNumber = String(getMappedValue(row, "orderNumber")).trim();
      const customerName = String(getMappedValue(row, "customerName")).trim();
      const dueDate = parseDateCell(getMappedValue(row, "dueDate"));

      if (!orderNumber || !customerName || !dueDate) {
        const missingFields: string[] = [];
        if (!orderNumber) {
          missingFields.push(t("orders.page.orderNumberShort"));
        }
        if (!customerName) {
          missingFields.push(t("orders.page.customer"));
        }
        if (!dueDate) {
          missingFields.push(t("orders.page.dueDate"));
        }
        rowErrors.push({
          row: rowNumber,
          message: t("orders.import.missingRequiredValues", {
            fields: missingFields.join(", "),
          }),
        });
        return;
      }
      if (seenOrderNumbers.has(orderNumber)) {
        rowErrors.push({
          row: rowNumber,
          message: t("orders.import.duplicateOrderNumber", { orderNumber }),
        });
        return;
      }
      seenOrderNumbers.add(orderNumber);

      const rawPriority = String(getMappedValue(row, "priority")).trim();
      const rawStatus = String(getMappedValue(row, "status")).trim();
      const priority =
        rawPriority && priorityMapping[rawPriority]
          ? priorityMapping[rawPriority]
          : (() => {
              const normalized = normalizeEnum(rawPriority);
              return normalized === "low" ||
                normalized === "normal" ||
                normalized === "high" ||
                normalized === "urgent"
                ? (normalized as "low" | "normal" | "high" | "urgent")
                : "normal";
            })();
      const status =
        rawStatus && statusMapping[rawStatus]
          ? statusMapping[rawStatus]
          : (() => {
              const normalized = normalizeEnum(rawStatus);
              return normalized === "draft" ||
                normalized === "ready_for_engineering" ||
                normalized === "in_engineering" ||
                normalized === "engineering_blocked" ||
                normalized === "ready_for_production" ||
                normalized === "in_production"
                ? (normalized as OrderStatus)
                : "draft";
            })();

      const quantityValue = String(getMappedValue(row, "quantity")).trim();
      const quantity = quantityValue ? Number(quantityValue) : undefined;
      if (quantityValue && Number.isNaN(quantity)) {
        rowErrors.push({ row: rowNumber, message: t("orders.import.invalidQuantity") });
        return;
      }

      const hierarchy: Record<string, string> = {};
      hierarchyFields.forEach((field) => {
        const header = mapping[field.key];
        if (!header) {
          return;
        }
        const value = String(row[header] ?? "").trim();
        if (value) {
          hierarchy[field.levelId] = value;
        }
      });

      importRows.push({
        orderNumber,
        customerName,
        customerEmail:
          String(getMappedValue(row, "customerEmail")).trim() || undefined,
        productName:
          String(getMappedValue(row, "productName")).trim() || undefined,
        quantity,
        dueDate,
        priority,
        status,
        notes: String(getMappedValue(row, "notes")).trim() || undefined,
        hierarchy: Object.keys(hierarchy).length > 0 ? hierarchy : undefined,
        sourcePayload: row,
      });
    });

    return { rows: importRows, errors: rowErrors };
  }

  async function handleImport() {
    const { rows: importRows, errors } = buildImportRows();
    if (errors.length > 0) {
      notify({
        title: t("orders.import.excelFailedTitle"),
        description: errors
          .slice(0, 3)
          .map((err) => err.message)
          .join(" "),
        variant: "error",
      });
      return;
    }

    if (importRows.length >= 1000 && !ackLargeImport) {
      notify({
        title: t("orders.import.largeWarningTitle"),
        description: t("orders.import.largeWarningDescription"),
        variant: "error",
      });
      return;
    }

    if (createHierarchyItems) {
      const sortedLevels = [...levels].sort((a, b) => a.order - b.order);
      const mappedLevelIds = new Set(
        hierarchyFields
          .filter((field) => mapping[field.key])
          .map((field) => field.levelId),
      );
      const nodeKeyMap = new Map<string, string>();
      nodes.forEach((node) => {
        const key = `${node.levelId}|${node.parentId ?? ""}|${node.label
          .toLowerCase()
          .trim()}`;
        nodeKeyMap.set(key, node.id);
      });

      for (const row of importRows) {
        let parentId: string | null = null;
        const updatedHierarchy: Record<string, string> = { ...row.hierarchy };
        sortedLevels.forEach((level) => {
          if (!mappedLevelIds.has(level.id)) {
            return;
          }
          const label = updatedHierarchy[level.id];
          if (!label) {
            parentId = null;
            return;
          }
          const key = `${level.id}|${parentId ?? ""}|${label
            .toLowerCase()
            .trim()}`;
          const existingId = nodeKeyMap.get(key);
          if (existingId) {
            updatedHierarchy[level.id] = existingId;
            parentId = existingId;
            return;
          }
          const currentParentId = parentId;
          const newId = createId("node");
          nodeKeyMap.set(key, newId);
          updatedHierarchy[level.id] = newId;
          parentId = newId;
          void addNode({
            id: newId,
            levelId: level.id,
            label,
            parentId: currentParentId,
          });
        });
        row.hierarchy = updatedHierarchy;
      }
    }

    setIsImporting(true);
    try {
      await Promise.race([
        importOrdersFromExcel(importRows),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error(t("orders.import.timeout")));
          }, 20000),
        ),
      ]);
      resetWizard();
      onClose();
    } catch (error) {
      notify({
        title: t("orders.import.excelFailedTitle"),
        description:
          error instanceof Error ? error.message : t("orders.import.unexpectedError"),
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  }

  const previewRows = rows.slice(0, 5).map((row) => ({
    orderNumber: String(getMappedValue(row, "orderNumber")).trim(),
    customerName: String(getMappedValue(row, "customerName")).trim(),
    dueDate: parseDateCell(getMappedValue(row, "dueDate")),
    productName: String(getMappedValue(row, "productName")).trim(),
    status: normalizeEnum(getMappedValue(row, "status")),
  }));

  useEffect(() => {
    if (step !== "preview") {
      return;
    }
    const result = buildImportRows();
    setPreviewErrors(result.errors);
  }, [step, rows, mapping, statusMapping, priorityMapping, hierarchyFields]);

  function downloadErrors() {
    if (previewErrors.length === 0) {
      return;
    }
    const header = "row,error";
    const lines = previewErrors.map(
      (err) => `${err.row},\"${err.message.replace(/\"/g, '\"\"')}\"`,
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pws-import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("orders.import.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {fileName ? fileName : t("orders.import.uploadFileHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetWizard();
              onClose();
            }}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label={t("orders.modal.closeModal")}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {step === "upload" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-start gap-2 text-sm text-muted-foreground">
                <FileSpreadsheetIcon className="mt-0.5 h-4 w-4" />
                <div className="flex flex-col w-full md:flex-row justify-between items-start">
                  <div>
                    <div className="font-medium text-foreground">
                      {t("orders.import.addImportFile")}
                    </div>
                    <div>{t("orders.import.dragDropBrowse")}</div>
                    <div className="text-xs">
                      {t("orders.import.supportedFormats")}{" "}
                      <span className="font-medium">.xlsx, .xls, .csv</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-2 md:mt-0 inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
                    onClick={handleDownloadTemplate}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    {t("orders.import.downloadTemplate")}
                  </button>
                </div>
              </div>
              <FileField
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                emptyText={t("orders.import.emptyText")}
                emptyHint={t("orders.import.emptyHint")}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    await handleFile(file);
                  }
                  event.target.value = "";
                }}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                {t("orders.page.cancel")}
              </Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {[...requiredFields, ...optionalFields].map((field) => (
                <SelectField
                  key={field.key}
                  label={`${t(field.labelKey)}${"required" in field && field.required ? " *" : ""}`}
                  value={mapping[field.key] ?? "__none__"}
                  onValueChange={(value) =>
                    setMapping((prev) => ({
                      ...prev,
                      [field.key]: value === "__none__" ? "" : value,
                    }))
                  }
                >
                  <Select
                    value={mapping[field.key] ?? "__none__"}
                    onValueChange={(value) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: value === "__none__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={t("orders.import.notMapped")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("orders.import.notMapped")}</SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SelectField>
              ))}
            </div>

            {hierarchyFields.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t("orders.import.hierarchyColumns")}</h3>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {hierarchyFields.map((field) => (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      value={mapping[field.key] ?? "__none__"}
                      onValueChange={(value) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <Select
                        value={mapping[field.key] ?? "__none__"}
                        onValueChange={(value) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field.key]: value === "__none__" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue placeholder={t("orders.import.notMapped")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("orders.import.notMapped")}</SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SelectField>
                  ))}
                </div>
              </div>
            )}

            {(uniqueStatusValues.length > 0 ||
              uniquePriorityValues.length > 0) && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold">{t("orders.import.valueMappings")}</h3>
                {uniqueStatusValues.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {t("orders.import.statusMapping")}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {uniqueStatusValues.map((value) => (
                        <SelectField
                          key={value}
                          label={value}
                          labelClassName="text-xs text-muted-foreground font-normal"
                          value={statusMapping[value] ?? "draft"}
                          onValueChange={(next) =>
                            setStatusMapping((prev) => ({
                              ...prev,
                              [value]: next as OrderStatus,
                            }))
                          }
                        >
                          <Select
                            value={statusMapping[value] ?? "draft"}
                            onValueChange={(next) =>
                              setStatusMapping((prev) => ({
                                ...prev,
                                [value]: next as OrderStatus,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">draft</SelectItem>
                              <SelectItem value="ready_for_engineering">
                                ready for engineering
                              </SelectItem>
                              <SelectItem value="in_engineering">
                                in engineering
                              </SelectItem>
                              <SelectItem value="engineering_blocked">
                                engineering blocked
                              </SelectItem>
                              <SelectItem value="ready_for_production">
                                ready for production
                              </SelectItem>
                              <SelectItem value="in_production">
                                in production
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SelectField>
                      ))}
                    </div>
                  </div>
                )}
                {uniquePriorityValues.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {t("orders.import.priorityMapping")}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {uniquePriorityValues.map((value) => (
                        <SelectField
                          key={value}
                          label={value}
                          labelClassName="text-xs text-muted-foreground font-normal"
                          value={priorityMapping[value] ?? "normal"}
                          onValueChange={(next) =>
                            setPriorityMapping((prev) => ({
                              ...prev,
                              [value]: next as
                                | "low"
                                | "normal"
                                | "high"
                                | "urgent",
                            }))
                          }
                        >
                          <Select
                            value={priorityMapping[value] ?? "normal"}
                            onValueChange={(next) =>
                              setPriorityMapping((prev) => ({
                                ...prev,
                                [value]: next as
                                  | "low"
                                  | "normal"
                                  | "high"
                                  | "urgent",
                              }))
                            }
                          >
                            <SelectTrigger className="h-9 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">low</SelectItem>
                              <SelectItem value="normal">normal</SelectItem>
                              <SelectItem value="high">high</SelectItem>
                              <SelectItem value="urgent">urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </SelectField>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Checkbox
              checked={createHierarchyItems}
              onChange={(event) =>
                setCreateHierarchyItems(event.target.checked)
              }
              label={t("orders.import.createHierarchyItems")}
            />

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                }}
              >
                {t("orders.modal.back")}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t("orders.page.cancel")}
                </Button>
                <Button onClick={() => setStep("preview")}>{t("orders.import.continue")}</Button>
              </div>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="mt-6 space-y-4">
            {previewErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="font-medium">
                  {t("orders.import.errorsFound", { count: previewErrors.length })}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {previewErrors.slice(0, 6).map((error) => (
                    <li key={`${error.row}-${error.message}`}>
                      {t("orders.import.rowLabel", { row: error.row })}: {error.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-2">
                  <Button variant="outline" onClick={downloadErrors}>
                    {t("orders.import.downloadErrorList")}
                  </Button>
                </div>
              </div>
            )}
            {rows.length >= 1000 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <div className="font-medium">{t("orders.import.largeWarningTitle")}</div>
                <p className="mt-1 text-xs">
                  {t("orders.import.largeWarningRows", { count: rows.length })}
                </p>
                <Checkbox
                  checked={ackLargeImport}
                  onChange={(event) => setAckLargeImport(event.target.checked)}
                  label={t("orders.import.ackLargeImport")}
                  containerClassName="mt-2 text-xs"
                />
              </div>
            )}
            <div className="rounded-lg border border-border">
              <div className="grid grid-cols-5 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">
                <span>{t("orders.page.orderNumberShort")}</span>
                <span>{t("orders.page.customer")}</span>
                <span>{t("orders.page.dueDate")}</span>
                <span>{t("orders.modal.product")}</span>
                <span>{t("orders.page.status")}</span>
              </div>
              {previewRows.map((row, index) => (
                <div
                  key={`${row.orderNumber}-${index}`}
                  className="grid grid-cols-5 gap-2 border-b border-border px-3 py-2 text-xs last:border-0"
                >
                  <span>{row.orderNumber || "--"}</span>
                  <span>{row.customerName || "--"}</span>
                  <span>{row.dueDate || "--"}</span>
                  <span>{row.productName || "--"}</span>
                  <span>{row.status || "--"}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("map")}>
                {t("orders.modal.back")}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t("orders.page.cancel")}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    isImporting ||
                    previewErrors.length > 0 ||
                    (rows.length >= 1000 && !ackLargeImport)
                  }
                >
                  {isImporting ? t("orders.modal.accounting.importing") : t("orders.import.import")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
