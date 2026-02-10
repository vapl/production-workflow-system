"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import type { OrderInputField } from "@/types/orderInputs";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";

type Priority = "low" | "normal" | "high" | "urgent";

type Station = {
  id: string;
  name: string;
  sortOrder: number;
};

type ProductionItemRow = {
  id: string;
  order_id: string;
  batch_code: string;
  item_name: string;
  qty: number;
  material: string | null;
  status: "queued" | "in_progress" | "blocked" | "done";
  station_id: string | null;
  meta: Record<string, unknown> | null;
  duration_minutes?: number | null;
  orders?: {
    order_number: string | null;
    due_date: string | null;
    priority: Priority | null;
    customer_name: string | null;
  } | null;
};

type ReadyOrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  due_date: string;
  priority: Priority;
  quantity: number | null;
  product_name: string | null;
  production_duration_minutes?: number | null;
};

type OrderAttachmentRow = {
  id: string;
  order_id: string;
  name: string | null;
  url: string | null;
  category: string | null;
  created_at: string;
};

type BatchRunRow = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  route_key: string;
  step_index: number;
  status: "queued" | "in_progress" | "blocked" | "done";
  blocked_reason?: string | null;
  blocked_reason_id?: string | null;
  planned_date?: string | null;
  started_at: string | null;
  done_at: string | null;
  duration_minutes?: number | null;
  orders?: {
    order_number: string | null;
    due_date: string | null;
    priority: Priority | null;
    customer_name: string | null;
  } | null;
};

type BatchGroup = {
  key: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: Priority;
  batchCode: string;
  totalQty: number;
  material: string;
};

type QueueItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: Priority;
  status: BatchRunRow["status"];
  batchCode: string;
  totalQty: number;
  material: string;
  startedAt?: string | null;
  doneAt?: string | null;
  durationMinutes?: number | null;
  items: ProductionItemRow[];
};

const productionAttachmentCategory = "production_report";

