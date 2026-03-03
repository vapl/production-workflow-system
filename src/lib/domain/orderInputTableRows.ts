import { createId } from "@/lib/utils/createId";

export const ORDER_INPUT_TABLE_ROW_ID_KEY = "__rowId";
export const ORDER_INPUT_TABLE_ROW_ATTACHMENT_IDS_KEY = "__attachmentIds";

export type OrderInputTableRow = Record<string, unknown>;

export function ensureOrderInputTableRows(
  value: unknown,
): OrderInputTableRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => ensureOrderInputTableRow(row));
}

export function ensureOrderInputTableRow(
  row: unknown,
  options?: { clone?: boolean },
): OrderInputTableRow {
  const base =
    typeof row === "object" && row !== null
      ? ({ ...(row as Record<string, unknown>) } satisfies OrderInputTableRow)
      : {};

  if (
    !options?.clone &&
    typeof base[ORDER_INPUT_TABLE_ROW_ID_KEY] === "string" &&
    String(base[ORDER_INPUT_TABLE_ROW_ID_KEY]).trim().length > 0
  ) {
    return base;
  }

  return {
    ...base,
    [ORDER_INPUT_TABLE_ROW_ID_KEY]: createId("order-input-row"),
  };
}

export function cloneOrderInputTableRow(row: unknown): OrderInputTableRow {
  return ensureOrderInputTableRow(row, { clone: true });
}

export function getOrderInputTableRowId(row: unknown): string | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const value = (row as Record<string, unknown>)[ORDER_INPUT_TABLE_ROW_ID_KEY];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function isOrderInputTableRowEmpty(row: unknown): boolean {
  if (!row || typeof row !== "object") {
    return true;
  }

  return !Object.entries(row as Record<string, unknown>).some(
    ([key, cell]) =>
      !key.startsWith("__") &&
      String(cell ?? "").trim().length > 0,
  );
}
