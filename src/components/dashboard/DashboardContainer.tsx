import { DashboardView } from "./DashboardView";
import { getBottleneckBatches } from "@/lib/domain/getBottleneckBatches";
import {
  getActiveOrdersCount,
  getActiveBatchesCount,
  getCompletedBatchesCount,
  getLateBatchesCount,
} from "@/lib/domain/dashboardKpis";
import type { Order } from "@/types/order";
import type { Batch } from "@/types/batch";

export function DashboardContainer() {
  const orders: Order[] = [];
  const batches: Batch[] = [];
  const kpis = {
    activeOrders: getActiveOrdersCount(orders),
    totalOrders: getActiveOrdersCount(orders),
    activeBatches: getActiveBatchesCount(batches),
    completedToday: getCompletedBatchesCount(batches),
    lateBatches: getLateBatchesCount(batches),
  };

  const bottleneckBatches = getBottleneckBatches(batches);
  return (
    <DashboardView
      orders={orders}
      batches={batches}
      bottlenecks={bottleneckBatches}
      kpis={kpis}
    />
  );
}
