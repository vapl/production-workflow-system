import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import type { ProductionSplitRow } from "@/lib/domain/buildProductionSplitRows";
import { getOrderInputTableRowId } from "@/lib/domain/orderInputTableRows";

type ProductionQrCodeRow = {
  order_id: string;
  field_id: string;
  row_index: number;
  source_row_id?: string | null;
  token: string;
};

export function getProductionQrFieldValue(
  row: ProductionSplitRow,
  fieldKey: string,
  formatDateInput: (value: string) => string,
) {
  switch (fieldKey) {
    case "order_number":
      return row.orderNumber;
    case "customer_name":
      return row.customerName;
    case "batch_code":
      return row.batchCode;
    case "item_name":
      return row.itemName;
    case "qty":
      return String(row.qty ?? "");
    case "material":
      return row.material;
    case "field_label":
      return row.fieldLabel;
    case "due_date":
      return row.dueDate ? formatDateInput(row.dueDate) : "";
    default:
      return "";
  }
}

export async function prepareProductionQrRows(params: {
  client: SupabaseClient;
  rows: ProductionSplitRow[];
  userId?: string | null;
  isAuthenticated: boolean;
  baseUrl: string;
}) {
  const { client, rows, userId, isAuthenticated, baseUrl } = params;
  if (!isAuthenticated) {
    return { withTokens: [] as Array<{ row: ProductionSplitRow; token: string }>, imageMap: {} as Record<string, string> };
  }

  const orderIds = Array.from(new Set(rows.map((row) => row.orderId)));

  const { data: existingRows, error: existingError } = await client
    .from("production_qr_codes")
    .select("order_id, field_id, row_index, source_row_id, token")
    .in("order_id", orderIds);
  if (existingError) {
    throw new Error(existingError.message);
  }

  const rowLookupKeys = (row: ProductionSplitRow) => {
    const sourceRowId = getOrderInputTableRowId(row.rawRow);
    const keys = [`${row.orderId}:${row.fieldId}:${row.rowIndex}`];
    if (sourceRowId) {
      keys.unshift(`${row.orderId}:${sourceRowId}`);
    }
    return keys;
  };

  const existingMap = new Map<string, string>();
  const existingList = (existingRows as ProductionQrCodeRow[]) ?? [];
  existingList.forEach((entry) => {
    const legacyKey = `${entry.order_id}:${entry.field_id}:${entry.row_index}`;
    existingMap.set(legacyKey, entry.token);
    if (entry.source_row_id && entry.source_row_id.trim().length > 0) {
      existingMap.set(`${entry.order_id}:${entry.source_row_id}`, entry.token);
    }
  });

  const missing = rows.filter((row) => {
    const keys = rowLookupKeys(row);
    return !keys.some((key) => existingMap.has(key));
  });

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await client
      .from("production_qr_codes")
      .insert(
        missing.map((row) => ({
          order_id: row.orderId,
          field_id: row.fieldId,
          row_index: row.rowIndex,
          source_row_id: getOrderInputTableRowId(row.rawRow),
          created_by: userId ?? null,
        })),
      )
      .select("order_id, field_id, row_index, source_row_id, token");
    if (insertError) {
      throw new Error(insertError.message);
    }
    const insertedList = (inserted as ProductionQrCodeRow[]) ?? [];
    insertedList.forEach((entry) => {
      const legacyKey = `${entry.order_id}:${entry.field_id}:${entry.row_index}`;
      existingMap.set(legacyKey, entry.token);
      if (entry.source_row_id && entry.source_row_id.trim().length > 0) {
        existingMap.set(`${entry.order_id}:${entry.source_row_id}`, entry.token);
      }
    });
  }

  const withTokens = rows
    .map((row) => {
      const token = rowLookupKeys(row)
        .map((key) => existingMap.get(key))
        .find(Boolean);
      return token ? { row, token } : null;
    })
    .filter(Boolean) as Array<{ row: ProductionSplitRow; token: string }>;

  const images = await Promise.all(
    withTokens.map(async (entry) => {
      const url = `${baseUrl}/qr/${entry.token}`;
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: 256,
      });
      return { token: entry.token, dataUrl };
    }),
  );

  const imageMap: Record<string, string> = {};
  images.forEach((img) => {
    imageMap[img.token] = img.dataUrl;
  });

  return { withTokens, imageMap };
}
