import type { OrderInputField, OrderInputTableColumn } from "@/types/orderInputs";
import type { OrderItem, OrderItemSourceKind } from "@/types/orderItems";
import {
  ensureOrderInputTableRow,
  getOrderInputTableRowId,
  ORDER_INPUT_TABLE_ROW_ID_KEY,
} from "@/lib/domain/orderInputTableRows";

const ORDER_ITEM_TABLE_SOURCE_KIND: OrderItemSourceKind = "order_input_table";

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

function findColumnValue(
  row: Record<string, unknown>,
  columns: OrderInputTableColumn[],
  matcher: (tokens: Set<string>) => boolean,
) {
  for (const column of columns) {
    const tokens = getColumnTokens(column);
    if (!matcher(tokens)) {
      continue;
    }
    const value = row[column.key];
    if (value === null || value === undefined || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item)).join(" / ").trim();
      if (joined) {
        return joined;
      }
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function resolveQty(field: OrderInputField, row: Record<string, unknown>) {
  const columns = field.columns ?? [];
  for (const column of columns) {
    const tokens = getColumnTokens(column);
    const isQtyColumn =
      tokens.has("qty") ||
      tokens.has("quantity") ||
      tokens.has("skaits") ||
      tokens.has("gab") ||
      normalizeToken(column.unit ?? "") === "pcs" ||
      normalizeToken(column.unit ?? "") === "gab";
    if (!isQtyColumn) {
      continue;
    }
    const raw = row[column.key];
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw.replace(",", "."))
          : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1;
}

function formatRowSummary(field: OrderInputField, row: Record<string, unknown>) {
  const columns = field.columns ?? [];
  const parts = columns
    .map((column) => {
      const value = row[column.key];
      if (value === null || value === undefined || value === "") {
        return "";
      }
      if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(" / ");
      }
      return String(value);
    })
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.join(" | ");
}

function resolveItemName(field: OrderInputField, row: Record<string, unknown>) {
  const columns = field.columns ?? [];
  const preferred =
    findColumnValue(
      row,
      columns,
      (tokens) =>
        tokens.has("name") ||
        tokens.has("nosaukums") ||
        tokens.has("description") ||
        tokens.has("apraksts"),
    ) ??
    findColumnValue(
      row,
      columns,
      (tokens) =>
        tokens.has("construction") ||
        tokens.has("konstrukcija") ||
        tokens.has("system") ||
        tokens.has("sistema"),
    );

  return preferred ?? formatRowSummary(field, row) ?? field.label;
}

function resolveItemType(columns: OrderInputTableColumn[], row: Record<string, unknown>) {
  return findColumnValue(
    row,
    columns,
    (tokens) =>
      tokens.has("construction") ||
      tokens.has("konstrukcija") ||
      tokens.has("type") ||
      tokens.has("tips") ||
      tokens.has("system") ||
      tokens.has("sistema"),
  );
}

function buildItemAttributes(
  row: Record<string, unknown>,
  columns: OrderInputTableColumn[],
) {
  const attributes: Record<string, unknown> = {};
  columns.forEach((column) => {
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

export function buildOrderItemsFromTableField(params: {
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

      const position =
        findColumnValue(normalizedRow, columns, (tokens) =>
          tokens.has("position") || tokens.has("poz") || tokens.has("pozicija"),
        ) ?? null;
      const dimensions =
        findColumnValue(normalizedRow, columns, (tokens) =>
          tokens.has("dimensions") ||
          tokens.has("dimension") ||
          tokens.has("izmers") ||
          tokens.has("size"),
        ) ?? null;
      const material =
        findColumnValue(normalizedRow, columns, (tokens) =>
          tokens.has("material") ||
          tokens.has("materials") ||
          tokens.has("finish") ||
          tokens.has("color") ||
          tokens.has("krasa"),
        ) ?? null;

      return {
        order_id: orderId,
        source_kind: ORDER_ITEM_TABLE_SOURCE_KIND,
        source_field_id: field.id,
        source_row_id: rowId,
        sort_order: index,
        position,
        item_name: resolveItemName(field, normalizedRow),
        item_type: resolveItemType(columns, normalizedRow),
        qty: resolveQty(field, normalizedRow),
        material,
        dimensions,
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

export function buildTableRowsFromOrderItems(
  field: OrderInputField,
  items: OrderItem[],
) {
  if (field.fieldType !== "table") {
    return [];
  }

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
