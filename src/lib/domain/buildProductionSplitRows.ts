import type { OrderInputField } from "@/types/orderInputs";
import {
  getOrderInputTableRowId,
  isOrderInputTableRowEmpty,
} from "@/lib/domain/orderInputTableRows";

export type ProductionBatchGroup = {
  key: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  batchCode: string;
  totalQty: number;
  material: string;
};

export type ProductionSplitRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  batchCode: string;
  priority: "low" | "normal" | "high" | "urgent";
  fieldId: string;
  fieldLabel: string;
  itemName: string;
  qty: number;
  material: string;
  sourceRowId: string | null;
  rowIndex: number;
  rawRow: Record<string, unknown>;
};

function formatTableRow(field: OrderInputField, row: Record<string, unknown>) {
  if (!field.columns || field.columns.length === 0) {
    return "";
  }
  const parts = field.columns
    .map((column) => {
      const value = row[column.key];
      if (Array.isArray(value)) {
        const joined = value.map((item) => String(item)).join(" / ");
        return column.unit ? `${joined} ${column.unit}` : joined;
      }
      if (value === null || value === undefined || value === "") {
        return "";
      }
      const text = String(value);
      return column.unit ? `${text} ${column.unit}` : text;
    })
    .filter((part) => part.trim().length > 0);
  return parts.join(" | ");
}

function resolveRowQty(field: OrderInputField, row: Record<string, unknown>) {
  const numericValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number(String(value).replace(",", "."));
    return Number.isNaN(parsed) ? null : parsed;
  };
  const normalizedLabel = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const isQuantityLabel = (value: string) => {
    const label = normalizedLabel(value);
    return (
      label.includes("skaits") ||
      label.includes("daudzums") ||
      label.includes("qty") ||
      label.includes("quantity") ||
      label.includes("count") ||
      label.includes("gab") ||
      label.includes("количество") ||
      label.includes("кол-во") ||
      label.includes("шт")
    );
  };
  const columns = field.columns ?? [];
  for (const column of columns) {
    const label = column.label;
    const key = column.key;
    const unit = (column.unit ?? "").toLowerCase();
    if (isQuantityLabel(label) || isQuantityLabel(key) || unit === "pcs" || unit === "gab") {
      const value = numericValue(row[column.key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return 1;
}

export function buildProductionSplitRows(
  groups: ProductionBatchGroup[],
  productionFields: OrderInputField[],
  productionValues: Record<string, Record<string, unknown>>,
): ProductionSplitRow[] {
  const rows: ProductionSplitRow[] = [];
  groups.forEach((group) => {
    const values = productionValues[group.orderId] ?? {};
    let added = false;
    productionFields
      .filter((field) => field.fieldType === "table")
      .forEach((field) => {
        const raw = values[field.id];
        const tableRows = Array.isArray(raw) ? raw : [];
        tableRows.forEach((row, rowIndex) => {
          const normalized =
            typeof row === "object" && row !== null
              ? (row as Record<string, unknown>)
              : {};
          if (isOrderInputTableRowEmpty(normalized)) {
            return;
          }
          const itemName = formatTableRow(field, normalized);
          if (!itemName) {
            return;
          }
          const stableRowId = getOrderInputTableRowId(normalized);
          rows.push({
            id: stableRowId
              ? `${group.orderId}:${field.id}:${stableRowId}`
              : `${group.orderId}:${field.id}:${rowIndex}`,
            orderId: group.orderId,
            orderNumber: group.orderNumber,
            customerName: group.customerName,
            dueDate: group.dueDate,
            batchCode: group.batchCode,
            priority: group.priority,
            fieldId: field.id,
            fieldLabel: field.label,
            itemName,
            qty: resolveRowQty(field, normalized),
            material: group.material ?? "",
            sourceRowId: stableRowId ?? null,
            rowIndex,
            rawRow: normalized,
          });
          added = true;
        });
      });
    if (!added) {
      rows.push({
        id: `${group.orderId}:fallback:0`,
        orderId: group.orderId,
        orderNumber: group.orderNumber,
        customerName: group.customerName,
        dueDate: group.dueDate,
        batchCode: group.batchCode,
        priority: group.priority,
        fieldId: "fallback",
        fieldLabel: "Order",
        itemName: group.material || group.orderNumber,
        qty: group.totalQty || 1,
        material: group.material ?? "",
        sourceRowId: null,
        rowIndex: 0,
        rawRow: {},
      });
    }
  });
  return rows;
}
