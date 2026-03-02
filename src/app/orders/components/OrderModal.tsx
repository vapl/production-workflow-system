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
import { MapPinIcon, XIcon } from "lucide-react";
import { useOrderFieldSettings } from "@/app/settings/OrderFieldSettingsContext";
import type { ReactNode } from "react";
import { getAccountingAdapter } from "@/lib/integrations/accounting/getAdapter";
import type { AccountingOrder } from "@/lib/integrations/accounting/types";
import { useI18n } from "@/lib/i18n/useI18n";
import { ORDER_CORE_FIELD_KEYS } from "@/lib/domain/orderCoreFields";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { useAssignmentLabels } from "@/hooks/useAssignmentLabels";
import type { OrderStatus } from "@/types/orders";
import {
  getOrderFieldLabel,
  getOrderStatusLabel,
} from "@/lib/domain/orderFieldPresentation";
import { supabase } from "@/lib/supabaseClient";

export interface OrderFormValues {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  productName: string;
  quantity?: number;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
  notes?: string;
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  assignedManagerId?: string;
  assignedManagerName?: string;
  orderFieldValues?: Record<string, string>;
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
  status: "draft",
  notes: "",
  assignedEngineerId: "",
  assignedEngineerName: "",
  assignedManagerId: "",
  assignedManagerName: "",
};

