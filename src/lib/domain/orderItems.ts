import type { OrderInputField, OrderInputTableColumn } from "@/types/orderInputs";
import type { OrderItem, OrderItemSourceKind } from "@/types/orderItems";
import {
  ensureOrderInputTableRow,
  getOrderInputTableRowId,
  ORDER_INPUT_TABLE_ROW_ID_KEY,
} from "@/lib/domain/orderInputTableRows";

const ORDER_ITEM_TABLE_SOURCE_KIND: OrderItemSourceKind = "order_input_table";

const CORE_ITEM_SEMANTIC_KEYS = new Set([
  "position",
  "item_type",
  "item_name",
  "qty",
  "dimensions",
  "material",
]);

type CoreItemFieldKey =
  | "position"
  | "item_type"
  | "item_name"
  | "qty"
  | "dimensions"
  | "material";

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getColumnTokens(column: OrderInputTableColumn) {
  return new Set([
    normalizeToken(column.key),
    normalizeToken(column.label),
    normalizeToken(`${column.key}_${column.label}`),
  ]);
}

function getColumnCoreKey(column: OrderInputTableColumn): CoreItemFieldKey | null {
  if (column.semanticKey && CORE_ITEM_SEMANTIC_KEYS.has(column.semanticKey)) {
    return column.semanticKey as CoreItemFieldKey;
  }

  const tokens = getColumnTokens(column);
  if (tokens.has("position") || tokens.has("poz") || tokens.has("pozicija")) {
    return "position";
  }
  if (
    tokens.has("item_type") ||
    tokens.has("construction") ||
    tokens.has("konstrukcija") ||
    tokens.has("type") ||
    tokens.has("tips") ||
    tokens.has("system") ||
    tokens.has("sistema")
  ) {
    return "item_type";
  }
  if (
    tokens.has("item_name") ||
    tokens.has("name") ||
    tokens.has("nosaukums") ||
    tokens.has("description") ||
    tokens.has("apraksts")
  ) {
    return "item_name";
  }
  if (
    tokens.has("qty") ||
    tokens.has("quantity") ||
    tokens.has("skaits") ||
    tokens.has("gab") ||
    normalizeToken(column.unit ?? "") === "pcs" ||
    normalizeToken(column.unit ?? "") === "gab"
  ) {
    return "qty";
  }
  if (
    tokens.has("dimensions") ||
    tokens.has("dimension") ||
    tokens.has("izmers") ||
    tokens.has("size")
  ) {
    return "dimensions";
  }
  if (
    tokens.has("material") ||
    tokens.has("materials") ||
    tokens.has("finish")
  ) {
    return "material";
  }

  return null;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item)).join(" / ").trim();
    return joined || null;
  }
  const text = String(value).trim();
  return text || null;
}

function parseQty(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1;
}

function resolveCoreValue(
  row: Record<string, unknown>,
  columns: OrderInputTableColumn[],
  key: CoreItemFieldKey,
) {
  const mappedColumn = columns.find((column) => getColumnCoreKey(column) === key);
  if (mappedColumn) {
    return row[mappedColumn.key];
  }
  return undefined;
}

function formatRowSummary(field: OrderInputField, row: Record<string, unknown>) {
  const columns = field.columns ?? [];
  return columns
    .map((column) => stringifyValue(row[column.key]))
    .filter(Boolean)
    .join(" | ");
}

function buildItemAttributes(
  row: Record<string, unknown>,
  columns: OrderInputTableColumn[],
) {
  const attributes: Record<string, unknown> = {};
  columns.forEach((column) => {
    if (getColumnCoreKey(column)) {
      return;
    }
    const value = row[column.key];
    if (value !== undefined) {
      attributes[column.key] = value;
    }
  });
  return attributes;
}

