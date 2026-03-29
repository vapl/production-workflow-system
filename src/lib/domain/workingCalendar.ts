export type WorkShift = {
  start: string;
  end: string;
  overtimeStart?: string | null;
  overtimeEnd?: string | null;
};

export type WorkingCalendar = {
  workdays: number[];
  shifts: WorkShift[];
  overtimeEnabled: boolean;
};

export type WorkedTimeMinutesBreakdown = {
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
};

export type WorkedTimeSecondsBreakdown = {
  totalSeconds: number;
  regularSeconds: number;
  overtimeSeconds: number;
};

type WorkingCalendarSource = {
  workdays?: unknown;
  work_shifts?: unknown;
  workday_start?: unknown;
  workday_end?: unknown;
  overtime_enabled?: unknown;
};

export const DEFAULT_WORKDAYS: number[] = [1, 2, 3, 4, 5];
export const DEFAULT_WORK_SHIFTS: WorkShift[] = [
  {
    start: "08:00",
    end: "17:00",
    overtimeStart: "08:00",
    overtimeEnd: "17:00",
  },
];

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function timeToMinutes(value: string): number | null {
  if (!TIME_REGEX.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(":").slice(0, 2).map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function isValidWorkTime(value: string) {
  return timeToMinutes(value.trim()) !== null;
}

export function normalizeWorkTime(value: unknown, fallback = "08:00") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  const parsed = timeToMinutes(trimmed);
  if (parsed == null) {
    return fallback;
  }
  const hours = Math.floor(parsed / 60);
  const minutes = parsed % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeWorkdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_WORKDAYS];
  }
  const normalized = Array.from(
    new Set(
      raw
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
  if (normalized.length === 0) {
    return [...DEFAULT_WORKDAYS];
  }
  return normalized;
}

export function normalizeWorkShifts(raw: unknown): WorkShift[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_WORK_SHIFTS];
  }
  const normalized: WorkShift[] = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null as WorkShift | null;
      }
      const record = entry as Record<string, unknown>;
      const start = normalizeWorkTime(record.start, "");
      const end = normalizeWorkTime(record.end, "");
      const overtimeStart = normalizeWorkTime(
        record.overtimeStart ?? record.overtime_start,
        start,
      );
      const overtimeEnd = normalizeWorkTime(
        record.overtimeEnd ?? record.overtime_end,
        end,
      );
      if (!start || !end) {
        return null as WorkShift | null;
      }
      if (start === end) {
        return null as WorkShift | null;
      }
      return { start, end, overtimeStart, overtimeEnd };
    })
    .filter((entry): entry is WorkShift => entry !== null);
  if (normalized.length === 0) {
    return [...DEFAULT_WORK_SHIFTS];
  }
  return normalized;
}

export function parseWorkingCalendar(source: WorkingCalendarSource): WorkingCalendar {
  const workdays = normalizeWorkdays(source.workdays);
  const shiftsFromJson = normalizeWorkShifts(source.work_shifts);
  const inferredOvertimeEnabled = shiftsFromJson.some(
    (shift) =>
      (shift.overtimeStart ?? shift.start) !== shift.start ||
      (shift.overtimeEnd ?? shift.end) !== shift.end,
  );
  const overtimeEnabled =
    typeof source.overtime_enabled === "boolean"
      ? source.overtime_enabled
      : inferredOvertimeEnabled;
  if (Array.isArray(source.work_shifts)) {
    return { workdays, shifts: shiftsFromJson, overtimeEnabled };
  }
  const fallbackStart = normalizeWorkTime(source.workday_start, DEFAULT_WORK_SHIFTS[0].start);
  const fallbackEnd = normalizeWorkTime(source.workday_end, DEFAULT_WORK_SHIFTS[0].end);
  const fallbackShift =
    fallbackStart === fallbackEnd
      ? DEFAULT_WORK_SHIFTS[0]
      : {
          start: fallbackStart,
          end: fallbackEnd,
          overtimeStart: fallbackStart,
          overtimeEnd: fallbackEnd,
        };
  return { workdays, shifts: [fallbackShift], overtimeEnabled };
}

