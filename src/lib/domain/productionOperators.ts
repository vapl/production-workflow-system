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
import {
  computeWorkedMinutesBreakdown,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionStatusEventRow,
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

function normalizeOperatorName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export type OperatorOrderBreakdownRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  workedMinutes: number;
  completedItems: number;
};

export type OperatorUnitBreakdownRow = {
  productionItemId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  batchCode: string;
  itemName: string;
  qty: number;
  workedMinutes: number;
  stationId: string | null;
  doneAt: string | null;
};

export type OperatorStationBreakdownRow = {
  stationId: string;
  stationName: string;
  workedMinutes: number;
  completedItems: number;
};

export type OperatorMetricsFilter = {
  range?: WorkedMinutesRange | null;
  search?: string | null;
  calendar?: WorkingCalendar | null;
  assignedStationIds?: string[] | null;
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

function uniqueCompletedItemsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  productionItems: ProductionItemRow[],
) {
  const completedIds = new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          typeof event.production_item_id === "string",
      )
      .map((event) => event.production_item_id as string),
  );
  return productionItems.filter((item) => completedIds.has(item.id));
}

function uniqueCompletedItemIdsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
) {
  return new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          typeof event.production_item_id === "string",
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

function uniqueCompletedRunIdsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
) {
  return new Set(
    events
      .filter(
        (event) =>
          event.actor_user_id === actorUserId &&
          event.to_status === "done" &&
          !event.production_item_id &&
          typeof event.batch_run_id === "string",
      )
      .map((event) => event.batch_run_id as string),
  );
}