export function OrderModal({
  open,
  onClose,
  onSubmit,
  title,
  submitLabel,
  initialValues,
  editMode = "full",
  existingOrderNumbers = [],
  enableCreateEntryModeSelection = false,
  onOpenImportExcel,
}: OrderModalProps) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { rules } = useWorkflowRules();
  const { engineer: engineerLabel, manager: managerLabel } =
    useAssignmentLabels();
  const resolvedTitle = title ?? t("orders.page.createOrderTitle");
  const resolvedSubmitLabel = submitLabel ?? t("orders.page.createOrder");
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
    status: defaultValues.status,
    notes: defaultValues.notes ?? "",
    assignedEngineerId: defaultValues.assignedEngineerId ?? "",
    assignedEngineerName: defaultValues.assignedEngineerName ?? "",
    assignedManagerId: defaultValues.assignedManagerId ?? "",
    assignedManagerName: defaultValues.assignedManagerName ?? "",
    orderFieldValues: {} as Record<string, string>,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [orderFieldInput, setOrderFieldInput] = useState<
    Record<string, string>
  >({});
  const { orderFields } = useOrderFieldSettings();
  const coreFieldsByKey = useMemo(
    () => new Map(orderFields.map((field) => [field.key, field])),
    [orderFields],
  );
  const orderNumberField = coreFieldsByKey.get("order_number");
  const customerField = coreFieldsByKey.get("customer_name");
  const quantityField = coreFieldsByKey.get("quantity");
  const dueDateField = coreFieldsByKey.get("due_date");
  const engineerField = coreFieldsByKey.get("engineer");
  const managerField = coreFieldsByKey.get("manager");
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const metadataCoreFields = useMemo(
    () =>
      orderFields
        .filter(
          (field) =>
            field.isActive &&
            (field.key === "delivery_address" ||
              field.key === "customer_phone"),
        )
        .sort((a, b) => a.order - b.order),
    [orderFields],
  );
  const statusOptions = useMemo(
    () =>
      (
        [
          "draft",
          "ready_for_engineering",
          "in_engineering",
          "engineering_blocked",
          "ready_for_production",
          "in_production",
          "done",
        ] as OrderStatus[]
      )
        .filter((status) => rules.orderStatusConfig?.[status]?.isActive ?? true)
        .map((status) => ({
          value: status,
          label: getOrderStatusLabel(status, t, rules.statusLabels?.[status]),
        })),
    [rules.orderStatusConfig, rules.statusLabels, t],
  );
  const activeOrderFields = useMemo(
    () =>
      orderFields
        .filter(
          (level) => level.isActive && !ORDER_CORE_FIELD_KEYS.has(level.key),
        )
        .sort((a, b) => a.order - b.order),
    [orderFields],
  );
  const isCategoryProductOnly = editMode === "category-product-only";
  const editableLevelIds = useMemo(() => {
    if (!isCategoryProductOnly) {
      return new Set(activeOrderFields.map((level) => level.id));
    }
    const allowedKeys = new Set(["category", "product"]);
    return new Set(
      activeOrderFields
        .filter((level) => allowedKeys.has(level.key))
        .map((level) => level.id),
    );
  }, [activeOrderFields, isCategoryProductOnly]);
  const productLevel = useMemo(
    () => activeOrderFields.find((level) => level.key === "product"),
    [activeOrderFields],
  );
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
  const [
    accountingImportStatusByExternalId,
    setAccountingImportStatusByExternalId,
  ] = useState<Record<string, AccountingImportStatus>>({});
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
      setAccountingLoadError(t("orders.modal.accounting.loadFailed"));
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
    const tenantId = user.tenantId;
    const sb = supabase;
    if (!tenantId || !sb || !open) {
      setEngineers([]);
      setManagers([]);
      return;
    }

    let isMounted = true;

    const fetchAssignees = async () => {
      const [engineersResult, managersResult] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name")
          .eq("tenant_id", tenantId)
          .eq("role", "Engineering"),
        sb
          .from("profiles")
          .select("id, full_name")
          .eq("tenant_id", tenantId)
          .in("role", ["Sales", "Admin"]),
      ]);

      if (!isMounted) {
        return;
      }

      setEngineers(
        engineersResult.error
          ? []
          : (engineersResult.data ?? []).map((row) => ({
              id: row.id,
              name:
                row.full_name ??
                engineerLabel,
            })),
      );

      setManagers(
        managersResult.error
          ? []
          : (managersResult.data ?? []).map((row) => ({
              id: row.id,
              name:
                row.full_name ??
                managerLabel,
            })),
      );
    };

    void fetchAssignees();

    return () => {
      isMounted = false;
    };
  }, [engineerLabel, managerLabel, open, user.tenantId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextValues = {
      ...defaultValues,
      ...initialValues,
    };
    const nextProductName =
      (productLevel && nextValues.orderFieldValues?.[productLevel.id]) ||
      nextValues.productName;
    const nextOrderFieldValues: Record<string, string> = {};
    const nextOrderFieldInput: Record<string, string> = {};
    activeOrderFields.forEach((level) => {
      const rawValue = nextValues.orderFieldValues?.[level.id];
      if (!rawValue) {
        return;
      }
      nextOrderFieldValues[level.id] = rawValue;
      nextOrderFieldInput[level.id] = rawValue;
    });
    setFormState({
      orderNumber: nextValues.orderNumber ?? "",
      customerName: nextValues.customerName,
      customerEmail: nextValues.customerEmail ?? "",
      productName: nextProductName,
      quantity: String(nextValues.quantity ?? 1),
      dueDate: nextValues.dueDate,
      priority: nextValues.priority,
      status: nextValues.status ?? "draft",
      notes: nextValues.notes ?? "",
      assignedEngineerId: nextValues.assignedEngineerId ?? "",
      assignedEngineerName: nextValues.assignedEngineerName ?? "",
      assignedManagerId:
        nextValues.assignedManagerId ??
        (!initialValues?.orderNumber &&
        (user.role === "Sales" || user.isAdmin) &&
        user.id
          ? user.id
          : ""),
      assignedManagerName: nextValues.assignedManagerName ?? "",
      orderFieldValues: nextOrderFieldValues,
    });
    setErrors({});
    setTouched({});
    setOrderFieldInput(nextOrderFieldInput);
  }, [
    activeOrderFields,
    initialValues,
    open,
    productLevel,
    user.id,
    user.isAdmin,
    user.role,
  ]);

  useEffect(() => {
    if (!open || initialValues?.orderNumber) {
      return;
    }
    if (!(user.role === "Sales" || user.isAdmin) || !user.id) {
      return;
    }
    setFormState((prev) => {
      if (prev.assignedManagerId) {
        return prev;
      }
      return {
        ...prev,
        assignedManagerId: user.id,
        assignedManagerName: user.name ?? prev.assignedManagerName,
      };
    });
  }, [
    initialValues?.orderNumber,
    open,
    user.id,
    user.isAdmin,
    user.name,
    user.role,
  ]);

  function resetForm() {
    setFormState({
      orderNumber: defaultValues.orderNumber,
      customerName: defaultValues.customerName,
      customerEmail: defaultValues.customerEmail ?? "",
      productName: defaultValues.productName,
      quantity: String(defaultValues.quantity),
      dueDate: defaultValues.dueDate,
      priority: defaultValues.priority,
      status: defaultValues.status,
      notes: defaultValues.notes ?? "",
      assignedEngineerId: defaultValues.assignedEngineerId ?? "",
      assignedEngineerName: defaultValues.assignedEngineerName ?? "",
      assignedManagerId: defaultValues.assignedManagerId ?? "",
      assignedManagerName: defaultValues.assignedManagerName ?? "",
      orderFieldValues: {},
    });
    setErrors({});
    setTouched({});
    setOrderFieldInput({});
  }

  function validateField(field: string, value: string) {
    switch (field) {
      case "customerName":
        return value.trim()
          ? ""
          : t("orders.modal.validation.customerNameRequired");
      case "orderNumber":
        if (!value.trim()) {
          return t("orders.modal.validation.orderNumberRequired");
        }
        if (isDuplicateOrderNumber) {
          return t("orders.modal.validation.orderNumberExists");
        }
        return "";
      case "customerEmail":
        return value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? t("orders.modal.validation.customerEmailInvalid")
          : "";
      case "productName":
        return "";
      case "quantity": {
        if (!quantityField?.isRequired && !value.trim()) {
          return "";
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
          ? ""
          : t("orders.modal.validation.quantityPositive");
      }
      case "dueDate": {
        if (!dueDateField?.isRequired && !value) {
          return "";
        }
        if (!value) {
          return t("orders.modal.validation.dueDateRequired");
        }
        if (isEditingOrderNumber) {
          return "";
        }
        const today = new Date();
        const dueDate = new Date(value);
        today.setHours(0, 0, 0, 0);
        return dueDate < today ? t("orders.modal.validation.dueDatePast") : "";
      }
      case "assignedEngineerName":
        return engineerField?.isRequired && !formState.assignedEngineerId.trim()
          ? t("orders.modal.levelRequired", {
              level: getOrderFieldLabel(
                engineerField.key,
                t,
                engineerField.name,
              ),
            })
          : "";
      case "assignedManagerName":
        return managerField?.isRequired && !formState.assignedManagerId.trim()
          ? t("orders.modal.levelRequired", {
              level: getOrderFieldLabel(managerField.key, t, managerField.name),
            })
          : "";
      default:
        return "";
    }
  }

  function handleOrderFieldChange(levelId: string, value: string) {
    setFormState((prev) => {
      const nextOrderFieldValues = {
        ...prev.orderFieldValues,
        [levelId]: value,
      };
      // Do not clear lower orderFields on manual input; many orderFields are independent.
      const productLevel = activeOrderFields.find(
        (level) => level.key === "product",
      );
      if (productLevel && levelId === productLevel.id) {
        return {
          ...prev,
          orderFieldValues: nextOrderFieldValues,
          productName: value,
        };
      }
      return { ...prev, orderFieldValues: nextOrderFieldValues };
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
            <h2 className="text-lg font-semibold">{resolvedTitle}</h2>
            <button
              type="button"
              onClick={() => {
                setEntryMode(supportsCreateEntryModes ? "choose" : "manual");
                onClose();
              }}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("orders.modal.closeModal")}
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
          {t("orders.modal.choose.description")}
        </p>
        <button
          type="button"
          className="w-full rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => setEntryMode("manual")}
        >
          <div className="text-sm font-semibold">
            {t("orders.modal.choose.manualTitle")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("orders.modal.choose.manualDescription")}
          </div>
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-border p-4 text-left transition hover:bg-muted/40"
          onClick={() => {
            void handleEnterAccountingMode();
          }}
        >
          <div className="text-sm font-semibold">
            {t("orders.modal.choose.accountingTitle")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("orders.modal.choose.accountingDescription")}
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
          <div className="text-sm font-semibold">
            {t("orders.modal.choose.csvTitle")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("orders.modal.choose.csvDescription")}
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
            {t("orders.page.cancel")}
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
        const visibleIds = new Set(
          filteredAccountingOrders.map((row) => row.externalId),
        );
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

    function resolveOrderFieldValue(levelKey: string, rawValue?: string) {
      void levelKey;
      return rawValue?.trim() ?? "";
    }

    function mapAccountingOrderToFormValues(oneSelectedOrder: AccountingOrder) {
      const nextOrderFieldValues: Record<string, string> = {};
      const nextOrderFieldInput: Record<string, string> = {};
      const contractValue = resolveOrderFieldValue(
        "contract",
        oneSelectedOrder.contract,
      );
      if (contractValue) {
        const level = activeOrderFields.find((item) => item.key === "contract");
        if (level) {
          nextOrderFieldValues[level.id] = contractValue;
          nextOrderFieldInput[level.id] = oneSelectedOrder.contract ?? "";
        }
      }
      const categoryValue = resolveOrderFieldValue(
        "category",
        oneSelectedOrder.category,
      );
      if (categoryValue) {
        const level = activeOrderFields.find((item) => item.key === "category");
        if (level) {
          nextOrderFieldValues[level.id] = categoryValue;
          nextOrderFieldInput[level.id] = oneSelectedOrder.category ?? "";
        }
      }
      const productValue = resolveOrderFieldValue(
        "product",
        oneSelectedOrder.product ?? oneSelectedOrder.productName,
      );
      if (productValue) {
        const level = activeOrderFields.find((item) => item.key === "product");
        if (level) {
          nextOrderFieldValues[level.id] = productValue;
          nextOrderFieldInput[level.id] =
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
        orderFieldValues: nextOrderFieldValues,
        status: "draft",
      };

      return { values, orderFieldInput: nextOrderFieldInput };
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
        status: "draft",
        notes: mapped.values.notes ?? "",
        assignedEngineerId: "",
        assignedEngineerName: "",
        assignedManagerId: "",
        assignedManagerName: "",
        orderFieldValues: mapped.values.orderFieldValues ?? {},
      });
      setOrderFieldInput(mapped.orderFieldInput);
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
        if (
          !row.orderNumber.trim() ||
          knownOrderNumbers.has(normalizedOrderNumber)
        ) {
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
        t("orders.modal.accounting.importSummary", {
          imported,
          skipped,
          error,
        }),
      );
      setIsAccountingImporting(false);
    }

    return renderModalFrame(
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="text-sm font-semibold">
            {t("orders.modal.accounting.title")}
          </div>
          <Input
            type="search"
            icon="search"
            value={accountingQuery}
            onChange={(event) => setAccountingQuery(event.target.value)}
            placeholder={t("orders.modal.accounting.searchPlaceholder")}
            className="h-10"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t("orders.modal.accounting.rowsCount", {
                count: filteredAccountingOrders.length,
              })}
            </span>
            <span>/</span>
            <span>
              {t("orders.modal.accounting.selectedCount", {
                count: selectedAccountingExternalIds.length,
              })}
            </span>
            <span>/</span>
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              onClick={() => {
                void loadAccountingOrders();
              }}
            >
              {t("orders.modal.accounting.refresh")}
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
                      onChange={(event) =>
                        toggleAllVisible(event.target.checked)
                      }
                      aria-label={t("orders.modal.accounting.selectAllVisible")}
                    />
                  </TableHead>
                  <TableHead>{t("orders.page.orderNumberShort")}</TableHead>
                  <TableHead>{t("orders.page.customer")}</TableHead>
                  <TableHead>{t("orders.page.dueDate")}</TableHead>
                  <TableHead>{t("orders.page.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAccountingLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      {t("orders.modal.accounting.loading")}
                    </TableCell>
                  </TableRow>
                ) : accountingLoadError ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-destructive py-6"
                    >
                      {accountingLoadError}
                    </TableCell>
                  </TableRow>
                ) : filteredAccountingOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      {t("orders.modal.accounting.empty")}
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
                            aria-label={t(
                              "orders.modal.accounting.selectOrder",
                              {
                                orderNumber: order.orderNumber,
                              },
                            )}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {order.orderNumber}
                        </TableCell>
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
                            {t(`orders.modal.accounting.status.${status}`)}
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
            <div className="text-sm font-semibold">
              {t("orders.modal.accounting.previewTitle")}
            </div>
            {!oneSelected && selectedRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("orders.modal.accounting.previewEmpty")}
              </p>
            ) : null}
            {selectedRows.length > 1 ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  {t("orders.modal.accounting.selectedCount", {
                    count: selectedRows.length,
                  })}
                </p>
                <p>{t("orders.modal.accounting.singlePreviewHint")}</p>
                <p>
                  {t("orders.modal.accounting.previewNew", {
                    count: importCounts.new,
                  })}
                </p>
                <p>
                  {t("orders.modal.accounting.previewSkipped", {
                    count: importCounts.skipped,
                  })}
                </p>
                <p>
                  {t("orders.modal.accounting.previewImported", {
                    count: importCounts.imported,
                  })}
                </p>
                <p>
                  {t("orders.modal.accounting.previewErrors", {
                    count: importCounts.error,
                  })}
                </p>
              </div>
            ) : null}
            {oneSelected ? (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.page.orderNumberShort")}:
                  </span>{" "}
                  <span className="font-medium">{oneSelected.orderNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.page.customer")}:
                  </span>{" "}
                  <span className="font-medium">
                    {oneSelected.customerName}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.modal.contract")}:
                  </span>{" "}
                  <span>{oneSelected.contract ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.modal.category")}:
                  </span>{" "}
                  <span>{oneSelected.category ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.modal.product")}:
                  </span>{" "}
                  <span>
                    {oneSelected.productName ?? oneSelected.product ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.page.quantity")}:
                  </span>{" "}
                  <span>{oneSelected.quantity ?? 1}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("orders.page.dueDate")}:
                  </span>{" "}
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
            {t("orders.modal.back")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={useSelectedInForm}
            disabled={!oneSelected}
          >
            {t("orders.modal.accounting.useSelectedInForm")}
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              void importSelectedToPws();
            }}
            disabled={selectedRows.length === 0 || isAccountingImporting}
          >
            {isAccountingImporting
              ? t("orders.modal.accounting.importing")
              : t("orders.modal.accounting.importSelected")}
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
      (!orderNumberField?.isRequired || formState.orderNumber.trim()) &&
      (!customerField?.isRequired || formState.customerName.trim()) &&
      (!quantityField?.isRequired || formState.quantity.trim()) &&
      (!dueDateField?.isRequired || formState.dueDate.trim()) &&
      (!managerField?.isRequired || formState.assignedManagerName.trim()) &&
      !isDuplicateOrderNumber &&
      !validateField("quantity", formState.quantity) &&
      !validateField("dueDate", formState.dueDate) &&
      !validateField("assignedManagerName", formState.assignedManagerName);
    if (!baseValid) {
      return false;
    }
    const requiredMetadataOk = metadataCoreFields.every((field) => {
      if (!field.isRequired) {
        return true;
      }
      return Boolean(formState.orderFieldValues[field.id]?.trim());
    });
    if (!requiredMetadataOk) {
      return false;
    }
    const requiredOrderFieldValuesOk = activeOrderFields.every((level) => {
      if (!level.isRequired || !editableLevelIds.has(level.id)) {
        return true;
      }
      return Boolean(
        formState.orderFieldValues[level.id] ||
        orderFieldInput[level.id]?.trim(),
      );
    });
    return requiredOrderFieldValuesOk;
  })();
  const hasErrors = Object.values(errors).some(Boolean);
  const isSubmitDisabled =
    (!requiredFieldsValid && !isCategoryProductOnly) ||
    hasErrors ||
    isDuplicateOrderNumber;
  const modalFieldOrder: Record<string, number> = {
    order_number: 10,
    customer_name: 20,
    delivery_address: 30,
    customer_phone: 40,
    customer_email: 50,
    quantity: 60,
    due_date: 70,
    manager: 80,
    priority: 90,
  };
  const configuredModalFields = orderFields
    .filter(
      (field) =>
        field.isActive &&
        field.key !== "actions" &&
        field.key !== "engineer" &&
        field.key !== "status",
    )
    .sort((a, b) => {
      const aOrder = modalFieldOrder[a.key] ?? 1000 + a.order;
      const bOrder = modalFieldOrder[b.key] ?? 1000 + b.order;
      return aOrder - bOrder;
    });
  const orderedModalFields = isCategoryProductOnly
    ? configuredModalFields.filter(
        (field) =>
          !ORDER_CORE_FIELD_KEYS.has(field.key) &&
          editableLevelIds.has(field.id),
      )
    : [
        ...configuredModalFields,
        {
          id: "customer-email",
          name: t("orders.modal.customerEmail"),
          key: "customer_email",
          order: 50,
          isRequired: false,
          isActive: true,
          showInTable: false,
        },
      ]
        .filter(
          (field, index, all) =>
            all.findIndex((candidate) => candidate.key === field.key) === index,
        )
        .sort((a, b) => {
          const aOrder = modalFieldOrder[a.key] ?? 1000 + a.order;
          const bOrder = modalFieldOrder[b.key] ?? 1000 + b.order;
          return aOrder - bOrder;
        });

  function renderMetadataCoreField(field: (typeof metadataCoreFields)[number]) {
    const errorKey = `orderFieldValues.${field.id}`;
    const label = getOrderFieldLabel(field.key, t, field.name);
    return (
      <InputField
        key={field.id}
        label={label}
        required={field.isRequired}
        value={formState.orderFieldValues[field.id] ?? ""}
        onChange={(event) =>
          setFormState((prev) => ({
            ...prev,
            orderFieldValues: {
              ...prev.orderFieldValues,
              [field.id]: event.target.value,
            },
          }))
        }
        onBlur={(event) => {
          const value = event.target.value.trim();
          setTouched((prev) => ({ ...prev, [errorKey]: true }));
          setFormState((prev) => ({
            ...prev,
            orderFieldValues: {
              ...prev.orderFieldValues,
              [field.id]: value,
            },
          }));
          setErrors((prev) => ({
            ...prev,
            [errorKey]:
              field.isRequired && !value
                ? t("orders.modal.levelRequired", { level: label })
                : "",
          }));
        }}
        type={field.key === "customer_phone" ? "tel" : "text"}
        icon={field.key === "customer_phone" ? "phone" : undefined}
        startIcon={
          field.key === "delivery_address" ? (
            <MapPinIcon className="h-4 w-4" />
          ) : undefined
        }
        className="h-10 text-sm text-foreground"
        wrapperClassName={`h-10 ${
          touched[errorKey] && errors[errorKey]
            ? "border-destructive"
            : "border-border"
        }`}
        error={
          touched[errorKey] && errors[errorKey] ? errors[errorKey] : undefined
        }
      />
    );
  }

  function renderCustomerEmailField() {
    return (
      <div key="customer-email">
        <InputField
          label={t("orders.modal.customerEmail")}
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
            const message = validateField("customerEmail", event.target.value);
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
          placeholder={t("orders.modal.customerEmailPlaceholder")}
          type="email"
          disabled={isCategoryProductOnly}
          error={
            touched.customerEmail && errors.customerEmail
              ? errors.customerEmail
              : undefined
          }
        />
      </div>
    );
  }

  function renderConfiguredField(
    field: (typeof orderedModalFields)[number],
  ): ReactNode {
    if (field.key === "customer_email") {
      return isCategoryProductOnly ? null : renderCustomerEmailField();
    }

    if (!ORDER_CORE_FIELD_KEYS.has(field.key)) {
      return renderOrderField(field);
    }

    const localizedLabel =
      field.key === "engineer"
        ? engineerLabel
        : field.key === "manager"
          ? managerLabel
          : getOrderFieldLabel(field.key, t, field.name);

    switch (field.key) {
      case "order_number":
        return !isCategoryProductOnly ? (
          <div key="order-number">
            <InputField
              label={localizedLabel}
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
              placeholder={t("orders.modal.orderNumberPlaceholder")}
              required={field.isRequired}
              disabled={isCategoryProductOnly || isEditingOrderNumber}
              error={
                touched.orderNumber && errors.orderNumber
                  ? errors.orderNumber
                  : !touched.orderNumber && isDuplicateOrderNumber
                    ? t("orders.modal.validation.orderNumberExists")
                    : undefined
              }
            />
          </div>
        ) : null;
      case "customer_name":
        return !isCategoryProductOnly ? (
          <div key="customer-name">
            <InputField
              label={localizedLabel}
              icon="user"
              value={formState.customerName}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  customerName: event.target.value,
                }))
              }
              onBlur={(event) => {
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
              placeholder={t("orders.modal.customerNamePlaceholder")}
              required={field.isRequired}
              disabled={isCategoryProductOnly}
              error={
                touched.customerName && errors.customerName
                  ? errors.customerName
                  : undefined
              }
            />
          </div>
        ) : null;
      case "quantity":
        return (
          <InputField
            key={field.id}
            label={localizedLabel}
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
            required={field.isRequired}
            disabled={isCategoryProductOnly}
            error={
              touched.quantity && errors.quantity ? errors.quantity : undefined
            }
          />
        );
      case "due_date":
        return (
          <div key={field.id} className="space-y-2 text-sm font-medium">
            <DatePicker
              label={`${localizedLabel}${field.isRequired ? " *" : ""}`}
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
              className="text-sm font-medium"
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
        );
      case "engineer":
        return (
          <SelectField
            key={field.id}
            label={localizedLabel}
            value={formState.assignedEngineerId || "__none__"}
            onValueChange={(value) => {
              const selectedId = value === "__none__" ? "" : value;
              const selectedEngineer = engineers.find(
                (engineer) => engineer.id === selectedId,
              );
              setFormState((prev) => ({
                ...prev,
                assignedEngineerId: selectedId,
                assignedEngineerName: selectedEngineer?.name ?? "",
              }));
              const message = validateField(
                "assignedEngineerName",
                selectedEngineer?.name ?? "",
              );
              setErrors((prev) => ({
                ...prev,
                assignedEngineerName: message,
              }));
              setTouched((prev) => ({
                ...prev,
                assignedEngineerName: true,
              }));
            }}
            options={[
              { value: "__none__", label: "--" },
              ...engineers.map((engineer) => ({
                value: engineer.id,
                label: engineer.name,
              })),
            ]}
            required={field.isRequired}
            disabled={isCategoryProductOnly}
            triggerClassName={
              touched.assignedEngineerName && errors.assignedEngineerName
                ? "border-destructive"
                : "border-border"
            }
            error={
              touched.assignedEngineerName && errors.assignedEngineerName
                ? errors.assignedEngineerName
                : undefined
            }
          />
        );
      case "manager":
        return (
          <SelectField
            key={field.id}
            label={localizedLabel}
            value={formState.assignedManagerId || "__none__"}
            onValueChange={(value) => {
              const selectedId = value === "__none__" ? "" : value;
              const selectedManager = managers.find(
                (manager) => manager.id === selectedId,
              );
              setFormState((prev) => ({
                ...prev,
                assignedManagerId: selectedId,
                assignedManagerName: selectedManager?.name ?? "",
              }));
              const message = validateField(
                "assignedManagerName",
                selectedManager?.name ?? "",
              );
              setErrors((prev) => ({
                ...prev,
                assignedManagerName: message,
              }));
              setTouched((prev) => ({
                ...prev,
                assignedManagerName: true,
              }));
            }}
            options={[
              { value: "__none__", label: "--" },
              ...managers.map((manager) => ({
                value: manager.id,
                label: manager.name,
              })),
            ]}
            required={field.isRequired}
            disabled={isCategoryProductOnly}
            triggerClassName={
              touched.assignedManagerName && errors.assignedManagerName
                ? "border-destructive"
                : "border-border"
            }
            error={
              touched.assignedManagerName && errors.assignedManagerName
                ? errors.assignedManagerName
                : undefined
            }
          />
        );
      case "priority":
        return (
          <SelectField
            key={field.id}
            label={localizedLabel}
            value={formState.priority}
            onValueChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                priority: value as "low" | "normal" | "high" | "urgent",
              }))
            }
            required={field.isRequired}
            disabled={isCategoryProductOnly}
            options={[
              { value: "low", label: t("orders.modal.priority.low") },
              { value: "normal", label: t("orders.modal.priority.normal") },
              { value: "high", label: t("orders.modal.priority.high") },
              { value: "urgent", label: t("orders.modal.priority.urgent") },
            ]}
          />
        );
      case "status":
        return (
          <SelectField
            key={field.id}
            label={localizedLabel}
            value={formState.status}
            onValueChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                status: value as OrderStatus,
              }))
            }
            required={field.isRequired}
            disabled={isCategoryProductOnly}
            options={statusOptions}
          />
        );
      case "delivery_address":
      case "customer_phone":
        return renderMetadataCoreField(field);
      default:
        return null;
    }
  }

  function renderOrderField(level: (typeof activeOrderFields)[number]) {
    const errorKey = `orderFieldValues.${level.id}`;
    return (
      <div key={level.id} className="space-y-2">
        <InputField
          label={level.name}
          required={level.isRequired}
          value={orderFieldInput[level.id] ?? ""}
          onChange={(event) => {
            if (!editableLevelIds.has(level.id)) {
              return;
            }
            const value = event.target.value;
            setOrderFieldInput((prev) => ({
              ...prev,
              [level.id]: value,
            }));
            handleOrderFieldChange(level.id, value);
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
              handleOrderFieldChange(level.id, "");
              setOrderFieldInput((prev) => ({
                ...prev,
                [level.id]: "",
              }));
              if (level.isRequired) {
                setErrors((prev) => ({
                  ...prev,
                  [errorKey]: t("orders.modal.levelRequired", {
                    level: level.name,
                  }),
                }));
              }
              return;
            }
            handleOrderFieldChange(level.id, rawValue);
            setOrderFieldInput((prev) => ({
              ...prev,
              [level.id]: rawValue,
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
          placeholder={t("orders.modal.searchOrEnterLevel", {
            level: level.name,
          })}
          disabled={!editableLevelIds.has(level.id)}
          error={
            touched[errorKey] && errors[errorKey] ? errors[errorKey] : undefined
          }
        />
      </div>
    );
  }

  return renderModalFrame(
    <form
      className="space-y-4 pb-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const resolvedOrderFieldValues = { ...formState.orderFieldValues };
        activeOrderFields.forEach((level) => {
          const inputValue = orderFieldInput[level.id]?.trim();
          if (!inputValue) {
            return;
          }
          resolvedOrderFieldValues[level.id] = inputValue;
        });
        const nextErrors: Record<string, string> = {};
        (
          [
            "orderNumber",
            "customerName",
            "customerEmail",
            "quantity",
            "dueDate",
            "assignedEngineerName",
            "assignedManagerName",
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
        activeOrderFields.forEach((level) => {
          if (
            level.isRequired &&
            !resolvedOrderFieldValues[level.id] &&
            editableLevelIds.has(level.id)
          ) {
            nextErrors[`orderFieldValues.${level.id}`] = t(
              "orders.modal.levelRequired",
              {
                level: level.name,
              },
            );
          }
        });
        metadataCoreFields.forEach((field) => {
          if (field.isRequired && !resolvedOrderFieldValues[field.id]?.trim()) {
            nextErrors[`orderFieldValues.${field.id}`] = t(
              "orders.modal.levelRequired",
              { level: getOrderFieldLabel(field.key, t, field.name) },
            );
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
                assignedEngineerName: true,
                assignedManagerName: true,
              }),
          ...activeOrderFields.reduce<Record<string, boolean>>((acc, level) => {
            if (editableLevelIds.has(level.id)) {
              acc[`orderFieldValues.${level.id}`] = true;
            }
            return acc;
          }, {}),
          ...metadataCoreFields.reduce<Record<string, boolean>>(
            (acc, field) => {
              acc[`orderFieldValues.${field.id}`] = true;
              return acc;
            },
            {},
          ),
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
            quantity: formState.quantity.trim() ? parsedQuantity : undefined,
            dueDate: formState.dueDate,
            priority: formState.priority as
              | "low"
              | "normal"
              | "high"
              | "urgent",
            status: formState.status,
            notes: formState.notes.trim() || undefined,
            assignedEngineerId:
              formState.assignedEngineerId.trim() || undefined,
            assignedEngineerName:
              formState.assignedEngineerName.trim() || undefined,
            assignedManagerId: formState.assignedManagerId.trim() || undefined,
            assignedManagerName:
              formState.assignedManagerName.trim() || undefined,
            orderFieldValues: resolvedOrderFieldValues,
          }),
        );
        if (!success) {
          setErrors((prev) => ({
            ...prev,
            form: t("orders.modal.createFailed"),
          }));
          return;
        }
        resetForm();
        setEntryMode(supportsCreateEntryModes ? "choose" : "manual");
        onClose();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {orderedModalFields.map((field) => renderConfiguredField(field))}
      </div>

      <TextAreaField
        label={t("orders.modal.notes")}
        value={formState.notes}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, notes: event.target.value }))
        }
        className="min-h-22.5"
        placeholder={t("orders.modal.notesPlaceholder")}
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
          {t("orders.page.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitDisabled}>
          {resolvedSubmitLabel}
        </Button>
      </div>
    </form>,
  );
}
