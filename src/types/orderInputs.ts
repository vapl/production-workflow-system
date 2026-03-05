export type OrderInputFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "toggle"
  | "toggle_number"
  | "table";

export type OrderInputTableColumnType = "text" | "number" | "select";

export type OrderInputFieldScope =
  | "order_additional"
  | "construction_table"
  | "construction_attribute";

export type ConstructionColumnSemanticKey =
  | "position"
  | "item_type"
  | "item_name"
  | "qty"
  | "dimensions"
  | "color"
  | "system"
  | "material"
  | "notes"
  | "custom";

export interface OrderInputTableColumn {
  key: string;
  label: string;
  aiKey?: string;
  semanticKey?: ConstructionColumnSemanticKey;
  fieldType: OrderInputTableColumnType;
  unit?: string;
  options?: string[];
  isRequired?: boolean;
  isActive?: boolean;
  showInTable?: boolean;
  showInProduction?: boolean;
  maxSelect?: number;
}

export type OrderInputGroupKey = "order_info" | "production_scope";

export interface OrderInputField {
  id: string;
  key: string;
  label: string;
  groupKey: OrderInputGroupKey;
  scope?: OrderInputFieldScope;
  fieldType: OrderInputFieldType;
  unit?: string;
  options?: string[];
  columns?: OrderInputTableColumn[];
  isPrimaryConstructionTable?: boolean;
  isBomImportTable?: boolean;
  isRequired: boolean;
  isActive: boolean;
  showInTable?: boolean;
  showInProduction?: boolean;
  sortOrder: number;
}

export interface OrderInputValue {
  fieldId: string;
  value: unknown;
}
