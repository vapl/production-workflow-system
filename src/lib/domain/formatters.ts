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

export function formatDate(
  value: string | Date,
  locale?: AppLocale,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return getDateFormatter(resolveLocale(locale)).format(date);
}

export function formatTime(
  value: string | Date,
  locale?: AppLocale,
): string {
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
