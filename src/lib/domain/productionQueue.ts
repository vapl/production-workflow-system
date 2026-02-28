type Priority = "low" | "normal" | "high" | "urgent";
type QueueStatus = "queued" | "pending" | "in_progress" | "blocked" | "done";

type StationLike = {
  id: string;
};

type ProductionItemLike = {
  order_id: string;
  batch_code: string;
  station_id: string | null;
  qty: number;
  material: string | null;
  duration_minutes?: number | null;
};

type BatchRunLike = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  status: QueueStatus;
  planned_date?: string | null;
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

export type ProductionQueueItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: Priority;
  status: QueueStatus;
  batchCode: string;
  totalQty: number;
  material: string;
  plannedDate?: string | null;
  startedAt?: string | null;
  doneAt?: string | null;
  durationMinutes?: number | null;
  items: ProductionItemLike[];
};

type ReadyBatchGroupLike = {
  orderNumber: string;
  customerName: string;
  batchCode: string;
  material: string;
  priority: Priority;
};

export function buildQueueByStation(params: {
  batchRuns: BatchRunLike[];
  productionItems: ProductionItemLike[];
  stations: StationLike[];
  viewDate: string;
  plannedRangeDays: number;
}) {
  const { batchRuns, productionItems, stations, viewDate, plannedRangeDays } =
    params;
  const map = new Map<string, ProductionQueueItem[]>();
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
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0);
    const material = items.find((item) => item.material)?.material ?? "";
    const queueItem = {
      id: run.id,
      orderId: run.order_id,
      orderNumber: run.orders?.order_number ?? "Order",
      customerName: run.orders?.customer_name ?? "Customer",
      dueDate: run.orders?.due_date ?? "",
      priority: run.orders?.priority ?? "normal",
      status: run.status,
      batchCode: run.batch_code,
      totalQty,
      material,
      plannedDate: run.planned_date ?? null,
      startedAt: run.started_at ?? null,
      doneAt: run.done_at ?? null,
      durationMinutes: run.duration_minutes ?? null,
      items,
    } satisfies ProductionQueueItem;
    map.get(run.station_id)?.push(queueItem);
  });
  return map;
}

export function filterReadyBatchGroups<T extends ReadyBatchGroupLike>(
  groups: T[],
  priority: Priority | "all",
  search: string,
) {
  const query = search.trim().toLowerCase();
  return groups.filter((group) => {
    if (priority !== "all" && group.priority !== priority) {
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
}
