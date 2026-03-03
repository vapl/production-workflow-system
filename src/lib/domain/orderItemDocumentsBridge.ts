import {
  ORDER_INPUT_TABLE_ROW_ATTACHMENT_IDS_KEY,
  getOrderInputTableRowId,
} from "@/lib/domain/orderInputTableRows";
import type { OrderItem } from "@/types/orderItems";
import type { OrderItemDocumentRole } from "@/types/orderItemDocuments";

export function getOrderInputTableRowAttachmentIds(row: unknown): string[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const raw = (row as Record<string, unknown>)[
    ORDER_INPUT_TABLE_ROW_ATTACHMENT_IDS_KEY
  ];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export function attachOrderInputTableRowDocuments(
  row: Record<string, unknown>,
  attachmentIds: string[],
) {
  const normalized = Array.from(
    new Set(
      attachmentIds.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ),
    ),
  );
  if (normalized.length === 0) {
    return row;
  }
  return {
    ...row,
    [ORDER_INPUT_TABLE_ROW_ATTACHMENT_IDS_KEY]: normalized,
  };
}

export function buildOrderItemDocumentsFromTableField(params: {
  rows: unknown;
  orderItems: OrderItem[];
  role?: OrderItemDocumentRole;
}) {
  const { rows, orderItems, role = "source" } = params;
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const itemMap = new Map(
    orderItems.map((item) => [item.sourceRowId, item] as const),
  );

  return rows.flatMap((row) => {
    const sourceRowId = getOrderInputTableRowId(row);
    if (!sourceRowId) {
      return [];
    }
    const item = itemMap.get(sourceRowId);
    if (!item) {
      return [];
    }
    const attachmentIds = getOrderInputTableRowAttachmentIds(row);
    return attachmentIds.map((attachmentId, index) => ({
      order_item_id: item.id,
      order_attachment_id: attachmentId,
      role,
      sort_order: index,
    }));
  });
}

export function isMissingOrderItemDocumentsSchema(error?: {
  code?: string | null;
  message?: string | null;
} | null) {
  if (!error) {
    return false;
  }

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "pgrst205" ||
    code === "42p01" ||
    message.includes("order_item_documents") ||
    message.includes("schema cache")
  );
}
