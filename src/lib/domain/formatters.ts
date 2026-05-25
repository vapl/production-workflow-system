import type { OrderStatus } from "@/types/orders";
import type { BatchStatus } from "@/types/batch";
import type { ActivityStatus } from "@/types/activity";
import {
  defaultAppLocale,
  normalizeAppLocale,
  toIntlLocale,
  type AppLocale,
} from "@/lib/i18n/locales";

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

const dateFormatters = new Map<AppLocale, Intl.DateTimeFormat>();
const timeFormatters = new Map<AppLocale, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<AppLocale, Intl.DateTimeFormat>();

type AppWeekInfo = {
  firstDay: number;
  minimalDays: number;
};

const weekInfoCache = new Map<AppLocale, AppWeekInfo>();

type IntlLocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => {
    firstDay: number;
    weekend?: number[];
    minimalDays?: number;
  };
  weekInfo?: {
    firstDay?: number;
    weekend?: number[];
    minimalDays?: number;
  };
};

function getWeekInfo(locale: AppLocale): AppWeekInfo {
  const existing = weekInfoCache.get(locale);
  if (existing) {
    return existing;
  }

  const intlLocale = new Intl.Locale(
    toIntlLocale(locale),
  ) as IntlLocaleWithWeekInfo;

  let firstDay = 1;
  let minimalDays = 4;

  if (typeof intlLocale.getWeekInfo === "function") {
    const rawWeekInfo = intlLocale.getWeekInfo();

    firstDay = rawWeekInfo.firstDay;

    if (
      "minimalDays" in rawWeekInfo &&
      typeof rawWeekInfo.minimalDays === "number"
    ) {
      minimalDays = rawWeekInfo.minimalDays;
    }
  } else if ("weekInfo" in intlLocale) {
    const rawWeekInfo = (
      intlLocale as Intl.Locale & {
        weekInfo: {
          firstDay?: number;
          minimalDays?: number;
        };
      }
    ).weekInfo;

    firstDay = rawWeekInfo.firstDay ?? 1;
    minimalDays = rawWeekInfo.minimalDays ?? 4;
  }

  const normalized: AppWeekInfo = {
    firstDay,
    minimalDays,
  };

  weekInfoCache.set(locale, normalized);
  return normalized;
}

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getWeekStart(date: Date, firstDay: number): Date {
  const utcDate = startOfDayUtc(date);

  // JS: Sunday = 0, Monday = 1, ...
  // Intl: Monday = 1, ..., Sunday = 7
  const jsFirstDay = firstDay % 7;
  const diff = (utcDate.getUTCDay() - jsFirstDay + 7) % 7;

  return addDays(utcDate, -diff);
}

function getFirstWeekStart(year: number, weekInfo: AppWeekInfo): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1WeekStart = getWeekStart(jan1, weekInfo.firstDay);

  const daysInFirstWeek =
    7 - Math.floor((jan1.getTime() - jan1WeekStart.getTime()) / 86_400_000);

  if (daysInFirstWeek >= weekInfo.minimalDays) {
    return jan1WeekStart;
  }

  return addDays(jan1WeekStart, 7);
}

function getWeekYearAndNumber(
  date: Date,
  locale: AppLocale,
): {
  year: number;
  week: number;
} {
  const weekInfo = getWeekInfo(locale);
  const weekStart = getWeekStart(date, weekInfo.firstDay);

  const currentYear = weekStart.getUTCFullYear();
  const firstWeekStart = getFirstWeekStart(currentYear, weekInfo);
  const nextYearFirstWeekStart = getFirstWeekStart(currentYear + 1, weekInfo);

  if (weekStart < firstWeekStart) {
    const previousYear = currentYear - 1;
    const previousYearFirstWeekStart = getFirstWeekStart(
      previousYear,
      weekInfo,
    );

    return {
      year: previousYear,
      week:
        Math.floor(
          (weekStart.getTime() - previousYearFirstWeekStart.getTime()) /
            604_800_000,
        ) + 1,
    };
  }

  if (weekStart >= nextYearFirstWeekStart) {
    return {
      year: currentYear + 1,
      week: 1,
    };
  }

  return {
    year: currentYear,
    week:
      Math.floor(
        (weekStart.getTime() - firstWeekStart.getTime()) / 604_800_000,
      ) + 1,
  };
}

function getDateFormatter(locale: AppLocale) {
  const existing = dateFormatters.get(locale);
  if (existing) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  dateFormatters.set(locale, formatter);
  return formatter;
}

function getTimeFormatter(locale: AppLocale) {
  const existing = timeFormatters.get(locale);
  if (existing) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  timeFormatters.set(locale, formatter);
  return formatter;
}

function getDateTimeFormatter(locale: AppLocale) {
  const existing = dateTimeFormatters.get(locale);
  if (existing) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  dateTimeFormatters.set(locale, formatter);
  return formatter;
}

function resolveLocale(locale?: AppLocale): AppLocale {
  if (locale) {
    return locale;
  }
  if (typeof document !== "undefined") {
    return normalizeAppLocale(document.documentElement.lang);
  }
  return defaultAppLocale;
}

export function formatDate(value: string | Date, locale?: AppLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return getDateFormatter(resolveLocale(locale)).format(date);
}

export function formatTime(value: string | Date, locale?: AppLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return getTimeFormatter(resolveLocale(locale)).format(date);
}

export function formatDateTime(
  value: string | Date,
  locale?: AppLocale,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return getDateTimeFormatter(resolveLocale(locale)).format(date);
}

export function formatOrderStatus(status: OrderStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready_for_engineering":
      return "Ready for eng.";
    case "in_engineering":
      return "In eng.";
    case "engineering_blocked":
      return "Eng. blocked";
    case "ready_for_production":
      return "Ready for prod.";
    case "in_production":
      return "In prod.";
    case "done":
      return "Done";
    default:
      return assertNever(status);
  }
}

export function formatBatchStatus(status: BatchStatus): string {
  return status.replace("_", " ");
}

export function formatActivityStatus(status: ActivityStatus): string {
  return (status as string).replace(/_/g, " ");
}

export function formatWeek(value: string | Date, locale?: AppLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  const resolvedLocale = resolveLocale(locale);
  const { year, week } = getWeekYearAndNumber(date, resolvedLocale);

  return `${year}-W${String(week).padStart(2, "0")}`;
}
