export type ConstructionImportTarget = "items" | "bom";

export type ConstructionImportStep = "source" | "mapping" | "review" | "save";

export type ConstructionImportLayout = "flat_table" | "grouped_blocks";

export const CONSTRUCTION_IMPORT_MAPPING_KEYS = [
  "position",
  "sku",
  "item_type",
  "item_name",
  "qty",
  "dimensions",
  "color",
  "material",
] as const;

export const CORE_CONSTRUCTION_IMPORT_MAPPING_KEYS = CONSTRUCTION_IMPORT_MAPPING_KEYS;

export type ConstructionImportMappingKey =
  (typeof CONSTRUCTION_IMPORT_MAPPING_KEYS)[number];

export const REQUIRED_CONSTRUCTION_IMPORT_MAPPING_KEYS = ["item_name"] as const;

export const CONSTRUCTION_IMPORT_STEPS = [
  "source",
  "mapping",
  "review",
  "save",
] as const;

export const CONSTRUCTION_IMPORT_LABELS: Record<
  ConstructionImportMappingKey,
  string
> = {
  position: "Pozīcija",
  sku: "SKU",
  item_type: "Artikuls / tips",
  item_name: "Nosaukums",
  qty: "Daudzums",
  dimensions: "Izmēri",
  color: "Apdare / krāsa",
  material: "Materiāls / apdare",
};

export type ConstructionImportBlockRules = {
  articleLabels?: string[];
  positionLabels?: string[];
  quantityLabels?: string[];
};

export type ConstructionImportPdfRules = {
  rowSelection?: "unit_like_only" | "component_like_only" | "all";
};

export type ConstructionImportDocumentHints = {
  fileNameTokens?: string[];
  sourceFieldKeys?: string[];
  sourceFieldLabels?: string[];
  layoutMarkers?: string[];
  requiredValueKeys?: string[];
  positionValuePatterns?: string[];
  dimensionMarkers?: string[];
  preferredSourceByColumn?: Partial<
    Record<ConstructionImportMappingKey, string[]>
  >;
};

export const DEFAULT_CONSTRUCTION_IMPORT_BLOCK_RULES: Required<ConstructionImportBlockRules> =
  {
    articleLabels: [
      "Artikuls",
      "Article",
      "Item",
      "Model",
      "Code",
      "Product",
      "Element",
      "Reference",
      "Ref",
    ],
    positionLabels: ["PozÄ«cija", "Position", "Pos"],
    quantityLabels: ["Artikulu skaits", "Quantity", "Qty", "Count"],
  };

export type ConstructionImportTargetMeta = {
  value: ConstructionImportTarget;
  label: string;
  profileName: string;
  targetTableLabel: string;
  targetDescription: string;
  applyLabel: string;
};

export const CONSTRUCTION_IMPORT_TARGET_META: Record<
  ConstructionImportTarget,
  ConstructionImportTargetMeta
> = {
  items: {
    value: "items",
    label: "Produkti / konstrukcijas",
    profileName: "Produktu importa profils",
    targetTableLabel: "Produktu tabula",
    targetDescription:
      "Imports raksta primÄrajÄ produkta tabulÄ no Settings konfigurÄ“tajÄm kolonnÄm.",
    applyLabel: "Pievienot importÄ“tÄs rindas",
  },
  bom: {
    value: "bom",
    label: "Komponentes izvÄ“lÄ“tai vienÄ«bai",
    profileName: "KomponenÅu importa profils",
    targetTableLabel: "KomponenÅu tabula",
    targetDescription:
      "Imports raksta komponenÅu rindas izvÄ“lÄ“tajai vienÄ«bai; mappingÄ tiek izmantotas komponenÅu kolonnas.",
    applyLabel: "Pievienot komponentes",
  },
};

