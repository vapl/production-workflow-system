export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface OrderAttachment {
  id: string;
  name: string;
  url?: string;
  addedBy: string;
  addedByRole?: string;
  createdAt: string;
  size?: number;
  mimeType?: string;
}

export interface OrderComment {
  id: string;
  message: string;
  author: string;
  authorRole?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  productName?: string;
  quantity?: number;
  hierarchy?: Record<string, string>;
  dueDate: string; // ISO date string
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
  attachments?: OrderAttachment[];
  comments?: OrderComment[];
}
