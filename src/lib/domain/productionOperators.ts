import {
  summarizeWorkedMinutesByItem,
  summarizeWorkedMinutesByRun,
  getProductionItemWorkedMinutes,
  getBatchRunWorkedMinutes,
  buildWorkedMinutesByItem,
  buildWorkedMinutesByRun,
} from "@/lib/domain/productionDurations";
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

export function buildOperatorSummaryRows(params: {
  profiles: OperatorProfileRow[];
  operatorConfigs: OperatorConfigRow[];
  assignments: OperatorAssignmentRow[];
  stations: OperatorStationRow[];
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
}) {
  const {
    profiles,
    operatorConfigs,
    assignments,
    stations,
    events,
    productionItems,
    batchRuns,
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
      const workedMinutesByItem = buildWorkedMinutesByItem(actorEvents);
      const workedMinutesByRun = buildWorkedMinutesByRun(actorRunOnlyEvents);
      const workedMinutes =
        summarizeWorkedMinutesByItem(actorEvents, getTodayIsoLocal()).totalMinutes +
        summarizeWorkedMinutesByRun(
          actorRunOnlyEvents,
          getTodayIsoLocal(),
        ).totalMinutes;
      const completedOrders = new Set([
        ...completedItems.map((item) => item.order_id),
        ...completedRuns.map((run) => run.order_id),
      ]).size;
      const completedQty = completedItems.reduce(
        (sum, item) => sum + Number(item.qty ?? 0),
        0,
      ) + completedRuns.length;
      const config =
        configByUserId.get(profile.id) ??
        configByName.get(normalizeOperatorName(profile.full_name));
      const stationNames = assignments
        .filter((assignment) => assignment.user_id === profile.id && assignment.is_active)
        .map((assignment) => stationNameById.get(assignment.station_id) ?? assignment.station_id)
        .sort((a, b) => a.localeCompare(b));
      return {
        userId: profile.id,
        name: profile.full_name?.trim() || "Unknown user",
        role: profile.role?.trim() || "Operator",
        stations: Array.from(new Set(stationNames)),
        hourlyRate: config?.hourly_rate ?? null,
        overtimeRate: config?.overtime_rate ?? null,
        workedMinutes,
        laborCost:
          config?.hourly_rate != null
            ? (workedMinutes / 60) * Number(config.hourly_rate)
            : null,
        completedItems: completedItems.length + completedRuns.length,
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
}) {
  const { actorUserId, events, productionItems, batchRuns } = params;
  const items = uniqueCompletedItemsByActor(actorUserId, events, productionItems);
  const runs = uniqueCompletedRunsByActor(actorUserId, events, batchRuns);
  const workedMinutesByItem = buildWorkedMinutesByItem(getActorEvents(actorUserId, events));
  const workedMinutesByRun = buildWorkedMinutesByRun(
    getActorRunOnlyEvents(actorUserId, events),
  );
  const map = new Map<string, OperatorOrderBreakdownRow>();
  items.forEach((item) => {
    const current = map.get(item.order_id) ?? {
      orderId: item.order_id,
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes +=
      getProductionItemWorkedMinutes(item, workedMinutesByItem);
    current.completedItems += 1;
    map.set(item.order_id, current);
  });
  runs.forEach((run) => {
    const current = map.get(run.order_id) ?? {
      orderId: run.order_id,
      orderNumber: run.orders?.order_number ?? run.order_id,
      customerName: run.orders?.customer_name ?? "",
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += getBatchRunWorkedMinutes(run, workedMinutesByRun);
    current.completedItems += 1;
    map.set(run.order_id, current);
  });
  return Array.from(map.values()).sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export function buildOperatorUnitBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
}) {
  const { actorUserId, events, productionItems } = params;
  const workedMinutesByItem = buildWorkedMinutesByItem(
    getActorEvents(actorUserId, events),
  );
  return uniqueCompletedItemsByActor(actorUserId, events, productionItems)
    .map((item) => ({
      productionItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.orders?.order_number ?? item.order_id,
      customerName: item.orders?.customer_name ?? "",
      batchCode: item.batch_code,
      itemName: item.item_name,
      qty: Number(item.qty ?? 0),
      workedMinutes: getProductionItemWorkedMinutes(item, workedMinutesByItem),
      stationId: item.station_id,
      doneAt: item.done_at ?? null,
    }))
    .sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export function buildOperatorStationBreakdown(params: {
  actorUserId: string;
  events: ProductionStatusEventRow[];
  productionItems: ProductionItemRow[];
  stations: OperatorStationRow[];
  batchRuns: BatchRunRow[];
}) {
  const { actorUserId, events, productionItems, stations, batchRuns } = params;
  const stationNameById = new Map(stations.map((station) => [station.id, station.name]));
  const workedMinutesByItem = buildWorkedMinutesByItem(
    getActorEvents(actorUserId, events),
  );
  const workedMinutesByRun = buildWorkedMinutesByRun(
    getActorRunOnlyEvents(actorUserId, events),
  );
  const map = new Map<string, OperatorStationBreakdownRow>();
  uniqueCompletedItemsByActor(actorUserId, events, productionItems).forEach((item) => {
    const stationId = item.station_id ?? "unassigned";
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes +=
      getProductionItemWorkedMinutes(item, workedMinutesByItem);
    current.completedItems += 1;
    map.set(stationId, current);
  });
  uniqueCompletedRunsByActor(actorUserId, events, batchRuns).forEach((run) => {
    const stationId = run.station_id ?? "unassigned";
    const current = map.get(stationId) ?? {
      stationId,
      stationName: stationNameById.get(stationId) ?? stationId,
      workedMinutes: 0,
      completedItems: 0,
    };
    current.workedMinutes += getBatchRunWorkedMinutes(run, workedMinutesByRun);
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
