"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { InputField } from "@/components/ui/InputField";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { XIcon } from "lucide-react";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import type { ReactNode } from "react";
import { getAccountingAdapter } from "@/lib/integrations/accounting/getAdapter";
import type { AccountingOrder } from "@/lib/integrations/accounting/types";

export interface OrderFormValues {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  productName: string;
  quantity: number;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  notes?: string;
  hierarchy?: Record<string, string>;
}

interface OrderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OrderFormValues) => Promise<boolean> | boolean;
  title?: string;
  submitLabel?: string;
  initialValues?: Partial<OrderFormValues>;
  editMode?: "full" | "category-product-only";
  existingOrderNumbers?: string[];
  enableCreateEntryModeSelection?: boolean;
  onOpenImportExcel?: () => void;
}

type CreateOrderEntryMode = "choose" | "manual" | "accounting";
type AccountingImportStatus = "new" | "skipped" | "imported" | "error";

const defaultValues: OrderFormValues = {
  orderNumber: "",
  customerName: "",
  customerEmail: "",
  productName: "",
  quantity: 1,
  dueDate: "",
  priority: "normal",
  notes: "",
};

export function OrderModal({
  open,
  onClose,
  onSubmit,
  title = "Create New Order",
  submitLabel = "Create Order",
  initialValues,
  editMode = "full",
  existingOrderNumbers = [],
  enableCreateEntryModeSelection = false,
  onOpenImportExcel,
}: OrderModalProps) {
  const minDueDate = initialValues?.dueDate
    ? undefined
    : new Date().toISOString().slice(0, 10);
  const [formState, setFormState] = useState({
    orderNumber: defaultValues.orderNumber,
    customerName: defaultValues.customerName,
    customerEmail: defaultValues.customerEmail ?? "",
    productName: defaultValues.productName,
    quantity: String(defaultValues.quantity),
    dueDate: defaultValues.dueDate,
    priority: defaultValues.priority,
    notes: defaultValues.notes ?? "",
    hierarchy: {} as Record<string, string>,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [hierarchyInput, setHierarchyInput] = useState<Record<string, string>>(
    {},
  );
  const { levels, nodes } = useHierarchy();
  const activeLevels = useMemo(
    () =>
      levels
        .filter(
          (level) =>
            level.isActive &&
            level.key !== "engineer" &&
            level.key !== "manager",
        )
        .sort((a, b) => a.order - b.order),
    [levels],
  );
  const isCategoryProductOnly = editMode === "category-product-only";
  const editableLevelIds = useMemo(() => {
    if (!isCategoryProductOnly) {
      return new Set(activeLevels.map((level) => level.id));
    }
    const allowedKeys = new Set(["category", "product"]);
    return new Set(
      activeLevels
        .filter((level) => allowedKeys.has(level.key))
        .map((level) => level.id),
    );
  }, [activeLevels, isCategoryProductOnly]);
  const productLevel = useMemo(
    () => activeLevels.find((level) => level.key === "product"),
    [activeLevels],
  );
  const levelNodeMap = useMemo(() => {
    const map = new Map<string, typeof nodes>();
    activeLevels.forEach((level) => {
      map.set(
        level.id,
        nodes.filter((node) => node.levelId === level.id),
      );
    });
    return map;
  }, [activeLevels, nodes]);
  const isEditingOrderNumber = Boolean(initialValues?.orderNumber);
  const supportsCreateEntryModes =
    enableCreateEntryModeSelection &&
    !isEditingOrderNumber &&
    !isCategoryProductOnly;
  const [entryMode, setEntryMode] = useState<CreateOrderEntryMode>(
    supportsCreateEntryModes ? "choose" : "manual",
  );
  const [accountingOrders, setAccountingOrders] = useState<AccountingOrder[]>(
    [],
  );
  const [isAccountingLoading, setIsAccountingLoading] = useState(false);
  const [accountingLoadError, setAccountingLoadError] = useState("");
  const [accountingQuery, setAccountingQuery] = useState("");
  const [selectedAccountingExternalIds, setSelectedAccountingExternalIds] =
    useState<string[]>([]);
  const [isAccountingImporting, setIsAccountingImporting] = useState(false);
  const [accountingImportSummary, setAccountingImportSummary] = useState("");
  const [accountingImportStatusByExternalId, setAccountingImportStatusByExternalId] =
    useState<Record<string, AccountingImportStatus>>({});
  const normalizedExistingNumbers = useMemo(
    () =>
      existingOrderNumbers
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    [existingOrderNumbers],
  );
  const normalizedCurrentNumber = formState.orderNumber.trim().toLowerCase();
  const isDuplicateOrderNumber =
    normalizedCurrentNumber.length > 0 &&
    !isEditingOrderNumber &&
    normalizedExistingNumbers.includes(normalizedCurrentNumber);

  function resolveNodeId(
    levelId: string,
    label: string,
    parentId?: string | null,
  ) {
    const trimmed = label.trim();
    if (!trimmed) {
      return "";
    }
    const existing = nodes.find(
      (node) =>
        node.levelId === levelId &&
        node.label.toLowerCase() === trimmed.toLowerCase() &&
        (parentId ? node.parentId === parentId : !node.parentId),
    );
    return existing?.id ?? "";
  }

  const normalizedExistingNumbersSet = useMemo(
    () => new Set(normalizedExistingNumbers),
    [normalizedExistingNumbers],
  );

  async function loadAccountingOrders() {
    setIsAccountingLoading(true);
    setAccountingLoadError("");
    try {
      const adapter = getAccountingAdapter();
      const rows = await adapter.fetchOrders();
      setAccountingOrders(rows);
      const initialStatus: Record<string, AccountingImportStatus> = {};
      rows.forEach((row) => {
        const existsInPws = normalizedExistingNumbersSet.has(
          row.orderNumber.trim().toLowerCase(),
        );
        initialStatus[row.externalId] = existsInPws ? "skipped" : "new";
      });
      setAccountingImportStatusByExternalId(initialStatus);
      setAccountingImportSummary("");
    } catch {
      setAccountingOrders([]);
      setAccountingLoadError("Failed to load accounting orders.");
    } finally {
      setIsAccountingLoading(false);
    }
  }

  async function handleEnterAccountingMode() {
    setEntryMode("accounting");
    setAccountingQuery("");
    setSelectedAccountingExternalIds([]);
    await loadAccountingOrders();
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextValues = {
      ...defaultValues,
      ...initialValues,
    };
    let nextProductName = nextValues.productName;
    if (productLevel && nextValues.hierarchy?.[productLevel.id]) {
      const rawValue = nextValues.hierarchy?.[productLevel.id] ?? "";
      const selectedNode = nodes.find((node) => node.id === rawValue);
      nextProductName = selectedNode?.label ?? (rawValue || nextProductName);
    }
    const nextHierarchy: Record<string, string> = {};
    const nextHierarchyInput: Record<string, string> = {};
    activeLevels.forEach((level) => {
      const nodeId = nextValues.hierarchy?.[level.id];
      if (!nodeId) {
        return;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (node) {
        nextHierarchy[level.id] = nodeId;
        nextHierarchyInput[level.id] = node.label;
        return;
      }
      // Keep raw value in input for visibility, but drop invalid IDs from state.
      nextHierarchyInput[level.id] = nodeId;
    });
    setFormState({
      orderNumber: nextValues.orderNumber ?? "",
      customerName: nextValues.customerName,
      customerEmail: nextValues.customerEmail ?? "",
      productName: nextProductName,
      quantity: String(nextValues.quantity ?? 1),
      dueDate: nextValues.dueDate,
      priority: nextValues.priority,
      notes: nextValues.notes ?? "",
      hierarchy: nextHierarchy,
    });
    setErrors({});
    setTouched({});
    setHierarchyInput(nextHierarchyInput);
  }, [activeLevels, initialValues, nodes, open, productLevel]);

  function resetForm() {
    setFormState({
      orderNumber: defaultValues.orderNumber,
      customerName: defaultValues.customerName,
      customerEmail: defaultValues.customerEmail ?? "",
      productName: defaultValues.productName,
      quantity: String(defaultValues.quantity),
      dueDate: defaultValues.dueDate,
      priority: defaultValues.priority,
      notes: defaultValues.notes ?? "",
      hierarchy: {},
    });
    setErrors({});
    setTouched({});
    setHierarchyInput({});
  }

  function validateField(field: string, value: string) {
    switch (field) {
      case "customerName":
        return value.trim() ? "" : "Customer name is required.";
      case "orderNumber":
        if (!value.trim()) {
          return "Order number is required.";
        }
        if (isDuplicateOrderNumber) {
          return "Order number already exists.";
        }
        return "";
      case "customerEmail":
        return value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? "Customer email must be valid."
          : "";
      case "productName":
        return "";
      case "quantity": {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
          ? ""
          : "Quantity must be a positive number.";
      }
      case "dueDate": {
        if (!value) {
          return "Due date is required.";
        }
        if (isEditingOrderNumber) {
          return "";
        }
        const today = new Date();
        const dueDate = new Date(value);
        today.setHours(0, 0, 0, 0);
        return dueDate < today ? "Due date cannot be in the past." : "";
      }
      default:
        return "";
    }
  }

  function handleHierarchyChange(levelId: string, value: string) {
    setFormState((prev) => {
      const nextHierarchy = { ...prev.hierarchy, [levelId]: value };
      // Do not clear lower levels on manual input; many levels are independent.
      const productLevel = activeLevels.find(
        (level) => level.key === "product",
      );
      if (productLevel && levelId === productLevel.id) {
        const selectedNode = nodes.find((node) => node.id === value);
        return {
          ...prev,
          hierarchy: nextHierarchy,
          productName: selectedNode?.label ?? value,
        };
      }
      return { ...prev, hierarchy: nextHierarchy };
    });
  }

  if (!open) {
    return null;
  }

  function renderModalFrame(content: ReactNode, wide = false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div
          className={`w-full ${
            wide ? "max-w-6xl" : "max-w-xl"
          } max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 pt-0 shadow-xl`}
        >
          <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center justify-between bg-card px-6 py-4 shadow-sm">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={() => {
                setEntryMode(supportsCreateEntryModes ? "choose" : "manual");
                onClose();
              }}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close modal"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          {content}
        </div>
      </div>
    );
  }

  if (supportsCreateEntryModes && entryMode === "choose") {
    return renderModalFrame(
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose how you want to create the order.
        </p>
        <button
          type="button"
          className="w-full rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => setEntryMode("manual")}
        >
          <div className="text-sm font-semibold">Manual entry</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Fill in order details manually.
          </div>
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => {
            void handleEnterAccountingMode();
          }}
        >
          <div className="text-sm font-semibold">Import from Accounting</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Select one or multiple orders from accounting.
          </div>
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => {
            setEntryMode("choose");
            onOpenImportExcel?.();
            onClose();
          }}
        >
          <div className="text-sm font-semibold">Import CSV / Excel</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Open spreadsheet import wizard.
          </div>
        </button>
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEntryMode("choose");
              onClose();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>,
    );
  }

  if (supportsCreateEntryModes && entryMode === "accounting") {
    const normalizedQuery = accountingQuery.trim().toLowerCase();
    const filteredAccountingOrders = accountingOrders.filter((order) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [
        order.orderNumber,
        order.customerName,
        order.contract ?? "",
        order.category ?? "",
        order.product ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
    const selectedRows = accountingOrders.filter((order) =>
      selectedAccountingExternalIds.includes(order.externalId),
    );
    const allVisibleSelected =
      filteredAccountingOrders.length > 0 &&
      filteredAccountingOrders.every((order) =>
        selectedAccountingExternalIds.includes(order.externalId),
      );
    const oneSelected = selectedRows.length === 1 ? selectedRows[0] : null;
    const importCounts = selectedRows.reduce(
      (acc, row) => {
        const status =
          accountingImportStatusByExternalId[row.externalId] ?? "new";
        acc[status] += 1;
        return acc;
      },
      { new: 0, skipped: 0, imported: 0, error: 0 } as Record<
        AccountingImportStatus,
        number
      >,
    );

    function toggleRow(externalId: string, checked: boolean) {
      setSelectedAccountingExternalIds((prev) => {
        if (checked) {
          return prev.includes(externalId) ? prev : [...prev, externalId];
        }
        return prev.filter((value) => value !== externalId);
      });
    }

    function toggleAllVisible(checked: boolean) {
      if (!checked) {
        const visibleIds = new Set(filteredAccountingOrders.map((row) => row.externalId));
        setSelectedAccountingExternalIds((prev) =>
          prev.filter((value) => !visibleIds.has(value)),
        );
        return;
      }
      setSelectedAccountingExternalIds((prev) => {
        const next = new Set(prev);
        filteredAccountingOrders.forEach((row) => next.add(row.externalId));
        return Array.from(next);
      });
    }

    function resolveHierarchyValue(levelKey: string, rawValue?: string) {
      if (!rawValue?.trim()) {
        return "";
      }
      const level = activeLevels.find((item) => item.key === levelKey);
      if (!level) {
        return "";
      }
      const matchedNode = nodes.find(
        (node) =>
          node.levelId === level.id &&
          node.label.toLowerCase() === rawValue.trim().toLowerCase(),
      );
      return matchedNode?.id ?? rawValue.trim();
    }

    function mapAccountingOrderToFormValues(oneSelectedOrder: AccountingOrder) {
      const nextHierarchy: Record<string, string> = {};
      const nextHierarchyInput: Record<string, string> = {};
      const contractValue = resolveHierarchyValue(
        "contract",
        oneSelectedOrder.contract,
      );
      if (contractValue) {
        const level = activeLevels.find((item) => item.key === "contract");
        if (level) {
          nextHierarchy[level.id] = contractValue;
          nextHierarchyInput[level.id] = oneSelectedOrder.contract ?? "";
        }
      }
      const categoryValue = resolveHierarchyValue(
        "category",
        oneSelectedOrder.category,
      );
      if (categoryValue) {
        const level = activeLevels.find((item) => item.key === "category");
        if (level) {
          nextHierarchy[level.id] = categoryValue;
          nextHierarchyInput[level.id] = oneSelectedOrder.category ?? "";
        }
      }
      const productValue = resolveHierarchyValue(
        "product",
        oneSelectedOrder.product ?? oneSelectedOrder.productName,
      );
      if (productValue) {
        const level = activeLevels.find((item) => item.key === "product");
        if (level) {
          nextHierarchy[level.id] = productValue;
          nextHierarchyInput[level.id] =
            oneSelectedOrder.product ?? oneSelectedOrder.productName ?? "";
        }
      }

      const values: OrderFormValues = {
        orderNumber: oneSelectedOrder.orderNumber ?? "",
        customerName: oneSelectedOrder.customerName ?? "",
        customerEmail: "",
        productName:
          oneSelectedOrder.productName ?? oneSelectedOrder.product ?? "",
        quantity: oneSelectedOrder.quantity ?? 1,
        dueDate: oneSelectedOrder.dueDate ?? "",
        priority: oneSelectedOrder.priority ?? "normal",
        notes: "",
        hierarchy: nextHierarchy,
      };

      return { values, hierarchyInput: nextHierarchyInput };
    }

    function useSelectedInForm() {
      if (!oneSelected) {
        return;
      }
      const mapped = mapAccountingOrderToFormValues(oneSelected);
      setFormState({
        orderNumber: mapped.values.orderNumber,
        customerName: mapped.values.customerName,
        customerEmail: mapped.values.customerEmail ?? "",
        productName: mapped.values.productName,
        quantity: String(mapped.values.quantity ?? 1),
        dueDate: mapped.values.dueDate,
        priority: mapped.values.priority,
        notes: mapped.values.notes ?? "",
        hierarchy: mapped.values.hierarchy ?? {},
      });
      setHierarchyInput(mapped.hierarchyInput);
      setErrors({});
      setTouched({});
      setEntryMode("manual");
    }

    async function importSelectedToPws() {
      if (selectedRows.length === 0 || isAccountingImporting) {
        return;
      }
      setIsAccountingImporting(true);
      setAccountingImportSummary("");
      const nextStatuses = { ...accountingImportStatusByExternalId };
      const knownOrderNumbers = new Set(normalizedExistingNumbersSet);
      let imported = 0;
      let skipped = 0;
      let error = 0;

      for (const row of selectedRows) {
        const normalizedOrderNumber = row.orderNumber.trim().toLowerCase();
        if (!row.orderNumber.trim() || knownOrderNumbers.has(normalizedOrderNumber)) {
          nextStatuses[row.externalId] = "skipped";
          skipped += 1;
          continue;
        }
        const mapped = mapAccountingOrderToFormValues(row);
        try {
          const success = await Promise.resolve(onSubmit(mapped.values));
          if (!success) {
            nextStatuses[row.externalId] = "error";
            error += 1;
            continue;
          }
          nextStatuses[row.externalId] = "imported";
          imported += 1;
          knownOrderNumbers.add(normalizedOrderNumber);
        } catch {
          nextStatuses[row.externalId] = "error";
          error += 1;
        }
      }

      setAccountingImportStatusByExternalId(nextStatuses);
      setAccountingImportSummary(
        `Imported ${imported}, skipped ${skipped}, errors ${error}.`,
      );
      setIsAccountingImporting(false);
    }

    return renderModalFrame(
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="text-sm font-semibold">Accounting import</div>
          <Input
            type="search"
            icon="search"
            value={accountingQuery}
            onChange={(event) => setAccountingQuery(event.target.value)}
            placeholder="Search order #, customer, contract, category, product..."
            className="h-10"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{filteredAccountingOrders.length} rows</span>
            <span>•</span>
            <span>{selectedAccountingExternalIds.length} selected</span>
            <span>•</span>
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              onClick={() => {
                void loadAccountingOrders();
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      variant="box"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleAllVisible(event.target.checked)}
                      aria-label="Select all visible accounting rows"
                    />
                  </TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAccountingLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Loading accounting orders...
                    </TableCell>
                  </TableRow>
                ) : accountingLoadError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-destructive py-6">
                      {accountingLoadError}
                    </TableCell>
                  </TableRow>
                ) : filteredAccountingOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      No accounting orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccountingOrders.map((order) => {
                    const isSelected = selectedAccountingExternalIds.includes(
                      order.externalId,
                    );
                    const status =
                      accountingImportStatusByExternalId[order.externalId] ??
                      "new";
                    return (
                      <TableRow
                        key={order.externalId}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            variant="box"
                            checked={isSelected}
                            onChange={(event) =>
                              toggleRow(order.externalId, event.target.checked)
                            }
                            aria-label={`Select ${order.orderNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.dueDate}</TableCell>
                        <TableCell>
                          <span
                            className={
                              status === "imported"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : status === "error"
                                  ? "text-destructive"
                                  : status === "skipped"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : status === "new"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-muted-foreground"
                            }
                          >
                            {status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="text-sm font-semibold">Preview</div>
            {!oneSelected && selectedRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Select one row to preview details.
              </p>
            ) : null}
            {selectedRows.length > 1 ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{selectedRows.length} rows selected.</p>
                <p>Single-row preview is shown when only one row is selected.</p>
                <p>New: {importCounts.new}</p>
                <p>Skipped: {importCounts.skipped}</p>
                <p>Imported: {importCounts.imported}</p>
                <p>Errors: {importCounts.error}</p>
              </div>
            ) : null}
            {oneSelected ? (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Order #:</span>{" "}
                  <span className="font-medium">{oneSelected.orderNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  <span className="font-medium">{oneSelected.customerName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Contract:</span>{" "}
                  <span>{oneSelected.contract ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span>{" "}
                  <span>{oneSelected.category ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Product:</span>{" "}
                  <span>{oneSelected.productName ?? oneSelected.product ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>{" "}
                  <span>{oneSelected.quantity ?? 1}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Due date:</span>{" "}
                  <span>{oneSelected.dueDate}</span>
                </div>
              </div>
            ) : null}
            {accountingImportSummary ? (
              <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
                {accountingImportSummary}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setEntryMode("choose")}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={useSelectedInForm}
            disabled={!oneSelected}
          >
            Use selected in form
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              void importSelectedToPws();
            }}
            disabled={selectedRows.length === 0 || isAccountingImporting}
          >
            {isAccountingImporting ? "Importing..." : "Import selected to PWS"}
          </Button>
        </div>
      </div>,
      true,
    );
  }

  const requiredFieldsValid = (() => {
    if (isCategoryProductOnly) {
      return true;
    }
    const baseValid =
      formState.orderNumber.trim() &&
      formState.customerName.trim() &&
      formState.quantity.trim() &&
      formState.dueDate.trim() &&
      !isDuplicateOrderNumber &&
      !validateField("quantity", formState.quantity) &&
      !validateField("dueDate", formState.dueDate);
    if (!baseValid) {
      return false;
    }
    const requiredHierarchyOk = activeLevels.every((level) => {
      if (!level.isRequired || !editableLevelIds.has(level.id)) {
        return true;
      }
      return Boolean(
        formState.hierarchy[level.id] || hierarchyInput[level.id]?.trim(),
      );
    });
    return requiredHierarchyOk;
  })();
  const hasErrors = Object.values(errors).some(Boolean);
  const isSubmitDisabled =
    (!requiredFieldsValid && !isCategoryProductOnly) ||
    hasErrors ||
    isDuplicateOrderNumber;
  const contractLevel = activeLevels.find((level) => level.key === "contract");
  const categoryLevel = activeLevels.find((level) => level.key === "category");
  const productHierarchyLevel = activeLevels.find(
    (level) => level.key === "product",
  );
  const remainingLevels = activeLevels.filter(
    (level) =>
      level.key !== "contract" &&
      level.key !== "category" &&
      level.key !== "product",
  );

  function renderHierarchyField(level: (typeof activeLevels)[number]) {
    const levelIndex = activeLevels.findIndex((item) => item.id === level.id);
    const parentLevel = levelIndex > 0 ? activeLevels[levelIndex - 1] : null;
    const parentIdRaw = parentLevel
      ? formState.hierarchy[parentLevel.id]
      : null;
    const parentId =
      parentIdRaw && nodes.some((node) => node.id === parentIdRaw)
        ? parentIdRaw
        : null;
    const options = (levelNodeMap.get(level.id) || []).filter((node) =>
      parentId ? node.parentId === parentId : true,
    );
    const errorKey = `hierarchy.${level.id}`;
    return (
      <div key={level.id} className="space-y-2">
        <InputField
          label={level.name}
          required={level.isRequired}
          list={`level-options-${level.id}`}
          value={hierarchyInput[level.id] ?? ""}
          onChange={(event) => {
            if (!editableLevelIds.has(level.id)) {
              return;
            }
            const value = event.target.value;
            setHierarchyInput((prev) => ({
              ...prev,
              [level.id]: value,
            }));
            const matched = options.find(
              (node) => node.label.toLowerCase() === value.toLowerCase(),
            );
            if (matched) {
              handleHierarchyChange(level.id, matched.id);
            }
          }}
          onBlur={(event) => {
            if (!editableLevelIds.has(level.id)) {
              return;
            }
            setTouched((prev) => ({
              ...prev,
              [errorKey]: true,
            }));
            const rawValue = event.target.value.trim();
            if (!rawValue) {
              handleHierarchyChange(level.id, "");
              setHierarchyInput((prev) => ({
                ...prev,
                [level.id]: "",
              }));
              if (level.isRequired) {
                setErrors((prev) => ({
                  ...prev,
                  [errorKey]: `${level.name} is required.`,
                }));
              }
              return;
            }
            const matched = options.find(
              (node) => node.label.toLowerCase() === rawValue.toLowerCase(),
            );
            const nextValue = matched ? matched.id : rawValue;
            handleHierarchyChange(level.id, nextValue);
            setHierarchyInput((prev) => ({
              ...prev,
              [level.id]: matched?.label ?? rawValue,
            }));
            setErrors((prev) => ({
              ...prev,
              [errorKey]: "",
            }));
          }}
          className="h-10 text-sm text-foreground"
          wrapperClassName={`h-10 ${
            touched[errorKey] && errors[errorKey]
              ? "border-destructive"
              : "border-border"
          }`}
          placeholder={`Search or enter ${level.name}`}
          disabled={!editableLevelIds.has(level.id)}
          error={
            touched[errorKey] && errors[errorKey] ? errors[errorKey] : undefined
          }
        />
        <datalist id={`level-options-${level.id}`}>
          {options.map((node) => (
            <option key={node.id} value={node.label} />
          ))}
        </datalist>
      </div>
    );
  }

  return renderModalFrame(
    <form
      className="space-y-4 pb-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const resolvedHierarchy = { ...formState.hierarchy };
        activeLevels.forEach((level, index) => {
          const inputValue = hierarchyInput[level.id]?.trim();
          if (!inputValue) {
            return;
          }
          const existingId = resolvedHierarchy[level.id];
          const existingNode = existingId
            ? nodes.find((node) => node.id === existingId)
            : undefined;
          const matchesExisting =
            existingNode &&
            existingNode.label.toLowerCase() === inputValue.toLowerCase();
          if (matchesExisting) {
            return;
          }
          const parentLevel = activeLevels[index - 1];
          const parentId = parentLevel
            ? (resolvedHierarchy[parentLevel.id] ?? null)
            : null;
          const matchedId = resolveNodeId(
            level.id,
            inputValue,
            parentId ?? null,
          );
          resolvedHierarchy[level.id] = matchedId || inputValue;
        });
        const nextErrors: Record<string, string> = {};
        (
          [
            "orderNumber",
            "customerName",
            "customerEmail",
            "quantity",
            "dueDate",
          ] as const
        ).forEach((field) => {
          if (isCategoryProductOnly) {
            return;
          }
          const message = validateField(field, formState[field]);
          if (message) {
            nextErrors[field] = message;
          }
        });
        activeLevels.forEach((level) => {
          if (
            level.isRequired &&
            !resolvedHierarchy[level.id] &&
            editableLevelIds.has(level.id)
          ) {
            nextErrors[`hierarchy.${level.id}`] = `${level.name} is required.`;
          }
        });
        setErrors(nextErrors);
        setTouched({
          ...(isCategoryProductOnly
            ? {}
            : {
                orderNumber: true,
                customerName: true,
                customerEmail: true,
                quantity: true,
                dueDate: true,
              }),
          ...activeLevels.reduce<Record<string, boolean>>((acc, level) => {
            if (editableLevelIds.has(level.id)) {
              acc[`hierarchy.${level.id}`] = true;
            }
            return acc;
          }, {}),
        });
        if (Object.keys(nextErrors).length > 0) {
          return;
        }

        const parsedQuantity = Number(formState.quantity);
        const success = await Promise.resolve(
          onSubmit({
          orderNumber: formState.orderNumber.trim(),
          customerName: formState.customerName.trim(),
          customerEmail: formState.customerEmail.trim() || undefined,
          productName: formState.productName.trim(),
          quantity: parsedQuantity,
          dueDate: formState.dueDate,
          priority: formState.priority as "low" | "normal" | "high" | "urgent",
          notes: formState.notes.trim() || undefined,
          hierarchy: resolvedHierarchy,
          }),
        );
        if (!success) {
          setErrors((prev) => ({
            ...prev,
            form: "Order could not be created. Check required data and try again.",
          }));
          return;
        }
        resetForm();
        setEntryMode(supportsCreateEntryModes ? "choose" : "manual");
        onClose();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {!isCategoryProductOnly && (
          <div key="order-number">
            <InputField
              label="Order #"
              value={formState.orderNumber}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  orderNumber: event.target.value,
                }))
              }
              onBlur={(event) => {
                if (isCategoryProductOnly || isEditingOrderNumber) {
                  return;
                }
                const message = validateField(
                  "orderNumber",
                  event.target.value,
                );
                setErrors((prev) => ({
                  ...prev,
                  orderNumber: message,
                }));
                setTouched((prev) => ({ ...prev, orderNumber: true }));
              }}
              className="h-10 text-sm text-foreground"
              wrapperClassName={`h-10 ${
                touched.orderNumber && errors.orderNumber
                  ? "border-destructive"
                  : "border-border"
              }`}
              placeholder="Accounting Order #"
              required
              disabled={isCategoryProductOnly || isEditingOrderNumber}
              error={
                touched.orderNumber && errors.orderNumber
                  ? errors.orderNumber
                  : !touched.orderNumber && isDuplicateOrderNumber
                    ? "Order number already exists."
                    : undefined
              }
            />
          </div>
        )}

        {contractLevel
          ? renderHierarchyField(contractLevel)
          : !isCategoryProductOnly && (
              <div key="customer-name-fallback">
                <InputField
                  label="Customer Name"
                  icon="user"
                  value={formState.customerName}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      customerName: event.target.value,
                    }))
                  }
                  onBlur={(event) => {
                    if (isCategoryProductOnly) {
                      return;
                    }
                    const message = validateField(
                      "customerName",
                      event.target.value,
                    );
                    setErrors((prev) => ({
                      ...prev,
                      customerName: message,
                    }));
                    setTouched((prev) => ({ ...prev, customerName: true }));
                  }}
                  className="h-10 text-sm text-foreground"
                  wrapperClassName={`h-10 ${
                    touched.customerName && errors.customerName
                      ? "border-destructive"
                      : "border-border"
                  }`}
                  placeholder="Acme Manufacturing"
                  required
                  disabled={isCategoryProductOnly}
                  error={
                    touched.customerName && errors.customerName
                      ? errors.customerName
                      : undefined
                  }
                />
              </div>
            )}

        {!isCategoryProductOnly && contractLevel && (
          <div key="customer-name">
            <InputField
              label="Customer Name"
              icon="user"
              value={formState.customerName}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  customerName: event.target.value,
                }))
              }
              onBlur={(event) => {
                if (isCategoryProductOnly) {
                  return;
                }
                const message = validateField(
                  "customerName",
                  event.target.value,
                );
                setErrors((prev) => ({
                  ...prev,
                  customerName: message,
                }));
                setTouched((prev) => ({ ...prev, customerName: true }));
              }}
              className="h-10 text-sm text-foreground"
              wrapperClassName={`h-10 ${
                touched.customerName && errors.customerName
                  ? "border-destructive"
                  : "border-border"
              }`}
              placeholder="Acme Manufacturing"
              required
              disabled={isCategoryProductOnly}
              error={
                touched.customerName && errors.customerName
                  ? errors.customerName
                  : undefined
              }
            />
          </div>
        )}

        {!isCategoryProductOnly && (
          <div key="customer-email">
            <InputField
              label="Customer Email"
              icon="email"
              value={formState.customerEmail}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  customerEmail: event.target.value,
                }))
              }
              onBlur={(event) => {
                if (isCategoryProductOnly) {
                  return;
                }
                const message = validateField(
                  "customerEmail",
                  event.target.value,
                );
                setErrors((prev) => ({
                  ...prev,
                  customerEmail: message,
                }));
                setTouched((prev) => ({ ...prev, customerEmail: true }));
              }}
              className="h-10 text-sm text-foreground"
              wrapperClassName={`h-10 ${
                touched.customerEmail && errors.customerEmail
                  ? "border-destructive"
                  : "border-border"
              }`}
              placeholder="contact@acme.com"
              type="email"
              disabled={isCategoryProductOnly}
              error={
                touched.customerEmail && errors.customerEmail
                  ? errors.customerEmail
                  : undefined
              }
            />
          </div>
        )}

        {remainingLevels.map((level) => renderHierarchyField(level))}

        {categoryLevel ? renderHierarchyField(categoryLevel) : null}
        {productHierarchyLevel
          ? renderHierarchyField(productHierarchyLevel)
          : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InputField
          label="Quantity"
          value={formState.quantity}
          onChange={(event) =>
            setFormState((prev) => ({
              ...prev,
              quantity: event.target.value,
            }))
          }
          onBlur={(event) => {
            if (isCategoryProductOnly) {
              return;
            }
            const message = validateField("quantity", event.target.value);
            setErrors((prev) => ({
              ...prev,
              quantity: message,
            }));
            setTouched((prev) => ({ ...prev, quantity: true }));
          }}
          className="h-10 text-sm text-foreground"
          wrapperClassName={`h-10 ${
            touched.quantity && errors.quantity
              ? "border-destructive"
              : "border-border"
          }`}
          type="number"
          min={1}
          required
          disabled={isCategoryProductOnly}
          error={
            touched.quantity && errors.quantity ? errors.quantity : undefined
          }
        />
        <div className="space-y-2 text-sm font-medium">
          <DatePicker
            label="Due Date *"
            value={formState.dueDate}
            onChange={(next) => {
              setFormState((prev) => ({
                ...prev,
                dueDate: next,
              }));
              if (isCategoryProductOnly) {
                return;
              }
              const message = validateField("dueDate", next);
              setErrors((prev) => ({
                ...prev,
                dueDate: message,
              }));
              setTouched((prev) => ({ ...prev, dueDate: true }));
            }}
            min={minDueDate}
            disabled={isCategoryProductOnly}
            className=" text-sm font-medium"
            triggerClassName={`h-10 ${
              touched.dueDate && errors.dueDate
                ? "border-destructive"
                : "border-border"
            }`}
          />
          {touched.dueDate && errors.dueDate && (
            <span className="text-xs text-destructive">{errors.dueDate}</span>
          )}
        </div>
      </div>

      <SelectField
        label="Priority"
        value={formState.priority}
        onValueChange={(value) =>
          setFormState((prev) => ({
            ...prev,
            priority: value as "low" | "normal" | "high" | "urgent",
          }))
        }
        disabled={isCategoryProductOnly}
        options={[
          { value: "low", label: "Low" },
          { value: "normal", label: "Normal" },
          { value: "high", label: "High" },
          { value: "urgent", label: "Urgent" },
        ]}
      />

      <TextAreaField
        label="Notes"
        value={formState.notes}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, notes: event.target.value }))
        }
        className="min-h-22.5"
        placeholder="Special requirements or additional information..."
        disabled={isCategoryProductOnly}
      />

      {errors.form ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errors.form}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-6 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEntryMode(supportsCreateEntryModes ? "choose" : "manual");
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitDisabled}>
          {submitLabel}
        </Button>
      </div>
    </form>,
  );
}