export function validateWorkingCalendar(workdays: number[], shifts: WorkShift[]): string | null {
  if (workdays.length === 0) {
    return "Select at least one workday.";
  }
  if (shifts.length === 0) {
    return "Add at least one shift.";
  }
  const segments: Array<{ start: number; end: number }> = [];
  for (const shift of shifts) {
    const normalizedOvertimeStart = shift.overtimeStart ?? shift.start;
    const normalizedOvertimeEnd = shift.overtimeEnd ?? shift.end;
    if (
      !isValidWorkTime(shift.start) ||
      !isValidWorkTime(shift.end) ||
      !isValidWorkTime(normalizedOvertimeStart) ||
      !isValidWorkTime(normalizedOvertimeEnd)
    ) {
      return "Use 24h format HH:MM for all shifts.";
    }
    const startMinutes = timeToMinutes(shift.start);
    const endMinutes = timeToMinutes(shift.end);
    const overtimeStartMinutes = timeToMinutes(normalizedOvertimeStart);
    const overtimeEndMinutes = timeToMinutes(normalizedOvertimeEnd);
    if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) {
      return "Shift start and end cannot be the same.";
    }
    if (overtimeStartMinutes == null || overtimeEndMinutes == null) {
      return "Use 24h format HH:MM for all shifts.";
    }
    const regularDuration =
      endMinutes > startMinutes
        ? endMinutes - startMinutes
        : 1440 - startMinutes + endMinutes;
    const preOvertimeDuration =
      overtimeStartMinutes <= startMinutes
        ? startMinutes - overtimeStartMinutes
        : 1440 - overtimeStartMinutes + startMinutes;
    const postOvertimeDuration =
      overtimeEndMinutes > startMinutes
        ? overtimeEndMinutes - startMinutes
        : 1440 - startMinutes + overtimeEndMinutes;
    const countedDuration = preOvertimeDuration + postOvertimeDuration;

    if (countedDuration < regularDuration) {
      return "Overtime window must fully cover the shift.";
    }

    if (preOvertimeDuration > 1440 || postOvertimeDuration > 1440 || countedDuration > 1440) {
      return "Shift plus overtime cannot exceed 24 hours.";
    }

    const countedStart = startMinutes - preOvertimeDuration;
    const countedEnd = countedStart + countedDuration;

    if (countedStart >= 0 && countedEnd <= 1440) {
      segments.push({ start: countedStart, end: countedEnd });
    } else {
      const normalizedStart = ((countedStart % 1440) + 1440) % 1440;
      const normalizedEnd = ((countedEnd % 1440) + 1440) % 1440;
      if (normalizedStart < normalizedEnd) {
        segments.push({ start: normalizedStart, end: normalizedEnd });
      } else {
        segments.push({ start: normalizedStart, end: 1440 });
        segments.push({ start: 0, end: normalizedEnd });
      }
    }
  }
  segments.sort((a, b) => a.start - b.start);
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i - 1].end > segments[i].start) {
      return "Shifts overlap. Adjust times so each shift has a separate window.";
    }
  }
  return null;
}

function buildDayTime(date: Date, minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    mins,
    0,
    0,
  );
}

function buildShiftBoundaries(date: Date, shift: WorkShift) {
  const startMinutes = timeToMinutes(shift.start) ?? 0;
  const endMinutes = timeToMinutes(shift.end) ?? 0;
  const overtimeStartMinutes =
    timeToMinutes(shift.overtimeStart ?? shift.start) ?? startMinutes;
  const overtimeEndMinutes = timeToMinutes(shift.overtimeEnd ?? shift.end) ?? endMinutes;

  const regularStart = buildDayTime(date, startMinutes);
  const regularEnd = buildDayTime(date, endMinutes);
  if (endMinutes <= startMinutes) {
    regularEnd.setDate(regularEnd.getDate() + 1);
  }

  const overtimeStart = buildDayTime(date, overtimeStartMinutes);
  while (overtimeStart > regularStart) {
    overtimeStart.setDate(overtimeStart.getDate() - 1);
  }

  const overtimeEnd = buildDayTime(date, overtimeEndMinutes);
  while (overtimeEnd < regularEnd) {
    overtimeEnd.setDate(overtimeEnd.getDate() + 1);
  }

  return {
    overtimeStart,
    regularStart,
    regularEnd,
    overtimeEnd,
  };
}

export function computeWorkingMinutes(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar: WorkingCalendar,
) {
  return Math.floor(
    computeWorkingDurationMs(startIso, endIso, calendar).regularMs / 60000,
  );
}

export function computeWorkingSeconds(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar: WorkingCalendar,
) {
  return Math.floor(
    computeWorkingDurationMs(startIso, endIso, calendar).regularMs / 1000,
  );
}

