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

interface DashboardProps {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: DashboardKpis;
}

export function DashboardView({
  orders,
  batches,
  bottlenecks,
  kpis,
}: DashboardProps) {
  return (
    <div className="space-y-6">
      <KPIStats kpis={kpis} />
      <BottlenecksPanel batches={bottlenecks} />
      <RecentActivityList orders={orders} batches={batches} />

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

      {/* Recent Activity */}
      {/* <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentBatches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${getStatusColor(batch.status)}`}
                  >
                    {getStatusIcon(batch.status)}
                  </div>
                  <div>
                    <div className="font-medium">{batch.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {batch.orderNumber} • {batch.workStation}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={getStatusColor(batch.status)}
                  >
                    {batch.status.replace("_", " ")}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(batch.updatedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card> */}
    </div>
  );
}
