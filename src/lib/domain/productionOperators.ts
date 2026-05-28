import {
  buildWorkedBreakdownByItem,
  buildWorkedBreakdownByItemInRange,
  buildWorkedBreakdownByRun,
  buildWorkedBreakdownByRunInRange,
  getProductionItemWorkedMinutes,
  getBatchRunWorkedMinutes,
  buildWorkedMinutesByItem,
  buildWorkedMinutesByRun,
  buildWorkedMinutesByItemInRange,
  buildWorkedMinutesByRunInRange,
  summarizeWorkedBreakdownByItem,
  summarizeWorkedBreakdownByRun,
  type WorkedMinutesRange,
  type WorkedTimeBreakdown,
} from "@/lib/domain/productionDurations";
import { getProductionWorkSessionOverlapMinutes } from "@/lib/domain/productionWorkSessions";
import {
  computeWorkedMinutesBreakdown,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionStatus,
  ProductionStatusEventRow,
  ProductionWorkSessionRow,
} from "@/types/production";

export type OperatorProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  login_code?: string | null;
  auth_mode?: string | null;
  is_active?: boolean | null;
};

export type OperatorConfigRow = {
  id: string;
  user_id?: string | null;
  name: string;
  role: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  weekly_target_minutes?: number | null;
  monthly_target_minutes?: number | null;
  overtime_threshold_minutes?: number | null;
  is_active?: boolean | null;
};

export type OperatorAssignmentRow = {
  user_id: string;
  station_id: string;
  is_active: boolean;
};

export type OperatorStationRow = {
  id: string;
  name: string;
  trackingMode?: "construction_level" | "order_level" | "receipt_only" | null;
};

export type OperatorSummaryRow = {
  userId: string;
  name: string;
  role: string;
  stations: string[];
  hourlyRate: number | null;
  overtimeRate: number | null;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  laborCost: number | null;
  completedItems: number;
  completedQty: number;
  completedOrders: number;
};

export type OperatorOverviewRow = OperatorSummaryRow & {
  hasConstructionLevelAssignment: boolean;
  isOrderLevelOperator: boolean;
  completedUnits: number;
  relatedUnits: number;
  displayUnits: number;
  ordersWithWorkCount: number;
};

function normalizeOperatorName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export type OperatorOrderBreakdownRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  stationId: string | null;
  status: ProductionStatus | string | null;
  workedMinutes: number;
  itemCount?: number;
  completedItems: number;
};

export type OperatorUnitBreakdownRow = {
  productionItemId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  batchCode: string;
  productType: string | null;
  unitPosition: string | null;
  itemName: string;
  qty: number;
  status: ProductionStatus | string | null;
  workedMinutes: number;
  stationId: string | null;
  doneAt: string | null;
  completed: boolean;
};

export type OperatorOrderItemRow = {
  id: string;
  order_id: string;
  source_row_id?: string | null;
  sort_order?: number | null;
  position?: string | null;
  item_type?: string | null;
  item_name?: string | null;
};

export type OperatorStationBreakdownRow = {
  stationId: string;
  stationName: string;
  workedMinutes: number;
  completedItems: number;
};

function hasCompletedTimestamp(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function getProductionItemSourceKey(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const sourceRowId =
    meta && typeof meta.sourceRowId === "string" ? meta.sourceRowId : undefined;
  const orderItemId =
    row && typeof row.order_item_id === "string"
      ? row.order_item_id
      : undefined;
  const rowKey =
    meta && typeof meta.rowKey === "string" ? meta.rowKey : undefined;
  return sourceRowId ?? orderItemId ?? rowKey ?? null;
}

function getProductionItemMetaRowValue(item: ProductionItemRow, key: string) {
  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const candidates = [row, meta].filter(
    (value): value is Record<string, unknown> => Boolean(value),
  );
  for (const source of candidates) {
    const value = source[key];
    if (value == null) {
      continue;
    }
    const stringValue = String(value).trim();
    if (stringValue) {
      return stringValue;
    }
  }
  return null;
}

function getOrderItemPositionLabel(item: OperatorOrderItemRow | undefined) {
  if (!item) {
    return null;
  }
  const explicit = item.position?.trim();
  if (explicit) {
    return explicit;
  }
  return "Pos. -";
}

function getOrderItemProductTypeLabel(item: OperatorOrderItemRow | undefined) {
  const explicit = item?.item_type?.trim();
  return explicit || null;
}

function getProductionItemCompletedQty(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const value = meta?.completedQty;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProductionItemCompletedAt(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  return item.done_at ?? (typeof meta?.lastCompletedQtyAt === "string"
    ? meta.lastCompletedQtyAt
    : null);
}

function getProductionItemCompletedBy(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  return typeof meta?.lastCompletedQtyBy === "string"
    ? meta.lastCompletedQtyBy
    : null;
}

export type OperatorMetricsFilter = {
  range?: WorkedMinutesRange | null;
  search?: string | null;
  calendar?: WorkingCalendar | null;
  assignedStationIds?: string[] | null;
  orderLevelStationIds?: string[] | null;
};

type FallbackOperatorMetrics = {
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  completedItems: number;
  completedQty: number;
  completedOrders: number;
};

function zeroBreakdown(): WorkedTimeBreakdown {
  return {
    totalMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
  };
}

function addBreakdown(
  current: WorkedTimeBreakdown,
  next: WorkedTimeBreakdown,
): WorkedTimeBreakdown {
  return {
    totalMinutes: current.totalMinutes + next.totalMinutes,
    regularMinutes: current.regularMinutes + next.regularMinutes,
    overtimeMinutes: current.overtimeMinutes + next.overtimeMinutes,
  };
}

function isEventInRange(
  event: ProductionStatusEventRow,
  range?: WorkedMinutesRange | null,
) {
  if (!range) {
    return true;
  }
  return isTimestampInRange(event.created_at, range);
}

function uniqueCompletedItemsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  productionItems: ProductionItemRow[],
  range?: WorkedMinutesRange | null,
) {
  const completedIds = new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          typeof event.production_item_id === "string" &&
          isEventInRange(event, range),
      )
      .map((event) => event.production_item_id as string),
  );
  return productionItems.filter((item) => completedIds.has(item.id));
}

function uniqueCompletedItemIdsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  range?: WorkedMinutesRange | null,
) {
  return new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          typeof event.production_item_id === "string" &&
          isEventInRange(event, range),
      )
      .map((event) => event.production_item_id as string),
  );
}

function getTodayIsoLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getActorEvents(
  actorUserId: string,
  events: ProductionStatusEventRow[],
) {
  return events.filter((event) => event.actor_user_id === actorUserId);
}

function getActorRunOnlyEvents(
  actorUserId: string,
  events: ProductionStatusEventRow[],
) {
  return events.filter(
    (event) =>
      event.actor_user_id === actorUserId &&
      !event.production_item_id &&
      Boolean(event.batch_run_id),
  );
}

function hasActorEventInRange(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  range?: WorkedMinutesRange | null,
) {
  return events.some(
    (event) => event.actor_user_id === actorUserId && isEventInRange(event, range),
  );
}

function uniqueCompletedRunIdsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  range?: WorkedMinutesRange | null,
) {
  return new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          !event.production_item_id &&
          typeof event.batch_run_id === "string" &&
          isEventInRange(event, range),
      )
      .map((event) => event.batch_run_id as string),
  );
}

function uniqueCompletedRunsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  batchRuns: BatchRunRow[],
  range?: WorkedMinutesRange | null,
) {
  const completedRunIds = uniqueCompletedRunIdsByActor(actorUserId, events, range);
  return batchRuns.filter((run) => completedRunIds.has(run.id));
}

