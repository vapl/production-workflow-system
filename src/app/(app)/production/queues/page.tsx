"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CalendarIcon,
  FileTextIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  RefreshCcwIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { Input } from "@/components/ui/Input";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import {
  ProductionSplitPlanner,
  type ProductionSplitPlannerRow,
} from "@/components/production/ProductionSplitPlanner";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  buildQueueByStation,
  type ProductionQueueItem,
} from "@/lib/domain/productionQueue";
import { subscribeProductionLiveEvents } from "@/lib/domain/productionLive";
import {
  computeStationQueueMetrics,
  formatQueueDuration,
} from "@/lib/domain/productionQueueMetrics";
import {
  applyProductionSplitPlan,
  rowKeyForProductionItem,
} from "@/lib/domain/productionSplitActions";
import type { ProductionJobOrderItem } from "@/lib/domain/productionJobDetail";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionPriority,
  ProductionStation,
} from "@/types/production";

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

function priorityBadge(priority: ProductionPriority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function statusBadge(status: BatchRunRow["status"]) {
  if (status === "blocked") return "status-blocked";
  if (status === "paused") return "status-paused";
  if (status === "pending") return "status-pending";
  if (status === "in_progress") return "status-in_engineering";
  if (status === "done") return "status-ready_for_production";
  return "status-draft";
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToInputDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return getLocalDateInputValue(date);
}

type QueueQuickFilter =
  | "none"
  | "today"
  | "days7"
  | "late"
  | "blocked"
  | "in_progress";

function formatQueueGroupDate(
  value: string | null | undefined,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (!value) {
    return t("production.main.common.unassigned");
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return formatDateInput(value);
  }
  return new Intl.DateTimeFormat("lv-LV", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export default function ProductionQueuesPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const today = useMemo(() => getLocalDateInputValue(), []);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [orderItems, setOrderItems] = useState<ProductionJobOrderItem[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [quickFilter, setQuickFilter] = useState<QueueQuickFilter>("none");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [queueActionDate, setQueueActionDate] = useState(
    getLocalDateInputValue(),
  );
  const [selectedQueueRunIds, setSelectedQueueRunIds] = useState<string[]>([]);
  const [isQueueBulkApplying, setIsQueueBulkApplying] = useState(false);
  const [isSplitPlannerOpen, setIsSplitPlannerOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<ProductionSplitPlannerRow[]>([]);
  const [splitSelections, setSplitSelections] = useState<
    Record<string, string[]>
  >({});
  const [splitPlannedDates, setSplitPlannedDates] = useState<
    Record<string, string>
  >({});
  const [splitGlobalDate, setSplitGlobalDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [splitStations, setSplitStations] = useState<ProductionStation[]>([]);
  const [isReplanning, setIsReplanning] = useState(false);
  const [search, setSearch] = useState("");
  const [queueViewMode, setQueueViewMode] = useState<
    "active" | "completed" | "all"
  >("active");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [scrolledColumns, setScrolledColumns] = useState<
    Record<string, boolean>
  >({});
  const liveReloadTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dataError) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDataError("");
    }, 5000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dataError]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setDataError("");
    const sb = supabase;
    if (!sb) {
      setIsLoading(false);
      return;
    }
    const [stationsResult, itemsResult, orderItemsResult, runsResult] =
      await Promise.all([
        sb
          .from("workstations")
          .select("id, name, sort_order, tracking_mode")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        sb
          .from("production_items")
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
        sb
          .from("order_items")
          .select("id, order_id, item_name, item_type")
          .order("created_at", { ascending: true }),
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
          .order("step_index", { ascending: true })
          .order("planned_date", { ascending: true }),
      ]);
    if (
      stationsResult.error ||
      itemsResult.error ||
      orderItemsResult.error ||
      runsResult.error
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
        trackingMode: station.tracking_mode ?? "construction_level",
      })),
    );
    setProductionItems(
      (itemsResult.data ?? []).map((row) => ({
        ...(row as Omit<ProductionItemRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      })),
    );
    setOrderItems((orderItemsResult.data ?? []) as ProductionJobOrderItem[]);
    setBatchRuns(
      (runsResult.data ?? []).map((row) => ({
        ...(row as Omit<BatchRunRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      })),
    );
    setIsLoading(false);
  }, [t]);

  const { normalizedDateFrom, normalizedDateTo } = useMemo(() => {
    const fallbackStart = "2000-01-01";
    const fallbackEnd = addDaysToInputDate(today, 3650);

    if (dateFrom || dateTo) {
      return {
        normalizedDateFrom: dateFrom || fallbackStart,
        normalizedDateTo: dateTo || fallbackEnd,
      };
    }

    return {
      normalizedDateFrom: "",
      normalizedDateTo: "",
    };
  }, [dateFrom, dateTo, today]);

  useEffect(() => {
    void loadData();
    return () => {
      if (liveReloadTimeoutRef.current) {
        window.clearTimeout(liveReloadTimeoutRef.current);
      }
    };
  }, [loadData]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }

    const scheduleReload = () => {
      if (liveReloadTimeoutRef.current) {
        window.clearTimeout(liveReloadTimeoutRef.current);
      }
      liveReloadTimeoutRef.current = window.setTimeout(() => {
        void loadData();
      }, 250);
    };

    const channel = sb
      .channel(`production-queues-live-${user?.tenantId ?? "default"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batch_runs" },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_items" },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workstations" },
        scheduleReload,
      )
      .subscribe();

    return () => {
      if (liveReloadTimeoutRef.current) {
        window.clearTimeout(liveReloadTimeoutRef.current);
      }
      void sb.removeChannel(channel);
    };
  }, [loadData, user?.tenantId]);

  useEffect(() => {
    const scheduleReload = () => {
      if (liveReloadTimeoutRef.current) {
        window.clearTimeout(liveReloadTimeoutRef.current);
      }
      liveReloadTimeoutRef.current = window.setTimeout(() => {
        void loadData();
      }, 250);
    };

    return subscribeProductionLiveEvents((event) => {
      if (event.type !== "status-changed") {
        return;
      }
      const targetRunIds = new Set(
        [event.runId, ...(event.runIds ?? [])].filter(Boolean),
      );
      setBatchRuns((prev) =>
        prev.map((run) =>
          targetRunIds.has(run.id)
            ? {
                ...run,
                status: event.status,
                started_at: event.startedAt,
                done_at: event.doneAt,
                duration_minutes: event.durationMinutes,
              }
            : run,
        ),
      );
      if (event.itemIds && event.itemIds.length > 0) {
        const itemIdSet = new Set(event.itemIds);
        setProductionItems((prev) =>
          prev.map((item) =>
            itemIdSet.has(item.id)
              ? {
                  ...item,
                  status: event.status,
                  started_at: event.startedAt,
                  done_at: event.doneAt,
                  duration_minutes: event.durationMinutes,
                }
              : item,
          ),
        );
      }
      scheduleReload();
    });
  }, [loadData]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadData();
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadData]);

  const queueByStation = useMemo(
    () =>
      buildQueueByStation({
        batchRuns,
        productionItems,
        orderItems,
        stations,
        viewDate: "2000-01-01",
        plannedRangeDays: 36500,
        includeDone: queueViewMode !== "active",
      }),
    [
      batchRuns,
      orderItems,
      productionItems,
      queueViewMode,
      stations,
    ],
  );

  const filteredQueueByStation = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesQuickFilter = (item: ProductionQueueItem) => {
      const itemDate = item.plannedDate?.slice(0, 10) ?? "";

      if (
        normalizedDateFrom &&
        itemDate &&
        itemDate < normalizedDateFrom
      ) {
        return false;
      }

      if (normalizedDateTo && itemDate && itemDate > normalizedDateTo) {
        return false;
      }

      if ((dateFrom || dateTo) && !itemDate) {
        return false;
      }

      if (quickFilter === "today") {
        return itemDate === today;
      }

      if (quickFilter === "days7") {
        return Boolean(itemDate) && itemDate >= today && itemDate <= addDaysToInputDate(today, 6);
      }

      if (quickFilter === "late") {
        const comparisonDate = itemDate || item.dueDate?.slice(0, 10) || "";
        return Boolean(comparisonDate) && comparisonDate < today && item.status !== "done";
      }

      if (quickFilter === "blocked") {
        return item.status === "blocked";
      }

      if (quickFilter === "in_progress") {
        return item.status === "in_progress";
      }

      return true;
    };

    if (!query) {
      const next = new Map(queueByStation);
      next.forEach((queue, stationId) => {
        next.set(
          stationId,
          queue.filter((item) => {
            const matchesMode =
              queueViewMode === "completed"
                ? item.status === "done"
                : queueViewMode === "active"
                  ? item.status !== "done"
                  : true;
            return matchesMode && matchesQuickFilter(item);
          }),
        );
      });
      return next;
    }
    const next = new Map(queueByStation);
    next.forEach((queue, stationId) => {
      next.set(
        stationId,
        queue.filter((item) => {
          const matchesMode =
            queueViewMode === "completed"
              ? item.status === "done"
              : queueViewMode === "active"
                ? item.status !== "done"
                : true;
          if (!matchesMode) {
            return false;
          }
          if (!matchesQuickFilter(item)) {
            return false;
          }
          return (
            item.orderNumber.toLowerCase().includes(query) ||
            item.customerName.toLowerCase().includes(query) ||
            item.batchCode.toLowerCase().includes(query) ||
            item.material.toLowerCase().includes(query) ||
            item.items.some((row) =>
              row.item_name.toLowerCase().includes(query),
            )
          );
        }),
      );
    });
    return next;
  }, [
    dateFrom,
    dateTo,
    normalizedDateFrom,
    normalizedDateTo,
    queueByStation,
    queueViewMode,
    quickFilter,
    search,
    today,
  ]);

  const metricsByStation = useMemo(
    () =>
      computeStationQueueMetrics(
        stations,
        filteredQueueByStation,
        new Date().toISOString().slice(0, 10),
      ),
    [filteredQueueByStation, stations],
  );

  const horizontalScrollMaskStyle = useMemo<CSSProperties>(() => {
    const fadeWidth = "56px";

    if (showLeftFade && showRightFade) {
      return {
        WebkitMaskImage: `linear-gradient(to right, transparent 0, black ${fadeWidth}, black calc(100% - ${fadeWidth}), transparent 100%)`,
        maskImage: `linear-gradient(to right, transparent 0, black ${fadeWidth}, black calc(100% - ${fadeWidth}), transparent 100%)`,
      };
    }

    if (showLeftFade) {
      return {
        WebkitMaskImage: `linear-gradient(to right, transparent 0, black ${fadeWidth}, black 100%)`,
        maskImage: `linear-gradient(to right, transparent 0, black ${fadeWidth}, black 100%)`,
      };
    }

    if (showRightFade) {
      return {
        WebkitMaskImage: `linear-gradient(to right, black 0, black calc(100% - ${fadeWidth}), transparent 100%)`,
        maskImage: `linear-gradient(to right, black 0, black calc(100% - ${fadeWidth}), transparent 100%)`,
      };
    }

    return {};
  }, [showLeftFade, showRightFade]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const updateScrollFade = () => {
      const { scrollLeft, clientWidth, scrollWidth } = container;
      setShowLeftFade(scrollLeft > 6);
      setShowRightFade(scrollLeft + clientWidth < scrollWidth - 6);
    };

    updateScrollFade();
    container.addEventListener("scroll", updateScrollFade, { passive: true });
    window.addEventListener("resize", updateScrollFade);

    return () => {
      container.removeEventListener("scroll", updateScrollFade);
      window.removeEventListener("resize", updateScrollFade);
    };
  }, [stations.length, filteredQueueByStation]);

  const visibleQueueRunIds = useMemo(
    () =>
      Array.from(filteredQueueByStation.values())
        .flat()
        .map((item) => item.id),
    [filteredQueueByStation],
  );

  const queueItemByRunId = useMemo(() => {
    const map = new Map<
      string,
      { item: ProductionQueueItem; stationName: string }
    >();
    stations.forEach((station) => {
      const queue = filteredQueueByStation.get(station.id) ?? [];
      queue.forEach((item) => {
        map.set(item.id, { item, stationName: station.name });
      });
    });
    return map;
  }, [filteredQueueByStation, stations]);

  const selectedBatchRunIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedQueueRunIds.flatMap((id) => queueItemByRunId.get(id)?.item.runIds ?? []),
        ),
      ),
    [queueItemByRunId, selectedQueueRunIds],
  );

  const allVisibleQueueSelected =
    visibleQueueRunIds.length > 0 &&
    visibleQueueRunIds.every((id) => selectedQueueRunIds.includes(id));

  const canManageQueue =
    user.isAdmin || user.isOwner || user.role === "Production planner";

  const hasAdvancedDateFilter = Boolean(dateFrom || dateTo);

  const quickFilterOptions = useMemo<
    Array<{
      value: QueueQuickFilter;
      label: string;
    }>
  >(
    () => [
      { value: "today", label: t("production.main.queues.quickFilters.today") },
      { value: "days7", label: t("production.main.queues.quickFilters.days7") },
      { value: "late", label: t("production.main.queues.quickFilters.late") },
      {
        value: "blocked",
        label: t("production.main.queues.quickFilters.blocked"),
      },
      {
        value: "in_progress",
        label: t("production.main.queues.quickFilters.inProgress"),
      },
    ],
    [t],
  );

  const quickFilterCounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allItems = Array.from(queueByStation.values()).flat();
    const countMap = new Map<QueueQuickFilter, number>();

    const matchesMode = (item: ProductionQueueItem) =>
      queueViewMode === "completed"
        ? item.status === "done"
        : queueViewMode === "active"
          ? item.status !== "done"
          : true;

    const matchesAdvancedDateFilter = (item: ProductionQueueItem) => {
      const itemDate = item.plannedDate?.slice(0, 10) ?? "";
      if (normalizedDateFrom && itemDate && itemDate < normalizedDateFrom) {
        return false;
      }
      if (normalizedDateTo && itemDate && itemDate > normalizedDateTo) {
        return false;
      }
      if ((dateFrom || dateTo) && !itemDate) {
        return false;
      }
      return true;
    };

    const matchesSearch = (item: ProductionQueueItem) =>
      !query ||
      item.orderNumber.toLowerCase().includes(query) ||
      item.customerName.toLowerCase().includes(query) ||
      item.batchCode.toLowerCase().includes(query) ||
      item.material.toLowerCase().includes(query) ||
      item.items.some((row) => row.item_name.toLowerCase().includes(query));

    const matchesQuick = (item: ProductionQueueItem, filter: QueueQuickFilter) => {
      const itemDate = item.plannedDate?.slice(0, 10) ?? "";
      if (filter === "today") {
        return itemDate === today;
      }
      if (filter === "days7") {
        return (
          Boolean(itemDate) &&
          itemDate >= today &&
          itemDate <= addDaysToInputDate(today, 6)
        );
      }
      if (filter === "late") {
        const comparisonDate = itemDate || item.dueDate?.slice(0, 10) || "";
        return Boolean(comparisonDate) && comparisonDate < today && item.status !== "done";
      }
      if (filter === "blocked") {
        return item.status === "blocked";
      }
      if (filter === "in_progress") {
        return item.status === "in_progress";
      }
      return true;
    };

    const baseItems = allItems.filter(
      (item) => matchesMode(item) && matchesAdvancedDateFilter(item) && matchesSearch(item),
    );

    quickFilterOptions.forEach((filter) => {
      countMap.set(
        filter.value,
        baseItems.filter((item) => matchesQuick(item, filter.value)).length,
      );
    });

    return countMap;
  }, [
    dateFrom,
    dateTo,
    normalizedDateFrom,
    normalizedDateTo,
    queueByStation,
    queueViewMode,
    quickFilterOptions,
    search,
    today,
  ]);

  const resetAdvancedFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  const handleMoveSelectedQueueDate = async () => {
    if (!supabase || selectedBatchRunIds.length === 0) {
      return;
    }
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }

    const runs = batchRuns.filter((run) => selectedBatchRunIds.includes(run.id));
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
      setDataError(
        error.code === "42501"
          ? t("production.main.errors.missingQueuePermission")
          : error.message ||
              t("production.main.errors.failedMoveSelectedQueueDate"),
      );
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
    if (!supabase || selectedBatchRunIds.length === 0) {
      return;
    }
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }

    const removableRuns = batchRuns.filter(
      (run) =>
        selectedBatchRunIds.includes(run.id) &&
        (run.status === "queued" ||
          run.status === "pending" ||
          run.status === "blocked"),
    );

    if (removableRuns.length === 0) {
      return;
    }

    setIsQueueBulkApplying(true);
    for (const run of removableRuns) {
      await supabase.from("batch_runs").delete().eq("id", run.id);
      await supabase
        .from("production_items")
        .delete()
        .eq("order_id", run.order_id)
        .eq("batch_code", run.batch_code)
        .eq("station_id", run.station_id);
    }
    setIsQueueBulkApplying(false);

    const removedIdSet = new Set(removableRuns.map((run) => run.id));
    setBatchRuns((prev) => prev.filter((run) => !removedIdSet.has(run.id)));
    setProductionItems((prev) =>
      prev.filter(
        (item) =>
          !removableRuns.some(
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
  };

  const handleOpenQueueReplan = (
    item: ProductionQueueItem,
    stationName: string,
  ) => {
    if (!canManageQueue) {
      setDataError(t("production.main.errors.missingQueuePermission"));
      return;
    }
    if (
      item.status !== "queued" &&
      item.status !== "pending" &&
      item.status !== "blocked"
    ) {
      setDataError("Only queued, pending or blocked rows can be replanned.");
      return;
    }

    const sourceRows =
      item.items.length > 0
        ? item.items
        : [
            {
              id: item.id,
              order_id: item.orderId,
              batch_code: item.batchCode,
              item_name: item.material || item.orderNumber,
              status: item.status,
              station_id: null,
              qty: item.totalQty || 1,
              material: item.material || null,
              meta: {
                fieldId: "fallback",
                fieldLabel: t("production.main.jobs.fallbackConstructionLabel"),
                rowIndex: 0,
                sourceRowId: null,
                rowKey: `${item.id}:fallback`,
                plannedDate: item.plannedDate ?? queueActionDate,
                row: {},
              },
              started_at: item.startedAt ?? null,
              done_at: item.doneAt ?? null,
              duration_minutes: item.durationMinutes ?? null,
            } satisfies ProductionItemRow,
          ];

    const rows = sourceRows.map<ProductionSplitPlannerRow>((row) => {
      const locked =
        row.status === "in_progress" ||
        row.status === "paused" ||
        row.status === "done";
      return {
        id: rowKeyForProductionItem(row),
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        customerName: item.customerName,
        dueDate: item.dueDate,
        batchCode: item.batchCode,
        priority: item.priority,
        fieldId:
          typeof row.meta?.fieldId === "string"
            ? String(row.meta.fieldId)
            : "order_item",
        fieldLabel:
          typeof row.meta?.fieldLabel === "string"
            ? String(row.meta.fieldLabel)
            : t("production.main.jobs.fallbackConstructionLabel"),
        itemName: row.item_name,
        qty: Number(row.qty ?? 1),
        material: row.material ?? item.material ?? "",
        sourceRowId:
          typeof row.meta?.sourceRowId === "string"
            ? String(row.meta.sourceRowId)
            : null,
        rowIndex:
          typeof row.meta?.rowIndex === "number"
            ? row.meta.rowIndex
            : Number(row.meta?.rowIndex ?? 0),
        rawRow:
          typeof row.meta?.row === "object" && row.meta?.row !== null
            ? (row.meta.row as Record<string, unknown>)
            : {},
        locked,
        lockReason: locked
          ? t("production.main.queues.lockedStarted")
          : undefined,
        currentStationName: stationName,
        sourceRunId: item.id,
        sourceRunIds: item.runIds,
      };
    });

    const currentStation =
      stations.find((station) => station.id === item.stationId) ??
      (item.stationId
        ? {
            id: item.stationId,
            name: stationName,
            sortOrder: 0,
          }
        : null);
    const plannerStations = currentStation ? [currentStation] : stations;
    const defaultSelections: Record<string, string[]> = {};
    const defaultDates: Record<string, string> = {};

    rows.forEach((row) => {
      defaultSelections[row.id] = row.locked
        ? []
        : currentStation
          ? [currentStation.id]
          : [];
      defaultDates[row.id] = item.plannedDate ?? queueActionDate;
    });

    setSplitRows(rows);
    setSplitStations(plannerStations);
    setSplitSelections(defaultSelections);
    setSplitPlannedDates(defaultDates);
    setSplitGlobalDate(item.plannedDate ?? queueActionDate);
    setIsSplitPlannerOpen(true);
    setDataError("");
  };

  const handleConfirmReplan = async () => {
    if (!supabase || splitRows.length === 0) {
      return;
    }

    setIsReplanning(true);
    setDataError("");

    try {
      const singleStationQueueReplan =
        splitStations.length === 1 &&
        splitRows.every(
          (row) =>
            (Array.isArray(row.sourceRunIds) && row.sourceRunIds.length > 0) ||
            (typeof row.sourceRunId === "string" && row.sourceRunId.length > 0),
        );

      if (singleStationQueueReplan) {
        const updates = splitRows
          .filter((row) => !row.locked)
          .flatMap((row) =>
            (row.sourceRunIds ?? [row.sourceRunId as string]).map((runId) => ({
              runId,
              rowId: row.id,
              plannedDate:
                splitPlannedDates[row.id] ??
                (splitGlobalDate || queueActionDate),
            })),
          )
          .map((row) => ({
            runId: row.runId,
            plannedDate:
              row.plannedDate,
          }))
          .filter((row) => Boolean(row.plannedDate));

        for (const update of updates) {
          const { error } = await supabase
            .from("batch_runs")
            .update({ planned_date: update.plannedDate })
            .eq("id", update.runId);

          if (error) {
            throw new Error(error.message ?? "Failed to update planned date.");
          }
        }

        const updatedDateByRunId = new Map(
          updates.map((update) => [update.runId, update.plannedDate]),
        );
        setBatchRuns((prev) =>
          prev.map((run) =>
            updatedDateByRunId.has(run.id)
              ? {
                  ...run,
                  planned_date:
                    updatedDateByRunId.get(run.id) ?? run.planned_date,
                }
              : run,
          ),
        );
        setIsSplitPlannerOpen(false);
        setSplitRows([]);
        setSplitStations([]);
        return;
      }

      const result = await applyProductionSplitPlan({
        supabase,
        mode: "replan",
        rows: splitRows,
        selections: splitSelections,
        plannedDates: splitPlannedDates,
        fallbackPlannedDate: splitGlobalDate || queueActionDate,
        stations,
        batchRuns,
        productionItems,
      });

      setProductionItems((prev) => [
        ...result.insertedItems,
        ...prev.filter((item) => !result.removedItemIds.has(item.id)),
      ]);
      setBatchRuns((prev) => [
        ...result.insertedRuns,
        ...prev.filter((run) => !result.removedRunIds.has(run.id)),
      ]);
      setSelectedQueueRunIds((prev) =>
        prev.filter((id) => !result.removedRunIds.has(id)),
      );
      setIsSplitPlannerOpen(false);
      setSplitRows([]);
      setSplitStations([]);
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "Failed to replan rows.",
      );
    } finally {
      setIsReplanning(false);
    }
  };

  return (
    <div className="space-y-4 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
      <DesktopPageHeader
        titleBlockClassName="md:max-w-none xl:max-w-none"
        title={
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Link
              href="/production/ready"
              className="text-muted-foreground text-xl transition hover:text-foreground"
            >
              {t("production.main.subnav.ready")}
            </Link>
            <span className="text-muted-foreground text-xl ">&gt;</span>
            <span>{t("production.main.queues.title")}</span>
          </span>
        }
        subtitle={t("production.main.queues.subtitle")}
        actions={
          <div className="grid w-full min-w-0 gap-2 xl:w-full xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <Input
              icon="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("production.main.queues.searchPlaceholder")}
              className="h-10"
              wrapperClassName="w-full min-w-0 xl:max-w-[40rem] xl:col-start-1 xl:row-start-1"
            />
            <div className="flex flex-wrap items-center justify-start gap-2 xl:col-start-2 xl:row-start-1 xl:justify-end xl:shrink-0">
              <div className="hidden xl:flex xl:items-center xl:gap-2 xl:rounded-full xl:border xl:border-border xl:bg-background/90 xl:p-1 xl:shadow-sm">
                <Button
                  variant={queueViewMode === "active" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full px-4"
                  onClick={() => setQueueViewMode("active")}
                >
                  {t("production.main.queues.viewMode.active")}
                </Button>
                <Button
                  variant={queueViewMode === "completed" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full px-4"
                  onClick={() => setQueueViewMode("completed")}
                >
                  {t("production.main.queues.viewMode.completed")}
                </Button>
                <Button
                  variant={queueViewMode === "all" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full px-4"
                  onClick={() => setQueueViewMode("all")}
                >
                  {t("production.main.queues.viewMode.all")}
                </Button>
              </div>
              <FiltersDropdown
                label={t("production.main.queues.advancedFilters.trigger")}
                contentClassName="w-[360px] p-4"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("production.main.queues.advancedFilters.quickFiltersLabel")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {quickFilterOptions.map((filter) => (
                        <Button
                          key={filter.value}
                          variant={quickFilter === filter.value ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3"
                          onClick={() =>
                            setQuickFilter((prev) =>
                              prev === filter.value ? "none" : filter.value,
                            )
                          }
                        >
                          {filter.label} {quickFilterCounts.get(filter.value) ?? 0}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-border/70" />
                  <DatePicker
                    label={t("production.main.queues.advancedFilters.fromDate")}
                    value={dateFrom}
                    onChange={(value) => setDateFrom(value || "")}
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <DatePicker
                    label={t("production.main.queues.advancedFilters.toDate")}
                    value={dateTo}
                    onChange={(value) => setDateTo(value || "")}
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <div className="flex items-center justify-between border-t border-border/70 pt-3">
                    <p className="text-xs text-muted-foreground">
                      {t("production.main.queues.advancedFilters.historyHint")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3"
                      onClick={() => {
                        setQuickFilter("none");
                        resetAdvancedFilters();
                      }}
                      disabled={quickFilter === "none" && !hasAdvancedDateFilter}
                    >
                      {t("production.main.queues.advancedFilters.reset")}
                    </Button>
                  </div>
                </div>
              </FiltersDropdown>
              <FiltersDropdown
                label={
                  selectedQueueRunIds.length > 0
                    ? `${t("production.main.queues.bulkActions")} (${selectedQueueRunIds.length})`
                    : t("production.main.queues.bulkActions")
                }
                icon={ListChecksIcon}
                contentClassName="w-[280px] p-3"
              >
                <div className="space-y-2">
                  <DatePicker
                    label={t("production.main.queue.moveDate")}
                    value={queueActionDate}
                    onChange={(value) =>
                      setQueueActionDate(value || queueActionDate)
                    }
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <div className="h-px bg-border/70" />
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={() => {
                      const target =
                        selectedQueueRunIds.length === 1
                          ? queueItemByRunId.get(selectedQueueRunIds[0] ?? "")
                          : null;
                      if (target) {
                        handleOpenQueueReplan(target.item, target.stationName);
                      }
                    }}
                    disabled={
                      selectedQueueRunIds.length !== 1 ||
                      !queueItemByRunId.has(selectedQueueRunIds[0] ?? "")
                    }
                  >
                    {t("production.main.queues.replanSelected")}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={handleMoveSelectedQueueDate}
                    disabled={
                      selectedQueueRunIds.length === 0 || isQueueBulkApplying
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {t("production.main.queues.moveSelectedDate")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleClearSelectedQueue}
                    disabled={
                      selectedQueueRunIds.length === 0 || isQueueBulkApplying
                    }
                  >
                    {t("production.main.queues.clearSelected")}
                  </Button>
                </div>
              </FiltersDropdown>
            </div>
            <div className="hidden xl:col-start-1 xl:col-span-2 xl:row-start-2 xl:flex xl:flex-wrap xl:items-center xl:gap-x-4 xl:gap-y-1 xl:text-xs xl:text-muted-foreground">
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox
                  variant="box"
                  checked={allVisibleQueueSelected}
                  onChange={() =>
                    setSelectedQueueRunIds(
                      allVisibleQueueSelected ? [] : visibleQueueRunIds,
                    )
                  }
                />
                <span className="font-medium">
                  {t("production.main.queues.selectVisible")}
                </span>
              </label>
              <span>
                {t("production.main.queues.selectedCount", {
                  count: selectedQueueRunIds.length,
                })}
              </span>
              <span>
                {t("production.main.queues.stationsCount", {
                  count: stations.length,
                })}
              </span>
              <span>
                {t("production.main.queues.cardsCount", {
                  count: visibleQueueRunIds.length,
                })}
              </span>
            </div>
          </div>
        }
      />
      <MobilePageTitle
        title={t("production.main.queues.title")}
        subtitle={t("production.main.queues.mobileSubtitle")}
        showCompact={false}
      />

      {dataError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      <Card className="border-border/80 shadow-sm md:hidden">
        <CardContent className="pt-5">
          <div className="grid gap-3 md:hidden">
            <Input
              icon="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("production.main.queues.searchPlaceholder")}
              className="h-10"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 md:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={queueViewMode === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setQueueViewMode("active")}
              >
                {t("production.main.queues.viewMode.active")}
              </Button>
              <Button
                variant={queueViewMode === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setQueueViewMode("completed")}
              >
                {t("production.main.queues.viewMode.completed")}
              </Button>
              <Button
                variant={queueViewMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setQueueViewMode("all")}
              >
                {t("production.main.queues.viewMode.all")}
              </Button>
              <FiltersDropdown
                contentClassName="w-[320px] p-4"
                label={t("production.main.queues.advancedFilters.trigger")}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("production.main.queues.advancedFilters.quickFiltersLabel")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {quickFilterOptions.map((filter) => (
                        <Button
                          key={filter.value}
                          variant={quickFilter === filter.value ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3"
                          onClick={() =>
                            setQuickFilter((prev) =>
                              prev === filter.value ? "none" : filter.value,
                            )
                          }
                        >
                          {filter.label} {quickFilterCounts.get(filter.value) ?? 0}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-border/70" />
                  <DatePicker
                    label={t("production.main.queues.advancedFilters.fromDate")}
                    value={dateFrom}
                    onChange={(value) => setDateFrom(value || "")}
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <DatePicker
                    label={t("production.main.queues.advancedFilters.toDate")}
                    value={dateTo}
                    onChange={(value) => setDateTo(value || "")}
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <Button
                    variant="ghost"
                    className="w-full justify-center"
                    onClick={() => {
                      setQuickFilter("none");
                      resetAdvancedFilters();
                    }}
                    disabled={quickFilter === "none" && !hasAdvancedDateFilter}
                  >
                    {t("production.main.queues.advancedFilters.reset")}
                  </Button>
                </div>
              </FiltersDropdown>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FiltersDropdown
                label={
                  selectedQueueRunIds.length > 0
                    ? `${t("production.main.queues.bulkActions")} (${selectedQueueRunIds.length})`
                    : t("production.main.queues.bulkActions")
                }
                icon={ListChecksIcon}
                contentClassName="w-[280px] p-3"
              >
                <div className="space-y-2">
                  <DatePicker
                    label={t("production.main.queue.moveDate")}
                    value={queueActionDate}
                    onChange={(value) =>
                      setQueueActionDate(value || queueActionDate)
                    }
                    className="space-y-1 text-xs text-muted-foreground"
                  />
                  <div className="h-px bg-border/70" />
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={() => {
                      const target =
                        selectedQueueRunIds.length === 1
                          ? queueItemByRunId.get(selectedQueueRunIds[0] ?? "")
                          : null;
                      if (target) {
                        handleOpenQueueReplan(target.item, target.stationName);
                      }
                    }}
                    disabled={
                      selectedQueueRunIds.length !== 1 ||
                      !queueItemByRunId.has(selectedQueueRunIds[0] ?? "")
                    }
                  >
                    {t("production.main.queues.replanSelected")}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={handleMoveSelectedQueueDate}
                    disabled={
                      selectedQueueRunIds.length === 0 || isQueueBulkApplying
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {t("production.main.queues.moveSelectedDate")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleClearSelectedQueue}
                    disabled={
                      selectedQueueRunIds.length === 0 || isQueueBulkApplying
                    }
                  >
                    {t("production.main.queues.clearSelected")}
                  </Button>
                </div>
              </FiltersDropdown>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs text-muted-foreground md:hidden">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="flex items-center gap-3">
                <Checkbox
                  variant="box"
                  checked={allVisibleQueueSelected}
                  onChange={() =>
                    setSelectedQueueRunIds(
                      allVisibleQueueSelected ? [] : visibleQueueRunIds,
                    )
                  }
                />
                <span className="font-medium text-foreground">
                  {t("production.main.queues.selectVisible")}
                </span>
              </label>
              <span>
                {t("production.main.queues.selectedCount", {
                  count: selectedQueueRunIds.length,
                })}
              </span>
              <span>
                {t("production.main.queues.stationsCount", {
                  count: stations.length,
                })}
              </span>
              <span>
                {t("production.main.queues.cardsCount", {
                  count: visibleQueueRunIds.length,
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative md:min-h-0 md:flex-1">
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-2 md:h-full md:items-stretch md:pb-0"
          style={horizontalScrollMaskStyle}
        >
          {stations.map((station) => {
            const queue = filteredQueueByStation.get(station.id) ?? [];
            const metrics = metricsByStation.get(station.id);
            const queueGroups = queue.reduce<
              Array<{
                key: string;
                label: string;
                items: ProductionQueueItem[];
              }>
            >((groups, item) => {
              const key = item.plannedDate ?? "unassigned";
              const existing = groups.find((group) => group.key === key);
              if (existing) {
                existing.items.push(item);
                return groups;
              }
              groups.push({
                key,
                label: formatQueueGroupDate(item.plannedDate, t),
                items: [item],
              });
              return groups;
            }, []);
            return (
              <div
                key={station.id}
                className="min-w-77 max-w-77 flex-1 pb-6 md:flex md:h-full md:min-h-0 md:flex-col"
              >
                <Card className="h-full border-border/80 gap-2 shadow-sm md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
                  <CardHeader
                    className={[
                      "rounded-t-xl border-b border-border bg-background px-4 pt-3 pb-2! md:shrink-0 transition-shadow duration-200",
                      scrolledColumns[station.id]
                        ? "shadow-[0_8px_18px_-18px_rgba(2,6,23,0.45)]"
                        : "shadow-none",
                    ].join(" ")}
                  >
                    <CardTitle className="flex items-start justify-between gap-3">
                      <div>
                        <span>{station.name}</span>
                        <div className="mt-0.5 text-[13px] font-normal text-muted-foreground">
                          {t("production.main.queues.backlog")}{" "}
                          {formatQueueDuration(metrics?.totalMinutes ?? 0)} |{" "}
                          {t("production.main.queues.late")}{" "}
                          <span
                            className={
                              (metrics?.lateCount ?? 0) > 0
                                ? "text-destructive"
                                : "text-foreground"
                            }
                          >
                            {metrics?.lateCount ?? 0}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("production.main.queues.queueCount", {
                          count: metrics?.queueCount ?? 0,
                        })}
                      </span>
                    </CardTitle>
                    <div className="mt-1 grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground">
                      <div>
                        {t("production.main.common.qty")}:{" "}
                        <span className="font-medium text-foreground">
                          {metrics?.totalQty ?? 0}
                        </span>
                      </div>
                      <div>
                        {t("production.main.queues.blocked")}:{" "}
                        <span className="font-medium text-foreground">
                          {metrics?.blockedCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent
                    className="space-y-2 scrollbar-subtle px-4 py-0 md:min-h-0 md:flex-1 md:overflow-y-auto"
                    onScroll={(event) => {
                      const nextScrolled = event.currentTarget.scrollTop > 4;
                      setScrolledColumns((prev) =>
                        prev[station.id] === nextScrolled
                          ? prev
                          : { ...prev, [station.id]: nextScrolled },
                      );
                    }}
                  >
                    {isLoading ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                        {t("production.main.queues.loading")}
                      </div>
                    ) : null}
                    {!isLoading && queue.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        {t("production.main.queues.noQueuedWork")}
                      </div>
                    ) : null}
                    {queueGroups.map((group) => (
                      <div key={group.key} className="space-y-2">
                        <div className="sticky top-0 z-1 -mx-1 rounded-md bg-background/95 px-1 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
                          {group.label}
                        </div>
                        {group.items.map((item) => {
                          const late = Boolean(
                            item.dueDate &&
                            item.dueDate <=
                              new Date().toISOString().slice(0, 10),
                          );
                          const checked = selectedQueueRunIds.includes(item.id);
                          return (
                            <div
                              key={item.id}
                              className={[
                                "rounded-xl border px-3 py-2 transition-colors",
                                item.status === "done"
                                  ? "border-emerald-200 bg-emerald-50/40"
                                  : "border-border bg-background",
                              ].join(" ")}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  variant="box"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedQueueRunIds((prev) =>
                                      checked
                                        ? prev.filter((id) => id !== item.id)
                                        : [...prev, item.id],
                                    )
                                  }
                                  className="mt-1"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-sm font-semibold leading-5">
                                      {item.orderNumber}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                                      <Badge
                                        variant={priorityBadge(item.priority)}
                                      >
                                        {t(
                                          `production.main.priority.${item.priority}`,
                                        )}
                                      </Badge>
                                      {late ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                          <AlertTriangleIcon className="h-3 w-3" />
                                          {t("production.main.queues.late")}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.customerName}
                                  </div>
                                  {item.trackingMode ===
                                    "construction_level" &&
                                  (item.unitType || item.unitName) ? (
                                    <div className="mt-1.5 space-y-0.5 text-[12px] leading-5">
                                      {item.unitType ? (
                                        <div className="text-muted-foreground">
                                          {item.unitType}
                                        </div>
                                      ) : null}
                                      {item.unitName ? (
                                        <div className="font-medium text-foreground">
                                          {item.unitName}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="mt-1.5">
                                    <Badge
                                      variant={statusBadge(item.status)}
                                      className="flex w-full justify-center px-2.5 py-0.5 text-[11px] font-semibold"
                                    >
                                      {t(
                                        `production.main.status.${item.status}`,
                                      )}
                                    </Badge>
                                  </div>
                                  <div className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                                    {t("production.main.common.due")}{" "}
                                    {formatDateInput(item.dueDate)} |{" "}
                                    {t("production.main.split.plannedDate")}{" "}
                                    {formatQueueGroupDate(item.plannedDate, t)}
                                  </div>
                                  <div className="text-[12px] leading-5 text-muted-foreground">
                                    {t("production.main.common.group")}{" "}
                                    {item.batchCode} |{" "}
                                    {t("production.main.common.qty")}{" "}
                                    {item.totalQty} |{" "}
                                    {t("production.main.queues.time")}{" "}
                                    {formatQueueDuration(
                                      Number(item.durationMinutes ?? 0),
                                    )}
                                  </div>
                                  {item.status === "done" && item.doneAt ? (
                                    <div className="text-[12px] leading-5 text-emerald-700">
                                      {t("production.main.common.done")}{" "}
                                      {formatDateInput(item.doneAt)}
                                    </div>
                                  ) : null}
                                  {(() => {
                                    if (
                                      item.trackingMode ===
                                      "construction_level"
                                    ) {
                                      return null;
                                    }
                                    const itemNames = item.items
                                      .map((row) => row.item_name?.trim())
                                      .filter(Boolean) as string[];
                                    const uniqueItemNames = Array.from(
                                      new Set(itemNames),
                                    );
                                    const customerName =
                                      item.customerName?.trim().toLowerCase() ??
                                      "";
                                    const materialName =
                                      item.material?.trim() ?? "";
                                    const detailsLabel =
                                      uniqueItemNames.join(", ") ||
                                      materialName ||
                                      "-";
                                    const shouldShowDetailsLabel =
                                      detailsLabel !== "-" &&
                                      detailsLabel.trim().toLowerCase() !==
                                        customerName;
                                    return shouldShowDetailsLabel ? (
                                      <div className="mt-1.5 line-clamp-2 text-[12px] leading-5">
                                        {detailsLabel}
                                      </div>
                                    ) : null;
                                  })()}
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="default"
                                      className="h-7 w-7"
                                      title={t(
                                        "production.main.queues.replanRows",
                                      )}
                                      aria-label={t(
                                        "production.main.queues.replanRows",
                                      )}
                                      onClick={() =>
                                        handleOpenQueueReplan(
                                          item,
                                          station.name,
                                        )
                                      }
                                      disabled={!canManageQueue}
                                    >
                                      <RefreshCcwIcon className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      asChild
                                      variant="secondary"
                                      size="icon"
                                      className="h-7 w-7"
                                      title={t(
                                        "production.main.queues.jobDetail",
                                      )}
                                    >
                                      <Link
                                        href={`/production/jobs/${item.orderId}`}
                                        aria-label={t(
                                          "production.main.queues.jobDetail",
                                        )}
                                      >
                                        <FileTextIcon className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                    <Button
                                      asChild
                                      variant="outline"
                                      size="icon"
                                      className="h-7 w-7"
                                      title={t("production.main.common.order")}
                                    >
                                      <Link
                                        href={`/orders/${item.orderId}`}
                                        aria-label={t(
                                          "production.main.common.order",
                                        )}
                                      >
                                        <ExternalLinkIcon className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <ProductionSplitPlanner
        open={isSplitPlannerOpen}
        mode="replan"
        rows={splitRows}
        stations={splitStations.length > 0 ? splitStations : stations}
        selections={splitSelections}
        plannedDates={splitPlannedDates}
        globalDate={splitGlobalDate}
        submitting={isReplanning}
        onClose={() => {
          if (!isReplanning) {
            setIsSplitPlannerOpen(false);
            setSplitStations([]);
          }
        }}
        onSelectionChange={(rowId, stationIds) =>
          setSplitSelections((prev) => ({ ...prev, [rowId]: stationIds }))
        }
        onDateChange={(rowId, value) =>
          setSplitPlannedDates((prev) => ({ ...prev, [rowId]: value }))
        }
        onGlobalDateChange={(value) => {
          setSplitGlobalDate(value);
          setSplitPlannedDates((prev) => {
            const next = { ...prev };
            splitRows.forEach((row) => {
              if (!row.locked) {
                next[row.id] = value;
              }
            });
            return next;
          });
        }}
        onSubmit={() => void handleConfirmReplan()}
      />
    </div>
  );
}
