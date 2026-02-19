import type { OrderStatus } from "@/types/orders";
import type { BatchStatus } from "@/types/batch";
import type { ActivityStatus } from "@/types/activity";

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

const defaultDateFormatter = new Intl.DateTimeFormat("lv-LV", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const defaultTimeFormatter = new Intl.DateTimeFormat("lv-LV", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const defaultDateTimeFormatter = new Intl.DateTimeFormat("lv-LV", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return defaultDateFormatter.format(date);
}

export function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return defaultTimeFormatter.format(date);
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return defaultDateTimeFormatter.format(date);
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
