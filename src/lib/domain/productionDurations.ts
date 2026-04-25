import type {
  BatchRunRow,
  ProductionItemRow,
  ProductionStatusEventRow,
  StationTrackingMode,
} from "@/types/production";
import {
  computeWorkedMinutesBreakdown,
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

export type WorkedTimeBreakdown = {
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
};

function addBreakdowns(
  current: WorkedTimeBreakdown,
  next: WorkedTimeBreakdown,
): WorkedTimeBreakdown {
  return {
    totalMinutes: current.totalMinutes + next.totalMinutes,
    regularMinutes: current.regularMinutes + next.regularMinutes,
    overtimeMinutes: current.overtimeMinutes + next.overtimeMinutes,
  };
}

function getBreakdownForInterval(
  startMs: number,
  endMs: number,
  calendar?: WorkingCalendar | null,
): WorkedTimeBreakdown {
  const totalMinutes = roundMinutes(startMs, endMs);
  if (!calendar) {
    return {
      totalMinutes,
      regularMinutes: totalMinutes,
      overtimeMinutes: 0,
    };
  }
  return computeWorkedMinutesBreakdown(
    new Date(startMs).toISOString(),
    new Date(endMs).toISOString(),
    calendar,
  );
}

function overlapBreakdown(
  startMs: number,
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
  calendar?: WorkingCalendar | null,
) {
  const overlapStart = Math.max(startMs, rangeStartMs);
  const overlapEnd = Math.min(endMs, rangeEndMs);
  if (overlapEnd <= overlapStart) {
    return {
      totalMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
    };
  }
  return getBreakdownForInterval(overlapStart, overlapEnd, calendar);
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
          ? overlapBreakdown(
              activeStart,
              eventTime,
              resolvedRange.startMs,
              resolvedRange.endMs,
              calendar,
            ).totalMinutes
          : getBreakdownForInterval(
              activeStart,
              eventTime,
              calendar,
            ).totalMinutes;
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += resolvedRange
        ? overlapBreakdown(
            activeStart,
            now,
            resolvedRange.startMs,
            resolvedRange.endMs,
            calendar,
          ).totalMinutes
        : getBreakdownForInterval(
            activeStart,
            now,
            calendar,
          ).totalMinutes;
    }

    result.set(key, totalMinutes);
  });

  return result;
}

function buildWorkedBreakdownByKey(
  events: ProductionStatusEventRow[],
  getKey: (event: ProductionStatusEventRow) => string | null,
  range?: WorkedMinutesRange | null,
  calendar?: WorkingCalendar | null,
  nowMs?: number,
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

  const result = new Map<string, WorkedTimeBreakdown>();
  const now = nowMs ?? Date.now();
  const resolvedRange = resolveRange(range);

  eventsByKey.forEach((entityEvents, key) => {
    const sortedEvents = [...entityEvents].sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    let activeStart: number | null = null;
    let total = {
      totalMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
    };

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
        total = addBreakdowns(
          total,
          resolvedRange
            ? overlapBreakdown(
                activeStart,
                eventTime,
                resolvedRange.startMs,
                resolvedRange.endMs,
                calendar,
              )
            : getBreakdownForInterval(activeStart, eventTime, calendar),
        );
        activeStart = null;
      }
    });

    if (activeStart != null) {
      total = addBreakdowns(
        total,
        resolvedRange
          ? overlapBreakdown(
              activeStart,
              now,
              resolvedRange.startMs,
              resolvedRange.endMs,
              calendar,
            )
          : getBreakdownForInterval(activeStart, now, calendar),
      );
    }

    result.set(key, total);
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
        totalMinutes += getBreakdownForInterval(
          activeStart,
          eventTime,
          calendar,
        ).totalMinutes;
        todayMinutes += overlapBreakdown(
          activeStart,
          eventTime,
          todayStartMs,
          tomorrowStartMs,
          calendar,
        ).totalMinutes;
        activeStart = null;
      }
    });

    if (activeStart != null) {
      totalMinutes += getBreakdownForInterval(
        activeStart,
        now,
        calendar,
      ).totalMinutes;
      todayMinutes += overlapBreakdown(
        activeStart,
        now,
        todayStartMs,
        tomorrowStartMs,
        calendar,
      ).totalMinutes;
    }
  });

  return { totalMinutes, todayMinutes };
}

