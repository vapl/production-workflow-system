import { KPIStats } from "./KPIStats";
import { BottlenecksPanel } from "./BottlenecksPanel";
import { RecentActivityList } from "./RecentActivity";
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
  bottlenecks,
  kpis,
  activities,
}: DashboardProps) {
  return (
    <div className="space-y-6">
      <KPIStats kpis={kpis} />
      <BottlenecksPanel batches={bottlenecks} />
      <RecentActivityList activities={activities} />
    </div>
  );
}
