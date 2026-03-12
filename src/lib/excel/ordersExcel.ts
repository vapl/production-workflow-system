import * as XLSX from "xlsx";

export const BASE_ORDER_COLUMNS = [
  "Order #",
  "Customer Name",
  "Customer Email",
  "Product",
  "Quantity",
  "Due Date",
  "Priority",
  "Status",
  "Notes",
];

export function buildOrdersTemplate(levelNames: string[]): Blob {
  const headers = [
    ...BASE_ORDER_COLUMNS,
    ...levelNames.map((name) => `Order field:${name}`),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
  const array = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export type ParsedOrdersWorkbook = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  parseMode: "flat_table" | "grouped_blocks";
};

type OrdersWorkbookBlockRules = {
  articleLabels?: string[];
  positionLabels?: string[];
  quantityLabels?: string[];
};

const DEFAULT_BLOCK_RULES: Required<OrdersWorkbookBlockRules> = {
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
  positionLabels: ["Pozīcija", "Position", "Pos"],
  quantityLabels: ["Artikulu skaits", "Quantity", "Qty", "Count"],
};

function normalizeHeaderToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCellValue(value: unknown): string {
  return String(value ?? "").trim();
}

type HeaderMatch = {
  rowIndex: number;
  row: string[];
  columnByKey: Partial<
    Record<"position" | "item_name" | "material" | "qty" | "fl" | "fw" | "thk", number>
  >;
};

const HEADER_ALIASES: Record<keyof HeaderMatch["columnByKey"], string[]> = {
  position: ["position", "pozicija", "poz", "pozicija_nr", "artikuls", "artikuls_pozicija"],
  item_name: ["nosaukums", "name", "item_name", "furnitura", "viras", "atvilktnes", "gaismas", "rokturi", "profili"],
  material: ["materials", "materials_apdare", "material", "materials_apdare_krasa"],
  qty: ["#", "qty", "quantity", "daudzums", "skaits", "garums"],
  fl: ["fl", "length", "garums"],
  fw: ["fw", "width", "platums"],
  thk: ["thk", "thickness", "biezums"],
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLabelPattern(labels: string[]) {
  return labels
    .map((label) =>
      escapeRegex(
        label
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, ""),
      ),
    )
    .join("|");
}

function parsePositionFromRow(
  cells: string[],
  blockRules?: OrdersWorkbookBlockRules,
): string | null {
  const joined = cells
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const labelPattern = buildLabelPattern([
    ...(blockRules?.positionLabels ?? DEFAULT_BLOCK_RULES.positionLabels),
    "Pozīcija",
    "Position",
    "Pos",
  ]);
  const match = joined.match(
    new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*([a-z0-9\\-_.]+)`, "i"),
  );
  return match?.[1]?.trim() ?? null;
}

function parseArticleFromRow(
  cells: string[],
  blockRules?: OrdersWorkbookBlockRules,
): string | null {
  const joined = cells
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const labelPattern = buildLabelPattern(
    blockRules?.articleLabels ?? DEFAULT_BLOCK_RULES.articleLabels,
  );
  const match = joined.match(
    new RegExp(
      `(?:${labelPattern})\\s*:\\s*(.+?)(?=\\s*\\(|\\s+(?:${buildLabelPattern(
        blockRules?.positionLabels ?? DEFAULT_BLOCK_RULES.positionLabels,
      )})\\s*:|$)`,
      "i",
    ),
  );
  return match?.[1]?.trim() ?? null;
}
function parseDimensionsFromRow(cells: string[]): string {
  const joined = cells.join(" ");
  const match = joined.match(
    /\(\s*(?:A|H)\s*:\s*([^ )x]+)\s*x\s*(?:P|L|W)\s*:\s*([^ )x]+)\s*x\s*(?:D|W)\s*:\s*([^ )x]+)\s*\)/i,
  );
  if (!match) {
    return "";
  }
  return [match[1], match[2], match[3]].map((value) => value.trim()).join("x");
}

function parseQtyFromSummaryRow(
  cells: string[],
  blockRules?: OrdersWorkbookBlockRules,
): string {
  const joined = cells
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const labelPattern = buildLabelPattern(
    blockRules?.quantityLabels ?? DEFAULT_BLOCK_RULES.quantityLabels,
  );
  const match = joined.match(
    new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)`, "i"),
  );
  if (match?.[1]) {
    return match[1].trim();
  }

  const labelDetected = new RegExp(`(?:${labelPattern})\\s*[:\\-]?`, "i").test(joined);
  if (!labelDetected) {
    return "";
  }

  const numericFallback = joined.match(/([0-9]+(?:[.,][0-9]+)?)/);
  return numericFallback?.[1]?.trim() ?? "";
}

function parseQtyFromGroupedBlock(
  matrix: string[][],
  articleRowIndex: number,
  blockRules?: OrdersWorkbookBlockRules,
): string {
  for (let offset = 0; offset <= 3; offset += 1) {
    const rowIndex = articleRowIndex + offset;
    if (rowIndex >= matrix.length) {
      break;
    }

    if (offset > 0 && parseArticleFromRow(matrix[rowIndex], blockRules)) {
      break;
    }

    const qty = parseQtyFromSummaryRow(matrix[rowIndex], blockRules);
    if (qty) {
      return qty;
    }
  }

  return "";
}

function parseAreaFromSummaryRow(cells: string[]): { kvm: string; kvm_total: string } {
  const joined = cells
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const kvmTotalMatch = joined.match(/KVM\s*kopa\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const stripped = kvmTotalMatch ? joined.replace(kvmTotalMatch[0], " ") : joined;
  const kvmMatch = stripped.match(/KVM\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i);

  return {
    kvm: kvmMatch?.[1]?.trim() ?? "",
    kvm_total: kvmTotalMatch?.[1]?.trim() ?? "",
  };
}

function parseAreaFromGroupedBlock(
  matrix: string[][],
  articleRowIndex: number,
): { kvm: string; kvm_total: string } {
  for (let offset = 0; offset <= 3; offset += 1) {
    const rowIndex = articleRowIndex + offset;
    if (rowIndex >= matrix.length) {
      break;
    }

    if (offset > 0 && parseArticleFromRow(matrix[rowIndex])) {
      break;
    }

    const parsed = parseAreaFromSummaryRow(matrix[rowIndex]);
    if (parsed.kvm || parsed.kvm_total) {
      return parsed;
    }
  }

  return { kvm: "", kvm_total: "" };
}

function detectHeaderRows(matrix: string[][]): HeaderMatch[] {
  const matches: HeaderMatch[] = [];
  matrix.forEach((row, rowIndex) => {
    const columnByKey: HeaderMatch["columnByKey"] = {};
    row.forEach((cell, colIndex) => {
      const token = normalizeHeaderToken(cell);
      if (!token) {
        return;
      }
      (Object.keys(HEADER_ALIASES) as Array<keyof HeaderMatch["columnByKey"]>).forEach((key) => {
        if (columnByKey[key] !== undefined) {
          return;
        }
        if (HEADER_ALIASES[key].includes(token)) {
          columnByKey[key] = colIndex;
        }
      });
    });

    const confidence = [columnByKey.item_name, columnByKey.material, columnByKey.qty]
      .filter((value) => value !== undefined).length;

    if (confidence >= 2) {
      matches.push({ rowIndex, row, columnByKey });
    }
  });

  return matches;
}

function parseBlockStructuredComponentRows(
  matrix: string[][],
  blockRules?: OrdersWorkbookBlockRules,
): { headers: string[]; rows: ParsedOrdersWorkbook["rows"] } {
  const headerRows = detectHeaderRows(matrix);
  if (headerRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rows: ParsedOrdersWorkbook["rows"] = [];
  let activePosition = "";
  let activeArticle = "";
  const semanticToHeader = new Map<string, string>();

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const currentRow = matrix[rowIndex];
    const parsedPosition = parsePositionFromRow(currentRow, blockRules);
    if (parsedPosition) {
      activePosition = parsedPosition;
    }
    const parsedArticle = parseArticleFromRow(currentRow, blockRules);
    if (parsedArticle) {
      activeArticle = parsedArticle;
    }

    const header = headerRows.find((item) => item.rowIndex === rowIndex);
    if (!header) {
      continue;
    }

    const positionHeader =
      header.columnByKey.position !== undefined
        ? normalizeCellValue(header.row[header.columnByKey.position]) || "position"
        : "position";
    const itemNameHeader =
      header.columnByKey.item_name !== undefined
        ? normalizeCellValue(header.row[header.columnByKey.item_name]) || "item_name"
        : "item_name";
    const qtyHeader =
      header.columnByKey.qty !== undefined
        ? normalizeCellValue(header.row[header.columnByKey.qty]) || "qty"
        : "qty";
    const materialHeader =
      header.columnByKey.material !== undefined
        ? normalizeCellValue(header.row[header.columnByKey.material]) || "material"
        : "material";

    semanticToHeader.set("position", positionHeader);
    semanticToHeader.set("parent_article", "parent_article");
    semanticToHeader.set("item_name", itemNameHeader);
    semanticToHeader.set("qty", qtyHeader);
    semanticToHeader.set("material", materialHeader);
    semanticToHeader.set("dimensions", "dimensions");

    const nextHeaderIndex =
      headerRows.find((item) => item.rowIndex > rowIndex)?.rowIndex ?? matrix.length;

    for (let dataRowIndex = rowIndex + 1; dataRowIndex < nextHeaderIndex; dataRowIndex += 1) {
      const dataRow = matrix[dataRowIndex];
      if (dataRow.every((cell) => !normalizeCellValue(cell))) {
        continue;
      }

      const itemName =
        header.columnByKey.item_name !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.item_name])
          : "";
      const material =
        header.columnByKey.material !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.material])
          : "";
      const qty =
        header.columnByKey.qty !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.qty])
          : "";
      const explicitPosition =
        header.columnByKey.position !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.position])
          : "";

      if (!itemName && !material && !qty) {
        continue;
      }

      const fl =
        header.columnByKey.fl !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.fl])
          : "";
      const fw =
        header.columnByKey.fw !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.fw])
          : "";
      const thk =
        header.columnByKey.thk !== undefined
          ? normalizeCellValue(dataRow[header.columnByKey.thk])
          : "";

      const dimensionParts = [fl, fw, thk].filter(Boolean);
      const dimensions = dimensionParts.length > 0 ? dimensionParts.join("x") : "";

      rows.push({
        parent_article: activeArticle,
        [positionHeader]: explicitPosition || activePosition,
        [itemNameHeader]: itemName,
        [qtyHeader]: qty,
        dimensions,
        [materialHeader]: material,
      });
    }
  }

  const headers = Array.from(
    new Set([
      semanticToHeader.get("parent_article") ?? "parent_article",
      semanticToHeader.get("position") ?? "position",
      semanticToHeader.get("item_name") ?? "item_name",
      semanticToHeader.get("qty") ?? "qty",
      semanticToHeader.get("dimensions") ?? "dimensions",
      semanticToHeader.get("material") ?? "material",
    ]),
  );

  return { headers, rows };
}

