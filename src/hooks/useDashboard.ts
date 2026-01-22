import { getBottleneckBatches } from "@/lib/domain/getBottleneckBatches";
import {
  getActiveOrdersCount,
  getActiveBatchesCount,
  getCompletedBatchesCount,
  getLateBatchesCount,
} from "@/lib/domain/dashboardKpis";

import type { Order } from "@/types/order";
import type { Batch } from "@/types/batch";
import type { DashboardKpis } from "@/types/dashboard";

export interface UseDashboardResult {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
}

export function useDashboard(): UseDashboardResult {
  // TEMP: hardcoded MVP data (empty for now)
  const orders: Order[] = [];
  const batches: Batch[] = [];

  const bottlenecks = getBottleneckBatches(batches);

  const kpis: DashboardKpis = {
    activeOrders: getActiveOrdersCount(orders),
    activeBatches: getActiveBatchesCount(batches),
    completedToday: getCompletedBatchesCount(batches),
    lateBatches: getLateBatchesCount(batches),
    totalOrders: orders.length,
  };

  return {
    orders,
    batches,
    bottlenecks,
    kpis,
  };
}
