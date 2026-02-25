import type { Order } from "@/types/orders";
import type { Batch } from "@/types/batch";

/**
 * Active orders = orders not yet ready for production
 */
export function getActiveOrdersCount(orders: Order[]): number {
  return orders.filter(
    (o) => o.status !== "ready_for_production" && o.status !== "in_production",
  ).length;
}

/**
 * Active batches = batches currently in progress
 */
export function getActiveBatchesCount(batches: Batch[]): number {
  return batches.filter((b) => b.status === "in_progress").length;
}

/**
 * Completed today = batches completed today
 * (simple MVP rule based on actualHours existence)
 */
export function getCompletedBatchesCount(batches: Batch[]): number {
  return batches.filter((b) => b.status === "completed").length;
}

/**
 * Late batches = batches exceeding estimate
 */
export function getLateBatchesCount(batches: Batch[]): number {
  return batches.filter(
    (b) => b.actualHours !== undefined && b.actualHours > b.estimatedHours,
  ).length;
}

export function getTotalOrdersCount(orders: Order[]): number {
  return orders.length;
}

function safeDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getOrderDoneAt(order: Order): Date | null {
  const doneHistory = (order.statusHistory ?? [])
    .filter((entry) => entry.status === "done")
    .map((entry) => safeDate(entry.changedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (doneHistory.length > 0) {
    return doneHistory[0];
  }
  if (order.status === "done") {
    return safeDate(order.statusChangedAt);
  }
  return null;
}

function getOrderStartAt(order: Order): Date | null {
  const firstHistory = (order.statusHistory ?? [])
    .map((entry) => safeDate(entry.changedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (firstHistory.length > 0) {
    return firstHistory[0];
  }
  return null;
}

export function getOnTimeRate(
  orders: Order[],
): { rate: number | null; completedCount: number } {
  const completedOrders = orders
    .map((order) => {
      const doneAt = getOrderDoneAt(order);
      const dueAt = safeDate(order.dueDate);
      if (!doneAt || !dueAt) {
        return null;
      }
      return {
        doneAt,
        dueAt,
      };
    })
    .filter(
      (value): value is { doneAt: Date; dueAt: Date } => value !== null,
    );

  if (completedOrders.length === 0) {
    return { rate: null, completedCount: 0 };
  }

  const onTimeCount = completedOrders.filter(
    ({ doneAt, dueAt }) => doneAt.getTime() <= dueAt.getTime(),
  ).length;

  return {
    rate: (onTimeCount / completedOrders.length) * 100,
    completedCount: completedOrders.length,
  };
}

export function getLeadTimeMedianHours(orders: Order[]): number | null {
  const leadTimesHours = orders
    .map((order) => {
      const startAt = getOrderStartAt(order);
      const doneAt = getOrderDoneAt(order);
      if (!startAt || !doneAt) {
        return null;
      }
      const diffHours = (doneAt.getTime() - startAt.getTime()) / 3_600_000;
      if (diffHours < 0) {
        return null;
      }
      return diffHours;
    })
    .filter((value): value is number => value !== null);
  return median(leadTimesHours);
}

export function getCycleTimeByStationMedian(
  batches: Batch[],
): { stationName: string | null; medianHours: number | null; sampleSize: number } {
  const completed = batches.filter((batch) => batch.status === "completed");
  const byStation = new Map<string, number[]>();

  completed.forEach((batch) => {
    const station = (batch.workstation || "").trim();
    if (!station) {
      return;
    }
    const duration =
      typeof batch.actualHours === "number" && batch.actualHours > 0
        ? batch.actualHours
        : batch.estimatedHours;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const list = byStation.get(station) ?? [];
    list.push(duration);
    byStation.set(station, list);
  });

  let slowestStation: string | null = null;
  let slowestMedian: number | null = null;
  let slowestSamples = 0;

  Array.from(byStation.entries()).forEach(([station, durations]) => {
    const stationMedian = median(durations);
    if (stationMedian === null) {
      return;
    }
    if (slowestMedian === null || stationMedian > slowestMedian) {
      slowestMedian = stationMedian;
      slowestStation = station;
      slowestSamples = durations.length;
    }
  });

  return {
    stationName: slowestStation,
    medianHours: slowestMedian,
    sampleSize: slowestSamples,
  };
}
