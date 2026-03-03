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
