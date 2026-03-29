import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionStatusEventRow,
  StationTrackingMode,
} from "@/types/production";
import {
  computeWorkingMinutes,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";

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
  calendar?: WorkingCalendar | null,
) {
  const overlapStart = Math.max(startMs, rangeStartMs);
  const overlapEnd = Math.min(endMs, rangeEndMs);
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  if (calendar) {
    return computeWorkingMinutes(
      new Date(overlapStart).toISOString(),
      new Date(overlapEnd).toISOString(),
      calendar,
    );
  }
  return roundMinutes(overlapStart, overlapEnd);
}

export type WorkedMinutesRange = {
  startAt: string;
  endAt: string;
};

function resolveRange(range?: WorkedMinutesRange | null) {
  if (!range) {
    return null;
  }
  const startMs = Date.parse(range.startAt);
  const endMs = Date.parse(range.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return { startMs, endMs };
}

function buildWorkedMinutesByKey(
  events: ProductionStatusEventRow[],
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
  const resolvedRange = resolveRange(range);

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
        totalMinutes += resolvedRange
          ? overlapMinutes(
              activeStart,
              eventTime,
              resolvedRange.startMs,
              resolvedRange.endMs,
              calendar,
            )
          : calendar
            ? computeWorkingMinutes(
                new Date(activeStart).toISOString(),
                new Date(eventTime).toISOString(),
                calendar,
              )
            : roundMinutes(activeStart, eventTime);
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += resolvedRange
        ? overlapMinutes(
            activeStart,
            now,
            resolvedRange.startMs,
            resolvedRange.endMs,
            calendar,
          )
        : calendar
          ? computeWorkingMinutes(
              new Date(activeStart).toISOString(),
              new Date(now).toISOString(),
              calendar,
            )
          : roundMinutes(activeStart, now);
    }

    result.set(key, totalMinutes);
  });

  return result;
}

function summarizeWorkedMinutesByKey(
  events: ProductionStatusEventRow[],
  getKey: (event: ProductionStatusEventRow) => string | null,
  todayIso: string,
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
        totalMinutes += calendar
          ? computeWorkingMinutes(
              new Date(activeStart).toISOString(),
              new Date(eventTime).toISOString(),
              calendar,
            )
          : roundMinutes(activeStart, eventTime);
        todayMinutes += overlapMinutes(
          activeStart,
          eventTime,
          todayStartMs,
          tomorrowStartMs,
          calendar,
        );
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += calendar
        ? computeWorkingMinutes(
            new Date(activeStart).toISOString(),
            new Date(now).toISOString(),
            calendar,
          )
        : roundMinutes(activeStart, now);
      todayMinutes += overlapMinutes(
        activeStart,
        now,
        todayStartMs,
        tomorrowStartMs,
        calendar,
      );
    }
  });

  return { totalMinutes, todayMinutes };
}

export function buildWorkedMinutesByItem(
  events: ProductionStatusEventRow[],
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedMinutesByKey(
    events,
    (event) => event.production_item_id ?? null,
    undefined,
    calendar,
  );
}

export function buildWorkedMinutesByItemInRange(
  events: ProductionStatusEventRow[],
  range: WorkedMinutesRange,
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedMinutesByKey(
    events,
    (event) => event.production_item_id ?? null,
    range,
    calendar,
  );
}

export function buildWorkedMinutesByRun(
  events: ProductionStatusEventRow[],
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedMinutesByKey(
    events,
    (event) => event.batch_run_id ?? null,
    undefined,
    calendar,
  );
}

export function buildWorkedMinutesByRunInRange(
  events: ProductionStatusEventRow[],
  range: WorkedMinutesRange,
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedMinutesByKey(
    events,
    (event) => event.batch_run_id ?? null,
    range,
    calendar,
  );
}

export function summarizeWorkedMinutesByItem(
  events: ProductionStatusEventRow[],
  todayIso: string,
  calendar?: WorkingCalendar | null,
) {
  return summarizeWorkedMinutesByKey(
    events,
    (event) => event.production_item_id ?? null,
    todayIso,
    calendar,
  );
}

export function summarizeWorkedMinutesByRun(
  events: ProductionStatusEventRow[],
  todayIso: string,
  calendar?: WorkingCalendar | null,
) {
  return summarizeWorkedMinutesByKey(
    events,
    (event) => event.batch_run_id ?? null,
    todayIso,
    calendar,
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
