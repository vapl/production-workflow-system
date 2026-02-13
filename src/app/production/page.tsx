"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import type { OrderInputField } from "@/types/orderInputs";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PaperclipIcon,
  XIcon,
  Info,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";

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
  status: "queued" | "pending" | "in_progress" | "blocked" | "done";
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
  status: "queued" | "pending" | "in_progress" | "blocked" | "done";
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
  orderId: string;
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

type SplitRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  batchCode: string;
  priority: Priority;
  fieldId: string;
  fieldLabel: string;
  itemName: string;
  qty: number;
  material: string;
  rowIndex: number;
  rawRow: Record<string, unknown>;
};

const productionAttachmentFallbackCategory = "production_report";

const qrLabelSizePresets: Record<
  string,
  { label: string; widthMm: number; heightMm: number }
> = {
  A4: { label: "A4", widthMm: 210, heightMm: 297 },
  A5: { label: "A5", widthMm: 148, heightMm: 210 },
  A6: { label: "A6", widthMm: 105, heightMm: 148 },
  LABEL_70x35: { label: "Label 70 x 35", widthMm: 70, heightMm: 35 },
  LABEL_105x148: { label: "Label 105 x 148", widthMm: 105, heightMm: 148 },
};

const qrFieldLabels: Record<string, string> = {
  order_number: "Order",
  customer_name: "Customer",
  batch_code: "Batch",
  item_name: "Construction",
  qty: "Qty",
  material: "Material",
  field_label: "Field",
  due_date: "Due",
};

const qrFieldOrderDefault = Object.keys(qrFieldLabels);

const defaultQrEnabledSizes = [
  "A4",
  "A5",
  "A6",
  "LABEL_70x35",
  "LABEL_105x148",
];

const defaultQrContentFields = [
  "order_number",
  "customer_name",
  "batch_code",
  "item_name",
  "qty",
  "material",
];

