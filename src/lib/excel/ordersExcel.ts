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
    ...levelNames.map((name) => `Hierarchy:${name}`),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
  const array = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function parseOrdersWorkbook(
  file: File,
): Promise<Record<string, unknown>[]> {
  const lowerName = file.name.toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}
