export type OrderItemSourceKind =
  | "order_input_table"
  | "manual"
  | "import"
  | "cad";

export interface OrderItem {
  id: string;
  orderId: string;
  sourceKind: OrderItemSourceKind;
  sourceRowId: string;
  sortOrder: number;
  position?: string | null;
  itemName: string;
  itemType?: string | null;
  qty: number;
  material?: string | null;
  dimensions?: string | null;
  attributes: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
