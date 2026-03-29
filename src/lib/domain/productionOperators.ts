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
import type { WorkingCalendar } from "@/lib/domain/workingCalendar";
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

function filterTouchedItems(
  productionItems: ProductionItemRow[],
  workedMinutesByItem: Map<string, number>,
) {
  return productionItems.filter((item) => (workedMinutesByItem.get(item.id) ?? 0) > 0);
}

function filterTouchedRuns(
  batchRuns: BatchRunRow[],
  workedMinutesByRun: Map<string, number>,
) {
  return batchRuns.filter((run) => (workedMinutesByRun.get(run.id) ?? 0) > 0);
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
      const touchedItems = filterTouchedItems(productionItems, workedMinutesByItem);
      const touchedRuns = filterTouchedRuns(batchRuns, workedMinutesByRun);
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
          (sum, item) => sum + (workedMinutesByItem.get(item.id) ?? 0),
          0,
        ) +
        filteredTouchedRuns.reduce(
          (sum, run) => sum + (workedMinutesByRun.get(run.id) ?? 0),
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
        filteredTouchedItems.some((touchedItem) => touchedItem.id === item.id),
      );
      const filteredCompletedRuns = completedRuns.filter((run) =>
        filteredTouchedRuns.some((touchedRun) => touchedRun.id === run.id),
      );
      const completedOrders = new Set([
        ...filteredTouchedItems.map((item) => item.order_id),
        ...filteredTouchedRuns.map((run) => run.order_id),
      ]).size;
      const completedQty = filteredCompletedItems.reduce(
        (sum, item) =>
          sum + Number(item.qty ?? 0),
        0,
      ) + filteredCompletedRuns.length;
      const config =
        configByUserId.get(profile.id) ??
        configByName.get(normalizeOperatorName(profile.full_name));
      const stationNames = assignments
        .filter((assignment) => assignment.user_id === profile.id && assignment.is_active)
        .map((assignment) => stationNameById.get(assignment.station_id) ?? assignment.station_id)
        .sort((a, b) => a.localeCompare(b));
      const finalWorkedMinutes = search
        ? filteredWorkedMinutes
        : totalBreakdown.totalMinutes;
      const finalRegularMinutes = search
        ? visibleBreakdown.regularMinutes
        : totalBreakdown.regularMinutes;
      const finalOvertimeMinutes = search
        ? visibleBreakdown.overtimeMinutes
        : totalBreakdown.overtimeMinutes;
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
        completedItems: filteredCompletedItems.length + filteredCompletedRuns.length,
        completedQty,
        completedOrders,
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
  const workedMinutesByItem = filter?.range
    ? buildWorkedMinutesByItemInRange(getActorEvents(actorUserId, events), filter.range)
    : buildWorkedMinutesByItem(getActorEvents(actorUserId, events));
  const workedMinutesByRun = filter?.range
    ? buildWorkedMinutesByRunInRange(
        getActorRunOnlyEvents(actorUserId, events),
        filter.range,
      )
    : buildWorkedMinutesByRun(getActorRunOnlyEvents(actorUserId, events));
  const search = normalizeSearch(filter?.search);
  const map = new Map<string, OperatorOrderBreakdownRow>();
  filterTouchedItems(productionItems, workedMinutesByItem).forEach((item) => {
    const itemWorkedMinutes = getProductionItemWorkedMinutes(item, workedMinutesByItem);
    if (
      itemWorkedMinutes <= 0 ||
      !matchesOrderSearch(
        search,
        item.orders?.order_number,
        item.orders?.customer_name,
        item.order_id,
      )
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
    current.workedMinutes += itemWorkedMinutes;
    current.completedItems += 1;
    map.set(item.order_id, current);
  });
  filterTouchedRuns(batchRuns, workedMinutesByRun).forEach((run) => {
    const runWorkedMinutes = getBatchRunWorkedMinutes(run, workedMinutesByRun);
    if (
      runWorkedMinutes <= 0 ||
      !matchesOrderSearch(
        search,
        run.orders?.order_number,
        run.orders?.customer_name,
        run.order_id,
      )
    ) {
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
    current.completedItems += 1;
    map.set(run.order_id, current);
  });
  return Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export function buildOperatorUnitBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
  filter?: OperatorMetricsFilter;
}) {
  const { actorUserId, events, productionItems, filter } = params;
  const workedMinutesByItem = filter?.range
    ? buildWorkedMinutesByItemInRange(getActorEvents(actorUserId, events), filter.range)
    : buildWorkedMinutesByItem(getActorEvents(actorUserId, events));
  const search = normalizeSearch(filter?.search);
  return filterTouchedItems(productionItems, workedMinutesByItem)
    .map((item) => {
      const workedMinutes = getProductionItemWorkedMinutes(item, workedMinutesByItem);
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
  const workedMinutesByItem = filter?.range
    ? buildWorkedMinutesByItemInRange(getActorEvents(actorUserId, events), filter.range)
    : buildWorkedMinutesByItem(getActorEvents(actorUserId, events));
  const workedMinutesByRun = filter?.range
    ? buildWorkedMinutesByRunInRange(
        getActorRunOnlyEvents(actorUserId, events),
        filter.range,
      )
    : buildWorkedMinutesByRun(getActorRunOnlyEvents(actorUserId, events));
  const search = normalizeSearch(filter?.search);
  const map = new Map<string, OperatorStationBreakdownRow>();
  filterTouchedItems(productionItems, workedMinutesByItem).forEach((item) => {
    const workedMinutes = getProductionItemWorkedMinutes(item, workedMinutesByItem);
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
  filterTouchedRuns(batchRuns, workedMinutesByRun).forEach((run) => {
    const workedMinutes = getBatchRunWorkedMinutes(run, workedMinutesByRun);
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
  return Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export function formatWorkedHours(totalMinutes: number) {
  return Math.round((totalMinutes / 60) * 10) / 10;
}

export function formatLaborCost(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(2);
}
