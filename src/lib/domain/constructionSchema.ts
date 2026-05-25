import type {
  ConstructionColumnSemanticKey,
  OrderInputField,
  OrderInputTableColumn,
} from "@/types/orderInputs";
import type { AppLocale } from "@/lib/i18n/locales";

export const constructionColumnSemanticOptions: Array<{
  value: ConstructionColumnSemanticKey;
  label: string;
}> = [
  { value: "position", label: "Line No." },
  { value: "item_type", label: "Item type" },
  { value: "item_name", label: "Item name" },
  { value: "qty", label: "Quantity" },
  { value: "dimensions", label: "Dimensions" },
  { value: "color", label: "Finish / color" },
  { value: "system", label: "System" },
  { value: "material", label: "Material" },
  { value: "notes", label: "Notes" },
  { value: "custom", label: "Custom" },
];

const defaultErpCoreConstructionColumns: OrderInputTableColumn[] = [
  { key: "sku", label: "Item code (SKU)", fieldType: "text" as const },
  {
    key: "uom",
    label: "Unit of measure (UoM)",
    fieldType: "select" as const,
    options: ["pcs", "set", "m", "m2", "m3", "kg", "l", "box", "pack"],
  },
  { key: "revision", label: "Revision", fieldType: "text" as const },
  {
    key: "lifecycle_status",
    label: "Status",
    fieldType: "select" as const,
    options: ["Draft", "Released", "Obsolete"],
  },
  { key: "valid_from", label: "Valid from", fieldType: "text" as const },
  { key: "valid_to", label: "Valid to", fieldType: "text" as const },
  {
    key: "supply_type",
    label: "Supply type",
    fieldType: "select" as const,
    options: ["Make-to-order", "Make-to-stock", "Buy"],
  },
  { key: "item_group", label: "Item group", fieldType: "text" as const },
  { key: "route_code", label: "Route code", fieldType: "text" as const },
  {
    key: "net_weight",
    label: "Net weight (kg)",
    fieldType: "number" as const,
    unit: "kg",
  },
  {
    key: "volume",
    label: "Volume (m3)",
    fieldType: "number" as const,
    unit: "m3",
  },
  {
    key: "default_supplier",
    label: "Default supplier",
    fieldType: "text" as const,
  },
  { key: "quality_class", label: "Quality class", fieldType: "text" as const },
  {
    key: "certification_required",
    label: "Certification required",
    fieldType: "select" as const,
    options: ["No", "Yes"],
  },
  {
    key: "production_notes",
    label: "Production notes",
    fieldType: "text" as const,
  },
].map((column, index) => ({
  ...column,
  isActive: true,
  isRequired: false,
  showInTable: true,
  showInProduction: true,
  useInBomTable: index !== 14,
}));

export const erpCoreConstructionColumnKeys = new Set(
  defaultErpCoreConstructionColumns.map((column) => column.key.toLowerCase()),
);

export const defaultConstructionTableColumns: OrderInputTableColumn[] = [
  {
    key: "position",
    label: "Line No.",
    semanticKey: "position",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: false,
  },
  {
    key: "item_type",
    label: "Item type",
    semanticKey: "item_type",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: true,
  },
  {
    key: "item_name",
    label: "Item name",
    semanticKey: "item_name",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: true,
  },
  {
    key: "dimensions",
    label: "Dimensions",
    semanticKey: "dimensions",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: true,
  },
  {
    key: "qty",
    label: "Quantity",
    semanticKey: "qty",
    fieldType: "number",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: true,
  },
  {
    key: "material",
    label: "Material",
    semanticKey: "material",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
    useInBomTable: true,
  },
  ...defaultErpCoreConstructionColumns,
];

