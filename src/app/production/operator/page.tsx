"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { QrScannerModal } from "@/components/qr/QrScannerModal";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { formatDate } from "@/lib/domain/formatters";
import { isOrderProductionComplete } from "@/lib/domain/productionCompletion";
import { transitionBatchRunStatus } from "@/lib/domain/transitionBatchRunStatus";
import { type ResolveScanTargetResult } from "@/lib/qr/resolveScanTarget";
import {
  computeWorkingMinutes,
  parseWorkingCalendar,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n/useI18n";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  LogOutIcon,
  QrCodeIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UserCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Clock3Icon,
  ActivityIcon,
  XIcon,
} from "lucide-react";

type Priority = "low" | "normal" | "high" | "urgent";
type StationTrackingMode =
  | "construction_level"
  | "order_level"
  | "receipt_only";

type Station = {
  id: string;
  name: string;
  sortOrder: number;
  trackingMode: StationTrackingMode;
};

type ProductionItemRow = {
  id: string;
  order_id: string;
  batch_code: string;
  item_name: string;
  qty: number;
  material: string | null;
  status: "queued" | "pending" | "in_progress" | "paused" | "blocked" | "done";
  station_id: string | null;
  meta?: Record<string, unknown> | null;
  started_at?: string | null;
  done_at?: string | null;
  duration_minutes?: number | null;
  created_at?: string | null;
};

function getProductionItemRowIndex(item: ProductionItemRow) {
  if (!item.meta || typeof item.meta !== "object") {
    return null;
  }
  const raw = (item.meta as Record<string, unknown>).rowIndex;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type BatchRunRow = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  route_key: string;
  step_index: number;
  status: "queued" | "pending" | "in_progress" | "paused" | "blocked" | "done";
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

type StationDependencyRow = {
  id: string;
  station_id: string;
  depends_on_station_id: string;
};

type OrderAttachmentRow = {
  id: string;
  order_id: string;
  name: string;
  url: string | null;
  created_at: string | null;
  size: number | null;
  mime_type: string | null;
  category: string | null;
};

type QueueItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: Priority;
  status: BatchRunRow["status"];
  plannedDate: string | null;
  batchCode: string;
  totalQty: number;
  material: string;
  attachments: OrderAttachmentRow[];
  startedAt?: string | null;
  doneAt?: string | null;
  items: ProductionItemRow[];
  trackingMode: StationTrackingMode;
};

type PendingAction = {
  itemId: string;
  action: "in_progress" | "done" | "paused" | "blocked";
};
type PendingRunAction = {
  runId: string;
  action: "in_progress" | "done" | "paused" | "blocked";
};

type QueueStatusFilter = "all" | BatchRunRow["status"];

type StatusEventRow = {
  id: string;
  production_item_id: string | null;
  order_id: string | null;
  batch_run_id: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
};

function priorityBadge(priority: Priority) {
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

function normalizeTrackingMode(value: unknown): StationTrackingMode {
  if (value === "order_level" || value === "receipt_only") {
    return value;
  }
  return "construction_level";
}

function isFuturePlannedDate(plannedDate: string | null | undefined) {
  if (!plannedDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return plannedDate > today;
}

function getItemGroupKey(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const rowKey =
    meta && typeof meta.rowKey === "string" ? meta.rowKey : undefined;
  const fieldLabel =
    meta && typeof meta.fieldLabel === "string" ? meta.fieldLabel : "";
  const rowIndex =
    meta &&
    (typeof meta.rowIndex === "number" || typeof meta.rowIndex === "string")
      ? String(meta.rowIndex)
      : "";
  const fallback = `${item.item_name}|${fieldLabel}|${rowIndex}`;
  return `${item.order_id}|${item.batch_code}|${rowKey ?? fallback}`;
}

function pickLatestItem(
  current: ProductionItemRow | undefined,
  candidate: ProductionItemRow,
) {
  if (!current) return candidate;
  const currentTime = current.created_at ? Date.parse(current.created_at) : 0;
  const candidateTime = candidate.created_at
    ? Date.parse(candidate.created_at)
    : 0;
  if (candidateTime > currentTime) {
    return candidate;
  }
  return current;
}

function formatDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getStoragePathFromUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    return url;
  }
  return url.slice(index + marker.length);
}

