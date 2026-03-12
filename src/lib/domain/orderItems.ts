import type { OrderInputField, OrderInputTableColumn } from "@/types/orderInputs";
import type { OrderItem, OrderItemSourceKind } from "@/types/orderItems";
import {
  ensureOrderInputTableRow,
  getOrderInputTableRowId,
  ORDER_INPUT_TABLE_ROW_ID_KEY,
} from "@/lib/domain/orderInputTableRows";

const ORDER_ITEM_TABLE_SOURCE_KIND: OrderItemSourceKind = "order_input_table";

type CoreItemFieldKey =
  | "position"
  | "item_type"
  | "item_name"
  | "qty"
  | "dimensions"
  | "material"
  | "sku"
  | "uom"
  | "revision"
  | "lifecycle_status"
  | "valid_from"
  | "valid_to"
  | "supply_type"
  | "item_group"
  | "route_code"
  | "net_weight"
  | "volume"
  | "default_supplier"
  | "quality_class"
  | "certification_required"
  | "production_notes";

const CORE_ITEM_SEMANTIC_KEYS = new Set(["position", "item_type", "item_name", "qty", "dimensions", "material"]);
const CORE_ITEM_KEYS = new Set<CoreItemFieldKey>([
  "position",
  "item_type",
  "item_name",
  "qty",
  "dimensions",
  "material",
  "sku",
  "uom",
  "revision",
  "lifecycle_status",
  "valid_from",
  "valid_to",
  "supply_type",
  "item_group",
  "route_code",
  "net_weight",
  "volume",
  "default_supplier",
  "quality_class",
  "certification_required",
  "production_notes",
]);

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function hasAnyToken(tokens: Set<string>, expected: string[]) {
  return expected.some((token) => tokens.has(token));
}

function getColumnCoreKey(column: OrderInputTableColumn): CoreItemFieldKey | null {
  if (column.semanticKey && CORE_ITEM_SEMANTIC_KEYS.has(column.semanticKey)) {
    return column.semanticKey as CoreItemFieldKey;
  }

  const keyToken = normalizeToken(column.key);
  if (CORE_ITEM_KEYS.has(keyToken as CoreItemFieldKey)) {
    return keyToken as CoreItemFieldKey;
  }

  const tokens = getColumnTokens(column);
  if (hasAnyToken(tokens, ["position", "poz", "pozicija", "rindas_nr", "line_no"])) return "position";
  if (hasAnyToken(tokens, ["item_type", "construction", "konstrukcija", "type", "tips", "system", "sistema"])) return "item_type";
  if (hasAnyToken(tokens, ["item_name", "name", "nosaukums", "description", "apraksts"])) return "item_name";
  if (
    hasAnyToken(tokens, ["qty", "quantity", "daudzums", "skaits", "gab"]) ||
    normalizeToken(column.unit ?? "") === "pcs" ||
    normalizeToken(column.unit ?? "") === "gab"
  ) {
    return "qty";
  }
  if (hasAnyToken(tokens, ["dimensions", "dimension", "izmers", "izmeri", "size"])) return "dimensions";
  if (hasAnyToken(tokens, ["material", "materials", "finish", "apdare"])) return "material";
  if (hasAnyToken(tokens, ["sku", "artikula_kods", "article_code", "item_code"])) return "sku";
  if (hasAnyToken(tokens, ["uom", "unit", "unit_of_measure", "mervieniba"])) return "uom";
  if (hasAnyToken(tokens, ["revision", "revizija", "rev"])) return "revision";
  if (hasAnyToken(tokens, ["lifecycle_status", "statuss", "status"])) return "lifecycle_status";
  if (hasAnyToken(tokens, ["valid_from", "effective_from", "speka_no"])) return "valid_from";
  if (hasAnyToken(tokens, ["valid_to", "effective_to", "speka_lidz"])) return "valid_to";
  if (hasAnyToken(tokens, ["supply_type", "piegades_tips"])) return "supply_type";
  if (hasAnyToken(tokens, ["item_group", "produktu_grupa"])) return "item_group";
  if (hasAnyToken(tokens, ["route_code", "marsruta_kods"])) return "route_code";
  if (hasAnyToken(tokens, ["net_weight", "neto_svars"])) return "net_weight";
  if (hasAnyToken(tokens, ["volume", "tilpums"])) return "volume";
  if (hasAnyToken(tokens, ["default_supplier", "noklusetais_piegadatajs"])) return "default_supplier";
  if (hasAnyToken(tokens, ["quality_class", "kvalitates_klase"])) return "quality_class";
  if (hasAnyToken(tokens, ["certification_required", "sertifikacija_obligata"])) return "certification_required";
  if (hasAnyToken(tokens, ["production_notes", "razosanas_piezimes", "notes"])) return "production_notes";
  return null;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item)).join(" / ").trim();
    return joined || null;
  }
  const text = String(value).trim();
  return text || null;
}

