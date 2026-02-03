"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";
import QRCode from "qrcode";

type Priority = "low" | "normal" | "high" | "urgent";

type Station = {
  id: string;
  name: string;
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

type BatchRunRow = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  status: "queued" | "in_progress" | "blocked" | "done";
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
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [plannedDate, setPlannedDate] = useState("2026-02-03");
  const [stations, setStations] = useState<Station[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
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
      const [stationsResult, itemsResult, runsResult] = await Promise.all([
        supabase
          .from("workstations")
          .select("id, name, is_active")
          .eq("is_active", true)
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
            "id, order_id, batch_code, station_id, status, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (stationsResult.error || itemsResult.error || runsResult.error) {
        setDataError("Failed to load production data.");
        setIsLoading(false);
        return;
      }

      setStations(
        (stationsResult.data ?? []).map((station) => ({
          id: station.id,
          name: station.name,
        })),
      );
      setProductionItems((itemsResult.data ?? []) as ProductionItemRow[]);
      setBatchRuns((runsResult.data ?? []) as BatchRunRow[]);
      setIsLoading(false);
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const readyBatchGroups = useMemo(() => {
    const groups = new Map<string, BatchGroup>();
    productionItems
      .filter((item) => item.status === "queued" && !item.station_id)
      .forEach((item) => {
        const orderNumber = item.orders?.order_number ?? "Order";
        const customerName = item.orders?.customer_name ?? "Customer";
        const dueDate = item.orders?.due_date ?? "";
        const priority = item.orders?.priority ?? "normal";
        const batchCode = item.batch_code || "B1";
        const key = `${item.order_id}-${batchCode}`;
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
  }, [productionItems]);

  const canRelease =
    selectedBatchKeys.length > 0 && selectedStationId.length > 0;

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
    const insertRows = nextGroups.map((group) => ({
      order_id: group.orderId,
      batch_code: group.batchCode,
      station_id: selectedStationId,
      status: "queued",
    }));
    const { data: inserted, error } = await supabase
      .from("batch_runs")
      .insert(insertRows)
      .select(
        "id, order_id, batch_code, station_id, status, started_at, done_at, orders (order_number, due_date, priority, customer_name)",
      );
    if (error) {
      setDataError("Failed to create batch runs.");
      return;
    }
    await Promise.all(
      nextGroups.map((group) =>
        supabase
          .from("production_items")
          .update({ station_id: selectedStationId, status: "queued" })
          .eq("order_id", group.orderId)
          .eq("batch_code", group.batchCode),
      ),
    );
    setBatchRuns((prev) => [...(inserted ?? []), ...prev]);
    setProductionItems((prev) =>
      prev.map((item) =>
        nextGroups.some(
          (group) =>
            group.orderId === item.order_id &&
            group.batchCode === item.batch_code,
        )
          ? { ...item, station_id: selectedStationId, status: "queued" }
          : item,
      ),
    );
    setSelectedBatchKeys([]);
  };

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    stations.forEach((station) => map.set(station.id, []));
    batchRuns.forEach((run) => {
      if (!run.station_id) {
        return;
      }
      const items = productionItems.filter(
        (item) =>
          item.order_id === run.order_id &&
          item.batch_code === run.batch_code,
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
      } satisfies QueueItem;
      map.get(run.station_id)?.push(queueItem);
    });
    return map;
  }, [batchRuns, productionItems, stations]);

  const updateStatus = async (
    id: string,
    status: BatchRunRow["status"],
  ) => {
    if (!supabase) {
      return;
    }
    const run = batchRuns.find((item) => item.id === id);
    if (!run) {
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("batch_runs")
      .update({
        status,
        started_at: status === "in_progress" ? now : run.started_at,
        done_at: status === "done" ? now : run.done_at,
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
            <div className="space-y-2">
              {readyBatchGroups.map((group) => {
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
              {readyBatchGroups.length === 0 && !isLoading ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No batches ready for release.
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
              <div className="text-sm font-medium">Release to production</div>
              <label className="space-y-1 text-xs text-muted-foreground">
                Station
                <select
                  value={selectedStationId}
                  onChange={(event) => setSelectedStationId(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
                >
                  <option value="">Select station...</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
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
              <div className="flex items-center gap-2">
                <Button onClick={handleRelease} disabled={!canRelease}>
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
          <div className="text-sm font-medium text-muted-foreground">
            Station queues - Planned {plannedDate}
          </div>
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
                          <div className="mt-1 text-muted-foreground">
                            {item.totalQty} pcs - Due {item.dueDate}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {item.material}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <BatchQr value={`${item.orderNumber}-${item.batchCode}`} />
                              <span>{item.batchCode}</span>
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
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
                              onClick={() => updateStatus(item.id, "blocked")}
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
    </div>
  );
}
