import type { ProductionItemRow } from "@/types/production";

type ProductionItemProgressLike = Pick<
  ProductionItemRow,
  "qty" | "status" | "meta"
>;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Math.floor(Number(String(value).replace(",", ".")));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isQuantityKey(key: string) {
  const normalized = key.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    normalized.includes("qty") ||
    normalized.includes("quantity") ||
    normalized.includes("count") ||
    normalized.includes("skaits") ||
    normalized.includes("daudzums") ||
    normalized.includes("gab") ||
    normalized.includes("количество") ||
    normalized.includes("кол-во") ||
    normalized.includes("шт") ||
    normalized === "on"
  );
}

function getMetaRowQuantity(item: ProductionItemProgressLike) {
  const meta =
    item.meta && typeof item.meta === "object"
      ? (item.meta as Record<string, unknown>)
      : null;
  const row =
    meta?.row && typeof meta.row === "object"
      ? (meta.row as Record<string, unknown>)
      : null;
  if (!row) {
    return null;
  }
  const preferredKeys = [
    "qty",
    "quantity",
    "count",
    "skaits",
    "daudzums",
    "gab",
    "artikulu_skaits",
    "количество",
    "кол-во",
    "on",
  ];
  for (const key of preferredKeys) {
    const value = parsePositiveInteger(row[key]);
    if (value !== null) {
      return value;
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (!isQuantityKey(key)) {
      continue;
    }
    const parsed = parsePositiveInteger(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function getProductionItemQuantity(item: ProductionItemProgressLike) {
  return getMetaRowQuantity(item) ?? parsePositiveInteger(item.qty) ?? 1;
}

export function getProductionItemCompletedQty(
  item: ProductionItemProgressLike,
) {
  const quantity = getProductionItemQuantity(item);
  if (item.status === "done") {
    return quantity;
  }
  const raw =
    item.meta && typeof item.meta === "object"
      ? (item.meta as Record<string, unknown>).completedQty
      : null;
  const completed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : 0;
  return clamp(Number.isFinite(completed) ? Math.floor(completed) : 0, 0, quantity);
}

export function getProductionItemRemainingQty(
  item: ProductionItemProgressLike,
) {
  return Math.max(
    0,
    getProductionItemQuantity(item) - getProductionItemCompletedQty(item),
  );
}

export function getProductionItemsProgress(
  items: ProductionItemProgressLike[],
) {
  return items.reduce(
    (acc, item) => {
      acc.totalQty += getProductionItemQuantity(item);
      acc.completedQty += getProductionItemCompletedQty(item);
      return acc;
    },
    { completedQty: 0, totalQty: 0 },
  );
}
