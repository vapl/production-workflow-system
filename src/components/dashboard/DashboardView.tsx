import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  PackageIcon,
  ClockIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
} from "lucide-react";
import { KPIStats } from "./KPIStats";
import { BottlenecksPanel } from "./BottlenecksPanel";
import { RecentActivityList } from "./RecentActivity";
import { Batch } from "@/types/batch";
import { Order } from "@/types/order";
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

      {/* Bottlenecks Section */}
      {/* {bottlenecks.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="w-5 h-5 text-amber-500" />
              Bottlenecks Requiring Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bottlenecks.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between p-3 bg-amber-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{batch.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Order: {batch.orderNumber} | Station: {batch.workStation}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-amber-700">
                      {batch.actualHours}h / {batch.estimatedHours}h
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(
                        (batch.actualHours / batch.estimatedHours - 1) * 100,
                      )}
                      % over
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )} */}
    </div>
  );
}
