import {
  AlertTriangleIcon,
  ClockIcon,
  PackageIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

export function KPIStats({
  kpis,
}: {
  kpis: {
    activeOrders: number;
    totalOrders: number;
    activeBatches: number;
    completedToday: number;
    lateBatches: number;
  };
}) {
  const {
    activeOrders,
    totalOrders,
    activeBatches,
    completedToday,
    lateBatches,
  } = kpis;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Active Orders</CardTitle>
            <PackageIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeOrders}</div>
            <p className="text-xs text-muted-foreground">
              {totalOrders} total orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">In Production</CardTitle>
            <ClockIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBatches}</div>
            <p className="text-xs text-muted-foreground">Active work batches</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Completed Today</CardTitle>
            <TrendingUpIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedToday}</div>
            <p className="text-xs text-muted-foreground">Batches finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Bottlenecks</CardTitle>
            {lateBatches > 0 && (
              <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${lateBatches > 0 ? "text-amber-600" : ""}`}
            >
              {lateBatches}
            </div>
            <p className="text-xs text-muted-foreground">
              Batches over estimate
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