export type OrderItemDbRow = {
  id: string;
  order_id: string;
  source_kind: OrderItemSourceKind;
  source_field_id?: string | null;
  source_row_id: string;
  sort_order: number | null;
  position?: string | null;
  item_name: string;
  item_type?: string | null;
  qty: number | null;
  material?: string | null;
  dimensions?: string | null;
  attributes?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export function mapOrderItemRow(row: OrderItemDbRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    sourceKind: row.source_kind,
    sourceFieldId: row.source_field_id ?? null,
    sourceRowId: row.source_row_id,
    sortOrder: row.sort_order ?? 0,
    position: row.position ?? null,
    itemName: row.item_name,
    itemType: row.item_type ?? null,
    qty: Number(row.qty ?? 1),
    material: row.material ?? null,
    dimensions: row.dimensions ?? null,
    attributes: row.attributes ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildOrderItemsFromConstructionField(params: {
  orderId: string;
  field: OrderInputField;
  value: unknown;
}) {
  const { orderId, field, value } = params;
  if (field.fieldType !== "table") {
    return [];
  }

  const rows = Array.isArray(value) ? value : [];
  const columns = field.columns ?? [];

  return rows
    .map((row, index) => {
      const normalizedRow = ensureOrderInputTableRow(row);
      const rowId = getOrderInputTableRowId(normalizedRow);
      if (!rowId) {
        return null;
      }

      const resolvedName = stringifyValue(resolveCoreValue(normalizedRow, columns, "item_name"));
      return {
        order_id: orderId,
        source_kind: ORDER_ITEM_TABLE_SOURCE_KIND,
        source_field_id: field.id,
        source_row_id: rowId,
        sort_order: index,
        position: stringifyValue(resolveCoreValue(normalizedRow, columns, "position")),
        item_name: resolvedName ?? formatRowSummary(field, normalizedRow) ?? field.label,
        item_type: stringifyValue(resolveCoreValue(normalizedRow, columns, "item_type")),
        qty: parseQty(resolveCoreValue(normalizedRow, columns, "qty")),
        material: stringifyValue(resolveCoreValue(normalizedRow, columns, "material")),
        dimensions: stringifyValue(resolveCoreValue(normalizedRow, columns, "dimensions")),
        attributes: buildItemAttributes(normalizedRow, columns),
      };
    })
    .filter(
      (
        item,
      ): item is {
        order_id: string;
        source_kind: OrderItemSourceKind;
        source_field_id: string;
        source_row_id: string;
        sort_order: number;
        position: string | null;
        item_name: string;
        item_type: string | null;
        qty: number;
        material: string | null;
        dimensions: string | null;
        attributes: Record<string, unknown>;
      } => Boolean(item),
    );
}

export function buildConstructionRowsFromOrderItems(
  field: OrderInputField,
  items: OrderItem[],
) {
  if (field.fieldType !== "table") {
    return [];
  }

  const columns = field.columns ?? [];

  return items
    .filter(
      (item) =>
        item.sourceKind === ORDER_ITEM_TABLE_SOURCE_KIND &&
        item.sourceFieldId === field.id,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const row = ensureOrderInputTableRow({
        ...item.attributes,
        [ORDER_INPUT_TABLE_ROW_ID_KEY]: item.sourceRowId,
      });

      columns.forEach((column) => {
        const coreKey = getColumnCoreKey(column);
        if (!coreKey) {
          return;
        }
        if (coreKey === "position") {
          row[column.key] = item.position ?? "";
        }
        if (coreKey === "item_type") {
          row[column.key] = item.itemType ?? "";
        }
        if (coreKey === "item_name") {
          row[column.key] = item.itemName ?? "";
        }
        if (coreKey === "qty") {
          row[column.key] = item.qty ?? 1;
        }
        if (coreKey === "dimensions") {
          row[column.key] = item.dimensions ?? "";
        }
        if (coreKey === "material") {
          row[column.key] = item.material ?? "";
        }
      });

      return row;
    });
}

export function isMissingOrderItemsSchema(error?: {
  code?: string | null;
  message?: string | null;
} | null) {
  if (!error) {
    return false;
  }

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "pgrst205" ||
    code === "42p01" ||
    message.includes("order_items") ||
    message.includes("schema cache")
  );
}