export function computeWorkedMinutesBreakdown(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar?: WorkingCalendar | null,
): WorkedTimeMinutesBreakdown {
  const breakdownMs = calendar
    ? computeWorkingDurationMs(startIso, endIso, calendar)
    : null;
  const totalMinutes = Math.max(
    0,
    Math.round(
      (breakdownMs?.totalMs ?? computeElapsedDurationMs(startIso, endIso)) / 60000,
    ),
  );
  if (!calendar) {
    return {
      totalMinutes,
      regularMinutes: totalMinutes,
      overtimeMinutes: 0,
    };
  }
  const regularMinutes = Math.max(
    0,
    Math.round((breakdownMs?.regularMs ?? 0) / 60000),
  );
  const overtimeMinutes = Math.max(
    0,
    Math.round((breakdownMs?.overtimeMs ?? 0) / 60000),
  );
  return {
    totalMinutes,
    regularMinutes,
    overtimeMinutes,
  };
}

export function computeWorkedSecondsBreakdown(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar?: WorkingCalendar | null,
): WorkedTimeSecondsBreakdown {
  const breakdownMs = calendar
    ? computeWorkingDurationMs(startIso, endIso, calendar)
    : null;
  const totalSeconds = Math.max(
    0,
    Math.floor(
      (breakdownMs?.totalMs ?? computeElapsedDurationMs(startIso, endIso)) / 1000,
    ),
  );
  if (!calendar) {
    return {
      totalSeconds,
      regularSeconds: totalSeconds,
      overtimeSeconds: 0,
    };
  }
  const regularSeconds = Math.max(
    0,
    Math.floor((breakdownMs?.regularMs ?? 0) / 1000),
  );
  const overtimeSeconds = Math.max(
    0,
    Math.floor((breakdownMs?.overtimeMs ?? 0) / 1000),
  );
  return {
    totalSeconds,
    regularSeconds,
    overtimeSeconds,
  };
}

function computeElapsedDurationMs(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
) {
  if (!startIso) return 0;
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  if (end <= start) {
    return 0;
  }
  return end.getTime() - start.getTime();
}

function computeWorkingDurationMs(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar: WorkingCalendar,
): { totalMs: number; regularMs: number; overtimeMs: number } {
  if (!startIso) {
    return { totalMs: 0, regularMs: 0, overtimeMs: 0 };
  }
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { totalMs: 0, regularMs: 0, overtimeMs: 0 };
  }
  if (end <= start) {
    return { totalMs: 0, regularMs: 0, overtimeMs: 0 };
  }
  const normalized = {
    workdays: normalizeWorkdays(calendar.workdays),
    shifts: normalizeWorkShifts(calendar.shifts),
    overtimeEnabled: calendar.overtimeEnabled ?? false,
  };
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  day.setDate(day.getDate() - 1);

  let regularMs = 0;
  let overtimeMs = 0;
  for (; day <= endDay; day.setDate(day.getDate() + 1)) {
    if (!normalized.workdays.includes(day.getDay())) {
      continue;
    }
    for (const shift of normalized.shifts) {
      const boundaries = buildShiftBoundaries(day, shift);

      if (
        normalized.overtimeEnabled &&
        boundaries.regularStart > boundaries.overtimeStart
      ) {
        const preOvertimeRangeStart =
          boundaries.overtimeStart > start ? boundaries.overtimeStart : start;
        const preOvertimeRangeEnd =
          boundaries.regularStart < end ? boundaries.regularStart : end;
        if (preOvertimeRangeEnd > preOvertimeRangeStart) {
          overtimeMs += preOvertimeRangeEnd.getTime() - preOvertimeRangeStart.getTime();
        }
      }

      const regularRangeStart =
        boundaries.regularStart > start ? boundaries.regularStart : start;
      const regularRangeEnd =
        boundaries.regularEnd < end ? boundaries.regularEnd : end;
      if (regularRangeEnd > regularRangeStart) {
        regularMs += regularRangeEnd.getTime() - regularRangeStart.getTime();
      }

      if (normalized.overtimeEnabled && boundaries.overtimeEnd > boundaries.regularEnd) {
        const overtimeRangeStart =
          boundaries.regularEnd > start ? boundaries.regularEnd : start;
        const overtimeRangeEnd =
          boundaries.overtimeEnd < end ? boundaries.overtimeEnd : end;
        if (overtimeRangeEnd > overtimeRangeStart) {
          overtimeMs += overtimeRangeEnd.getTime() - overtimeRangeStart.getTime();
        }
      }
    }
  }
  return {
    totalMs: regularMs + overtimeMs,
    regularMs,
    overtimeMs,
  };
}
