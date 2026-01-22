import { getBottleneckBatches } from "@/lib/domain/getBottleneckBatches";
import {
  getActiveOrdersCount,
  getActiveBatchesCount,
  getCompletedBatchesCount,
  getLateBatchesCount,
} from "@/lib/domain/dashboardKpis";
import { getRecentActivities } from "@/lib/domain/getRecentActivities";

import type { Order } from "@/types/order";
import type { Batch } from "@/types/batch";
import type { DashboardKpis } from "@/types/dashboard";
import type { Activity } from "@/types/activity";

export interface UseDashboardResult {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
  activities: Activity[];
}

export function useDashboard(): UseDashboardResult {
  // TEMP: hardcoded MVP data (empty for now)
  const orders: Order[] = [
    {
      id: "o1",
      orderNumber: "ORD-001",
      customerName: "ACME Industries",
      dueDate: "2026-02-10",
      priority: "high",
      status: "in_progress",
    },
    {
      id: "o2",
      orderNumber: "ORD-002",
      customerName: "Baltic Steel",
      dueDate: "2026-02-05",
      priority: "normal",
      status: "completed",
    },
    {
      id: "o3",
      orderNumber: "ORD-003",
      customerName: "Baltic Steel",
      dueDate: "2026-02-06",
      priority: "normal",
      status: "pending",
    },
  ];
  const batches: Batch[] = [
    {
      id: "b1",
      orderId: "o1",
      name: "Cutting – Frame Parts",
      workstation: "Cutting",
      operator: "Janis",
      estimatedHours: 6,
      actualHours: 7.5,
      status: "in_progress",
    },
    {
      id: "b2",
      orderId: "o1",
      name: "Welding – Main Frame",
      workstation: "Welding",
      operator: "Andris",
      estimatedHours: 8,
      actualHours: 8,
      status: "completed",
    },
    {
      id: "b3",
      orderId: "o2",
      name: "Assembly",
      workstation: "Assembly",
      estimatedHours: 5,
      actualHours: 6,
      status: "blocked",
    },
  ];

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