export type ConstructionImportParserProfile = {
  version: 1;
  target: ConstructionImportTarget;
  targetLabel: string;
  layout: ConstructionImportLayout;
  documentHints?: ConstructionImportDocumentHints;
  matching: {
    fileExtensions: string[];
    requiredHeaders: string[];
  };
  sheet: {
    role: "products" | "components";
    sourceSheetName: string | null;
  };
  columns: {
    availableTargetColumns: string[];
    headerMapping: Partial<Record<ConstructionImportMappingKey, string>>;
    semantics: Partial<Record<ConstructionImportMappingKey, string>>;
  };
  blockRules: ConstructionImportBlockRules;
  pdfRules?: ConstructionImportPdfRules;
  rowRules: {
    sourceRowRefKey: string;
    startRowIndex: number;
    itemNameRequired: boolean;
  };
};

export type ConstructionImportParserProfileDraft = Partial<{
  layout: ConstructionImportLayout;
  documentHints: Partial<ConstructionImportDocumentHints>;
  matching: Partial<ConstructionImportParserProfile["matching"]>;
  sheet: Partial<ConstructionImportParserProfile["sheet"]>;
  rowRules: Partial<ConstructionImportParserProfile["rowRules"]>;
  columns: Partial<ConstructionImportParserProfile["columns"]>;
  blockRules: Partial<ConstructionImportBlockRules>;
  pdfRules: Partial<ConstructionImportPdfRules>;
}>;

export type ConstructionImportRowTypeHints = {
  productLikeRows?: number;
  componentLikeRows?: number;
  unknownRows?: number;
  suggestedTarget?: ConstructionImportTarget;
};

export function buildConstructionImportParserProfile(args: {
  target: ConstructionImportTarget;
  mapping: Record<string, string>;
  headers: string[];
  fileExtension?: string;
  fileName?: string | null;
  sheetName?: string | null;
  targetSchemaColumns: string[];
  layout?: ConstructionImportLayout;
  blockRules?: ConstructionImportBlockRules;
  pdfRules?: ConstructionImportPdfRules;
  documentHints?: ConstructionImportDocumentHints;
}): ConstructionImportParserProfile {
  const normalizedHeaders = args.headers
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);
  const requiredHeaders = CORE_CONSTRUCTION_IMPORT_MAPPING_KEYS.filter((key) =>
    Boolean(args.mapping[key]),
  ).map((key) => args.mapping[key] as string);

  return {
    version: 1,
    target: args.target,
    targetLabel: CONSTRUCTION_IMPORT_TARGET_META[args.target].label,
    layout: args.layout ?? "flat_table",
    documentHints: {
      fileNameTokens: (
        args.documentHints?.fileNameTokens ?? deriveFileNameTokens(args.fileName)
      )
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
      sourceFieldKeys: (args.documentHints?.sourceFieldKeys ?? normalizedHeaders)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
      sourceFieldLabels: (args.documentHints?.sourceFieldLabels ?? normalizedHeaders)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
      layoutMarkers: (
        args.documentHints?.layoutMarkers ?? [args.layout ?? "flat_table"]
      )
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    },
    matching: {
      fileExtensions: args.fileExtension ? [args.fileExtension] : [],
      requiredHeaders,
    },
    sheet: {
      role: args.target === "bom" ? "components" : "products",
      sourceSheetName: args.sheetName?.trim() || null,
    },
    columns: {
      availableTargetColumns: args.targetSchemaColumns,
      headerMapping: CORE_CONSTRUCTION_IMPORT_MAPPING_KEYS.reduce<
        Partial<Record<ConstructionImportMappingKey, string>>
      >((acc, key) => {
        const mappedHeader = args.mapping[key];
        if (mappedHeader) {
          acc[key] = mappedHeader;
        }
        return acc;
      }, {}),
      semantics: CORE_CONSTRUCTION_IMPORT_MAPPING_KEYS.reduce<
        Partial<Record<ConstructionImportMappingKey, string>>
      >((acc, key) => {
        if (normalizedHeaders.includes(args.mapping[key] ?? "")) {
          acc[key] = key;
        }
        return acc;
      }, {}),
    },
    blockRules: {
      ...DEFAULT_CONSTRUCTION_IMPORT_BLOCK_RULES,
      ...(args.blockRules ?? {}),
    },
    pdfRules: args.pdfRules,
    rowRules: {
      sourceRowRefKey: "source_row_ref",
      startRowIndex: 2,
      itemNameRequired: true,
    },
  };
}