function summarizeWorkedBreakdownByKey(
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

  let total = {
    totalMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
  };
  let today = {
    totalMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
  };

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
        total = addBreakdowns(
          total,
          getBreakdownForInterval(activeStart, eventTime, calendar),
        );
        today = addBreakdowns(
          today,
          overlapBreakdown(
            activeStart,
            eventTime,
            todayStartMs,
            tomorrowStartMs,
            calendar,
          ),
        );
        activeStart = null;
      }
    });

    if (activeStart != null) {
      total = addBreakdowns(
        total,
        getBreakdownForInterval(activeStart, now, calendar),
      );
      today = addBreakdowns(
        today,
        overlapBreakdown(
          activeStart,
          now,
          todayStartMs,
          tomorrowStartMs,
          calendar,
        ),
      );
    }
  });

  return { total, today };
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

export function buildWorkedBreakdownByItem(
  events: ProductionStatusEventRow[],
  calendar?: WorkingCalendar | null,
  nowMs?: number,
) {
  return buildWorkedBreakdownByKey(
    events,
    (event) => event.production_item_id ?? null,
    undefined,
    calendar,
    nowMs,
  );
}

export function buildWorkedBreakdownByItemInRange(
  events: ProductionStatusEventRow[],
  range: WorkedMinutesRange,
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedBreakdownByKey(
    events,
    (event) => event.production_item_id ?? null,
    range,
    calendar,
  );
}

export function buildWorkedBreakdownByRun(
  events: ProductionStatusEventRow[],
  calendar?: WorkingCalendar | null,
  nowMs?: number,
) {
  return buildWorkedBreakdownByKey(
    events,
    (event) => event.batch_run_id ?? null,
    undefined,
    calendar,
    nowMs,
  );
}

export function buildWorkedBreakdownByRunInRange(
  events: ProductionStatusEventRow[],
  range: WorkedMinutesRange,
  calendar?: WorkingCalendar | null,
) {
  return buildWorkedBreakdownByKey(
    events,
    (event) => event.batch_run_id ?? null,
    range,
    calendar,
  );
}

export function summarizeWorkedBreakdownByItem(
  events: ProductionStatusEventRow[],
  todayIso: string,
  calendar?: WorkingCalendar | null,
) {
  return summarizeWorkedBreakdownByKey(
    events,
    (event) => event.production_item_id ?? null,
    todayIso,
    calendar,
  );
}

export function summarizeWorkedBreakdownByRun(
  events: ProductionStatusEventRow[],
  todayIso: string,
  calendar?: WorkingCalendar | null,
) {
  return summarizeWorkedBreakdownByKey(
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

export function getProductionItemWorkedBreakdown(
  item: Pick<ProductionItemRow, "id" | "duration_minutes">,
  workedBreakdownByItem?: Map<string, WorkedTimeBreakdown>,
): WorkedTimeBreakdown {
  const breakdown = workedBreakdownByItem?.get(item.id);
  if (breakdown) {
    return breakdown;
  }
  const totalMinutes = Number(item.duration_minutes ?? 0);
  return {
    totalMinutes,
    regularMinutes: totalMinutes,
    overtimeMinutes: 0,
  };
}

export function getBatchRunWorkedBreakdown(
  run: Pick<BatchRunRow, "id" | "duration_minutes">,
  workedBreakdownByRun?: Map<string, WorkedTimeBreakdown>,
): WorkedTimeBreakdown {
  const breakdown = workedBreakdownByRun?.get(run.id);
  if (breakdown) {
    return breakdown;
  }
  const totalMinutes = Number(run.duration_minutes ?? 0);
  return {
    totalMinutes,
    regularMinutes: totalMinutes,
    overtimeMinutes: 0,
  };
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

export function getQueueGroupWorkedBreakdown(params: {
  trackingMode: StationTrackingMode;
  runs: Array<Pick<BatchRunRow, "id" | "duration_minutes">>;
  items: Array<Pick<ProductionItemRow, "id" | "duration_minutes">>;
  workedBreakdownByItem?: Map<string, WorkedTimeBreakdown>;
  workedBreakdownByRun?: Map<string, WorkedTimeBreakdown>;
}): WorkedTimeBreakdown {
  const {
    trackingMode,
    runs,
    items,
    workedBreakdownByItem,
    workedBreakdownByRun,
  } = params;

  if (trackingMode === "construction_level") {
    if (items.length > 0) {
      return items.reduce(
        (sum, item) =>
          addBreakdowns(
            sum,
            getProductionItemWorkedBreakdown(item, workedBreakdownByItem),
          ),
        { totalMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 },
      );
    }
    return runs.reduce(
      (sum, run) =>
        addBreakdowns(sum, getBatchRunWorkedBreakdown(run, workedBreakdownByRun)),
      { totalMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 },
    );
  }

  if (runs.length === 0) {
    return { totalMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 };
  }

  return runs.reduce<WorkedTimeBreakdown>(
    (selected, run) => {
      const current = getBatchRunWorkedBreakdown(run, workedBreakdownByRun);
      return current.totalMinutes > selected.totalMinutes ? current : selected;
    },
    { totalMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 },
  );
}