function uniqueCompletedRunsByActor(
  actorUserId: string,
  events: ProductionStatusEventRow[],
  batchRuns: BatchRunRow[],
) {
  const completedRunIds = uniqueCompletedRunIdsByActor(actorUserId, events);
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
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
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
      orderNumber: run.orders?.order_number ?? run.order_id,
      customerName: run.orders?.customer_name ?? "",
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
  assignedStationIds: string[];
  productionItems: ProductionItemRow[];
  search: string;
  range?: WorkedMinutesRange | null;
}) {
  const stationIds = new Set(params.assignedStationIds);
  return params.productionItems
    .filter((item) => {
      if (!item.station_id || !stationIds.has(item.station_id)) {
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
      return isTimestampInRange(item.done_at ?? item.started_at ?? null, params.range);
    })
    .map((item) => ({
      productionItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
      batchCode: item.batch_code,
      itemName: item.item_name,
      qty: Number(item.qty ?? 0),
      workedMinutes: Math.max(0, Number(item.duration_minutes ?? 0)),
      stationId: item.station_id,
      doneAt: item.done_at ?? null,
    }))
    .filter((item) => item.workedMinutes > 0 || Boolean(item.doneAt))
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

export function buildOperatorSummaryRows(params: {
  profiles: OperatorProfileRow[];
  operatorConfigs: OperatorConfigRow[];
  assignments: OperatorAssignmentRow[];
  stations: OperatorStationRow[];
  events: ProductionStatusEventRow[];
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
    productionItems,
    batchRuns,
    filter,
  } = params;
  const stationNameById = new Map(stations.map((station) => [station.id, station.name]));
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
      const completedItemIds = uniqueCompletedItemIdsByActor(profile.id, events);
      const completedRunIds = uniqueCompletedRunIdsByActor(profile.id, events);
      const completedItems = uniqueCompletedItemsByActor(
        profile.id,
        events,
        productionItems,
      );
      const completedRuns = uniqueCompletedRunsByActor(
        profile.id,
        events,
        batchRuns,
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
      let finalCompletedItems = filteredCompletedItems.length + filteredCompletedRuns.length;
      let finalCompletedQty = completedQty;
      let finalCompletedOrders = completedOrders;
      if (
        finalWorkedMinutes <= 0 &&
        finalCompletedItems <= 0 &&
        stationIds.size > 0
      ) {
        const fallbackMetrics = buildFallbackOperatorMetrics({
          stationIds,
          productionItems,
          batchRuns,
          search,
          range: filter?.range,
        });
        finalWorkedMinutes = fallbackMetrics.workedMinutes;
        finalRegularMinutes = fallbackMetrics.regularMinutes;
        finalOvertimeMinutes = fallbackMetrics.overtimeMinutes;
        finalCompletedItems = fallbackMetrics.completedItems;
        finalCompletedQty = fallbackMetrics.completedQty;
        finalCompletedOrders = fallbackMetrics.completedOrders;
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

export function buildOperatorOrderBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  filter?: OperatorMetricsFilter;
}) {
  const { actorUserId, events, productionItems, batchRuns, filter } = params;
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const workedMinutesByRun = buildAttributedWorkedMinutesByRun(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const completedItemIds = uniqueCompletedItemIdsByActor(actorUserId, events);
  const completedRunIds = uniqueCompletedRunIdsByActor(actorUserId, events);
  const search = normalizeSearch(filter?.search);
  const map = new Map<string, OperatorOrderBreakdownRow>();
  productionItems.forEach((item) => {
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
    if (itemWorkedMinutes <= 0 && !itemCompleted) {
      return;
    }
    const current = map.get(item.order_id) ?? {
      orderId: item.order_id,
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += itemWorkedMinutes;
    if (itemCompleted) {
      current.completedItems += 1;
    }
    map.set(item.order_id, current);
  });
  batchRuns.forEach((run) => {
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
    if (runWorkedMinutes <= 0 && !runCompleted) {
      return;
    }
    const current = map.get(run.order_id) ?? {
      orderId: run.order_id,
      orderNumber: run.orders?.order_number ?? run.order_id,
      customerName: run.orders?.customer_name ?? "",
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += runWorkedMinutes;
    if (runCompleted) {
      current.completedItems += 1;
    }
    map.set(run.order_id, current);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
  const fallbackRows =
    (filter?.assignedStationIds?.length ?? 0) > 0
      ? buildFallbackOrderBreakdown({
          assignedStationIds: filter?.assignedStationIds ?? [],
          productionItems,
          batchRuns,
          search,
          range: filter?.range,
        })
      : [];
  const actorCompleted = rows.reduce((sum, row) => sum + row.completedItems, 0);
  const fallbackCompleted = fallbackRows.reduce(
    (sum, row) => sum + row.completedItems,
    0,
  );
  if (fallbackRows.length > 0 && actorCompleted === 0 && fallbackCompleted > 0) {
    return fallbackRows;
  }
  return rows;
}

export function buildOperatorUnitBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
  filter?: OperatorMetricsFilter;
}) {
  const { actorUserId, events, productionItems, filter } = params;
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const search = normalizeSearch(filter?.search);
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
        itemName: item.item_name,
        qty: Number(item.qty ?? 0),
        workedMinutes,
        stationId: item.station_id,
        doneAt: item.done_at ?? null,
      };
    })
    .filter(
      (item) =>
        item.workedMinutes > 0 &&
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
          assignedStationIds: filter?.assignedStationIds ?? [],
          productionItems,
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
  productionItems: ProductionItemRow[];
  stations: OperatorStationRow[];
  batchRuns: BatchRunRow[];
  filter?: OperatorMetricsFilter;
}) {
  const { actorUserId, events, productionItems, stations, batchRuns, filter } = params;
  const stationNameById = new Map(stations.map((station) => [station.id, station.name]));
  const workedMinutesByItem = buildAttributedWorkedMinutesByItem(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const workedMinutesByRun = buildAttributedWorkedMinutesByRun(
    events,
    actorUserId,
    filter?.range,
    filter?.calendar,
  );
  const search = normalizeSearch(filter?.search);
  const map = new Map<string, OperatorStationBreakdownRow>();
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
    const stationId = item.station_id ?? "unassigned";
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += workedMinutes;
    current.completedItems += 1;
    map.set(stationId, current);
  });
  batchRuns.forEach((run) => {
    const workedMinutes = getAttributedRunWorkedMinutes(run, workedMinutesByRun);
    if (
      workedMinutes <= 0 ||
      !matchesOrderSearch(
        search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      )
    ) {
      return;
    }
    const stationId = run.station_id ?? "unassigned";
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += workedMinutes;
    current.completedItems += 1;
    map.set(stationId, current);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
  const fallbackRows =
    (filter?.assignedStationIds?.length ?? 0) > 0
      ? buildFallbackStationBreakdown({
          assignedStationIds: filter?.assignedStationIds ?? [],
          stations,
          productionItems,
          batchRuns,
          search,
          range: filter?.range,
        })
      : [];
  const actorCompleted = rows.reduce((sum, row) => sum + row.completedItems, 0);
  const fallbackCompleted = fallbackRows.reduce(
    (sum, row) => sum + row.completedItems,
    0,
  );
  if (fallbackRows.length > 0 && actorCompleted === 0 && fallbackCompleted > 0) {
    return fallbackRows;
  }
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
  return value.toFixed(2);
}
