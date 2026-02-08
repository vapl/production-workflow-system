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

export interface OrderInputTableColumn {
  key: string;
  label: string;
  fieldType: OrderInputTableColumnType;
  unit?: string;
  options?: string[];
  isRequired?: boolean;
  maxSelect?: number;
}

export type OrderInputGroupKey = "order_info" | "production_scope";

export interface OrderInputField {
  id: string;
  key: string;
  label: string;
  groupKey: OrderInputGroupKey;
  fieldType: OrderInputFieldType;
  unit?: string;
  options?: string[];
  columns?: OrderInputTableColumn[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface OrderInputValue {
  fieldId: string;
  value: unknown;
}