export const defaultBomTableColumns: OrderInputTableColumn[] = [
  {
    key: "component_code",
    label: "Component code",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
  {
    key: "component_name",
    label: "Component",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
  {
    key: "component_group",
    label: "Group",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
  {
    key: "qty",
    label: "Quantity",
    fieldType: "number",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
  {
    key: "dimensions",
    label: "Dimensions",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
  {
    key: "material",
    label: "Material / supplier",
    fieldType: "text",
    isActive: true,
    showInTable: true,
    showInProduction: true,
  },
];

export const defaultErpConstructionAttributes: Array<
  Omit<OrderInputField, "id">
> = [];

export const primaryUnitOperationalColumnKeys = [
  "position",
  "sku",
  "item_type",
  "item_name",
  "dimensions",
  "qty",
  "color",
  "system",
] as const;

export const componentOperationalColumnKeys = [
  "parent_article",
  "component_code",
  "component_name",
  "item_name",
  "qty",
  "dimensions",
  "material",
] as const;

const erpAttributeLabelByKey: Record<
  string,
  { lv: string; en: string; ru: string }
> = {
  sku: {
    lv: "Artikula kods (SKU)",
    en: "Item code (SKU)",
    ru: "Код артикула (SKU)",
  },
  uom: {
    lv: "Mērvienība (UoM)",
    en: "Unit of measure (UoM)",
    ru: "Ед. изм. (UoM)",
  },
  revision: { lv: "Revīzija", en: "Revision", ru: "Ревизия" },
  lifecycle_status: { lv: "Statuss", en: "Status", ru: "Статус" },
  valid_from: { lv: "Spēkā no", en: "Valid from", ru: "Действует с" },
  valid_to: { lv: "Spēkā līdz", en: "Valid to", ru: "Действует до" },
  supply_type: {
    lv: "Piegādes tips",
    en: "Supply type",
    ru: "Тип обеспечения",
  },
  item_group: { lv: "Produktu grupa", en: "Item group", ru: "Группа изделий" },
  route_code: { lv: "Maršruta kods", en: "Route code", ru: "Код маршрута" },
  net_weight: {
    lv: "Neto svars (kg)",
    en: "Net weight (kg)",
    ru: "Вес нетто (кг)",
  },
  volume: { lv: "Tilpums (m3)", en: "Volume (m3)", ru: "Объем (м3)" },
  default_supplier: {
    lv: "Noklusētais piegādātājs",
    en: "Default supplier",
    ru: "Поставщик по умолчанию",
  },
  quality_class: {
    lv: "Kvalitātes klase",
    en: "Quality class",
    ru: "Класс качества",
  },
  certification_required: {
    lv: "Sertifikācija obligāta",
    en: "Certification required",
    ru: "Сертификация обязательна",
  },
  production_notes: {
    lv: "Ražošanas piezīmes",
    en: "Production notes",
    ru: "Производственные заметки",
  },
};

const tableColumnLabelByKey: Record<
  string,
  { lv: string; en: string; ru: string }
> = {
  position: { lv: "Pozīcija", en: "Position", ru: "Позиция" },
  line_no: { lv: "Pozīcija", en: "Position", ru: "Позиция" },
  item_type: { lv: "Produkta tips", en: "Item type", ru: "Тип изделия" },
  construction: { lv: "Produkta tips", en: "Item type", ru: "Тип изделия" },
  type: { lv: "Produkta tips", en: "Item type", ru: "Тип изделия" },
  tips: { lv: "Produkta tips", en: "Item type", ru: "Тип изделия" },
  system: { lv: "Produkta tips", en: "Item type", ru: "Тип изделия" },
  item_name: {
    lv: "Produkta nosaukums",
    en: "Item name",
    ru: "Название изделия",
  },
  name: { lv: "Produkta nosaukums", en: "Item name", ru: "Название изделия" },
  nosaukums: {
    lv: "Produkta nosaukums",
    en: "Item name",
    ru: "Название изделия",
  },
  dimensions: { lv: "Izmēri", en: "Dimensions", ru: "Размеры" },
  size: { lv: "Izmēri", en: "Dimensions", ru: "Размеры" },
  izmeri: { lv: "Izmēri", en: "Dimensions", ru: "Размеры" },
  qty: { lv: "Daudzums", en: "Quantity", ru: "Количество" },
  quantity: { lv: "Daudzums", en: "Quantity", ru: "Количество" },
  skaits: { lv: "Daudzums", en: "Quantity", ru: "Количество" },
  material: { lv: "Materiāls", en: "Material", ru: "Материал" },
  materials: { lv: "Materiāls", en: "Material", ru: "Материал" },
  color: { lv: "Apdare / krāsa", en: "Finish / color", ru: "Отделка / цвет" },
  colour: { lv: "Apdare / krāsa", en: "Finish / color", ru: "Отделка / цвет" },
  apdare: { lv: "Apdare / krāsa", en: "Finish / color", ru: "Отделка / цвет" },
  finish: { lv: "Apdare / krāsa", en: "Finish / color", ru: "Отделка / цвет" },
  component_code: {
    lv: "Artikuls",
    en: "Component code",
    ru: "Код компонента",
  },
  component_name: { lv: "Komponente", en: "Component", ru: "Компонент" },
  component_group: { lv: "Grupa", en: "Group", ru: "Группа" },
  ...erpAttributeLabelByKey,
};

function pickByLocale(
  translation: { lv: string; en: string; ru: string } | undefined,
  locale: AppLocale,
  fallback: string,
) {
  if (!translation) return fallback;
  if (locale === "en") return translation.en;
  if (locale === "ru") return translation.ru;
  return translation.lv;
}

export function localizeConstructionAttributeLabel(
  key: string,
  locale: AppLocale,
  fallback: string,
) {
  return pickByLocale(erpAttributeLabelByKey[key], locale, fallback);
}

export function localizeConstructionColumnLabel(
  key: string,
  locale: AppLocale,
  fallback: string,
) {
  return pickByLocale(
    tableColumnLabelByKey[key.toLowerCase()],
    locale,
    fallback,
  );
}

export function getLocalizedConstructionColumnDisplayLabel(
  column: Pick<OrderInputTableColumn, "key" | "label"> & {
    semanticKey?: string | null;
  },
  locale: AppLocale,
) {
  const directMatch = tableColumnLabelByKey[column.key.toLowerCase()];
  if (directMatch) {
    return pickByLocale(directMatch, locale, column.label);
  }
  if (column.semanticKey && column.semanticKey !== "custom") {
    const semanticMatch =
      tableColumnLabelByKey[column.semanticKey.toLowerCase()];
    if (semanticMatch) {
      return pickByLocale(semanticMatch, locale, column.label);
    }
  }
  return column.label;
}

export function getConstructionColumnPresentationKey(
  column: Pick<OrderInputTableColumn, "key"> & { semanticKey?: string | null },
) {
  return (column.semanticKey ?? column.key).toLowerCase();
}

export function localizeConstructionColumns(
  columns: OrderInputTableColumn[],
  locale: AppLocale,
) {
  return columns.map((column) => ({
    ...column,
    label: getLocalizedConstructionColumnDisplayLabel(column, locale),
  }));
}

export const legacyConstructionColumnLabelMap: Partial<
  Record<ConstructionColumnSemanticKey, string[]>
> = {
  position: [
    "position",
    "line_no",
    "pozicija",
    "pozīcija",
    "rindas nr",
    "line",
    "line no",
  ],
  item_type: [
    "item_type",
    "construction",
    "konstrukcija",
    "tips",
    "type",
    "system",
    "sistema",
  ],
  item_name: ["item_name", "name", "nosaukums"],
  dimensions: ["dimensions", "izmeri", "izmēri", "izmers", "izmērs", "size"],
  qty: ["qty", "quantity", "daudzums", "skaits"],
  system: ["system", "sistema"],
  material: ["material", "materials", "materiāls"],
  color: ["color", "colour", "krasa", "krāsa", "apdare", "finish"],
  notes: ["notes", "piezimes", "piezīmes"],
};

const recommendedConstructionLabels = new Map(
  defaultConstructionTableColumns.map(
    (column) => [column.semanticKey, column.label] as const,
  ),
);

function normalizeConstructionToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function inferConstructionSemanticKey(
  column: Pick<OrderInputTableColumn, "key" | "label" | "semanticKey">,
): ConstructionColumnSemanticKey {
  if (column.semanticKey) return column.semanticKey;
  const candidates = [
    normalizeConstructionToken(column.key),
    normalizeConstructionToken(column.label),
  ];
  const matched = constructionColumnSemanticOptions.find((option) => {
    if (option.value === "custom") return false;
    const aliases = legacyConstructionColumnLabelMap[option.value] ?? [];
    return candidates.some((candidate) => aliases.includes(candidate));
  });
  return matched?.value ?? "custom";
}

export function normalizeConstructionColumns(columns: OrderInputTableColumn[]) {
  let changed = false;
  const nextColumns = columns.map((column) => {
    const semanticKey = inferConstructionSemanticKey(column);
    const recommendedLabel = semanticKey
      ? recommendedConstructionLabels.get(semanticKey)
      : undefined;
    const normalizedLabelToken = normalizeConstructionToken(column.label);
    const legacyAliases = legacyConstructionColumnLabelMap[semanticKey] ?? [];
    const shouldReplaceLabel =
      Boolean(recommendedLabel) &&
      legacyAliases.includes(normalizedLabelToken) &&
      column.label !== recommendedLabel;
    const nextColumn: OrderInputTableColumn = {
      ...column,
      semanticKey,
      isActive: column.isActive ?? true,
      showInTable: column.showInTable ?? true,
      showInProduction: column.showInProduction ?? true,
      useInBomTable: column.useInBomTable ?? false,
      label: shouldReplaceLabel
        ? (recommendedLabel ?? column.label)
        : column.label,
    };
    if (
      nextColumn.semanticKey !== column.semanticKey ||
      nextColumn.isActive !== column.isActive ||
      nextColumn.showInTable !== column.showInTable ||
      nextColumn.showInProduction !== column.showInProduction ||
      nextColumn.useInBomTable !== column.useInBomTable ||
      nextColumn.label !== column.label
    ) {
      changed = true;
    }
    return nextColumn;
  });
  return { columns: nextColumns, changed };
}

export type ConstructionSchemaTemplateType =
  | "primary_columns"
  | "bom_columns"
  | "erp_attributes";

export type ConstructionSchemaTemplateRow = {
  template_type: ConstructionSchemaTemplateType;
  payload: unknown;
};

function isArrayPayload<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function resolveConstructionSchemaTemplatePayload(
  rows: ConstructionSchemaTemplateRow[] | null | undefined,
) {
  const byType = new Map(
    rows?.map((row) => [row.template_type, row.payload]) ?? [],
  );
  const primaryPayload = byType.get("primary_columns");
  const bomPayload = byType.get("bom_columns");
  const erpPayload = byType.get("erp_attributes");
  return {
    primaryColumns: isArrayPayload<OrderInputTableColumn>(primaryPayload)
      ? primaryPayload
      : defaultConstructionTableColumns,
    bomColumns: isArrayPayload<OrderInputTableColumn>(bomPayload)
      ? bomPayload
      : defaultBomTableColumns,
    erpAttributes: isArrayPayload<Omit<OrderInputField, "id">>(erpPayload)
      ? erpPayload
      : defaultErpConstructionAttributes,
  };
}
