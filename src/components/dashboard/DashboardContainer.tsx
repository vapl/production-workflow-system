import { DashboardView } from "./DashboardView";

export function DashboardContainer() {
  // TEMP data (hardcoded)
  const orders: any[] = [];
  const batches: any[] = [];

  return <DashboardView orders={orders} batches={batches} />;
}
