export type OrderItemDocumentRole = "source" | "production" | "reference";

export interface OrderItemDocument {
  id: string;
  orderItemId: string;
  orderAttachmentId: string;
  role: OrderItemDocumentRole;
  sortOrder: number;
  createdAt?: string;
}