function priorityBadge(priority: Priority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function statusBadge(status: BatchRunRow["status"]) {
  if (status === "blocked") return "status-blocked";
  if (status === "pending") return "status-pending";
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

export default function ProductionPage() {
  const user = useCurrentUser();
  const { rules } = useWorkflowRules();
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
  const [qrEnabledSizes, setQrEnabledSizes] = useState<string[]>(
    defaultQrEnabledSizes,
  );
  const [qrDefaultSize, setQrDefaultSize] = useState<string>("A4");
  const [qrContentFields, setQrContentFields] = useState<string[]>(
    defaultQrContentFields,
  );
  const [qrFieldOrder, setQrFieldOrder] =
    useState<string[]>(qrFieldOrderDefault);
  const [qrFieldSelection, setQrFieldSelection] = useState<string[]>(
    defaultQrContentFields,
  );
  const [qrDragField, setQrDragField] = useState<string | null>(null);
  const [qrSelectedRowIds, setQrSelectedRowIds] = useState<string[]>([]);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrSize, setQrSize] = useState<string>("A4");
  const [qrOrientation, setQrOrientation] = useState<"portrait" | "landscape">(
    "portrait",
  );
  const [qrPreviewScale, setQrPreviewScale] = useState(1);
  const [qrRows, setQrRows] = useState<Array<{ row: SplitRow; token: string }>>(
    [],
  );
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [qrState, setQrState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSearch, setQrSearch] = useState("");
  const [qrFilterDate, setQrFilterDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [qrFilterStatus, setQrFilterStatus] = useState<
    "all" | "queued" | "pending" | "in_progress" | "blocked" | "done"
  >("all");
  const [qrFilterStation, setQrFilterStation] = useState("all");
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
  const [isCreatingWorkOrders, setIsCreatingWorkOrders] = useState(false);
  const [removingQueueId, setRemovingQueueId] = useState<string | null>(null);
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

  const productionAttachmentCategory =
    rules.attachmentCategoryDefaults?.Production ??
    productionAttachmentFallbackCategory;

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
    if (!supabase || !user?.tenantId) {
      return;
    }
    const channel = supabase
      .channel(`production-live-${user.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_items",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          const next = payload.new as ProductionItemRow | undefined;
          if (!next) {
            return;
          }
          setProductionItems((prev) => {
            const idx = prev.findIndex((item) => item.id === next.id);
            if (idx === -1) {
              return [next, ...prev];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "batch_runs",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          const next = payload.new as BatchRunRow | undefined;
          if (!next) {
            return;
          }
          setBatchRuns((prev) => {
            const idx = prev.findIndex((item) => item.id === next.id);
            if (idx === -1) {
              return [next, ...prev];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.tenantId]);

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
        .select(
          "workday_start, workday_end, qr_enabled_sizes, qr_default_size, qr_content_fields",
        )
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
      if (Array.isArray(data.qr_enabled_sizes)) {
        const nextSizes = data.qr_enabled_sizes.filter(
          (value: unknown) => typeof value === "string",
        );
        if (nextSizes.length > 0) {
          setQrEnabledSizes(nextSizes);
        }
      }
      if (typeof data.qr_default_size === "string") {
        setQrDefaultSize(data.qr_default_size);
        setQrSize(data.qr_default_size);
      }
      if (Array.isArray(data.qr_content_fields)) {
        const nextFields = data.qr_content_fields.filter(
          (value: unknown) => typeof value === "string",
        );
        if (nextFields.length > 0) {
          setQrContentFields(nextFields);
          setQrFieldSelection(nextFields);
          setQrFieldOrder((prev) => {
            const base = prev.length > 0 ? prev : qrFieldOrderDefault;
            const merged = [
              ...base.filter((field) => field !== null),
              ...nextFields.filter((field) => !base.includes(field)),
            ];
            return Array.from(new Set(merged));
          });
        }
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

  const productionConstructionRows = useMemo(() => {
    const rows: SplitRow[] = [];
    const seen = new Set<string>();
    productionItems.forEach((item) => {
      const rowKey =
        typeof item.meta?.rowKey === "string" ? item.meta?.rowKey : null;
      if (rowKey && seen.has(rowKey)) {
        return;
      }
      if (rowKey) {
        seen.add(rowKey);
      }
      const parts = rowKey ? rowKey.split(":") : [];
      const fieldId = parts[1] ?? "fallback";
      const rowIndex = Number(parts[2] ?? 0);
      const normalizedIndex = Number.isFinite(rowIndex) ? rowIndex : 0;
      rows.push({
        id: rowKey ?? item.id,
        orderId: item.order_id,
        orderNumber: item.orders?.order_number ?? "Order",
        customerName: item.orders?.customer_name ?? "Customer",
        dueDate: item.orders?.due_date ?? "",
        batchCode: item.batch_code || "B1",
        priority: item.orders?.priority ?? "normal",
        fieldId,
        fieldLabel:
          typeof item.meta?.fieldLabel === "string"
            ? item.meta.fieldLabel
            : "Order",
        itemName: item.item_name,
        qty: Number(item.qty ?? 1),
        material: item.material ?? "",
        rowIndex: normalizedIndex,
        rawRow:
          typeof item.meta?.row === "object" && item.meta?.row !== null
            ? (item.meta.row as Record<string, unknown>)
            : {},
      });
    });
    return rows;
  }, [productionItems]);

  const orderConstructionRows = useMemo(() => {
    if (productionConstructionRows.length > 0) {
      return productionConstructionRows;
    }
    return buildSplitRows(readyBatchGroups);
  }, [
    productionConstructionRows,
    readyBatchGroups,
    productionFields,
    productionValues,
  ]);

  const rowKeyForRow = (row: SplitRow) =>
    `${row.orderId}:${row.fieldId}:${row.rowIndex}`;

  const stationStatusMap = useMemo(() => {
    const map = new Map<
      string,
      Map<
        string,
        { status: ProductionItemRow["status"]; blockedReason?: string }
      >
    >();
    productionItems.forEach((item) => {
      const rowKey =
        typeof item.meta?.rowKey === "string"
          ? item.meta.rowKey
          : `${item.order_id}:fallback:${
              typeof item.meta?.rowIndex === "number" ? item.meta.rowIndex : 0
            }`;
      const stationId = item.station_id ?? "unassigned";
      if (!map.has(rowKey)) {
        map.set(rowKey, new Map());
      }
      const blockedReason =
        typeof (item.meta as Record<string, unknown> | null)?.blocked_reason ===
        "string"
          ? ((item.meta as Record<string, unknown>).blocked_reason as string)
          : undefined;
      map.get(rowKey)?.set(stationId, {
        status: item.status,
        blockedReason,
      });
    });
    return map;
  }, [productionItems]);

  const rowPlannedDateMap = useMemo(() => {
    const map = new Map<string, string>();
    productionItems.forEach((item) => {
      const rowKey =
        typeof item.meta?.rowKey === "string"
          ? item.meta.rowKey
          : `${item.order_id}:fallback:${
              typeof item.meta?.rowIndex === "number" ? item.meta.rowIndex : 0
            }`;
      const plannedDate =
        typeof item.meta?.plannedDate === "string" ? item.meta.plannedDate : "";
      if (plannedDate && !map.has(rowKey)) {
        map.set(rowKey, plannedDate);
      }
    });
    return map;
  }, [productionItems]);

  const rowTimeStats = useMemo(() => {
    const map = new Map<
      string,
      { totalMinutes: number; stationMinutes: Map<string, number> }
    >();
    productionItems.forEach((item) => {
      const rowKey =
        typeof item.meta?.rowKey === "string"
          ? item.meta.rowKey
          : `${item.order_id}:fallback:${
              typeof item.meta?.rowIndex === "number" ? item.meta.rowIndex : 0
            }`;
      if (!map.has(rowKey)) {
        map.set(rowKey, { totalMinutes: 0, stationMinutes: new Map() });
      }
      const entry = map.get(rowKey)!;
      const minutes =
        typeof item.duration_minutes === "number" ? item.duration_minutes : 0;
      if (minutes > 0) {
        entry.totalMinutes += minutes;
        if (item.station_id) {
          entry.stationMinutes.set(
            item.station_id,
            (entry.stationMinutes.get(item.station_id) ?? 0) + minutes,
          );
        }
      }
    });
    return map;
  }, [productionItems]);

  const batchRunStats = useMemo(() => {
    const map = new Map<
      string,
      {
        startAt?: string;
        totalMinutes: number;
        stationMinutes: Map<string, number>;
      }
    >();
    const toMinutes = (run: BatchRunRow) => {
      if (typeof run.duration_minutes === "number") {
        return run.duration_minutes;
      }
      if (run.started_at && run.done_at) {
        const start = new Date(run.started_at);
        const end = new Date(run.done_at);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return 0;
        }
        if (end <= start) return 0;
        return Math.floor((end.getTime() - start.getTime()) / 60000);
      }
      return 0;
    };
    batchRuns.forEach((run) => {
      if (!run.order_id || !run.batch_code) {
        return;
      }
      const key = `${run.order_id}:${run.batch_code}`;
      if (!map.has(key)) {
        map.set(key, {
          startAt: undefined,
          totalMinutes: 0,
          stationMinutes: new Map(),
        });
      }
      const entry = map.get(key)!;
      if (run.started_at) {
        if (!entry.startAt || run.started_at < entry.startAt) {
          entry.startAt = run.started_at;
        }
      }
      const minutes = toMinutes(run);
      if (minutes > 0) {
        entry.totalMinutes += minutes;
        if (run.station_id) {
          entry.stationMinutes.set(
            run.station_id,
            (entry.stationMinutes.get(run.station_id) ?? 0) + minutes,
          );
        }
      }
    });
    return map;
  }, [batchRuns]);

  const selectableConstructionRows = useMemo(
    () => orderConstructionRows.filter((row) => row.fieldId !== "fallback"),
    [orderConstructionRows],
  );

  const filteredQrRows = useMemo(() => {
    const query = qrSearch.trim().toLowerCase();
    return orderConstructionRows.filter((row) => {
      const rowKey = rowKeyForRow(row);
      const stationStatuses = stationStatusMap.get(rowKey);
      const plannedDate = rowPlannedDateMap.get(rowKey) ?? "";

      if (qrFilterDate && plannedDate && plannedDate !== qrFilterDate) {
        return false;
      }
      if (qrFilterDate && !plannedDate) {
        return false;
      }

      if (qrFilterStation !== "all") {
        const entry = stationStatuses?.get(qrFilterStation);
        if (!entry) {
          return false;
        }
        if (qrFilterStatus !== "all" && entry.status !== qrFilterStatus) {
          return false;
        }
      } else if (qrFilterStatus !== "all") {
        const hasStatus = Array.from(stationStatuses?.values() ?? []).some(
          (entry) => entry.status === qrFilterStatus,
        );
        if (!hasStatus) {
          return false;
        }
      }

      if (!query) {
        return true;
      }
      return (
        row.orderNumber.toLowerCase().includes(query) ||
        row.customerName.toLowerCase().includes(query) ||
        row.batchCode.toLowerCase().includes(query) ||
        row.itemName.toLowerCase().includes(query) ||
        row.fieldLabel.toLowerCase().includes(query)
      );
    });
  }, [
    orderConstructionRows,
    qrSearch,
    qrFilterDate,
    qrFilterStatus,
    qrFilterStation,
    stationStatusMap,
    rowPlannedDateMap,
  ]);

  const filteredSelectableRows = useMemo(
    () => filteredQrRows.filter((row) => row.fieldId !== "fallback"),
    [filteredQrRows],
  );

  const activeQrSize = qrLabelSizePresets[qrSize] ?? qrLabelSizePresets.A4;
  const orientedQrSize =
    qrOrientation === "landscape"
      ? { widthMm: activeQrSize.heightMm, heightMm: activeQrSize.widthMm }
      : { widthMm: activeQrSize.widthMm, heightMm: activeQrSize.heightMm };
  const qrPageSizeCss = `${orientedQrSize.widthMm}mm ${orientedQrSize.heightMm}mm`;
  const qrPageStyle = {
    width: `${orientedQrSize.widthMm}mm`,
    height: `${orientedQrSize.heightMm}mm`,
  };
  const orderedQrFields = useMemo(
    () => qrFieldOrder.filter((field) => qrFieldSelection.includes(field)),
    [qrFieldOrder, qrFieldSelection],
  );

  const calendarDates = useMemo(() => {
    const base = new Date(viewDate);
    if (Number.isNaN(base.getTime())) {
      return [];
    }
    const days = Math.max(1, plannedRangeDays);
    return Array.from({ length: days }).map((_, index) => {
      const next = new Date(base);
      next.setDate(base.getDate() + index);
      return next;
    });
  }, [viewDate, plannedRangeDays]);

  const calendarCells = useMemo(() => {
    const map = new Map<
      string,
      { count: number; minutes: number; orders: Set<string> }
    >();
    if (calendarDates.length === 0) {
      return map;
    }
    const dateKeys = new Set(
      calendarDates.map((date) => date.toISOString().slice(0, 10)),
    );
    batchRuns.forEach((run) => {
      if (!run.station_id || !run.planned_date) {
        return;
      }
      if (!dateKeys.has(run.planned_date)) {
        return;
      }
      const key = `${run.station_id}:${run.planned_date}`;
      const existing = map.get(key) ?? {
        count: 0,
        minutes: 0,
        orders: new Set<string>(),
      };
      existing.count += 1;
      existing.orders.add(run.order_id);
      const relatedItems = productionItems.filter(
        (item) =>
          item.order_id === run.order_id &&
          item.batch_code === run.batch_code &&
          item.station_id === run.station_id,
      );
      const duration =
        relatedItems.reduce(
          (sum, item) => sum + Number(item.duration_minutes ?? 0),
          0,
        ) || Number(run.duration_minutes ?? 0);
      existing.minutes += duration;
      map.set(key, existing);
    });
    return map;
  }, [batchRuns, productionItems, calendarDates]);

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
    selectedBatchKeys.length > 0 &&
    routeStations.length > 0 &&
    plannedDateValid;

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

  function buildSplitRows(groups: BatchGroup[]): SplitRow[] {
    const rows: SplitRow[] = [];
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
              dueDate: group.dueDate,
              batchCode: group.batchCode,
              priority: group.priority,
              fieldId: field.id,
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
          dueDate: group.dueDate,
          batchCode: group.batchCode,
          priority: group.priority,
          fieldId: "fallback",
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
  }

  const getQrFieldValue = (row: SplitRow, fieldKey: string) => {
    switch (fieldKey) {
      case "order_number":
        return row.orderNumber;
      case "customer_name":
        return row.customerName;
      case "batch_code":
        return row.batchCode;
      case "item_name":
        return row.itemName;
      case "qty":
        return String(row.qty ?? "");
      case "material":
        return row.material;
      case "field_label":
        return row.fieldLabel;
      case "due_date":
        return row.dueDate ? formatDateInput(row.dueDate) : "";
      default:
        return "";
    }
  };

  const buildQrRows = async (rows: SplitRow[]) => {
    if (!supabase || !user?.isAuthenticated) {
      return;
    }
    setQrState("loading");
    setQrError(null);
    try {
      const orderIds = Array.from(new Set(rows.map((row) => row.orderId)));
      const fieldIds = Array.from(new Set(rows.map((row) => row.fieldId)));
      const { data: existingRows, error: existingError } = await supabase
        .from("production_qr_codes")
        .select("order_id, field_id, row_index, token")
        .in("order_id", orderIds)
        .in("field_id", fieldIds);
      if (existingError) {
        throw new Error(existingError.message);
      }
      const existingMap = new Map<string, string>();
      const existingList =
        (existingRows as Array<{
          order_id: string;
          field_id: string;
          row_index: number;
          token: string;
        }>) ?? [];
      existingList.forEach((entry) => {
        const key = `${entry.order_id}:${entry.field_id}:${entry.row_index}`;
        existingMap.set(key, entry.token);
      });
      const missing = rows.filter((row) => {
        const key = `${row.orderId}:${row.fieldId}:${row.rowIndex}`;
        return !existingMap.has(key);
      });
      if (missing.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from("production_qr_codes")
          .insert(
            missing.map((row) => ({
              order_id: row.orderId,
              field_id: row.fieldId,
              row_index: row.rowIndex,
              created_by: user?.id ?? null,
            })),
          )
          .select("order_id, field_id, row_index, token");
        if (insertError) {
          throw new Error(insertError.message);
        }
        const insertedList =
          (inserted as Array<{
            order_id: string;
            field_id: string;
            row_index: number;
            token: string;
          }>) ?? [];
        insertedList.forEach((entry) => {
          const key = `${entry.order_id}:${entry.field_id}:${entry.row_index}`;
          existingMap.set(key, entry.token);
        });
      }
      const withTokens = rows
        .map((row) => {
          const key = `${row.orderId}:${row.fieldId}:${row.rowIndex}`;
          const token = existingMap.get(key);
          return token ? { row, token } : null;
        })
        .filter(Boolean) as Array<{ row: SplitRow; token: string }>;
      setQrRows(withTokens);

      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";
      const images = await Promise.all(
        withTokens.map(async (entry) => {
          const url = `${baseUrl}/qr/${entry.token}`;
          const dataUrl = await QRCode.toDataURL(url, {
            margin: 1,
            width: 256,
          });
          return { token: entry.token, dataUrl };
        }),
      );
      const imageMap: Record<string, string> = {};
      images.forEach((img) => {
        imageMap[img.token] = img.dataUrl;
      });
      setQrImages(imageMap);
      setQrState("ready");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to prepare QR codes.";
      setQrError(message);
      setQrState("error");
    }
  };

  const handleOpenQrModal = async (rows: SplitRow[]) => {
    if (rows.length === 0) {
      return;
    }
    setQrSize(qrDefaultSize || "A4");
    const nextFields =
      qrContentFields.length > 0
        ? qrContentFields
        : qrFieldSelection.length > 0
          ? qrFieldSelection
          : defaultQrContentFields;
    setQrFieldSelection(nextFields);
    setQrFieldOrder((prev) => {
      const base = prev.length > 0 ? prev : qrFieldOrderDefault;
      const merged = [
        ...base,
        ...nextFields.filter((field) => !base.includes(field)),
      ];
      return Array.from(new Set(merged));
    });
    setQrModalOpen(true);
    await buildQrRows(rows);
  };

  const handleCloseQrModal = () => {
    setQrModalOpen(false);
    setQrRows([]);
    setQrImages({});
    setQrState("idle");
    setQrError(null);
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
    if (isCreatingWorkOrders) {
      return;
    }
    setIsCreatingWorkOrders(true);
    const nextGroups = readyBatchGroups.filter((group) =>
      selectedBatchKeys.includes(group.key),
    );
    if (nextGroups.length === 0) {
      setIsCreatingWorkOrders(false);
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
        setIsCreatingWorkOrders(false);
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
      setIsCreatingWorkOrders(false);
      return;
    }
    await supabase
      .from("orders")
      .update({ status: "in_production" })
      .in("id", Array.from(new Set(nextGroups.map((group) => group.orderId))));
    setBatchRuns((prev) => [...(inserted ?? []), ...prev]);
    setSelectedBatchKeys([]);
    setIsSplitOpen(false);
    setIsCreatingWorkOrders(false);
  };

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    stations.forEach((station) => map.set(station.id, []));
    const seenRuns = new Set<string>();
    const startDate = new Date(viewDate);
    const endDate = new Date(viewDate);
    endDate.setDate(endDate.getDate() + Math.max(plannedRangeDays - 1, 0));
    batchRuns.forEach((run) => {
      if (seenRuns.has(run.id)) {
        return;
      }
      seenRuns.add(run.id);
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
        orderId: run.order_id,
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
    if (removingQueueId) {
      return;
    }
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
    setRemovingQueueId(id);
    await removeFromQueue(id);
    setRemovingQueueId(null);
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
    <>
      <Tabs defaultValue="planning" className="space-y-6">
        <div className="sticky top-16 z-10 flex flex-wrap items-end justify-between gap-4 bg-background/95 px-4 py-3">
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
                  <div className="flex flex-wrap items-start gap-2">
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
                      <Select
                        value={readyPriority}
                        onValueChange={(value) =>
                          setReadyPriority(value as Priority | "all")
                        }
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
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
                      (detail) =>
                        detail.label.toLowerCase() === "konstrukcijas",
                    );
                    const otherDetails = productionDetails.filter(
                      (detail) =>
                        detail.label.toLowerCase() !== "konstrukcijas",
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
                                  if (productionFiles.length === 0) {
                                    return;
                                  }
                                  setFilesPreview({
                                    orderId: group.orderId,
                                    orderNumber: group.orderNumber,
                                    files: productionFiles,
                                  });
                                }}
                                aria-label="View production files"
                                disabled={productionFiles.length === 0}
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
                      <div className="text-sm font-medium">
                        Release to production
                      </div>
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
                      <Select
                        value={selectedRouteKey}
                        onValueChange={setSelectedRouteKey}
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {routes.map((route) => (
                            <SelectItem key={route.key} value={route.key}>
                              {route.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <DatePicker
                    label="Planned date"
                    value={plannedDate}
                    onChange={setPlannedDate}
                    className="space-y-1 text-xs text-muted-foreground"
                    min={todayIso}
                  />
                  <div className="rounded-lg border border-border bg-muted/30 mt-2 px-3 py-2 text-xs text-muted-foreground">
                    Planning date affects new work orders only. Use the queue
                    view controls to switch days.
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
                  <DatePicker
                    label="View date"
                    value={viewDate}
                    onChange={setViewDate}
                    className="flex items-center gap-2 text-xs"
                  />
                  <label className="flex items-center gap-2">
                    Range
                    <Select
                      value={String(plannedRangeDays)}
                      onValueChange={(value) =>
                        setPlannedRangeDays(Number(value))
                      }
                    >
                      <SelectTrigger className="h-9 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Today</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                      </SelectContent>
                    </Select>
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
                              onTouchStart={() =>
                                handleRemoveHintStart(item.id)
                              }
                              onTouchEnd={handleRemoveHintEnd}
                              onTouchCancel={handleRemoveHintEnd}
                            >
                              {" "}
                              {(() => {
                                const canRemove = !item.items.some(
                                  (row) =>
                                    row.started_at ||
                                    row.status === "in_progress" ||
                                    row.status === "done",
                                );
                                return (
                                  <button
                                    type="button"
                                    aria-label="Remove from queue"
                                    className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-border bg-foreground text-[16px] text-background shadow-sm transition ${
                                      canRemove && removeHintId === item.id
                                        ? "flex"
                                        : canRemove
                                          ? "hidden group-hover:flex"
                                          : "hidden"
                                    }`}
                                    onClick={() =>
                                      canRemove
                                        ? handleRemoveFromQueue(
                                            item.id,
                                            `${item.orderNumber} / ${item.batchCode}`,
                                            station.name,
                                          )
                                        : undefined
                                    }
                                  >
                                    {removingQueueId === item.id ? (
                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/60 border-t-background" />
                                    ) : (
                                      "×"
                                    )}
                                  </button>
                                );
                              })()}
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-2">
                                  <div>
                                    <span className="font-semibold">
                                      {item.orderNumber} / {item.batchCode}
                                    </span>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                      {item.customerName}
                                    </div>
                                  </div>
                                  {(() => {
                                    const productionFiles =
                                      productionAttachments[item.orderId] ?? [];
                                    return (
                                      <div className="flex items-center gap-2">
                                        <Link
                                          href={`/orders/${item.orderId}`}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                          aria-label="Open order"
                                        >
                                          <ExternalLinkIcon className="h-4 w-4" />
                                        </Link>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            if (productionFiles.length === 0) {
                                              return;
                                            }
                                            setFilesPreview({
                                              orderId: item.orderId,
                                              orderNumber: item.orderNumber,
                                              files: productionFiles,
                                            });
                                          }}
                                          aria-label="View production files"
                                          disabled={
                                            productionFiles.length === 0
                                          }
                                        >
                                          <PaperclipIcon className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {(() => {
                                  const hasBlocked = item.items.some(
                                    (row) => row.status === "blocked",
                                  );
                                  const hasActive = item.items.some((row) =>
                                    [
                                      "queued",
                                      "pending",
                                      "in_progress",
                                    ].includes(row.status),
                                  );
                                  const isPartiallyBlocked =
                                    hasBlocked && hasActive;
                                  const showBlockedStyle =
                                    isPartiallyBlocked &&
                                    item.status === "in_progress";
                                  return (
                                    <div className="flex flex-col items-end gap-2">
                                      <Badge
                                        variant={priorityBadge(item.priority)}
                                      >
                                        {item.priority}
                                      </Badge>
                                      <Badge
                                        variant={
                                          showBlockedStyle
                                            ? "status-blocked"
                                            : statusBadge(item.status)
                                        }
                                      >
                                        {String(
                                          item.status ?? "queued",
                                        ).replace("_", " ")}
                                      </Badge>
                                    </div>
                                  );
                                })()}
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
                                    (sum, row) =>
                                      sum + Number(row.duration_minutes ?? 0),
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
                                        Station time:{" "}
                                        {formatDuration(stationDurationMinutes)}
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
                              {expandedQueueItems.has(item.id) &&
                                item.items.length > 0 && (
                                  <div className="mt-2 space-y-2">
                                    {item.items.map((row) => {
                                      const rowKey =
                                        typeof row.meta?.rowKey === "string"
                                          ? row.meta.rowKey
                                          : `${row.order_id}:fallback:${
                                              typeof row.meta?.rowIndex ===
                                              "number"
                                                ? row.meta.rowIndex
                                                : 0
                                            }`;
                                      const stationStatuses =
                                        stationStatusMap.get(rowKey);
                                      const entry = stationStatuses?.get(
                                        station.id,
                                      );
                                      return (
                                        <div
                                          key={row.id}
                                          className="rounded-md border border-border bg-muted/20 px-2 py-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-[11px] text-muted-foreground">
                                              {row.item_name}
                                            </div>
                                            {entry?.status ? (
                                              <div className="relative flex items-center justify-center gap-2">
                                                <Badge
                                                  variant={statusBadge(
                                                    row.status,
                                                  )}
                                                >
                                                  {String(
                                                    row.status ?? "queued",
                                                  ).replace("_", " ")}
                                                </Badge>
                                                {entry.status === "blocked" &&
                                                entry.blockedReason ? (
                                                  <Tooltip
                                                    content={
                                                      entry.blockedReason
                                                    }
                                                  >
                                                    <Info className="absolute bottom-0 right-0 bg-background rounded-full inline-flex h-3.5 w-3.5 text-amber-700" />
                                                  </Tooltip>
                                                ) : null}
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground">
                                                -
                                              </span>
                                            )}
                                          </div>

                                          <div className="mt-1 text-[11px] text-muted-foreground">
                                            Qty: {row.qty}
                                            {row.material
                                              ? ` - ${row.material}`
                                              : ""}
                                          </div>
                                        </div>
                                      );
                                    })}
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
                      Select which stations should process each construction
                      row.
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
                        next[row.id] = routeStations.map(
                          (station) => station.id,
                        );
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
                      <div
                        key={orderId}
                        className="rounded-lg border border-border p-3"
                      >
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
                                    splitSelections[row.id]?.includes(
                                      station.id,
                                    ) ?? false;
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
                  <Button
                    variant="outline"
                    onClick={() => setIsSplitOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmSplit}
                    disabled={isCreatingWorkOrders}
                  >
                    {isCreatingWorkOrders && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    )}
                    Create work order
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
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  Loading orders...
                </div>
              ) : null}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                  Search
                  <input
                    value={qrSearch}
                    onChange={(event) => setQrSearch(event.target.value)}
                    placeholder="Order, customer, batch, construction..."
                    className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                  />
                </label>
                <DatePicker
                  label="Date"
                  value={qrFilterDate}
                  onChange={setQrFilterDate}
                  className="space-y-1 text-xs text-muted-foreground"
                  triggerClassName="h-9"
                />
                <label className="space-y-1 text-xs text-muted-foreground">
                  Status
                  <Select
                    value={qrFilterStatus}
                    onValueChange={(value) =>
                      setQrFilterStatus(
                        value as
                          | "all"
                          | "queued"
                          | "pending"
                          | "in_progress"
                          | "blocked"
                          | "done",
                      )
                    }
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Station
                  <Select
                    value={qrFilterStation}
                    onValueChange={setQrFilterStation}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stations</SelectItem>
                      {stations.map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setQrFilterDate(new Date().toISOString().slice(0, 10))
                    }
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQrSearch("");
                      setQrFilterDate("");
                      setQrFilterStatus("all");
                      setQrFilterStation("all");
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setQrSelectedRowIds([])}
                    disabled={qrSelectedRowIds.length === 0}
                  >
                    Clear selection
                  </Button>
                  <Button
                    onClick={() =>
                      handleOpenQrModal(
                        filteredSelectableRows.filter((row) =>
                          qrSelectedRowIds.includes(row.id),
                        ),
                      )
                    }
                    disabled={
                      qrSelectedRowIds.length === 0 || qrState === "loading"
                    }
                    className="gap-2"
                  >
                    {qrState === "loading" ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    ) : null}
                    Print QR
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      filteredSelectableRows.length > 0 &&
                      qrSelectedRowIds.length === filteredSelectableRows.length
                    }
                    onChange={(event) => {
                      if (event.target.checked) {
                        setQrSelectedRowIds(
                          filteredSelectableRows.map((row) => row.id),
                        );
                      } else {
                        setQrSelectedRowIds([]);
                      }
                    }}
                    disabled={filteredSelectableRows.length === 0}
                  />
                  Select all
                </label>
                <span>
                  {qrSelectedRowIds.length > 0
                    ? `${qrSelectedRowIds.length} selected`
                    : `${filteredQrRows.length} rows`}
                </span>
              </div>

              {orderConstructionRows.length > 0 &&
              selectableConstructionRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  No selectable construction rows found. Make sure your
                  construction tables are marked as Production in Settings.
                </div>
              ) : null}

              {filteredQrRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No construction rows found for the current filters.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Construction</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Started</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Batch</th>
                        <th className="px-3 py-2 text-right">Total time</th>
                        {stations.map((station) => (
                          <th
                            key={station.id}
                            className="px-3 py-2 text-center"
                          >
                            {station.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQrRows.map((row) => {
                        const isChecked = qrSelectedRowIds.includes(row.id);
                        const isSelectable = row.fieldId !== "fallback";
                        const rowKey = rowKeyForRow(row);
                        const stationStatuses = stationStatusMap.get(rowKey);
                        const batchKey = `${row.orderId}:${row.batchCode}`;
                        const runStats = batchRunStats.get(batchKey);
                        const timeStats = rowTimeStats.get(rowKey);
                        const startedAt = runStats?.startAt ?? "";
                        const startedDate = startedAt
                          ? formatDateInput(startedAt.slice(0, 10))
                          : "";
                        const totalMinutes =
                          timeStats?.totalMinutes ??
                          runStats?.totalMinutes ??
                          0;
                        const hasTimeData =
                          Boolean(timeStats) || Boolean(runStats);
                        return (
                          <tr key={row.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isSelectable}
                                onChange={(event) => {
                                  if (!isSelectable) {
                                    return;
                                  }
                                  setQrSelectedRowIds((prev) => {
                                    if (event.target.checked) {
                                      return [...prev, row.id];
                                    }
                                    return prev.filter((id) => id !== row.id);
                                  });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {row.orderNumber}
                            </td>
                            <td className="px-3 py-2">{row.customerName}</td>
                            <td className="px-3 py-2">{row.itemName}</td>
                            <td className="px-3 py-2">
                              {row.dueDate ? formatDateInput(row.dueDate) : "-"}
                            </td>
                            <td className="px-3 py-2">{startedDate || "-"}</td>
                            <td className="px-3 py-2">{row.qty}</td>
                            <td className="px-3 py-2">{row.batchCode}</td>
                            <td className="px-3 py-2 text-right">
                              {hasTimeData ? formatDuration(totalMinutes) : "-"}
                            </td>
                            {stations.map((station) => {
                              const entry = stationStatuses?.get(station.id);
                              const stationMinutes =
                                timeStats?.stationMinutes.get(station.id) ??
                                runStats?.stationMinutes.get(station.id) ??
                                0;
                              return (
                                <td
                                  key={station.id}
                                  className="px-3 py-2 text-center text-xs"
                                >
                                  {entry?.status ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="relative flex items-center justify-center gap-2">
                                        <Badge
                                          variant={statusBadge(
                                            entry.status as BatchRunRow["status"],
                                          )}
                                        >
                                          {entry.status.replace("_", " ")}
                                        </Badge>
                                        {entry.status === "blocked" &&
                                        entry.blockedReason ? (
                                          <Tooltip
                                            content={entry.blockedReason}
                                          >
                                            <Info className="absolute bottom-0 right-0 bg-background rounded-full inline-flex h-3.5 w-3.5 text-amber-700" />
                                          </Tooltip>
                                        ) : null}
                                      </div>
                                      <span className="text-[11px] text-muted-foreground">
                                        {formatDuration(stationMinutes)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      -
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Production calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <DatePicker
                  label="Start date"
                  value={viewDate}
                  onChange={setViewDate}
                  className="flex items-center gap-2"
                />
                <label className="flex items-center gap-2">
                  Range
                  <Select
                    value={String(plannedRangeDays)}
                    onValueChange={(value) =>
                      setPlannedRangeDays(Number(value))
                    }
                  >
                    <SelectTrigger className="h-9 w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {calendarDates.length === 0 || stations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No calendar data available.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Station</th>
                        {calendarDates.map((date) => {
                          const key = date.toISOString().slice(0, 10);
                          return (
                            <th key={key} className="px-3 py-2 text-center">
                              {formatDateInput(key)}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((station) => (
                        <tr key={station.id} className="border-t border-border">
                          <td className="px-3 py-2 text-sm font-medium">
                            {station.name}
                          </td>
                          {calendarDates.map((date) => {
                            const key = date.toISOString().slice(0, 10);
                            const cell = calendarCells.get(
                              `${station.id}:${key}`,
                            );
                            return (
                              <td
                                key={key}
                                className="px-3 py-2 text-center text-xs"
                              >
                                {cell ? (
                                  <div className="space-y-1">
                                    <div className="font-medium text-foreground">
                                      {cell.count} runs
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {cell.orders.size} orders
                                    </div>
                                    {cell.minutes > 0 ? (
                                      <div className="text-[11px] text-muted-foreground">
                                        {formatDuration(cell.minutes)}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <style jsx global>{`
            @media print {
              @page {
                size: ${qrPageSizeCss};
                margin: 8mm;
              }
              body * {
                visibility: hidden;
              }
              .qr-print-root,
              .qr-print-root * {
                visibility: visible;
              }
              .qr-print-root {
                position: fixed;
                left: 0;
                top: 0;
                width: 100%;
              }
              .qr-print-page {
                page-break-after: always;
              }
            }
          `}</style>
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-lg font-semibold">Print QR codes</div>
                <div className="text-xs text-muted-foreground">
                  {qrRows.length} label(s) ready
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={qrState !== "ready" || qrRows.length === 0}
                >
                  Print
                </Button>
                <Button variant="outline" onClick={handleCloseQrModal}>
                  Close
                </Button>
              </div>
            </div>
            <div className="grid h-[calc(90vh-72px)] gap-6 overflow-hidden px-6 py-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-4 overflow-y-auto pr-2">
                <label className="space-y-2 text-sm font-medium">
                  Label size
                  <Select value={qrSize} onValueChange={setQrSize}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {qrEnabledSizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {qrLabelSizePresets[size]?.label ?? size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Content fields</div>
                  <div className="text-xs text-muted-foreground">
                    Drag to reorder. Checked fields appear on the label.
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {qrFieldOrder.map((value) => {
                      const label = qrFieldLabels[value] ?? value;
                      const checked = qrFieldSelection.includes(value);
                      return (
                        <div
                          key={value}
                          className={`flex items-center gap-2 rounded-md border border-border px-2 py-2 ${
                            qrDragField === value ? "bg-muted/40" : "bg-card"
                          }`}
                          draggable
                          onDragStart={() => setQrDragField(value)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (!qrDragField || qrDragField === value) {
                              setQrDragField(null);
                              return;
                            }
                            setQrFieldOrder((prev) => {
                              const next = [...prev];
                              const from = next.indexOf(qrDragField);
                              const to = next.indexOf(value);
                              if (from === -1 || to === -1) {
                                return prev;
                              }
                              next.splice(from, 1);
                              next.splice(to, 0, qrDragField);
                              return next;
                            });
                            setQrDragField(null);
                          }}
                        >
                          <span className="text-xs text-muted-foreground">
                            ↕
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setQrFieldSelection((prev) => {
                                if (event.target.checked) {
                                  if (prev.includes(value)) {
                                    return prev;
                                  }
                                  const next = [...prev, value];
                                  setQrContentFields(next);
                                  return next;
                                }
                                const next = prev.filter(
                                  (item) => item !== value,
                                );
                                setQrContentFields(next);
                                return next;
                              });
                            }}
                          />
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3">
                  <label className="space-y-2 text-sm font-medium">
                    Orientation
                    <Select
                      value={qrOrientation}
                      onValueChange={(value) =>
                        setQrOrientation(value as "portrait" | "landscape")
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Vertical</SelectItem>
                        <SelectItem value="landscape">Horizontal</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Preview zoom
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.1}
                      value={qrPreviewScale}
                      onChange={(event) =>
                        setQrPreviewScale(Number(event.target.value))
                      }
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground">
                      {Math.round(qrPreviewScale * 100)}%
                    </div>
                  </label>
                </div>
                {qrState === "loading" ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    Generating QR codes...
                  </div>
                ) : null}
                {qrState === "error" && qrError ? (
                  <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                    {qrError}
                  </div>
                ) : null}
              </div>
              <div className="qr-print-root overflow-y-auto rounded-xl border border-border bg-muted/10 p-4">
                {qrRows.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground">
                    No QR labels to preview.
                  </div>
                ) : (
                  <div
                    className="space-y-4"
                    style={{
                      transform: `scale(${qrPreviewScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {qrRows.map((entry) => (
                      <div
                        key={entry.token}
                        className="qr-print-page mx-auto flex items-center gap-4 rounded-lg border border-border bg-background p-4 shadow-sm"
                        style={qrPageStyle}
                      >
                        <div className="flex h-full items-center">
                          {qrImages[entry.token] ? (
                            <img
                              src={qrImages[entry.token]}
                              alt="QR"
                              className="h-24 w-24"
                            />
                          ) : (
                            <div className="h-24 w-24 rounded-md border border-dashed border-border" />
                          )}
                        </div>
                        <div className="space-y-1 text-xs">
                          {orderedQrFields.map((fieldKey) => {
                            const value = getQrFieldValue(entry.row, fieldKey);
                            if (!value) {
                              return null;
                            }
                            return (
                              <div key={fieldKey} className="flex gap-2">
                                <span className="min-w-[72px] text-muted-foreground">
                                  {qrFieldLabels[fieldKey] ?? fieldKey}
                                </span>
                                <span className="font-medium text-foreground">
                                  {value}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </>
  );
}