function parseGroupedItemBlocks(
  matrix: string[][],
  blockRules?: OrdersWorkbookBlockRules,
): { headers: string[]; rows: ParsedOrdersWorkbook["rows"] } {
  const rows: ParsedOrdersWorkbook["rows"] = [];

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const currentRow = matrix[rowIndex];
    const article = parseArticleFromRow(currentRow, blockRules);
    if (!article) {
      continue;
    }

    const position = parsePositionFromRow(currentRow, blockRules) ?? "";
    const dimensions = parseDimensionsFromRow(currentRow);
    const qty = parseQtyFromGroupedBlock(matrix, rowIndex, blockRules);
    const area = parseAreaFromGroupedBlock(matrix, rowIndex);

    rows.push({
      pozicija: position,
      position,
      artikuls: article,
      sku: article,
      item_name: article,
      artikulu_skaits: qty,
      qty,
      izmeri: dimensions,
      dimensions,
      kvm: area.kvm,
      kvm_total: area.kvm_total,
    });
  }

  return {
    headers: [
      "pozicija",
      "artikuls",
      "artikulu_skaits",
      "izmeri",
      "kvm",
      "kvm_total",
    ],
    rows,
  };
}

export async function parseOrdersWorkbookDetailed(
  file: File,
  options?: {
    target?: "items" | "bom";
    blockRules?: OrdersWorkbookBlockRules;
  },
): Promise<ParsedOrdersWorkbook> {
  const lowerName = file.name.toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0] ?? "Sheet1";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetName, headers: [], rows: [], parseMode: "flat_table" };
  }

  const matrix = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    })
    .map((row) => row.map((cell) => normalizeCellValue(cell)));

  const groupedParse =
    options?.target === "bom"
      ? parseBlockStructuredComponentRows(matrix, options?.blockRules)
      : parseGroupedItemBlocks(matrix, options?.blockRules);
  if (groupedParse.rows.length > 0) {
    return {
      sheetName,
      headers: groupedParse.headers,
      rows: groupedParse.rows,
      parseMode: "grouped_blocks",
    };
  }

  const groupedComponentParse = parseBlockStructuredComponentRows(
    matrix,
    options?.blockRules,
  );
  if (groupedComponentParse.rows.length > 0) {
    return {
      sheetName,
      headers: groupedComponentParse.headers,
      rows: groupedComponentParse.rows,
      parseMode: "grouped_blocks",
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const headers = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row).map((key) => key.trim()))),
  );
  return { sheetName, headers, rows, parseMode: "flat_table" };
}

export async function parseOrdersWorkbook(
  file: File,
): Promise<Record<string, unknown>[]> {
  const parsed = await parseOrdersWorkbookDetailed(file);
  return parsed.rows;
}
