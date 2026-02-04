"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
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
  status: "queued" | "in_progress" | "blocked" | "done";
  station_id: string | null;
  meta: Record<string, unknown> | null;
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
  blockedReason?: string | null;
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

function BatchQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 88 })
      .then((url) => {
        if (active) {
          setSrc(url);
        }
      })
      .catch(() => {
        if (active) {
          setSrc("");
        }
      });
    return () => {
      active = false;
    };
  }, [value]);

  return src ? (
    <img
      src={src}
      alt={`QR ${value}`}
      className="h-12 w-12 rounded-md border border-border bg-background"
    />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
      QR
    </div>
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
  const [plannedRangeDays, setPlannedRangeDays] = useState(7);
  const [stations, setStations] = useState<Station[]>([]);
  const [readyOrders, setReadyOrders] = useState<ReadyOrderRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [readySearch, setReadySearch] = useState("");
  const [readyPriority, setReadyPriority] = useState<Priority | "all">("all");
  const [stopReasons, setStopReasons] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [blockedRunId, setBlockedRunId] = useState<string | null>(null);
  const [blockedReasonId, setBlockedReasonId] = useState<string>("");
  const [blockedReasonText, setBlockedReasonText] = useState<string>("");
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, orders (order_number, due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select(
            "id, order_number, customer_name, due_date, priority, quantity, product_name",
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

    if (sourceItems.length > 0) {
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
      return Array.from(groups.values());
    }

    readyOrders.forEach((order) => {
      const batchCode = "B1";
      const key = `${order.id}-${batchCode}`;
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

  const routes = [
    {
      key: "default",
      label: "Default route",
      steps: [],
    },
  ];
  const activeRoute =
    routes.find((route) => route.key === selectedRouteKey) ?? routes[0];
  const routeStations = useMemo(
    () => [...stations],
    [stations],
  );

  const canRelease =
    selectedBatchKeys.length > 0 && routeStations.length > 0;

  const handleRelease = async () => {
    if (!supabase || !canRelease) {
      return;
    }
    const nextGroups = readyBatchGroups.filter((group) =>
      selectedBatchKeys.includes(group.key),
    );
    if (nextGroups.length === 0) {
      return;
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
    setBatchRuns((prev) => [...(inserted ?? []), ...prev]);
    setSelectedBatchKeys([]);
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
      if (run.planned_date) {
        const runDate = new Date(run.planned_date);
        if (runDate < startDate || runDate > endDate) {
          return;
        }
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
        blockedReason: run.blocked_reason ?? null,
      } satisfies QueueItem;
      map.get(run.station_id)?.push(queueItem);
    });
    return map;
  }, [batchRuns, productionItems, stations, viewDate, plannedRangeDays]);

  const updateStatus = async (
    id: string,
    status: BatchRunRow["status"],
    extra?: {
      blockedReason?: string | null;
      blockedReasonId?: string | null;
    },
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
        blocked_by: isBlocked ? user.id : null,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Production</h2>
        <p className="text-sm text-muted-foreground">
          Plan work orders, batch similar items, and assign to stations.
        </p>
      </div>

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
                      setReadyPriority(
                        event.target.value as Priority | "all",
                      )
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
                        <Badge variant={priorityBadge(group.priority)}>
                          {group.priority}
                        </Badge>
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
              <div className="text-sm font-medium">Release to production</div>
              <label className="space-y-1 text-xs text-muted-foreground">
                Route
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
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                  {routeStations.length > 0
                    ? routeStations.map((station) => station.name).join(" → ")
                    : "No matching stations for default route."}
                </div>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Planned date
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                />
              </label>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Planning date affects new work orders only. Use the queue view
                controls to switch days.
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="mt-3"
                  onClick={handleRelease}
                  disabled={!canRelease}
                >
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
              <div className="text-xs text-muted-foreground">
                Unit of work: Batch (e.g. AL-1042 / B1)
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="sticky top-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
            <span>Station queues</span>
            <div className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
              <label className="flex items-center gap-2">
                View date
                <input
                  type="date"
                  value={viewDate}
                  onChange={(event) => setViewDate(event.target.value)}
                  className="h-9 rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                />
              </label>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stations.map((station) => {
              const queue = queueByStation.get(station.id) ?? [];
              return (
                <Card key={station.id} className="min-h-[240px]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {station.name}
                      </CardTitle>
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
                                {String(item.status ?? "queued").replace(
                                  "_",
                                  " ",
                                )}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {item.totalQty} pcs - Due {item.dueDate}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {item.material}
                          </div>
                          {item.status === "blocked" && item.blockedReason ? (
                            <div className="mt-1 text-xs text-rose-600">
                              Blocked: {item.blockedReason}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <BatchQr
                                value={`${item.orderNumber}-${item.batchCode}`}
                              />
                              <span>{item.batchCode}</span>
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateStatus(item.id, "in_progress")
                              }
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
        </div>
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
