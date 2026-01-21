import { DashboardView } from "./DashboardView";
import type { Order } from "@/types/order";
import type { Batch } from "@/types/batch";

export function DashboardContainer() {
  const orders: Order[] = [];
  const batches: Batch[] = [];

  return <DashboardView orders={orders} batches={batches} />;
}
