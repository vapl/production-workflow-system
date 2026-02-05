"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrentUser } from "@/contexts/UserContext";
import { formatDate } from "@/lib/domain/formatters";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
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
  status: "queued" | "in_progress" | "blocked" | "done";
  station_id: string | null;
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
  started_at: string | null;
  done_at: string | null;
  orders?: {
    order_number: string | null;
    due_date: string | null;
    priority: Priority | null;
    customer_name: string | null;
  } | null;
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
    orderNumber: string;
    customerName: string;
    dueDate: string;
    priority: Priority;
    status: BatchRunRow["status"];
    batchCode: string;
    totalQty: number;
    material: string;
    attachments: OrderAttachmentRow[];
    blockedReason?: string | null;
    startedAt?: string | null;
    doneAt?: string | null;
  };

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

function getStoragePathFromUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    return url;
  }
  return url.slice(index + marker.length);
}

function renderAttachmentIcon(attachment: OrderAttachmentRow, signedUrl?: string) {
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

  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
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
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = currentUser.id
    ? `pws_operator_cache_${currentUser.id}`
    : "";
  const [stations, setStations] = useState<Station[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [attachments, setAttachments] = useState<OrderAttachmentRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [signingJobs, setSigningJobs] = useState<Set<string>>(new Set());
  const [workdayStart, setWorkdayStart] = useState("08:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
  const [stopReasons, setStopReasons] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [blockedRunId, setBlockedRunId] = useState<string | null>(null);
  const [blockedReasonId, setBlockedReasonId] = useState<string>("");
  const [blockedReasonText, setBlockedReasonText] = useState<string>("");
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";

  useEffect(() => {
    if (!supabase || !currentUser.id) {
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
            productionItems: ProductionItemRow[];
            attachments: OrderAttachmentRow[];
            tenantId?: string | null;
          };
          if (
            cached &&
            Date.now() - cached.cachedAt < 15000 &&
            cached.tenantId === currentUser.tenantId
          ) {
            setStations(cached.stations ?? []);
            setBatchRuns(cached.batchRuns ?? []);
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
      const { data: assignments, error: assignmentsError } = await supabase
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
        setProductionItems([]);
        setAttachments([]);
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const [stationsResult, runsResult] = await Promise.all([
        supabase
          .from("workstations")
          .select("id, name, sort_order")
          .in("id", stationIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
          )
          .in("station_id", stationIds)
          .order("created_at", { ascending: false }),
      ]);
      if (!isMounted) {
        return;
      }
      if (stationsResult.error || runsResult.error) {
        setDataError("Failed to load production queue.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const runs = (runsResult.data ?? []) as BatchRunRow[];
      const orderIds = Array.from(
        new Set(runs.map((run) => run.order_id)),
      ).filter(Boolean);

      const [itemsResult, attachmentsResult] = await Promise.all([
        orderIds.length === 0
          ? Promise.resolve({ data: [] as ProductionItemRow[], error: null })
          : supabase
              .from("production_items")
              .select(
                "id, order_id, batch_code, item_name, qty, material, status, station_id",
              )
              .in("order_id", orderIds),
        orderIds.length === 0
          ? Promise.resolve({ data: [] as OrderAttachmentRow[], error: null })
          : supabase
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
      setProductionItems((itemsResult.data ?? []) as ProductionItemRow[]);
      setAttachments(
        (attachmentsResult.data ?? []) as OrderAttachmentRow[],
      );
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
              productionItems: itemsResult.data ?? [],
              attachments: attachmentsResult.data ?? [],
              tenantId: currentUser.tenantId ?? null,
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
  }, [currentUser.id, currentUser.tenantId, cacheKey]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let isMounted = true;
    const loadReasons = async () => {
      const { data, error } = await supabase
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
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("workday_start, workday_end")
        .eq("tenant_id", currentUser.tenantId)
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
  }, [currentUser.tenantId]);

  const signAttachments = async (list: OrderAttachmentRow[]) => {
    if (!supabase || list.length === 0) {
      return;
    }
    const results = await Promise.all(
      list.map(async (attachment) => {
        if (!attachment.url) {
          return { id: attachment.id, url: undefined };
        }
        if (storagePublicPrefix && attachment.url.startsWith(storagePublicPrefix)) {
          const path = getStoragePathFromUrl(attachment.url, supabaseBucket);
          const { data } = await supabase.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }
        if (attachment.url.startsWith("http")) {
          return { id: attachment.id, url: attachment.url };
        }
        const { data } = await supabase.storage
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

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    stations.forEach((station) => map.set(station.id, []));
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
      if (run.step_index > 0) {
        const prevKey = `${run.order_id}-${run.batch_code}-${run.step_index - 1}`;
        const prevRun = runMap.get(prevKey);
        if (!prevRun || prevRun.status !== "done") {
          return;
        }
      }
      const items = productionItems.filter(
        (item) =>
          item.order_id === run.order_id && item.batch_code === run.batch_code,
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
          attachments: attachmentsByOrder.get(run.order_id) ?? [],
          blockedReason: run.blocked_reason ?? null,
          startedAt: run.started_at,
          doneAt: run.done_at,
        } satisfies QueueItem;
      map.get(run.station_id)?.push(queueItem);
    });
    return map;
  }, [batchRuns, productionItems, stations, attachmentsByOrder]);

  const updateStatus = async (
    id: string,
    status: BatchRunRow["status"],
    extra?: { blockedReason?: string | null; blockedReasonId?: string | null },
  ) => {
    if (!supabase) {
      return;
    }
    const run = batchRuns.find((item) => item.id === id);
    if (!run) {
      return;
    }
    const now = new Date().toISOString();
    const isBlocked = status === "blocked";
    const { error } = await supabase
      .from("batch_runs")
      .update({
        status,
        started_at: status === "in_progress" ? now : run.started_at,
        done_at: status === "done" ? now : run.done_at,
        blocked_reason: isBlocked ? extra?.blockedReason ?? null : null,
        blocked_reason_id: isBlocked ? extra?.blockedReasonId ?? null : null,
        blocked_at: isBlocked ? now : null,
        blocked_by: isBlocked ? currentUser.id : null,
      })
      .eq("id", id);
    if (error) {
      setDataError("Failed to update batch status.");
      return;
    }
    await supabase
      .from("production_items")
      .update({ status })
      .eq("order_id", run.order_id)
      .eq("batch_code", run.batch_code);
    setBatchRuns((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              started_at: status === "in_progress" ? now : item.started_at,
              done_at: status === "done" ? now : item.done_at,
              blocked_reason: isBlocked
                ? extra?.blockedReason ?? null
                : null,
              blocked_reason_id: isBlocked
                ? extra?.blockedReasonId ?? null
                : null,
            }
          : item,
      ),
    );
    setProductionItems((prev) =>
      prev.map((item) =>
        item.order_id === run.order_id && item.batch_code === run.batch_code
          ? { ...item, status }
          : item,
      ),
    );
  };

  const handleOpenBlocked = (runId: string) => {
    setBlockedRunId(runId);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleConfirmBlocked = async () => {
    if (!blockedRunId) {
      return;
    }
    const manual = blockedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === blockedReasonId)?.label ??
      "";
    const reason = manual || selectedLabel || "Blocked";
    await updateStatus(blockedRunId, "blocked", {
      blockedReason: reason,
      blockedReasonId: blockedReasonId || null,
    });
    setBlockedRunId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  if (!currentUser.isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Station queue</h2>
          <p className="text-sm text-muted-foreground">
            All my stations - Planned {formatDate(today)}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {currentUser.name}
        </div>
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

      {!isLoading && stations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No stations assigned yet. Ask admin to assign you to a station.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stations.map((station) => {
          const queue = queueByStation.get(station.id) ?? [];
          return (
            <Card key={station.id} className="min-h-[240px]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{station.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {queue.length} items
                  </span>
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
                          <Badge variant={priorityBadge(item.priority)}>
                            {item.priority}
                          </Badge>
                          <Badge variant={statusBadge(item.status)}>
                            {String(item.status ?? "queued").replace("_", " ")}
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
                      {item.status === "blocked" && item.blockedReason ? (
                        <div className="mt-1 text-xs text-rose-600">
                          Blocked: {item.blockedReason}
                        </div>
                      ) : null}
                      {elapsedLabel ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Time: {elapsedLabel}
                        </div>
                      ) : null}
                          </>
                        );
                      })()}
                      {item.attachments.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
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
                                await signAttachments(item.attachments.filter(
                                  (attachment) => !signedUrls[attachment.id],
                                ));
                                setSigningJobs((prev) => {
                                  const updated = new Set(prev);
                                  updated.delete(item.id);
                                  return updated;
                                });
                              }
                            }}
                          >
                            {expandedJobs.has(item.id) ? "Hide files" : "Show files"}
                          </Button>
                          {expandedJobs.has(item.id) ? (
                            <div className="space-y-2">
                              {signingJobs.has(item.id) ? (
                                <div className="text-xs text-muted-foreground">
                                  Loading files...
                                </div>
                              ) : null}
                              {item.attachments.map((attachment) => {
                                const signedUrl = signedUrls[attachment.id];
                                return (
                                  <a
                                    key={attachment.id}
                                    href={signedUrl ?? attachment.url ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 rounded-md border border-border px-2 py-2 text-xs hover:bg-muted/30"
                                  >
                                    {renderAttachmentIcon(attachment, signedUrl)}
                                    <div className="flex-1">
                                      <div className="font-medium">
                                        {attachment.name}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground">
                                        {attachment.created_at
                                          ? formatDate(
                                              attachment.created_at.slice(0, 10),
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
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatus(item.id, "in_progress")}
                        >
                          Start
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatus(item.id, "done")}
                        >
                          Done
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenBlocked(item.id)}
                        >
                          Blocked
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {blockedRunId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Mark as blocked</h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={() => setBlockedRunId(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="space-y-1 text-xs text-muted-foreground">
                Reason template
                <select
                  value={blockedReasonId}
                  onChange={(event) => setBlockedReasonId(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                >
                  <option value="">Select reason...</option>
                  {stopReasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Manual note
                <textarea
                  value={blockedReasonText}
                  onChange={(event) => setBlockedReasonText(event.target.value)}
                  placeholder="Type a custom reason..."
                  className="min-h-[90px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setBlockedRunId(null)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmBlocked}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