function priorityBadge(priority: Priority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function statusBadge(status: BatchRunRow["status"]) {
  if (status === "blocked") return "status-engineering_blocked";
  if (status === "in_progress") return "status-in_engineering";
  if (status === "done") return "status-ready_for_production";
  return "status-draft";
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 8,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function buildDayTime(date: Date, timeValue: string) {
  const { hours, minutes } = parseTime(timeValue);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function computeWorkingMinutes(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  workStart: string,
  workEnd: string,
) {
  if (!startIso) return 0;
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  if (end <= start) {
    return 0;
  }
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let totalMinutes = 0;
  for (
    let day = new Date(startDay);
    day <= endDay;
    day.setDate(day.getDate() + 1)
  ) {
    const dayStart = buildDayTime(day, workStart);
    const dayEnd = buildDayTime(day, workEnd);
    const rangeStart = dayStart > start ? dayStart : start;
    const rangeEnd = dayEnd < end ? dayEnd : end;
    if (rangeEnd > rangeStart) {
      totalMinutes += Math.floor(
        (rangeEnd.getTime() - rangeStart.getTime()) / 60000,
      );
    }
  }
  return totalMinutes;
}

function formatDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDateInput(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
}

type DatePickerFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
  min?: string;
};

function DatePickerField({
  label,
  value,
  onChange,
  className,
  disabled,
  min,
}: DatePickerFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openPicker = () => {
    if (disabled) return;
    const target = inputRef.current as (HTMLInputElement & {
      showPicker?: () => void;
    }) | null;
    if (!target) return;
    if (typeof target.showPicker === "function") {
      target.showPicker();
    } else {
      target.focus();
    }
  };
  return (
    <label className={className ?? "space-y-1 text-xs text-muted-foreground"}>
      {label}
      <div className="relative cursor-pointer" onClick={openPicker}>
        <input
          type="text"
          readOnly
          value={formatDateInput(value)}
          placeholder="DD.MM.YYYY"
          className="h-9 w-full cursor-pointer rounded-lg border border-border bg-input-background px-3 pr-9 text-sm text-foreground"
          onClick={openPicker}
        />
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          min={min}
          className="absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    </label>
  );
}

export default function ProductionPage() {
  const user = useCurrentUser();
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("default");
  const [plannedDate, setPlannedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [viewDate, setViewDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const [plannedRangeDays, setPlannedRangeDays] = useState(7);
  const [stations, setStations] = useState<Station[]>([]);
  const [readyOrders, setReadyOrders] = useState<ReadyOrderRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [readySearch, setReadySearch] = useState("");
  const [readyPriority, setReadyPriority] = useState<Priority | "all">("all");
  const [workdayStart, setWorkdayStart] = useState("08:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
  const [removeHintId, setRemoveHintId] = useState<string | null>(null);
  const removeHintTimer = useRef<number | null>(null);
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const [productionFields, setProductionFields] = useState<OrderInputField[]>(
    [],
  );
  const [productionValues, setProductionValues] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [productionAttachments, setProductionAttachments] = useState<
    Record<string, OrderAttachmentRow[]>
  >({});
  const [signedProductionUrls, setSignedProductionUrls] = useState<
    Record<string, string>
  >({});
  const [filesPreview, setFilesPreview] = useState<{
    orderId: string;
    orderNumber: string;
    files: OrderAttachmentRow[];
  } | null>(null);
  const [expandedQueueItems, setExpandedQueueItems] = useState<Set<string>>(
    new Set(),
  );
  const [expandedReadyItems, setExpandedReadyItems] = useState<Set<string>>(
    new Set(),
  );
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<
    Array<{
      id: string;
      orderId: string;
      orderNumber: string;
      customerName: string;
      batchCode: string;
      priority: Priority;
      fieldLabel: string;
      itemName: string;
      qty: number;
      material: string;
      rowIndex: number;
      rawRow: Record<string, unknown>;
    }>
  >([]);
  const [splitSelections, setSplitSelections] = useState<
    Record<string, string[]>
  >({});
  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";

  useEffect(() => {
    if (!supabase) {
      setDataError("Supabase is not configured.");
      return;
    }
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setDataError("");
      if (!supabase) {
        setDataError("Supabase is not configured.");
        setIsLoading(false);
        return;
      }
      const [stationsResult, itemsResult, runsResult, ordersResult] =
        await Promise.all([
          supabase
            .from("workstations")
            .select("id, name, is_active, sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("production_items")
            .select(
              "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, duration_minutes, orders (order_number, due_date, priority, customer_name)",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("batch_runs")
            .select(
              "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, priority, customer_name)",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select(
              "id, order_number, customer_name, due_date, priority, quantity, product_name, production_duration_minutes",
            )
            .eq("status", "ready_for_production")
            .order("due_date", { ascending: true }),
        ]);

      if (!isMounted) {
        return;
      }

      if (
        stationsResult.error ||
        itemsResult.error ||
        runsResult.error ||
        ordersResult.error
      ) {
        setDataError("Failed to load production data.");
        setIsLoading(false);
        return;
      }

      setStations(
        (stationsResult.data ?? []).map((station) => ({
          id: station.id,
          name: station.name,
          sortOrder: station.sort_order ?? 0,
        })),
      );
      setProductionItems((itemsResult.data ?? []) as ProductionItemRow[]);
      setBatchRuns((runsResult.data ?? []) as BatchRunRow[]);
      setReadyOrders((ordersResult.data ?? []) as ReadyOrderRow[]);
      setIsLoading(false);
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let isMounted = true;
    const loadProductionDetails = async () => {
      const orderIds = Array.from(
        new Set([
          ...readyOrders.map((order) => order.id),
          ...productionItems.map((item) => item.order_id),
        ]),
      );
      if (orderIds.length === 0) {
        setProductionFields([]);
        setProductionValues({});
        setProductionAttachments({});
        return;
      }
      const fieldsResult = await supabase
        .from("order_input_fields")
        .select(
          "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
        )
        .eq("is_active", true)
        .eq("show_in_production", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      const mappedFields =
        (fieldsResult.data as Array<{
          id: string;
          key: string;
          label: string;
          group_key?: string | null;
          field_type: string;
          unit?: string | null;
          options?: {
            options?: string[];
            columns?: OrderInputField["columns"];
          } | null;
          is_required?: boolean | null;
          is_active?: boolean | null;
          show_in_production?: boolean | null;
          sort_order?: number | null;
        }>) ?? [];
      const normalizedFields = mappedFields
        .filter((field) => field.show_in_production)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          groupKey: (field.group_key ??
            "order_info") as OrderInputField["groupKey"],
          fieldType: field.field_type as OrderInputField["fieldType"],
          unit: field.unit ?? undefined,
          options: field.options?.options ?? undefined,
          columns: field.options?.columns ?? undefined,
          isRequired: field.is_required ?? false,
          isActive: field.is_active ?? true,
          showInProduction: field.show_in_production ?? false,
          sortOrder: field.sort_order ?? 0,
        })) satisfies OrderInputField[];

      if (!isMounted) {
        return;
      }
      setProductionFields(normalizedFields);

      if (normalizedFields.length === 0) {
        setProductionValues({});
      } else {
        const fieldIds = normalizedFields.map((field) => field.id);
        const valuesResult = await supabase
          .from("order_input_values")
          .select("order_id, field_id, value")
          .in("order_id", orderIds)
          .in("field_id", fieldIds);
        if (!isMounted) {
          return;
        }
        const nextValues: Record<string, Record<string, unknown>> = {};
        (valuesResult.data ?? []).forEach((row: any) => {
          const orderId = row.order_id as string;
          const fieldId = row.field_id as string;
          if (!nextValues[orderId]) {
            nextValues[orderId] = {};
          }
          nextValues[orderId][fieldId] = row.value;
        });
        setProductionValues(nextValues);
      }

      const attachmentsResult = await supabase
        .from("order_attachments")
        .select("id, order_id, name, url, category, created_at")
        .in("order_id", orderIds)
        .eq("category", productionAttachmentCategory)
        .order("created_at", { ascending: false });
      if (!isMounted) {
        return;
      }
      const attachmentsMap: Record<string, OrderAttachmentRow[]> = {};
      (attachmentsResult.data ?? []).forEach((row: OrderAttachmentRow) => {
        if (!attachmentsMap[row.order_id]) {
          attachmentsMap[row.order_id] = [];
        }
        attachmentsMap[row.order_id].push(row);
      });
      setProductionAttachments(attachmentsMap);
    };
    void loadProductionDetails();
    return () => {
      isMounted = false;
    };
  }, [productionItems, readyOrders]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const allAttachments = Object.values(productionAttachments).flat();
    const pending = allAttachments.filter(
      (attachment) => attachment.url && !signedProductionUrls[attachment.id],
    );
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const signAll = async () => {
      const results = await Promise.all(
        pending.map(async (attachment) => {
          let path = attachment.url as string;
          if (storagePublicPrefix && path.startsWith(storagePublicPrefix)) {
            path = path.slice(storagePublicPrefix.length);
          }
          const { data } = await supabase.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }),
      );
      if (!isMounted) {
        return;
      }
      setSignedProductionUrls((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.url) {
            next[result.id] = result.url;
          }
        });
        return next;
      });
    };
    void signAll();
    return () => {
      isMounted = false;
    };
  }, [productionAttachments, signedProductionUrls, storagePublicPrefix]);

  const resolveProductionAttachmentUrl = (attachment: OrderAttachmentRow) => {
    if (!attachment.url) {
      return undefined;
    }
    if (!supabase) {
      return attachment.url;
    }
    if (storagePublicPrefix && attachment.url.startsWith(storagePublicPrefix)) {
      return signedProductionUrls[attachment.id];
    }
    if (attachment.url.startsWith("http")) {
      return attachment.url;
    }
    return signedProductionUrls[attachment.id];
  };

  const formatProductionValue = (
    field: OrderInputField,
    value: unknown,
  ): string[] => {
    if (value === null || value === undefined) {
      return [];
    }
    if (field.fieldType === "table") {
      const rows = Array.isArray(value) ? value : [];
      if (!field.columns || field.columns.length === 0) {
        return rows.length > 0 ? [`${rows.length} rows`] : [];
      }
      return rows
        .map((row) => {
          if (!row || typeof row !== "object") {
            return "";
          }
          const values = field.columns.map((column) => {
            const cell = (row as Record<string, unknown>)[column.key];
            if (Array.isArray(cell)) {
              const joined = cell.map((item) => String(item)).join(" / ");
              return column.unit ? `${joined} ${column.unit}` : joined;
            }
            if (cell === null || cell === undefined || cell === "") {
              return "";
            }
            const text = String(cell);
            return column.unit ? `${text} ${column.unit}` : text;
          });
          const filtered = values.filter((item) => item.trim().length > 0);
          return filtered.length > 0 ? filtered.join(" | ") : "";
        })
        .filter((line) => line.trim().length > 0);
    }
    if (field.fieldType === "toggle_number") {
      const payload =
        typeof value === "object" && value !== null ? (value as any) : {};
      const enabled = Boolean(payload.enabled);
      const amount =
        payload.amount === "" ||
        payload.amount === null ||
        payload.amount === undefined
          ? null
          : Number(payload.amount);
      if (!enabled && amount === null) {
        return [];
      }
      if (enabled && amount !== null) {
        return [`${amount}`];
      }
      return enabled ? ["Yes"] : amount !== null ? [`${amount}`] : [];
    }
    if (field.fieldType === "toggle") {
      return [value ? "Yes" : "No"];
    }
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item)).join(", ");
      return joined ? [joined] : [];
    }
    if (typeof value === "object") {
      return [JSON.stringify(value)];
    }
    const text = String(value);
    return text ? [text] : [];
  };

  useEffect(() => {
    if (!supabase || !user?.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("workday_start, workday_end")
        .eq("tenant_id", user.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      if (data.workday_start) {
        setWorkdayStart(data.workday_start);
      }
      if (data.workday_end) {
        setWorkdayEnd(data.workday_end);
      }
    };
    void loadWorkHours();
    return () => {
      isMounted = false;
    };
  }, [user?.tenantId]);

  const readyBatchGroups = useMemo(() => {
    const groups = new Map<string, BatchGroup>();
    const releasedKeys = new Set(
      batchRuns.map((run) => `${run.order_id}-${run.batch_code}`),
    );

    const sourceItems =
      productionItems.length > 0
        ? productionItems.filter(
            (item) => item.status === "queued" && !item.station_id,
          )
        : [];

    sourceItems.forEach((item) => {
      const orderNumber = item.orders?.order_number ?? "Order";
      const customerName = item.orders?.customer_name ?? "Customer";
      const dueDate = item.orders?.due_date ?? "";
      const priority = item.orders?.priority ?? "normal";
      const batchCode = item.batch_code || "B1";
      const key = `${item.order_id}-${batchCode}`;
      if (releasedKeys.has(key)) {
        return;
      }
      const existing = groups.get(key);
      const qtyValue = Number(item.qty ?? 0);
      if (!existing) {
        groups.set(key, {
          key,
          orderId: item.order_id,
          orderNumber,
          customerName,
          dueDate,
          priority,
          batchCode,
          totalQty: qtyValue,
          material: item.material ?? "",
        });
      } else {
        existing.totalQty += qtyValue;
      }
    });

    readyOrders.forEach((order) => {
      const batchCode = "B1";
      const key = `${order.id}-${batchCode}`;
      if (groups.has(key)) {
        return;
      }
      if (releasedKeys.has(key)) {
        return;
      }
      groups.set(key, {
        key,
        orderId: order.id,
        orderNumber: order.order_number ?? "Order",
        customerName: order.customer_name ?? "Customer",
        dueDate: order.due_date ?? "",
        priority: order.priority ?? "normal",
        batchCode,
        totalQty: order.quantity ?? 0,
        material: order.product_name ?? "",
      });
    });
    return Array.from(groups.values());
  }, [productionItems, readyOrders, batchRuns]);

  const readyOrderDurationMap = useMemo(() => {
    const map = new Map<string, number>();
    readyOrders.forEach((order) => {
      if (order.production_duration_minutes != null) {
        map.set(order.id, order.production_duration_minutes);
      }
    });
    return map;
  }, [readyOrders]);

  const routes = [
    {
      key: "default",
      label: "Default route",
      steps: [],
    },
  ];
  const activeRoute =
    routes.find((route) => route.key === selectedRouteKey) ?? routes[0];
  const routeStations = useMemo(() => [...stations], [stations]);

  const plannedDateValid = Boolean(plannedDate);
  const canRelease =
    selectedBatchKeys.length > 0 && routeStations.length > 0 && plannedDateValid;

  const formatTableRow = (
    field: OrderInputField,
    row: Record<string, unknown>,
  ) => {
    if (!field.columns || field.columns.length === 0) {
      return "";
    }
    const parts = field.columns
      .map((column) => {
        const value = row[column.key];
        if (Array.isArray(value)) {
          const joined = value.map((item) => String(item)).join(" / ");
          return column.unit ? `${joined} ${column.unit}` : joined;
        }
        if (value === null || value === undefined || value === "") {
          return "";
        }
        const text = String(value);
        return column.unit ? `${text} ${column.unit}` : text;
      })
      .filter((part) => part.trim().length > 0);
    return parts.join(" | ");
  };

  const resolveRowQty = (
    field: OrderInputField,
    row: Record<string, unknown>,
  ) => {
    const numericValue = (value: unknown) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    };
    const columns = field.columns ?? [];
    for (const column of columns) {
      const label = column.label.toLowerCase();
      const unit = (column.unit ?? "").toLowerCase();
      if (
        label.includes("skaits") ||
        label.includes("qty") ||
        label.includes("quantity") ||
        unit === "pcs" ||
        unit === "gab"
      ) {
        const value = numericValue(row[column.key]);
        if (value !== null) {
          return value;
        }
      }
    }
    return 1;
  };

  const buildSplitRows = (groups: BatchGroup[]) => {
    const rows: Array<{
      id: string;
      orderId: string;
      orderNumber: string;
      customerName: string;
      batchCode: string;
      priority: Priority;
      fieldLabel: string;
      itemName: string;
      qty: number;
      material: string;
      rowIndex: number;
      rawRow: Record<string, unknown>;
    }> = [];
    groups.forEach((group) => {
      const values = productionValues[group.orderId] ?? {};
      let added = false;
      productionFields
        .filter((field) => field.fieldType === "table")
        .forEach((field) => {
          const raw = values[field.id];
          const tableRows = Array.isArray(raw) ? raw : [];
          tableRows.forEach((row, rowIndex) => {
            const normalized =
              typeof row === "object" && row !== null
                ? (row as Record<string, unknown>)
                : {};
            const itemName = formatTableRow(field, normalized);
            if (!itemName) {
              return;
            }
            rows.push({
              id: `${group.orderId}:${field.id}:${rowIndex}`,
              orderId: group.orderId,
              orderNumber: group.orderNumber,
              customerName: group.customerName,
              batchCode: group.batchCode,
              priority: group.priority,
              fieldLabel: field.label,
              itemName,
              qty: resolveRowQty(field, normalized),
              material: group.material ?? "",
              rowIndex,
              rawRow: normalized,
            });
            added = true;
          });
        });
      if (!added) {
        rows.push({
          id: `${group.orderId}:fallback:0`,
          orderId: group.orderId,
          orderNumber: group.orderNumber,
          customerName: group.customerName,
          batchCode: group.batchCode,
          priority: group.priority,
          fieldLabel: "Order",
          itemName: group.material || group.orderNumber,
          qty: group.totalQty || 1,
          material: group.material ?? "",
          rowIndex: 0,
          rawRow: {},
        });
      }
    });
    return rows;
  };

  const handleOpenSplit = () => {
    if (!canRelease) {
      return;
    }
    const nextGroups = readyBatchGroups.filter((group) =>
      selectedBatchKeys.includes(group.key),
    );
    if (nextGroups.length === 0) {
      return;
    }
    const rows = buildSplitRows(nextGroups);
    const defaults: Record<string, string[]> = {};
    rows.forEach((row) => {
      defaults[row.id] = routeStations.map((station) => station.id);
    });
    setSplitRows(rows);
    setSplitSelections(defaults);
    setIsSplitOpen(true);
  };

  const handleConfirmSplit = async () => {
    if (!supabase || !canRelease) {
      return;
    }
    const nextGroups = readyBatchGroups.filter((group) =>
      selectedBatchKeys.includes(group.key),
    );
    if (nextGroups.length === 0) {
      return;
    }
    const selectedRows = splitRows.filter(
      (row) => (splitSelections[row.id] ?? []).length > 0,
    );
    const productionRows = selectedRows.flatMap((row) =>
      (splitSelections[row.id] ?? []).map((stationId) => ({
        order_id: row.orderId,
        batch_code: row.batchCode,
        item_name: row.itemName,
        qty: row.qty,
        material: row.material || null,
        priority: row.priority,
        status: "queued",
        station_id: stationId,
        meta: {
          fieldLabel: row.fieldLabel,
          rowIndex: row.rowIndex,
          rowKey: row.id,
          plannedDate,
          row: row.rawRow,
        },
      })),
    );
    if (productionRows.length > 0) {
      const { data, error } = await supabase
        .from("production_items")
        .insert(productionRows)
        .select(
          "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, orders (order_number, due_date, priority, customer_name)",
        );
      if (error) {
        setDataError("Failed to create production items.");
        return;
      }
      setProductionItems((prev) => [...(data ?? []), ...prev]);
    }
    const insertRows = nextGroups.flatMap((group) =>
      routeStations.map((station, index) => ({
        order_id: group.orderId,
        batch_code: group.batchCode,
        station_id: station.id,
        route_key: activeRoute.key,
        step_index: index,
        status: "queued",
        planned_date: plannedDate,
      })),
    );
    const { data: inserted, error } = await supabase
      .from("batch_runs")
      .insert(insertRows)
      .select(
        "id, order_id, batch_code, station_id, route_key, step_index, status, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
      );
    if (error) {
      setDataError("Failed to create batch runs.");
      return;
    }
    await supabase
      .from("orders")
      .update({ status: "in_production" })
      .in("id", Array.from(new Set(nextGroups.map((group) => group.orderId))));
    setBatchRuns((prev) => [...(inserted ?? []), ...prev]);
    setSelectedBatchKeys([]);
    setIsSplitOpen(false);
  };

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    stations.forEach((station) => map.set(station.id, []));
    const runMap = new Map<string, BatchRunRow>();
    batchRuns.forEach((run) => {
      runMap.set(`${run.order_id}-${run.batch_code}-${run.step_index}`, run);
    });
    const startDate = new Date(viewDate);
    const endDate = new Date(viewDate);
    endDate.setDate(endDate.getDate() + Math.max(plannedRangeDays - 1, 0));
    batchRuns.forEach((run) => {
      if (!run.station_id) {
        return;
      }
      if (run.status === "done") {
        return;
      }
      if (run.planned_date) {
        const runDate = new Date(run.planned_date);
        if (runDate < startDate || runDate > endDate) {
          return;
        }
      }
      const items = productionItems.filter(
        (item) =>
          item.order_id === run.order_id &&
          item.batch_code === run.batch_code &&
          item.station_id === run.station_id,
      );
      const totalQty = items.reduce(
        (sum, item) => sum + Number(item.qty ?? 0),
        0,
      );
      const material = items.find((item) => item.material)?.material ?? "";
      const orderNumber = run.orders?.order_number ?? "Order";
      const customerName = run.orders?.customer_name ?? "Customer";
      const dueDate = run.orders?.due_date ?? "";
      const priority = run.orders?.priority ?? "normal";
      const queueItem = {
        id: run.id,
        orderNumber,
        customerName,
        dueDate,
        priority,
        status: run.status,
        batchCode: run.batch_code,
        totalQty,
        material,
        startedAt: run.started_at,
        doneAt: run.done_at,
        durationMinutes: run.duration_minutes ?? null,
        items,
      } satisfies QueueItem;
      map.get(run.station_id)?.push(queueItem);
    });
    return map;
  }, [batchRuns, productionItems, stations, viewDate, plannedRangeDays]);

  const removeFromQueue = async (id: string) => {
    if (!supabase) {
      return;
    }
    const run = batchRuns.find((item) => item.id === id);
    if (!run) {
      return;
    }
    const { error } = await supabase
      .from("batch_runs")
      .delete()
      .eq("id", run.id);
    if (error) {
      setDataError("Failed to remove from queue.");
      return;
    }
    const { error: itemsError } = await supabase
      .from("production_items")
      .delete()
      .eq("order_id", run.order_id)
      .eq("batch_code", run.batch_code)
      .eq("station_id", run.station_id);
    if (itemsError) {
      setDataError("Removed queue entry, but failed to remove station items.");
    } else {
      setProductionItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.order_id === run.order_id &&
              item.batch_code === run.batch_code &&
              item.station_id === run.station_id
            ),
        ),
      );
    }
    setBatchRuns((prev) => prev.filter((item) => item.id !== run.id));
    await supabase
      .from("orders")
      .update({ status: "ready_for_production" })
      .eq("id", run.order_id);
  };

  const handleRemoveFromQueue = async (
    id: string,
    orderLabel?: string,
    stationName?: string,
  ) => {
    const descriptionParts = [];
    if (orderLabel) {
      descriptionParts.push(orderLabel);
    }
    if (stationName) {
      descriptionParts.push(stationName);
    }
    const description =
      descriptionParts.length > 0
        ? `This will remove ${descriptionParts.join(" from ")} from the queue.`
        : "This will remove the work order from the station queue.";
    const ok = await confirm({
      title: "Remove work order?",
      description,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await removeFromQueue(id);
  };

  const handleRemoveHintStart = (id: string) => {
    if (removeHintTimer.current) {
      window.clearTimeout(removeHintTimer.current);
    }
    removeHintTimer.current = window.setTimeout(() => {
      setRemoveHintId(id);
    }, 450);
  };

  const handleRemoveHintEnd = () => {
    if (removeHintTimer.current) {
      window.clearTimeout(removeHintTimer.current);
      removeHintTimer.current = null;
    }
  };

  const filteredReadyGroups = useMemo(() => {
    const query = readySearch.trim().toLowerCase();
    return readyBatchGroups.filter((group) => {
      if (readyPriority !== "all" && group.priority !== readyPriority) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        group.orderNumber.toLowerCase().includes(query) ||
        group.customerName.toLowerCase().includes(query) ||
        group.batchCode.toLowerCase().includes(query) ||
        group.material.toLowerCase().includes(query)
      );
    });
  }, [readyBatchGroups, readyPriority, readySearch]);

  const isReadyLoading = isLoading;
  const isQueuesLoading = isLoading;

  return (
    <Tabs defaultValue="planning" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Production</h2>
          <p className="text-sm text-muted-foreground">
            Plan work orders, batch similar items, and assign to stations.
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="list">Orders</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="planning" className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Ready for production</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataError ? (
              <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                {dataError}
              </div>
            ) : null}
            {isReadyLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                Loading ready batches...
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                  Search
                  <input
                    value={readySearch}
                    onChange={(event) => setReadySearch(event.target.value)}
                    placeholder="Order, customer, batch..."
                    className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Priority
                  <select
                    value={readyPriority}
                    onChange={(event) =>
                      setReadyPriority(event.target.value as Priority | "all")
                    }
                    className="h-9 rounded-lg border border-border bg-input-background px-2 text-sm text-foreground"
                  >
                    <option value="all">All</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
              {filteredReadyGroups.map((group) => {
                const isSelected = selectedBatchKeys.includes(group.key);
                const fieldValues = productionValues[group.orderId] ?? {};
                const productionDetails = productionFields
                  .map((field) => {
                    const raw = fieldValues[field.id];
                    const formatted = formatProductionValue(field, raw);
                    return formatted.length > 0
                      ? {
                          label: field.label,
                          values: formatted,
                          unit:
                            field.fieldType === "table"
                              ? undefined
                              : field.unit,
                        }
                      : null;
                  })
                  .filter(Boolean) as Array<{
                  label: string;
                  values: string[];
                  unit?: string;
                }>;
                const constructionDetails = productionDetails.filter(
                  (detail) => detail.label.toLowerCase() === "konstrukcijas",
                );
                const otherDetails = productionDetails.filter(
                  (detail) => detail.label.toLowerCase() !== "konstrukcijas",
                );
                const productionFiles =
                  productionAttachments[group.orderId] ?? [];
                return (
                  <label
                    key={group.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        setSelectedBatchKeys((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== group.key)
                            : [...prev, group.key],
                        )
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {group.orderNumber} / {group.batchCode}
                        </span>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/orders/${group.orderId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex"
                            aria-label="Open order"
                          >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                              <ExternalLinkIcon className="h-4 w-4" />
                            </span>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setFilesPreview({
                                orderId: group.orderId,
                                orderNumber: group.orderNumber,
                                files: productionFiles,
                              });
                            }}
                            aria-label="View production files"
                          >
                            <PaperclipIcon className="h-4 w-4" />
                          </Button>
                          <Badge variant={priorityBadge(group.priority)}>
                            {group.priority}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {group.customerName}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.totalQty} pcs - Due {group.dueDate}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.material}
                      </div>
                      {otherDetails.length > 0 && (
                        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                          {otherDetails.flatMap((detail) =>
                            detail.values.map((value, index) => (
                              <div
                                key={`${detail.label}-${index}`}
                                className="rounded-md border border-border bg-muted/20 px-2 py-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    {detail.label}
                                  </div>
                                </div>
                                <div className="mt-1 text-[11px] text-foreground">
                                  {value}
                                  {detail.unit ? ` ${detail.unit}` : ""}
                                </div>
                              </div>
                            )),
                          )}
                        </div>
                      )}
                      {constructionDetails.length > 0 && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-2 px-2 text-[11px]"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setExpandedReadyItems((prev) => {
                                const next = new Set(prev);
                                if (next.has(group.key)) {
                                  next.delete(group.key);
                                } else {
                                  next.add(group.key);
                                }
                                return next;
                              });
                            }}
                          >
                            {expandedReadyItems.has(group.key) ? (
                              <ChevronUpIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            )}
                            Konstrukcijas
                          </Button>
                          {expandedReadyItems.has(group.key) ? (
                            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                              {constructionDetails.flatMap((detail) =>
                                detail.values.map((value, index) => (
                                  <div
                                    key={`${detail.label}-${index}`}
                                    className="rounded-md border border-border bg-muted/20 px-2 py-2"
                                  >
                                    <div className="mt-1 text-[11px] text-foreground">
                                      {value}
                                      {detail.unit ? ` ${detail.unit}` : ""}
                                    </div>
                                  </div>
                                )),
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
              {filteredReadyGroups.length === 0 && !isLoading ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No batches ready for release.
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Release to production</div>
                  <div className="text-xs text-muted-foreground">
                    Unit of work: Batch (e.g. AL-1042 / B1)
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedBatchKeys.length > 0
                    ? `${selectedBatchKeys.length} selected`
                    : "No selection"}
                </div>
              </div>
              <label className="space-y-1 text-xs text-muted-foreground">
                Route
                {routes.length > 1 ? (
                  <select
                    value={selectedRouteKey}
                    onChange={(event) => setSelectedRouteKey(event.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                  >
                    {routes.map((route) => (
                      <option key={route.key} value={route.key}>
                        {route.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground flex items-center">
                    {routes[0]?.label ?? "Default route"}
                  </div>
                )}
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                  {routeStations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {routeStations.map((station, index) => (
                        <span
                          key={station.id}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-xs"
                        >
                          {index + 1}. {station.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "No matching stations for default route."
                  )}
                </div>
              </label>
              <DatePickerField
                label="Planned date"
                value={plannedDate}
                onChange={setPlannedDate}
                className="space-y-1 text-xs text-muted-foreground"
                min={todayIso}
              />
              <div className="rounded-lg border border-border bg-muted/30 mt-2 px-3 py-2 text-xs text-muted-foreground">
                Planning date affects new work orders only. Use the queue view
                controls to switch days.
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button onClick={handleOpenSplit} disabled={!canRelease}>
                  Create work order
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedBatchKeys([])}
                  disabled={selectedBatchKeys.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
            <span>Station queues</span>
            <div className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
              <DatePickerField
                label="View date"
                value={viewDate}
                onChange={setViewDate}
                className="flex items-center gap-2 text-xs"
              />
              <label className="flex items-center gap-2">
                Range
                <select
                  value={plannedRangeDays}
                  onChange={(event) =>
                    setPlannedRangeDays(Number(event.target.value))
                  }
                  className="h-9 rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                >
                  <option value={1}>Today</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                </select>
              </label>
            </div>
          </div>
          {isQueuesLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              Loading station queues...
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stations.map((station) => {
              const queue = queueByStation.get(station.id) ?? [];
              const stationTotalMinutes = queue.reduce((sum, item) => {
                const itemMinutes =
                  item.durationMinutes ??
                  item.items.reduce(
                    (rowSum, row) =>
                      rowSum + Number(row.duration_minutes ?? 0),
                    0,
                  );
                return sum + Number(itemMinutes ?? 0);
              }, 0);
              return (
                <Card key={station.id} className="min-h-60">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {station.name}
                        </CardTitle>
                        <Link
                          href={`/production/operator?station=${station.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          aria-label={`Open ${station.name} in operator view`}
                        >
                          <ExternalLinkIcon className="h-4 w-4" />
                        </Link>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{queue.length} items</div>
                        {stationTotalMinutes > 0 ? (
                          <div>{formatDuration(stationTotalMinutes)}</div>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {queue.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                        No work queued
                      </div>
                    ) : (
                      queue.map((item) => (
                        <div
                          key={item.id}
                          className="group relative rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-sm"
                          onMouseEnter={() => setRemoveHintId(item.id)}
                          onMouseLeave={() => setRemoveHintId(null)}
                          onTouchStart={() => handleRemoveHintStart(item.id)}
                          onTouchEnd={handleRemoveHintEnd}
                          onTouchCancel={handleRemoveHintEnd}
                        >
                          <button
                            type="button"
                            aria-label="Remove from queue"
                            className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-border bg-foreground text-[16px] text-background shadow-sm transition ${
                              removeHintId === item.id
                                ? "flex"
                                : "hidden group-hover:flex"
                            }`}
                            onClick={() =>
                              handleRemoveFromQueue(
                                item.id,
                                `${item.orderNumber} / ${item.batchCode}`,
                                station.name,
                              )
                            }
                          >
                            ×
                          </button>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold">
                                {item.orderNumber} / {item.batchCode}
                              </span>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {item.customerName}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant={priorityBadge(item.priority)}>
                                {item.priority}
                              </Badge>
                              <Badge variant={statusBadge(item.status)}>
                                {String(item.status ?? "queued").replace(
                                  "_",
                                  " ",
                                )}
                              </Badge>
                            </div>
                          </div>
                          {(() => {
                            const metaParts: string[] = [];
                            if (item.totalQty > 0) {
                              metaParts.push(`${item.totalQty} pcs`);
                            }
                            if (item.dueDate) {
                              metaParts.push(`Due ${item.dueDate}`);
                            }
                            const metaLine = metaParts.join(" - ");
                            const stationDurationMinutes =
                              item.durationMinutes ??
                              item.items.reduce(
                                (sum, row) => sum + Number(row.duration_minutes ?? 0),
                                0,
                              );
                            const elapsedMinutes = item.startedAt
                              ? computeWorkingMinutes(
                                  item.startedAt,
                                  item.doneAt ?? null,
                                  workdayStart,
                                  workdayEnd,
                                )
                              : 0;
                            const elapsedLabel = item.startedAt
                              ? formatDuration(elapsedMinutes)
                              : null;
                            return (
                              <>
                                {metaLine ? (
                                  <div className="mt-1 text-muted-foreground">
                                    {metaLine}
                                  </div>
                                ) : null}
                                {stationDurationMinutes > 0 ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    Station time: {formatDuration(stationDurationMinutes)}
                                  </div>
                                ) : null}
                                {elapsedLabel ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    Time: {elapsedLabel}
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                          <div className="mt-1 text-muted-foreground">
                            {item.material}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{item.batchCode}</span>
                            {item.items.length > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-2 px-2 text-[11px]"
                                onClick={() =>
                                  setExpandedQueueItems((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) {
                                      next.delete(item.id);
                                    } else {
                                      next.add(item.id);
                                    }
                                    return next;
                                  })
                                }
                              >
                                {expandedQueueItems.has(item.id) ? (
                                  <ChevronUpIcon className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDownIcon className="h-3.5 w-3.5" />
                                )}
                                {expandedQueueItems.has(item.id)
                                  ? "Hide constructions"
                                  : "Show constructions"}
                              </Button>
                            ) : null}
                          </div>
                          {expandedQueueItems.has(item.id) && item.items.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {item.items.map((row) => (
                                <div
                                  key={row.id}
                                  className="rounded-md border border-border bg-muted/20 px-2 py-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-[11px] text-muted-foreground">
                                      {row.item_name}
                                    </div>
                                    <Badge variant={statusBadge(row.status)}>
                                      {String(row.status ?? "queued").replace(
                                        "_",
                                        " ",
                                      )}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    Qty: {row.qty}
                                    {row.material ? ` • ${row.material}` : ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {isSplitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Split by stations</h2>
                <p className="text-sm text-muted-foreground">
                  Select which stations should process each construction row.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSplitOpen(false)}
                aria-label="Close split"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next: Record<string, string[]> = {};
                  splitRows.forEach((row) => {
                    next[row.id] = routeStations.map((station) => station.id);
                  });
                  setSplitSelections(next);
                }}
              >
                Select all stations
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next: Record<string, string[]> = {};
                  splitRows.forEach((row) => {
                    next[row.id] = [];
                  });
                  setSplitSelections(next);
                }}
              >
                Clear all
              </Button>
            </div>

            <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto">
              {splitRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No construction rows found for this selection.
                </div>
              ) : (
                Array.from(
                  splitRows.reduce((acc, row) => {
                    const key = row.orderId;
                    const list = acc.get(key) ?? [];
                    list.push(row);
                    acc.set(key, list);
                    return acc;
                  }, new Map<string, typeof splitRows>()),
                ).map(([orderId, rows]) => (
                  <div key={orderId} className="rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">
                      {rows[0]?.orderNumber} / {rows[0]?.batchCode}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rows[0]?.customerName}
                    </div>
                    <div className="mt-3 space-y-2">
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        >
                          <div className="text-xs text-muted-foreground">
                            {row.fieldLabel}
                          </div>
                          <div className="font-medium">{row.itemName}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {routeStations.map((station) => {
                              const selected =
                                splitSelections[row.id]?.includes(station.id) ??
                                false;
                              return (
                                <label
                                  key={station.id}
                                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                                    selected
                                      ? "border-primary/40 bg-primary/5 text-foreground"
                                      : "border-border text-muted-foreground"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => {
                                      setSplitSelections((prev) => {
                                        const current = new Set(
                                          prev[row.id] ?? [],
                                        );
                                        if (event.target.checked) {
                                          current.add(station.id);
                                        } else {
                                          current.delete(station.id);
                                        }
                                        return {
                                          ...prev,
                                          [row.id]: Array.from(current),
                                        };
                                      });
                                    }}
                                  />
                                  {station.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSplitOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmSplit}>Create work order</Button>
            </div>
          </div>
        </div>
      )}

      {filesPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Production files</h2>
                <p className="text-sm text-muted-foreground">
                  Order {filesPreview.orderNumber}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFilesPreview(null)}
                aria-label="Close files"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {filesPreview.files.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No production files uploaded.
                </p>
              ) : (
                filesPreview.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {file.name ?? "File"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(file.created_at).toLocaleString()}
                      </div>
                    </div>
                    {resolveProductionAttachmentUrl(file) ? (
                      <a
                        href={resolveProductionAttachmentUrl(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No url
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setFilesPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {dialog}
      </TabsContent>

      <TabsContent value="list">
        <Card>
          <CardHeader>
            <CardTitle>Orders & constructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This view will show a table of orders with construction rows and
            station statuses. Coming next.
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="calendar">
        <Card>
          <CardHeader>
            <CardTitle>Production calendar</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This view will show the planned workload by day and station. Coming
            next.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
