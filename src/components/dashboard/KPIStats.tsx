import {
  AlertTriangleIcon,
  ClockIcon,
  PackageIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Order } from "@/types/order";
import { Batch } from "@/types/batch";

export function KPIStats({
  orders,
  batches,
}: {
  orders: Order[];
  batches: Batch[];
}) {
  // Calculate KPIs
  const activeOrders = orders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  ).length;
  const activeBatches = batches.filter(
    (b) => b.status === "in_progress",
  ).length;
  const completedToday = batches.filter((b) => {
    const completedDate = new Date(b.completedAt);
    const today = new Date();
    return (
      b.status === "completed" &&
      completedDate.toDateString() === today.toDateString()
    );
  }).length;

  // Identify bottlenecks - batches that are overdue or taking too long
  const bottlenecks = batches.filter((b) => {
    if (b.status !== "in_progress") return false;
    const estimatedHours = b.estimatedHours || 0;
    const actualHours = b.actualHours || 0;
    return actualHours > estimatedHours * 1.2; // 20% over estimate
  });

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
      </div>
    </>
  );
}
