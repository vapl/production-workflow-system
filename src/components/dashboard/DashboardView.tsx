import { KPIStats } from "./KPIStats";
import { BottlenecksPanel } from "./BottlenecksPanel";
import { RecentActivityList } from "./RecentActivity";
import { OperatorPerformancePanel } from "./OperatorPerformancePanel";
import { Batch } from "@/types/batch";
import { Order } from "@/types/orders";
import { DashboardKpis } from "@/types/dashboard";
import { Activity } from "@/types/activity";

interface DashboardProps {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
  activities: Activity[];
}

export function DashboardView({
  batches,
  bottlenecks,
  kpis,
  activities,
}: DashboardProps) {
  return (
    <div className="space-y-6 pt-[calc(env(safe-area-inset-top)+5.75rem)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6 md:pt-6">
      <KPIStats kpis={kpis} />
      <OperatorPerformancePanel batches={batches} />
      <BottlenecksPanel batches={bottlenecks} />
      <RecentActivityList activities={activities} />
    </div>
  );
}