function renderAttachmentIcon(attachment: OrderAttachmentRow) {
  const name = attachment.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isImage =
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp");

  if (isPdf) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <FileTextIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
      <FileIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export default function OperatorProductionPage() {
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const { rules } = useWorkflowRules();
  const { signOut } = useAuthActions();
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedDateParam = searchParams.get("date") || today;
  const stationFilter = searchParams.get("station");
  const orderFilter = searchParams.get("order");
  const [selectedDate, setSelectedDate] = useState(selectedDateParam);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>(
    (searchParams.get("status") as QueueStatusFilter) || "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>(
    (searchParams.get("priority") as "all" | Priority) || "all",
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [onlyBlocked, setOnlyBlocked] = useState(
    searchParams.get("blocked") === "1",
  );
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [quickActionOrderId, setQuickActionOrderId] = useState<string | null>(
    null,
  );
  const [quickActionItemId, setQuickActionItemId] = useState<string | null>(
    null,
  );
  const [quickActionRowIndex, setQuickActionRowIndex] = useState<number | null>(
    null,
  );
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const hideMobileFloatingControls = useHideMobileFloatingControls();
  const isWarehouseQueueView = pathname.startsWith("/warehouse");
  const cacheKey =
    currentUser.id && selectedDate && !orderFilter
      ? `pws_operator_cache_${currentUser.id}_${selectedDate}`
      : "";
  const [stations, setStations] = useState<Station[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [stationDependencies, setStationDependencies] = useState<
    StationDependencyRow[]
  >([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [attachments, setAttachments] = useState<OrderAttachmentRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [signingJobs, setSigningJobs] = useState<Set<string>>(new Set());
  const [expandedOrderItems, setExpandedOrderItems] = useState<Set<string>>(
    new Set(),
  );
  const [workingCalendar, setWorkingCalendar] = useState<WorkingCalendar>({
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "17:00" }],
  });
  const [stopReasons, setStopReasons] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [blockedRunId, setBlockedRunId] = useState<string | null>(null);
  const [blockedItemId, setBlockedItemId] = useState<string | null>(null);
  const [blockedReasonId, setBlockedReasonId] = useState<string>("");
  const [blockedReasonText, setBlockedReasonText] = useState<string>("");
  const [pausedRunId, setPausedRunId] = useState<string | null>(null);
  const [pausedItemId, setPausedItemId] = useState<string | null>(null);
  const [pausedReasonId, setPausedReasonId] = useState<string>("");
  const [pausedReasonText, setPausedReasonText] = useState<string>("");
  const [pausedReasonError, setPausedReasonError] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [pendingRunAction, setPendingRunAction] =
    useState<PendingRunAction | null>(null);
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activityEvents, setActivityEvents] = useState<StatusEventRow[]>([]);
  const [activityError, setActivityError] = useState("");
  const [todayWorkedMinutes, setTodayWorkedMinutes] = useState(0);
  const [weekWorkedMinutes, setWeekWorkedMinutes] = useState(0);
  const [notificationRoles, setNotificationRoles] = useState<string[]>([
    "Production planner",
    "Admin",
    "Owner",
  ]);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const statusOptions: Array<{ value: QueueStatusFilter; label: string }> = [
    { value: "all", label: t("production.operator.status.all") },
    { value: "queued", label: t("production.operator.status.queued") },
    { value: "pending", label: t("production.operator.status.pending") },
    {
      value: "in_progress",
      label: t("production.operator.status.in_progress"),
    },
    { value: "paused", label: t("production.operator.status.paused") },
    { value: "blocked", label: t("production.operator.status.blocked") },
    { value: "done", label: t("production.operator.status.done") },
  ];
  const priorityOptions: Array<{
    value: "all" | Priority;
    label: string;
  }> = [
    { value: "all", label: t("production.operator.priority.all") },
    { value: "urgent", label: t("production.operator.priority.urgent") },
    { value: "high", label: t("production.operator.priority.high") },
    { value: "normal", label: t("production.operator.priority.normal") },
    { value: "low", label: t("production.operator.priority.low") },
  ];
  const blockedOnlyLabel = onlyBlocked
    ? t("production.operator.filters.blockedOnlyOn")
    : t("production.operator.filters.blockedOnly");
  const runStatusLabel = (status: BatchRunRow["status"]) =>
    t(`production.operator.status.${status}`);
  const priorityLabel = (priority: Priority) =>
    t(`production.operator.priority.${priority}`);

  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";

  const setQueryParams = (
    updates: Record<string, string | null | undefined>,
    replace = true,
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    if (replace) {
      router.replace(url, { scroll: false });
      return;
    }
    router.push(url, { scroll: false });
  };

  useEffect(() => {
    setSelectedDate(selectedDateParam);
    const nextStatus =
      (searchParams.get("status") as QueueStatusFilter) || "all";
    setStatusFilter(nextStatus);
    const nextPriority =
      (searchParams.get("priority") as "all" | Priority) || "all";
    setPriorityFilter(nextPriority);
    setSearchQuery(searchParams.get("q") || "");
    setOnlyBlocked(searchParams.get("blocked") === "1");
  }, [searchParams, selectedDateParam]);

  useEffect(() => {
    const onScroll = () => {
      setShowCompactMobileTitle(window.scrollY > 48);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return;
    }
    const tryFocus = () => {
      const input = mobileSearchInputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      input.select();
    };
    const frame1 = window.requestAnimationFrame(() => {
      tryFocus();
      window.requestAnimationFrame(() => {
        tryFocus();
      });
    });
    const timer = window.setTimeout(() => {
      tryFocus();
    }, 180);
    return () => {
      window.cancelAnimationFrame(frame1);
      window.clearTimeout(timer);
    };
  }, [isMobileSearchOpen]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.id) {
      return;
    }
    let isMounted = true;
    let usedCache = false;

    if (cacheKey) {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as {
            cachedAt: number;
            stations: Station[];
            batchRuns: BatchRunRow[];
            stationDependencies: StationDependencyRow[];
            productionItems: ProductionItemRow[];
            attachments: OrderAttachmentRow[];
            tenantId?: string | null;
            date?: string;
          };
          if (
            cached &&
            Date.now() - cached.cachedAt < 15000 &&
            cached.tenantId === currentUser.tenantId &&
            cached.date === selectedDate
          ) {
            setStations(
              (cached.stations ?? []).map((station) => ({
                ...station,
                trackingMode: normalizeTrackingMode(
                  (station as { trackingMode?: unknown }).trackingMode,
                ),
              })),
            );
            setBatchRuns(cached.batchRuns ?? []);
            setStationDependencies(cached.stationDependencies ?? []);
            setProductionItems(cached.productionItems ?? []);
            setAttachments(cached.attachments ?? []);
            usedCache = true;
            setIsLoading(false);
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    const load = async () => {
      if (!usedCache) {
        setIsLoading(true);
      }
      setDataError("");
      const { data: assignments, error: assignmentsError } = await sb
        .from("operator_station_assignments")
        .select("station_id")
        .eq("user_id", currentUser.id)
        .eq("is_active", true);
      if (!isMounted) {
        return;
      }
      if (assignmentsError) {
        setDataError("Failed to load station assignments.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const stationIds = (assignments ?? [])
        .map((row) => row.station_id)
        .filter(Boolean) as string[];
      if (stationIds.length === 0) {
        setStations([]);
        setBatchRuns([]);
        setStationDependencies([]);
        setProductionItems([]);
        setAttachments([]);
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      let runsQuery = sb
        .from("batch_runs")
        .select(
          "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, priority, customer_name)",
        )
        .in("station_id", stationIds)
        .order("created_at", { ascending: false });
      if (orderFilter) {
        runsQuery = runsQuery.eq("order_id", orderFilter);
      } else {
        runsQuery = runsQuery.eq("planned_date", selectedDate);
      }

      const [stationsResult, runsResult, depsResult] = await Promise.all([
        sb
          .from("workstations")
          .select("id, name, sort_order, tracking_mode")
          .in("id", stationIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        runsQuery,
        sb
          .from("station_dependencies")
          .select("id, station_id, depends_on_station_id")
          .in("station_id", stationIds),
      ]);
      if (!isMounted) {
        return;
      }
      if (stationsResult.error || runsResult.error || depsResult.error) {
        setDataError("Failed to load production queue.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const runs: BatchRunRow[] = (runsResult.data ?? []).map((row) => {
        const relatedOrder = Array.isArray(row.orders)
          ? (row.orders[0] ?? null)
          : (row.orders ?? null);
        return {
          ...(row as Omit<BatchRunRow, "orders">),
          orders: relatedOrder
            ? {
                order_number: relatedOrder.order_number ?? null,
                due_date: relatedOrder.due_date ?? null,
                priority: (relatedOrder.priority ?? null) as Priority | null,
                customer_name: relatedOrder.customer_name ?? null,
              }
            : null,
        };
      });
      const orderIds = Array.from(
        new Set(runs.map((run) => run.order_id)),
      ).filter(Boolean);
      const batchCodes = Array.from(
        new Set(runs.map((run) => run.batch_code)),
      ).filter(Boolean);

      const [itemsResult, attachmentsResult] = await Promise.all([
        orderIds.length === 0
          ? Promise.resolve({ data: [] as ProductionItemRow[], error: null })
          : sb
              .from("production_items")
              .select(
                "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at",
              )
              .in("order_id", orderIds)
              .in("batch_code", batchCodes),
        orderIds.length === 0
          ? Promise.resolve({ data: [] as OrderAttachmentRow[], error: null })
          : sb
              .from("order_attachments")
              .select(
                "id, order_id, name, url, created_at, size, mime_type, category",
              )
              .in("order_id", orderIds)
              .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }
      if (itemsResult.error || attachmentsResult.error) {
        setDataError("Failed to load production details.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      setStations(
        (stationsResult.data ?? []).map((station) => ({
          id: station.id,
          name: station.name,
          sortOrder: station.sort_order ?? 0,
          trackingMode: normalizeTrackingMode(station.tracking_mode),
        })),
      );
      setBatchRuns(runs);
      setStationDependencies((depsResult.data ?? []) as StationDependencyRow[]);
      const allItems = (itemsResult.data ?? []) as ProductionItemRow[];
      setProductionItems(allItems);
      setAttachments((attachmentsResult.data ?? []) as OrderAttachmentRow[]);
      if (!usedCache) {
        setIsLoading(false);
      }
      if (cacheKey) {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              cachedAt: Date.now(),
              stations: stationsResult.data ?? [],
              batchRuns: runs,
              stationDependencies: depsResult.data ?? [],
              productionItems: allItems,
              attachments: attachmentsResult.data ?? [],
              tenantId: currentUser.tenantId ?? null,
              date: selectedDate,
            }),
          );
        } catch {
          // ignore cache errors
        }
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [
    currentUser.id,
    currentUser.tenantId,
    cacheKey,
    selectedDate,
    orderFilter,
  ]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadNotificationRoles = async () => {
      const { data, error } = await sb
        .from("tenant_settings")
        .select("notification_roles")
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      if (Array.isArray(data.notification_roles)) {
        setNotificationRoles(
          data.notification_roles.filter(
            (value: unknown) => typeof value === "string",
          ),
        );
      }
    };
    void loadNotificationRoles();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.id) {
      return;
    }
    let isMounted = true;
    const loadActivity = async () => {
      setActivityError("");
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      const from = weekStart.toISOString();
      const { data, error } = await sb
        .from("production_status_events")
        .select(
          "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at",
        )
        .eq("actor_user_id", currentUser.id)
        .gte("created_at", from)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!isMounted) {
        return;
      }
      if (error) {
        setActivityEvents([]);
        if (error.code !== "42P01") {
          setActivityError("Failed to load activity history.");
        }
        return;
      }
      const events = (data ?? []) as StatusEventRow[];
      setActivityEvents(events);
      const doneItemIds = Array.from(
        new Set(
          events
            .filter(
              (row) =>
                row.to_status === "done" &&
                typeof row.production_item_id === "string",
            )
            .map((row) => row.production_item_id as string),
        ),
      );
      if (doneItemIds.length === 0) {
        setTodayWorkedMinutes(0);
        setWeekWorkedMinutes(0);
        return;
      }
      const { data: doneItems, error: doneItemsError } = await sb
        .from("production_items")
        .select("id, duration_minutes, done_at")
        .in("id", doneItemIds);
      if (!isMounted || doneItemsError || !doneItems) {
        return;
      }
      const todayMinutes = doneItems
        .filter((item) => item.done_at?.slice(0, 10) === today)
        .reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0);
      const weeklyMinutes = doneItems.reduce(
        (sum, item) => sum + Number(item.duration_minutes ?? 0),
        0,
      );
      setTodayWorkedMinutes(todayMinutes);
      setWeekWorkedMinutes(weeklyMinutes);
    };
    void loadActivity();
    return () => {
      isMounted = false;
    };
  }, [currentUser.id, today]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    const channel = sb
      .channel(`operator-live-${currentUser.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_items",
          filter: `tenant_id=eq.${currentUser.tenantId}`,
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
          filter: `tenant_id=eq.${currentUser.tenantId}`,
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
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    let isMounted = true;
    const loadReasons = async () => {
      const { data, error } = await sb
        .from("stop_reasons")
        .select("id, label")
        .eq("is_active", true)
        .order("label", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        return;
      }
      setStopReasons(data ?? []);
    };
    void loadReasons();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      const { data, error } = await sb
        .from("tenant_settings")
        .select("workday_start, workday_end, workdays, work_shifts")
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      setWorkingCalendar(parseWorkingCalendar(data));
    };
    void loadWorkHours();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  const signAttachments = async (list: OrderAttachmentRow[]) => {
    const sb = supabase;
    if (!sb || list.length === 0) {
      return;
    }
    const results = await Promise.all(
      list.map(async (attachment) => {
        if (!attachment.url) {
          return { id: attachment.id, url: undefined };
        }
        if (
          storagePublicPrefix &&
          attachment.url.startsWith(storagePublicPrefix)
        ) {
          const path = getStoragePathFromUrl(attachment.url, supabaseBucket);
          const { data } = await sb.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }
        if (attachment.url.startsWith("http")) {
          return { id: attachment.id, url: attachment.url };
        }
        const { data } = await sb.storage
          .from(supabaseBucket)
          .createSignedUrl(attachment.url, 60 * 60);
        return { id: attachment.id, url: data?.signedUrl };
      }),
    );
    setSignedUrls((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        if (result.url) {
          next[result.id] = result.url;
        }
      });
      return next;
    });
  };

  const attachmentsByOrder = useMemo(() => {
    const map = new Map<string, OrderAttachmentRow[]>();
    attachments.forEach((attachment) => {
      if (attachment.category !== "production_report") {
        return;
      }
      if (!map.has(attachment.order_id)) {
        map.set(attachment.order_id, []);
      }
      map.get(attachment.order_id)?.push(attachment);
    });
    return map;
  }, [attachments]);

  const orderDurationMap = useMemo(() => {
    const map = new Map<string, number>();
    productionItems.forEach((item) => {
      if (item.duration_minutes == null) {
        return;
      }
      map.set(
        item.order_id,
        (map.get(item.order_id) ?? 0) + item.duration_minutes,
      );
    });
    return map;
  }, [productionItems]);

  const stationsById = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station.name]));
  }, [stations]);

  const dependenciesByStation = useMemo(() => {
    const map = new Map<string, string[]>();
    stationDependencies.forEach((row) => {
      const list = map.get(row.station_id) ?? [];
      list.push(row.depends_on_station_id);
      map.set(row.station_id, list);
    });
    return map;
  }, [stationDependencies]);

  const itemsByGroupAndStation = useMemo(() => {
    const map = new Map<string, Map<string, ProductionItemRow>>();
    productionItems.forEach((item) => {
      if (!item.station_id) return;
      const key = getItemGroupKey(item);
      if (!map.has(key)) {
        map.set(key, new Map());
      }
      const stationMap = map.get(key);
      const existing = stationMap?.get(item.station_id);
      stationMap?.set(item.station_id, pickLatestItem(existing, item));
    });
    return map;
  }, [productionItems]);

  const visibleStations = useMemo(() => {
    if (!stationFilter) {
      return stations;
    }
    return stations.filter((station) => station.id === stationFilter);
  }, [stations, stationFilter]);

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    const stationModeById = new Map(
      visibleStations.map((station) => [station.id, station.trackingMode]),
    );
    visibleStations.forEach((station) => map.set(station.id, []));
    batchRuns.forEach((run) => {
      if (!run.station_id) {
        return;
      }
      if (run.status === "done") {
        return;
      }
      const items = productionItems.filter(
        (item) =>
          item.order_id === run.order_id &&
          item.batch_code === run.batch_code &&
          item.station_id === run.station_id,
      );
      const latestByGroup = new Map<string, ProductionItemRow>();
      items.forEach((row) => {
        const key = getItemGroupKey(row);
        const existing = latestByGroup.get(key);
        latestByGroup.set(key, pickLatestItem(existing, row));
      });
      const dedupedItems = Array.from(latestByGroup.values());
      const totalQty = dedupedItems.reduce(
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
        plannedDate: run.planned_date ?? null,
        batchCode: run.batch_code,
        totalQty,
        material,
        attachments: attachmentsByOrder.get(run.order_id) ?? [],
        startedAt: run.started_at,
        doneAt: run.done_at,
        items: dedupedItems,
        trackingMode:
          stationModeById.get(run.station_id) ?? "construction_level",
      } satisfies QueueItem;
      map.get(run.station_id)?.push(queueItem);
    });
    return map;
  }, [batchRuns, productionItems, visibleStations, attachmentsByOrder]);

  const filteredQueueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    const query = searchQuery.trim().toLowerCase();
    visibleStations.forEach((station) => {
      const list = queueByStation.get(station.id) ?? [];
      const filtered = list.filter((item) => {
        if (orderFilter && item.orderId !== orderFilter) {
          return false;
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        if (priorityFilter !== "all" && item.priority !== priorityFilter) {
          return false;
        }
        if (
          onlyBlocked &&
          !item.items.some((row) => row.status === "blocked")
        ) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          item.orderNumber.toLowerCase().includes(query) ||
          item.batchCode.toLowerCase().includes(query) ||
          item.customerName.toLowerCase().includes(query)
        );
      });
      map.set(station.id, filtered);
    });
    return map;
  }, [
    queueByStation,
    visibleStations,
    searchQuery,
    statusFilter,
    priorityFilter,
    onlyBlocked,
    orderFilter,
  ]);

  const queueItemByOrderId = useMemo(() => {
    const map = new Map<string, QueueItem>();
    Array.from(queueByStation.values())
      .flat()
      .forEach((item) => {
        if (!map.has(item.orderId)) {
          map.set(item.orderId, item);
        }
      });
    return map;
  }, [queueByStation]);

  const quickActionItem = quickActionOrderId
    ? (queueItemByOrderId.get(quickActionOrderId) ?? null)
    : null;
  const quickActionVisibleItems =
    quickActionItem?.trackingMode === "construction_level" &&
    quickActionItemId &&
    quickActionItem
      ? quickActionItem.items.filter((item) => item.id === quickActionItemId)
      : (quickActionItem?.items ?? []);
  const quickActionHasBlockingDependenciesForBatch = useMemo(() => {
    if (!quickActionItem) {
      return false;
    }
    return quickActionItem.items.some((prodItem) => {
      const dependencyStations =
        dependenciesByStation.get(prodItem.station_id ?? "") ?? [];
      if (dependencyStations.length === 0) {
        return false;
      }
      const groupKey = getItemGroupKey(prodItem);
      return dependencyStations.some((depId) => {
        const depItem = itemsByGroupAndStation.get(groupKey)?.get(depId) ?? null;
        return depItem && depItem.status !== "done";
      });
    });
  }, [quickActionItem, dependenciesByStation, itemsByGroupAndStation]);

  const activitySummary = useMemo(() => {
    const todayEvents = activityEvents.filter(
      (row) => row.created_at.slice(0, 10) === today,
    );
    const started = todayEvents.filter(
      (row) => row.to_status === "in_progress",
    ).length;
    const done = todayEvents.filter((row) => row.to_status === "done").length;
    const blocked = todayEvents.filter(
      (row) => row.to_status === "blocked",
    ).length;
    const minutes = todayWorkedMinutes;
    return { started, done, blocked, minutes };
  }, [activityEvents, today, todayWorkedMinutes]);

  const weeklySummary = useMemo(() => {
    const started = activityEvents.filter(
      (row) => row.to_status === "in_progress",
    ).length;
    const done = activityEvents.filter(
      (row) => row.to_status === "done",
    ).length;
    const blocked = activityEvents.filter(
      (row) => row.to_status === "blocked",
    ).length;
    return { started, done, blocked, minutes: weekWorkedMinutes };
  }, [activityEvents, weekWorkedMinutes]);

  const filteredItemsCount = useMemo(
    () =>
      Array.from(filteredQueueByStation.values()).reduce(
        (sum, list) => sum + list.length,
        0,
      ),
    [filteredQueueByStation],
  );

  const updateItemStatus = async (
    itemId: string,
    runId: string,
    status: BatchRunRow["status"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    const targetItem = productionItems.find((item) => item.id === itemId);
    if (!run || !targetItem) {
      return;
    }
    const now = new Date().toISOString();
    const wasBlocked = run.status === "blocked" || targetItem.status === "blocked";
    const wasPaused = run.status === "paused" || targetItem.status === "paused";
    const isResumed = (wasBlocked || wasPaused) && status === "in_progress";
    const { data: transitionedRun, error: transitionError } =
      await transitionBatchRunStatus(sb, {
        batchRunId: runId,
        toStatus: status,
        reason: extra?.reason ?? null,
        reasonId: extra?.reasonId ?? null,
        productionItemId: itemId,
        actorUserId: currentUser.id,
      });
    if (transitionError) {
      setDataError(transitionError.message ?? "Failed to transition batch run status.");
      return;
    }
    if (!transitionedRun) {
      setDataError("No batch run returned from transition.");
      return;
    }
    const appliedStatus = (transitionedRun.status ??
      status) as BatchRunRow["status"];
    const nextRunStartedAt = transitionedRun.started_at ?? run.started_at ?? null;
    const nextRunDoneAt = transitionedRun.done_at ?? run.done_at ?? null;
    const nextRunDuration =
      typeof transitionedRun.duration_minutes === "number"
        ? transitionedRun.duration_minutes
        : (run.duration_minutes ?? null);

    if (currentUser.tenantId) {
      if (run.status !== appliedStatus) {
        const eventInsertData: StatusEventRow = {
          id: crypto.randomUUID(),
          production_item_id: targetItem.id,
          order_id: run.order_id,
          batch_run_id: run.id,
          from_status: run.status,
          to_status: appliedStatus,
          reason: extra?.reason ?? null,
          created_at: now,
        };
        setActivityEvents((prev) => [
          eventInsertData,
          ...prev,
        ]);
      }
    }

    if (appliedStatus === "blocked" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber = run.orders?.order_number ?? "Order";
      const reason = extra?.reason ?? "Blocked";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "blocked",
        title: `Blocked: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nReason: ${reason}\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          reason,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }
    if (isResumed && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber = run.orders?.order_number ?? "Order";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "resumed",
        title: `Resumed: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nAction: Work resumed\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }
    if (appliedStatus === "done" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber = run.orders?.order_number ?? "Order";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "done",
        title: `Done: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nAction: Work completed\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }
    setBatchRuns((prev) =>
      prev.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              blocked_reason: transitionedRun.blocked_reason ?? null,
              blocked_reason_id: transitionedRun.blocked_reason_id ?? null,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      ),
    );
    const nextItems = productionItems.map((item) =>
      item.order_id === run.order_id &&
      item.batch_code === run.batch_code &&
      item.station_id === run.station_id
        ? {
            ...item,
            status: appliedStatus,
            started_at:
              appliedStatus === "in_progress"
                ? (item.started_at ?? nextRunStartedAt ?? now)
                : item.started_at,
            done_at: appliedStatus === "done" ? (nextRunDoneAt ?? now) : null,
          }
        : item,
    );
    setProductionItems(nextItems);

    if (appliedStatus === "done") {
      const nextRuns = batchRuns.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      );
      if (
        isOrderProductionComplete(
          nextRuns
            .filter((item) => item.order_id === run.order_id)
            .map((item) => ({
            status: item.status,
            stationId: item.station_id,
          })),
          rules.productionCompletionConfig,
        )
      ) {
        const totalDuration = nextRuns
          .filter((item) => item.order_id === run.order_id)
          .reduce(
            (sum, item) => sum + Number(item.duration_minutes ?? 0),
          0,
        );
        await sb
          .from("orders")
          .update({ production_duration_minutes: totalDuration })
          .eq("id", run.order_id);
      }
    }
  };

  const handleUserStatusUpdate = async (
    itemId: string,
    runId: string,
    status: PendingAction["action"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    if (pendingAction) {
      return;
    }
    if (status === "paused") {
      const targetItem = productionItems.find((item) => item.id === itemId);
      if (!targetItem || targetItem.status !== "in_progress") {
        return;
      }
    }
    setPendingAction({ itemId, action: status });
    try {
      await updateItemStatus(itemId, runId, status, extra);
    } finally {
      setPendingAction(null);
    }
  };

  const handleRunStatusUpdate = async (
    runId: string,
    status: PendingRunAction["action"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    if (pendingRunAction || pendingAction) {
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    if (!run) {
      return;
    }
    const runItems = productionItems.filter(
      (item) =>
        item.order_id === run.order_id &&
        item.batch_code === run.batch_code &&
        item.station_id === run.station_id,
    );
    if (runItems.length === 0) {
      return;
    }
    const runTrackingMode =
      stations.find((station) => station.id === run.station_id)?.trackingMode ??
      "construction_level";
    if (status === "done" && runTrackingMode === "receipt_only") {
      if (isFuturePlannedDate(run.planned_date ?? null)) {
        return;
      }
      const hasBlockingDependencies = runItems.some((prodItem) => {
        const dependencyStations =
          dependenciesByStation.get(prodItem.station_id ?? "") ?? [];
        if (dependencyStations.length === 0) {
          return false;
        }
        const groupKey = getItemGroupKey(prodItem);
        return dependencyStations.some((depId) => {
          const depItem =
            itemsByGroupAndStation.get(groupKey)?.get(depId) ?? null;
          return depItem && depItem.status !== "done";
        });
      });
      if (hasBlockingDependencies) {
        return;
      }
    }
    const targetItems = runItems.filter((item) => {
      if (status === "in_progress") {
        return item.status !== "done";
      }
      if (status === "done") {
        return item.status !== "done";
      }
      if (status === "blocked") {
        return item.status !== "done";
      }
      if (status === "paused") {
        return item.status === "in_progress";
      }
      return true;
    });
    if (targetItems.length === 0) {
      return;
    }
    setPendingRunAction({ runId, action: status });
    try {
      await updateItemStatus(targetItems[0].id, runId, status, extra);
    } finally {
      setPendingRunAction(null);
    }
  };

  const isActionLoading = (itemId: string, action: PendingAction["action"]) =>
    pendingAction?.itemId === itemId && pendingAction.action === action;
  const isRunActionLoading = (
    runId: string,
    action: PendingRunAction["action"],
  ) => pendingRunAction?.runId === runId && pendingRunAction.action === action;

  useEffect(() => {
    if (!supabase || productionItems.length === 0) {
      return;
    }
    const updatesByRun = new Map<
      string,
      { itemId: string; runId: string; status: BatchRunRow["status"] }
    >();

    productionItems.forEach((item) => {
      if (!item.station_id) {
        return;
      }
      if (
        item.status === "in_progress" ||
        item.status === "paused" ||
        item.status === "done" ||
        item.status === "blocked"
      ) {
        return;
      }
      const dependencies = dependenciesByStation.get(item.station_id) ?? [];
      const run = batchRuns.find(
        (candidate) =>
          candidate.order_id === item.order_id &&
          candidate.batch_code === item.batch_code &&
          candidate.station_id === item.station_id,
      );
      if (!run) {
        return;
      }
      if (dependencies.length === 0) {
        if (item.status === "pending") {
          updates.push({ itemId: item.id, runId: run.id, status: "queued" });
        }
        return;
      }
      const groupKey = getItemGroupKey(item);
      const stationMap = itemsByGroupAndStation.get(groupKey);
      const hasBlocking = dependencies.some((depId) => {
        const depItem = stationMap?.get(depId);
        return depItem && depItem.status !== "done";
      });
      const desiredStatus = hasBlocking ? "pending" : "queued";
      if (item.status !== desiredStatus) {
        const existing = updatesByRun.get(run.id);
        if (!existing) {
          updatesByRun.set(run.id, {
            itemId: item.id,
            runId: run.id,
            status: desiredStatus,
          });
        }
      }
    });

    const updates = Array.from(updatesByRun.values());
    if (updates.length === 0) {
      return;
    }
    updates.forEach((update) => {
      updateItemStatus(update.itemId, update.runId, update.status);
    });
    // `updateItemStatus` intentionally omitted to avoid recreating this side-effect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supabase,
    productionItems,
    dependenciesByStation,
    itemsByGroupAndStation,
    batchRuns,
  ]);

  const handleOpenBlocked = (runId: string, itemId?: string | null) => {
    setBlockedRunId(runId);
    setBlockedItemId(itemId ?? null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleOpenPaused = (runId: string, itemId?: string | null) => {
    setPausedRunId(runId);
    setPausedItemId(itemId ?? null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };

  const handleConfirmBlocked = async () => {
    if (!blockedRunId) {
      return;
    }
    const manual = blockedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === blockedReasonId)?.label ?? "";
    const reason = manual || selectedLabel || "Blocked";
    if (blockedItemId) {
      await handleUserStatusUpdate(blockedItemId, blockedRunId, "blocked", {
        reason,
        reasonId: blockedReasonId || null,
      });
    } else {
      await handleRunStatusUpdate(blockedRunId, "blocked", {
        reason,
        reasonId: blockedReasonId || null,
      });
    }
    setBlockedRunId(null);
    setBlockedItemId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleConfirmPaused = async () => {
    if (!pausedRunId) {
      return;
    }
    const manual = pausedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === pausedReasonId)?.label ?? "";
    const reason = manual || selectedLabel;
    if (!reason) {
      setPausedReasonError(t("production.operator.paused.reasonRequired"));
      return;
    }
    if (pausedItemId) {
      await handleUserStatusUpdate(pausedItemId, pausedRunId, "paused", {
        reason,
        reasonId: pausedReasonId || null,
      });
    } else {
      await handleRunStatusUpdate(pausedRunId, "paused", {
        reason,
        reasonId: pausedReasonId || null,
      });
    }
    setPausedRunId(null);
    setPausedItemId(null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };

  const closeQuickAction = () => {
    setIsQuickActionOpen(false);
    setQuickActionOrderId(null);
    setQuickActionItemId(null);
    setQuickActionRowIndex(null);
  };

  const applyFiltersToUrl = (next?: {
    date?: string;
    status?: QueueStatusFilter;
    priority?: "all" | Priority;
    q?: string;
    blocked?: boolean;
  }) => {
    const dateValue = next?.date ?? selectedDate;
    const statusValue = next?.status ?? statusFilter;
    const priorityValue = next?.priority ?? priorityFilter;
    const queryValue = (next?.q ?? searchQuery).trim();
    const blockedValue = next?.blocked ?? onlyBlocked;
    setQueryParams({
      date: dateValue || today,
      status: statusValue === "all" ? null : statusValue,
      priority: priorityValue === "all" ? null : priorityValue,
      q: queryValue || null,
      blocked: blockedValue ? "1" : null,
      order: orderFilter ?? null,
      station: stationFilter ?? null,
    });
  };

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true);
    window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus({ preventScroll: true });
      mobileSearchInputRef.current?.select();
    });
  };

  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false);
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  };

  useEffect(() => {
    if (!quickActionOrderId || !quickActionItem) {
      return;
    }
    setExpandedOrderItems((prev) => {
      const next = new Set(prev);
      next.add(quickActionItem.id);
      return next;
    });
    setIsQuickActionOpen(true);
  }, [quickActionOrderId, quickActionItem]);

  useEffect(() => {
    if (!quickActionOrderId || quickActionRowIndex == null) {
      return;
    }
    const candidates = productionItems.filter(
      (item) =>
        item.order_id === quickActionOrderId &&
        getProductionItemRowIndex(item) === quickActionRowIndex,
    );
    if (candidates.length === 0) {
      return;
    }
    const target = [...candidates].sort((a, b) => {
      const aTs = a.created_at ? Date.parse(a.created_at) : 0;
      const bTs = b.created_at ? Date.parse(b.created_at) : 0;
      return bTs - aTs;
    })[0];
    setQuickActionItemId(target.id);
  }, [quickActionOrderId, quickActionRowIndex, productionItems]);

  const handleScannerResolved = async (result: ResolveScanTargetResult) => {
    const sb = supabase;
    if (!result.ok) {
      setScannerError(result.error);
      if (sb && currentUser.tenantId) {
        await sb.from("qr_scan_events").insert({
          tenant_id: currentUser.tenantId,
          user_id: currentUser.id,
          raw_value: result.rawValue,
          token: result.token ?? null,
          result: "error",
          message: result.error,
          target_route: null,
        });
      }
      return true;
    }
    setScannerError("");
    if (result.targetRoute.startsWith("/qr/")) {
      const message = t("production.operator.errors.qrNotInQueue");
      setScannerError(message);
      if (sb && currentUser.tenantId) {
        await sb.from("qr_scan_events").insert({
          tenant_id: currentUser.tenantId,
          user_id: currentUser.id,
          raw_value: result.rawValue,
          token: result.token,
          result: "error",
          message,
          target_route: result.targetRoute,
        });
      }
      return true;
    }
    const targetRoute =
      currentUser.role === "Operator" && result.orderId
        ? `/production/operator?date=${encodeURIComponent(selectedDate)}&order=${encodeURIComponent(result.orderId)}`
        : result.targetRoute;
    if (sb && currentUser.tenantId) {
      await sb.from("qr_scan_events").insert({
        tenant_id: currentUser.tenantId,
        user_id: currentUser.id,
        raw_value: result.rawValue,
        token: result.token,
        result: "success",
        message: null,
        target_route: targetRoute,
      });
    }
    if (currentUser.role === "Operator" && result.orderId) {
      const rowIndex =
        typeof result.rowIndex === "number" ? result.rowIndex : null;
      setQuickActionOrderId(result.orderId);
      setQuickActionRowIndex(rowIndex);
      if (rowIndex == null) {
        setQuickActionItemId(null);
      }
      setIsQuickActionOpen(true);
      setQueryParams({
        date: selectedDate,
        status: statusFilter === "all" ? null : statusFilter,
        priority: priorityFilter === "all" ? null : priorityFilter,
        q: searchQuery.trim() || null,
        blocked: onlyBlocked ? "1" : null,
        order: result.orderId,
        station: stationFilter ?? null,
      });
      return true;
    }
    router.push(targetRoute);
    return true;
  };

  const userInitials = useMemo(() => {
    return currentUser.name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [currentUser.name]);

  const userRoleLabel = currentUser.isOwner
    ? `${currentUser.role} / ${t("profile.owner")}`
    : currentUser.role;

  if (!currentUser.isAuthenticated) {
    return null;
  }

  const headerSubtitle = t("production.operator.header.subtitle", {
    date: formatDate(selectedDate),
  });
  const closeBlockedDialog = () => {
    setBlockedRunId(null);
    setBlockedItemId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };
  const closePausedDialog = () => {
    setPausedRunId(null);
    setPausedItemId(null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };
  const blockedDialogContent = (
    <div className="space-y-3 text-sm">
      <SelectField
        label={t("production.operator.blocked.reasonTemplate")}
        labelClassName="text-xs text-muted-foreground"
        value={blockedReasonId || "__none__"}
        onValueChange={(value) =>
          setBlockedReasonId(value === "__none__" ? "" : value)
        }
      >
        <Select
          value={blockedReasonId || "__none__"}
          onValueChange={(value) =>
            setBlockedReasonId(value === "__none__" ? "" : value)
          }
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue
              placeholder={t("production.operator.blocked.selectReason")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              {t("production.operator.blocked.selectReason")}
            </SelectItem>
            {stopReasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectField>
      <TextAreaField
        label={t("production.operator.blocked.manualNote")}
        labelClassName="text-xs text-muted-foreground"
        value={blockedReasonText}
        onChange={(event) => setBlockedReasonText(event.target.value)}
        placeholder={t("production.operator.blocked.customReasonPlaceholder")}
        className="min-h-22.5"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={closeBlockedDialog}>
          {t("production.operator.common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleConfirmBlocked}
          disabled={
            blockedItemId
              ? isActionLoading(blockedItemId, "blocked")
              : (blockedRunId
                  ? isRunActionLoading(blockedRunId, "blocked")
                  : false)
          }
          className="gap-2"
        >
          {(blockedItemId && isActionLoading(blockedItemId, "blocked")) ||
          (blockedRunId && isRunActionLoading(blockedRunId, "blocked")) ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
          {t("production.operator.common.save")}
        </Button>
      </div>
    </div>
  );
  const pausedDialogContent = (
    <div className="space-y-3 text-sm">
      <SelectField
        label={t("production.operator.paused.reasonTemplate")}
        labelClassName="text-xs text-muted-foreground"
        value={pausedReasonId || "__none__"}
        onValueChange={(value) =>
          setPausedReasonId(value === "__none__" ? "" : value)
        }
      >
        <Select
          value={pausedReasonId || "__none__"}
          onValueChange={(value) => {
            setPausedReasonId(value === "__none__" ? "" : value);
            if (pausedReasonError) {
              setPausedReasonError("");
            }
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue
              placeholder={t("production.operator.paused.selectReason")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              {t("production.operator.paused.selectReason")}
            </SelectItem>
            {stopReasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectField>
      <TextAreaField
        label={t("production.operator.paused.manualNote")}
        labelClassName="text-xs text-muted-foreground"
        value={pausedReasonText}
        onChange={(event) => {
          setPausedReasonText(event.target.value);
          if (pausedReasonError) {
            setPausedReasonError("");
          }
        }}
        placeholder={t("production.operator.paused.customReasonPlaceholder")}
        className="min-h-22.5"
      />
      {pausedReasonError ? (
        <div className="text-xs text-destructive">{pausedReasonError}</div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={closePausedDialog}>
          {t("production.operator.common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleConfirmPaused}
          disabled={
            pausedItemId
              ? isActionLoading(pausedItemId, "paused")
              : (pausedRunId
                  ? isRunActionLoading(pausedRunId, "paused")
                  : false)
          }
          className="gap-2"
        >
          {(pausedItemId && isActionLoading(pausedItemId, "paused")) ||
          (pausedRunId && isRunActionLoading(pausedRunId, "paused")) ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
          {t("production.operator.common.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <section className="relative flex flex-col gap-3 pt-16 md:pt-0">
      <MobilePageTitle
        title={t("production.operator.header.title")}
        subtitle={headerSubtitle}
        showCompact={showCompactMobileTitle}
        className="pt-6 pb-6"
        rightAction={
          isWarehouseQueueView ? null :
          <button
            type="button"
            onClick={() => setIsProfilePanelOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm"
            aria-label={t("production.operator.profile.openPanel")}
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {userInitials || "U"}
              </div>
            )}
          </button>
        }
      />

      <DesktopPageHeader
        sticky
        title={t("production.operator.header.title")}
        subtitle={headerSubtitle}
        actions={
          isWarehouseQueueView ? null :
          <button
            type="button"
            onClick={() => setIsProfilePanelOpen(true)}
            className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40 md:inline-flex"
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {userInitials || "U"}
              </div>
            )}
            <span className="max-w-56 truncate font-medium">
              {currentUser.name} ({userRoleLabel})
            </span>
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        }
        className="top-0!"
      />

      {isWarehouseQueueView ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 text-sm md:grid-cols-4 md:p-4">
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.todayDone")}
            </div>
            <div className="text-lg font-semibold">{activitySummary.done}</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.todayTime")}
            </div>
            <div className="text-lg font-semibold">
              {formatDuration(activitySummary.minutes)}
            </div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.weekDone")}
            </div>
            <div className="text-lg font-semibold">{weeklySummary.done}</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.weekTime")}
            </div>
            <div className="text-lg font-semibold">
              {formatDuration(weeklySummary.minutes)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="hidden rounded-xl border border-border bg-card p-3 md:block md:p-4">
        <div>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onBlur={() => applyFiltersToUrl({ q: searchQuery })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyFiltersToUrl({ q: searchQuery });
              }
            }}
            placeholder={t("production.operator.filters.searchPlaceholder")}
            icon="search"
            className="h-10"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DatePicker
            label={t("production.operator.filters.date")}
            value={selectedDate}
            onChange={(value) => applyFiltersToUrl({ date: value || today })}
          />

          <SelectField
            label={t("production.operator.filters.status")}
            value={statusFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ status: value as QueueStatusFilter })
            }
          >
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ status: value as QueueStatusFilter })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={t("production.operator.status.all")}
                />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>

          <SelectField
            label={t("production.operator.filters.priority")}
            value={priorityFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ priority: value as "all" | Priority })
            }
          >
            <Select
              value={priorityFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ priority: value as "all" | Priority })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={t("production.operator.priority.all")}
                />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant={onlyBlocked ? "secondary" : "outline"}
              className="h-10 flex-1"
              onClick={() => applyFiltersToUrl({ blocked: !onlyBlocked })}
            >
              {blockedOnlyLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCodeIcon className="h-4 w-4" />
              {t("production.operator.filters.scan")}
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="h-10 self-end"
            onClick={() =>
              setQueryParams({
                date: today,
                station: stationFilter ?? null,
                order: null,
                status: null,
                priority: null,
                q: null,
                blocked: null,
              })
            }
          >
            {t("production.operator.filters.reset")}
          </Button>
        </div>
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.started")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.started}
              </div>
            </div>
            <Badge variant="status-in_engineering">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.done")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.done}
              </div>
            </div>
            <Badge variant="status-ready_for_production">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.blocked")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.blocked}
              </div>
            </div>
            <Badge variant="status-blocked">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.workTime")}
              </div>
              <div className="text-xl font-semibold">
                {formatDuration(activitySummary.minutes)}
              </div>
            </div>
            <Badge variant="status-draft">
              {t("production.operator.metrics.accumulated")}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {dataError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.loadingQueue")}
        </div>
      ) : null}

      {!isLoading && visibleStations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.noStations")}
        </div>
      ) : null}

      {activityError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {activityError}
        </div>
      ) : null}

      {!isLoading && visibleStations.length > 0 && filteredItemsCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.noItemsForFilters")}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleStations.map((station) => {
          const queue = filteredQueueByStation.get(station.id) ?? [];
          const stationTotalMinutes = queue.reduce((sum, item) => {
            const itemMinutes = item.items.reduce(
              (rowSum, row) => rowSum + Number(row.duration_minutes ?? 0),
              0,
            );
            return sum + itemMinutes;
          }, 0);
          return (
            <Card key={station.id} className="min-h-60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{station.name}</CardTitle>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>
                      {t("production.operator.queue.itemsCount", {
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
                    {t("production.operator.queue.noWorkQueued")}
                  </div>
                ) : (
                  queue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-sm"
                    >
                      {(() => {
                        const metaParts: string[] = [];
                        if (item.totalQty > 0) {
                          metaParts.push(
                            t("production.operator.queue.pieces", {
                              count: item.totalQty,
                            }),
                          );
                        }
                        if (item.dueDate) {
                          metaParts.push(
                            t("production.operator.queue.dueDate", {
                              date: formatDate(item.dueDate),
                            }),
                          );
                        }
                        const metaLine = metaParts.join(" - ");
                        const stationDurationMinutes = item.items.reduce(
                          (sum, row) => sum + Number(row.duration_minutes ?? 0),
                          0,
                        );
                        const orderDurationMinutes =
                          orderDurationMap.get(item.orderId) ?? 0;
                        const isConstructionTracking =
                          item.trackingMode === "construction_level";
                        const isReceiptOnlyTracking =
                          item.trackingMode === "receipt_only";
                        const hasBatchStarted =
                          Boolean(item.startedAt) ||
                          item.status === "in_progress" ||
                          item.status === "paused";
                        const isBatchBlocked = item.status === "blocked";
                        const isBatchPaused = item.status === "paused";
                        const isBatchDone = item.status === "done";
                        const batchStartLockedByDate =
                          !hasBatchStarted &&
                          !isBatchBlocked &&
                          !isBatchPaused &&
                          isFuturePlannedDate(item.plannedDate);
                        const hasBlockingDependenciesForBatch = item.items.some(
                          (prodItem) => {
                            const dependencyStations =
                              dependenciesByStation.get(prodItem.station_id ?? "") ??
                              [];
                            if (dependencyStations.length === 0) {
                              return false;
                            }
                            const groupKey = getItemGroupKey(prodItem);
                            return dependencyStations.some((depId) => {
                              const depItem =
                                itemsByGroupAndStation.get(groupKey)?.get(depId) ??
                                null;
                              return depItem && depItem.status !== "done";
                            });
                          },
                        );
                        const isBatchStarting = isRunActionLoading(
                          item.id,
                          "in_progress",
                        );
                        const isBatchCompleting = isRunActionLoading(
                          item.id,
                          "done",
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
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-semibold">
                                  {item.orderNumber} / {item.batchCode}
                                </span>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {item.customerName}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {
                                    item.items.filter(
                                      (row) => row.status === "done",
                                    ).length
                                  }
                                  /{item.items.length}
                                </span>
                                <Badge variant={priorityBadge(item.priority)}>
                                  {priorityLabel(item.priority)}
                                </Badge>
                                <Badge
                                  variant={statusBadge(item.status)}
                                >
                                  {runStatusLabel(item.status ?? "queued")}
                                </Badge>
                              </div>
                            </div>
                            {metaLine ? (
                              <div className="mt-1 text-muted-foreground">
                                {metaLine}
                              </div>
                            ) : null}
                            <div className="mt-1 text-muted-foreground">
                              {item.material}
                            </div>
                            {stationDurationMinutes > 0 ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.stationTime")}{" "}
                                {formatDuration(stationDurationMinutes)}
                              </div>
                            ) : null}
                            {orderDurationMinutes > 0 ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.orderTime")}{" "}
                                {formatDuration(orderDurationMinutes)}
                              </div>
                            ) : null}
                            {elapsedLabel ? (
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.time", {
                                  value: elapsedLabel,
                                })}
                              </div>
                            ) : null}
                            {item.items.length > 0 && isConstructionTracking ? (
                              <div className="mt-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-2 text-xs"
                                  onClick={() =>
                                    setExpandedOrderItems((prev) => {
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
                                  {expandedOrderItems.has(item.id) ? (
                                    <ChevronUpIcon className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDownIcon className="h-3.5 w-3.5" />
                                  )}
                                  {expandedOrderItems.has(item.id)
                                    ? t("production.operator.queue.hideConstructions")
                                    : t("production.operator.queue.showConstructions")}
                                </Button>
                                {expandedOrderItems.has(item.id) ? (
                                  <div className="mt-2 space-y-2">
                                    {item.items.map((prodItem) => {
                                      const blockedReason =
                                        (
                                          prodItem.meta as Record<
                                            string,
                                            unknown
                                          > | null
                                        )?.blocked_reason ?? null;
                                      const pausedReason =
                                        (
                                          prodItem.meta as Record<
                                            string,
                                            unknown
                                          > | null
                                        )?.paused_reason ?? null;
                                      const groupKey =
                                        getItemGroupKey(prodItem);
                                      const dependencyStations =
                                        dependenciesByStation.get(
                                          prodItem.station_id ?? "",
                                        ) ?? [];
                                      const blockingDependencies =
                                        dependencyStations
                                          .map((depId) => {
                                            const depItem =
                                              itemsByGroupAndStation
                                                .get(groupKey)
                                                ?.get(depId) ?? null;
                                            if (
                                              !depItem ||
                                              depItem.status === "done"
                                            ) {
                                              return null;
                                            }
                                            return {
                                              stationId: depId,
                                              status: depItem.status,
                                            };
                                          })
                                          .filter(Boolean) as Array<{
                                          stationId: string;
                                          status: ProductionItemRow["status"];
                                        }>;
                                      const hasBlockingDependencies =
                                        blockingDependencies.length > 0;
                                      const itemElapsedMinutes =
                                        prodItem.started_at
                                          ? computeWorkingMinutes(
                                              prodItem.started_at,
                                              prodItem.done_at ?? null,
                                              workingCalendar,
                                            )
                                          : 0;
                                      const itemElapsedLabel =
                                        prodItem.started_at
                                          ? formatDuration(itemElapsedMinutes)
                                          : null;
                                      return (
                                        <div
                                          key={prodItem.id}
                                          className="rounded-md border border-border bg-muted/20 px-2 py-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-[11px] text-muted-foreground">
                                              {prodItem.item_name}
                                            </div>
                                            <Badge
                                              variant={statusBadge(
                                                prodItem.status,
                                              )}
                                            >
                                              {runStatusLabel(
                                                prodItem.status ?? "queued",
                                              )}
                                            </Badge>
                                          </div>
                                          <div className="mt-1 text-[11px] text-muted-foreground">
                                            {t("production.operator.queue.qty", {
                                              qty: prodItem.qty,
                                            })}
                                            {prodItem.material
                                              ? ` - ${prodItem.material}`
                                              : ""}
                                          </div>
                                          {hasBlockingDependencies ? (
                                            <div className="mt-2 space-y-1">
                                              <div className="text-[11px] text-amber-600">
                                                {t("production.operator.queue.waitingFor")}
                                              </div>
                                              <div className="flex flex-wrap gap-1">
                                                {blockingDependencies.map(
                                                  (dep) => {
                                                    const name =
                                                      stationsById.get(
                                                        dep.stationId,
                                                      ) ??
                                                      t(
                                                        "production.operator.queue.stationFallback",
                                                      );
                                                    return (
                                                      <span
                                                        key={dep.stationId}
                                                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                                                      >
                                                        {name} -{" "}
                                                        {runStatusLabel(
                                                          dep.status,
                                                        )}
                                                      </span>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            </div>
                                          ) : null}
                                          {itemElapsedLabel ? (
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                              {t("production.operator.queue.time", {
                                                value: itemElapsedLabel,
                                              })}
                                            </div>
                                          ) : null}
                                          {prodItem.status === "blocked" &&
                                          blockedReason ? (
                                            <div className="mt-1 text-[11px] text-rose-600">
                                              {t("production.operator.queue.blockedReason", {
                                                reason: String(blockedReason),
                                              })}
                                            </div>
                                          ) : null}
                                          {prodItem.status === "paused" &&
                                          pausedReason ? (
                                            <div className="mt-1 text-[11px] text-amber-600">
                                              {t("production.operator.queue.pausedReason", {
                                                reason: String(pausedReason),
                                              })}
                                            </div>
                                          ) : null}
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {(() => {
                                              const hasStarted =
                                                Boolean(prodItem.started_at) ||
                                                prodItem.status === "in_progress" ||
                                                prodItem.status === "paused";
                                              const isBlocked =
                                                prodItem.status === "blocked";
                                              const isPaused =
                                                prodItem.status === "paused";
                                              const startLockedByDate =
                                                !hasStarted &&
                                                !isBlocked &&
                                                isFuturePlannedDate(
                                                  item.plannedDate,
                                                );
                                              const isDone =
                                                prodItem.status === "done";
                                              const isStarting =
                                                isActionLoading(
                                                  prodItem.id,
                                                  "in_progress",
                                                );
                                              const isCompleting =
                                                isActionLoading(
                                                  prodItem.id,
                                                  "done",
                                                );
                                              return (
                                                <>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2"
                                                    disabled={
                                                      isDone ||
                                                      (hasStarted &&
                                                        !isBlocked &&
                                                        !isPaused) ||
                                                      startLockedByDate ||
                                                      (!isBlocked &&
                                                        !isPaused &&
                                                        hasBlockingDependencies) ||
                                                      isStarting
                                                    }
                                                    onClick={() =>
                                                      handleUserStatusUpdate(
                                                        prodItem.id,
                                                        item.id,
                                                        "in_progress",
                                                      )
                                                    }
                                                  >
                                                    {isStarting ? (
                                                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                                    ) : null}
                                                    {isBlocked || isPaused
                                                      ? t("production.operator.actions.resume")
                                                      : t("production.operator.actions.start")}
                                                  </Button>
                                                  {startLockedByDate &&
                                                  item.plannedDate ? (
                                                    <span className="self-center text-[10px] text-amber-600">
                                                      {t(
                                                        "production.operator.queue.availableOn",
                                                        {
                                                          date: formatDate(
                                                            item.plannedDate,
                                                          ),
                                                        },
                                                      )}
                                                    </span>
                                                  ) : null}
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2"
                                                    disabled={
                                                      !hasStarted ||
                                                      isDone ||
                                                      isBlocked ||
                                                      isPaused ||
                                                      isCompleting
                                                    }
                                                    onClick={() =>
                                                      handleUserStatusUpdate(
                                                        prodItem.id,
                                                        item.id,
                                                        "done",
                                                      )
                                                    }
                                                  >
                                                    {isCompleting ? (
                                                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                                    ) : null}
                                                    {t("production.operator.actions.done")}
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={
                                                      isDone ||
                                                      isPaused ||
                                                      prodItem.status !==
                                                        "in_progress"
                                                    }
                                                    onClick={() =>
                                                      handleOpenPaused(
                                                        item.id,
                                                        prodItem.id,
                                                      )
                                                    }
                                                  >
                                                    {t("production.operator.actions.pause")}
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isDone}
                                                    onClick={() =>
                                                      handleOpenBlocked(
                                                        item.id,
                                                        prodItem.id,
                                                      )
                                                    }
                                                  >
                                                    {t("production.operator.actions.blocked")}
                                                  </Button>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {item.items.length > 0 && !isConstructionTracking ? (
                              <div className="mt-3 rounded-md border border-border bg-muted/20 px-2 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    {isReceiptOnlyTracking
                                      ? t("production.operator.queue.receiptAction")
                                      : t("production.operator.queue.batchActions")}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {!isReceiptOnlyTracking ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        disabled={
                                          isBatchDone ||
                                          (hasBatchStarted &&
                                            !isBatchBlocked &&
                                            !isBatchPaused) ||
                                          batchStartLockedByDate ||
                                          hasBlockingDependenciesForBatch ||
                                          isBatchStarting
                                        }
                                        onClick={() =>
                                          handleRunStatusUpdate(
                                            item.id,
                                            "in_progress",
                                          )
                                        }
                                      >
                                        {isBatchBlocked || isBatchPaused
                                          ? t("production.operator.actions.resume")
                                          : t("production.operator.actions.start")}
                                      </Button>
                                    ) : null}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      disabled={
                                        (!isReceiptOnlyTracking &&
                                          (!hasBatchStarted ||
                                            isBatchDone ||
                                            isBatchBlocked ||
                                            isBatchPaused)) ||
                                        (isReceiptOnlyTracking &&
                                          (isBatchDone ||
                                            isFuturePlannedDate(item.plannedDate) ||
                                            hasBlockingDependenciesForBatch)) ||
                                        isBatchCompleting
                                      }
                                      onClick={() =>
                                        handleRunStatusUpdate(item.id, "done")
                                      }
                                    >
                                      {isReceiptOnlyTracking
                                        ? t("production.operator.actions.received")
                                        : t("production.operator.actions.done")}
                                    </Button>
                                    {!isReceiptOnlyTracking ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={
                                          isBatchDone ||
                                          isBatchPaused ||
                                          item.status !== "in_progress"
                                        }
                                        onClick={() => handleOpenPaused(item.id)}
                                      >
                                        {t("production.operator.actions.pause")}
                                      </Button>
                                    ) : null}
                                    {!isReceiptOnlyTracking ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isBatchDone}
                                        onClick={() => handleOpenBlocked(item.id)}
                                      >
                                        {t("production.operator.actions.blocked")}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                {batchStartLockedByDate && item.plannedDate ? (
                                  <div className="mt-1 text-[10px] text-amber-600">
                                    {t("production.operator.queue.availableOn", {
                                      date: formatDate(item.plannedDate),
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {item.attachments.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-2 text-xs"
                                  onClick={async () => {
                                    const next = new Set(expandedJobs);
                                    if (next.has(item.id)) {
                                      next.delete(item.id);
                                      setExpandedJobs(next);
                                      return;
                                    }
                                    next.add(item.id);
                                    setExpandedJobs(next);
                                    if (!signingJobs.has(item.id)) {
                                      setSigningJobs((prev) => {
                                        const updated = new Set(prev);
                                        updated.add(item.id);
                                        return updated;
                                      });
                                      await signAttachments(
                                        item.attachments.filter(
                                          (attachment) =>
                                            !signedUrls[attachment.id],
                                        ),
                                      );
                                      setSigningJobs((prev) => {
                                        const updated = new Set(prev);
                                        updated.delete(item.id);
                                        return updated;
                                      });
                                    }
                                  }}
                                >
                                  {signingJobs.has(item.id) ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                  ) : null}
                                  {expandedJobs.has(item.id) ? (
                                    <ChevronUpIcon className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDownIcon className="h-3.5 w-3.5" />
                                  )}
                                  {expandedJobs.has(item.id)
                                    ? t("production.operator.files.hide")
                                    : t("production.operator.files.show")}
                                </Button>
                                {expandedJobs.has(item.id) ? (
                                  <div className="space-y-2">
                                    {signingJobs.has(item.id) ? (
                                      <div className="text-xs text-muted-foreground">
                                        {t("production.operator.files.loading")}
                                      </div>
                                    ) : null}
                                    {item.attachments.map((attachment) => {
                                      const signedUrl =
                                        signedUrls[attachment.id];
                                      return (
                                        <a
                                          key={attachment.id}
                                          href={
                                            signedUrl ?? attachment.url ?? "#"
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex items-center gap-3 rounded-md border border-border px-2 py-2 text-xs hover:bg-muted/30"
                                        >
                                          {renderAttachmentIcon(attachment)}
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">
                                              {attachment.name}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">
                                              {attachment.created_at
                                                ? formatDate(
                                                    attachment.created_at.slice(
                                                      0,
                                                      10,
                                                    ),
                                                  )
                                                : ""}
                                            </div>
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isMobileSearchOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[1.5px] md:hidden">
          <div className="w-full px-4 pb-[calc(env(safe-area-inset-bottom)-2px)]">
            <div className="flex items-center gap-2">
              <Input
                ref={mobileSearchInputRef}
                type="search"
                autoFocus
                icon="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyFiltersToUrl({ q: searchQuery });
                    closeMobileSearch();
                  }
                }}
                placeholder={t("production.operator.search.search")}
                enterKeyHint="search"
                className="h-12 text-[16px]"
                wrapperClassName="rounded-full border-border bg-background shadow-lg"
              />
              <button
                type="button"
                onClick={closeMobileSearch}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg"
                aria-label={t("production.operator.search.close")}
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="fixed inset-0 -z-10 h-full w-full"
            aria-label={t("production.operator.search.closeOverlay")}
            onClick={closeMobileSearch}
          />
        </div>
      ) : null}

      <BottomSheet
        open={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        ariaLabel={t("production.operator.filters.aria")}
        title={t("production.operator.filters.title")}
        closeButtonLabel={t("production.operator.filters.close")}
        keyboardAware
        enableSwipeToClose
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
          <DatePicker
            label={t("production.operator.filters.date")}
            value={selectedDate}
            onChange={(value) => applyFiltersToUrl({ date: value || today })}
          />
          <SelectField
            label={t("production.operator.filters.status")}
            value={statusFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ status: value as QueueStatusFilter })
            }
          >
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ status: value as QueueStatusFilter })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder={t("production.operator.status.all")} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            label={t("production.operator.filters.priority")}
            value={priorityFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ priority: value as "all" | Priority })
            }
          >
            <Select
              value={priorityFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ priority: value as "all" | Priority })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={t("production.operator.priority.all")}
                />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <Button
            type="button"
            variant={onlyBlocked ? "secondary" : "outline"}
            className="w-full"
            onClick={() => applyFiltersToUrl({ blocked: !onlyBlocked })}
          >
            {blockedOnlyLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsFiltersOpen(false);
              setQueryParams({
                date: today,
                station: stationFilter ?? null,
                order: null,
                status: null,
                priority: null,
                q: null,
                blocked: null,
              });
            }}
          >
            {t("production.operator.filters.reset")}
          </Button>
        </div>
      </BottomSheet>

      <QrScannerModal
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onResolved={handleScannerResolved}
      />
      {scannerError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {scannerError}
        </div>
      ) : null}

      <BottomSheet
        open={isQuickActionOpen}
        onClose={closeQuickAction}
        ariaLabel={t("production.operator.quickActions.aria")}
        title={
          quickActionItem
            ? `${quickActionItem.orderNumber} / ${quickActionItem.batchCode}`
            : t("production.operator.quickActions.title")
        }
        closeButtonLabel={t("production.operator.quickActions.close")}
        keyboardAware
        enableSwipeToClose
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
          {quickActionItem ? (
            <>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div>{quickActionItem.customerName}</div>
                <div className="mt-1">
                  {t("production.operator.queue.pieces", {
                    count: quickActionItem.totalQty,
                  })}
                  {quickActionItem.material
                    ? ` - ${quickActionItem.material}`
                    : ""}
                  {quickActionItem.plannedDate
                    ? ` - ${t("production.operator.quickActions.planned", {
                        date: formatDate(quickActionItem.plannedDate),
                      })}`
                    : ""}
                </div>
              </div>
              {quickActionItem.trackingMode !== "construction_level" ? (
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {quickActionItem.trackingMode === "receipt_only"
                        ? t("production.operator.queue.receiptAction")
                        : t("production.operator.queue.batchActions")}
                    </div>
                    <Badge variant={statusBadge(quickActionItem.status)}>
                      {runStatusLabel(quickActionItem.status ?? "queued")}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickActionItem.trackingMode !== "receipt_only" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={
                          quickActionItem.status === "done" ||
                          quickActionItem.status === "in_progress" ||
                          isFuturePlannedDate(quickActionItem.plannedDate) ||
                          isRunActionLoading(quickActionItem.id, "in_progress")
                        }
                        onClick={() =>
                          handleRunStatusUpdate(quickActionItem.id, "in_progress")
                        }
                      >
                        {quickActionItem.status === "blocked" ||
                        quickActionItem.status === "paused"
                          ? t("production.operator.actions.resume")
                          : t("production.operator.actions.start")}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        (quickActionItem.trackingMode !== "receipt_only" &&
                          (quickActionItem.status === "done" ||
                            quickActionItem.status === "paused")) ||
                        (quickActionItem.trackingMode === "receipt_only" &&
                          (quickActionItem.status === "done" ||
                            isFuturePlannedDate(quickActionItem.plannedDate) ||
                            quickActionHasBlockingDependenciesForBatch)) ||
                        isRunActionLoading(quickActionItem.id, "done")
                      }
                      onClick={() =>
                        handleRunStatusUpdate(quickActionItem.id, "done")
                      }
                    >
                      {quickActionItem.trackingMode === "receipt_only"
                        ? t("production.operator.actions.received")
                        : t("production.operator.actions.done")}
                    </Button>
                    {quickActionItem.trackingMode !== "receipt_only" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          quickActionItem.status === "done" ||
                          quickActionItem.status === "paused" ||
                          quickActionItem.status !== "in_progress"
                        }
                        onClick={() => handleOpenPaused(quickActionItem.id)}
                      >
                        {t("production.operator.actions.pause")}
                      </Button>
                    ) : null}
                    {quickActionItem.trackingMode !== "receipt_only" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={quickActionItem.status === "done"}
                        onClick={() => handleOpenBlocked(quickActionItem.id)}
                      >
                        {t("production.operator.actions.blocked")}
                      </Button>
                    ) : null}
                  </div>
                  {isFuturePlannedDate(quickActionItem.plannedDate) &&
                  quickActionItem.plannedDate ? (
                    <div className="mt-1 text-[11px] text-amber-600">
                      {t("production.operator.queue.availableOn", {
                        date: formatDate(quickActionItem.plannedDate),
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {quickActionItem.trackingMode === "construction_level"
                ? quickActionVisibleItems.map((prodItem) => {
                    const hasStarted =
                      Boolean(prodItem.started_at) ||
                      prodItem.status === "in_progress" ||
                      prodItem.status === "paused";
                    const isBlocked = prodItem.status === "blocked";
                    const isPaused = prodItem.status === "paused";
                    const isDone = prodItem.status === "done";
                    const startLockedByDate =
                      !hasStarted &&
                      !isBlocked &&
                      isFuturePlannedDate(quickActionItem.plannedDate);
                    const isStarting = isActionLoading(
                      prodItem.id,
                      "in_progress",
                    );
                    const isCompleting = isActionLoading(prodItem.id, "done");
                    return (
                      <div
                        key={prodItem.id}
                        className="rounded-md border border-border bg-background px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            {prodItem.item_name}
                          </div>
                          <Badge variant={statusBadge(prodItem.status)}>
                            {runStatusLabel(prodItem.status ?? "queued")}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("production.operator.queue.qty", {
                            qty: prodItem.qty,
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={
                              isDone ||
                              (hasStarted && !isBlocked && !isPaused) ||
                              startLockedByDate ||
                              isStarting
                            }
                            onClick={() =>
                              handleUserStatusUpdate(
                                prodItem.id,
                                quickActionItem.id,
                                "in_progress",
                              )
                            }
                          >
                            {isBlocked || isPaused
                              ? t("production.operator.actions.resume")
                              : t("production.operator.actions.start")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !hasStarted ||
                              isDone ||
                              isBlocked ||
                              isPaused ||
                              isCompleting
                            }
                            onClick={() =>
                              handleUserStatusUpdate(
                                prodItem.id,
                                quickActionItem.id,
                                "done",
                              )
                            }
                          >
                            {t("production.operator.actions.done")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              isDone ||
                              isPaused ||
                              prodItem.status !== "in_progress"
                            }
                            onClick={() =>
                              handleOpenPaused(quickActionItem.id, prodItem.id)
                            }
                          >
                            {t("production.operator.actions.pause")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isDone}
                            onClick={() =>
                              handleOpenBlocked(quickActionItem.id, prodItem.id)
                            }
                          >
                            {t("production.operator.actions.blocked")}
                          </Button>
                        </div>
                        {startLockedByDate && quickActionItem.plannedDate ? (
                          <div className="mt-1 text-[11px] text-amber-600">
                            {t("production.operator.queue.availableOn", {
                              date: formatDate(quickActionItem.plannedDate),
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
              {quickActionVisibleItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {t("production.operator.quickActions.noConstructions")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {t("production.operator.quickActions.orderNotFound")}
            </div>
          )}
        </div>
      </BottomSheet>

      {!isWarehouseQueueView ? (
      <SideDrawer
        open={isProfilePanelOpen}
        onClose={() => setIsProfilePanelOpen(false)}
        ariaLabel={t("production.operator.profile.aria")}
        closeButtonLabel={t("production.operator.profile.closePanel")}
        side="right"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">
              {t("production.operator.profile.title")}
            </h3>
            <button
              type="button"
              className="text-sm text-muted-foreground"
              onClick={() => setIsProfilePanelOpen(false)}
            >
              {t("production.operator.common.close")}
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {userInitials || "U"}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold">{currentUser.name}</div>
                <div className="text-sm text-muted-foreground">
                  {userRoleLabel}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  {t("production.operator.profile.todayDone")}
                </div>
                <div className="text-lg font-semibold">
                  {activitySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  {t("production.operator.profile.todayTime")}
                </div>
                <div className="text-lg font-semibold">
                  {formatDuration(activitySummary.minutes)}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  {t("production.operator.profile.weekDone")}
                </div>
                <div className="text-lg font-semibold">
                  {weeklySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  {t("production.operator.profile.weekTime")}
                </div>
                <div className="text-lg font-semibold">
                  {formatDuration(weeklySummary.minutes)}
                </div>
              </div>
            </div>
            <div className="space-y-2 pb-2">
              <ThemeToggle
                variant="menu"
                className="rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
              />
              <Link
                href="/profile"
                onClick={() => setIsProfilePanelOpen(false)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <UserCircle2Icon className="h-4 w-4" />
                {t("production.operator.profile.openProfile")}
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => {
                  setIsProfilePanelOpen(false);
                  void signOut();
                }}
              >
                <LogOutIcon className="h-4 w-4" />
                {t("production.operator.profile.signOut")}
              </button>
            </div>
          </div>
        </div>
      </SideDrawer>
      ) : null}

      {!isWarehouseQueueView ? (
      <div
        className={`fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex ${isProfilePanelOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!isProfilePanelOpen}
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {t("production.operator.profile.title")}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsProfilePanelOpen(false)}
            >
              {t("production.operator.common.close")}
            </Button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {userInitials || "U"}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold">{currentUser.name}</div>
                <div className="text-sm text-muted-foreground">
                  {userRoleLabel}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <ActivityIcon className="mr-1 inline h-3.5 w-3.5" />
                  {t("production.operator.profile.todayDone")}
                </div>
                <div className="text-lg font-semibold">
                  {activitySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                  {t("production.operator.profile.todayTime")}
                </div>
                <div className="text-lg font-semibold">
                  {formatDuration(activitySummary.minutes)}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <ActivityIcon className="mr-1 inline h-3.5 w-3.5" />
                  {t("production.operator.profile.weekDone")}
                </div>
                <div className="text-lg font-semibold">
                  {weeklySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                  {t("production.operator.profile.weekTime")}
                </div>
                <div className="text-lg font-semibold">
                  {formatDuration(weeklySummary.minutes)}
                </div>
              </div>
            </div>
            <ThemeToggle
              variant="menu"
              className="rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
            />
            <div className="flex gap-2">
              <Link href="/profile" className="flex-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setIsProfilePanelOpen(false)}
                >
                  <SettingsIcon className="h-4 w-4" />
                  {t("production.operator.profile.openProfile")}
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setIsProfilePanelOpen(false);
                  void signOut();
                }}
              >
                <LogOutIcon className="h-4 w-4" />
                {t("production.operator.profile.signOut")}
              </Button>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      <div
        className={`fixed inset-x-4 z-30 transition-all duration-200 md:hidden ${
          isWarehouseQueueView
            ? "bottom-[calc(6.75rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(2.75rem+env(safe-area-inset-bottom))]"
        } ${
          hideMobileFloatingControls
            ? "translate-y-16 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsFiltersOpen(true)}
              aria-label={t("production.operator.fab.openFilters")}
            >
              <SlidersHorizontalIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={openMobileSearch}
              aria-label={t("production.operator.fab.openSearch")}
            >
              <SearchIcon className="h-5 w-5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full bg-card shadow-lg"
            onClick={() => setIsScannerOpen(true)}
            aria-label={t("production.operator.fab.scanQr")}
          >
            <QrCodeIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <BottomSheet
        open={Boolean(blockedRunId)}
        onClose={closeBlockedDialog}
        ariaLabel={t("production.operator.blocked.markAsBlocked")}
        closeButtonLabel={t("production.operator.blocked.closeDialog")}
        title={t("production.operator.blocked.markAsBlocked")}
        keyboardAware
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3 md:hidden">
          {blockedDialogContent}
        </div>
      </BottomSheet>

      {blockedRunId ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 px-4 md:flex">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t("production.operator.blocked.markAsBlocked")}
              </h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={closeBlockedDialog}
              >
                {t("production.operator.common.close")}
              </button>
            </div>
            <div className="mt-4">{blockedDialogContent}</div>
          </div>
        </div>
      ) : null}

      <BottomSheet
        open={Boolean(pausedRunId)}
        onClose={closePausedDialog}
        ariaLabel={t("production.operator.paused.markAsPaused")}
        closeButtonLabel={t("production.operator.paused.closeDialog")}
        title={t("production.operator.paused.markAsPaused")}
        keyboardAware
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3 md:hidden">
          {pausedDialogContent}
        </div>
      </BottomSheet>

      {pausedRunId ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 px-4 md:flex">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t("production.operator.paused.markAsPaused")}
              </h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={closePausedDialog}
              >
                {t("production.operator.common.close")}
              </button>
            </div>
            <div className="mt-4">{pausedDialogContent}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


