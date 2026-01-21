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

interface DashboardProps {
  orders: Order[];
  batches: Batch[];
  bottlenecks: Batch[];
  kpis: {
    activeOrders: number;
    totalOrders: number;
    activeBatches: number;
    completedToday: number;
    lateBatches: number;
  };
}

export function DashboardView({
  orders,
  batches,
  bottlenecks,
  kpis,
}: DashboardProps) {
  // // Calculate KPIs
  // const activeOrders = orders.filter(
  //   (o) => o.status !== "completed" && o.status !== "cancelled",
  // ).length;
  // const activeBatches = batches.filter(
  //   (b) => b.status === "in_progress",
  // ).length;
  // const completedToday = batches.filter((b) => {
  //   const completedDate = new Date(b.completedAt);
  //   const today = new Date();
  //   return (
  //     b.status === "completed" &&
  //     completedDate.toDateString() === today.toDateString()
  //   );
  // }).length;

  // // Identify bottlenecks - batches that are overdue or taking too long
  // const bottlenecks = batches.filter((b) => {
  //   if (b.status !== "in_progress") return false;
  //   const estimatedHours = b.estimatedHours || 0;
  //   const actualHours = b.actualHours || 0;
  //   return actualHours > estimatedHours * 1.2; // 20% over estimate
  // });

  // // Recent activity - last 5 batches with status changes
  // const recentBatches = [...batches]
  //   .sort(
  //     (a, b) =>
  //       new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  //   )
  //   .slice(0, 5);

  // const getStatusIcon = (status: string) => {
  //   switch (status) {
  //     case "in_progress":
  //       return <PlayIcon className="w-4 h-4" />;
  //     case "on_hold":
  //       return <PauseIcon className="w-4 h-4" />;
  //     case "completed":
  //       return <CheckCircleIcon className="w-4 h-4" />;
  //     default:
  //       return null;
  //   }
  // };

  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case "pending":
  //       return "bg-gray-100 text-gray-800";
  //     case "in_progress":
  //       return "bg-blue-100 text-blue-800";
  //     case "on_hold":
  //       return "bg-yellow-100 text-yellow-800";
  //     case "completed":
  //       return "bg-green-100 text-green-800";
  //     case "cancelled":
  //       return "bg-red-100 text-red-800";
  //     default:
  //       return "bg-gray-100 text-gray-800";
  //   }
  // };

  return (
    <div className="space-y-6">
      <KPIStats kpis={kpis} />
      <BottlenecksPanel batches={bottlenecks} />
      <RecentActivityList orders={orders} batches={batches} />
      {/* KPI Cards */}
      {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Active Orders</CardTitle>
            <PackageIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeOrders}</div>
            <p className="text-xs text-muted-foreground">
              {orders.length} total orders
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
            <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {bottlenecks.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Batches over estimate
            </p>
          </CardContent>
        </Card>
      </div> */}

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
