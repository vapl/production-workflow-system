"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DatePicker } from "@/components/ui/DatePicker";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { RangeField } from "@/components/ui/RangeField";
import { SelectField } from "@/components/ui/SelectField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import {
  computeWorkingMinutes,
  parseWorkingCalendar,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import {
  buildProductionSplitRows,
  type ProductionBatchGroup as BatchGroup,
  type ProductionSplitRow as SplitRow,
} from "@/lib/domain/buildProductionSplitRows";
import {
  buildQueueByStation,
  filterReadyBatchGroups,
  type ProductionQueueItem as QueueItem,
} from "@/lib/domain/productionQueue";
import {
  getProductionQrFieldValue,
  prepareProductionQrRows,
} from "@/lib/domain/prepareProductionQrRows";
import {
  buildConstructionRowsFromOrderItems,
  isMissingOrderItemsSchema,
  mapOrderItemRow,
} from "@/lib/domain/orderItems";
import type { OrderInputField } from "@/types/orderInputs";
import {
  CalendarIcon,
  ClipboardListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  Info,
  ListIcon,
  PanelRightIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
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
  status: "queued" | "pending" | "in_progress" | "blocked" | "done";
  station_id: string | null;
  meta: Record<string, unknown> | null;
  started_at?: string | null;
  done_at?: string | null;
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

function normalizeJoinedOrder(value: unknown): {
  order_number: string | null;
  due_date: string | null;
  priority: Priority | null;
  customer_name: string | null;
} | null {
  const item = Array.isArray(value) ? (value[0] ?? null) : value;
  if (!item || typeof item !== "object") {
    return null;
  }
  const row = item as Record<string, unknown>;
  const priority =
    row.priority === "low" ||
    row.priority === "normal" ||
    row.priority === "high" ||
    row.priority === "urgent"
      ? row.priority
      : null;
  return {
    order_number:
      typeof row.order_number === "string" ? row.order_number : null,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    priority,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : null,
  };
}

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

function rowKeyForProductionItem(item: ProductionItemRow) {
  if (typeof item.meta?.rowKey === "string") {
    return item.meta.rowKey;
  }
  const sourceRowId =
    typeof item.meta?.sourceRowId === "string" && item.meta.sourceRowId.trim()
      ? item.meta.sourceRowId.trim()
      : null;
  if (sourceRowId) {
    const fieldId =
      typeof item.meta?.fieldId === "string" && item.meta.fieldId.trim()
        ? item.meta.fieldId
        : "fallback";
    return `${item.order_id}:${fieldId}:${sourceRowId}`;
  }
  return `${item.order_id}:fallback:${
    typeof item.meta?.rowIndex === "number" ? item.meta.rowIndex : 0
  }`;
}

export default function ProductionPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { rules } = useWorkflowRules();
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("default");
  const [plannedDate] = useState(new Date().toISOString().slice(0, 10));
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
  const [workingCalendar, setWorkingCalendar] = useState<WorkingCalendar>({
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "17:00" }],
  });
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
  const [qrFilterDate, setQrFilterDate] = useState("");
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
  const [splitMode, setSplitMode] = useState<"release" | "replan">("release");
  const [isCreatingWorkOrders, setIsCreatingWorkOrders] = useState(false);
  const [activeProductionTab, setActiveProductionTab] = useState<
    "planning" | "list" | "calendar"
  >("planning");
  const [mobilePlanningView, setMobilePlanningView] = useState<
    "ready" | "queues"
  >("ready");
  const [mobilePlanningSlide, setMobilePlanningSlide] = useState<
    "none" | "left" | "right"
  >("none");
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);
  const [isMobilePlanningRouteOpen, setIsMobilePlanningRouteOpen] =
    useState(false);
  const [isMobileQueueFiltersOpen, setIsMobileQueueFiltersOpen] =
    useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const hideMobileFloatingControls = useHideMobileFloatingControls();
  const [removingQueueId, setRemovingQueueId] = useState<string | null>(null);
  const [selectedQueueRunIds, setSelectedQueueRunIds] = useState<string[]>([]);
  const [queueConstructionSelections, setQueueConstructionSelections] =
    useState<Record<string, string[]>>({});
  const [queueActionDate, setQueueActionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isQueueBulkApplying, setIsQueueBulkApplying] = useState(false);
  const [queueRemoveChoice, setQueueRemoveChoice] = useState<{
    runId: string;
    orderLabel: string;
    stationName: string;
  } | null>(null);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [splitSelections, setSplitSelections] = useState<
    Record<string, string[]>
  >({});
  const [splitPlannedDates, setSplitPlannedDates] = useState<
    Record<string, string>
  >({});
  const [splitGlobalPlannedDate, setSplitGlobalPlannedDate] = useState("");
  const planningSwipeStartXRef = useRef<number | null>(null);
  const planningSwipeStartYRef = useRef<number | null>(null);
  const planningSwipeLastXRef = useRef(0);
  const planningSwipeContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileSlideTimeoutRef = useRef<number | null>(null);
  const [planningDragX, setPlanningDragX] = useState(0);
  const [planningIsDragging, setPlanningIsDragging] = useState(false);
  const [planningSwipeWidth, setPlanningSwipeWidth] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";

  const productionAttachmentCategory =
    rules.attachmentCategoryDefaults?.Production ??
    productionAttachmentFallbackCategory;
  const statusLabel = (status: BatchRunRow["status"]) =>
    t(`production.main.status.${status}`);
  const priorityLabel = (priority: Priority) =>
    t(`production.main.priority.${priority}`);

  useEffect(() => {
    if (!supabase) {
      setDataError(t("production.main.errors.supabaseNotConfigured"));
      return;
    }
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setDataError("");
      const sb = supabase;
      if (!sb) {
        setDataError(t("production.main.errors.supabaseNotConfigured"));
        setIsLoading(false);
        return;
      }
      const [stationsResult, itemsResult, runsResult, ordersResult] =
        await Promise.all([
          sb
            .from("workstations")
            .select("id, name, is_active, sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          sb
            .from("production_items")
            .select(
              "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, duration_minutes, orders (order_number, due_date, priority, customer_name)",
            )
            .order("created_at", { ascending: false }),
          sb
            .from("batch_runs")
            .select(
              "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, priority, customer_name)",
            )
            .order("created_at", { ascending: false }),
          sb
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
        setDataError(t("production.main.errors.loadFailed"));
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
      setProductionItems(
        (itemsResult.data ?? []).map((row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setBatchRuns(
        (runsResult.data ?? []).map((row) => ({
          ...(row as Omit<BatchRunRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setReadyOrders((ordersResult.data ?? []) as ReadyOrderRow[]);
      setIsLoading(false);
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let isMounted = true;
    const loadProductionDetails = async () => {
      if (!supabase) {
        return;
      }
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
        const nextValues: Record<string, Record<string, unknown>> = {};
        const nonTableFieldIds = normalizedFields
          .filter((field) => field.fieldType !== "table")
          .map((field) => field.id);
        if (nonTableFieldIds.length > 0) {
          const valuesResult = await supabase
            .from("order_input_values")
            .select("order_id, field_id, value")
            .in("order_id", orderIds)
            .in("field_id", nonTableFieldIds);
          if (!isMounted) {
            return;
          }
          (valuesResult.data ?? []).forEach(
            (row: { order_id: string; field_id: string; value: unknown }) => {
              const orderId = row.order_id as string;
              const fieldId = row.field_id as string;
              if (!nextValues[orderId]) {
                nextValues[orderId] = {};
              }
              nextValues[orderId][fieldId] = row.value;
            },
          );
        }

        const tableFields = normalizedFields.filter(
          (field) => field.fieldType === "table",
        );
        if (tableFields.length > 0) {
          const orderItemsResult = await supabase
            .from("order_items")
            .select(
              "id, order_id, source_kind, source_row_id, sort_order, position, item_name, item_type, qty, material, dimensions, sku, uom, revision, lifecycle_status, valid_from, valid_to, supply_type, item_group, route_code, net_weight, volume, default_supplier, quality_class, certification_required, production_notes, attributes, created_at, updated_at",
            )
            .in("order_id", orderIds)
            .eq("source_kind", "order_input_table")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });

          if (!isMounted) {
            return;
          }

          if (
            orderItemsResult.data &&
            !isMissingOrderItemsSchema(orderItemsResult.error)
          ) {
            const items = orderItemsResult.data.map(mapOrderItemRow);
            const primaryField = tableFields[0] ?? null;
            if (primaryField) {
              const rowsByOrder = new Map<string, ReturnType<typeof buildConstructionRowsFromOrderItems>>();
              items.forEach((item) => {
                const current = rowsByOrder.get(item.orderId) ?? [];
                current.push(
                  ...buildConstructionRowsFromOrderItems(primaryField, [item]),
                );
                rowsByOrder.set(item.orderId, current);
              });

              rowsByOrder.forEach((rows, orderId) => {
                if (!nextValues[orderId]) {
                  nextValues[orderId] = {};
                }
                nextValues[orderId][primaryField.id] = rows;
              });
            }
          }
        }

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
  }, [productionItems, readyOrders, productionAttachmentCategory]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.tenantId) {
      return;
    }
    const channel = sb
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
      sb.removeChannel(channel);
    };
  }, [user?.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
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
          const { data } = await sb.storage
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
      const columns = field.columns ?? [];
      if (columns.length === 0) {
        return rows.length > 0 ? [`${rows.length} rows`] : [];
      }
      return rows
        .map((row) => {
          if (!row || typeof row !== "object") {
            return "";
          }
          const values = columns.map((column) => {
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
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : {};
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
      if (!supabase) {
        return;
      }
      const { data, error } = await supabase
        .from("tenant_settings")
        .select(
          "workday_start, workday_end, workdays, work_shifts, qr_enabled_sizes, qr_default_size, qr_content_fields",
        )
        .eq("tenant_id", user.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      setWorkingCalendar(parseWorkingCalendar(data));
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
      const fieldId =
        typeof item.meta?.fieldId === "string"
          ? item.meta.fieldId
          : (parts[1] ?? "fallback");
      const rawRowIndex =
        typeof item.meta?.rowIndex === "number" ||
        typeof item.meta?.rowIndex === "string"
          ? item.meta.rowIndex
          : (parts[2] ?? 0);
      const rowIndex = Number(rawRowIndex);
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
        sourceRowId:
          typeof item.meta?.sourceRowId === "string"
            ? item.meta.sourceRowId
            : null,
        rowIndex: normalizedIndex,
        rawRow:
          typeof item.meta?.row === "object" && item.meta?.row !== null
            ? (item.meta.row as Record<string, unknown>)
            : {},
      });
    });
    return rows;
  }, [productionItems]);

  const orderConstructionRows =
    productionConstructionRows.length > 0
      ? productionConstructionRows
      : buildProductionSplitRows(
          readyBatchGroups,
          productionFields,
          productionValues,
        );

  const rowKeyForRow = (row: SplitRow) =>
    row.id;

  const executionKey = (
    orderId: string,
    batchCode: string,
    stationId: string | null,
  ) => `${orderId}:${batchCode}:${stationId ?? "unassigned"}`;

  const runByExecutionKey = useMemo(() => {
    const map = new Map<string, BatchRunRow>();
    batchRuns.forEach((run) => {
      const key = executionKey(run.order_id, run.batch_code, run.station_id);
      if (!map.has(key)) {
        map.set(key, run);
      }
    });
    return map;
  }, [batchRuns]);

  const stationStatusMap = useMemo(() => {
    const map = new Map<
      string,
      Map<
        string,
        { status: BatchRunRow["status"]; blockedReason?: string }
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
      const run = runByExecutionKey.get(
        executionKey(item.order_id, item.batch_code, item.station_id),
      );
      const blockedReason =
        run?.blocked_reason ??
        (typeof (item.meta as Record<string, unknown> | null)?.blocked_reason ===
        "string"
          ? ((item.meta as Record<string, unknown>).blocked_reason as string)
          : undefined);
      map.get(rowKey)?.set(stationId, {
        status: run?.status ?? item.status,
        blockedReason,
      });
    });
    return map;
  }, [productionItems, runByExecutionKey]);

  const rowPlannedDateMap = useMemo(() => {
    const map = new Map<string, string>();
    productionItems.forEach((item) => {
      const rowKey = rowKeyForProductionItem(item);
      const plannedDate =
        typeof item.meta?.plannedDate === "string" ? item.meta.plannedDate : "";
      if (plannedDate && !map.has(rowKey)) {
        map.set(rowKey, plannedDate);
      }
    });
    return map;
  }, [productionItems]);

  const replanLockedRowMap = useMemo(() => {
    const map = new Map<string, boolean>();
    productionItems.forEach((item) => {
      const rowKey = rowKeyForProductionItem(item);
      const key = `${item.order_id}:${item.batch_code}:${rowKey}`;
      const run = runByExecutionKey.get(
        executionKey(item.order_id, item.batch_code, item.station_id),
      );
      const isLocked =
        Boolean(run?.started_at ?? item.started_at) ||
        Boolean(run?.done_at ?? item.done_at) ||
        (run?.status ?? item.status) === "in_progress" ||
        (run?.status ?? item.status) === "done";
      if (isLocked) {
        map.set(key, true);
      } else if (!map.has(key)) {
        map.set(key, false);
      }
    });
    return map;
  }, [productionItems, runByExecutionKey]);

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

  const qrRowsForStatusCounts = useMemo(() => {
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
    qrFilterStation,
    stationStatusMap,
    rowPlannedDateMap,
  ]);

  const qrStatusCounts = useMemo(() => {
    const hasStatus = (
      row: (typeof qrRowsForStatusCounts)[number],
      status: "queued" | "pending" | "in_progress" | "blocked" | "done",
    ) => {
      const rowKey = rowKeyForRow(row);
      const stationStatuses = stationStatusMap.get(rowKey);
      if (qrFilterStation !== "all") {
        const entry = stationStatuses?.get(qrFilterStation);
        return entry?.status === status;
      }
      return Array.from(stationStatuses?.values() ?? []).some(
        (entry) => entry.status === status,
      );
    };

    return {
      all: qrRowsForStatusCounts.length,
      queued: qrRowsForStatusCounts.filter((row) => hasStatus(row, "queued"))
        .length,
      pending: qrRowsForStatusCounts.filter((row) => hasStatus(row, "pending"))
        .length,
      in_progress: qrRowsForStatusCounts.filter((row) =>
        hasStatus(row, "in_progress"),
      ).length,
      blocked: qrRowsForStatusCounts.filter((row) => hasStatus(row, "blocked"))
        .length,
      done: qrRowsForStatusCounts.filter((row) => hasStatus(row, "done"))
        .length,
    };
  }, [qrRowsForStatusCounts, stationStatusMap, qrFilterStation]);

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

  const canRelease = selectedBatchKeys.length > 0 && routeStations.length > 0;

  const buildQrRows = async (rows: SplitRow[]) => {
    if (!supabase || !user?.isAuthenticated) {
      return;
    }
    setQrState("loading");
    setQrError(null);
    try {
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";
      const { withTokens, imageMap } = await prepareProductionQrRows({
        client: supabase,
        rows,
        userId: user?.id ?? null,
        isAuthenticated: Boolean(user?.isAuthenticated),
        baseUrl,
      });
      setQrRows(withTokens);
      setQrImages(imageMap);
      setQrState("ready");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("production.main.errors.failedPrepareQrCodes");
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
    const rows = buildProductionSplitRows(
      nextGroups,
      productionFields,
      productionValues,
    );
    const defaults: Record<string, string[]> = {};
    const dateDefaults: Record<string, string> = {};
    rows.forEach((row) => {
      defaults[row.id] = routeStations.map((station) => station.id);
      dateDefaults[row.id] = rowPlannedDateMap.get(row.id) ?? plannedDate;
    });
    const dateValues = Array.from(new Set(Object.values(dateDefaults))).filter(
      Boolean,
    );
    const initialGlobalDate =
      dateValues.length === 1 ? dateValues[0] : plannedDate;
    setSplitRows(rows);
    setSplitSelections(defaults);
    setSplitPlannedDates(dateDefaults);
    setSplitGlobalPlannedDate(initialGlobalDate);
    setSplitMode("release");
    setIsSplitOpen(true);
  };

  const handleOpenQueueReplan = (item: QueueItem) => {
    if (!canManageQueue) {
      return;
    }
    const selectedRowKeys = new Set(queueConstructionSelections[item.id] ?? []);
    if (selectedRowKeys.size === 0) {
      setDataError(t("production.main.errors.selectAtLeastOneForReplan"));
      return;
    }
    const selectedRows = item.items
      .map((row) => {
        const rowKey = rowKeyForProductionItem(row);
        if (!selectedRowKeys.has(rowKey)) {
          return null;
        }
        const locked =
          replanLockedRowMap.get(
            `${item.orderId}:${item.batchCode}:${rowKey}`,
          ) ?? false;
        if (locked) {
          return null;
        }
        const parts = rowKey.split(":");
        const fieldId = parts[1] ?? "fallback";
        const rowIndexRaw = Number(row.meta?.rowIndex ?? 0);
        const rowIndex = Number.isFinite(rowIndexRaw) ? rowIndexRaw : 0;
        const sourceRowId =
          typeof row.meta?.sourceRowId === "string"
            ? row.meta.sourceRowId
            : null;
        return {
          id: rowKey,
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          customerName: item.customerName,
          dueDate: item.dueDate,
          batchCode: item.batchCode,
          priority: item.priority,
          fieldId,
          fieldLabel:
            typeof row.meta?.fieldLabel === "string"
              ? row.meta.fieldLabel
              : "Order",
          itemName: row.item_name,
          qty: Number(row.qty ?? 1),
          material: row.material ?? item.material ?? "",
          sourceRowId,
          rowIndex,
          rawRow:
            typeof row.meta?.row === "object" && row.meta?.row !== null
              ? (row.meta.row as Record<string, unknown>)
              : {},
        } satisfies SplitRow;
      })
      .filter((row): row is SplitRow => Boolean(row));

    if (selectedRows.length === 0) {
      setDataError(
        "Selected constructions cannot be replanned because work has already started.",
      );
      return;
    }

    const defaults: Record<string, string[]> = {};
    const dateDefaults: Record<string, string> = {};
    selectedRows.forEach((row) => {
      defaults[row.id] = routeStations.map((station) => station.id);
      dateDefaults[row.id] =
        rowPlannedDateMap.get(row.id) ?? item.plannedDate ?? viewDate;
    });
    const dateValues = Array.from(new Set(Object.values(dateDefaults))).filter(
      Boolean,
    );
    const initialGlobalDate =
      dateValues.length === 1 ? dateValues[0] : item.plannedDate ?? viewDate;

    setSplitRows(selectedRows);
    setSplitSelections(defaults);
    setSplitPlannedDates(dateDefaults);
    setSplitGlobalPlannedDate(initialGlobalDate);
    setSplitMode("replan");
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
    if (selectedRows.length === 0) {
      setDataError(t("production.main.errors.selectAtLeastOneConstruction"));
      setIsCreatingWorkOrders(false);
      return;
    }

    const effectiveDatesByRow = new Map<string, string>();
    for (const row of selectedRows) {
      const date = splitPlannedDates[row.id] ?? plannedDate;
      if (!date) {
        setDataError(t("production.main.errors.plannedDateRequired"));
        setIsCreatingWorkOrders(false);
        return;
      }
      effectiveDatesByRow.set(row.id, date);
    }

    const usedCodesByOrder = new Map<string, Set<string>>();
    const registerCode = (orderId: string, code: string) => {
      if (!usedCodesByOrder.has(orderId)) {
        usedCodesByOrder.set(orderId, new Set());
      }
      usedCodesByOrder.get(orderId)?.add(code);
    };
    batchRuns.forEach((run) => registerCode(run.order_id, run.batch_code));
    productionItems.forEach((item) =>
      registerCode(item.order_id, item.batch_code || "B1"),
    );
    const nextBatchCode = (orderId: string, preferred?: string) => {
      const used = usedCodesByOrder.get(orderId) ?? new Set<string>();
      if (!usedCodesByOrder.has(orderId)) {
        usedCodesByOrder.set(orderId, used);
      }
      if (preferred && !used.has(preferred)) {
        used.add(preferred);
        return preferred;
      }
      let max = 0;
      used.forEach((code) => {
        const match = /^B(\d+)$/i.exec(code.trim());
        if (match?.[1]) {
          max = Math.max(max, Number(match[1]));
        }
      });
      const generated = `B${Math.max(1, max + 1)}`;
      used.add(generated);
      return generated;
    };

    const batchCodeByOrderDate = new Map<string, string>();
    const selectedRowsByOrder = new Map<string, SplitRow[]>();
    selectedRows.forEach((row) => {
      if (!selectedRowsByOrder.has(row.orderId)) {
        selectedRowsByOrder.set(row.orderId, []);
      }
      selectedRowsByOrder.get(row.orderId)?.push(row);
    });
    selectedRowsByOrder.forEach((rows, orderId) => {
      const uniqueDates = Array.from(
        new Set(
          rows.map((row) => effectiveDatesByRow.get(row.id) ?? plannedDate),
        ),
      ).sort();
      rows.sort((a, b) => a.id.localeCompare(b.id));
      uniqueDates.forEach((date, index) => {
        const firstRow = rows.find(
          (row) => (effectiveDatesByRow.get(row.id) ?? plannedDate) === date,
        );
        const preferred = index === 0 ? firstRow?.batchCode : undefined;
        const code = nextBatchCode(orderId, preferred);
        batchCodeByOrderDate.set(`${orderId}:${date}`, code);
      });
    });

    const productionRows = selectedRows.flatMap((row) =>
      (splitSelections[row.id] ?? []).map((stationId) => {
        const rowDate = effectiveDatesByRow.get(row.id) ?? plannedDate;
        const batchCode =
          batchCodeByOrderDate.get(`${row.orderId}:${rowDate}`) ??
          row.batchCode;
        return {
          order_id: row.orderId,
          batch_code: batchCode,
          item_name: row.itemName,
          qty: row.qty,
          material: row.material || null,
          priority: row.priority,
          status: "queued",
          station_id: stationId,
          meta: {
            fieldId: row.fieldId,
            fieldLabel: row.fieldLabel,
            rowIndex: row.rowIndex,
            sourceRowId: row.sourceRowId ?? null,
            rowKey: row.id,
            plannedDate: rowDate,
            row: row.rawRow,
          },
        };
      }),
    );
    let normalizedInsertedItems: ProductionItemRow[] = [];
    if (productionRows.length > 0) {
      const { data, error } = await supabase
        .from("production_items")
        .insert(productionRows)
        .select(
          "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, orders (order_number, due_date, priority, customer_name)",
        );
      if (error) {
        setDataError(t("production.main.errors.failedCreateProductionItems"));
        setIsCreatingWorkOrders(false);
        return;
      }
      normalizedInsertedItems = (data ?? []).map(
        (row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        }),
      );
    }
    const runsByOrderDate = new Map<
      string,
      { orderId: string; date: string }
    >();
    selectedRows.forEach((row) => {
      const date = effectiveDatesByRow.get(row.id) ?? plannedDate;
      const key = `${row.orderId}:${date}`;
      if (!runsByOrderDate.has(key)) {
        runsByOrderDate.set(key, { orderId: row.orderId, date });
      }
    });
    const insertRows = Array.from(runsByOrderDate.values()).flatMap((entry) => {
      const batchCode =
        batchCodeByOrderDate.get(`${entry.orderId}:${entry.date}`) ?? "B1";
      return routeStations.map((station, index) => ({
        order_id: entry.orderId,
        batch_code: batchCode,
        station_id: station.id,
        route_key: activeRoute.key,
        step_index: index,
        status: "queued",
        planned_date: entry.date,
      }));
    });
    const { data: inserted, error } = await supabase
      .from("batch_runs")
      .insert(insertRows)
      .select(
        "id, order_id, batch_code, station_id, route_key, step_index, status, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
      );
    if (error) {
      setDataError(t("production.main.errors.failedCreateBatchRuns"));
      setIsCreatingWorkOrders(false);
      return;
    }
    await supabase
      .from("orders")
      .update({ status: "in_production" })
      .in("id", Array.from(new Set(selectedRows.map((row) => row.orderId))));
    const normalizedInsertedRuns: BatchRunRow[] = (inserted ?? []).map(
      (row) => ({
        ...(row as Omit<BatchRunRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      }),
    );
    const selectedRowKeySet = new Set(selectedRows.map((row) => row.id));
    let removedItemIds = new Set<string>();
    let removedRunIds = new Set<string>();
    if (splitMode === "replan" && selectedRows.length > 0) {
      const sourceOrderId = selectedRows[0]?.orderId;
      const sourceBatchCode = selectedRows[0]?.batchCode;
      const sourceItems = productionItems.filter(
        (item) =>
          item.order_id === sourceOrderId &&
          item.batch_code === sourceBatchCode &&
          selectedRowKeySet.has(rowKeyForProductionItem(item)),
      );
      if (sourceItems.length > 0) {
        const sourceItemIds = sourceItems.map((item) => item.id);
        const { error: removeItemsError } = await supabase
          .from("production_items")
          .delete()
          .in("id", sourceItemIds);
        if (removeItemsError) {
          setDataError(
            removeItemsError.message ??
              t("production.main.errors.failedRemoveOldConstructionRows"),
          );
          setIsCreatingWorkOrders(false);
          return;
        }
        removedItemIds = new Set(sourceItemIds);

        const affectedStationIds = new Set(
          sourceItems
            .map((item) => item.station_id)
            .filter((id): id is string => Boolean(id)),
        );
        const remainingSourceItems = productionItems.filter(
          (item) =>
            item.order_id === sourceOrderId &&
            item.batch_code === sourceBatchCode &&
            !selectedRowKeySet.has(rowKeyForProductionItem(item)),
        );
        const stationIdsWithRemaining = new Set(
          remainingSourceItems
            .map((item) => item.station_id)
            .filter((id): id is string => Boolean(id)),
        );
        const sourceRunIdsToDelete = batchRuns
          .filter(
            (run) =>
              run.order_id === sourceOrderId &&
              run.batch_code === sourceBatchCode &&
              Boolean(run.station_id) &&
              affectedStationIds.has(run.station_id as string) &&
              !stationIdsWithRemaining.has(run.station_id as string),
          )
          .map((run) => run.id);
        if (sourceRunIdsToDelete.length > 0) {
          const { error: removeRunsError } = await supabase
            .from("batch_runs")
            .delete()
            .in("id", sourceRunIdsToDelete);
          if (removeRunsError) {
            setDataError(
              removeRunsError.message ??
                t("production.main.errors.failedCleanupEmptyRuns"),
            );
            setIsCreatingWorkOrders(false);
            return;
          }
          removedRunIds = new Set(sourceRunIdsToDelete);
        }
      }
    }
    setProductionItems((prev) => [
      ...normalizedInsertedItems,
      ...prev.filter((item) => !removedItemIds.has(item.id)),
    ]);
    setBatchRuns((prev) => [
      ...normalizedInsertedRuns,
      ...prev.filter((run) => !removedRunIds.has(run.id)),
    ]);
    if (splitMode === "replan" && selectedRowKeySet.size > 0) {
      setQueueConstructionSelections((prev) => {
        const next: Record<string, string[]> = {};
        Object.entries(prev).forEach(([runId, rowKeys]) => {
          const filtered = rowKeys.filter((key) => !selectedRowKeySet.has(key));
          if (filtered.length > 0) {
            next[runId] = filtered;
          }
        });
        return next;
      });
    }
    setSelectedBatchKeys([]);
    setSplitPlannedDates({});
    setSplitGlobalPlannedDate("");
    setSplitMode("release");
    setIsSplitOpen(false);
    setIsCreatingWorkOrders(false);
  };

  const queueByStation = useMemo(() => {
    return buildQueueByStation({
      batchRuns,
      productionItems,
      stations,
      viewDate,
      plannedRangeDays,
    });
  }, [batchRuns, productionItems, stations, viewDate, plannedRangeDays]);
  const queueItemsCount = useMemo(
    () =>
      Array.from(queueByStation.values()).reduce(
        (sum, queue) => sum + queue.length,
        0,
      ),
    [queueByStation],
  );
  const visibleQueueRunIds = useMemo(
    () =>
      Array.from(queueByStation.values())
        .flat()
        .map((item) => item.id),
    [queueByStation],
  );
  const allVisibleQueueSelected =
    visibleQueueRunIds.length > 0 &&
    visibleQueueRunIds.every((id) => selectedQueueRunIds.includes(id));

  useEffect(() => {
    const visibleSet = new Set(visibleQueueRunIds);
    setSelectedQueueRunIds((prev) => prev.filter((id) => visibleSet.has(id)));
  }, [visibleQueueRunIds]);

  useEffect(() => {
    const queueItemMap = new Map<string, QueueItem>();
    Array.from(queueByStation.values())
      .flat()
      .forEach((item) => {
        queueItemMap.set(item.id, item);
      });
    setQueueConstructionSelections((prev) => {
      const next: Record<string, string[]> = {};
      let changed = false;
      Object.entries(prev).forEach(([runId, rowKeys]) => {
        const queueItem = queueItemMap.get(runId);
        if (!queueItem) {
          changed = true;
          return;
        }
        const validRowKeys = new Set(
          queueItem.items.map((row) => rowKeyForProductionItem(row)),
        );
        const filtered = rowKeys.filter((rowKey) => validRowKeys.has(rowKey));
        if (filtered.length > 0) {
          next[runId] = filtered;
        }
        if (filtered.length !== rowKeys.length) {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [queueByStation]);

  const canManageQueue =
    user.isAdmin || user.isOwner || user.role === "Production planner";

  const canRunBeRemoved = (run: BatchRunRow) => {
    const stationItems = productionItems.filter(
      (item) =>
        item.order_id === run.order_id &&
        item.batch_code === run.batch_code &&
        item.station_id === run.station_id,
    );
    return !stationItems.some(
      (row) =>
        row.started_at || row.status === "in_progress" || row.status === "done",
    );
  };

  const removeQueueRuns = async (runIds: string[]) => {
    if (!supabase || runIds.length === 0) {
      return;
    }
    const runsToRemove = batchRuns.filter((run) => runIds.includes(run.id));
    if (runsToRemove.length === 0) {
      return;
    }

    let hadError = false;
    for (const run of runsToRemove) {
      const { error } = await supabase
        .from("batch_runs")
        .delete()
        .eq("id", run.id);
      if (error) {
        hadError = true;
        continue;
      }
      const { error: itemsError } = await supabase
        .from("production_items")
        .delete()
        .eq("order_id", run.order_id)
        .eq("batch_code", run.batch_code)
        .eq("station_id", run.station_id);
      if (itemsError) {
        hadError = true;
      }
    }

    const removedIdSet = new Set(runsToRemove.map((run) => run.id));
    setBatchRuns((prev) => prev.filter((run) => !removedIdSet.has(run.id)));
    setProductionItems((prev) =>
      prev.filter(
        (item) =>
          !runsToRemove.some(
            (run) =>
              item.order_id === run.order_id &&
              item.batch_code === run.batch_code &&
              item.station_id === run.station_id,
          ),
      ),
    );
    setSelectedQueueRunIds((prev) =>
      prev.filter((id) => !removedIdSet.has(id)),
    );

    const remainingRuns = batchRuns.filter((run) => !removedIdSet.has(run.id));
    const affectedOrderIds = Array.from(
      new Set(runsToRemove.map((run) => run.order_id)),
    );
    for (const orderId of affectedOrderIds) {
      const hasAnyRuns = remainingRuns.some((run) => run.order_id === orderId);
      if (!hasAnyRuns) {
        await supabase
          .from("orders")
          .update({ status: "ready_for_production" })
          .eq("id", orderId);
      }
    }

    if (hadError) {
      setDataError(t("production.main.errors.someQueueEntriesNotRemoved"));
    }
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
        ? t("production.main.queue.removeDescriptionWithParts", {
            target: descriptionParts.join(
              t("production.main.queue.removeDescriptionFrom"),
            ),
          })
        : t("production.main.queue.removeDescriptionSingle");
    const ok = await confirm({
      title: t("production.main.queue.removeWorkOrderTitle"),
      description,
      confirmLabel: t("production.main.common.remove"),
      cancelLabel: t("production.main.common.cancel"),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }
    setRemovingQueueId(id);
    await removeQueueRuns([id]);
    setRemovingQueueId(null);
  };

  const openQueueRemoveChoice = (
    runId: string,
    orderLabel: string,
    stationName: string,
  ) => {
    setQueueRemoveChoice({ runId, orderLabel, stationName });
  };

  const closeQueueRemoveChoice = () => {
    setQueueRemoveChoice(null);
  };

  const handleClearAllStationsForRun = async (
    runId: string,
    orderLabel?: string,
  ) => {
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    if (!run) {
      return;
    }
    const relatedRuns = batchRuns.filter(
      (candidate) =>
        candidate.order_id === run.order_id &&
        candidate.batch_code === run.batch_code,
    );
    const removableRuns = relatedRuns.filter(canRunBeRemoved);
    if (removableRuns.length === 0) {
      setDataError(t("production.main.errors.cannotClearStationsStarted"));
      return;
    }
    const fallbackLabel = run.orders?.order_number
      ? `${run.orders.order_number} / ${run.batch_code}`
      : run.batch_code;
    const label = orderLabel ?? fallbackLabel;
    const ok = await confirm({
      title: t("production.main.queue.clearAllStationsTitle"),
      description: t("production.main.queue.clearAllStationsDescription", {
        label,
        count: removableRuns.length,
      }),
      confirmLabel: t("production.main.queue.clearAllStations"),
      cancelLabel: t("production.main.common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    setRemovingQueueId(run.id);
    await removeQueueRuns(removableRuns.map((run) => run.id));
    setRemovingQueueId(null);
  };

  const handleMoveSelectedQueueDate = async () => {
    if (!supabase || selectedQueueRunIds.length === 0) {
      return;
    }
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }
    const runs = batchRuns.filter((run) =>
      selectedQueueRunIds.includes(run.id),
    );
    const movable = runs.filter(
      (run) =>
        run.status === "queued" ||
        run.status === "pending" ||
        run.status === "blocked",
    );
    if (movable.length === 0) {
      setDataError(t("production.main.errors.selectedItemsCannotMoveDate"));
      return;
    }
    const skipped = runs.length - movable.length;
    const ok = await confirm({
      title: t("production.main.queue.moveSelectedTitle"),
      description:
        skipped > 0
          ? t("production.main.queue.moveSelectedDescriptionWithSkip", {
              moveCount: movable.length,
              date: formatDateInput(queueActionDate),
              skipCount: skipped,
            })
          : t("production.main.queue.moveSelectedDescription", {
              moveCount: movable.length,
              date: formatDateInput(queueActionDate),
            }),
      confirmLabel: t("production.main.queue.moveDate"),
      cancelLabel: t("production.main.common.cancel"),
    });
    if (!ok) {
      return;
    }
    setIsQueueBulkApplying(true);
    const { error } = await supabase
      .from("batch_runs")
      .update({ planned_date: queueActionDate })
      .in(
        "id",
        movable.map((run) => run.id),
      );
    setIsQueueBulkApplying(false);
    if (error) {
      setDataError(t("production.main.errors.failedMoveSelectedQueueDate"));
      return;
    }
    setBatchRuns((prev) =>
      prev.map((run) =>
        movable.some((item) => item.id === run.id)
          ? { ...run, planned_date: queueActionDate }
          : run,
      ),
    );
  };

  const handleClearSelectedQueue = async () => {
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }
    const runs = batchRuns.filter((run) =>
      selectedQueueRunIds.includes(run.id),
    );
    const removable = runs.filter(canRunBeRemoved);
    if (removable.length === 0) {
      setDataError(t("production.main.errors.cannotClearSelectedStarted"));
      return;
    }
    const skipped = runs.length - removable.length;
    const ok = await confirm({
      title: t("production.main.queue.clearSelectedTitle"),
      description:
        skipped > 0
          ? t("production.main.queue.clearSelectedDescriptionWithSkip", {
              clearCount: removable.length,
              skipCount: skipped,
            })
          : t("production.main.queue.clearSelectedDescription", {
              clearCount: removable.length,
            }),
      confirmLabel: t("production.main.queue.clearSelected"),
      cancelLabel: t("production.main.common.cancel"),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    setIsQueueBulkApplying(true);
    await removeQueueRuns(removable.map((run) => run.id));
    setIsQueueBulkApplying(false);
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
    return filterReadyBatchGroups(readyBatchGroups, readyPriority, readySearch);
  }, [readyBatchGroups, readyPriority, readySearch]);

  const isReadyLoading = isLoading;
  const isQueuesLoading = isLoading;
  const isPlanningTab = activeProductionTab === "planning";
  const selectedBatchesCount = selectedBatchKeys.length;
  const releaseButtonLabel =
    selectedBatchesCount > 0
      ? `Release selected (${selectedBatchesCount})`
      : "Release selected";
  const showMobilePlanningActions =
    isPlanningTab && mobilePlanningView === "ready";
  const showMobileQueueActions =
    isPlanningTab && mobilePlanningView === "queues";
  const showBothPlanningPanels =
    planningIsDragging || mobilePlanningSlide !== "none";
  const planningPanelGap = 20;
  const effectiveSwipeWidth = planningSwipeWidth || 360;
  const readyBaseX =
    mobilePlanningView === "ready"
      ? 0
      : -(effectiveSwipeWidth + planningPanelGap);
  const queueBaseX =
    mobilePlanningView === "ready" ? effectiveSwipeWidth + planningPanelGap : 0;
  const readyX = readyBaseX + planningDragX;
  const queueX = queueBaseX + planningDragX;

  const switchMobilePlanningView = (next: "ready" | "queues") => {
    if (next === mobilePlanningView) {
      return;
    }
    if (mobileSlideTimeoutRef.current) {
      window.clearTimeout(mobileSlideTimeoutRef.current);
      mobileSlideTimeoutRef.current = null;
    }
    setMobilePlanningSlide(next === "queues" ? "left" : "right");
    setMobilePlanningView(next);
    mobileSlideTimeoutRef.current = window.setTimeout(() => {
      setMobilePlanningSlide("none");
      mobileSlideTimeoutRef.current = null;
    }, 220);
  };

  const handlePlanningSwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 768) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    planningSwipeStartXRef.current = touch.clientX;
    planningSwipeStartYRef.current = touch.clientY;
    planningSwipeLastXRef.current = touch.clientX;
    setPlanningIsDragging(true);
  };

  const handlePlanningSwipeMove = (event: TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 768 || !planningIsDragging) {
      return;
    }
    const startX = planningSwipeStartXRef.current;
    const startY = planningSwipeStartYRef.current;
    const touch = event.touches[0];
    if (!touch || startX === null || startY === null) {
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    if (deltaY > Math.abs(deltaX) * 1.2) {
      return;
    }
    planningSwipeLastXRef.current = touch.clientX;
    const clamped = Math.max(-140, Math.min(140, deltaX));
    setPlanningDragX(clamped);
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const handlePlanningSwipeEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 768) {
      return;
    }
    const startX = planningSwipeStartXRef.current;
    const startY = planningSwipeStartYRef.current;
    planningSwipeStartXRef.current = null;
    planningSwipeStartYRef.current = null;
    const touch = event.changedTouches[0];
    if (!touch || startX === null || startY === null) {
      setPlanningIsDragging(false);
      setPlanningDragX(0);
      return;
    }
    const deltaX = planningSwipeLastXRef.current - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    setPlanningIsDragging(false);
    if (deltaY > 64 || Math.abs(deltaX) < 56) {
      setPlanningDragX(0);
      return;
    }
    setPlanningDragX(0);
    if (deltaX < 0) {
      switchMobilePlanningView("queues");
    } else {
      switchMobilePlanningView("ready");
    }
  };

  useEffect(() => {
    if (!isMobileSectionsOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSectionsOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileSectionsOpen]);

  useEffect(() => {
    if (activeProductionTab === "planning") {
      setMobilePlanningView("ready");
    }
  }, [activeProductionTab]);

  useEffect(() => {
    return () => {
      if (mobileSlideTimeoutRef.current) {
        window.clearTimeout(mobileSlideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      const width = planningSwipeContainerRef.current?.clientWidth ?? 0;
      setPlanningSwipeWidth(width);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const handle = () => setIsMobileViewport(media.matches);
    handle();
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setShowCompactMobileTitle(false);
        return;
      }
      setShowCompactMobileTitle(window.scrollY > 110);
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return (
    <>
      <div
        className={`fixed right-4 z-40 transition-all duration-200 md:hidden ${
          showMobilePlanningActions || showMobileQueueActions
            ? "bottom-[calc(11.5rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(6.75rem+env(safe-area-inset-bottom))]"
        } ${
          hideMobileFloatingControls
            ? "translate-y-16 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg"
          onClick={() => setIsMobileSectionsOpen(true)}
          aria-label={t("production.main.mobile.openSections")}
          aria-haspopup="dialog"
          aria-expanded={isMobileSectionsOpen}
          aria-controls="production-sections-drawer"
        >
          <PanelRightIcon className="h-4 w-4" />
        </Button>
      </div>
      {showMobilePlanningActions ? (
        <div
          className={`fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 transition-all duration-200 md:hidden ${
            hideMobileFloatingControls
              ? "translate-y-16 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            {routes.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full px-3 text-xs"
                onClick={() => setIsMobilePlanningRouteOpen(true)}
              >
                {t("production.main.common.route")}
              </Button>
            ) : (
              <div className="h-11 rounded-full border border-border bg-muted/20 px-3 text-xs text-muted-foreground inline-flex items-center">
                {routes[0]?.label ?? t("production.main.common.defaultRoute")}
              </div>
            )}
            <Button
              type="button"
              className="h-11 rounded-full px-4 text-sm"
              onClick={handleOpenSplit}
              disabled={!canRelease}
            >
              {releaseButtonLabel}
            </Button>
          </div>
        </div>
      ) : null}
      {showMobileQueueActions ? (
        <div
          className={`fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 transition-all duration-200 md:hidden ${
            hideMobileFloatingControls
              ? "translate-y-16 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-4 text-sm"
              onClick={() => setIsMobileQueueFiltersOpen(true)}
            >
              <SlidersHorizontalIcon className="h-4 w-4" />
              {t("production.main.queue.filtersTitle")}
            </Button>
          </div>
        </div>
      ) : null}
      <>
        <BottomSheet
          id="production-sections-drawer"
          open={isMobileSectionsOpen}
          onClose={() => setIsMobileSectionsOpen(false)}
          ariaLabel={t("production.main.mobile.sectionsTitle")}
          closeButtonLabel={t("production.main.mobile.closeSections")}
          title={t("production.main.mobile.sectionsTitle")}
          enableSwipeToClose
        >
          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {[
                {
                  value: "planning",
                  label: t("production.main.tabs.planning"),
                  icon: ClipboardListIcon,
                },
                { value: "list", label: t("production.main.tabs.orders"), icon: ListIcon },
                {
                  value: "calendar",
                  label: t("production.main.tabs.calendar"),
                  icon: CalendarIcon,
                },
              ].map((section) => {
                const isActive = activeProductionTab === section.value;
                const SectionIcon = section.icon;
                return (
                  <button
                    key={section.value}
                    type="button"
                    onClick={() => {
                      setActiveProductionTab(
                        section.value as "planning" | "list" | "calendar",
                      );
                      setIsMobileSectionsOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {SectionIcon ? <SectionIcon className="h-4 w-4" /> : null}
                      {section.label}
                    </span>
                    {isActive ? (
                      <span className="text-xs">{t("production.main.common.active")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </BottomSheet>
        <BottomSheet
          open={isMobilePlanningRouteOpen}
          onClose={() => setIsMobilePlanningRouteOpen(false)}
          ariaLabel={t("production.main.mobile.routeOptions")}
          closeButtonLabel={t("production.main.mobile.closeRouteOptions")}
          title={t("production.main.common.route")}
          enableSwipeToClose
        >
          <div className="space-y-3 px-4 pt-3">
            {routes.length > 1 ? (
              <Select
                value={selectedRouteKey}
                onValueChange={(value) => {
                  setSelectedRouteKey(value);
                }}
              >
                <SelectTrigger className="h-10 w-full">
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
              <div className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground flex items-center">
                {routes[0]?.label ?? t("production.main.common.defaultRoute")}
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
                t("production.main.mobile.noRouteStations")
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setSelectedBatchKeys([])}
                disabled={selectedBatchKeys.length === 0}
              >
                {t("production.main.common.clear")}
              </Button>
              <Button onClick={() => setIsMobilePlanningRouteOpen(false)}>
                {t("production.main.common.done")}
              </Button>
            </div>
          </div>
        </BottomSheet>
        <BottomSheet
          open={isMobileQueueFiltersOpen}
          onClose={() => setIsMobileQueueFiltersOpen(false)}
          ariaLabel={t("production.main.queue.filtersTitle")}
          closeButtonLabel={t("production.main.queue.closeFilters")}
          title={t("production.main.queue.filtersTitle")}
          enableSwipeToClose
        >
          <div className="space-y-3 px-4 pt-3">
            <DatePicker
              label={t("production.main.queue.viewDate")}
              value={viewDate}
              onChange={setViewDate}
              className="space-y-1 text-xs text-muted-foreground"
            />
            <SelectField
              label={t("production.main.common.range")}
              labelClassName="text-xs text-muted-foreground"
              value={String(plannedRangeDays)}
              onValueChange={(value) => setPlannedRangeDays(Number(value))}
            >
              <Select
                value={String(plannedRangeDays)}
                onValueChange={(value) => setPlannedRangeDays(Number(value))}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("production.main.range.today")}</SelectItem>
                  <SelectItem value="3">{t("production.main.range.days3")}</SelectItem>
                  <SelectItem value="7">{t("production.main.range.days7")}</SelectItem>
                  <SelectItem value="14">{t("production.main.range.days14")}</SelectItem>
                </SelectContent>
              </Select>
            </SelectField>
            <div className="flex justify-end">
              <Button onClick={() => setIsMobileQueueFiltersOpen(false)}>
                {t("production.main.common.done")}
              </Button>
            </div>
          </div>
        </BottomSheet>
        <BottomSheet
          open={Boolean(queueRemoveChoice)}
          onClose={closeQueueRemoveChoice}
          ariaLabel={t("production.main.queue.removeOptions")}
          closeButtonLabel={t("production.main.queue.closeRemoveOptions")}
          title={t("production.main.queue.removeFromQueue")}
          enableSwipeToClose
        >
          <div className="space-y-3 px-4 pb-4 pt-3 md:hidden">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {queueRemoveChoice
                ? `${queueRemoveChoice.orderLabel} · ${queueRemoveChoice.stationName}`
                : ""}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                if (!queueRemoveChoice) return;
                const payload = queueRemoveChoice;
                closeQueueRemoveChoice();
                void handleRemoveFromQueue(
                  payload.runId,
                  payload.orderLabel,
                  payload.stationName,
                );
              }}
            >
              {t("production.main.queue.clearCurrentStation")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                if (!queueRemoveChoice) return;
                const payload = queueRemoveChoice;
                closeQueueRemoveChoice();
                void handleClearAllStationsForRun(
                  payload.runId,
                  payload.orderLabel,
                );
              }}
            >
              {t("production.main.queue.clearAllStations")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={closeQueueRemoveChoice}
            >
              {t("production.main.common.cancel")}
            </Button>
          </div>
        </BottomSheet>
        {queueRemoveChoice ? (
          <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 px-4 md:flex">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {t("production.main.queue.removeFromQueue")}
                </h3>
                <button
                  type="button"
                  className="text-sm text-muted-foreground"
                  onClick={closeQueueRemoveChoice}
                >
                  {t("production.main.common.close")}
                </button>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {`${queueRemoveChoice.orderLabel} · ${queueRemoveChoice.stationName}`}
              </div>
              <div className="mt-4 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const payload = queueRemoveChoice;
                    closeQueueRemoveChoice();
                    void handleRemoveFromQueue(
                      payload.runId,
                      payload.orderLabel,
                      payload.stationName,
                    );
                  }}
                >
                  {t("production.main.queue.clearCurrentStation")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const payload = queueRemoveChoice;
                    closeQueueRemoveChoice();
                    void handleClearAllStationsForRun(
                      payload.runId,
                      payload.orderLabel,
                    );
                  }}
                >
                  {t("production.main.queue.clearAllStations")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={closeQueueRemoveChoice}
                >
                  {t("production.main.common.cancel")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>

      <Tabs
        value={activeProductionTab}
        onValueChange={(value) =>
          setActiveProductionTab(value as "planning" | "list" | "calendar")
        }
        className="space-y-0 md:space-y-4 pt-16 md:pt-0"
      >
        <MobilePageTitle
          title={t("production.main.header.title")}
          showCompact={showCompactMobileTitle}
          subtitle={t("production.main.header.subtitle")}
          className="pt-6 pb-6"
        />
        <DesktopPageHeader
          sticky
          title={t("production.main.header.title")}
          subtitle={t("production.main.header.subtitle")}
          className="md:z-20"
          actions={
            <DetailTabsBar
              tabs={[
                {
                  value: "planning",
                  label: t("production.main.tabs.planning"),
                  icon: ClipboardListIcon,
                },
                {
                  value: "list",
                  label: t("production.main.tabs.orders"),
                  icon: ListIcon,
                },
                {
                  value: "calendar",
                  label: t("production.main.tabs.calendar"),
                  icon: CalendarIcon,
                },
              ]}
              className="hidden py-0 md:flex"
            />
          }
        />

        <TabsContent value="planning" className="space-y-6">
          <div className="sticky top-[calc(env(safe-area-inset-top)+3.15rem)] z-30 -mx-4 flex justify-center px-4 py-2 md:hidden">
            <div className="inline-flex rounded-full border border-border bg-muted/40 p-1 shadow-sm">
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  mobilePlanningView === "ready"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
                onClick={() => switchMobilePlanningView("ready")}
              >
                {t("production.main.planning.ready")}
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {filteredReadyGroups.length}
                </span>
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  mobilePlanningView === "queues"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
                onClick={() => switchMobilePlanningView("queues")}
              >
                {t("production.main.planning.queues")}
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {queueItemsCount}
                </span>
              </button>
            </div>
          </div>

          <div
            ref={planningSwipeContainerRef}
            className="overflow-hidden md:overflow-visible"
            onTouchStart={handlePlanningSwipeStart}
            onTouchMove={handlePlanningSwipeMove}
            onTouchEnd={handlePlanningSwipeEnd}
            onTouchCancel={handlePlanningSwipeEnd}
          >
            <div className="relative md:grid md:w-auto md:gap-6 lg:grid-cols-[380px_1fr]">
              <Card
                className={`h-fit transition-transform duration-200 ease-out md:block ${
                  mobilePlanningView === "ready"
                    ? "relative block"
                    : showBothPlanningPanels
                      ? "absolute inset-x-0 top-0 z-10 block"
                      : "hidden"
                }`}
                style={
                  isMobileViewport
                    ? {
                        transform: `translateX(${readyX}px)`,
                        transitionDuration: planningIsDragging
                          ? "0ms"
                          : undefined,
                      }
                    : undefined
                }
              >
                <CardHeader>
                  <CardTitle>{t("production.main.planning.readyForProduction")}</CardTitle>
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
                      {t("production.main.planning.loadingReadyBatches")}
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                        {t("production.main.common.search")}
                        <Input
                          icon="search"
                          value={readySearch}
                          onChange={(event) =>
                            setReadySearch(event.target.value)
                          }
                          placeholder={t("production.main.planning.orderCustomerPlaceholder")}
                          className="h-9 text-sm text-foreground"
                        />
                      </label>
                      <SelectField
                        label={t("production.main.common.priority")}
                        labelClassName="text-xs text-muted-foreground"
                        value={readyPriority}
                        onValueChange={(value) =>
                          setReadyPriority(value as Priority | "all")
                        }
                      >
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
                            <SelectItem value="all">
                              {t("production.main.common.all")}
                            </SelectItem>
                            <SelectItem value="urgent">
                              {t("production.main.priority.urgent")}
                            </SelectItem>
                            <SelectItem value="high">
                              {t("production.main.priority.high")}
                            </SelectItem>
                            <SelectItem value="normal">
                              {t("production.main.priority.normal")}
                            </SelectItem>
                            <SelectItem value="low">
                              {t("production.main.priority.low")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </SelectField>
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
                          <Checkbox
                            variant="box"
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
                                {group.orderNumber}
                              </span>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/orders/${group.orderId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex"
                                  aria-label={t("production.main.common.openOrder")}
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
                                  aria-label={t(
                                    "production.main.files.viewProductionFiles",
                                  )}
                                  disabled={productionFiles.length === 0}
                                >
                                  <PaperclipIcon className="h-4 w-4" />
                                </Button>
                                <Badge variant={priorityBadge(group.priority)}>
                                  {priorityLabel(group.priority)}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {group.customerName}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t("production.main.queue.pieces", {
                                count: group.totalQty,
                              })}{" "}
                              -{" "}
                              {t("production.main.queue.dueDate", {
                                date: group.dueDate,
                              })}
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
                                  {t("production.main.common.constructions")}
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
                                            {detail.unit
                                              ? ` ${detail.unit}`
                                              : ""}
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
                        {t("production.main.planning.noBatchesReady")}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {t("production.main.planning.releaseToProduction")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("production.main.planning.unitOfWork")}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedBatchKeys.length > 0
                          ? t("production.main.queue.selectedCount", {
                              count: selectedBatchKeys.length,
                            })
                          : t("production.main.queue.noSelection")}
                      </div>
                    </div>
                    {routes.length > 1 ? (
                      <SelectField
                        label={t("production.main.common.route")}
                        labelClassName="text-xs text-muted-foreground"
                        value={selectedRouteKey}
                        onValueChange={setSelectedRouteKey}
                        className="hidden space-y-1 md:block"
                      >
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
                            t("production.main.mobile.noRouteStations")
                          )}
                        </div>
                      </SelectField>
                    ) : null}
                    <div className="hidden items-center justify-between gap-2 md:flex">
                      <Button onClick={handleOpenSplit} disabled={!canRelease}>
                        {releaseButtonLabel}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedBatchKeys([])}
                        disabled={selectedBatchKeys.length === 0}
                      >
                        {t("production.main.common.clear")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div
                className={`space-y-4 transition-transform duration-200 ease-out md:block ${
                  mobilePlanningView === "queues"
                    ? "relative z-20 block"
                    : showBothPlanningPanels
                      ? "absolute inset-x-0 top-0 z-10 block"
                      : "hidden"
                }`}
                style={
                  isMobileViewport
                    ? {
                        transform: `translateX(${queueX}px)`,
                        transitionDuration: planningIsDragging
                          ? "0ms"
                          : undefined,
                      }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
                  <span>{t("production.main.queue.stationQueues")}</span>
                  <div className="hidden flex-wrap items-center gap-2 text-sm font-normal text-muted-foreground md:flex">
                    <DatePicker
                      label={t("production.main.queue.viewDate")}
                      value={viewDate}
                      onChange={setViewDate}
                      className="flex items-center gap-2 whitespace-nowrap text-sm"
                    />
                    <SelectField
                      label={t("production.main.common.range")}
                      labelClassName="text-sm font-normal text-muted-foreground"
                      value={String(plannedRangeDays)}
                      onValueChange={(value) =>
                        setPlannedRangeDays(Number(value))
                      }
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      <Select
                        value={String(plannedRangeDays)}
                        onValueChange={(value) =>
                          setPlannedRangeDays(Number(value))
                        }
                      >
                        <SelectTrigger className="h-9 w-30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{t("production.main.range.today")}</SelectItem>
                          <SelectItem value="3">{t("production.main.range.days3")}</SelectItem>
                          <SelectItem value="7">{t("production.main.range.days7")}</SelectItem>
                          <SelectItem value="14">{t("production.main.range.days14")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </SelectField>
                  </div>
                  <div className="text-xs font-normal text-muted-foreground md:hidden">
                    {t("production.main.queue.rangeSummary", {
                      date: formatDateInput(viewDate),
                      days: plannedRangeDays,
                    })}
                  </div>
                </div>
                <div className="hidden items-end justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2 md:flex">
                  <div className="flex items-end gap-3">
                    <DatePicker
                      label={t("production.main.queue.moveDate")}
                      value={queueActionDate}
                      onChange={(value) =>
                        setQueueActionDate(value || queueActionDate)
                      }
                      className="w-42 text-xs"
                    />
                    <span className="mb-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                      {selectedQueueRunIds.length > 0
                        ? t("production.main.queue.selectedCount", {
                            count: selectedQueueRunIds.length,
                          })
                        : t("production.main.queue.noSelection")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedQueueRunIds(
                          allVisibleQueueSelected ? [] : visibleQueueRunIds,
                        )
                      }
                    >
                      {allVisibleQueueSelected
                        ? t("production.main.queue.unselectAllVisible")
                        : t("production.main.queue.selectAllVisible")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        selectedQueueRunIds.length === 0 || isQueueBulkApplying
                      }
                      onClick={() => void handleMoveSelectedQueueDate()}
                    >
                      {t("production.main.queue.moveSelected")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        selectedQueueRunIds.length === 0 || isQueueBulkApplying
                      }
                      onClick={() => void handleClearSelectedQueue()}
                    >
                      {t("production.main.queue.clearSelected")}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-muted/10 px-3 py-2 md:hidden">
                  <div className="text-xs text-muted-foreground">
                    {selectedQueueRunIds.length > 0
                      ? t("production.main.queue.selectedCount", {
                          count: selectedQueueRunIds.length,
                        })
                      : t("production.main.queue.noSelection")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        setSelectedQueueRunIds(
                          allVisibleQueueSelected ? [] : visibleQueueRunIds,
                        )
                      }
                    >
                      {allVisibleQueueSelected
                        ? t("production.main.common.clear")
                        : t("production.main.queue.selectAll")}
                    </Button>
                    <DatePicker
                      value={queueActionDate}
                      onChange={(value) =>
                        setQueueActionDate(value || queueActionDate)
                      }
                      className="text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={
                        selectedQueueRunIds.length === 0 || isQueueBulkApplying
                      }
                      onClick={() => void handleMoveSelectedQueueDate()}
                    >
                      {t("production.main.queue.moveSelected")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={
                        selectedQueueRunIds.length === 0 || isQueueBulkApplying
                      }
                      onClick={() => void handleClearSelectedQueue()}
                    >
                      {t("production.main.queue.clearSelected")}
                    </Button>
                  </div>
                </div>
                {isQueuesLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    {t("production.main.queue.loadingStationQueues")}
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
                                aria-label={t("production.main.queue.openInOperator", {
                                  station: station.name,
                                })}
                              >
                                <ExternalLinkIcon className="h-4 w-4" />
                              </Link>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div>
                                {t("production.main.queue.itemsCount", {
                                  count: queue.length,
                                })}
                              </div>
                              {stationTotalMinutes > 0 ? (
                                <div>{formatDuration(stationTotalMinutes)}</div>
                              ) : null}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {queue.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                              {t("production.main.queue.noWorkQueued")}
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
                                  const canRemove =
                                    !item.items.some(
                                      (row) =>
                                        row.started_at ||
                                        row.status === "in_progress" ||
                                        row.status === "done",
                                    ) && canManageQueue;
                                  return (
                                    <button
                                      type="button"
                                      aria-label={t("production.main.queue.removeFromQueue")}
                                      className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-border bg-foreground text-[16px] text-background shadow-sm transition ${
                                        canRemove && removeHintId === item.id
                                          ? "flex"
                                          : canRemove
                                            ? "hidden group-hover:flex"
                                            : "hidden"
                                      }`}
                                      onClick={() =>
                                        canRemove
                                          ? openQueueRemoveChoice(
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
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <Checkbox
                                    variant="box"
                                    checked={selectedQueueRunIds.includes(
                                      item.id,
                                    )}
                                    onChange={(event) => {
                                      const isChecked =
                                        event.currentTarget.checked;
                                      setSelectedQueueRunIds((prev) => {
                                        if (isChecked) {
                                          if (prev.includes(item.id))
                                            return prev;
                                          return [...prev, item.id];
                                        }
                                        return prev.filter(
                                          (id) => id !== item.id,
                                        );
                                      });
                                    }}
                                  />
                                  <div className="flex items-center gap-1">
                                    {item.plannedDate ? (
                                      <Badge variant="status-draft">
                                        {formatDateInput(item.plannedDate)}
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
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
                                        productionAttachments[item.orderId] ??
                                        [];
                                      return (
                                        <div className="flex items-center gap-2">
                                          <Link
                                            href={`/orders/${item.orderId}`}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                            aria-label={t("production.main.common.openOrder")}
                                          >
                                            <ExternalLinkIcon className="h-4 w-4" />
                                          </Link>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => {
                                              if (
                                                productionFiles.length === 0
                                              ) {
                                                return;
                                              }
                                              setFilesPreview({
                                                orderId: item.orderId,
                                                orderNumber: item.orderNumber,
                                                files: productionFiles,
                                              });
                                            }}
                                            aria-label={t("production.main.files.viewProductionFiles")}
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
                                    return (
                                      <div className="flex flex-col items-end gap-2">
                                        <Badge
                                          variant={priorityBadge(item.priority)}
                                        >
                                          {priorityLabel(item.priority)}
                                        </Badge>
                                        <Badge
                                          variant={statusBadge(item.status)}
                                        >
                                          {statusLabel(item.status ?? "queued")}
                                        </Badge>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {(() => {
                                  const metaParts: string[] = [];
                                  if (item.totalQty > 0) {
                                    metaParts.push(
                                      t("production.main.queue.pieces", {
                                        count: item.totalQty,
                                      }),
                                    );
                                  }
                                  if (item.dueDate) {
                                    metaParts.push(
                                      t("production.main.queue.dueDate", {
                                        date: item.dueDate,
                                      }),
                                    );
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
                                        workingCalendar,
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
                                          {t("production.main.queue.stationTime")}{" "}
                                          {formatDuration(
                                            stationDurationMinutes,
                                          )}
                                        </div>
                                      ) : null}
                                      {elapsedLabel ? (
                                        <div className="mt-1 text-[11px] text-muted-foreground">
                                          {t("production.main.queue.time", {
                                            value: elapsedLabel,
                                          })}
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
                                        ? t("production.main.queue.hideConstructions")
                                        : t("production.main.queue.showConstructions")}
                                    </Button>
                                  ) : null}
                                </div>
                                {expandedQueueItems.has(item.id) &&
                                  item.items.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/10 px-2 py-1.5">
                                        <span className="text-[11px] text-muted-foreground">
                                          {(queueConstructionSelections[item.id] ?? [])
                                            .length}{" "}
                                          {t("production.main.common.selected")}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-[11px]"
                                          disabled={
                                            !canManageQueue ||
                                            (queueConstructionSelections[item.id] ??
                                              []).length === 0
                                          }
                                          onClick={() =>
                                            handleOpenQueueReplan(item)
                                          }
                                        >
                                          {t("production.main.split.replanSelectedRows")}
                                        </Button>
                                      </div>
                                      {item.items.map((row) => {
                                        const rowKey =
                                          rowKeyForProductionItem(row);
                                        const stationStatuses =
                                          stationStatusMap.get(rowKey);
                                        const entry = stationStatuses?.get(
                                          station.id,
                                        );
                                        const isLockedForReplan =
                                          replanLockedRowMap.get(
                                            `${item.orderId}:${item.batchCode}:${rowKey}`,
                                          ) ?? false;
                                        const isSelected =
                                          queueConstructionSelections[
                                            item.id
                                          ]?.includes(rowKey) ?? false;
                                        return (
                                          <div
                                            key={row.id}
                                            className="rounded-md border border-border bg-muted/20 px-2 py-2"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex items-start gap-2">
                                                <Checkbox
                                                  variant="box"
                                                  checked={isSelected}
                                                  disabled={
                                                    isLockedForReplan ||
                                                    !canManageQueue
                                                  }
                                                  onChange={(event) => {
                                                    const checked =
                                                      event.currentTarget
                                                        .checked;
                                                    setQueueConstructionSelections(
                                                      (prev) => {
                                                        const current = new Set(
                                                          prev[item.id] ?? [],
                                                        );
                                                        if (checked) {
                                                          current.add(rowKey);
                                                        } else {
                                                          current.delete(
                                                            rowKey,
                                                          );
                                                        }
                                                        return {
                                                          ...prev,
                                                          [item.id]:
                                                            Array.from(current),
                                                        };
                                                      },
                                                    );
                                                  }}
                                                />
                                                <div className="text-[11px] text-muted-foreground">
                                                  {row.item_name}
                                                  {isLockedForReplan ? (
                                                    <div className="text-[10px] text-amber-700">
                                                      {t(
                                                        "production.main.split.startedDoneCannotReplan",
                                                      )}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </div>
                                              {entry?.status ? (
                                                <div className="relative flex items-center justify-center gap-2">
                                                  <Badge
                                                    variant={statusBadge(
                                                      row.status,
                                                    )}
                                                  >
                                                    {statusLabel(
                                                      row.status ?? "queued",
                                                    )}
                                                  </Badge>
                                                  {entry.status === "blocked" &&
                                                  entry.blockedReason ? (
                                                    <Tooltip
                                                      content={
                                                        entry.blockedReason
                                                      }
                                                      interaction="hover"
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
                                              {t("production.main.queue.qty", {
                                                qty: row.qty,
                                              })}
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
          </div>

          {isSplitOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-3xl rounded-2xl bg-card p-6 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {splitMode === "replan"
                        ? t("production.main.split.replanConstructions")
                        : t("production.main.split.splitByStations")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {splitMode === "replan"
                        ? t("production.main.split.replanDescription")
                        : t("production.main.split.splitDescription")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setIsSplitOpen(false);
                      setSplitPlannedDates({});
                      setSplitGlobalPlannedDate("");
                      setSplitMode("release");
                    }}
                    aria-label={t("production.main.split.close")}
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
                    {t("production.main.split.selectAllStations")}
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
                    {t("production.main.split.clearAll")}
                  </Button>
                  <div className="w-full max-w-56">
                    <DatePicker
                      label={t("production.main.split.commonPlannedDate")}
                      labelClassName="text-[11px] text-muted-foreground"
                      value={splitGlobalPlannedDate || plannedDate}
                      onChange={(value) => {
                        const nextDate = value || plannedDate;
                        setSplitGlobalPlannedDate(nextDate);
                        setSplitPlannedDates((prev) => {
                          const next: Record<string, string> = { ...prev };
                          splitRows.forEach((row) => {
                            next[row.id] = nextDate;
                          });
                          return next;
                        });
                      }}
                      min={todayIso}
                      className="space-y-1"
                      triggerClassName="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto">
                  {splitRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {t("production.main.split.noRowsFound")}
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
                              <div className="mt-2 max-w-56">
                                <DatePicker
                                  label={t("production.main.split.plannedDate")}
                                  labelClassName="text-[11px] text-muted-foreground"
                                  value={
                                    splitPlannedDates[row.id] ?? plannedDate
                                  }
                                  onChange={(value) =>
                                    setSplitPlannedDates((prev) => ({
                                      ...prev,
                                      [row.id]: value || plannedDate,
                                    }))
                                  }
                                  min={todayIso}
                                  className="space-y-1"
                                  triggerClassName="h-8 text-xs"
                                />
                              </div>
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
                                      <Checkbox
                                        variant="box"
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
                    onClick={() => {
                      setIsSplitOpen(false);
                      setSplitPlannedDates({});
                      setSplitGlobalPlannedDate("");
                      setSplitMode("release");
                    }}
                  >
                    {t("production.main.common.cancel")}
                  </Button>
                  <Button
                    onClick={handleConfirmSplit}
                    disabled={isCreatingWorkOrders}
                  >
                    {isCreatingWorkOrders && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    )}
                    {splitMode === "replan"
                      ? t("production.main.split.replanSelectedRows")
                      : t("production.main.split.createWorkOrders")}
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
              <CardTitle>{t("production.main.list.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  {t("production.main.list.loadingOrders")}
                </div>
              ) : null}
              <div className="space-y-3">
                <label className="block w-full space-y-1 text-xs text-muted-foreground">
                  {t("production.main.common.search")}
                  <Input
                    icon="search"
                    value={qrSearch}
                    onChange={(event) => setQrSearch(event.target.value)}
                    placeholder={t("production.main.list.searchPlaceholder")}
                    className="h-9 text-sm text-foreground"
                  />
                </label>
                <div className="grid gap-3 md:flex md:flex-wrap md:items-end md:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <FiltersDropdown contentClassName="w-[min(360px,calc(100vw-2rem))] p-4">
                      <div className="space-y-4">
                        <DatePicker
                          label={t("production.main.common.date")}
                          value={qrFilterDate}
                          onChange={setQrFilterDate}
                          className="space-y-1 text-xs text-muted-foreground"
                          triggerClassName="h-9"
                        />
                        <div className="h-px bg-border/70" />
                        <FilterOptionSelector
                          title={t("production.main.common.status")}
                          value={qrFilterStatus}
                          onChange={setQrFilterStatus}
                          chipsClassName="gap-3"
                          options={[
                            {
                              value: "all",
                              label: t("production.main.common.all"),
                              count: qrStatusCounts.all,
                            },
                            {
                              value: "queued",
                              label: t("production.main.status.queued"),
                              count: qrStatusCounts.queued,
                            },
                            {
                              value: "pending",
                              label: t("production.main.status.pending"),
                              count: qrStatusCounts.pending,
                            },
                            {
                              value: "in_progress",
                              label: t("production.main.status.in_progress"),
                              count: qrStatusCounts.in_progress,
                            },
                            {
                              value: "blocked",
                              label: t("production.main.status.blocked"),
                              count: qrStatusCounts.blocked,
                            },
                            {
                              value: "done",
                              label: t("production.main.status.done"),
                              count: qrStatusCounts.done,
                            },
                          ]}
                        />
                        <div className="h-px bg-border/70" />
                        <FilterOptionSelector
                          title={t("production.main.common.station")}
                          mode="chips"
                          selectPlaceholder={t("production.main.list.allStations")}
                          value={qrFilterStation}
                          onChange={setQrFilterStation}
                          chipsClassName="gap-3"
                          options={[
                            {
                              value: "all",
                              label: t("production.main.list.allStations"),
                            },
                            ...stations.map((station) => ({
                              value: station.id,
                              label: station.name,
                            })),
                          ]}
                        />
                        <div className="h-px bg-border/70" />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            variant="outline"
                            onClick={() =>
                              setQrFilterDate(
                                new Date().toISOString().slice(0, 10),
                              )
                            }
                          >
                            {t("production.main.range.today")}
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
                            {t("production.main.common.clearFilters")}
                          </Button>
                        </div>
                      </div>
                    </FiltersDropdown>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                    <Button
                      variant="outline"
                      onClick={() => setQrSelectedRowIds([])}
                      disabled={qrSelectedRowIds.length === 0}
                    >
                      {t("production.main.common.clearSelection")}
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
                      {t("production.main.qr.print")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Checkbox
                  variant="box"
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
                  label={t("production.main.common.selectAll")}
                />
                <span>
                  {qrSelectedRowIds.length > 0
                    ? t("production.main.queue.selectedCount", {
                        count: qrSelectedRowIds.length,
                      })
                    : t("production.main.list.rowsCount", {
                        count: filteredQrRows.length,
                      })}
                </span>
              </div>

              {orderConstructionRows.length > 0 &&
              selectableConstructionRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  {t("production.main.list.noSelectableRows")}
                </div>
              ) : null}

              {filteredQrRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("production.main.list.noRowsForFilters")}
                </div>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
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
                        timeStats?.totalMinutes ?? runStats?.totalMinutes ?? 0;
                      const hasTimeData =
                        Boolean(timeStats) || Boolean(runStats);
                      return (
                        <div
                          key={row.id}
                          className={`rounded-lg border px-3 py-3 ${
                            isChecked
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-start gap-3">
                              <Checkbox
                                variant="box"
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
                              <div className="min-w-0">
                                <div className="font-semibold">
                                  {row.orderNumber} / {row.batchCode}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {row.customerName}
                                </div>
                              </div>
                            </label>
                            <Badge variant={priorityBadge(row.priority)}>
                              {priorityLabel(row.priority)}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-muted-foreground">
                                {t("production.main.common.construction")}
                              </div>
                              <div className="font-medium text-foreground">
                                {row.itemName}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">
                                {t("production.main.common.qty")}
                              </div>
                              <div className="font-medium text-foreground">
                                {row.qty}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">
                                {t("production.main.common.due")}
                              </div>
                              <div className="font-medium text-foreground">
                                {row.dueDate
                                  ? formatDateInput(row.dueDate)
                                  : "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">
                                {t("production.main.common.started")}
                              </div>
                              <div className="font-medium text-foreground">
                                {startedDate || "-"}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-muted-foreground">
                                {t("production.main.common.totalTime")}
                              </div>
                              <div className="font-medium text-foreground">
                                {hasTimeData
                                  ? formatDuration(totalMinutes)
                                  : "-"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {stations.map((station) => {
                              const entry = stationStatuses?.get(station.id);
                              const stationMinutes =
                                timeStats?.stationMinutes.get(station.id) ??
                                runStats?.stationMinutes.get(station.id) ??
                                0;
                              return (
                                <div
                                  key={station.id}
                                  className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1.5 text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {station.name}
                                  </span>
                                  {entry?.status ? (
                                    <div className="flex items-center gap-2">
                                      <div className="relative flex items-center justify-center gap-2">
                                        <Badge
                                          variant={statusBadge(
                                            entry.status as BatchRunRow["status"],
                                          )}
                                        >
                                          {statusLabel(
                                            entry.status as BatchRunRow["status"],
                                          )}
                                        </Badge>
                                        {entry.status === "blocked" &&
                                        entry.blockedReason ? (
                                          <Tooltip
                                            content={entry.blockedReason}
                                            interaction="hover"
                                          >
                                            <Info className="absolute bottom-0 right-0 bg-background rounded-full inline-flex h-3.5 w-3.5 text-amber-700" />
                                          </Tooltip>
                                        ) : null}
                                      </div>
                                      <span className="text-muted-foreground">
                                        {formatDuration(stationMinutes)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      -
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2"></th>
                          <th className="px-3 py-2">
                            {t("production.main.common.order")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.customer")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.construction")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.due")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.started")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.qty")}
                          </th>
                          <th className="px-3 py-2">
                            {t("production.main.common.batch")}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {t("production.main.common.totalTime")}
                          </th>
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
                                <Checkbox
                                  variant="box"
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
                                {row.dueDate
                                  ? formatDateInput(row.dueDate)
                                  : "-"}
                              </td>
                              <td className="px-3 py-2">
                                {startedDate || "-"}
                              </td>
                              <td className="px-3 py-2">{row.qty}</td>
                              <td className="px-3 py-2">{row.batchCode}</td>
                              <td className="px-3 py-2 text-right">
                                {hasTimeData
                                  ? formatDuration(totalMinutes)
                                  : "-"}
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
                                              interaction="hover"
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
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>{t("production.main.calendar.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <DatePicker
                  label={t("production.main.calendar.startDate")}
                  value={viewDate}
                  onChange={setViewDate}
                  className="flex items-center gap-2"
                />
                <SelectField
                  label={t("production.main.common.range")}
                  labelClassName="text-xs font-medium text-muted-foreground"
                  value={String(plannedRangeDays)}
                  onValueChange={(value) => setPlannedRangeDays(Number(value))}
                  className="flex items-center gap-2"
                >
                  <Select
                    value={String(plannedRangeDays)}
                    onValueChange={(value) =>
                      setPlannedRangeDays(Number(value))
                    }
                  >
                    <SelectTrigger className="h-9 w-30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t("production.main.range.days1")}</SelectItem>
                      <SelectItem value="3">{t("production.main.range.days3")}</SelectItem>
                      <SelectItem value="7">{t("production.main.range.days7")}</SelectItem>
                      <SelectItem value="14">{t("production.main.range.days14")}</SelectItem>
                    </SelectContent>
                  </Select>
                </SelectField>
              </div>

              {calendarDates.length === 0 || stations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("production.main.calendar.noData")}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">
                          {t("production.main.calendar.station")}
                        </th>
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
                                      {t("production.main.calendar.runsCount", {
                                        count: cell.count,
                                      })}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {t("production.main.calendar.ordersCount", {
                                        count: cell.orders.size,
                                      })}
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
                <h2 className="text-lg font-semibold">
                  {t("production.main.files.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("production.main.files.order", {
                    orderNumber: filesPreview.orderNumber,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFilesPreview(null)}
                aria-label={t("production.main.files.close")}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {filesPreview.files.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("production.main.files.empty")}
                </p>
              ) : (
                filesPreview.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {file.name ?? t("production.main.files.fileFallback")}
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
                        {t("production.main.common.open")}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("production.main.files.noUrl")}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setFilesPreview(null)}>
                {t("production.main.common.close")}
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
                position: static !important;
                width: auto !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                margin: 0 !important;
                border: 0 !important;
                background: transparent !important;
                transform: none !important;
              }
              .qr-print-page {
                break-inside: avoid;
                page-break-inside: avoid;
                break-after: page;
                page-break-after: always;
                margin: 0 !important;
                box-shadow: none !important;
              }
              .qr-print-page:last-child {
                break-after: auto;
                page-break-after: auto;
              }
              .qr-preview-scale {
                transform: none !important;
              }
            }
          `}</style>
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-lg font-semibold">
                  {t("production.main.qr.printTitle")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("production.main.qr.labelsReady", {
                    count: qrRows.length,
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={qrState !== "ready" || qrRows.length === 0}
                >
                  {t("production.main.qr.print")}
                </Button>
                <Button variant="outline" onClick={handleCloseQrModal}>
                  {t("production.main.common.close")}
                </Button>
              </div>
            </div>
            <div className="grid h-[calc(90vh-72px)] gap-6 overflow-hidden px-6 py-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-4 overflow-y-auto pr-2">
                <SelectField
                  label={t("production.main.qr.labelSize")}
                  value={qrSize}
                  onValueChange={setQrSize}
                >
                  <Select value={qrSize} onValueChange={setQrSize}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {qrEnabledSizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {t(`settings.options.qrSize.${size}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SelectField>
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("production.main.qr.contentFields")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("production.main.qr.contentFieldsHint")}
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {qrFieldOrder.map((value) => {
                      const key = `settings.options.qrContentField.${value}`;
                      const translated = t(key);
                      const label =
                        translated === key
                          ? (qrFieldLabels[value] ?? value)
                          : translated;
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
                          <Checkbox
                            variant="box"
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
                  <SelectField
                    label={t("production.main.qr.orientation")}
                    value={qrOrientation}
                    onValueChange={(value) =>
                      setQrOrientation(value as "portrait" | "landscape")
                    }
                  >
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
                        <SelectItem value="portrait">
                          {t("production.main.qr.vertical")}
                        </SelectItem>
                        <SelectItem value="landscape">
                          {t("production.main.qr.horizontal")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <RangeField
                    label={t("production.main.qr.previewZoom")}
                    min={0.5}
                    max={1.5}
                    step={0.1}
                    value={qrPreviewScale}
                    onChange={(event) =>
                      setQrPreviewScale(Number(event.target.value))
                    }
                    description={`${Math.round(qrPreviewScale * 100)}%`}
                  />
                </div>
                {qrState === "loading" ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    {t("production.main.qr.generating")}
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
                    {t("production.main.qr.noLabelsToPreview")}
                  </div>
                ) : (
                  <div
                    className="qr-preview-scale space-y-4"
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
                            const value = getProductionQrFieldValue(
                              entry.row,
                              fieldKey,
                              formatDateInput,
                            );
                            if (!value) {
                              return null;
                            }
                            return (
                              <div key={fieldKey} className="flex gap-2">
                                <span className="min-w-18 text-muted-foreground">
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
