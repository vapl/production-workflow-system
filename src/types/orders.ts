export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  productName?: string;
  quantity?: number;
  dueDate: string; // ISO date string
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
}
