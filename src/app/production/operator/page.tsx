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
import { formatDate } from "@/lib/domain/formatters";
import { type ResolveScanTargetResult } from "@/lib/qr/resolveScanTarget";
import {
  computeWorkingMinutes,
  parseWorkingCalendar,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
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
  meta?: Record<string, unknown> | null;
  started_at?: string | null;
  done_at?: string | null;
  duration_minutes?: number | null;
  created_at?: string | null;
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
  batchCode: string;
  totalQty: number;
  material: string;
  attachments: OrderAttachmentRow[];
  startedAt?: string | null;
  doneAt?: string | null;
  items: ProductionItemRow[];
};

type PendingAction = {
  itemId: string;
  action: "in_progress" | "done" | "blocked";
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
  if (status === "pending") return "status-pending";
  if (status === "in_progress") return "status-in_engineering";
  if (status === "done") return "status-ready_for_production";
  return "status-draft";
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

function renderAttachmentIcon(
  attachment: OrderAttachmentRow,
  signedUrl?: string,
) {
  const name = attachment.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isImage =
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp");

  if (isImage && signedUrl) {
    return (
      <img
        src={signedUrl}
        alt={attachment.name}
        className="h-9 w-9 rounded-md border border-border object-cover"
      />
    );
  }

  if (isPdf) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <FileTextIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  ) {
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
  const currentUser = useCurrentUser();
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
  const [scannerError, setScannerError] = useState("");
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const cacheKey =
    currentUser.id && selectedDate
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activityEvents, setActivityEvents] = useState<StatusEventRow[]>([]);
  const [activityError, setActivityError] = useState("");
  const [todayWorkedMinutes, setTodayWorkedMinutes] = useState(0);
  const [weekWorkedMinutes, setWeekWorkedMinutes] = useState(0);
  const [notificationRoles, setNotificationRoles] = useState<string[]>([
    "Production manager",
    "Admin",
    "Owner",
  ]);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

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
            setStations(cached.stations ?? []);
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
      const [stationsResult, runsResult, depsResult] = await Promise.all([
        sb
          .from("workstations")
          .select("id, name, sort_order")
          .in("id", stationIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, started_at, done_at, duration_minutes, orders (order_number, due_date, priority, customer_name)",
          )
          .in("station_id", stationIds)
          .eq("planned_date", selectedDate)
          .order("created_at", { ascending: false }),
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
  }, [currentUser.id, currentUser.tenantId, cacheKey, selectedDate]);

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

  const computeRunStatus = (items: ProductionItemRow[]) => {
    if (items.length === 0) {
      return "queued" as BatchRunRow["status"];
    }
    if (items.every((item) => item.status === "done")) {
      return "done" as BatchRunRow["status"];
    }
    if (items.some((item) => item.status === "in_progress")) {
      return "in_progress" as BatchRunRow["status"];
    }
    if (items.some((item) => item.status === "queued")) {
      return "queued" as BatchRunRow["status"];
    }
    if (items.some((item) => item.status === "pending")) {
      return "pending" as BatchRunRow["status"];
    }
    if (items.some((item) => item.status === "blocked")) {
      return "blocked" as BatchRunRow["status"];
    }
    return "queued" as BatchRunRow["status"];
  };

  const visibleStations = useMemo(() => {
    if (!stationFilter) {
      return stations;
    }
    return stations.filter((station) => station.id === stationFilter);
  }, [stations, stationFilter]);

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    visibleStations.forEach((station) => map.set(station.id, []));
    const runMap = new Map<string, BatchRunRow>();
    batchRuns.forEach((run) => {
      runMap.set(`${run.order_id}-${run.batch_code}-${run.step_index}`, run);
    });
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
        status: computeRunStatus(items),
        batchCode: run.batch_code,
        totalQty,
        material,
        attachments: attachmentsByOrder.get(run.order_id) ?? [],
        startedAt: run.started_at,
        doneAt: run.done_at,
        items: dedupedItems,
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
    extra?: { blockedReason?: string | null; blockedReasonId?: string | null },
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
    const wasBlocked = targetItem.status === "blocked";
    const isBlocked = status === "blocked";
    const isResumed = wasBlocked && status === "in_progress";
    const nextStartedAt =
      status === "in_progress"
        ? (targetItem.started_at ?? now)
        : targetItem.started_at;
    const nextDoneAt = status === "done" ? now : targetItem.done_at;
    const nextDurationMinutes =
      status === "done"
        ? computeWorkingMinutes(nextStartedAt ?? now, now, workingCalendar)
        : (targetItem.duration_minutes ?? null);
    const nextMeta = {
      ...(targetItem.meta ?? {}),
      blocked_reason: isBlocked ? (extra?.blockedReason ?? null) : null,
      blocked_reason_id: isBlocked ? (extra?.blockedReasonId ?? null) : null,
      blocked_at: isBlocked ? now : null,
      blocked_by: isBlocked ? currentUser.id : null,
    };
    const { error } = await sb
      .from("production_items")
      .update({
        status,
        meta: nextMeta,
        started_at: nextStartedAt ?? null,
        done_at: nextDoneAt ?? null,
        duration_minutes: nextDurationMinutes,
      })
      .eq("id", itemId);
    if (error) {
      setDataError("Failed to update item status.");
      return;
    }

    if (currentUser.tenantId) {
      const eventPayload = {
        tenant_id: currentUser.tenantId,
        order_id: run.order_id,
        batch_run_id: run.id,
        production_item_id: targetItem.id,
        from_status: targetItem.status,
        to_status: status,
        reason: extra?.blockedReason ?? null,
        reason_id: extra?.blockedReasonId ?? null,
        actor_user_id: currentUser.id,
      };
      const { data: eventInsertData, error: eventInsertError } = await sb
        .from("production_status_events")
        .insert(eventPayload)
        .select(
          "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at",
        )
        .maybeSingle();
      if (!eventInsertError && eventInsertData) {
        setActivityEvents((prev) => [
          eventInsertData as StatusEventRow,
          ...prev,
        ]);
      }
    }

    if (status === "blocked" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber = run.orders?.order_number ?? "Order";
      const reason =
        extra?.blockedReason ??
        (nextMeta.blocked_reason as string) ??
        "Blocked";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production manager", "Admin", "Owner"];
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
          : ["Production manager", "Admin", "Owner"];
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
    if (status === "done" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber = run.orders?.order_number ?? "Order";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production manager", "Admin", "Owner"];
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
    setProductionItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status,
              meta: nextMeta,
              started_at: nextStartedAt ?? item.started_at ?? null,
              done_at: nextDoneAt ?? item.done_at ?? null,
              duration_minutes: nextDurationMinutes,
            }
          : item,
      ),
    );
    const stationItems = productionItems
      .map((item) =>
        item.id === itemId ? { ...item, status, meta: nextMeta } : item,
      )
      .filter(
        (item) =>
          item.order_id === run.order_id &&
          item.batch_code === run.batch_code &&
          item.station_id === run.station_id,
      );
    const nextRunStatus = computeRunStatus(stationItems);
    if (nextRunStatus !== run.status) {
      const nextRunDuration =
        nextRunStatus === "done"
          ? stationItems.reduce(
              (sum, item) => sum + Number(item.duration_minutes ?? 0),
              0,
            )
          : (run.duration_minutes ?? null);
      const { error: runError } = await sb
        .from("batch_runs")
        .update({
          status: nextRunStatus,
          started_at:
            nextRunStatus === "in_progress"
              ? (run.started_at ?? now)
              : run.started_at,
          done_at:
            nextRunStatus === "done" ? (run.done_at ?? now) : run.done_at,
          duration_minutes: nextRunDuration,
        })
        .eq("id", runId);
      if (runError) {
        setDataError("Failed to update batch status.");
        return;
      }
      setBatchRuns((prev) =>
        prev.map((item) =>
          item.id === runId
            ? {
                ...item,
                status: nextRunStatus,
                started_at:
                  nextRunStatus === "in_progress"
                    ? (item.started_at ?? now)
                    : item.started_at,
                done_at:
                  nextRunStatus === "done"
                    ? (item.done_at ?? now)
                    : item.done_at,
                duration_minutes: nextRunDuration,
              }
            : item,
        ),
      );
    }

    if (nextRunStatus === "done") {
      const orderItems = productionItems
        .map((item) =>
          item.id === itemId ? { ...item, status, meta: nextMeta } : item,
        )
        .filter((item) => item.order_id === run.order_id);
      if (
        orderItems.length > 0 &&
        orderItems.every((item) => item.status === "done")
      ) {
        const totalDuration = orderItems.reduce(
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
    extra?: { blockedReason?: string | null; blockedReasonId?: string | null },
  ) => {
    if (pendingAction) {
      return;
    }
    setPendingAction({ itemId, action: status });
    try {
      await updateItemStatus(itemId, runId, status, extra);
    } finally {
      setPendingAction(null);
    }
  };

  const isActionLoading = (itemId: string, action: PendingAction["action"]) =>
    pendingAction?.itemId === itemId && pendingAction.action === action;

  useEffect(() => {
    if (!supabase || productionItems.length === 0) {
      return;
    }
    const updates: Array<{
      itemId: string;
      runId: string;
      status: BatchRunRow["status"];
    }> = [];

    productionItems.forEach((item) => {
      if (!item.station_id) {
        return;
      }
      if (
        item.status === "in_progress" ||
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
        updates.push({ itemId: item.id, runId: run.id, status: desiredStatus });
      }
    });

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

  const handleOpenBlocked = (runId: string, itemId: string) => {
    setBlockedRunId(runId);
    setBlockedItemId(itemId);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleConfirmBlocked = async () => {
    if (!blockedRunId || !blockedItemId) {
      return;
    }
    const manual = blockedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === blockedReasonId)?.label ?? "";
    const reason = manual || selectedLabel || "Blocked";
    await handleUserStatusUpdate(blockedItemId, blockedRunId, "blocked", {
      blockedReason: reason,
      blockedReasonId: blockedReasonId || null,
    });
    setBlockedRunId(null);
    setBlockedItemId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
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
      return false;
    }
    setScannerError("");
    if (result.targetRoute.startsWith("/qr/")) {
      const message = "QR code is not linked to an order in this queue.";
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
      return false;
    }
    if (sb && currentUser.tenantId) {
      await sb.from("qr_scan_events").insert({
        tenant_id: currentUser.tenantId,
        user_id: currentUser.id,
        raw_value: result.rawValue,
        token: result.token,
        result: "success",
        message: null,
        target_route: result.targetRoute,
      });
    }
    router.push(result.targetRoute);
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
    ? `${currentUser.role} / Owner`
    : currentUser.role;

  if (!currentUser.isAuthenticated) {
    return null;
  }

  const headerSubtitle = `All my stations - Planned ${formatDate(selectedDate)}`;
  const closeBlockedDialog = () => {
    setBlockedRunId(null);
    setBlockedItemId(null);
  };
  const blockedDialogContent = (
    <div className="space-y-3 text-sm">
      <SelectField
        label="Reason template"
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
            <SelectValue placeholder="Select reason..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select reason...</SelectItem>
            {stopReasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectField>
      <TextAreaField
        label="Manual note"
        labelClassName="text-xs text-muted-foreground"
        value={blockedReasonText}
        onChange={(event) => setBlockedReasonText(event.target.value)}
        placeholder="Type a custom reason..."
        className="min-h-22.5"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={closeBlockedDialog}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirmBlocked}
          disabled={
            blockedItemId ? isActionLoading(blockedItemId, "blocked") : false
          }
          className="gap-2"
        >
          {blockedItemId && isActionLoading(blockedItemId, "blocked") ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <section className="relative flex flex-col gap-3 pt-16 md:pt-0">
      <MobilePageTitle
        title="Station queue"
        subtitle={headerSubtitle}
        showCompact={showCompactMobileTitle}
        className="pt-6 pb-6"
        rightAction={
          <button
            type="button"
            onClick={() => setIsProfilePanelOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm"
            aria-label="Open profile panel"
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
        title="Station queue"
        subtitle={headerSubtitle}
        actions={
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
            placeholder="Search order, batch or customer"
            icon="search"
            className="h-10"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DatePicker
            label="Date"
            value={selectedDate}
            onChange={(value) => applyFiltersToUrl({ date: value || today })}
          />

          <SelectField
            label="Status"
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
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </SelectField>

          <SelectField
            label="Priority"
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
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
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
              {onlyBlocked ? "Blocked only: on" : "Blocked only"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCodeIcon className="h-4 w-4" />
              Scan
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
            Reset filters
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">Started</div>
              <div className="text-xl font-semibold">
                {activitySummary.started}
              </div>
            </div>
            <Badge variant="status-in_engineering">Today</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">Done</div>
              <div className="text-xl font-semibold">
                {activitySummary.done}
              </div>
            </div>
            <Badge variant="status-ready_for_production">Today</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">Blocked</div>
              <div className="text-xl font-semibold">
                {activitySummary.blocked}
              </div>
            </div>
            <Badge variant="status-blocked">Today</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">Work time</div>
              <div className="text-xl font-semibold">
                {formatDuration(activitySummary.minutes)}
              </div>
            </div>
            <Badge variant="status-draft">Accumulated</Badge>
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
          Loading station queue...
        </div>
      ) : null}

      {!isLoading && visibleStations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No stations available for this view. Ask admin to assign you to a
          station.
        </div>
      ) : null}

      {activityError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {activityError}
        </div>
      ) : null}

      {activityEvents.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activityEvents.slice(0, 8).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="text-muted-foreground">
                  {event.from_status ?? "queued"} -&gt;{" "}
                  <span className="font-medium text-foreground">
                    {event.to_status ?? "unknown"}
                  </span>
                  {event.reason ? (
                    <span className="ml-1 text-rose-600">({event.reason})</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(event.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && visibleStations.length > 0 && filteredItemsCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No queue items match selected filters.
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
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-sm"
                    >
                      {(() => {
                        const metaParts: string[] = [];
                        if (item.totalQty > 0) {
                          metaParts.push(`${item.totalQty} pcs`);
                        }
                        if (item.dueDate) {
                          metaParts.push(`Due ${formatDate(item.dueDate)}`);
                        }
                        const metaLine = metaParts.join(" - ");
                        const stationDurationMinutes = item.items.reduce(
                          (sum, row) => sum + Number(row.duration_minutes ?? 0),
                          0,
                        );
                        const orderDurationMinutes =
                          orderDurationMap.get(item.orderId) ?? 0;
                        const hasBlocked = item.items.some(
                          (row) => row.status === "blocked",
                        );
                        const hasActive = item.items.some((row) =>
                          ["queued", "pending", "in_progress"].includes(
                            row.status,
                          ),
                        );
                        const isPartiallyBlocked = hasBlocked && hasActive;
                        const showBlockedStyle =
                          isPartiallyBlocked && item.status === "in_progress";
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
                                  {item.priority}
                                </Badge>
                                <Badge
                                  variant={
                                    showBlockedStyle
                                      ? "status-blocked"
                                      : statusBadge(item.status)
                                  }
                                >
                                  {String(item.status ?? "queued").replace(
                                    "_",
                                    " ",
                                  )}
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
                                Station time:{" "}
                                {formatDuration(stationDurationMinutes)}
                              </div>
                            ) : null}
                            {orderDurationMinutes > 0 ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                Order time:{" "}
                                {formatDuration(orderDurationMinutes)}
                              </div>
                            ) : null}
                            {elapsedLabel ? (
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                Time: {elapsedLabel}
                              </div>
                            ) : null}
                            {item.items.length > 0 ? (
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
                                    ? "Hide constructions"
                                    : "Show constructions"}
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
                                              {String(
                                                prodItem.status ?? "queued",
                                              ).replace("_", " ")}
                                            </Badge>
                                          </div>
                                          <div className="mt-1 text-[11px] text-muted-foreground">
                                            Qty: {prodItem.qty}
                                            {prodItem.material
                                              ? ` - ${prodItem.material}`
                                              : ""}
                                          </div>
                                          {hasBlockingDependencies ? (
                                            <div className="mt-2 space-y-1">
                                              <div className="text-[11px] text-amber-600">
                                                Waiting for
                                              </div>
                                              <div className="flex flex-wrap gap-1">
                                                {blockingDependencies.map(
                                                  (dep) => {
                                                    const name =
                                                      stationsById.get(
                                                        dep.stationId,
                                                      ) ?? "Station";
                                                    return (
                                                      <span
                                                        key={dep.stationId}
                                                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                                                      >
                                                        {name} ·{" "}
                                                        {String(
                                                          dep.status,
                                                        ).replace("_", " ")}
                                                      </span>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            </div>
                                          ) : null}
                                          {itemElapsedLabel ? (
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                              Time: {itemElapsedLabel}
                                            </div>
                                          ) : null}
                                          {prodItem.status === "blocked" &&
                                          blockedReason ? (
                                            <div className="mt-1 text-[11px] text-rose-600">
                                              Blocked: {String(blockedReason)}
                                            </div>
                                          ) : null}
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {(() => {
                                              const hasStarted =
                                                Boolean(prodItem.started_at) ||
                                                prodItem.status ===
                                                  "in_progress";
                                              const isDone =
                                                prodItem.status === "done";
                                              const isBlocked =
                                                prodItem.status === "blocked";
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
                                                        !isBlocked) ||
                                                      (!isBlocked &&
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
                                                    {isBlocked
                                                      ? "Resume"
                                                      : "Start"}
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2"
                                                    disabled={
                                                      !hasStarted ||
                                                      isDone ||
                                                      isBlocked ||
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
                                                    Done
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
                                                    Blocked
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
                                    ? "Hide files"
                                    : "Show files"}
                                </Button>
                                {expandedJobs.has(item.id) ? (
                                  <div className="space-y-2">
                                    {signingJobs.has(item.id) ? (
                                      <div className="text-xs text-muted-foreground">
                                        Loading files...
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
                                          {renderAttachmentIcon(
                                            attachment,
                                            signedUrl,
                                          )}
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
                placeholder="Search"
                enterKeyHint="search"
                className="h-12 text-[16px]"
                wrapperClassName="rounded-full border-border bg-background shadow-lg"
              />
              <button
                type="button"
                onClick={closeMobileSearch}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg"
                aria-label="Close search"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="fixed inset-0 -z-10 h-full w-full"
            aria-label="Close search overlay"
            onClick={closeMobileSearch}
          />
        </div>
      ) : null}

      <BottomSheet
        open={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        ariaLabel="Operator filters"
        title="Filters"
        closeButtonLabel="Close filters"
        keyboardAware
        enableSwipeToClose
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
          <DatePicker
            label="Date"
            value={selectedDate}
            onChange={(value) => applyFiltersToUrl({ date: value || today })}
          />
          <SelectField
            label="Status"
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
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            label="Priority"
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
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </SelectField>
          <Button
            type="button"
            variant={onlyBlocked ? "secondary" : "outline"}
            className="w-full"
            onClick={() => applyFiltersToUrl({ blocked: !onlyBlocked })}
          >
            {onlyBlocked ? "Blocked only: on" : "Blocked only"}
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
            Reset filters
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
        open={isProfilePanelOpen}
        onClose={() => setIsProfilePanelOpen(false)}
        ariaLabel="Operator profile"
        closeButtonLabel="Close profile"
        title="My profile"
        enableSwipeToClose
        keyboardAware
      >
        <div className="space-y-4 px-4 pb-4 pt-3">
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
                Today done
              </div>
              <div className="text-lg font-semibold">
                {activitySummary.done}
              </div>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Today time
              </div>
              <div className="text-lg font-semibold">
                {formatDuration(activitySummary.minutes)}
              </div>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="text-[11px] text-muted-foreground">7d done</div>
              <div className="text-lg font-semibold">{weeklySummary.done}</div>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="text-[11px] text-muted-foreground">7d time</div>
              <div className="text-lg font-semibold">
                {formatDuration(weeklySummary.minutes)}
              </div>
            </div>
          </div>
          <div className="space-y-2">
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
              Open profile
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
              Sign out
            </button>
          </div>
        </div>
      </BottomSheet>

      <div
        className={`fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex ${isProfilePanelOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!isProfilePanelOpen}
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">My profile</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsProfilePanelOpen(false)}
            >
              Close
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
                  Today done
                </div>
                <div className="text-lg font-semibold">
                  {activitySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                  Today time
                </div>
                <div className="text-lg font-semibold">
                  {formatDuration(activitySummary.minutes)}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <ActivityIcon className="mr-1 inline h-3.5 w-3.5" />
                  7d done
                </div>
                <div className="text-lg font-semibold">
                  {weeklySummary.done}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                  7d time
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
                  Open profile
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
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsFiltersOpen(true)}
              aria-label="Open filters"
            >
              <SlidersHorizontalIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={openMobileSearch}
              aria-label="Open search"
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
            aria-label="Scan QR"
          >
            <QrCodeIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <BottomSheet
        open={Boolean(blockedRunId)}
        onClose={closeBlockedDialog}
        ariaLabel="Mark as blocked"
        closeButtonLabel="Close blocked dialog"
        title="Mark as blocked"
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
              <h3 className="text-sm font-semibold">Mark as blocked</h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={closeBlockedDialog}
              >
                Close
              </button>
            </div>
            <div className="mt-4">{blockedDialogContent}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