function normalizeSearch(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesOrderSearch(
  value: string,
  orderNumber: string | null | undefined,
  customerName: string | null | undefined,
  fallbackId: string,
) {
  if (!value) {
    return true;
  }
  const haystack = [orderNumber, customerName, fallbackId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(value);
}

function getOverlapRange(
  startMs: number,
  endMs: number,
  range?: WorkedMinutesRange | null,
) {
  if (!range) {
    return { startMs, endMs };
  }
  const rangeStartMs = Date.parse(range.startAt);
  const rangeEndMs = Date.parse(range.endAt);
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs)) {
    return null;
  }
  const overlapStart = Math.max(startMs, rangeStartMs);
  const overlapEnd = Math.min(endMs, rangeEndMs);
  if (overlapEnd <= overlapStart) {
    return null;
  }
  return {
    startMs: overlapStart,
    endMs: overlapEnd,
  };
}

function buildAttributedWorkedMinutesByKey(
  events: ProductionStatusEventRow[],
  actorUserId: string,
  getKey: (event: ProductionStatusEventRow) => string | null,
  range?: WorkedMinutesRange | null,
  calendar?: WorkingCalendar | null,
) {
  const eventsByKey = new Map<string, ProductionStatusEventRow[]>();
  events.forEach((event) => {
    const key = getKey(event);
    if (!key) {
      return;
    }
    const list = eventsByKey.get(key) ?? [];
    list.push(event);
    eventsByKey.set(key, list);
  });

  const result = new Map<string, number>();
  const now = Date.now();

  eventsByKey.forEach((entityEvents, key) => {
    const sortedEvents = [...entityEvents].sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    let activeStart: number | null = null;
    let activeActor: string | null = null;
    let totalMinutes = 0;

    const appendInterval = (intervalEndMs: number) => {
      if (activeStart == null || activeActor !== actorUserId) {
        return;
      }
      const overlap = getOverlapRange(activeStart, intervalEndMs, range);
      if (!overlap) {
        return;
      }
      totalMinutes += computeWorkedMinutesBreakdown(
        new Date(overlap.startMs).toISOString(),
        new Date(overlap.endMs).toISOString(),
        calendar,
      ).totalMinutes;
    };

    sortedEvents.forEach((event) => {
      const eventTime = event.created_at ? Date.parse(event.created_at) : NaN;
      if (!Number.isFinite(eventTime)) {
        return;
      }

      if (activeStart != null) {
        appendInterval(eventTime);
      }

      if (event.to_status === "in_progress") {
        activeStart = eventTime;
        activeActor = event.actor_user_id ?? null;
      } else {
        activeStart = null;
        activeActor = null;
      }
    });

    if (activeStart != null) {
      appendInterval(now);
    }

    result.set(key, totalMinutes);
  });

  return result;
}

function buildAttributedWorkedMinutesByItem(
  events: ProductionStatusEventRow[],
  actorUserId: string,
  range?: WorkedMinutesRange | null,
  calendar?: WorkingCalendar | null,
) {
  return buildAttributedWorkedMinutesByKey(
    events,
    actorUserId,
    (event) => event.production_item_id ?? null,
    range,
    calendar,
  );
}

function buildAttributedWorkedMinutesByRun(
  events: ProductionStatusEventRow[],
  actorUserId: string,
  range?: WorkedMinutesRange | null,
  calendar?: WorkingCalendar | null,
) {
  return buildAttributedWorkedMinutesByKey(
    events,
    actorUserId,
    (event) => event.batch_run_id ?? null,
    range,
    calendar,
  );
}

function isTimestampInRange(
  value: string | null | undefined,
  range?: WorkedMinutesRange | null,
) {
  if (!range) {
    return true;
  }
  if (!value) {
    return false;
  }
  const point = Date.parse(value);
  const start = Date.parse(range.startAt);
  const end = Date.parse(range.endAt);
  if (
    !Number.isFinite(point) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return false;
  }
  return point >= start && point < end;
}

function isWorkSessionInRange(
  session: ProductionWorkSessionRow,
  range?: WorkedMinutesRange | null,
) {
  if (!range) {
    return true;
  }
  return [session.started_at, session.stopped_at].some((value) =>
    isTimestampInRange(value, range),
  );
}

function buildFallbackOperatorMetrics(params: {
  stationIds: Set<string>;
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  search: string;
  range?: WorkedMinutesRange | null;
}): FallbackOperatorMetrics {
  const { stationIds, productionItems, batchRuns, search, range } = params;
  if (stationIds.size === 0) {
    return {
      workedMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      completedItems: 0,
      completedQty: 0,
      completedOrders: 0,
    };
  }

  const filteredItems = productionItems.filter((item) => {
    if (!item.station_id || !stationIds.has(item.station_id)) {
      return false;
    }
    if (!matchesOrderSearch(
      search,
      item.orders?.order_number,
      item.orders?.customer_name,
      item.order_id,
    )) {
      return false;
    }
    return isTimestampInRange(item.done_at ?? item.started_at ?? null, range);
  });

  const filteredRuns = batchRuns.filter((run) => {
    if (!run.station_id || !stationIds.has(run.station_id)) {
      return false;
    }
    if (!matchesOrderSearch(
      search,
      run.orders?.order_number,
      run.orders?.customer_name,
      run.order_id,
    )) {
      return false;
    }
    return isTimestampInRange(run.done_at ?? run.started_at ?? null, range);
  });

  const workedMinutesFromItems = filteredItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.duration_minutes ?? 0)),
    0,
  );
  const workedMinutesFromRuns = filteredRuns.reduce(
    (sum, run) => sum + Math.max(0, Number(run.duration_minutes ?? 0)),
    0,
  );
  const completedItemsFromRuns = filteredRuns.filter(
    (run) => run.status === "done",
  ).length;
  const completedItemsFromItems = filteredItems.filter(
    (item) => item.status === "done",
  );
  const completedOrders = new Set([
    ...completedItemsFromItems.map((item) => item.order_id),
    ...filteredRuns
      .filter((run) => run.status === "done")
      .map((run) => run.order_id),
  ]).size;

  return {
    workedMinutes: workedMinutesFromItems + workedMinutesFromRuns,
    regularMinutes: workedMinutesFromItems + workedMinutesFromRuns,
    overtimeMinutes: 0,
    completedItems: completedItemsFromItems.length + completedItemsFromRuns,
    completedQty:
      completedItemsFromItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.qty ?? 0)),
        0,
      ) + completedItemsFromRuns,
    completedOrders,
  };
}

