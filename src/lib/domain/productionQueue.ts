import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionPriority,
  ProductionStation,
  ProductionStatus,
  ProductionStatusEventRow,
  StationTrackingMode,
} from "@/types/production";
import {
  buildWorkedBreakdownByItem,
  buildWorkedBreakdownByRun,
  getQueueGroupWorkedBreakdown,
} from "@/lib/domain/productionDurations";
import type { WorkingCalendar } from "@/lib/domain/workingCalendar";

type StationLike = Pick<ProductionStation, "id" | "trackingMode">;

type ProductionItemLike = Pick<
  ProductionItemRow,
  | "id"
  | "order_id"
  | "batch_code"
  | "item_name"
  | "status"
  | "station_id"
  | "qty"
  | "material"
  | "meta"
  | "started_at"
  | "done_at"
  | "duration_minutes"
>;

type BatchRunLike = Pick<
  BatchRunRow,
  | "id"
  | "order_id"
  | "batch_code"
  | "station_id"
  | "route_key"
  | "status"
  | "planned_date"
  | "started_at"
  | "done_at"
  | "duration_minutes"
  | "orders"
>;

type OrderItemLike = {
  id: string;
  order_id: string;
  item_name: string;
  item_type?: string | null;
};

export type ProductionQueueItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: ProductionPriority;
  status: ProductionStatus;
  batchCode: string;
  totalQty: number;
  material: string;
  plannedDate?: string | null;
  startedAt?: string | null;
  doneAt?: string | null;
  durationMinutes?: number | null;
  regularMinutes?: number | null;
  overtimeMinutes?: number | null;
  stationId: string;
  runIds: string[];
  trackingMode: StationTrackingMode;
  items: ProductionItemLike[];
  unitType?: string | null;
  unitName?: string | null;
};

type ReadyBatchGroupLike = {
  orderNumber: string;
  customerName: string;
  batchCode: string;
  material: string;
  priority: ProductionPriority;
};

