import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionPriority,
  ProductionStation,
  ProductionStatus,
  ProductionStatusEventRow,
  ProductionWorkSessionRow,
  StationTrackingMode,
} from "@/types/production";
import {
  buildWorkedBreakdownByItem,
  buildWorkedBreakdownByRun,
  getQueueGroupWorkedBreakdown,
} from "@/lib/domain/productionDurations";
import { getProductionItemsProgress } from "@/lib/domain/productionUnitProgress";
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
  position?: string | null;
  item_name: string;
  item_type?: string | null;
  qty?: number | null;
  sourceRowId?: string | null;
  source_row_id?: string | null;
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
  completedQty: number;
  material: string;
  plannedDate?: string | null;
  startedAt?: string | null;
  doneAt?: string | null;
  durationMinutes?: number | null;
  regularMinutes?: number | null;
  overtimeMinutes?: number | null;
  durationSeconds?: number | null;
  involvedOperatorIds?: string[];
  workingOperatorIds?: string[];
  pausedOperatorIds?: string[];
  blockedOperatorIds?: string[];
  stationId: string;
  runIds: string[];
  trackingMode: StationTrackingMode;
  items: ProductionItemLike[];
  unitType?: string | null;
  unitName?: string | null;
  unitPosition?: string | null;
};

function getProductionItemSourceKey(item: ProductionItemLike) {
  const meta = item.meta as Record<string, unknown> | null;
  const sourceRowId =
    meta && typeof meta.sourceRowId === "string"
      ? meta.sourceRowId
      : undefined;
  const rowKey =
    meta && typeof meta.rowKey === "string" ? meta.rowKey : undefined;
  return sourceRowId ?? rowKey ?? null;
}

function getOrderItemSourceKey(item: OrderItemLike) {
  return item.sourceRowId ?? item.source_row_id ?? null;
}

