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
};

function normalizeHeaderToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9#]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCellValue(value: unknown): string {
  return String(value ?? "").trim();
}

type HeaderMatch = {
  rowIndex: number;
  columnByKey: Partial<Record<"position" | "item_name" | "material" | "qty" | "fl" | "fw" | "thk", number>>;
};

const HEADER_ALIASES: Record<keyof HeaderMatch["columnByKey"], string[]> = {
  position: ["position", "pozicija", "poz", "pozicija_nr", "artikuls", "artikuls_pozicija"],
  item_name: ["nosaukums", "name", "item_name", "furnitura", "viras", "atvilktnes", "gaismas", "rokturi", "profili"],
  material: ["materials", "materials_apdare", "material", "materials_apdare", "materials_apdare_krasa", "materials_apdare_krasa"],
  qty: ["#", "qty", "quantity", "daudzums", "skaits", "garums"],
  fl: ["fl", "length", "garums"],
  fw: ["fw", "width", "platums"],
  thk: ["thk", "thickness", "biezums"],
};

function parsePositionFromRow(cells: string[]): string | null {
  const joined = cells.join(" ");
  const match = joined.match(/poz[īi]cija\s*[:\-]?\s*([a-z0-9\-_.]+)/i);
  return match?.[1]?.trim() ?? null;
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
      matches.push({ rowIndex, columnByKey });
    }
  });

  return matches;
}

function parseBlockStructuredRows(matrix: string[][]): ParsedOrdersWorkbook["rows"] {
  const headerRows = detectHeaderRows(matrix);
  if (headerRows.length === 0) {
    return [];
  }

  const rows: ParsedOrdersWorkbook["rows"] = [];
  let activePosition = "";

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const currentRow = matrix[rowIndex];
    const parsedPosition = parsePositionFromRow(currentRow);
    if (parsedPosition) {
      activePosition = parsedPosition;
    }

    const header = headerRows.find((item) => item.rowIndex === rowIndex);
    if (!header) {
      continue;
    }

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
        position: explicitPosition || activePosition,
        item_type: "",
        item_name: itemName,
        qty,
        dimensions,
        material,
      });
    }
  }

  return rows;
}

export async function parseOrdersWorkbookDetailed(
  file: File,
): Promise<ParsedOrdersWorkbook> {
  const lowerName = file.name.toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0] ?? "Sheet1";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetName, headers: [], rows: [] };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }).map((row) => row.map((cell) => normalizeCellValue(cell)));

  const structuredRows = parseBlockStructuredRows(matrix);
  if (structuredRows.length > 0) {
    return {
      sheetName,
      headers: ["position", "item_type", "item_name", "qty", "dimensions", "material"],
      rows: structuredRows,
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const headers = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row).map((key) => key.trim()))),
  );
  return { sheetName, headers, rows };
}

export async function parseOrdersWorkbook(
  file: File,
): Promise<Record<string, unknown>[]> {
  const parsed = await parseOrdersWorkbookDetailed(file);
  return parsed.rows;
}
