export type OrderStatus =
  | "draft"
  | "ready_for_engineering"
  | "in_engineering"
  | "engineering_blocked"
  | "ready_for_production";

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

export interface OrderStatusEntry {
  id: string;
  status: OrderStatus;
  changedBy: string;
  changedByRole?: string;
  changedAt: string;
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
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  assignedEngineerAt?: string;
  statusChangedBy?: string;
  statusChangedByRole?: string;
  statusChangedAt?: string;
  checklist?: Record<string, boolean>;
  statusHistory?: OrderStatusEntry[];
  source?: "manual" | "accounting" | "excel";
  externalId?: string;
  sourcePayload?: Record<string, unknown>;
  syncedAt?: string;
  attachments?: OrderAttachment[];
  comments?: OrderComment[];
}
