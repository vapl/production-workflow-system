"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, endOfWeek, format, isValid, parseISO, startOfWeek } from "date-fns";
import type { WeekNumberProps } from "react-day-picker";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  Layers3Icon,
  SearchIcon,
  SettingsIcon,
  Users2Icon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { Input } from "@/components/ui/Input";
import { Calendar } from "@/components/ui/Calendar";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ProductionSettingsBridgeModal } from "@/components/production/ProductionSettingsBridgeModal";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { Tooltip } from "@/components/ui/Tooltip";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import { useSettingsData } from "@/hooks/useSettingsData";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import type { BatchRunRow, ProductionPriority } from "@/types/production";
import { Tabs } from "@/components/ui/Tabs";

type InProgressRunRow = {
  id: string;
  order_id: string | null;
  station_id: string | null;
  batch_code: string | null;
  status: BatchRunRow["status"];
  started_at: string | null;
  duration_minutes: number | null;
  orders: BatchRunRow["orders"];
};

type InProgressItemRow = {
  order_id: string;
  batch_code: string | null;
  station_id: string | null;
  meta?: Record<string, unknown> | null;
};

type InProgressOrderItemRow = {
  id: string;
  order_id: string;
  position: string | null;
  source_row_id: string | null;
};

type RunSummary = {
  id: string;
  positionLabel: string;
  stationName: string;
  orderNumber: string;
  customerName: string;
  dueDate: string | null;
  priority: ProductionPriority;
  status: NonNullable<InProgressRunRow["status"]>;
  startedAt: string | null;
  durationMinutes: number | null;
  orderId: string | null;
};

function priorityBadge(priority: ProductionPriority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function statusBadge(status: NonNullable<InProgressRunRow["status"]>) {
  if (status === "blocked") return "status-blocked";
  if (status === "paused") return "status-paused";
  if (status === "pending") return "status-pending";
  if (status === "in_progress") return "status-in_progress";
  return "status-draft";
}

function formatDateInput(value: string | null) {
  if (!value) return "-";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "-";
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return formatDateInput(value);
  }
  return format(parsed, "dd.MM.yyyy HH:mm");
}

function formatDurationMinutes(value: number | null) {
  if (!value || value <= 0) return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatProductionValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  return null;
}

function getProductionItemSourceKey(item: InProgressItemRow) {
  const meta = item.meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const sourceRowId = meta.sourceRowId;
  if (typeof sourceRowId === "string" && sourceRowId.trim().length > 0) {
    return sourceRowId.trim();
  }
  const rowKey = meta.rowKey;
  return typeof rowKey === "string" && rowKey.trim().length > 0
    ? rowKey.trim()
    : null;
}

