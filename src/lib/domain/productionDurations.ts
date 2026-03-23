import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionStatusEventRow,
  StationTrackingMode,
} from "@/types/production";

function isWorkStartStatus(status: string | null | undefined) {
  return status === "in_progress";
}

function isWorkStopStatus(status: string | null | undefined) {
  return status === "paused" || status === "done" || status === "blocked";
}

function roundMinutes(startMs: number, endMs: number) {
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

function overlapMinutes(
  startMs: number,
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
) {
  const overlapStart = Math.max(startMs, rangeStartMs);
  const overlapEnd = Math.min(endMs, rangeEndMs);
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  return roundMinutes(overlapStart, overlapEnd);
}

function buildWorkedMinutesByKey(
  events: ProductionStatusEventRow[],
  getKey: (event: ProductionStatusEventRow) => string | null,
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
    let totalMinutes = 0;

    sortedEvents.forEach((event) => {
      const eventTime = event.created_at ? Date.parse(event.created_at) : NaN;
      if (!Number.isFinite(eventTime)) {
        return;
      }

      if (isWorkStartStatus(event.to_status)) {
        activeStart = eventTime;
        return;
      }

      if (isWorkStopStatus(event.to_status) && activeStart != null) {
        totalMinutes += roundMinutes(activeStart, eventTime);
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += roundMinutes(activeStart, now);
    }

    result.set(key, totalMinutes);
  });

  return result;
}

function summarizeWorkedMinutesByKey(
  events: ProductionStatusEventRow[],
  getKey: (event: ProductionStatusEventRow) => string | null,
  todayIso: string,
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

  const todayStart = new Date(`${todayIso}T00:00:00`);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const todayStartMs = todayStart.getTime();
  const tomorrowStartMs = tomorrowStart.getTime();
  const now = Date.now();

  let totalMinutes = 0;
  let todayMinutes = 0;

  eventsByKey.forEach((entityEvents) => {
    const sortedEvents = [...entityEvents].sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    let activeStart: number | null = null;

    sortedEvents.forEach((event) => {
      const eventTime = event.created_at ? Date.parse(event.created_at) : NaN;
      if (!Number.isFinite(eventTime)) {
        return;
      }

      if (isWorkStartStatus(event.to_status)) {
        activeStart = eventTime;
        return;
      }

      if (isWorkStopStatus(event.to_status) && activeStart != null) {
        totalMinutes += roundMinutes(activeStart, eventTime);
        todayMinutes += overlapMinutes(
          activeStart,
          eventTime,
          todayStartMs,
          tomorrowStartMs,
        );
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += roundMinutes(activeStart, now);
      todayMinutes += overlapMinutes(
        activeStart,
        now,
        todayStartMs,
        tomorrowStartMs,
      );
    }
  });

  return { totalMinutes, todayMinutes };
}

export function buildWorkedMinutesByItem(events: ProductionStatusEventRow[]) {
  return buildWorkedMinutesByKey(
    events,
    (event) => event.production_item_id ?? null,
  );
}

export function buildWorkedMinutesByRun(events: ProductionStatusEventRow[]) {
  return buildWorkedMinutesByKey(events, (event) => event.batch_run_id ?? null);
}

export function summarizeWorkedMinutesByItem(
  events: ProductionStatusEventRow[],
  todayIso: string,
) {
  return summarizeWorkedMinutesByKey(
    events,
    (event) => event.production_item_id ?? null,
    todayIso,
  );
}

export function summarizeWorkedMinutesByRun(
  events: ProductionStatusEventRow[],
  todayIso: string,
) {
  return summarizeWorkedMinutesByKey(
    events,
    (event) => event.batch_run_id ?? null,
    todayIso,
  );
}

export function getProductionItemWorkedMinutes(
  item: Pick<ProductionItemRow, "id" | "duration_minutes">,
  workedMinutesByItem?: Map<string, number>,
) {
  return (
    workedMinutesByItem?.get(item.id) ?? Number(item.duration_minutes ?? 0)
  );
}

export function getBatchRunWorkedMinutes(
  run: Pick<BatchRunRow, "id" | "duration_minutes">,
  workedMinutesByRun?: Map<string, number>,
) {
  return workedMinutesByRun?.get(run.id) ?? Number(run.duration_minutes ?? 0);
}

export function getQueueGroupWorkedMinutes(params: {
  trackingMode: StationTrackingMode;
  runs: Array<Pick<BatchRunRow, "id" | "duration_minutes">>;
  items: Array<Pick<ProductionItemRow, "id" | "duration_minutes">>;
  workedMinutesByItem?: Map<string, number>;
  workedMinutesByRun?: Map<string, number>;
}) {
  const {
    trackingMode,
    runs,
    items,
    workedMinutesByItem,
    workedMinutesByRun,
  } = params;

  if (trackingMode === "construction_level") {
    if (items.length > 0) {
      return items.reduce(
        (sum, item) =>
          sum + getProductionItemWorkedMinutes(item, workedMinutesByItem),
        0,
      );
    }
    return runs.reduce(
      (sum, run) => sum + getBatchRunWorkedMinutes(run, workedMinutesByRun),
      0,
    );
  }

  if (runs.length === 0) {
    return 0;
  }

  return runs.reduce((maxMinutes, run) => {
    const runMinutes = getBatchRunWorkedMinutes(run, workedMinutesByRun);
    return Math.max(maxMinutes, runMinutes);
  }, 0);
}
