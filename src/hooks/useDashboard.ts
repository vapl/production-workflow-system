import { getBottleneckBatches } from "@/lib/domain/getBottleneckBatches";
import {
  getActiveOrdersCount,
  getActiveBatchesCount,
  getCompletedBatchesCount,
  getLateBatchesCount,
} from "@/lib/domain/dashboardKpis";
import { getRecentActivities } from "@/lib/domain/getRecentActivities";

import type { Order } from "@/types/orders";
import type { Batch } from "@/types/batch";
import type { DashboardKpis } from "@/types/dashboard";
import type { Activity } from "@/types/activity";
import { mockBatches, mockOrders } from "@/lib/data/mockData";

export interface UseDashboardResult {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
  activities: Activity[];
}

export function useDashboard(): UseDashboardResult {
  const orders: Order[] = mockOrders;
  const batches: Batch[] = mockBatches;

  const bottlenecks = getBottleneckBatches(batches);

  const kpis: DashboardKpis = {
    activeOrders: getActiveOrdersCount(orders),
    activeBatches: getActiveBatchesCount(batches),
    completedToday: getCompletedBatchesCount(batches),
    lateBatches: getLateBatchesCount(batches),
    totalOrders: orders.length,
  };

  const activities = getRecentActivities(orders, batches, 5);

  return {
    orders,
    batches,
    bottlenecks,
    kpis,
    activities,
  };
}
