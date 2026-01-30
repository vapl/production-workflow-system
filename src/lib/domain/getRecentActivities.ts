import type { Order } from "@/types/orders";
import type { Batch } from "@/types/batch";
import type { Activity } from "@/types/activity";

export function getRecentActivities(
  orders: Order[],
  batches: Batch[],
  limit = 5,
): Activity[] {
  const activities: Activity[] = [];

  for (const batch of batches) {
    if (batch.status === "in_progress") {
      activities.push({
        id: `batch-started-${batch.id}`,
        title: `Batch "${batch.name}" started`,
        status: "in_progress",
        orderNumber: orders.find((o) => o.id === batch.orderId)?.orderNumber,
        workStation: batch.workstation,
        timestamp: new Date().toISOString(),
      });
    }

    if (batch.status === "completed") {
      activities.push({
        id: `batch-completed-${batch.id}`,
        title: `Batch "${batch.name}" completed`,
        status: "completed",
        orderNumber: orders.find((o) => o.id === batch.orderId)?.orderNumber,
        workStation: batch.workstation,
        timestamp: new Date().toISOString(),
      });
    }

    if (batch.status === "blocked") {
      activities.push({
        id: `batch-blocked-${batch.id}`,
        title: `Batch "${batch.name}" blocked`,
        status: "blocked",
        orderNumber: orders.find((o) => o.id === batch.orderId)?.orderNumber,
        workStation: batch.workstation,
        timestamp: new Date().toISOString(),
      });
    }
  }

  for (const order of orders) {
    if (order.status === "ready_for_production") {
      activities.push({
        id: `order-ready-${order.id}`,
        title: `Order ${order.orderNumber} ready for production`,
        status: "completed",
        timestamp: new Date().toISOString(),
      });
    }
  }

  return activities
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
