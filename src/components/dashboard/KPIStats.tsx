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
    dueSoonOrders: number;
    overdueOrders: number;
  };
}) {
  const {
    activeOrders,
    totalOrders,
    activeBatches,
    completedToday,
    lateBatches,
    dueSoonOrders,
    overdueOrders,
  } = kpis;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">Active Orders</CardTitle>
            <PackageIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{activeOrders}</div>
            <p className="text-xs text-muted-foreground">
              {totalOrders} total orders
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">In Production</CardTitle>
            <ClockIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{activeBatches}</div>
            <p className="text-xs text-muted-foreground">Active work batches</p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">Completed Today</CardTitle>
            <TrendingUpIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{completedToday}</div>
            <p className="text-xs text-muted-foreground">Batches finished</p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">Bottlenecks</CardTitle>
            {lateBatches > 0 && (
              <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div
              className={`text-[1.75rem] leading-none font-bold ${lateBatches > 0 ? "text-amber-600" : ""}`}
            >
              {lateBatches}
            </div>
            <p className="text-xs text-muted-foreground">
              Batches over estimate
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">Due Soon</CardTitle>
            <ClockIcon className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-amber-600">
              {dueSoonOrders}
            </div>
            <p className="text-xs text-muted-foreground">
              Orders approaching due date
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">Overdue</CardTitle>
            <AlertTriangleIcon className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-rose-600">
              {overdueOrders}
            </div>
            <p className="text-xs text-muted-foreground">
              Orders past due date
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