function getProductionItemPosition(item: InProgressItemRow) {
  const meta = item.meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const row =
    typeof meta.row === "object" &&
    meta.row !== null &&
    !Array.isArray(meta.row)
      ? (meta.row as Record<string, unknown>)
      : null;
  return (
    formatProductionValue(row?.position) ??
    formatProductionValue(row?.pozicija) ??
    formatProductionValue(row?.["pozīcija"]) ??
    formatProductionValue(meta.position)
  );
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

function formatStationLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function ProductionInProgressPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { workStations } = useSettingsData();
  const supabaseUnavailable = !supabase;
  const todayIso = new Date().toISOString().slice(0, 10);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "in_progress" | "paused" | "blocked"
  >("all");
  const [dateMode, setDateMode] = useState<"day" | "week">("week");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [runs, setRuns] = useState<InProgressRunRow[]>([]);
  const [items, setItems] = useState<InProgressItemRow[]>([]);
  const [orderItems, setOrderItems] = useState<InProgressOrderItemRow[]>([]);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const hideMobileFloatingControls = useHideMobileFloatingControls();

  useEffect(() => {
    if (supabaseUnavailable) {
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

      const [runsResult, itemsResult, orderItemsResult] = await Promise.all([
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, status, started_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .in("status", ["pending", "in_progress", "paused", "blocked"])
          .order("started_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        sb
          .from("production_items")
          .select("order_id, batch_code, station_id, meta")
          .order("created_at", { ascending: false }),
        sb
          .from("order_items")
          .select("id, order_id, position, source_row_id")
          .order("created_at", { ascending: true }),
      ]);

      if (!isMounted) {
        return;
      }

      if (runsResult.error || itemsResult.error || orderItemsResult.error) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      setRuns(
        (runsResult.data ?? []).map((row) => ({
          ...(row as Omit<InProgressRunRow, "orders">),
          orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
        })),
      );
      setItems((itemsResult.data ?? []) as InProgressItemRow[]);
      setOrderItems((orderItemsResult.data ?? []) as InProgressOrderItemRow[]);
      setIsLoading(false);
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [supabaseUnavailable, t]);

  const stationNameById = useMemo(
    () =>
      new Map(
        workStations.map((station) => [
          station.id,
          station.name || formatStationLabel(station.id),
        ]),
      ),
    [workStations],
  );

  const positionBySourceKey = useMemo(() => {
    const map = new Map<string, string>();
    orderItems.forEach((item) => {
      const position = formatProductionValue(item.position);
      if (!position) {
        return;
      }
      map.set(`${item.order_id}:${item.id}`, position);
      if (item.source_row_id) {
        map.set(`${item.order_id}:${item.source_row_id}`, position);
      }
    });
    return map;
  }, [orderItems]);

  const positionsByRunKey = useMemo(() => {
    const exactMap = new Map<string, string[]>();
    const batchMap = new Map<string, string[]>();
    const appendUnique = (
      map: Map<string, string[]>,
      key: string,
      value: string,
    ) => {
      const current = map.get(key) ?? [];
      if (!current.includes(value)) {
        current.push(value);
      }
      map.set(key, current);
    };

    items.forEach((item) => {
      const sourceKey = getProductionItemSourceKey(item);
      const position =
        getProductionItemPosition(item) ||
        (sourceKey
          ? positionBySourceKey.get(`${item.order_id}:${sourceKey}`)
          : null);
      if (!position) {
        return;
      }
      appendUnique(
        exactMap,
        `${item.order_id}:${item.batch_code ?? ""}:${item.station_id ?? ""}`,
        position,
      );
      appendUnique(
        batchMap,
        `${item.order_id}:${item.batch_code ?? ""}`,
        position,
      );
    });

    return { exactMap, batchMap };
  }, [items, positionBySourceKey]);

  const summaries = useMemo<RunSummary[]>(() => {
    return runs.map((run) => {
      const order = run.orders;
      const priority =
        order?.priority === "low" ||
        order?.priority === "normal" ||
        order?.priority === "high" ||
        order?.priority === "urgent"
          ? order.priority
          : "normal";
      const exactNames = run.order_id
        ? positionsByRunKey.exactMap.get(
            `${run.order_id}:${run.batch_code ?? ""}:${run.station_id ?? ""}`,
          )
        : undefined;
      const batchNames = run.order_id
        ? positionsByRunKey.batchMap.get(
            `${run.order_id}:${run.batch_code ?? ""}`,
          )
        : undefined;
      const positions = exactNames?.length ? exactNames : batchNames;
      const positionLabel = positions?.length
        ? positions.slice(0, 3).join(", ") +
          (positions.length > 3 ? ` +${positions.length - 3}` : "")
        : "-";

      return {
        id: run.id,
        positionLabel,
        stationName:
          (run.station_id && stationNameById.get(run.station_id)) ||
          (run.station_id ? formatStationLabel(run.station_id) : "-"),
        orderNumber: order?.order_number ?? "-",
        customerName: order?.customer_name ?? "-",
        dueDate: order?.production_due_date ?? order?.due_date ?? null,
        priority,
        status: run.status ?? "pending",
        startedAt: run.started_at,
        durationMinutes: run.duration_minutes,
        orderId: run.order_id,
      };
    });
  }, [positionsByRunKey, runs, stationNameById]);

  const filteredSummaries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const baseDate = parseISO(selectedDate);
    const selectedDay = isValid(baseDate) ? format(baseDate, "yyyy-MM-dd") : todayIso;
    const weekStart = isValid(baseDate)
      ? format(startOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
      : todayIso;
    const weekEnd = isValid(baseDate)
      ? format(endOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
      : format(addDays(parseISO(todayIso), 6), "yyyy-MM-dd");

    return summaries.filter((summary) => {
      if (statusFilter !== "all" && summary.status !== statusFilter) {
        return false;
      }
      const isLate = Boolean(
        summary.dueDate && summary.dueDate.slice(0, 10) <= todayIso,
      );
      const dueDate = summary.dueDate?.slice(0, 10) ?? null;
      if (dateMode === "day" && dueDate && dueDate !== selectedDay) {
        return false;
      }
      if (dateMode === "week" && dueDate && (dueDate < weekStart || dueDate > weekEnd)) {
        return false;
      }
      if (overdueOnly && !isLate) {
        return false;
      }
      if (blockedOnly && summary.status !== "blocked") {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const haystack = [
        summary.orderNumber,
        summary.customerName,
        summary.stationName,
        summary.positionLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [blockedOnly, dateMode, overdueOnly, search, selectedDate, statusFilter, summaries, todayIso]);

  const statusOptions = useMemo(
    () =>
      ([
        { value: "all", label: t("production.main.common.all") },
        {
          value: "pending",
          label: t("production.main.inProgress.statuses.pending"),
        },
        {
          value: "in_progress",
          label: t("production.main.inProgress.statuses.in_progress"),
        },
        {
          value: "paused",
          label: t("production.main.inProgress.statuses.paused"),
        },
        {
          value: "blocked",
          label: t("production.main.inProgress.statuses.blocked"),
        },
      ] as const).map((option) => ({
        ...option,
        count:
          option.value === "all"
            ? summaries.length
            : summaries.filter((summary) => summary.status === option.value)
                .length,
      })),
    [summaries, t],
  );

  const metrics = useMemo(() => {
    const blockedRuns = summaries.filter(
      (run) => run.status === "blocked",
    ).length;
    const dueNow = summaries.filter(
      (summary) => summary.dueDate && summary.dueDate.slice(0, 10) <= todayIso,
    ).length;
    const uniqueOrders = new Set(
      summaries.map((summary) => summary.orderId).filter(Boolean),
    ).size;
    return {
      activeOrders: uniqueOrders,
      activeRuns: summaries.length,
      blockedRuns,
      dueNow,
    };
  }, [summaries, todayIso]);

  const productionNavTabs = [
    {
      value: "ready",
      label: t("production.main.subnav.ready"),
    },
    {
      value: "inProgress",
      label: t("production.main.subnav.inProduction"),
    },
  ] as const;

  const handleProductionNavChange = (value: string) => {
    switch (value) {
      case "ready":
        router.push("/production/ready");
        return;
      case "inProgress":
      default:
        router.push("/production/in-progress");
    }
  };

  const closeMobileSearch = useCallback(() => {
    setIsMobileSearchOpen(false);
  }, []);

  const openMobileSearch = useCallback(() => {
    setIsMobileSearchOpen(true);
    window.setTimeout(() => {
      mobileSearchInputRef.current?.focus();
    }, 50);
  }, []);

  const selectedDateValue = useMemo(() => {
    const parsed = parseISO(selectedDate);
    return isValid(parsed) ? parsed : new Date();
  }, [selectedDate]);

  const selectedDateLabel = useMemo(() => {
    if (dateMode === "day") {
      return format(selectedDateValue, "dd.MM.yyyy");
    }
    const weekStart = startOfWeek(selectedDateValue, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDateValue, { weekStartsOn: 1 });
    return `${format(weekStart, "dd.MM")} - ${format(weekEnd, "dd.MM")}`;
  }, [dateMode, selectedDateValue]);

  const selectedWeekRange = useMemo(
    () => ({
      from: startOfWeek(selectedDateValue, { weekStartsOn: 1 }),
      to: endOfWeek(selectedDateValue, { weekStartsOn: 1 }),
    }),
    [selectedDateValue],
  );

  const selectedWeekStartIso = useMemo(
    () => format(selectedWeekRange.from, "yyyy-MM-dd"),
    [selectedWeekRange],
  );

  const CalendarWeekNumber = useCallback(
    ({ week, className, ...props }: WeekNumberProps) => {
      const firstDay = week.days[0]?.date;
      if (!firstDay) {
        return <th className={className} {...props} />;
      }

      const weekStartIso = format(
        startOfWeek(firstDay, { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      const isActive = dateMode === "week" && weekStartIso === selectedWeekStartIso;

      return (
        <th className={className} {...props}>
          <button
            type="button"
            onClick={() => {
              setSelectedDate(weekStartIso);
              setDatePickerOpen(false);
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-md text-[0.75rem] font-medium transition ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
            aria-pressed={isActive}
          >
            {week.weekNumber}
          </button>
        </th>
      );
    },
    [dateMode, selectedWeekStartIso],
  );

  const datePickerControl = (compact = false) => (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        className={
          compact
            ? "h-9 w-55 rounded-full px-3 text-xs font-medium"
            : "h-12 w-full rounded-full px-4 text-sm font-medium"
        }
        onClick={() => setDatePickerOpen((current) => !current)}
      >
        <span className="truncate">{selectedDateLabel}</span>
        <CalendarIcon className="h-4 w-4" />
      </Button>
      {datePickerOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-85 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="space-y-3 border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              {(
                [
                  { value: "day", label: t("production.main.range.days1") },
                  { value: "week", label: t("production.main.range.week") },
                ] as const
              ).map((option) => {
                const active = dateMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDateMode(option.value)}
                    className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                      active
                        ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("production.main.inProgress.dateHint")}
            </div>
          </div>
          {dateMode === "day" ? (
            <Calendar
              mode="single"
              className="w-full"
              classNames={{
                root: "relative p-0",
                month: "space-y-3 px-3 pb-3",
                month_caption:
                  "relative flex min-h-10 items-center justify-center pt-2",
                nav: "absolute left-0 top-0 z-10 flex w-full items-center justify-between px-3 pt-2",
              }}
              selected={selectedDateValue}
              onSelect={(date: Date | undefined) => {
                if (!date) {
                  return;
                }
                setSelectedDate(format(date, "yyyy-MM-dd"));
                setDatePickerOpen(false);
              }}
              initialFocus
            />
          ) : (
            <Calendar
              mode="range"
              className="w-full"
              classNames={{
                root: "relative p-0",
                month: "space-y-3 px-3 pb-3",
                month_caption:
                  "relative flex min-h-10 items-center justify-center pt-2",
                nav: "absolute left-0 top-0 z-10 flex w-full items-center justify-between px-3 pt-2",
                day_button:
                  "h-9 w-9 rounded-md p-0 font-normal pointer-events-none",
                selected:
                  "[&>button]:bg-transparent [&>button]:text-foreground",
                range_middle:
                  "bg-primary/10 [&>button]:rounded-none [&>button]:bg-primary/20 [&>button]:text-foreground [&>button]:hover:bg-primary/20",
                range_start:
                  "rounded-l-md bg-primary/10 ring-1 ring-inset ring-primary/20 [&>button]:rounded-l-md [&>button]:rounded-r-none [&>button]:bg-primary/20 [&>button]:text-foreground [&>button]:hover:bg-primary/20",
                range_end:
                  "rounded-r-md bg-primary/10 ring-1 ring-inset ring-primary/20 [&>button]:rounded-r-md [&>button]:rounded-l-none [&>button]:bg-primary/20 [&>button]:text-foreground [&>button]:hover:bg-primary/20",
              }}
              selected={selectedWeekRange}
              components={{
                WeekNumber: CalendarWeekNumber,
              }}
              initialFocus
            />
          )}
        </div>
      ) : null}
    </div>
  );

  const filtersPanel = (
    <div className="space-y-3">
      <FilterOptionSelector
        title={t("production.main.inProgress.statusTitle")}
        value={statusFilter}
        onChange={(value) => setStatusFilter(value)}
        options={statusOptions}
      />
      <div className="h-px bg-border/70" />
      <div className="space-y-2">
        <div className="text-sm font-medium">
          {t("production.main.inProgress.quickFilters")}
        </div>
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={overdueOnly}
            onChange={() => setOverdueOnly((current) => !current)}
            label={t("production.main.inProgress.overdueOnly")}
          />
          <Checkbox
            checked={blockedOnly}
            onChange={() => setBlockedOnly((current) => !current)}
            label={t("production.main.inProgress.blockedOnly")}
          />
        </div>
      </div>
    </div>
  );

  return (
    <Tabs
      value="inProgress"
      onValueChange={handleProductionNavChange}
      className="space-y-0 md:space-y-4"
    >
      <section className="relative flex flex-col gap-4 pb-28 pt-16 md:pb-0 md:pt-0">
        <DesktopPageHeader
          sticky
          title={t("production.main.subnav.inProduction")}
          subtitle={t("production.main.inProgress.headerSubtitle")}
          actions={
            <DetailTabsBar
              tabs={productionNavTabs.map((tab) => ({
                value: tab.value,
                label: tab.label,
              }))}
              className="min-w-0 flex-1 py-0"
            />
          }
        />
        <MobilePageTitle
          title={t("production.main.subnav.inProduction")}
          subtitle={t("production.main.inProgress.mobileSubtitle")}
          showCompact={false}
          className="pb-6 pt-6"
        />

        <div className="hidden md:flex md:items-center md:justify-end md:gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/production/queues">
                <Layers3Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.queues")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/production/operators">
                <Users2Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.operators")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("production.main.subnav.settings")}
              onClick={() => setIsSettingsModalOpen(true)}
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ProductionStatCard
            label={t("production.main.inProgress.activeOrders")}
            value={metrics.activeOrders}
            hint={t("production.main.inProgress.activeOrdersHint")}
            icon={<ClipboardListIcon className="h-4 w-4" />}
          />
          <ProductionStatCard
            label={t("production.main.inProgress.activeRuns")}
            value={metrics.activeRuns}
            hint={t("production.main.inProgress.activeRunsHint")}
            icon={<Layers3Icon className="h-4 w-4" />}
          />
          <ProductionStatCard
            label={t("production.main.inProgress.blockedRuns")}
            value={metrics.blockedRuns}
            hint={t("production.main.inProgress.blockedRunsHint")}
            tone="warning"
            icon={<AlertTriangleIcon className="h-4 w-4" />}
          />
          <ProductionStatCard
            label={t("production.main.inProgress.dueNow")}
            value={metrics.dueNow}
            hint={t("production.main.inProgress.dueNowHint")}
            tone="danger"
            icon={<AlertTriangleIcon className="h-4 w-4" />}
          />
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardContent className="space-y-4 pt-4">
            {supabaseUnavailable ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                {t("production.main.errors.supabaseNotConfigured")}
              </div>
            ) : null}

            {dataError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                {dataError}
              </div>
            ) : null}

            <div className="hidden rounded-2xl border border-border bg-muted/10 p-4 md:block">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <Input
                    icon="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t(
                      "production.main.inProgress.searchPlaceholder",
                    )}
                    className="h-10"
                  />
                </div>
                <div className="flex items-center gap-2 xl:ml-auto">
                  {datePickerControl(true)}
                  <FiltersDropdown contentClassName="w-[320px] p-4">
                    {filtersPanel}
                  </FiltersDropdown>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                  {t("production.main.common.loading")}
                </div>
              ) : null}

              {!isLoading ? (
                <>
                  <div className="hidden overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm md:block">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-muted/30">
                          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.order")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.position")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.customer")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.stations")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.startedAt")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.duration")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.dueDate")}
                            </th>
                            <th className="px-4 py-3 font-medium">
                              {t("production.main.inProgress.statusTitle")}
                            </th>
                            <th className="px-4 py-3 font-medium text-right">
                              {t("production.main.common.actions")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaries.map((summary) => {
                            const dueDateIso = summary.dueDate?.slice(0, 10) ?? null;
                            const isLate = Boolean(dueDateIso && dueDateIso <= todayIso);
                            const isToday = dueDateIso === todayIso;

                            return (
                              <tr
                                key={summary.id}
                                className="border-b border-border/60 align-top last:border-b-0 hover:bg-muted/20"
                              >
                                <td className="px-4 py-4">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-foreground">
                                      {summary.orderNumber}
                                    </div>
                                    <Badge variant={priorityBadge(summary.priority)}>
                                      {t(
                                        `production.main.priority.${summary.priority}`,
                                      )}
                                    </Badge>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-foreground/85">
                                  {summary.positionLabel}
                                </td>
                                <td className="px-4 py-4 text-foreground/85">
                                  {summary.customerName}
                                </td>
                                <td className="px-4 py-4 text-foreground/85">
                                  {summary.stationName}
                                </td>
                                <td className="px-4 py-4 text-foreground/85">
                                  {formatDateTimeInput(summary.startedAt)}
                                </td>
                                <td className="px-4 py-4 text-foreground/85">
                                  {formatDurationMinutes(summary.durationMinutes)}
                                </td>
                                <td className="px-4 py-4">
                                  <div
                                    className={`space-y-1 ${
                                      isLate
                                        ? "text-destructive"
                                        : isToday
                                          ? "text-orange-600"
                                          : "text-foreground/85"
                                    }`}
                                  >
                                    <div className="font-medium">
                                      {formatDateInput(summary.dueDate)}
                                    </div>
                                    {isLate ? (
                                      <div className="inline-flex items-center gap-1 text-xs font-medium">
                                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                                        {t("production.main.inProgress.dueNow")}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <Badge variant={statusBadge(summary.status)}>
                                    {t(
                                      `production.main.inProgress.statuses.${summary.status}`,
                                    )}
                                  </Badge>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex justify-end gap-2">
                                    <Tooltip
                                      content={t("production.main.inProgress.viewJob")}
                                      side="top"
                                      interaction="hover"
                                    >
                                      <Button
                                        asChild={Boolean(summary.orderId)}
                                        size="icon"
                                        disabled={!summary.orderId}
                                      >
                                        {summary.orderId ? (
                                          <Link
                                            href={`/production/jobs/${summary.orderId}`}
                                            aria-label={t(
                                              "production.main.inProgress.viewJob",
                                            )}
                                          >
                                            <ClipboardListIcon className="h-4.5 w-4.5" />
                                          </Link>
                                        ) : (
                                          <span>
                                            <ClipboardListIcon className="h-4.5 w-4.5" />
                                          </span>
                                        )}
                                      </Button>
                                    </Tooltip>
                                    <Tooltip
                                      content={t("production.main.inProgress.openOrder")}
                                      side="top"
                                      interaction="hover"
                                    >
                                      <Button
                                        asChild={Boolean(summary.orderId)}
                                        variant="secondary"
                                        size="icon"
                                        disabled={!summary.orderId}
                                      >
                                        {summary.orderId ? (
                                          <Link
                                            href={`/orders/${summary.orderId}`}
                                            aria-label={t(
                                              "production.main.inProgress.openOrder",
                                            )}
                                          >
                                            <ExternalLinkIcon className="h-4.5 w-4.5" />
                                          </Link>
                                        ) : (
                                          <span>
                                            <ExternalLinkIcon className="h-4.5 w-4.5" />
                                          </span>
                                        )}
                                      </Button>
                                    </Tooltip>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-4 md:hidden">
                    {filteredSummaries.map((summary) => {
                      const isLate = Boolean(
                        summary.dueDate && summary.dueDate.slice(0, 10) <= todayIso,
                      );

                      return (
                        <div
                          key={summary.id}
                          className="rounded-2xl border border-border/80 bg-background p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-lg font-semibold leading-none">
                                  {summary.orderNumber}
                                </div>
                                <Badge variant={priorityBadge(summary.priority)}>
                                  {t(
                                    `production.main.priority.${summary.priority}`,
                                  )}
                                </Badge>
                                <Badge variant={statusBadge(summary.status)}>
                                  {t(
                                    `production.main.inProgress.statuses.${summary.status}`,
                                  )}
                                </Badge>
                                {isLate ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                    <AlertTriangleIcon className="h-3 w-3" />
                                    {t("production.main.inProgress.dueNow")}
                                  </span>
                                ) : null}
                              </div>

                              <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.16em]">
                                    {t("production.main.inProgress.customer")}
                                  </div>
                                  <div className="mt-1 text-sm text-foreground/85">
                                    {summary.customerName}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.16em]">
                                    {t("production.main.inProgress.dueDate")}
                                  </div>
                                  <div className="mt-1 text-sm text-foreground/85">
                                    {formatDateInput(summary.dueDate)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.16em]">
                                    {t("production.main.inProgress.stations")}
                                  </div>
                                  <div className="mt-1 text-sm text-foreground/85">
                                    {summary.stationName}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.16em]">
                                    {t("production.main.inProgress.position")}
                                  </div>
                                  <div className="mt-1 text-sm text-foreground/85">
                                    {summary.positionLabel}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                              <Tooltip
                                content={t("production.main.inProgress.viewJob")}
                                side="top"
                                interaction="hover"
                              >
                                <Button
                                  asChild={Boolean(summary.orderId)}
                                  size="icon"
                                  disabled={!summary.orderId}
                                >
                                  {summary.orderId ? (
                                    <Link
                                      href={`/production/jobs/${summary.orderId}`}
                                      aria-label={t(
                                        "production.main.inProgress.viewJob",
                                      )}
                                    >
                                      <ClipboardListIcon className="h-4.5 w-4.5" />
                                    </Link>
                                  ) : (
                                    <span>
                                      <ClipboardListIcon className="h-4.5 w-4.5" />
                                    </span>
                                  )}
                                </Button>
                              </Tooltip>
                              <Tooltip
                                content={t("production.main.inProgress.openOrder")}
                                side="top"
                                interaction="hover"
                              >
                                <Button
                                  asChild={Boolean(summary.orderId)}
                                  variant="secondary"
                                  size="icon"
                                  disabled={!summary.orderId}
                                >
                                  {summary.orderId ? (
                                    <Link
                                      href={`/orders/${summary.orderId}`}
                                      aria-label={t(
                                        "production.main.inProgress.openOrder",
                                      )}
                                    >
                                      <ExternalLinkIcon className="h-4.5 w-4.5" />
                                    </Link>
                                  ) : (
                                    <span>
                                      <ExternalLinkIcon className="h-4.5 w-4.5" />
                                    </span>
                                  )}
                                </Button>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            {!isLoading && filteredSummaries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                {t("production.main.inProgress.noOrders")}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isMobileSearchOpen ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[1.5px] md:hidden">
            <div className="w-full px-4 pb-[calc(env(safe-area-inset-bottom)-2px)]">
              <div className="flex items-center gap-2">
                <Input
                  ref={mobileSearchInputRef}
                  type="search"
                  autoFocus
                  icon="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t(
                    "production.main.inProgress.searchPlaceholder",
                  )}
                  enterKeyHint="search"
                  className="h-12 text-[16px]"
                  wrapperClassName="rounded-full border-border bg-background shadow-lg"
                />
                <button
                  type="button"
                  onClick={closeMobileSearch}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg"
                  aria-label={t("production.main.common.close")}
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="fixed inset-0 -z-10 h-full w-full"
              aria-label={t("production.main.common.close")}
              onClick={closeMobileSearch}
            />
          </div>
        ) : null}

        <BottomSheet
          open={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          ariaLabel={t("production.main.common.actions")}
          title={t("production.main.common.actions")}
          closeButtonLabel={t("production.main.common.close")}
          keyboardAware
          enableSwipeToClose
        >
          <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
            <Button
              asChild
              variant="outline"
              className="h-12 w-full justify-start rounded-2xl"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <Link href="/production/ready">
                {t("production.main.subnav.ready")}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 w-full justify-start rounded-2xl"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <Link href="/production/queues">
                <Layers3Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.queues")}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 w-full justify-start rounded-2xl"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <Link href="/production/operators">
                <Users2Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.operators")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-2xl"
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsSettingsModalOpen(true);
              }}
            >
              <SettingsIcon className="mr-2 h-4 w-4" />
              {t("production.main.subnav.settings")}
            </Button>
          </div>
        </BottomSheet>

        <div
          className={`fixed inset-x-4 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-30 transition-all duration-200 md:hidden ${
            hideMobileFloatingControls
              ? "translate-y-16 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-end justify-between gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={openMobileSearch}
              aria-label={t("production.main.common.search")}
            >
              <SearchIcon className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="h-12 rounded-full bg-card px-4 shadow-lg"
                onClick={() => setIsMobileFiltersOpen(true)}
              >
                {t("production.main.common.filters")}
              </Button>

              <Button
                variant="outline"
                className="h-12 rounded-full bg-card px-4 shadow-lg"
                onClick={() => setIsMobileNavOpen(true)}
              >
                <Layers3Icon className="mr-2 h-4 w-4" />
                {t("production.main.common.actions")}
              </Button>
            </div>
          </div>
        </div>

        <BottomSheet
          open={isMobileFiltersOpen}
          onClose={() => setIsMobileFiltersOpen(false)}
          ariaLabel={t("production.main.common.filters")}
          title={t("production.main.common.filters")}
          closeButtonLabel={t("production.main.common.close")}
          keyboardAware
          enableSwipeToClose
        >
          <div className="space-y-4 overflow-y-auto px-4 pb-4 pt-3">
            {datePickerControl()}
            {filtersPanel}
          </div>
        </BottomSheet>

        <ProductionSettingsBridgeModal
          open={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          t={t}
        />
      </section>
    </Tabs>
  );
}
