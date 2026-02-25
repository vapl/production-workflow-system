"use client";

import { getBottleneckBatches } from "@/lib/domain/getBottleneckBatches";
import {
  getActiveOrdersCount,
  getActiveBatchesCount,
  getCompletedBatchesCount,
  getCycleTimeByStationMedian,
  getLateBatchesCount,
  getLeadTimeMedianHours,
  getOnTimeRate,
} from "@/lib/domain/dashboardKpis";
import { getRecentActivities } from "@/lib/domain/getRecentActivities";

import type { Order } from "@/types/orders";
import type { Batch } from "@/types/batch";
import type { DashboardKpis } from "@/types/dashboard";
import type { Activity } from "@/types/activity";
import { useOrders } from "@/app/orders/OrdersContext";
import { useBatches } from "@/contexts/BatchesContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";

export interface UseDashboardResult {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
  activities: Activity[];
}

export function useDashboard(): UseDashboardResult {
  const { orders } = useOrders();
  const { batches } = useBatches();
  const { rules } = useWorkflowRules();

  const bottlenecks = getBottleneckBatches(batches);
  const onTime = getOnTimeRate(orders);
  const leadTimeMedianHours = getLeadTimeMedianHours(orders);
  const slowestStation = getCycleTimeByStationMedian(batches);

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonDate = new Date();
  dueSoonDate.setDate(dueSoonDate.getDate() + Math.max(0, rules.dueSoonDays));
  const dueSoonStr = dueSoonDate.toISOString().slice(0, 10);
  const eligibleOrders = rules.dueIndicatorEnabled
    ? orders.filter((order) => rules.dueIndicatorStatuses.includes(order.status))
    : [];
  const overdueOrders = eligibleOrders.filter(
    (order) => order.dueDate && order.dueDate.slice(0, 10) < today,
  ).length;
  const dueSoonOrders = eligibleOrders.filter((order) => {
    const dueDate = order.dueDate?.slice(0, 10);
    return (
      dueDate &&
      dueDate >= today &&
      rules.dueSoonDays > 0 &&
      dueDate <= dueSoonStr
    );
  }).length;

  const kpis: DashboardKpis = {
    activeOrders: getActiveOrdersCount(orders),
    activeBatches: getActiveBatchesCount(batches),
    completedToday: getCompletedBatchesCount(batches),
    lateBatches: getLateBatchesCount(batches),
    totalOrders: orders.length,
    dueSoonOrders,
    overdueOrders,
    onTimeRate: onTime.rate,
    completedOrdersForOnTime: onTime.completedCount,
    leadTimeMedianHours,
    slowestStationName: slowestStation.stationName,
    slowestStationMedianHours: slowestStation.medianHours,
    slowestStationSampleSize: slowestStation.sampleSize,
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