export function readConstructionImportParserProfile(
  value: unknown,
): ConstructionImportParserProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parserProfile = (value as { parser_profile?: unknown }).parser_profile;
  if (!parserProfile || typeof parserProfile !== "object") {
    return null;
  }
  const candidate = parserProfile as Partial<ConstructionImportParserProfile>;
  if (candidate.version !== 1) {
    return null;
  }
  if (candidate.target !== "items" && candidate.target !== "bom") {
    return null;
  }
  if (candidate.layout !== "flat_table" && candidate.layout !== "grouped_blocks") {
    return null;
  }
  return candidate as ConstructionImportParserProfile;
}

export function readConstructionImportRowTypeHints(
  value: unknown,
): ConstructionImportRowTypeHints | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const hints = (value as { row_type_hints?: unknown }).row_type_hints;
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) {
    return null;
  }
  const candidate = hints as ConstructionImportRowTypeHints;
  if (
    candidate.suggestedTarget &&
    candidate.suggestedTarget !== "items" &&
    candidate.suggestedTarget !== "bom"
  ) {
    return null;
  }
  return candidate;
}

export function mergeConstructionImportParserProfileDraft(
  base: ConstructionImportParserProfile,
  draft: ConstructionImportParserProfileDraft | null | undefined,
): ConstructionImportParserProfile {
  if (!draft) {
    return base;
  }

  return {
    ...base,
    layout: draft.layout ?? base.layout,
    documentHints: {
      ...(base.documentHints ?? {}),
      ...(draft.documentHints ?? {}),
      fileNameTokens:
        draft.documentHints?.fileNameTokens ?? base.documentHints?.fileNameTokens,
      sourceFieldKeys:
        draft.documentHints?.sourceFieldKeys ??
        base.documentHints?.sourceFieldKeys,
      sourceFieldLabels:
        draft.documentHints?.sourceFieldLabels ??
        base.documentHints?.sourceFieldLabels,
      layoutMarkers:
        draft.documentHints?.layoutMarkers ?? base.documentHints?.layoutMarkers,
      requiredValueKeys:
        draft.documentHints?.requiredValueKeys ??
        base.documentHints?.requiredValueKeys,
      positionValuePatterns:
        draft.documentHints?.positionValuePatterns ??
        base.documentHints?.positionValuePatterns,
      dimensionMarkers:
        draft.documentHints?.dimensionMarkers ??
        base.documentHints?.dimensionMarkers,
      preferredSourceByColumn:
        draft.documentHints?.preferredSourceByColumn ??
        base.documentHints?.preferredSourceByColumn,
    },
    matching: {
      ...base.matching,
      ...(draft.matching ?? {}),
    },
    sheet: {
      ...base.sheet,
      ...(draft.sheet ?? {}),
    },
    columns: {
      ...base.columns,
      ...(draft.columns ?? {}),
      headerMapping: {
        ...base.columns.headerMapping,
        ...(draft.columns?.headerMapping ?? {}),
      },
      semantics: {
        ...base.columns.semantics,
        ...(draft.columns?.semantics ?? {}),
      },
      availableTargetColumns:
        draft.columns?.availableTargetColumns ?? base.columns.availableTargetColumns,
    },
    blockRules: {
      ...base.blockRules,
      ...(draft.blockRules ?? {}),
    },
    pdfRules: {
      ...(base.pdfRules ?? {}),
      ...(draft.pdfRules ?? {}),
    },
    rowRules: {
      ...base.rowRules,
      ...(draft.rowRules ?? {}),
    },
  };
}

function deriveFileNameTokens(fileName?: string | null) {
  return String(fileName ?? "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^a-z0-9]+/i)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}
