export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  dueDate: string; // ISO date string
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
}
