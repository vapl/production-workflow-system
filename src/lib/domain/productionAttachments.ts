import type { OrderAttachmentRow } from "@/types/production";

const PRODUCTION_ATTACHMENT_CATEGORIES = new Set([
  "technical_docs",
  "production_report",
]);

export function isProductionAttachment(
  attachment: Pick<OrderAttachmentRow, "category"> | null | undefined,
) {
  if (!attachment?.category) {
    return false;
  }
  return PRODUCTION_ATTACHMENT_CATEGORIES.has(attachment.category);
}

export function filterProductionAttachments<T extends Pick<OrderAttachmentRow, "category">>(
  attachments: T[],
) {
  return attachments.filter((attachment) => isProductionAttachment(attachment));
}
