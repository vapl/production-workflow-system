export type OrderItemBomLineSourceKind = "manual" | "import" | "cad";

export type OrderItemBomLineType =
  | "profile"
  | "glass"
  | "panel"
  | "hardware"
  | "gasket"
  | "accessory"
  | "sheet"
  | "edge_band"
  | "fitting"
  | "other";

export interface OrderItemBomLine {
  id: string;
  orderItemId: string;
  lineNo: number;
  componentCode?: string | null;
  componentName: string;
  componentType: OrderItemBomLineType;
  qty: number;
  unit: string;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  attributes: Record<string, unknown>;
  sourceKind: OrderItemBomLineSourceKind;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}
