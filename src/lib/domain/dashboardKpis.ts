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