export function buildQueueByStation(params: {
  batchRuns: BatchRunLike[];
  productionItems: ProductionItemLike[];
  orderItems?: OrderItemLike[];
  activityEvents?: ProductionStatusEventRow[];
  calendar?: WorkingCalendar | null;
  stations: StationLike[];
  viewDate: string;
  plannedRangeDays: number;
  includeDone?: boolean;
}) {
  const {
    batchRuns,
    productionItems,
    orderItems = [],
    activityEvents = [],
    calendar,
    stations,
    viewDate,
    plannedRangeDays,
  } =
    params;
  const includeDone = params.includeDone ?? false;
  const map = new Map<string, ProductionQueueItem[]>();
  const stationById = new Map(stations.map((station) => [station.id, station]));
  stations.forEach((station) => map.set(station.id, []));
  const seenRuns = new Set<string>();
  const startDate = new Date(viewDate);
  const endDate = new Date(viewDate);
  endDate.setDate(endDate.getDate() + Math.max(plannedRangeDays - 1, 0));

  const queueGroups = new Map<
    string,
    {
      stationId: string;
      trackingMode: StationTrackingMode;
      runs: BatchRunLike[];
    }
  >();
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
  const workedBreakdownByItem = buildWorkedBreakdownByItem(
    activityEvents,
    calendar,
  );
  const workedBreakdownByRun = buildWorkedBreakdownByRun(
    activityEvents,
    calendar,
  );

  batchRuns.forEach((run) => {
    if (seenRuns.has(run.id)) {
      return;
    }
    seenRuns.add(run.id);
    if (!run.station_id) {
      return;
    }
    if (run.status === "pending") {
      return;
    }
    if (run.status === "done" && !includeDone) {
      return;
    }
    if (run.planned_date) {
      const runDate = new Date(run.planned_date);
      if (runDate < startDate || runDate > endDate) {
        return;
      }
    }
    const trackingMode =
      stationById.get(run.station_id)?.trackingMode ?? "construction_level";
    const groupKey =
      trackingMode === "construction_level"
        ? `${run.station_id}:${run.order_id}:${run.route_key || run.batch_code || run.id}`
        : `${run.station_id}:${run.order_id}`;
    const existing = queueGroups.get(groupKey);
    if (existing) {
      existing.runs.push(run);
      return;
    }
    queueGroups.set(groupKey, {
      stationId: run.station_id,
      trackingMode,
      runs: [run],
    });
  });

  queueGroups.forEach(({ stationId, trackingMode, runs }) => {
    const representativeRun = [...runs].sort((a, b) => {
      const aStarted = a.started_at ? new Date(a.started_at).getTime() : 0;
      const bStarted = b.started_at ? new Date(b.started_at).getTime() : 0;
      if (aStarted !== bStarted) {
        return bStarted - aStarted;
      }
      return a.id.localeCompare(b.id);
    })[0];

    if (!representativeRun) {
      return;
    }

    const batchCodes = new Set(runs.map((run) => run.batch_code));
    const items = productionItems.filter((item) => {
      if (item.order_id !== representativeRun.order_id) {
        return false;
      }
      if (item.station_id !== stationId) {
        return false;
      }
      if (trackingMode === "construction_level") {
        return batchCodes.has(item.batch_code);
      }
      return true;
    });

    const totalQtyFromItems = items.reduce(
      (sum, item) => sum + Number(item.qty ?? 0),
      0,
    );
    const uniqueLogicalUnits = new Set(
      runs
        .map((run) => run.route_key?.trim())
        .filter((key): key is string => Boolean(key && key !== "default")),
    );
    const totalQty =
      totalQtyFromItems > 0
        ? totalQtyFromItems
        : uniqueLogicalUnits.size > 0
          ? uniqueLogicalUnits.size
          : 1;
    const material =
      items.find((item) => item.material)?.material ??
      representativeRun.orders?.customer_name ??
      "";
    const sortedPlannedDates = runs
      .map((run) => run.planned_date)
      .filter((date): date is string => Boolean(date))
      .sort();
    const sortedStartedAt = runs
      .map((run) => run.started_at)
      .filter((date): date is string => Boolean(date))
      .sort();
    const sortedDoneAt = runs
      .map((run) => run.done_at)
      .filter((date): date is string => Boolean(date))
      .sort();
    const statusOrder: ProductionStatus[] = [
      "blocked",
      "paused",
      "in_progress",
      "queued",
      "pending",
      "done",
    ];
    const status =
      statusOrder.find((candidate) =>
        runs.some((run) => run.status === candidate),
      ) ?? representativeRun.status;
    const workedBreakdown = getQueueGroupWorkedBreakdown({
      trackingMode,
      runs,
      items,
      workedBreakdownByItem,
      workedBreakdownByRun,
    });

    const queueItem = {
      id: representativeRun.id,
      orderId: representativeRun.order_id,
      orderNumber: representativeRun.orders?.order_number ?? "Order",
      customerName: representativeRun.orders?.customer_name ?? "Customer",
      dueDate:
        representativeRun.orders?.production_due_date ??
        representativeRun.orders?.due_date ??
        "",
      priority: representativeRun.orders?.priority ?? "normal",
      status,
      batchCode:
        trackingMode === "construction_level"
          ? representativeRun.batch_code
          : representativeRun.batch_code || "B1",
      totalQty,
      material: material ?? "",
      plannedDate: sortedPlannedDates[0] ?? null,
      startedAt: sortedStartedAt[0] ?? null,
      doneAt: sortedDoneAt.at(-1) ?? null,
      durationMinutes: workedBreakdown.totalMinutes,
      regularMinutes: workedBreakdown.regularMinutes,
      overtimeMinutes: workedBreakdown.overtimeMinutes,
      stationId,
      runIds: runs.map((run) => run.id),
      trackingMode,
      items,
      unitType:
        trackingMode === "construction_level"
          ? (items.find(
              (item) =>
                typeof item.meta?.fieldLabel === "string" &&
                item.meta.fieldLabel.trim().length > 0,
            )?.meta?.fieldLabel as string | undefined) ??
            orderItemById.get(representativeRun.route_key)?.item_type ??
            null
          : null,
      unitName:
        trackingMode === "construction_level"
          ? items.find(
              (item) =>
                typeof item.item_name === "string" &&
                item.item_name.trim().length > 0,
            )?.item_name ??
            orderItemById.get(representativeRun.route_key)?.item_name ??
            null
          : null,
    } satisfies ProductionQueueItem;

    map.get(stationId)?.push(queueItem);
  });
  return map;
}

export function filterReadyBatchGroups<T extends ReadyBatchGroupLike>(
  groups: T[],
  priority: ProductionPriority | "all",
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
