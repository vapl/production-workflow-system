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
  sku?: string | null;
  uom?: string | null;
  revision?: string | null;
  lifecycleStatus?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  supplyType?: string | null;
  itemGroup?: string | null;
  routeCode?: string | null;
  netWeight?: number | null;
  volume?: number | null;
  defaultSupplier?: string | null;
  qualityClass?: string | null;
  certificationRequired?: boolean | null;
  productionNotes?: string | null;
  attributes: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