function parseQty(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1;
}

function parseNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;
  const normalized = normalizeToken(value);
  if (["1", "true", "yes", "ja", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "ne", "n"].includes(normalized)) return false;
  return null;
}

function resolveCoreValue(row: Record<string, unknown>, columns: OrderInputTableColumn[], key: CoreItemFieldKey) {
  const mappedColumn = columns.find((column) => getColumnCoreKey(column) === key);
  if (mappedColumn) return row[mappedColumn.key];
  return undefined;
}

function formatRowSummary(field: OrderInputField, row: Record<string, unknown>) {
  const columns = field.columns ?? [];
  return columns.map((column) => stringifyValue(row[column.key])).filter(Boolean).join(" | ");
}

function buildItemAttributes(row: Record<string, unknown>, columns: OrderInputTableColumn[]) {
  const attributes: Record<string, unknown> = {};
  columns.forEach((column) => {
    if (getColumnCoreKey(column)) return;
    const value = row[column.key];
    if (value !== undefined) attributes[column.key] = value;
  });
  const traceabilityKeys = ["__import_source_file", "__import_source_sheet", "__import_source_row_ref"] as const;
  traceabilityKeys.forEach((key) => {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") attributes[key] = value;
  });
  return attributes;
}

export type OrderItemDbRow = {
  id: string;
  order_id: string;
  source_kind: OrderItemSourceKind;
  source_row_id: string;
  sort_order: number | null;
  position?: string | null;
  item_name: string;
  item_type?: string | null;
  qty: number | null;
  material?: string | null;
  dimensions?: string | null;
  sku?: string | null;
  uom?: string | null;
  revision?: string | null;
  lifecycle_status?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  supply_type?: string | null;
  item_group?: string | null;
  route_code?: string | null;
  net_weight?: number | null;
  volume?: number | null;
  default_supplier?: string | null;
  quality_class?: string | null;
  certification_required?: boolean | null;
  production_notes?: string | null;
  attributes?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export function mapOrderItemRow(row: OrderItemDbRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    sourceKind: row.source_kind,
    sourceRowId: row.source_row_id,
    sortOrder: row.sort_order ?? 0,
    position: row.position ?? null,
    itemName: row.item_name,
    itemType: row.item_type ?? null,
    qty: Number(row.qty ?? 1),
    material: row.material ?? null,
    dimensions: row.dimensions ?? null,
    sku: row.sku ?? null,
    uom: row.uom ?? null,
    revision: row.revision ?? null,
    lifecycleStatus: row.lifecycle_status ?? null,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    supplyType: row.supply_type ?? null,
    itemGroup: row.item_group ?? null,
    routeCode: row.route_code ?? null,
    netWeight: row.net_weight ?? null,
    volume: row.volume ?? null,
    defaultSupplier: row.default_supplier ?? null,
    qualityClass: row.quality_class ?? null,
    certificationRequired: row.certification_required ?? null,
    productionNotes: row.production_notes ?? null,
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
  if (field.fieldType !== "table") return [];

  const rows = Array.isArray(value) ? value : [];
  const columns = field.columns ?? [];

  return rows
    .map((row, index) => {
      const normalizedRow = ensureOrderInputTableRow(row);
      const rowId = getOrderInputTableRowId(normalizedRow);
      if (!rowId) return null;

      const resolvedName = stringifyValue(resolveCoreValue(normalizedRow, columns, "item_name"));
      return {
        order_id: orderId,
        source_kind: ORDER_ITEM_TABLE_SOURCE_KIND,
        source_row_id: rowId,
        sort_order: index,
        position: stringifyValue(resolveCoreValue(normalizedRow, columns, "position")),
        item_name: resolvedName ?? formatRowSummary(field, normalizedRow) ?? field.label,
        item_type: stringifyValue(resolveCoreValue(normalizedRow, columns, "item_type")),
        qty: parseQty(resolveCoreValue(normalizedRow, columns, "qty")),
        material: stringifyValue(resolveCoreValue(normalizedRow, columns, "material")),
        dimensions: stringifyValue(resolveCoreValue(normalizedRow, columns, "dimensions")),
        sku: stringifyValue(resolveCoreValue(normalizedRow, columns, "sku")),
        uom: stringifyValue(resolveCoreValue(normalizedRow, columns, "uom")),
        revision: stringifyValue(resolveCoreValue(normalizedRow, columns, "revision")),
        lifecycle_status: stringifyValue(resolveCoreValue(normalizedRow, columns, "lifecycle_status")),
        valid_from: stringifyValue(resolveCoreValue(normalizedRow, columns, "valid_from")),
        valid_to: stringifyValue(resolveCoreValue(normalizedRow, columns, "valid_to")),
        supply_type: stringifyValue(resolveCoreValue(normalizedRow, columns, "supply_type")),
        item_group: stringifyValue(resolveCoreValue(normalizedRow, columns, "item_group")),
        route_code: stringifyValue(resolveCoreValue(normalizedRow, columns, "route_code")),
        net_weight: parseNumberValue(resolveCoreValue(normalizedRow, columns, "net_weight")),
        volume: parseNumberValue(resolveCoreValue(normalizedRow, columns, "volume")),
        default_supplier: stringifyValue(resolveCoreValue(normalizedRow, columns, "default_supplier")),
        quality_class: stringifyValue(resolveCoreValue(normalizedRow, columns, "quality_class")),
        certification_required: parseBooleanValue(
          resolveCoreValue(normalizedRow, columns, "certification_required"),
        ),
        production_notes: stringifyValue(resolveCoreValue(normalizedRow, columns, "production_notes")),
        attributes: buildItemAttributes(normalizedRow, columns),
      };
    })
    .filter(
      (
        item,
      ): item is {
        order_id: string;
        source_kind: OrderItemSourceKind;
        source_row_id: string;
        sort_order: number;
        position: string | null;
        item_name: string;
        item_type: string | null;
        qty: number;
        material: string | null;
        dimensions: string | null;
        sku: string | null;
        uom: string | null;
        revision: string | null;
        lifecycle_status: string | null;
        valid_from: string | null;
        valid_to: string | null;
        supply_type: string | null;
        item_group: string | null;
        route_code: string | null;
        net_weight: number | null;
        volume: number | null;
        default_supplier: string | null;
        quality_class: string | null;
        certification_required: boolean | null;
        production_notes: string | null;
        attributes: Record<string, unknown>;
      } => Boolean(item),
    );
}

export function buildConstructionRowsFromOrderItems(field: OrderInputField, items: OrderItem[]) {
  if (field.fieldType !== "table") return [];
  const columns = field.columns ?? [];

  return items
    .filter((item) => item.sourceKind === ORDER_ITEM_TABLE_SOURCE_KIND)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const row = ensureOrderInputTableRow({
        ...item.attributes,
        [ORDER_INPUT_TABLE_ROW_ID_KEY]: item.sourceRowId,
      });

      columns.forEach((column) => {
        const coreKey = getColumnCoreKey(column);
        if (!coreKey) return;
        if (coreKey === "position") row[column.key] = item.position ?? "";
        if (coreKey === "item_type") row[column.key] = item.itemType ?? "";
        if (coreKey === "item_name") row[column.key] = item.itemName ?? "";
        if (coreKey === "qty") row[column.key] = item.qty ?? 1;
        if (coreKey === "dimensions") row[column.key] = item.dimensions ?? "";
        if (coreKey === "material") row[column.key] = item.material ?? "";
        if (coreKey === "sku") row[column.key] = item.sku ?? "";
        if (coreKey === "uom") row[column.key] = item.uom ?? "";
        if (coreKey === "revision") row[column.key] = item.revision ?? "";
        if (coreKey === "lifecycle_status") row[column.key] = item.lifecycleStatus ?? "";
        if (coreKey === "valid_from") row[column.key] = item.validFrom ?? "";
        if (coreKey === "valid_to") row[column.key] = item.validTo ?? "";
        if (coreKey === "supply_type") row[column.key] = item.supplyType ?? "";
        if (coreKey === "item_group") row[column.key] = item.itemGroup ?? "";
        if (coreKey === "route_code") row[column.key] = item.routeCode ?? "";
        if (coreKey === "net_weight") row[column.key] = item.netWeight ?? "";
        if (coreKey === "volume") row[column.key] = item.volume ?? "";
        if (coreKey === "default_supplier") row[column.key] = item.defaultSupplier ?? "";
        if (coreKey === "quality_class") row[column.key] = item.qualityClass ?? "";
        if (coreKey === "certification_required") row[column.key] = item.certificationRequired ?? "";
        if (coreKey === "production_notes") row[column.key] = item.productionNotes ?? "";
      });

      return row;
    });
}

export function isMissingOrderItemsSchema(
  error?: {
    code?: string | null;
    message?: string | null;
  } | null,
) {
  if (!error) return false;
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  return code === "pgrst205" || code === "42p01" || message.includes("order_items") || message.includes("schema cache");
}
