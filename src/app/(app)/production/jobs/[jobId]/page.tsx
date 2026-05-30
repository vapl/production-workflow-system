"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  ExternalLinkIcon,
  Layers3Icon,
  PaperclipIcon,
  QrCodeIcon,
  Settings2Icon,
  TimerResetIcon,
  GripVerticalIcon,
  MessageSquareTextIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { SelectField } from "@/components/ui/SelectField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { ProductionRoutingSettingsModal } from "@/components/production/ProductionRoutingSettingsModal";
import { ProductionStationCatalogModal } from "@/components/production/ProductionStationCatalogModal";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import { cn } from "@/components/ui/utils";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkingCalendar } from "@/contexts/WorkingCalendarContext";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  formatProductionDate,
  formatProductionDuration,
  groupAttachmentsById,
  groupDocumentsByOrderItem,
  priorityTone,
  sortBatchRuns,
  type ProductionJobItemDocument,
  type ProductionJobOrderItem,
} from "@/lib/domain/productionJobDetail";
import type { ProductionSplitRow } from "@/lib/domain/buildProductionSplitRows";
import { prepareProductionQrRows } from "@/lib/domain/prepareProductionQrRows";
import { isProductionAttachment } from "@/lib/domain/productionAttachments";
import {
  buildWorkedBreakdownByItem,
  buildWorkedBreakdownByRun,
  getQueueGroupWorkedBreakdown,
} from "@/lib/domain/productionDurations";
import {
  getProductionItemCompletedQty,
  getProductionItemQuantity,
} from "@/lib/domain/productionUnitProgress";
import { transitionBatchRunStatus } from "@/lib/domain/transitionBatchRunStatus";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import type {
  BatchRunRow,
  OrderAttachmentRow,
  ProductionItemRow,
  ProductionStatusEventRow,
  ReadyOrderRow,
  StationTrackingMode,
} from "@/types/production";

type WorkstationRow = {
  id: string;
  tenantId?: string | null;
  name: string;
  description?: string | null;
  trackingMode?: StationTrackingMode;
  sortOrder?: number | null;
};

type StationDependencyRow = {
  id: string;
  stationId: string;
  dependsOnStationId: string;
};

type OrderCommentRow = {
  id: string;
  message: string;
  author_name?: string | null;
  author_role?: string | null;
  created_at: string;
};

function parseMoneyValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "object") {
    const record = value as {
      amount?: number | string | null;
      value?: number | string | null;
    };
    const nested = record.amount ?? record.value ?? null;
    return parseMoneyValue(nested);
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizeJoinedOrder(value: unknown): BatchRunRow["orders"] {
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
    production_due_date:
      typeof row.production_due_date === "string"
        ? row.production_due_date
        : null,
    priority,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : null,
    status: typeof row.status === "string" ? row.status : null,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return formatProductionDate(value);
  }
  return new Intl.DateTimeFormat("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildDefaultBatchCode(itemIndex: number) {
  return `B${itemIndex + 1}`;
}

export default function ProductionJobDetailPage() {
  const { t } = useI18n();
  const { workdays, shifts, overtimeEnabled } = useWorkingCalendar();
  const currentUser = useCurrentUser();
  const params = useParams<{ jobId?: string }>();
  const jobId = params?.jobId ?? "";

  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [order, setOrder] = useState<ReadyOrderRow | null>(null);
  const [orderItems, setOrderItems] = useState<ProductionJobOrderItem[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachmentRow[]>([]);
  const [itemDocuments, setItemDocuments] = useState<
    ProductionJobItemDocument[]
  >([]);
  const [activityEvents, setActivityEvents] = useState<
    ProductionStatusEventRow[]
  >([]);
  const [comments, setComments] = useState<OrderCommentRow[]>([]);
  const [qrFieldId, setQrFieldId] = useState<string | null>(null);
  const [invoicePrice, setInvoicePrice] = useState<number | null>(null);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<
    Record<string, string>
  >({});
  const [workstations, setWorkstations] = useState<WorkstationRow[]>([]);
  const [stationDependencies, setStationDependencies] = useState<
    StationDependencyRow[]
  >([]);
  const [isSavingOverview, setIsSavingOverview] = useState(false);
  const [isPrintingQr, setIsPrintingQr] = useState(false);
  const [isReleasingToQueues, setIsReleasingToQueues] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [routingSettingsItemId, setRoutingSettingsItemId] = useState<
    string | null
  >(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isSavingRoutingSettings, setIsSavingRoutingSettings] = useState(false);
  const [isStationCatalogOpen, setIsStationCatalogOpen] = useState(false);
  const [isSavingStationCatalog, setIsSavingStationCatalog] = useState(false);
  const [draggingRunId, setDraggingRunId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [savingInlineReorderItemId, setSavingInlineReorderItemId] = useState<
    string | null
  >(null);
  const [reopeningRunId, setReopeningRunId] = useState<string | null>(null);
  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";
  const canReopenCompletedProduction =
    currentUser.isOwner ||
    currentUser.isAdmin ||
    currentUser.role === "Production planner";

  const reloadExecutionState = async () => {
    if (!supabase || !jobId) {
      return false;
    }
    const [productionItemsResult, batchRunsResult] = await Promise.all([
      supabase
        .from("production_items")
        .select(
          "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
        )
        .eq("order_id", jobId)
        .order("created_at", { ascending: false }),
      supabase
        .from("batch_runs")
        .select(
          "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
        )
        .eq("order_id", jobId)
        .order("step_index", { ascending: true })
        .order("planned_date", { ascending: true }),
    ]);
    if (productionItemsResult.error || batchRunsResult.error) {
      setDataError(
        productionItemsResult.error?.message ??
          batchRunsResult.error?.message ??
          t("production.main.jobs.failedReopenCompleted"),
      );
      return false;
    }
    setProductionItems(
      (productionItemsResult.data ?? []).map((row) => ({
        ...(row as Omit<ProductionItemRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      })),
    );
    setBatchRuns(
      (batchRunsResult.data ?? []).map((row) => ({
        ...(row as Omit<BatchRunRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      })),
    );
    return true;
  };

  useEffect(() => {
    if (!supabase || !jobId) {
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setDataError("");
      const sb = supabase;
      if (!sb) {
        setIsLoading(false);
        return;
      }

      const [
        orderResult,
        orderItemsResult,
        productionItemsResult,
        batchRunsResult,
        attachmentsResult,
        commentsResult,
        activityResult,
        workstationsResult,
        stationDependenciesResult,
      ] = await Promise.all([
        sb
          .from("orders")
          .select(
            "id, order_number, customer_name, due_date, production_due_date, priority, status, quantity, product_name, production_duration_minutes",
          )
          .eq("id", jobId)
          .maybeSingle(),
        sb
          .from("order_items")
          .select(
            "id, order_id, position, item_name, item_type, qty, material, dimensions, sku, uom, revision, lifecycle_status, supply_type, item_group, route_code, quality_class, production_notes, attributes",
          )
          .eq("order_id", jobId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        sb
          .from("production_items")
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("order_id", jobId)
          .order("created_at", { ascending: false }),
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("order_id", jobId)
          .order("step_index", { ascending: true })
          .order("planned_date", { ascending: true }),
        sb
          .from("order_attachments")
          .select(
            "id, order_id, name, url, category, created_at, size, mime_type",
          )
          .eq("order_id", jobId)
          .order("created_at", { ascending: false }),
        sb
          .from("order_comments")
          .select("id, message, author_name, author_role, created_at")
          .eq("order_id", jobId)
          .order("created_at", { ascending: false }),
        sb
          .from("production_status_events")
          .select(
            "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at, actor_user_id",
          )
          .eq("order_id", jobId)
          .order("created_at", { ascending: false }),
        sb
          .from("workstations")
          .select("id, tenant_id, name, description, tracking_mode, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        sb
          .from("station_dependencies")
          .select("id, station_id, depends_on_station_id"),
      ]);

      if (!isMounted) {
        return;
      }

      if (
        orderResult.error ||
        orderItemsResult.error ||
        productionItemsResult.error ||
        batchRunsResult.error ||
        attachmentsResult.error ||
        commentsResult.error ||
        activityResult.error ||
        workstationsResult.error ||
        stationDependenciesResult.error
      ) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      const orderItemRows = (orderItemsResult.data ??
        []) as ProductionJobOrderItem[];
      const orderItemIds = orderItemRows.map((item) => item.id);

      const [bomResult, docsResult] = await Promise.all([
        orderItemIds.length > 0
          ? sb
              .from("order_item_bom_lines")
              .select(
                "id, order_item_id, component_code, component_name, component_type, qty, unit, length, width, height, source_kind",
              )
              .in("order_item_id", orderItemIds)
              .order("sort_order", { ascending: true })
          : Promise.resolve({
              data: [],
              error: null,
            }),
        orderItemIds.length > 0
          ? sb
              .from("order_item_documents")
              .select("order_item_id, order_attachment_id, role, sort_order")
              .in("order_item_id", orderItemIds)
              .order("sort_order", { ascending: true })
          : Promise.resolve({
              data: [] as ProductionJobItemDocument[],
              error: null,
            }),
      ]);

      const [qrFieldResult, externalJobsResult, externalJobFieldsResult] =
        await Promise.all([
          sb
            .from("order_input_fields")
            .select("id")
            .eq("is_active", true)
            .eq("field_type", "table")
            .order("show_in_production", { ascending: false })
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle(),
          sb.from("external_jobs").select("id").eq("order_id", jobId),
          sb
            .from("external_job_fields")
            .select("id, field_role")
            .eq("is_active", true)
            .in("field_role", ["invoice_price", "planned_price"]),
        ]);

      if (!isMounted) {
        return;
      }

      if (
        bomResult.error ||
        docsResult.error ||
        qrFieldResult.error ||
        externalJobsResult.error ||
        externalJobFieldsResult.error
      ) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      const externalJobIds = (externalJobsResult.data ?? []).map((row) =>
        String((row as { id: string }).id),
      );
      const priceFields = (externalJobFieldsResult.data ?? []) as Array<{
        id: string;
        field_role: "invoice_price" | "planned_price" | "none";
      }>;
      const invoicePriceField = priceFields.find(
        (field) => field.field_role === "invoice_price",
      );
      const plannedPriceField = priceFields.find(
        (field) => field.field_role === "planned_price",
      );

      const externalValuesResult =
        externalJobIds.length > 0 &&
        (invoicePriceField?.id || plannedPriceField?.id)
          ? await sb
              .from("external_job_field_values")
              .select("external_job_id, field_id, value")
              .in("external_job_id", externalJobIds)
              .in(
                "field_id",
                [invoicePriceField?.id, plannedPriceField?.id].filter(
                  Boolean,
                ) as string[],
              )
          : { data: [], error: null };

      if (!isMounted) {
        return;
      }

      if (externalValuesResult.error) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      const valuesByJobId = new Map<
        string,
        { invoice: number | null; planned: number | null }
      >();
      (
        (externalValuesResult.data ?? []) as Array<{
          external_job_id: string;
          field_id: string;
          value: unknown;
        }>
      ).forEach((entry) => {
        const current = valuesByJobId.get(entry.external_job_id) ?? {
          invoice: null,
          planned: null,
        };
        if (invoicePriceField?.id === entry.field_id) {
          current.invoice = parseMoneyValue(entry.value);
        }
        if (plannedPriceField?.id === entry.field_id) {
          current.planned = parseMoneyValue(entry.value);
        }
        valuesByJobId.set(entry.external_job_id, current);
      });

      const invoiceTotal = externalJobIds.reduce((sum, externalJobId) => {
        const current = valuesByJobId.get(externalJobId);
        return sum + (current?.invoice ?? current?.planned ?? 0);
      }, 0);

      const parsedWorkstations = (
        (workstationsResult.data ?? []) as Array<Record<string, unknown>>
      ).map((station) => ({
        id: String(station.id),
        tenantId:
          typeof station.tenant_id === "string" ? station.tenant_id : null,
        name: String(station.name ?? ""),
        description:
          typeof station.description === "string" ? station.description : null,
        sortOrder:
          typeof station.sort_order === "number" ? station.sort_order : null,
        trackingMode:
          station.tracking_mode === "order_level" ||
          station.tracking_mode === "receipt_only"
            ? (station.tracking_mode as StationTrackingMode)
            : "construction_level",
      }));

      let normalizedBatchRuns = (batchRunsResult.data ?? []).map((row) => ({
        ...(row as Omit<BatchRunRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      }));

      const hasReleasedRuns = normalizedBatchRuns.some(
        (run) => run.status !== "pending",
      );
      const routeKeysWithRuns = new Set(
        normalizedBatchRuns
          .map((run) => run.route_key?.trim())
          .filter((value): value is string =>
            Boolean(value && value !== "default"),
          ),
      );
      const missingRouteItems =
        !hasReleasedRuns && parsedWorkstations.length > 0
          ? orderItemRows.filter((item) => !routeKeysWithRuns.has(item.id))
          : [];

      if (missingRouteItems.length > 0) {
        const defaultRuns = missingRouteItems.flatMap((item) => {
          const itemIndex = Math.max(
            0,
            orderItemRows.findIndex((entry) => entry.id === item.id),
          );
          return parsedWorkstations.map((station, index) => ({
            order_id: jobId,
            batch_code: buildDefaultBatchCode(itemIndex),
            station_id: station.id,
            route_key: item.id,
            step_index: station.sortOrder ?? index,
            status: "pending" as const,
            planned_date: null,
          }));
        });

        const { error: insertDefaultRunsError } = await sb
          .from("batch_runs")
          .insert(defaultRuns);

        if (insertDefaultRunsError) {
          setDataError(insertDefaultRunsError.message);
          setIsLoading(false);
          return;
        }

        const refreshedBatchRunsResult = await sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("order_id", jobId)
          .order("step_index", { ascending: true })
          .order("planned_date", { ascending: true });

        if (refreshedBatchRunsResult.error) {
          setDataError(refreshedBatchRunsResult.error.message);
          setIsLoading(false);
          return;
        }

        normalizedBatchRuns = (refreshedBatchRunsResult.data ?? []).map(
          (row) => ({
            ...(row as Omit<BatchRunRow, "orders">),
            orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
          }),
        );
      }

      setOrder((orderResult.data ?? null) as ReadyOrderRow | null);
      setOrderItems(orderItemRows);
      setProductionItems(
        (productionItemsResult.data ?? []).map((row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setBatchRuns(normalizedBatchRuns);
      setAttachments((attachmentsResult.data ?? []) as OrderAttachmentRow[]);
      setComments((commentsResult.data ?? []) as OrderCommentRow[]);
      setQrFieldId(
        qrFieldResult.data && typeof qrFieldResult.data.id === "string"
          ? qrFieldResult.data.id
          : null,
      );
      setInvoicePrice(invoiceTotal > 0 ? invoiceTotal : null);
      setActivityEvents(
        (activityResult.data ?? []) as ProductionStatusEventRow[],
      );
      setWorkstations(parsedWorkstations);
      setStationDependencies(
        (
          (stationDependenciesResult.data ?? []) as Array<
            Record<string, unknown>
          >
        ).map((row) => ({
          id: String(row.id),
          stationId: String(row.station_id),
          dependsOnStationId: String(row.depends_on_station_id),
        })),
      );
      setItemDocuments((docsResult.data ?? []) as ProductionJobItemDocument[]);
      setIsLoading(false);
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [jobId, t]);

  const docsByOrderItem = useMemo(
    () => groupDocumentsByOrderItem(itemDocuments),
    [itemDocuments],
  );
  const hasLinkedFiles = useMemo(
    () =>
      orderItems.some(
        (item) => (docsByOrderItem.get(item.id) ?? []).length > 0,
      ),
    [docsByOrderItem, orderItems],
  );
  const linkedAttachmentIds = useMemo(
    () => new Set(itemDocuments.map((doc) => doc.order_attachment_id)),
    [itemDocuments],
  );
  const unlinkedAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment) =>
          !linkedAttachmentIds.has(attachment.id) &&
          isProductionAttachment(attachment),
      ),
    [attachments, linkedAttachmentIds],
  );
  const attachmentById = useMemo(
    () => groupAttachmentsById(attachments),
    [attachments],
  );
  const resolveAttachmentUrl = (attachment: OrderAttachmentRow) => {
    if (!attachment.url) {
      return undefined;
    }
    if (!supabase) {
      return attachment.url;
    }
    if (storagePublicPrefix && attachment.url.startsWith(storagePublicPrefix)) {
      return signedAttachmentUrls[attachment.id];
    }
    if (attachment.url.startsWith("http")) {
      return attachment.url;
    }
    return signedAttachmentUrls[attachment.id];
  };
  const stationNameById = useMemo(
    () => new Map(workstations.map((station) => [station.id, station.name])),
    [workstations],
  );
  const sortedRuns = useMemo(() => sortBatchRuns(batchRuns), [batchRuns]);
  const productionItemsBySourceRowId = useMemo(() => {
    const map = new Map<string, ProductionItemRow[]>();
    productionItems.forEach((item) => {
      const sourceRowId =
        item.meta &&
        typeof item.meta === "object" &&
        typeof (item.meta as Record<string, unknown>).sourceRowId === "string"
          ? String((item.meta as Record<string, unknown>).sourceRowId)
          : "";
      if (!sourceRowId) {
        return;
      }
      const current = map.get(sourceRowId) ?? [];
      current.push(item);
      map.set(sourceRowId, current);
    });
    return map;
  }, [productionItems]);
  const title = order?.order_number ?? t("production.main.jobs.titleFallback");
  const lastUpdatedAt = useMemo(() => {
    const candidates = [
      ...attachments.map((item) => item.created_at ?? ""),
      ...activityEvents.map((item) => item.created_at ?? ""),
      ...productionItems.map(
        (item) => item.created_at ?? item.done_at ?? item.started_at ?? "",
      ),
      ...batchRuns.map(
        (item) => item.done_at ?? item.started_at ?? item.planned_date ?? "",
      ),
    ].filter(Boolean);
    return candidates.sort().reverse()[0] ?? null;
  }, [activityEvents, attachments, batchRuns, productionItems]);

  const uniqueOrderItems = useMemo(() => {
    const seen = new Set<string>();
    return orderItems.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }, [orderItems]);
  const routeUnitOptions = useMemo(
    () =>
      uniqueOrderItems.map((item) => ({
        id: item.id,
        label: item.item_name,
      })),
    [uniqueOrderItems],
  );
  const routingSettingsRuns = useMemo(() => {
    if (!routingSettingsItemId) {
      return [] as BatchRunRow[];
    }
    const linkedItems =
      productionItemsBySourceRowId.get(routingSettingsItemId) ?? [];
    const batchCodes = Array.from(
      new Set(linkedItems.map((row) => row.batch_code)),
    );
    return sortedRuns.filter(
      (run) =>
        run.route_key === routingSettingsItemId ||
        batchCodes.includes(run.batch_code),
    );
  }, [productionItemsBySourceRowId, routingSettingsItemId, sortedRuns]);
  const runsByOrderItemId = useMemo(() => {
    const map = new Map<string, BatchRunRow[]>();
    uniqueOrderItems.forEach((item) => {
      const linkedItems = productionItemsBySourceRowId.get(item.id) ?? [];
      const batchCodes = Array.from(
        new Set(linkedItems.map((row) => row.batch_code)),
      );
      map.set(
        item.id,
        sortedRuns.filter(
          (run) =>
            run.route_key === item.id || batchCodes.includes(run.batch_code),
        ),
      );
    });
    return map;
  }, [productionItemsBySourceRowId, sortedRuns, uniqueOrderItems]);
  const kpis = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const workingCalendar = { workdays, shifts, overtimeEnabled };
    const totalUnits = uniqueOrderItems.length;
    const workedBreakdownByItem = buildWorkedBreakdownByItem(
      activityEvents,
      workingCalendar,
    );
    const workedBreakdownByRun = buildWorkedBreakdownByRun(
      activityEvents,
      workingCalendar,
    );
    const operatorTouchedUnitIds = new Set<string>();
    activityEvents.forEach((event) => {
      const productionItemId = event.production_item_id;
      if (!productionItemId) {
        return;
      }
      const matchedItem = productionItems.find(
        (item) => item.id === productionItemId,
      );
      const sourceRowId =
        matchedItem?.meta &&
        typeof matchedItem.meta === "object" &&
        typeof (matchedItem.meta as Record<string, unknown>).sourceRowId ===
          "string"
          ? String((matchedItem.meta as Record<string, unknown>).sourceRowId)
          : null;
      if (
        sourceRowId &&
        (event.to_status === "in_progress" ||
          event.to_status === "paused" ||
          event.to_status === "done")
      ) {
        operatorTouchedUnitIds.add(sourceRowId);
      }
    });
    const completedUnits = uniqueOrderItems.filter((item) => {
      const relatedRuns = runsByOrderItemId.get(item.id) ?? [];
      return (
        relatedRuns.length > 0 &&
        relatedRuns.every((run) => run.status === "done")
      );
    }).length;
    const trackingModeByStationId = new Map(
      workstations.map((station) => [
        station.id,
        station.trackingMode ?? "construction_level",
      ]),
    );
    const groupedRunDurations = new Map<
      string,
      {
        trackingMode: StationTrackingMode;
        stationId: string;
        routeKey: string;
        runs: BatchRunRow[];
      }
    >();
    sortedRuns.forEach((run) => {
      if (!run.station_id) {
        return;
      }
      const trackingMode =
        trackingModeByStationId.get(run.station_id) ?? "construction_level";
      const routeKey =
        run.route_key && run.route_key !== "default"
          ? run.route_key
          : run.batch_code || run.id;
      const key =
        trackingMode === "construction_level"
          ? `${run.station_id}:${routeKey}`
          : `${run.station_id}:${run.order_id}`;
      const existing = groupedRunDurations.get(key);
      if (existing) {
        existing.runs.push(run);
        return;
      }
      groupedRunDurations.set(key, {
        trackingMode,
        stationId: run.station_id,
        routeKey,
        runs: [run],
      });
    });
    const workedBreakdown = Array.from(groupedRunDurations.values()).reduce(
      (sum, group) => {
        const batchCodes = new Set(group.runs.map((run) => run.batch_code));
        const itemsForGroup = productionItems.filter((item) => {
          if (item.station_id !== group.stationId) {
            return false;
          }
          if (group.trackingMode !== "construction_level") {
            return true;
          }
          const sourceRowId =
            item.meta &&
            typeof item.meta === "object" &&
            typeof (item.meta as Record<string, unknown>).sourceRowId ===
              "string"
              ? String((item.meta as Record<string, unknown>).sourceRowId)
              : null;
          if (sourceRowId && group.routeKey && group.routeKey !== "default") {
            return sourceRowId === group.routeKey;
          }
          return batchCodes.has(item.batch_code);
        });
        const groupBreakdown = getQueueGroupWorkedBreakdown({
          trackingMode: group.trackingMode,
          runs: group.runs,
          items: itemsForGroup,
          workedBreakdownByItem,
          workedBreakdownByRun,
        });

        return {
          totalMinutes: sum.totalMinutes + groupBreakdown.totalMinutes,
          regularMinutes: sum.regularMinutes + groupBreakdown.regularMinutes,
          overtimeMinutes: sum.overtimeMinutes + groupBreakdown.overtimeMinutes,
        };
      },
      { totalMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 },
    );
    const startedUnitsCount = uniqueOrderItems.filter((item) => {
      if (operatorTouchedUnitIds.has(item.id)) {
        return true;
      }
      const relatedItems = productionItemsBySourceRowId.get(item.id) ?? [];
      return relatedItems.some(
        (relatedItem) =>
          relatedItem.started_at ||
          relatedItem.done_at ||
          relatedItem.status === "in_progress" ||
          relatedItem.status === "paused" ||
          relatedItem.status === "done",
      );
    }).length;
    const progressBase = totalUnits > 0 ? totalUnits : 0;
    const progressPercent =
      progressBase > 0
        ? Math.min(
            100,
            Math.max(
              startedUnitsCount > 0
                ? Math.round((startedUnitsCount / progressBase) * 100)
                : 0,
              completedUnits > 0
                ? Math.round((completedUnits / progressBase) * 100)
                : 0,
            ),
          )
        : 0;
    const routeStatusCounts: Record<
      "pending" | "queued" | "in_progress" | "paused" | "blocked" | "done",
      number
    > = {
      pending: 0,
      queued: 0,
      in_progress: 0,
      paused: 0,
      blocked: 0,
      done: 0,
    };
    sortedRuns.forEach((run) => {
      routeStatusCounts[run.status] += 1;
    });
    const totalRunCount = sortedRuns.length;
    const completedRunCount = routeStatusCounts.done;
    const weightedProgress =
      routeStatusCounts.done +
      (routeStatusCounts.in_progress +
        routeStatusCounts.paused +
        routeStatusCounts.blocked) *
        0.6;
    const routeProgressPercent =
      totalRunCount > 0
        ? Math.round((weightedProgress / totalRunCount) * 100)
        : 0;

    return {
      totalMinutes: workedBreakdown.totalMinutes,
      regularMinutes: workedBreakdown.regularMinutes,
      overtimeMinutes: workedBreakdown.overtimeMinutes,
      progressPercent: Math.max(progressPercent, routeProgressPercent),
      routeStatusCounts,
      totalRunCount,
      completedRunCount,
      dueTodayOrLate: Boolean(
        (order?.production_due_date ?? order?.due_date) &&
        (order?.production_due_date ?? order?.due_date ?? "") <= todayIso,
      ),
    };
  }, [
    activityEvents,
    order,
    productionItems,
    productionItemsBySourceRowId,
    overtimeEnabled,
    shifts,
    workstations,
    workdays,
    sortedRuns,
    runsByOrderItemId,
    uniqueOrderItems,
  ]);

  useEffect(() => {
    if (!supabase || attachments.length === 0) {
      return;
    }
    const sb = supabase;

    const pending = attachments.filter(
      (attachment) =>
        attachment.url &&
        !attachment.url.startsWith("http") &&
        !signedAttachmentUrls[attachment.id],
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

      setSignedAttachmentUrls((prev) => {
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
  }, [attachments, signedAttachmentUrls, storagePublicPrefix]);

  const releaseReadiness = useMemo(() => {
    const unitsWithoutRoutes = uniqueOrderItems.filter((item) => {
      const relatedRuns = runsByOrderItemId.get(item.id) ?? [];
      return relatedRuns.length === 0;
    });
    const unitsWithMissingStations = uniqueOrderItems.filter((item) => {
      const relatedRuns = runsByOrderItemId.get(item.id) ?? [];
      return (
        relatedRuns.length > 0 && relatedRuns.some((run) => !run.station_id)
      );
    });
    const hasQueuedRows = sortedRuns.some(
      (run) =>
        run.status === "queued" ||
        run.status === "in_progress" ||
        run.status === "paused" ||
        run.status === "blocked" ||
        run.status === "done",
    );
    return {
      canRelease:
        uniqueOrderItems.length > 0 &&
        unitsWithoutRoutes.length === 0 &&
        unitsWithMissingStations.length === 0,
      hasQueuedRows,
      unitsWithoutRoutes,
      unitsWithMissingStations,
    };
  }, [runsByOrderItemId, sortedRuns, uniqueOrderItems]);
  const isReleasedToQueues = releaseReadiness.hasQueuedRows;
  useEffect(() => {
    if (
      expandedItemId &&
      !uniqueOrderItems.some((item) => item.id === expandedItemId)
    ) {
      setExpandedItemId(null);
    }
  }, [expandedItemId, uniqueOrderItems]);

  const handlePriorityChange = async (value: string) => {
    if (!supabase || !order) {
      return;
    }
    const nextPriority =
      value === "low" ||
      value === "normal" ||
      value === "high" ||
      value === "urgent"
        ? value
        : "normal";

    setIsSavingOverview(true);
    setDataError("");
    const { error } = await supabase
      .from("orders")
      .update({ priority: nextPriority })
      .eq("id", jobId);

    if (error) {
      setDataError(t("production.main.jobs.failedUpdateOverview"));
      setIsSavingOverview(false);
      return;
    }

    setOrder((prev) => (prev ? { ...prev, priority: nextPriority } : prev));
    setIsSavingOverview(false);
  };

  const handleDueDateChange = async (value: string | null) => {
    if (!supabase || !order || !value) {
      return;
    }

    setIsSavingOverview(true);
    setDataError("");
    const { error } = await supabase
      .from("orders")
      .update({ production_due_date: value })
      .eq("id", jobId);

    if (error) {
      setDataError(t("production.main.jobs.failedUpdateOverview"));
      setIsSavingOverview(false);
      return;
    }

    setOrder((prev) => (prev ? { ...prev, production_due_date: value } : prev));
    setIsSavingOverview(false);
  };

  const handleReopenCompletedRun = async (
    sourceOrderItemId: string,
    run: BatchRunRow,
  ) => {
    if (
      !supabase ||
      !canReopenCompletedProduction ||
      !currentUser.id ||
      run.status !== "done"
    ) {
      return;
    }

    setReopeningRunId(run.id);
    setDataError("");
    setActionNotice("");

    try {
      const stationTrackingMode =
        workstations.find((station) => station.id === run.station_id)
          ?.trackingMode ?? "construction_level";
      const relatedItems = (
        productionItemsBySourceRowId.get(sourceOrderItemId) ?? []
      ).filter(
        (item) =>
          item.batch_code === run.batch_code &&
          (!run.station_id || item.station_id === run.station_id),
      );

      if (
        stationTrackingMode === "construction_level" &&
        relatedItems.length > 0
      ) {
        for (const item of relatedItems) {
          const quantity = getProductionItemQuantity(item);
          const currentCompletedQty = getProductionItemCompletedQty(item);
          const nextCompletedQty = Math.max(currentCompletedQty - 1, 0);
          const nextMeta = {
            ...((item.meta as Record<string, unknown> | null) ?? {}),
            completedQty: nextCompletedQty,
            reopenedAt: new Date().toISOString(),
            reopenedBy: currentUser.id,
          };

          const { error: updateItemError } = await supabase
            .from("production_items")
            .update({ meta: nextMeta })
            .eq("id", item.id);
          if (updateItemError) {
            throw new Error(updateItemError.message);
          }

          const { error: transitionError } = await transitionBatchRunStatus(
            supabase,
            {
              batchRunId: run.id,
              toStatus:
                nextCompletedQty > 0 && quantity > 1 ? "paused" : "queued",
              productionItemId: item.id,
              actorUserId: currentUser.id,
              reason: t("production.main.jobs.reopenReason"),
            },
          );
          if (transitionError) {
            throw new Error(transitionError.message);
          }
        }
      } else {
        const { error: transitionError } = await transitionBatchRunStatus(
          supabase,
          {
            batchRunId: run.id,
            toStatus: "queued",
            actorUserId: currentUser.id,
            reason: t("production.main.jobs.reopenReason"),
          },
        );
        if (transitionError) {
          throw new Error(transitionError.message);
        }
      }

      const reloaded = await reloadExecutionState();
      if (!reloaded) {
        return;
      }
      setActionNotice(t("production.main.jobs.reopenedForCorrection"));
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.jobs.failedReopenCompleted"),
      );
    } finally {
      setReopeningRunId(null);
    }
  };

  const handlePrintQr = async () => {
    if (!supabase || !order || uniqueOrderItems.length === 0 || !qrFieldId) {
      return;
    }

    setIsPrintingQr(true);
    setDataError("");

    try {
      const rows: ProductionSplitRow[] = uniqueOrderItems.map(
        (item, index) => ({
          id: `${jobId}:order_item:${item.id}`,
          orderId: jobId,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          dueDate: order.production_due_date ?? order.due_date,
          batchCode:
            (productionItemsBySourceRowId.get(item.id) ?? [])[0]?.batch_code ??
            `B${index + 1}`,
          priority: order.priority,
          fieldId: qrFieldId,
          fieldLabel: t("production.main.jobs.fallbackOrderItemLabel"),
          itemName: item.item_name,
          qty: Number(item.qty ?? 1),
          material: item.material ?? order.product_name ?? "",
          sourceRowId: item.id,
          rowIndex: index,
          rawRow: {
            order_item_id: item.id,
            production_notes: item.production_notes ?? null,
          },
        }),
      );

      const { withTokens, imageMap } = await prepareProductionQrRows({
        client: supabase,
        rows,
        isAuthenticated: true,
        baseUrl: window.location.origin,
      });

      if (withTokens.length === 0) {
        setDataError(t("production.main.qr.noLabelsToPreview"));
        return;
      }

      const labelsHtml = withTokens
        .map(({ row, token }) => {
          const image = imageMap[token];
          return `
            <article class="label">
              <div class="meta">
                <div class="title">${row.itemName}</div>
                <div class="sub">${order.order_number} - ${order.customer_name}</div>
                <div class="sub">${t("production.main.qr.batchLabel")}: ${row.batchCode} - ${t("production.main.qr.qtyLabel")}: ${row.qty}</div>
              </div>
              <div class="qr-wrap">
                <img src="${image}" alt="QR ${token}" />
                <div class="token">${token}</div>
              </div>
            </article>
          `;
        })
        .join("");

      const printHtml = `
        <!doctype html>
        <html lang="lv">
          <head>
            <meta charset="utf-8" />
            <title>${t("production.main.qr.printTitle")}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
              h1 { font-size: 20px; margin: 0 0 16px; }
              .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
              .label { border: 1px solid #d4d4d8; border-radius: 14px; padding: 16px; display: flex; justify-content: space-between; gap: 16px; break-inside: avoid; }
              .meta { min-width: 0; }
              .title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
              .sub { font-size: 13px; color: #52525b; margin-bottom: 4px; }
              .qr-wrap { width: 160px; text-align: center; flex-shrink: 0; }
              .qr-wrap img { width: 160px; height: 160px; object-fit: contain; }
              .token { font-size: 11px; color: #71717a; margin-top: 8px; word-break: break-all; }
              @media print {
                body { margin: 12mm; }
                .grid { gap: 12px; }
                .label { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <h1>${t("production.main.qr.printTitle")}</h1>
            <div class="grid">${labelsHtml}</div>
            <script>
              window.onload = function () {
                setTimeout(function () {
                  window.print();
                }, 250);
              };
            </script>
          </body>
        </html>
      `;

      const printBlob = new Blob([`\uFEFF${printHtml}`], {
        type: "text/html;charset=utf-8",
      });
      const printUrl = URL.createObjectURL(printBlob);
      const printWindow = window.open(
        printUrl,
        "_blank",
        "width=1100,height=900",
      );
      if (!printWindow) {
        URL.revokeObjectURL(printUrl);
        setDataError(t("production.main.errors.loadFailed"));
        return;
      }
      printWindow.addEventListener(
        "beforeunload",
        () => URL.revokeObjectURL(printUrl),
        { once: true },
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.errors.failedPrepareQrCodes"),
      );
    } finally {
      setIsPrintingQr(false);
    }
  };

  const handleReleaseToQueues = async () => {
    if (!supabase || !order) {
      return;
    }
    if (isReleasedToQueues) {
      return;
    }

    if (!releaseReadiness.canRelease) {
      if (releaseReadiness.unitsWithoutRoutes.length > 0) {
        setDataError(t("production.main.jobs.releaseMissingRoutes"));
      } else if (releaseReadiness.unitsWithMissingStations.length > 0) {
        setDataError(t("production.main.jobs.releaseMissingStations"));
      }
      return;
    }

    setIsReleasingToQueues(true);
    setDataError("");
    setActionNotice("");

    try {
      const usedCodes = new Set<string>();
      batchRuns.forEach((run) => usedCodes.add(run.batch_code));
      productionItems.forEach((item) => usedCodes.add(item.batch_code || "B1"));
      const nextBatchCode = () => {
        let max = 0;
        usedCodes.forEach((code) => {
          const match = /^B(\d+)$/i.exec(code.trim());
          if (match?.[1]) {
            max = Math.max(max, Number(match[1]));
          }
        });
        const generated = `B${Math.max(1, max + 1)}`;
        usedCodes.add(generated);
        return generated;
      };

      for (const item of uniqueOrderItems) {
        const relatedItems = productionItemsBySourceRowId.get(item.id) ?? [];
        const targetBatchCode = relatedItems[0]?.batch_code ?? nextBatchCode();
        const relatedRuns = (runsByOrderItemId.get(item.id) ?? []).sort(
          (a, b) => a.step_index - b.step_index,
        );
        const existingItems = [...relatedItems].sort((a, b) =>
          String(a.station_id ?? "").localeCompare(String(b.station_id ?? "")),
        );

        for (const [index, run] of relatedRuns.entries()) {
          const nextRunStatus =
            run.status === "in_progress" ||
            run.status === "paused" ||
            run.status === "blocked" ||
            run.status === "done"
              ? run.status
              : "queued";

          const { error: runError } = await supabase
            .from("batch_runs")
            .update({
              batch_code: targetBatchCode,
              station_id: run.station_id,
              planned_date: run.planned_date ?? null,
              step_index: index,
            })
            .eq("id", run.id);
          if (runError) {
            throw new Error(runError.message);
          }

          if (run.status !== nextRunStatus) {
            const { error: transitionError } = await transitionBatchRunStatus(
              supabase,
              {
                batchRunId: run.id,
                toStatus: nextRunStatus,
              },
            );
            if (transitionError) {
              throw new Error(transitionError.message);
            }
          }

          const existingItem = existingItems[index];
          const itemPayload = {
            order_id: jobId,
            batch_code: targetBatchCode,
            item_name: item.item_name,
            qty: Number(item.qty ?? 1),
            material: item.material ?? null,
            meta: {
              fieldId: "order_item",
              fieldLabel: t("production.main.jobs.fallbackOrderItemLabel"),
              rowIndex: index,
              sourceRowId: item.id,
              rowKey: item.id,
              plannedDate: run.planned_date ?? null,
              row: {
                order_item_id: item.id,
                production_notes: item.production_notes ?? null,
              },
            },
          };

          if (existingItem) {
            const { error: updateItemError } = await supabase
              .from("production_items")
              .update(itemPayload)
              .eq("id", existingItem.id);
            if (updateItemError) {
              throw new Error(updateItemError.message);
            }
          } else {
            const { error: insertItemError } = await supabase
              .from("production_items")
              .insert(itemPayload);
            if (insertItemError) {
              throw new Error(insertItemError.message);
            }
          }
        }

        if (existingItems.length > relatedRuns.length) {
          const extraItems = existingItems.slice(relatedRuns.length);
          const { error: deleteExtraItemsError } = await supabase
            .from("production_items")
            .delete()
            .in(
              "id",
              extraItems.map((extraItem) => extraItem.id),
            );
          if (deleteExtraItemsError) {
            throw new Error(deleteExtraItemsError.message);
          }
        }
      }

      const [refreshedProductionItemsResult, refreshedRunsResult] =
        await Promise.all([
          supabase
            .from("production_items")
            .select(
              "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
            )
            .eq("order_id", jobId)
            .order("created_at", { ascending: false }),
          supabase
            .from("batch_runs")
            .select(
              "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
            )
            .eq("order_id", jobId)
            .order("step_index", { ascending: true })
            .order("planned_date", { ascending: true }),
        ]);

      if (refreshedProductionItemsResult.error) {
        throw new Error(refreshedProductionItemsResult.error.message);
      }
      if (refreshedRunsResult.error) {
        throw new Error(refreshedRunsResult.error.message);
      }

      setProductionItems(
        (refreshedProductionItemsResult.data ?? []).map((row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setBatchRuns(
        (refreshedRunsResult.data ?? []).map((row) => ({
          ...(row as Omit<BatchRunRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setActionNotice(t("production.main.jobs.releasedToQueues"));
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.jobs.failedReleaseToQueues"),
      );
    } finally {
      setIsReleasingToQueues(false);
    }
  };

  const handleInlineReorderRuns = async (
    itemId: string,
    sourceRunId: string,
    insertIndex: number,
  ) => {
    if (!supabase) {
      return;
    }

    const relatedRuns = runsByOrderItemId.get(itemId) ?? [];
    const sourceIndex = relatedRuns.findIndex((run) => run.id === sourceRunId);
    if (sourceIndex < 0) {
      return;
    }

    const reorderedRuns = [...relatedRuns];
    const [movedRun] = reorderedRuns.splice(sourceIndex, 1);
    const normalizedIndex = Math.max(
      0,
      Math.min(insertIndex, reorderedRuns.length),
    );
    reorderedRuns.splice(normalizedIndex, 0, movedRun);

    const previousRuns = batchRuns;
    const updatedRunIds = new Set(reorderedRuns.map((run) => run.id));
    const optimisticRuns = batchRuns.map((run) => {
      const nextIndex = reorderedRuns.findIndex(
        (candidate) => candidate.id === run.id,
      );
      if (!updatedRunIds.has(run.id) || nextIndex < 0) {
        return run;
      }
      return { ...run, step_index: nextIndex };
    });

    setSavingInlineReorderItemId(itemId);
    setDraggingRunId(null);
    setDraggingItemId(null);
    setDragInsertIndex(null);
    setBatchRuns(optimisticRuns);
    setDataError("");

    try {
      for (const [index, run] of reorderedRuns.entries()) {
        const { error } = await supabase
          .from("batch_runs")
          .update({ step_index: index })
          .eq("id", run.id);

        if (error) {
          throw new Error(error.message);
        }
      }
    } catch (error) {
      setBatchRuns(previousRuns);
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.jobs.failedUpdateRouting"),
      );
    } finally {
      setSavingInlineReorderItemId(null);
    }
  };

  const syncRoutingSettings = async (
    payload: {
      runs: Array<{
        id: string;
        stationId: string;
        plannedDate: string;
        stepIndex: number;
        status: BatchRunRow["status"];
        batchCode: string;
        durationMinutes: number;
      }>;
      trackingModes: Record<string, StationTrackingMode>;
      dependencySelections: Record<string, string[]>;
    },
    options?: {
      closeOnSuccess?: boolean;
      manageLoading?: boolean;
    },
  ) => {
    if (!supabase) {
      return;
    }

    if (options?.manageLoading !== false) {
      setIsSavingRoutingSettings(true);
    }
    setDataError("");

    try {
      const nextRunIds = new Set(
        payload.runs
          .filter((run) => !run.id.startsWith("new:"))
          .map((run) => run.id),
      );

      const runsToDelete = routingSettingsRuns.filter(
        (run) => !nextRunIds.has(run.id),
      );

      for (const run of payload.runs) {
        if (run.id.startsWith("new:")) {
          const { error } = await supabase.from("batch_runs").insert({
            order_id: jobId,
            batch_code: run.batchCode,
            station_id: run.stationId || null,
            route_key: routingSettingsItemId ?? "default",
            step_index: run.stepIndex,
            status: isReleasedToQueues ? run.status : "pending",
            planned_date: run.plannedDate || null,
          });

          if (error) {
            throw new Error(error.message);
          }
          continue;
        }

        const { error } = await supabase
          .from("batch_runs")
          .update({
            station_id: run.stationId || null,
            route_key: routingSettingsItemId ?? "default",
            planned_date: run.plannedDate || null,
            step_index: run.stepIndex,
          })
          .eq("id", run.id);

        if (error) {
          throw new Error(error.message);
        }
      }

      if (runsToDelete.length > 0) {
        const { error } = await supabase
          .from("batch_runs")
          .delete()
          .in(
            "id",
            runsToDelete.map((run) => run.id),
          );
        if (error) {
          throw new Error(error.message);
        }
      }

      const changedStationIds = new Set<string>();
      payload.runs.forEach((run) => {
        if (run.stationId) {
          changedStationIds.add(run.stationId);
        }
      });
      Object.keys(payload.dependencySelections).forEach((stationId) =>
        changedStationIds.add(stationId),
      );

      for (const stationId of changedStationIds) {
        const trackingMode = payload.trackingModes[stationId];
        if (trackingMode) {
          const { error } = await supabase
            .from("workstations")
            .update({ tracking_mode: trackingMode })
            .eq("id", stationId);
          if (error) {
            throw new Error(error.message);
          }
        }

        const { error: deleteError } = await supabase
          .from("station_dependencies")
          .delete()
          .eq("station_id", stationId);
        if (deleteError) {
          throw new Error(deleteError.message);
        }

        const dependsOnIds = payload.dependencySelections[stationId] ?? [];
        if (dependsOnIds.length > 0) {
          const tenantId =
            workstations.find((station) => station.id === stationId)
              ?.tenantId ??
            workstations.find((station) => typeof station.tenantId === "string")
              ?.tenantId ??
            null;
          if (!tenantId) {
            throw new Error(t("production.main.jobs.failedUpdateRouting"));
          }
          const { error: insertError } = await supabase
            .from("station_dependencies")
            .insert(
              dependsOnIds.map((dependsOnId) => ({
                tenant_id: tenantId,
                station_id: stationId,
                depends_on_station_id: dependsOnId,
              })),
            );
          if (insertError) {
            throw new Error(insertError.message);
          }
        }
      }

      const refreshedRunsResult = await supabase
        .from("batch_runs")
        .select(
          "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
        )
        .eq("order_id", jobId)
        .order("step_index", { ascending: true })
        .order("planned_date", { ascending: true });

      if (refreshedRunsResult.error) {
        throw new Error(refreshedRunsResult.error.message);
      }

      setBatchRuns(
        (refreshedRunsResult.data ?? []).map((row) => ({
          ...(row as Omit<BatchRunRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setWorkstations((prev) =>
        prev.map((station) =>
          payload.trackingModes[station.id]
            ? { ...station, trackingMode: payload.trackingModes[station.id] }
            : station,
        ),
      );
      setStationDependencies(
        Array.from(
          Object.entries(payload.dependencySelections).flatMap(
            ([stationId, dependsOnIds]) =>
              dependsOnIds.map((dependsOnId) => ({
                id: `${stationId}:${dependsOnId}`,
                stationId,
                dependsOnStationId: dependsOnId,
              })),
          ),
        ),
      );

      if (options?.closeOnSuccess) {
        setRoutingSettingsItemId(null);
      }
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.jobs.failedUpdateRouting"),
      );
      throw error;
    } finally {
      if (options?.manageLoading !== false) {
        setIsSavingRoutingSettings(false);
      }
    }
  };

  const handleSaveRoutingSettings = async (payload: {
    runs: Array<{
      id: string;
      stationId: string;
      plannedDate: string;
      stepIndex: number;
      status: BatchRunRow["status"];
      batchCode: string;
      durationMinutes: number;
    }>;
    trackingModes: Record<string, StationTrackingMode>;
    dependencySelections: Record<string, string[]>;
  }) => {
    await syncRoutingSettings(payload, { closeOnSuccess: true });
  };

  const handleApplyRouteToUnits = async (payload: {
    targetUnitIds: string[];
    includeDates: boolean;
    runs: Array<{
      id: string;
      stationId: string;
      plannedDate: string;
      stepIndex: number;
      status: BatchRunRow["status"];
      batchCode: string;
      durationMinutes: number;
    }>;
  }) => {
    if (!supabase || payload.targetUnitIds.length === 0) {
      return;
    }

    setIsSavingRoutingSettings(true);
    setDataError("");

    try {
      const usedCodes = new Set<string>();
      batchRuns.forEach((run) => usedCodes.add(run.batch_code));
      productionItems.forEach((item) => usedCodes.add(item.batch_code || "B1"));
      const nextBatchCode = () => {
        let max = 0;
        usedCodes.forEach((code) => {
          const match = /^B(\d+)$/i.exec(code.trim());
          if (match?.[1]) {
            max = Math.max(max, Number(match[1]));
          }
        });
        const generated = `B${Math.max(1, max + 1)}`;
        usedCodes.add(generated);
        return generated;
      };

      for (const targetItemId of payload.targetUnitIds) {
        const linkedItems =
          productionItemsBySourceRowId.get(targetItemId) ?? [];
        const targetOrderItem = uniqueOrderItems.find(
          (item) => item.id === targetItemId,
        );
        if (!targetOrderItem) continue;

        const targetBatchCode = linkedItems[0]?.batch_code ?? nextBatchCode();

        const existingRuns = sortedRuns
          .filter((run) => run.batch_code === targetBatchCode)
          .sort((a, b) => a.step_index - b.step_index);
        const existingItems = [...linkedItems].sort((a, b) =>
          String(a.station_id ?? "").localeCompare(String(b.station_id ?? "")),
        );

        for (const [index, sourceRun] of payload.runs.entries()) {
          const existingRun = existingRuns[index];
          if (existingRun) {
            const { error } = await supabase
              .from("batch_runs")
              .update({
                station_id: sourceRun.stationId || null,
                route_key: targetItemId,
                planned_date: payload.includeDates
                  ? sourceRun.plannedDate || null
                  : existingRun.planned_date,
                step_index: index,
              })
              .eq("id", existingRun.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.from("batch_runs").insert({
              order_id: jobId,
              batch_code: targetBatchCode,
              station_id: sourceRun.stationId || null,
              route_key: targetItemId,
              step_index: index,
              status: isReleasedToQueues ? "queued" : "pending",
              planned_date: payload.includeDates
                ? sourceRun.plannedDate || null
                : null,
            });
            if (error) throw new Error(error.message);
          }

          const existingItem = existingItems[index];
          if (existingItem) {
            const { error } = await supabase
              .from("production_items")
              .update({
                batch_code: targetBatchCode,
                item_name: targetOrderItem.item_name,
                qty: Number(targetOrderItem.qty ?? 1),
                material: targetOrderItem.material ?? null,
                meta: {
                  fieldId: "order_item",
                  fieldLabel: t("production.main.jobs.fallbackOrderItemLabel"),
                  rowIndex: 0,
                  sourceRowId: targetItemId,
                  rowKey: targetItemId,
                  plannedDate: payload.includeDates
                    ? sourceRun.plannedDate || null
                    : (existingRun?.planned_date ?? null),
                  row: {
                    order_item_id: targetOrderItem.id,
                    production_notes: targetOrderItem.production_notes ?? null,
                  },
                },
              })
              .eq("id", existingItem.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.from("production_items").insert({
              order_id: jobId,
              batch_code: targetBatchCode,
              item_name: targetOrderItem.item_name,
              qty: Number(targetOrderItem.qty ?? 1),
              material: targetOrderItem.material ?? null,
              meta: {
                fieldId: "order_item",
                fieldLabel: t("production.main.jobs.fallbackOrderItemLabel"),
                rowIndex: 0,
                sourceRowId: targetItemId,
                rowKey: targetItemId,
                plannedDate: payload.includeDates
                  ? sourceRun.plannedDate || null
                  : null,
                row: {
                  order_item_id: targetOrderItem.id,
                  production_notes: targetOrderItem.production_notes ?? null,
                },
              },
            });
            if (error) throw new Error(error.message);
          }
        }

        if (existingRuns.length > payload.runs.length) {
          const extraRuns = existingRuns.slice(payload.runs.length);
          const { error } = await supabase
            .from("batch_runs")
            .delete()
            .in(
              "id",
              extraRuns.map((run) => run.id),
            );
          if (error) throw new Error(error.message);
        }

        if (existingItems.length > payload.runs.length) {
          const extraItems = existingItems.slice(payload.runs.length);
          const { error } = await supabase
            .from("production_items")
            .delete()
            .in(
              "id",
              extraItems.map((item) => item.id),
            );
          if (error) throw new Error(error.message);
        }
      }

      const refreshedProductionItemsResult = await supabase
        .from("production_items")
        .select(
          "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
        )
        .eq("order_id", jobId)
        .order("created_at", { ascending: false });
      if (refreshedProductionItemsResult.error) {
        throw new Error(refreshedProductionItemsResult.error.message);
      }

      const refreshedRunsResult = await supabase
        .from("batch_runs")
        .select(
          "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
        )
        .eq("order_id", jobId)
        .order("step_index", { ascending: true })
        .order("planned_date", { ascending: true });

      if (refreshedRunsResult.error) {
        throw new Error(refreshedRunsResult.error.message);
      }

      setBatchRuns(
        (refreshedRunsResult.data ?? []).map((row) => ({
          ...(row as Omit<BatchRunRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setProductionItems(
        (refreshedProductionItemsResult.data ?? []).map((row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.jobs.failedUpdateRouting"),
      );
    } finally {
      setIsSavingRoutingSettings(false);
    }
  };

  const handleSaveStationCatalog = async (payload: {
    updates: Array<{
      id: string;
      name: string;
      description: string;
      trackingMode: StationTrackingMode;
      sortOrder: number;
    }>;
    deleteIds?: string[];
    create?: {
      name: string;
      description: string;
      trackingMode: StationTrackingMode;
      sortOrder: number;
      tenantId?: string | null;
    } | null;
  }) => {
    if (!supabase) return;
    setIsSavingStationCatalog(true);
    setDataError("");

    try {
      for (const station of payload.updates) {
        const { error } = await supabase
          .from("workstations")
          .update({
            name: station.name,
            description: station.description || null,
            tracking_mode: station.trackingMode,
            sort_order: station.sortOrder,
          })
          .eq("id", station.id);
        if (error) throw new Error(error.message);
      }

      if (payload.deleteIds && payload.deleteIds.length > 0) {
        const { error: dependencyByStationError } = await supabase
          .from("station_dependencies")
          .delete()
          .in("station_id", payload.deleteIds);
        if (dependencyByStationError) {
          throw new Error(dependencyByStationError.message);
        }

        const { error: dependencyByDependsOnError } = await supabase
          .from("station_dependencies")
          .delete()
          .in("depends_on_station_id", payload.deleteIds);
        if (dependencyByDependsOnError) {
          throw new Error(dependencyByDependsOnError.message);
        }

        const { error: stationArchiveError } = await supabase
          .from("workstations")
          .update({ is_active: false })
          .in("id", payload.deleteIds);
        if (stationArchiveError) throw new Error(stationArchiveError.message);
      }

      if (payload.create?.name) {
        const { error } = await supabase.from("workstations").insert({
          tenant_id: payload.create.tenantId ?? null,
          name: payload.create.name,
          description: payload.create.description || null,
          tracking_mode: payload.create.trackingMode,
          sort_order: payload.create.sortOrder,
          is_active: true,
        });
        if (error) throw new Error(error.message);
      }

      const refreshedStations = await supabase
        .from("workstations")
        .select("id, tenant_id, name, description, tracking_mode, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (refreshedStations.error)
        throw new Error(refreshedStations.error.message);

      setWorkstations(
        ((refreshedStations.data ?? []) as Array<Record<string, unknown>>).map(
          (station) => ({
            id: String(station.id),
            tenantId:
              typeof station.tenant_id === "string" ? station.tenant_id : null,
            name: String(station.name ?? ""),
            description:
              typeof station.description === "string"
                ? station.description
                : null,
            sortOrder:
              typeof station.sort_order === "number"
                ? station.sort_order
                : null,
            trackingMode:
              station.tracking_mode === "order_level" ||
              station.tracking_mode === "receipt_only"
                ? (station.tracking_mode as StationTrackingMode)
                : "construction_level",
          }),
        ),
      );
      setIsStationCatalogOpen(false);
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : t("production.main.errors.loadFailed"),
      );
    } finally {
      setIsSavingStationCatalog(false);
    }
  };

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="space-y-2 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex min-w-0 items-center gap-2 text-xl font-semibold md:text-2xl">
              <Link
                href="/production/ready"
                className="shrink-0 text-xl font-medium text-muted-foreground transition hover:text-foreground"
              >
                {t("production.main.jobs.readyBreadcrumb")}
              </Link>
              <span className="shrink-0 text-muted-foreground/70">&gt;</span>
              <span className="truncate text-foreground">
                {title}
                {order?.customer_name ? ` - ${order.customer_name}` : ""}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {t("production.main.jobs.lastUpdated")}:{" "}
              {formatDateTime(lastUpdatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button asChild variant="secondary" className="gap-1.5">
              <Link href="/production/queues">
                <Layers3Icon className="h-3.5 w-3.5" />
                {t("production.main.jobs.stationQueuesShort")}
              </Link>
            </Button>
            <Button asChild variant="secondary" className="gap-1.5">
              <Link href={`/orders/${jobId}`}>
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                {t("production.main.jobs.sourceOrderShort")}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {dataError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}
      {actionNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          {actionNotice}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <ProductionStatCard
            label={t("production.main.jobs.progress")}
            value={`${kpis.progressPercent}%`}
            hint={
              kpis.totalRunCount > 0
                ? t("production.main.jobs.routeStepsSummary", {
                    done: kpis.completedRunCount,
                    total: kpis.totalRunCount,
                  })
                : t("production.main.jobs.progressHint")
            }
            footer={
              kpis.totalRunCount > 0 ? (
                <div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    {(
                      [
                        "done",
                        "in_progress",
                        "paused",
                        "blocked",
                        "queued",
                        "pending",
                      ] as const
                    ).map((status) => {
                      const count = kpis.routeStatusCounts[status];
                      if (count <= 0) {
                        return null;
                      }
                      return (
                        <div
                          key={status}
                          className={cn(
                            status === "done"
                              ? "bg-emerald-500"
                              : status === "in_progress"
                                ? "bg-sky-500"
                                : status === "paused"
                                  ? "bg-amber-400"
                                  : status === "blocked"
                                    ? "bg-destructive"
                                    : "bg-muted-foreground/45",
                          )}
                          style={{
                            width: `${(count / kpis.totalRunCount) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null
            }
            icon={<Layers3Icon className="h-4 w-4" />}
          />
          <ProductionStatCard
            label={t("production.main.jobs.price")}
            value={
              invoicePrice != null
                ? new Intl.NumberFormat("lv-LV", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 2,
                  }).format(invoicePrice)
                : "--"
            }
            hint={t("production.main.jobs.priceHint")}
          />
          <ProductionStatCard
            label={t("production.main.jobs.actualTime")}
            value={formatProductionDuration(kpis.totalMinutes)}
            hint={t("production.main.jobs.actualTimeHint")}
          />
          <ProductionStatCard
            label={t("production.main.jobs.regularTime")}
            value={formatProductionDuration(kpis.regularMinutes)}
            hint={t("production.main.jobs.regularTimeHint")}
          />
          <ProductionStatCard
            label={t("production.main.jobs.overtimeTime")}
            value={formatProductionDuration(kpis.overtimeMinutes)}
            hint={t("production.main.jobs.overtimeTimeHint")}
          />
          <ProductionStatCard
            label={t("production.main.jobs.dueStatus")}
            value={
              kpis.dueTodayOrLate
                ? t("production.main.jobs.dueNow")
                : t("production.main.jobs.onTrack")
            }
            tone={kpis.dueTodayOrLate ? "danger" : "success"}
            icon={<TimerResetIcon className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>{t("production.main.jobs.overview")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {isLoading ? (
                  <div className="text-muted-foreground">
                    {t("production.main.jobs.loading")}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={priorityTone(order?.priority)}>
                    {t(
                      `production.main.priority.${order?.priority ?? "normal"}`,
                    )}
                  </Badge>
                  {kpis.dueTodayOrLate ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      <AlertTriangleIcon className="h-3 w-3" />
                      {t("production.main.jobs.dueNow")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {t("production.main.jobs.onTrack")}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <SelectField
                    label={t("production.main.jobs.editPriority")}
                    value={order?.priority ?? "normal"}
                    onValueChange={handlePriorityChange}
                  >
                    <Select
                      value={order?.priority ?? "normal"}
                      onValueChange={handlePriorityChange}
                      disabled={isSavingOverview}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">
                          {t("production.main.priority.low")}
                        </SelectItem>
                        <SelectItem value="normal">
                          {t("production.main.priority.normal")}
                        </SelectItem>
                        <SelectItem value="high">
                          {t("production.main.priority.high")}
                        </SelectItem>
                        <SelectItem value="urgent">
                          {t("production.main.priority.urgent")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <DatePicker
                    label={t("production.main.jobs.productionDueDate")}
                    value={order?.production_due_date ?? order?.due_date ?? ""}
                    onChange={handleDueDateChange}
                    triggerClassName="h-10"
                    disabled={isSavingOverview}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("production.main.jobs.customer")}
                    </div>
                    <div className="mt-1 font-medium">
                      {order?.customer_name ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("orders.page.dueDate")}
                    </div>
                    <div className="mt-1 font-medium">
                      {formatProductionDate(order?.due_date)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("production.main.jobs.orderQty")}
                    </div>
                    <div className="mt-1 font-medium">
                      {order?.quantity ?? "-"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void handleReleaseToQueues()}
                      disabled={
                        isReleasingToQueues ||
                        isReleasedToQueues ||
                        !releaseReadiness.canRelease
                      }
                    >
                      <ArrowRightIcon className="mr-2 h-4 w-4" />
                      {isReleasingToQueues
                        ? t("production.main.jobs.releasingToQueues")
                        : isReleasedToQueues
                          ? t("production.main.jobs.alreadyReleased")
                          : t("production.main.jobs.releaseToQueues")}
                    </Button>
                    <Button
                      className="justify-start"
                      onClick={() => void handlePrintQr()}
                      disabled={
                        isPrintingQr ||
                        uniqueOrderItems.length === 0 ||
                        !qrFieldId
                      }
                    >
                      <QrCodeIcon className="mr-2 h-4 w-4" />
                      {isPrintingQr
                        ? t("production.main.qr.generating")
                        : t("production.main.qr.print")}
                    </Button>
                  </div>
                  {!isReleasedToQueues && !releaseReadiness.canRelease ? (
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {releaseReadiness.unitsWithoutRoutes.length > 0
                        ? t("production.main.jobs.releaseMissingRoutes")
                        : t("production.main.jobs.releaseMissingStations")}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>
                  {t("production.main.jobs.productionUnits")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {uniqueOrderItems.map((item) => {
                  const relatedRuns = runsByOrderItemId.get(item.id) ?? [];
                  const unitMeta = [
                    {
                      label: t("production.main.jobs.itemType"),
                      value: item.item_type,
                    },
                    {
                      label: t("production.main.jobs.position"),
                      value: item.position,
                    },
                    {
                      label: t("production.main.jobs.sku"),
                      value: item.sku,
                    },
                    {
                      label: t("production.main.jobs.material"),
                      value: item.material,
                    },
                    {
                      label: t("production.main.jobs.dimensions"),
                      value: item.dimensions,
                    },
                    {
                      label: t("production.main.jobs.quantity"),
                      value:
                        item.qty != null
                          ? `${item.qty}${item.uom ? ` ${item.uom}` : ""}`
                          : null,
                    },
                    {
                      label: t("production.main.jobs.revision"),
                      value: item.revision,
                    },
                    {
                      label: t("production.main.jobs.routeCode"),
                      value: item.route_code,
                    },
                    {
                      label: t("production.main.jobs.qualityClass"),
                      value: item.quality_class,
                    },
                  ].filter(
                    (entry) => String(entry.value ?? "").trim().length > 0,
                  );
                  const expandedMeta = unitMeta.filter(
                    (entry) =>
                      entry.label !== t("production.main.jobs.itemType") &&
                      entry.label !== t("production.main.jobs.position") &&
                      entry.label !== t("production.main.jobs.dimensions") &&
                      entry.label !== t("production.main.jobs.quantity"),
                  );

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/80 bg-background px-4 py-4"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedItemId((prev) =>
                            prev === item.id ? null : item.id,
                          )
                        }
                        className="flex w-full items-start justify-between gap-3 text-left transition hover:bg-muted/5"
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="text-xl font-semibold leading-tight">
                            {item.item_name}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {item.item_type ? (
                              <span>
                                {t("production.main.jobs.itemType")}:{" "}
                                {item.item_type}
                              </span>
                            ) : null}
                            {item.position ? (
                              <span>
                                {t("production.main.jobs.position")}:{" "}
                                {item.position}
                              </span>
                            ) : null}
                            {item.dimensions ? (
                              <span>
                                {t("production.main.jobs.dimensions")}:{" "}
                                {item.dimensions}
                              </span>
                            ) : null}
                            {item.qty != null ? (
                              <span>
                                {t("production.main.jobs.quantity")}: {item.qty}
                                {item.uom ? ` ${item.uom}` : ""}
                              </span>
                            ) : null}
                            {item.lifecycle_status ? (
                              <span>{item.lifecycle_status}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center">
                          {expandedItemId === item.id ? (
                            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {expandedItemId === item.id ? (
                        <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
                          <div className="space-y-3">
                            {expandedMeta.length > 0 ? (
                              <div className="space-y-1 text-sm text-muted-foreground">
                                {expandedMeta.map((entry) => (
                                  <div key={`${item.id}:${entry.label}`}>
                                    <span className="font-medium text-foreground">
                                      {entry.label}:
                                    </span>{" "}
                                    <span>{entry.value}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-start gap-3">
                              <div className="pt-1 text-emerald-500">
                                <CornerDownRightIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {relatedRuns.length > 0 ? (
                                    <>
                                      {relatedRuns.map((run, index) => (
                                        <div
                                          key={`${item.id}:step-wrap:${run.id}`}
                                          className="inline-flex items-center gap-1.5"
                                        >
                                          <button
                                            type="button"
                                            aria-hidden="true"
                                            onDragOver={(event) => {
                                              event.preventDefault();
                                              if (
                                                draggingItemId === item.id &&
                                                dragInsertIndex !== index
                                              ) {
                                                setDragInsertIndex(index);
                                              }
                                            }}
                                            onDrop={(event) => {
                                              event.preventDefault();
                                              if (draggingRunId) {
                                                void handleInlineReorderRuns(
                                                  item.id,
                                                  draggingRunId,
                                                  index,
                                                );
                                              }
                                            }}
                                            className={`h-7 shrink-0 rounded-full transition-all ${
                                              draggingItemId === item.id
                                                ? dragInsertIndex === index
                                                  ? "w-5 bg-emerald-200/90"
                                                  : "w-1.5 bg-transparent"
                                                : "w-0 bg-transparent"
                                            }`}
                                          ></button>
                                          <button
                                            type="button"
                                            draggable
                                            onDragStart={() => {
                                              setDraggingRunId(run.id);
                                              setDraggingItemId(item.id);
                                              setDragInsertIndex(index);
                                            }}
                                            onDragEnd={() => {
                                              setDraggingRunId(null);
                                              setDraggingItemId(null);
                                              setDragInsertIndex(null);
                                            }}
                                            className={`inline-flex h-7 shrink-0 cursor-grab items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0 text-[10px] font-semibold text-foreground transition hover:bg-white active:cursor-grabbing ${
                                              draggingRunId === run.id
                                                ? "opacity-45"
                                                : ""
                                            }`}
                                          >
                                            <GripVerticalIcon className="h-3 w-3 text-muted-foreground" />
                                            <span className="inline-flex h-4 min-w-3.75 items-center justify-center rounded-full bg-muted px-1 text-[8px] font-semibold text-muted-foreground">
                                              {index + 1}
                                            </span>
                                            <span>
                                              {run.station_id
                                                ? (stationNameById.get(
                                                    run.station_id,
                                                  ) ?? run.station_id)
                                                : t(
                                                    "production.main.jobs.unassigned",
                                                  )}
                                            </span>
                                          </button>
                                          {canReopenCompletedProduction &&
                                          run.status === "done" ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleReopenCompletedRun(
                                                  item.id,
                                                  run,
                                                )
                                              }
                                              disabled={
                                                reopeningRunId === run.id
                                              }
                                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-foreground transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                              aria-label={t(
                                                "production.main.jobs.reopenCompletedAction",
                                              )}
                                              title={t(
                                                "production.main.jobs.reopenCompletedAction",
                                              )}
                                            >
                                              <TimerResetIcon className="h-3.5 w-3.5" />
                                            </button>
                                          ) : null}
                                          {index === relatedRuns.length - 1 ? (
                                            <button
                                              type="button"
                                              aria-hidden="true"
                                              onDragOver={(event) => {
                                                event.preventDefault();
                                                if (
                                                  draggingItemId === item.id &&
                                                  dragInsertIndex !==
                                                    relatedRuns.length
                                                ) {
                                                  setDragInsertIndex(
                                                    relatedRuns.length,
                                                  );
                                                }
                                              }}
                                              onDrop={(event) => {
                                                event.preventDefault();
                                                if (draggingRunId) {
                                                  void handleInlineReorderRuns(
                                                    item.id,
                                                    draggingRunId,
                                                    relatedRuns.length,
                                                  );
                                                }
                                              }}
                                              className={`h-7 shrink-0 rounded-full transition-all ${
                                                draggingItemId === item.id
                                                  ? dragInsertIndex ===
                                                    relatedRuns.length
                                                    ? "w-5 bg-emerald-200/90"
                                                    : "w-1.5 bg-transparent"
                                                  : "w-0 bg-transparent"
                                              }`}
                                            ></button>
                                          ) : null}
                                        </div>
                                      ))}
                                    </>
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                                      {t("production.main.jobs.notReleasedYet")}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRoutingSettingsItemId(item.id)
                                    }
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-foreground transition hover:bg-emerald-50"
                                    aria-label={t(
                                      "production.main.jobs.routingSettings",
                                    )}
                                    title={t(
                                      "production.main.jobs.routingSettings",
                                    )}
                                  >
                                    <Settings2Icon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {savingInlineReorderItemId === item.id ? (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t("production.main.common.saving")}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>{t("production.main.jobs.details")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <PaperclipIcon className="h-4 w-4" />
                      {t("production.main.jobs.files")}
                    </div>
                    <div className="space-y-3">
                      {orderItems.map((item) => {
                        const docs = (
                          docsByOrderItem.get(item.id) ?? []
                        ).filter((doc) => {
                          const attachment = attachmentById.get(
                            doc.order_attachment_id,
                          );
                          return Boolean(
                            attachment &&
                            (isProductionAttachment(attachment) ||
                              doc.role === "production"),
                          );
                        });
                        if (docs.length === 0) return null;
                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border bg-background p-3"
                          >
                            <div className="font-medium">{item.item_name}</div>
                            <div className="mt-2 space-y-2">
                              {docs.map((doc) => {
                                const attachment = attachmentById.get(
                                  doc.order_attachment_id,
                                );
                                if (!attachment) return null;
                                const resolvedUrl =
                                  resolveAttachmentUrl(attachment);
                                return (
                                  <a
                                    key={`${doc.order_item_id}-${doc.order_attachment_id}`}
                                    href={resolvedUrl ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => {
                                      if (!resolvedUrl) {
                                        event.preventDefault();
                                      }
                                    }}
                                    className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/20"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <PaperclipIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="truncate">
                                        {attachment.name}
                                      </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {doc.role}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {unlinkedAttachments.length > 0 ? (
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="font-medium">
                            {t("production.main.jobs.orderFiles")}
                          </div>
                          <div className="mt-2 space-y-2">
                            {unlinkedAttachments.map((attachment) => {
                              const resolvedUrl =
                                resolveAttachmentUrl(attachment);
                              return (
                                <a
                                  key={attachment.id}
                                  href={resolvedUrl ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => {
                                    if (!resolvedUrl) {
                                      event.preventDefault();
                                    }
                                  }}
                                  className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/20"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <PaperclipIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                      {attachment.name}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {attachment.category || t("common.file")}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {!hasLinkedFiles && unlinkedAttachments.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          {t("production.main.jobs.noFiles")}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <MessageSquareTextIcon className="h-4 w-4" />
                      {t("orders.detail.comments.title")}
                    </div>
                    {comments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {t("orders.detail.comments.empty")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="rounded-lg border border-border bg-background p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">
                                  {comment.author_name ||
                                    t("orders.detail.comments.roleUnknown")}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {comment.author_role ||
                                    t("orders.detail.comments.roleUnknown")}
                                  {" · "}
                                  {formatDateTime(comment.created_at)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              {comment.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ProductionRoutingSettingsModal
        open={Boolean(routingSettingsItemId)}
        onClose={() => {
          if (!isSavingRoutingSettings) {
            setRoutingSettingsItemId(null);
          }
        }}
        runs={routingSettingsRuns}
        stations={workstations}
        dependencies={stationDependencies}
        unitOptions={routeUnitOptions}
        currentUnitId={routingSettingsItemId}
        onSyncCurrentUnit={(payload) =>
          void syncRoutingSettings(payload, { manageLoading: false })
        }
        onApplyRoute={(payload) => void handleApplyRouteToUnits(payload)}
        onOpenStationCatalog={() => setIsStationCatalogOpen(true)}
        isSaving={isSavingRoutingSettings}
        onSave={(payload) => void handleSaveRoutingSettings(payload)}
      />
      <ProductionStationCatalogModal
        open={isStationCatalogOpen}
        onClose={() => {
          if (!isSavingStationCatalog) {
            setIsStationCatalogOpen(false);
          }
        }}
        stations={workstations}
        onSave={(payload) => void handleSaveStationCatalog(payload)}
        isSaving={isSavingStationCatalog}
      />
    </section>
  );
}