function getOrderItemQuantity(item: OrderItemLike | undefined) {
  const parsed = Number(item?.qty ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getProductionItemMetaRowValue(item: ProductionItemLike, key: string) {
  const meta = item.meta as Record<string, unknown> | null;
  const row = meta && typeof meta.row === "object" && meta.row !== null
    ? (meta.row as Record<string, unknown>)
    : null;
  const value = row?.[key] ?? meta?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

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
  workSessions?: ProductionWorkSessionRow[];
  calendar?: WorkingCalendar | null;
  nowMs?: number;
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
    workSessions = [],
    calendar,
    nowMs,
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
  const orderItemBySourceKey = new Map<string, OrderItemLike>();
  orderItems.forEach((item) => {
    const key = getOrderItemSourceKey(item);
    if (key) {
      orderItemBySourceKey.set(`${item.order_id}:${key}`, item);
    }
  });
  const workedBreakdownByItem = buildWorkedBreakdownByItem(
    activityEvents,
    calendar,
    nowMs,
  );
  const workedBreakdownByRun = buildWorkedBreakdownByRun(
    activityEvents,
    calendar,
    nowMs,
  );

  const workSessionsByScope = new Map<string, ProductionWorkSessionRow[]>();
  workSessions.forEach((session) => {
    const key = `${session.batch_run_id}::${session.production_item_id ?? "*"}`;
    const list = workSessionsByScope.get(key) ?? [];
    list.push(session);
    workSessionsByScope.set(key, list);
  });

  const getElapsedSecondsForSessions = (sessions: ProductionWorkSessionRow[]) => {
    const intervals = sessions
      .map((session) => {
        const startMs = Date.parse(session.started_at);
        const endIso =
          session.stopped_at ??
          (session.is_active
            ? new Date(nowMs ?? Date.now()).toISOString()
            : null);
        const endMs = endIso ? Date.parse(endIso) : NaN;
        if (
          !Number.isFinite(startMs) ||
          !Number.isFinite(endMs) ||
          endMs <= startMs
        ) {
          return null;
        }
        return { startMs, endMs };
      })
      .filter((interval): interval is { startMs: number; endMs: number } =>
        Boolean(interval),
      )
      .sort((a, b) => a.startMs - b.startMs);

    let totalSeconds = 0;
    let currentStart: number | null = null;
    let currentEnd: number | null = null;
    intervals.forEach((interval) => {
      if (currentStart === null || currentEnd === null) {
        currentStart = interval.startMs;
        currentEnd = interval.endMs;
        return;
      }
      if (interval.startMs <= currentEnd) {
        currentEnd = Math.max(currentEnd, interval.endMs);
        return;
      }
      totalSeconds += Math.floor((currentEnd - currentStart) / 1000);
      currentStart = interval.startMs;
      currentEnd = interval.endMs;
    });
    if (currentStart !== null && currentEnd !== null) {
      totalSeconds += Math.floor((currentEnd - currentStart) / 1000);
    }
    return totalSeconds;
  };

  const getOperatorGroupsForSessions = (
    sessions: ProductionWorkSessionRow[],
  ) => {
    const latestByOperator = new Map<string, ProductionWorkSessionRow>();
    sessions.forEach((session) => {
      const existing = latestByOperator.get(session.operator_user_id);
      const existingTime = Date.parse(
        existing?.updated_at ??
          existing?.stopped_at ??
          existing?.started_at ??
          "1970-01-01T00:00:00.000Z",
      );
      const nextTime = Date.parse(
        session.updated_at ??
          session.stopped_at ??
          session.started_at ??
          "1970-01-01T00:00:00.000Z",
      );
      if (!existing || nextTime >= existingTime) {
        latestByOperator.set(session.operator_user_id, session);
      }
    });

    const working = new Set<string>();
    const paused = new Set<string>();
    const blocked = new Set<string>();
    latestByOperator.forEach((session) => {
      const status = session.is_active
        ? "in_progress"
        : ((session.ended_status as ProductionStatus | null) ?? null);
      if (status === "in_progress") {
        working.add(session.operator_user_id);
      } else if (status === "paused") {
        paused.add(session.operator_user_id);
      } else if (status === "blocked") {
        blocked.add(session.operator_user_id);
      }
    });
    const involved = new Set([...working, ...paused, ...blocked]);
    return { involved, working, paused, blocked };
  };

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
    const routeKeys = new Set(
      runs
        .map((run) => run.route_key)
        .filter((value): value is string => Boolean(value && value !== "default")),
    );
    const items = productionItems.filter((item) => {
      if (item.order_id !== representativeRun.order_id) {
        return false;
      }
      if (trackingMode === "construction_level") {
        const sourceKey = getProductionItemSourceKey(item);
        if (sourceKey && routeKeys.size > 0) {
          return routeKeys.has(sourceKey);
        }
        if (item.station_id && item.station_id !== stationId) {
          return false;
        }
        return batchCodes.has(item.batch_code);
      }
      if (item.station_id && item.station_id !== stationId) {
        return false;
      }
      return true;
    });

    const logicalItems = Array.from(
      items
        .reduce((map, item) => {
          const sourceKey = getProductionItemSourceKey(item);
          const key = sourceKey ? `${item.order_id}:${sourceKey}` : item.id;
          if (!map.has(key)) {
            map.set(key, item);
          }
          return map;
        }, new Map<string, ProductionItemLike>())
        .values(),
    );
    const effectiveItems = logicalItems.map((item) => {
      const sourceKey = getProductionItemSourceKey(item);
      const orderItem = sourceKey
        ? (orderItemById.get(sourceKey) ??
          orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
        : undefined;
      const quantity = getOrderItemQuantity(orderItem) ?? item.qty;
      return { ...item, qty: quantity };
    });
    const itemProgress = getProductionItemsProgress(effectiveItems);
    const itemCountProgress = {
      totalQty: effectiveItems.length,
      completedQty: effectiveItems.filter((item) => item.status === "done").length,
    };
    const effectiveProgress =
      trackingMode === "construction_level" ? itemProgress : itemCountProgress;
    const totalQtyFromItems = effectiveProgress.totalQty;
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
      items: effectiveItems,
      workedBreakdownByItem,
      workedBreakdownByRun,
    });
    const sessionScopes =
      trackingMode === "construction_level"
        ? effectiveItems.flatMap((item) => {
            const sourceKey = getProductionItemSourceKey(item);
            const matchedRuns = runs.filter((run) => {
              const runSourceKey =
                run.route_key && run.route_key !== "default"
                  ? run.route_key
                  : null;
              if (sourceKey && runSourceKey) {
                return sourceKey === runSourceKey;
              }
              if (item.station_id && item.station_id !== run.station_id) {
                return false;
              }
              return item.batch_code === run.batch_code;
            });
            const targetRuns =
              matchedRuns.length > 0 ? matchedRuns : [representativeRun];
            return targetRuns.map((run) => `${run.id}::${item.id}`);
          })
        : runs.map((run) => `${run.id}::*`);
    const scopeSessions = Array.from(new Set(sessionScopes)).flatMap(
      (scopeKey) => workSessionsByScope.get(scopeKey) ?? [],
    );
    const sessionElapsedSeconds = getElapsedSecondsForSessions(scopeSessions);
    const operatorGroups = getOperatorGroupsForSessions(scopeSessions);

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
      completedQty:
        effectiveItems.length > 0
          ? effectiveProgress.completedQty
          : representativeRun.status === "done"
            ? totalQty
            : runs.reduce(
                (sum, run) => sum + (run.status === "done" ? 1 : 0),
                0,
              ),
      material: material ?? "",
      plannedDate: sortedPlannedDates[0] ?? null,
      startedAt: sortedStartedAt[0] ?? null,
      doneAt: sortedDoneAt.at(-1) ?? null,
      durationMinutes:
        sessionElapsedSeconds > 0
          ? Math.round(sessionElapsedSeconds / 60)
          : workedBreakdown.totalMinutes,
      durationSeconds: sessionElapsedSeconds > 0 ? sessionElapsedSeconds : null,
      involvedOperatorIds: Array.from(operatorGroups.involved),
      workingOperatorIds: Array.from(operatorGroups.working),
      pausedOperatorIds: Array.from(operatorGroups.paused),
      blockedOperatorIds: Array.from(operatorGroups.blocked),
      regularMinutes: workedBreakdown.regularMinutes,
      overtimeMinutes: workedBreakdown.overtimeMinutes,
      stationId,
      runIds: runs.map((run) => run.id),
      trackingMode,
      items: effectiveItems,
      unitType:
        trackingMode === "construction_level"
          ? (effectiveItems.find(
              (item) =>
                typeof item.meta?.fieldLabel === "string" &&
                item.meta.fieldLabel.trim().length > 0,
            )?.meta?.fieldLabel as string | undefined) ??
            orderItemById.get(representativeRun.route_key)?.item_type ??
            null
          : null,
      unitName:
        trackingMode === "construction_level"
          ? effectiveItems.find(
              (item) =>
                typeof item.item_name === "string" &&
                item.item_name.trim().length > 0,
            )?.item_name ??
            orderItemById.get(representativeRun.route_key)?.item_name ??
            null
          : null,
      unitPosition:
        trackingMode === "construction_level"
          ? effectiveItems
              .map((item) => {
                const sourceKey = getProductionItemSourceKey(item);
                const orderItem = sourceKey
                  ? (orderItemById.get(sourceKey) ??
                    orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
                  : undefined;
                return (
                  getProductionItemMetaRowValue(item, "position") ??
                  orderItem?.position ??
                  null
                );
              })
              .find((value): value is string => Boolean(value)) ?? null
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
