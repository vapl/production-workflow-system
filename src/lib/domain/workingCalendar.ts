export type WorkShift = {
  start: string;
  end: string;
};

export type WorkingCalendar = {
  workdays: number[];
  shifts: WorkShift[];
};

type WorkingCalendarSource = {
  workdays?: unknown;
  work_shifts?: unknown;
  workday_start?: unknown;
  workday_end?: unknown;
};

export const DEFAULT_WORKDAYS: number[] = [1, 2, 3, 4, 5];
export const DEFAULT_WORK_SHIFTS: WorkShift[] = [{ start: "08:00", end: "17:00" }];

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
  const normalized = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const start = normalizeWorkTime(record.start, "");
      const end = normalizeWorkTime(record.end, "");
      if (!start || !end) {
        return null;
      }
      if (start === end) {
        return null;
      }
      return { start, end };
    })
    .filter((entry): entry is WorkShift => Boolean(entry));
  if (normalized.length === 0) {
    return [...DEFAULT_WORK_SHIFTS];
  }
  return normalized;
}

export function parseWorkingCalendar(source: WorkingCalendarSource): WorkingCalendar {
  const workdays = normalizeWorkdays(source.workdays);
  const shiftsFromJson = normalizeWorkShifts(source.work_shifts);
  if (Array.isArray(source.work_shifts)) {
    return { workdays, shifts: shiftsFromJson };
  }
  const fallbackStart = normalizeWorkTime(source.workday_start, DEFAULT_WORK_SHIFTS[0].start);
  const fallbackEnd = normalizeWorkTime(source.workday_end, DEFAULT_WORK_SHIFTS[0].end);
  const fallbackShift =
    fallbackStart === fallbackEnd
      ? DEFAULT_WORK_SHIFTS[0]
      : { start: fallbackStart, end: fallbackEnd };
  return { workdays, shifts: [fallbackShift] };
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
    if (!isValidWorkTime(shift.start) || !isValidWorkTime(shift.end)) {
      return "Use 24h format HH:MM for all shifts.";
    }
    const startMinutes = timeToMinutes(shift.start);
    const endMinutes = timeToMinutes(shift.end);
    if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) {
      return "Shift start and end cannot be the same.";
    }
    if (endMinutes > startMinutes) {
      segments.push({ start: startMinutes, end: endMinutes });
    } else {
      segments.push({ start: startMinutes, end: 1440 });
      segments.push({ start: 0, end: endMinutes });
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

export function computeWorkingMinutes(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  calendar: WorkingCalendar,
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
  const normalized = {
    workdays: normalizeWorkdays(calendar.workdays),
    shifts: normalizeWorkShifts(calendar.shifts),
  };
  const shiftMinutes = normalized.shifts.map((shift) => ({
    start: timeToMinutes(shift.start) ?? 0,
    end: timeToMinutes(shift.end) ?? 0,
  }));
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  day.setDate(day.getDate() - 1);

  let totalMinutes = 0;
  for (; day <= endDay; day.setDate(day.getDate() + 1)) {
    if (!normalized.workdays.includes(day.getDay())) {
      continue;
    }
    for (const shift of shiftMinutes) {
      const shiftStart = buildDayTime(day, shift.start);
      const shiftEnd = buildDayTime(day, shift.end);
      if (shift.end <= shift.start) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
      const rangeStart = shiftStart > start ? shiftStart : start;
      const rangeEnd = shiftEnd < end ? shiftEnd : end;
      if (rangeEnd > rangeStart) {
        totalMinutes += Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 60000);
      }
    }
  }
  return totalMinutes;
}