function buildFallbackOrderBreakdown(params: {
  assignedStationIds: string[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  search: string;
  range?: WorkedMinutesRange | null;
}) {
  const stationIds = new Set(params.assignedStationIds);
  const map = new Map<string, OperatorOrderBreakdownRow>();

  params.productionItems.forEach((item) => {
    if (!item.station_id || !stationIds.has(item.station_id)) {
      return;
    }
    if (
      !matchesOrderSearch(
        params.search,
        item.orders?.order_number,
        item.orders?.customer_name,
        item.order_id,
      ) ||
      !isTimestampInRange(item.done_at ?? item.started_at ?? null, params.range)
    ) {
      return;
    }
    const current = map.get(item.order_id) ?? {
      orderId: item.order_id,
        stationId: item.station_id,
        orderNumber: item.orders?.order_number ?? item.order_id,
        customerName: item.orders?.customer_name ?? "",
        status: item.status,
        workedMinutes: 0,
        completedItems: 0,
      };
    current.workedMinutes += Math.max(0, Number(item.duration_minutes ?? 0));
    if (item.status === "done") {
      current.completedItems += 1;
    }
    map.set(item.order_id, current);
  });

  params.batchRuns.forEach((run) => {
    if (!run.station_id || !stationIds.has(run.station_id)) {
      return;
    }
    if (
      !matchesOrderSearch(
        params.search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      ) ||
      !isTimestampInRange(run.done_at ?? run.started_at ?? null, params.range)
    ) {
      return;
    }
    const hasItems = params.productionItems.some(
      (item) =>
        item.order_id === run.order_id &&
        item.batch_code === run.batch_code &&
        item.station_id === run.station_id,
    );
    if (hasItems) {
      return;
    }
    const current = map.get(run.order_id) ?? {
      orderId: run.order_id,
      stationId: run.station_id,
      orderNumber: run.orders?.order_number ?? run.order_id,
      customerName: run.orders?.customer_name ?? "",
      status: run.status,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += Math.max(0, Number(run.duration_minutes ?? 0));
    if (run.status === "done") {
      current.completedItems += 1;
    }
    map.set(run.order_id, current);
  });

  return Array.from(map.values())
    .filter((row) => row.workedMinutes > 0 || row.completedItems > 0)
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
}

function buildFallbackUnitBreakdown(params: {
  actorUserId: string;
  assignedStationIds: string[];
  stations: OperatorStationRow[];
  productionItems: ProductionItemRow[];
  orderItems?: OperatorOrderItemRow[];
  batchRuns: BatchRunRow[];
  completedItemIds: Set<string>;
  search: string;
  range?: WorkedMinutesRange | null;
}) {
  const stationIds = new Set(params.assignedStationIds);
  const stationTrackingModeById = new Map(
    params.stations.map((station) => [
      station.id,
      station.trackingMode ?? "construction_level",
    ]),
  );
  const orderItemById = new Map(
    (params.orderItems ?? []).map((item) => [item.id, item]),
  );
  const orderItemBySourceKey = new Map<string, OperatorOrderItemRow>();
  (params.orderItems ?? []).forEach((item) => {
    if (item.source_row_id) {
      orderItemBySourceKey.set(`${item.order_id}:${item.source_row_id}`, item);
    }
  });
  const getUnitPosition = (item: ProductionItemRow) => {
    const sourceKey = getProductionItemSourceKey(item);
    const orderItem = sourceKey
      ? (orderItemById.get(sourceKey) ??
        orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
      : undefined;
    return (
      getProductionItemMetaRowValue(item, "position") ??
      getOrderItemPositionLabel(orderItem) ??
      null
    );
  };
  const getUnitProductType = (item: ProductionItemRow) => {
    const sourceKey = getProductionItemSourceKey(item);
    const orderItem = sourceKey
      ? (orderItemById.get(sourceKey) ??
        orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
      : undefined;
    return (
      getProductionItemMetaRowValue(item, "item_type") ??
      getOrderItemProductTypeLabel(orderItem) ??
      item.material ??
      null
    );
  };
  const findMatchingRun = (item: ProductionItemRow) => {
    const itemSourceKey = getProductionItemSourceKey(item);
    return params.batchRuns.find((run) => {
      if (run.order_id !== item.order_id || run.batch_code !== item.batch_code) {
        return false;
      }
      if (!run.station_id || !stationIds.has(run.station_id)) {
        return false;
      }
      if (
        (stationTrackingModeById.get(run.station_id) ?? "construction_level") !==
        "construction_level"
      ) {
        return false;
      }
      if (itemSourceKey && run.route_key && run.route_key !== "default") {
        return itemSourceKey === run.route_key;
      }
      return true;
    });
  };
  return params.productionItems
    .filter((item) => {
      const matchingRun = findMatchingRun(item);
      const stationId = item.station_id ?? matchingRun?.station_id ?? null;
      if (!stationId || !stationIds.has(stationId)) {
        return false;
      }
      if (
        (stationTrackingModeById.get(stationId) ?? "construction_level") !==
        "construction_level"
      ) {
        return false;
      }
      if (
        !matchesOrderSearch(
          params.search,
          item.orders?.order_number,
          item.orders?.customer_name,
          item.order_id,
        )
      ) {
        return false;
      }
      const completedAt = getProductionItemCompletedAt(item);
      const completedBy = getProductionItemCompletedBy(item);
      const isCompleted =
        params.completedItemIds.has(item.id) ||
        (completedBy === params.actorUserId &&
          getProductionItemCompletedQty(item) >=
            Math.max(1, Number(item.qty ?? 0)));
      if (!isCompleted) {
        return false;
      }
      return isTimestampInRange(
        completedAt ?? matchingRun?.done_at ?? item.started_at ?? null,
        params.range,
      );
    })
    .map((item) => {
      const matchingRun = findMatchingRun(item);
      const completedAt = getProductionItemCompletedAt(item);
      return {
        productionItemId: item.id,
        orderId: item.order_id,
        orderNumber: item.orders?.order_number ?? item.order_id,
        customerName: item.orders?.customer_name ?? "",
        batchCode: item.batch_code,
        productType: getUnitProductType(item),
        unitPosition: getUnitPosition(item),
        itemName: item.item_name,
        qty: Number(item.qty ?? 0),
        status: item.status,
        workedMinutes: Math.max(0, Number(item.duration_minutes ?? 0)),
        stationId: item.station_id ?? matchingRun?.station_id ?? null,
        doneAt: completedAt ?? matchingRun?.done_at ?? null,
        completed: true,
      };
    })
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
}

function buildFallbackStationBreakdown(params: {
  assignedStationIds: string[];
  stations: OperatorStationRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  search: string;
  range?: WorkedMinutesRange | null;
}) {
  const stationIds = new Set(params.assignedStationIds);
  const stationNameById = new Map(
    params.stations.map((station) => [station.id, station.name]),
  );
  const map = new Map<string, OperatorStationBreakdownRow>();

  params.productionItems.forEach((item) => {
    if (!item.station_id || !stationIds.has(item.station_id)) {
      return;
    }
    if (
      !matchesOrderSearch(
        params.search,
        item.orders?.order_number,
        item.orders?.customer_name,
        item.order_id,
      ) ||
      !isTimestampInRange(item.done_at ?? item.started_at ?? null, params.range)
    ) {
      return;
    }
    const current = map.get(item.station_id) ?? {
      stationId: item.station_id,
      stationName: stationNameById.get(item.station_id) ?? item.station_id,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += Math.max(0, Number(item.duration_minutes ?? 0));
    if (item.status === "done") {
      current.completedItems += 1;
    }
    map.set(item.station_id, current);
  });

  params.batchRuns.forEach((run) => {
    if (!run.station_id || !stationIds.has(run.station_id)) {
      return;
    }
    if (
      !matchesOrderSearch(
        params.search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      ) ||
      !isTimestampInRange(run.done_at ?? run.started_at ?? null, params.range)
    ) {
      return;
    }
    const hasItems = params.productionItems.some(
      (item) =>
        item.order_id === run.order_id &&
        item.batch_code === run.batch_code &&
        item.station_id === run.station_id,
    );
    if (hasItems) {
      return;
    }
    const current = map.get(run.station_id) ?? {
      stationId: run.station_id,
      stationName: stationNameById.get(run.station_id) ?? run.station_id,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += Math.max(0, Number(run.duration_minutes ?? 0));
    if (run.status === "done") {
      current.completedItems += 1;
    }
    map.set(run.station_id, current);
  });

  return Array.from(map.values())
    .filter((row) => row.workedMinutes > 0 || row.completedItems > 0)
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
}

function getItemWorkedMinutes(
  item: ProductionItemRow,
  workedMinutesByItem: Map<string, number>,
  completedItemIds?: Set<string>,
) {
  const trackedMinutes = getProductionItemWorkedMinutes(item, workedMinutesByItem);
  if (trackedMinutes > 0) {
    return trackedMinutes;
  }
  const storedMinutes = Number(item.duration_minutes ?? 0);
  if (
    completedItemIds?.has(item.id) &&
    Number.isFinite(storedMinutes) &&
    storedMinutes > 0
  ) {
    return storedMinutes;
  }
  return 0;
}

function getRunWorkedMinutes(
  run: BatchRunRow,
  workedMinutesByRun: Map<string, number>,
  completedRunIds?: Set<string>,
) {
  const trackedMinutes = getBatchRunWorkedMinutes(run, workedMinutesByRun);
  if (trackedMinutes > 0) {
    return trackedMinutes;
  }
  const storedMinutes = Number(run.duration_minutes ?? 0);
  if (
    completedRunIds?.has(run.id) &&
    Number.isFinite(storedMinutes) &&
    storedMinutes > 0
  ) {
    return storedMinutes;
  }
  return 0;
}

function getAttributedItemWorkedMinutes(
  item: ProductionItemRow,
  workedMinutesByItem: Map<string, number>,
) {
  return getProductionItemWorkedMinutes(item, workedMinutesByItem);
}

function getAttributedRunWorkedMinutes(
  run: BatchRunRow,
  workedMinutesByRun: Map<string, number>,
) {
  return getBatchRunWorkedMinutes(run, workedMinutesByRun);
}

function getWorkSessionBreakdown(params: {
  session: ProductionWorkSessionRow;
  range?: WorkedMinutesRange | null;
  calendar?: WorkingCalendar | null;
}) {
  const overlap = getProductionWorkSessionOverlapMinutes({
    session: params.session,
    range: params.range ?? null,
    calendar: params.calendar ?? null,
  });
  return {
    totalMinutes: overlap.totalMinutes,
    regularMinutes: overlap.regularMinutes,
    overtimeMinutes: overlap.overtimeMinutes,
  } satisfies WorkedTimeBreakdown;
}

function getOperatorOrderStatusRank(status: ProductionStatus | string | null) {
  switch (status) {
    case "blocked":
      return 5;
    case "paused":
      return 4;
    case "in_progress":
      return 3;
    case "done":
      return 2;
    case "pending":
    case "queued":
      return 1;
    default:
      return 0;
  }
}

function mergeOperatorOrderStatus(
  current: ProductionStatus | string | null,
  next: ProductionStatus | string | null,
) {
  return getOperatorOrderStatusRank(next) >= getOperatorOrderStatusRank(current)
    ? next
    : current;
}

function getOperatorSessionStatus(
  session: Pick<
    ProductionWorkSessionRow,
    "is_active" | "ended_status" | "stopped_at"
  >,
) {
  if (session.is_active) {
    return "in_progress" satisfies ProductionStatus;
  }
  if (
    session.ended_status === "paused" ||
    session.ended_status === "blocked" ||
    session.ended_status === "done"
  ) {
    return session.ended_status;
  }
  return session.stopped_at ? "paused" : "in_progress";
}

function getSingleAssignedStationId(assignedStationIds: string[] | null | undefined) {
  const unique = Array.from(new Set(assignedStationIds ?? []));
  return unique.length === 1 ? unique[0] : null;
}

export function buildOperatorSummaryRows(params: {
  profiles: OperatorProfileRow[];
  operatorConfigs: OperatorConfigRow[];
  assignments: OperatorAssignmentRow[];
  stations: OperatorStationRow[];
  events: ProductionStatusEventRow[];
  workSessions?: ProductionWorkSessionRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  filter?: OperatorMetricsFilter;
}) {
  const {
    profiles,
    operatorConfigs,
    assignments,
    stations,
    events,
    workSessions = [],
    productionItems,
    batchRuns,
    filter,
  } = params;
  const stationNameById = new Map(stations.map((station) => [station.id, station.name]));
  const productionItemById = new Map(productionItems.map((item) => [item.id, item]));
  const batchRunById = new Map(batchRuns.map((run) => [run.id, run]));
  const configByUserId = new Map(
    operatorConfigs
      .filter((config) => typeof config.user_id === "string" && config.user_id)
      .map((config) => [config.user_id as string, config]),
  );
  const configByName = new Map(
    operatorConfigs.map((config) => [normalizeOperatorName(config.name), config]),
  );
  const search = normalizeSearch(filter?.search);
  const calendar = filter?.calendar ?? null;

  return profiles
    .filter((profile) => profile.is_active ?? true)
    .map((profile) => {
      const actorEvents = getActorEvents(profile.id, events);
      const actorRunOnlyEvents = getActorRunOnlyEvents(profile.id, events);
      const actorSessions = workSessions.filter(
        (session) =>
          session.operator_user_id === profile.id &&
          isWorkSessionInRange(session, filter?.range),
      );
      const completedItemIds = uniqueCompletedItemIdsByActor(
        profile.id,
        events,
        filter?.range,
      );
      const completedRunIds = uniqueCompletedRunIdsByActor(
        profile.id,
        events,
        filter?.range,
      );
      const completedItems = uniqueCompletedItemsByActor(
        profile.id,
        events,
        productionItems,
        filter?.range,
      );
      const completedRuns = uniqueCompletedRunsByActor(
        profile.id,
        events,
        batchRuns,
        filter?.range,
      );
      const workedBreakdownByItem = filter?.range
        ? buildWorkedBreakdownByItemInRange(actorEvents, filter.range, calendar)
        : buildWorkedBreakdownByItem(actorEvents, calendar);
      const workedBreakdownByRun = filter?.range
        ? buildWorkedBreakdownByRunInRange(
            actorRunOnlyEvents,
            filter.range,
            calendar,
          )
        : buildWorkedBreakdownByRun(actorRunOnlyEvents, calendar);
      const workedMinutesByItem = filter?.range
        ? buildWorkedMinutesByItemInRange(actorEvents, filter.range)
        : buildWorkedMinutesByItem(actorEvents);
      const workedMinutesByRun = filter?.range
        ? buildWorkedMinutesByRunInRange(actorRunOnlyEvents, filter.range)
        : buildWorkedMinutesByRun(actorRunOnlyEvents);
      const totalBreakdown = filter?.range
        ? Array.from(workedBreakdownByItem.values()).reduce(
            addBreakdown,
            zeroBreakdown(),
          )
        : addBreakdown(
            summarizeWorkedBreakdownByItem(
              actorEvents,
              getTodayIsoLocal(),
              calendar,
            ).total,
            summarizeWorkedBreakdownByRun(
              actorRunOnlyEvents,
              getTodayIsoLocal(),
              calendar,
            ).total,
          );
      if (filter?.range) {
        const runTotals = Array.from(workedBreakdownByRun.values()).reduce(
          addBreakdown,
          zeroBreakdown(),
        );
        totalBreakdown.totalMinutes += runTotals.totalMinutes;
        totalBreakdown.regularMinutes += runTotals.regularMinutes;
        totalBreakdown.overtimeMinutes += runTotals.overtimeMinutes;
      }
      const touchedItems = productionItems.filter((item) => {
        return getItemWorkedMinutes(item, workedMinutesByItem, completedItemIds) > 0;
      });
      const touchedRuns = batchRuns.filter((run) => {
        return getRunWorkedMinutes(run, workedMinutesByRun, completedRunIds) > 0;
      });
      const filteredTouchedItems = touchedItems.filter((item) => {
        return (
          matchesOrderSearch(
            search,
            item.orders?.order_number,
            item.orders?.customer_name,
            item.order_id,
          )
        );
      });
      const filteredTouchedRuns = touchedRuns.filter((run) => {
        return (
          matchesOrderSearch(
            search,
            run.orders?.order_number,
            run.orders?.customer_name,
            run.order_id,
          )
        );
      });
      const filteredSessions = actorSessions.filter((session) => {
        const item = session.production_item_id
          ? (productionItemById.get(session.production_item_id) ?? null)
          : null;
        const run = batchRunById.get(session.batch_run_id) ?? null;
        return matchesOrderSearch(
          search,
          item?.orders?.order_number ?? run?.orders?.order_number,
          item?.orders?.customer_name ?? run?.orders?.customer_name,
          item?.order_id ?? run?.order_id ?? session.order_id,
        );
      });
      const visibleSessions = search ? filteredSessions : actorSessions;
      const sessionBreakdown = visibleSessions.reduce(
        (sum, session) =>
          addBreakdown(
            sum,
            getWorkSessionBreakdown({
              session,
              range: filter?.range,
              calendar,
            }),
          ),
        zeroBreakdown(),
      );
      const filteredWorkedMinutes =
        filteredTouchedItems.reduce(
          (sum, item) =>
            sum + getItemWorkedMinutes(item, workedMinutesByItem, completedItemIds),
          0,
        ) +
        filteredTouchedRuns.reduce(
          (sum, run) =>
            sum + getRunWorkedMinutes(run, workedMinutesByRun, completedRunIds),
          0,
        );
      const filteredBreakdown = filteredTouchedItems.reduce(
        (sum, item) =>
          addBreakdown(
            sum,
            workedBreakdownByItem.get(item.id) ?? zeroBreakdown(),
          ),
        zeroBreakdown(),
      );
      const filteredRunBreakdown = filteredTouchedRuns.reduce(
        (sum, run) =>
          addBreakdown(
            sum,
            workedBreakdownByRun.get(run.id) ?? zeroBreakdown(),
          ),
        zeroBreakdown(),
      );
      const visibleBreakdown = addBreakdown(
        filteredBreakdown,
        filteredRunBreakdown,
      );
      const filteredCompletedItems = completedItems.filter((item) =>
        matchesOrderSearch(
          search,
          item.orders?.order_number,
          item.orders?.customer_name,
          item.order_id,
        ),
      );
      const filteredCompletedRuns = completedRuns.filter((run) =>
        matchesOrderSearch(
          search,
          run.orders?.order_number,
          run.orders?.customer_name,
          run.order_id,
        ),
      );
      const completedOrders = new Set([
        ...filteredCompletedItems.map((item) => item.order_id),
        ...filteredCompletedRuns.map((run) => run.order_id),
      ]).size;
      const completedQty = filteredCompletedItems.reduce(
        (sum, item) =>
          sum + Number(item.qty ?? 0),
        0,
      ) + filteredCompletedRuns.length;
      const config =
        configByUserId.get(profile.id) ??
        configByName.get(normalizeOperatorName(profile.full_name));
      const activeAssignments = assignments
        .filter((assignment) => assignment.user_id === profile.id && assignment.is_active)
      const stationIds = new Set(activeAssignments.map((assignment) => assignment.station_id));
      const stationNames = activeAssignments
        .map((assignment) => stationNameById.get(assignment.station_id) ?? assignment.station_id)
        .sort((a, b) => a.localeCompare(b));
      let finalWorkedMinutes = search
        ? filteredWorkedMinutes
        : totalBreakdown.totalMinutes;
      let finalRegularMinutes = search
        ? visibleBreakdown.regularMinutes
        : totalBreakdown.regularMinutes;
      let finalOvertimeMinutes = search
        ? visibleBreakdown.overtimeMinutes
        : totalBreakdown.overtimeMinutes;
      const finalCompletedItems =
        filteredCompletedItems.length + filteredCompletedRuns.length;
      const finalCompletedQty = completedQty;
      const finalCompletedOrders = completedOrders;
      if (actorSessions.length > 0) {
        finalWorkedMinutes = sessionBreakdown.totalMinutes;
        finalRegularMinutes = sessionBreakdown.regularMinutes;
        finalOvertimeMinutes = sessionBreakdown.overtimeMinutes;
      }
      const hourlyRate = config?.hourly_rate ?? null;
      const overtimeRate = config?.overtime_rate ?? config?.hourly_rate ?? null;
      return {
        userId: profile.id,
        name: profile.full_name?.trim() || "Unknown user",
        role: profile.role?.trim() || "Operator",
        stations: Array.from(new Set(stationNames)),
        hourlyRate,
        overtimeRate,
        workedMinutes: finalWorkedMinutes,
        regularMinutes: finalRegularMinutes,
        overtimeMinutes: finalOvertimeMinutes,
        laborCost:
          hourlyRate != null
            ? (finalRegularMinutes / 60) * Number(hourlyRate) +
              (finalOvertimeMinutes / 60) *
                Number(overtimeRate ?? hourlyRate)
            : null,
        completedItems: finalCompletedItems,
        completedQty: finalCompletedQty,
        completedOrders: finalCompletedOrders,
      } satisfies OperatorSummaryRow;
    })
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export function buildOperatorOverviewRows(params: {
  profiles: OperatorProfileRow[];
  operatorConfigs: OperatorConfigRow[];
  assignments: OperatorAssignmentRow[];
  stations: OperatorStationRow[];
  events: ProductionStatusEventRow[];
  workSessions?: ProductionWorkSessionRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  filter?: OperatorMetricsFilter;
}) {
  const {
    profiles,
    operatorConfigs,
    assignments,
    stations,
    events,
    workSessions = [],
    productionItems,
    batchRuns,
    filter,
  } = params;
  const summaryRows = buildOperatorSummaryRows(params);
  const orderLevelStationIds = stations
    .filter((station) => station.trackingMode !== "construction_level")
    .map((station) => station.id);
  const orderLevelStationSet = new Set(orderLevelStationIds);

  return summaryRows.map((row) => {
    const assignedStationIds = assignments
      .filter(
        (assignment) => assignment.user_id === row.userId && assignment.is_active,
      )
      .map((assignment) => assignment.station_id);
    const hasConstructionLevelAssignment = assignedStationIds.some(
      (stationId) => !orderLevelStationSet.has(stationId),
    );
    const isOrderLevelOperator =
      assignedStationIds.length > 0 && !hasConstructionLevelAssignment;

    const orderBreakdown = buildOperatorOrderBreakdown({
      actorUserId: row.userId,
      events,
      workSessions,
      batchRuns,
      productionItems,
      stations,
      filter: {
        ...filter,
        assignedStationIds,
        orderLevelStationIds,
      },
    });

    const unitBreakdown = hasConstructionLevelAssignment
      ? buildOperatorUnitBreakdown({
          actorUserId: row.userId,
          events,
          workSessions,
          batchRuns,
          productionItems,
          stations,
          filter: {
            ...filter,
            assignedStationIds,
          },
        })
      : [];

    const completedUnits = unitBreakdown
      .filter((unit) => unit.status === "done")
      .reduce((sum, unit) => sum + Math.max(1, Number(unit.qty ?? 0)), 0);
    const relatedUnits = orderBreakdown.reduce(
      (sum, item) => sum + Math.max(item.itemCount ?? item.completedItems ?? 0, 0),
      0,
    );

    return {
      ...row,
      hasConstructionLevelAssignment,
      isOrderLevelOperator,
      completedUnits,
      relatedUnits,
      displayUnits: isOrderLevelOperator ? relatedUnits : completedUnits,
      ordersWithWorkCount: orderBreakdown.length,
    } satisfies OperatorOverviewRow;
  });
}

export function buildOperatorOrderBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  workSessions?: ProductionWorkSessionRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  stations?: OperatorStationRow[];
  filter?: OperatorMetricsFilter;
}) {
  const {
    actorUserId,
    events,
    workSessions = [],
    productionItems,
    batchRuns,
    stations = [],
    filter,
  } = params;
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const runOnlyEvents = events.filter(
    (event) => !event.production_item_id && event.batch_run_id,
  );
  const workedMinutesByRun = buildAttributedWorkedMinutesByRun(
    runOnlyEvents,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const completedItemIds = uniqueCompletedItemIdsByActor(
    actorUserId,
    events,
    filter?.range,
  );
  const completedRunIds = uniqueCompletedRunIdsByActor(
    actorUserId,
    events,
    filter?.range,
  );
  const search = normalizeSearch(filter?.search);
  const productionItemById = new Map(productionItems.map((item) => [item.id, item]));
  const batchRunById = new Map(batchRuns.map((run) => [run.id, run]));
  const map = new Map<string, OperatorOrderBreakdownRow>();
  const assignedStationSet = new Set(filter?.assignedStationIds ?? []);
  const orderLevelStationSet = new Set(
    filter?.orderLevelStationIds ??
      stations
        .filter((station) => station.trackingMode !== "construction_level")
        .map((station) => station.id),
  );
  const singleAssignedStationId = getSingleAssignedStationId(
    filter?.assignedStationIds,
  );
  const shouldIncludeStation = (stationId: string | null | undefined) =>
    assignedStationSet.size === 0 || Boolean(stationId && assignedStationSet.has(stationId));
  const isOrderLevelStation = (stationId: string | null | undefined) =>
    Boolean(stationId && orderLevelStationSet.has(stationId));
  const sessionOrderIds = new Set<string>();
  const itemIdsByOrder = new Map<string, Set<string>>();
  const scopeKeysByOrder = new Map<string, Set<string>>();
  const addOrderItemScope = (
    orderId: string,
    key: string | null | undefined,
  ) => {
    if (!key) {
      return;
    }
    const keys = scopeKeysByOrder.get(orderId) ?? new Set<string>();
    keys.add(key);
    scopeKeysByOrder.set(orderId, keys);
  };
  const addOrderItemId = (
    orderId: string,
    productionItemId: string | null | undefined,
  ) => {
    if (!productionItemId) {
      return;
    }
    const ids = itemIdsByOrder.get(orderId) ?? new Set<string>();
    ids.add(productionItemId);
    itemIdsByOrder.set(orderId, ids);
    addOrderItemScope(orderId, `item:${productionItemId}`);
  };
  const actorSessions = workSessions.filter(
    (session) =>
      session.operator_user_id === actorUserId &&
      isWorkSessionInRange(session, filter?.range),
  );
  const hasActorEventsInRange = hasActorEventInRange(
    actorUserId,
    events,
    filter?.range,
  );
  if (actorSessions.length === 0 && !hasActorEventsInRange) {
    return [];
  }
  const hasPreciseSessionsForActor = workSessions.some(
    (session) => session.operator_user_id === actorUserId,
  );
  if (actorSessions.length > 0) {
    actorSessions.forEach((session) => {
      const item = session.production_item_id
        ? (productionItemById.get(session.production_item_id) ?? null)
        : null;
      const run = batchRunById.get(session.batch_run_id) ?? null;
      if (
        !matchesOrderSearch(
          search,
          item?.orders?.order_number ?? run?.orders?.order_number,
          item?.orders?.customer_name ?? run?.orders?.customer_name,
          item?.order_id ?? run?.order_id ?? session.order_id,
        )
      ) {
        return;
      }
      const breakdown = getWorkSessionBreakdown({
        session,
        range: filter?.range,
        calendar: filter?.calendar,
      });
      const workedMinutes = breakdown.totalMinutes;
      const orderId = item?.order_id ?? run?.order_id ?? session.order_id;
      const stationId =
        session.station_id ??
        item?.station_id ??
        run?.station_id ??
        singleAssignedStationId;
      if (!shouldIncludeStation(stationId)) {
        return;
      }
      if (workedMinutes <= 0 || !orderId) {
        return;
      }
      const current = map.get(orderId) ?? {
        orderId,
      stationId: stationId ?? null,
      orderNumber:
        item?.orders?.order_number ?? run?.orders?.order_number ?? orderId,
      customerName:
        item?.orders?.customer_name ?? run?.orders?.customer_name ?? "",
      status: item?.status ?? run?.status ?? null,
      workedMinutes: 0,
      completedItems: 0,
    };
      current.status = mergeOperatorOrderStatus(
        current.status,
        getOperatorSessionStatus(session),
      );
      current.stationId = current.stationId ?? stationId ?? null;
      current.workedMinutes += workedMinutes;
      map.set(orderId, current);
      sessionOrderIds.add(orderId);
      addOrderItemId(orderId, session.production_item_id);
      if (!session.production_item_id) {
        addOrderItemScope(
          orderId,
          session.batch_run_id
            ? `run:${session.batch_run_id}`
            : `order:${orderId}`,
        );
      }
    });
  }
  productionItems.forEach((item) => {
    const stationId = item.station_id ?? singleAssignedStationId;
    if (!shouldIncludeStation(stationId)) {
      return;
    }
    if (
      !matchesOrderSearch(
        search,
        item.orders?.order_number,
        item.orders?.customer_name,
        item.order_id,
      )
    ) {
      return;
    }
    const itemWorkedMinutes = getAttributedItemWorkedMinutes(
      item,
      workedMinutesByItem,
    );
    const itemCompleted = completedItemIds.has(item.id);
    const hasSessionOrder = map.has(item.order_id);
    const shouldAddWorkedMinutes =
      !hasPreciseSessionsForActor &&
      itemWorkedMinutes > 0 &&
      !sessionOrderIds.has(item.order_id);
    const shouldAddCompletion = itemCompleted && (!hasPreciseSessionsForActor || hasSessionOrder);
    if (!shouldAddWorkedMinutes && !shouldAddCompletion) {
      return;
    }
    const current = map.get(item.order_id) ?? {
      orderId: item.order_id,
      stationId,
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
      status: item.status,
      workedMinutes: 0,
      completedItems: 0,
    };
    if (shouldAddWorkedMinutes) {
      current.stationId = current.stationId ?? stationId ?? null;
      current.workedMinutes += itemWorkedMinutes;
      current.status = mergeOperatorOrderStatus(current.status, "in_progress");
      addOrderItemId(item.order_id, item.id);
    }
    if (shouldAddCompletion) {
      current.completedItems += 1;
      current.status = mergeOperatorOrderStatus(current.status, "done");
      addOrderItemId(item.order_id, item.id);
    }
    map.set(item.order_id, current);
  });
  batchRuns.forEach((run) => {
    const stationId = run.station_id ?? singleAssignedStationId;
    if (!shouldIncludeStation(stationId) || !isOrderLevelStation(stationId)) {
      return;
    }
    if (
      !matchesOrderSearch(
        search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      )
    ) {
      return;
    }
    const runWorkedMinutes = getAttributedRunWorkedMinutes(run, workedMinutesByRun);
    const runCompleted = completedRunIds.has(run.id);
    const hasSessionOrder = map.has(run.order_id);
    const shouldAddWorkedMinutes =
      !hasPreciseSessionsForActor &&
      runWorkedMinutes > 0 &&
      !sessionOrderIds.has(run.order_id);
    const shouldAddCompletion = runCompleted && (!hasPreciseSessionsForActor || hasSessionOrder);
    if (!shouldAddWorkedMinutes && !shouldAddCompletion) {
      return;
    }
    const current = map.get(run.order_id) ?? {
      orderId: run.order_id,
      stationId,
      orderNumber: run.orders?.order_number ?? run.order_id,
      customerName: run.orders?.customer_name ?? "",
      status: run.status,
      workedMinutes: 0,
      completedItems: 0,
    };
    if (shouldAddWorkedMinutes) {
      current.stationId = current.stationId ?? stationId ?? null;
      current.workedMinutes += runWorkedMinutes;
      current.status = mergeOperatorOrderStatus(current.status, "in_progress");
      addOrderItemScope(run.order_id, `run:${run.id}`);
    }
    if (shouldAddCompletion) {
      current.completedItems += 1;
      current.status = mergeOperatorOrderStatus(current.status, "done");
      addOrderItemScope(run.order_id, `run:${run.id}`);
    }
    map.set(run.order_id, current);
  });
  const rows = Array.from(map.values())
    .map((row) => ({
      ...row,
      itemCount:
        itemIdsByOrder.get(row.orderId)?.size ??
        scopeKeysByOrder.get(row.orderId)?.size ??
        row.completedItems,
    }))
    .filter((row) => row.workedMinutes > 0 || row.completedItems > 0)
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
  return rows;
}

export function buildOperatorUnitBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  workSessions?: ProductionWorkSessionRow[];
  batchRuns?: BatchRunRow[];
  productionItems: ProductionItemRow[];
  orderItems?: OperatorOrderItemRow[];
  stations?: OperatorStationRow[];
  filter?: OperatorMetricsFilter;
}) {
  const {
    actorUserId,
    events,
    workSessions = [],
    batchRuns = [],
    productionItems,
    orderItems = [],
    stations = [],
    filter,
  } = params;
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const search = normalizeSearch(filter?.search);
  const completedItemIds = uniqueCompletedItemIdsByActor(
    actorUserId,
    events,
    filter?.range,
  );
  const stationTrackingModeById = new Map(
    stations.map((station) => [
      station.id,
      station.trackingMode ?? "construction_level",
    ]),
  );
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
  const orderItemBySourceKey = new Map<string, OperatorOrderItemRow>();
  orderItems.forEach((item) => {
    if (item.source_row_id) {
      orderItemBySourceKey.set(`${item.order_id}:${item.source_row_id}`, item);
    }
  });
  const getUnitPosition = (item: ProductionItemRow) => {
    const sourceKey = getProductionItemSourceKey(item);
    const orderItem = sourceKey
      ? (orderItemById.get(sourceKey) ??
        orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
      : undefined;
    return (
      getProductionItemMetaRowValue(item, "position") ??
      getOrderItemPositionLabel(orderItem) ??
      null
    );
  };
  const getUnitProductType = (item: ProductionItemRow) => {
    const sourceKey = getProductionItemSourceKey(item);
    const orderItem = sourceKey
      ? (orderItemById.get(sourceKey) ??
        orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
      : undefined;
    return (
      getProductionItemMetaRowValue(item, "item_type") ??
      getOrderItemProductTypeLabel(orderItem) ??
      item.material ??
      null
    );
  };
  const isConstructionLevelStation = (stationId: string | null | undefined) =>
    !stationId ||
    (stationTrackingModeById.get(stationId) ?? "construction_level") ===
      "construction_level";
  const assignedStationSet = new Set(filter?.assignedStationIds ?? []);
  const shouldIncludeStation = (stationId: string | null | undefined) =>
    !stationId ||
    assignedStationSet.size === 0 ||
    assignedStationSet.has(stationId);
  const actorSessions = workSessions.filter(
    (session) =>
      session.operator_user_id === actorUserId &&
      isWorkSessionInRange(session, filter?.range) &&
      (!!session.production_item_id || !!session.batch_run_id),
  );
  const hasActorEventsInRange = hasActorEventInRange(
    actorUserId,
    events,
    filter?.range,
  );
  if (actorSessions.length === 0 && !hasActorEventsInRange) {
    return [];
  }
  const hasPreciseSessionsForActor = workSessions.some(
    (session) => session.operator_user_id === actorUserId,
  );
  if (actorSessions.length > 0) {
    const workedMinutesBySessionItem = new Map<string, number>();
    const statusBySessionItem = new Map<string, ProductionStatus | string | null>();
    const stationIdBySessionItem = new Map<string, string | null>();
    const productionItemById = new Map(productionItems.map((item) => [item.id, item]));
    const batchRunById = new Map(batchRuns.map((run) => [run.id, run]));
    actorSessions.forEach((session) => {
      const breakdown = getWorkSessionBreakdown({
        session,
        range: filter?.range,
        calendar: filter?.calendar,
      });
      if (breakdown.totalMinutes <= 0) {
        return;
      }
      const sessionItem = session.production_item_id
        ? (productionItemById.get(session.production_item_id) ?? null)
        : null;
      const run = batchRunById.get(session.batch_run_id) ?? null;
      const sessionStationId =
        session.station_id ?? sessionItem?.station_id ?? run?.station_id ?? null;
      if (
        !isConstructionLevelStation(sessionStationId) ||
        !shouldIncludeStation(sessionStationId)
      ) {
        return;
      }
      if (session.production_item_id) {
        workedMinutesBySessionItem.set(
          session.production_item_id,
          (workedMinutesBySessionItem.get(session.production_item_id) ?? 0) +
            breakdown.totalMinutes,
        );
        statusBySessionItem.set(
          session.production_item_id,
          mergeOperatorOrderStatus(
            statusBySessionItem.get(session.production_item_id) ?? null,
            getOperatorSessionStatus(session),
          ),
        );
        stationIdBySessionItem.set(session.production_item_id, sessionStationId);
        return;
      }
    });
    const sessionRows = productionItems
      .map((item) => {
        const workedMinutes = workedMinutesBySessionItem.get(item.id) ?? 0;
        const stationId = stationIdBySessionItem.get(item.id) ?? item.station_id;
        return {
          productionItemId: item.id,
          orderId: item.order_id,
          orderNumber: item.orders?.order_number ?? item.order_id,
          customerName: item.orders?.customer_name ?? "",
          batchCode: item.batch_code,
          productType: getUnitProductType(item),
          unitPosition: getUnitPosition(item),
          itemName: item.item_name,
          qty: Number(item.qty ?? 0),
          status: statusBySessionItem.get(item.id) ?? item.status,
          workedMinutes,
          stationId,
          doneAt: item.done_at ?? null,
          completed:
            completedItemIds.has(item.id) ||
            (hasCompletedTimestamp(item.done_at) &&
              isTimestampInRange(item.done_at, filter?.range)),
        };
      })
      .filter(
        (item) =>
          (item.workedMinutes > 0 || item.completed) &&
          isConstructionLevelStation(item.stationId) &&
          shouldIncludeStation(item.stationId) &&
          matchesOrderSearch(
            search,
            item.orderNumber,
            item.customerName,
            item.orderId,
          ),
      )
      .sort((a, b) => b.workedMinutes - a.workedMinutes);
    if (sessionRows.length > 0) {
      return sessionRows;
    }
    if (hasPreciseSessionsForActor) {
      return [];
    }
  }
  if (hasPreciseSessionsForActor) {
    return [];
  }
    const rows = productionItems
      .map((item) => {
        const workedMinutes = getAttributedItemWorkedMinutes(
          item,
          workedMinutesByItem,
      );
      return {
        productionItemId: item.id,
        orderId: item.order_id,
        orderNumber: item.orders?.order_number ?? item.order_id,
        customerName: item.orders?.customer_name ?? "",
        batchCode: item.batch_code,
        productType: getUnitProductType(item),
        unitPosition: getUnitPosition(item),
        itemName: item.item_name,
        qty: Number(item.qty ?? 0),
        status: item.status,
          workedMinutes,
          stationId: item.station_id,
          doneAt: item.done_at ?? null,
          completed:
            completedItemIds.has(item.id) ||
            (hasCompletedTimestamp(item.done_at) &&
              isTimestampInRange(item.done_at, filter?.range)),
      };
    })
    .filter(
      (item) =>
        (item.workedMinutes > 0 || item.completed) &&
        isConstructionLevelStation(item.stationId) &&
        shouldIncludeStation(item.stationId) &&
        matchesOrderSearch(
          search,
          item.orderNumber,
          item.customerName,
          item.orderId,
        ),
    )
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
  const fallbackRows =
    (filter?.assignedStationIds?.length ?? 0) > 0
      ? buildFallbackUnitBreakdown({
          actorUserId,
          assignedStationIds: filter?.assignedStationIds ?? [],
          stations,
          productionItems,
          orderItems,
          batchRuns,
          completedItemIds,
          search,
          range: filter?.range,
        })
      : [];
  if (fallbackRows.length > 0 && rows.length === 0) {
    return fallbackRows;
  }
  return rows;
}

export function buildOperatorStationBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  workSessions?: ProductionWorkSessionRow[];
  productionItems: ProductionItemRow[];
  stations: OperatorStationRow[];
  batchRuns: BatchRunRow[];
  filter?: OperatorMetricsFilter;
}) {
  const {
    actorUserId,
    events,
    workSessions = [],
    productionItems,
    stations,
    batchRuns,
    filter,
  } = params;
  const stationNameById = new Map(stations.map((station) => [station.id, station.name]));
  const stationTrackingModeById = new Map(
    stations.map((station) => [
      station.id,
      station.trackingMode ?? "construction_level",
    ]),
  );
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const runOnlyEvents = events.filter(
    (event) => !event.production_item_id && event.batch_run_id,
  );
  const workedMinutesByRun = buildAttributedWorkedMinutesByRun(
    runOnlyEvents,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const completedItemIds = uniqueCompletedItemIdsByActor(
    actorUserId,
    events,
    filter?.range,
  );
  const completedRunIds = uniqueCompletedRunIdsByActor(
    actorUserId,
    events,
    filter?.range,
  );
  const search = normalizeSearch(filter?.search);
  const map = new Map<string, OperatorStationBreakdownRow>();
  const productionItemById = new Map(productionItems.map((item) => [item.id, item]));
  const batchRunById = new Map(batchRuns.map((run) => [run.id, run]));
  const assignedStationSet = new Set(filter?.assignedStationIds ?? []);
  const singleAssignedStationId = getSingleAssignedStationId(
    filter?.assignedStationIds,
  );
  const shouldIncludeStation = (stationId: string) =>
    assignedStationSet.size === 0 || assignedStationSet.has(stationId);
  const isOrderLevelStation = (stationId: string | null | undefined) =>
    Boolean(
      stationId &&
        (stationTrackingModeById.get(stationId) ?? "construction_level") !==
          "construction_level",
    );
  const isCompletedItemInRange = (item: ProductionItemRow) =>
    completedItemIds.has(item.id) ||
    (hasCompletedTimestamp(item.done_at) &&
      isTimestampInRange(item.done_at, filter?.range));
  const isCompletedRunInRange = (run: BatchRunRow) =>
    completedRunIds.has(run.id) ||
    (hasCompletedTimestamp(run.done_at) &&
      isTimestampInRange(run.done_at, filter?.range));
  const actorSessions = workSessions.filter(
    (session) =>
      session.operator_user_id === actorUserId &&
      isWorkSessionInRange(session, filter?.range),
  );
  const hasActorEventsInRange = hasActorEventInRange(
    actorUserId,
    events,
    filter?.range,
  );
  if (actorSessions.length === 0 && !hasActorEventsInRange) {
    return [];
  }
  if (actorSessions.length > 0) {
    actorSessions.forEach((session) => {
      const item = session.production_item_id
        ? (productionItemById.get(session.production_item_id) ?? null)
        : null;
      const run = batchRunById.get(session.batch_run_id) ?? null;
      if (
        !matchesOrderSearch(
          search,
          item?.orders?.order_number ?? run?.orders?.order_number,
          item?.orders?.customer_name ?? run?.orders?.customer_name,
          item?.order_id ?? run?.order_id ?? session.order_id,
        )
      ) {
        return;
      }
      const breakdown = getWorkSessionBreakdown({
        session,
        range: filter?.range,
        calendar: filter?.calendar,
      });
      if (breakdown.totalMinutes <= 0) {
        return;
      }
      const stationId =
        session.station_id ??
        item?.station_id ??
        run?.station_id ??
        singleAssignedStationId ??
        "unassigned";
      const current = map.get(stationId) ?? {
        stationId,
        stationName: stationNameById.get(stationId) ?? stationId,
        workedMinutes: 0,
        completedItems: 0,
      };
      current.workedMinutes += breakdown.totalMinutes;
      map.set(stationId, current);
    });
    if (map.size > 0) {
      productionItems.forEach((item) => {
        if (!isCompletedItemInRange(item)) {
          return;
        }
        const stationId = item.station_id ?? singleAssignedStationId ?? "unassigned";
        const current = map.get(stationId);
        if (current) {
          current.completedItems += 1;
        }
      });
      batchRuns.forEach((run) => {
        if (!isCompletedRunInRange(run)) {
          return;
        }
        const stationId = run.station_id ?? singleAssignedStationId ?? "unassigned";
        const current = map.get(stationId);
        if (current) {
          current.completedItems += 1;
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => b.workedMinutes - a.workedMinutes,
      );
    }
  }
  productionItems.forEach((item) => {
    const workedMinutes = getAttributedItemWorkedMinutes(
      item,
      workedMinutesByItem,
    );
    if (
      workedMinutes <= 0 ||
      !matchesOrderSearch(
        search,
        item.orders?.order_number,
        item.orders?.customer_name,
        item.order_id,
      )
    ) {
      return;
    }
    const stationId = item.station_id ?? singleAssignedStationId ?? "unassigned";
    if (!shouldIncludeStation(stationId)) {
      return;
    }
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    if (actorSessions.length === 0) {
      current.workedMinutes += workedMinutes;
    }
    if (isCompletedItemInRange(item)) {
      current.completedItems += 1;
    }
    map.set(stationId, current);
  });
  batchRuns.forEach((run) => {
    const workedMinutes = getAttributedRunWorkedMinutes(run, workedMinutesByRun);
    const stationId = run.station_id ?? singleAssignedStationId ?? "unassigned";
    if (
      workedMinutes <= 0 ||
      !isOrderLevelStation(stationId) ||
      !matchesOrderSearch(
        search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      )
    ) {
      return;
    }
    if (!shouldIncludeStation(stationId)) {
      return;
    }
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    if (actorSessions.length === 0) {
      current.workedMinutes += workedMinutes;
    }
    if (isCompletedRunInRange(run)) {
      current.completedItems += 1;
    }
    map.set(stationId, current);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
  return rows;
}

export function formatWorkedDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) {
    return "0m";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatLaborCost(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(2)} €`;
}
