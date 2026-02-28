"use client";

import { ORDER_CORE_FIELDS } from "@/lib/domain/orderCoreFields";
import type { OrderStatus } from "@/types/orders";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const defaultCoreLabels = new Map(
  ORDER_CORE_FIELDS.map((field) => [field.key, field.label]),
);

const coreFieldTranslationKeys: Record<string, string> = {
  order_number: "orders.page.orderNumberShort",
  customer_name: "orders.page.customer",
  quantity: "orders.page.quantity",
  due_date: "orders.page.dueDate",
  engineer: "orders.page.engineerFallback",
  manager: "orders.page.managerFallback",
  priority: "orders.page.priority",
  status: "orders.page.status",
  actions: "orders.page.actions",
  delivery_address: "orders.page.deliveryAddress",
  customer_phone: "orders.page.customerPhone",
};

const defaultWorkflowStatusLabels: Record<OrderStatus, string> = {
  draft: "Draft",
  ready_for_engineering: "Ready for eng.",
  in_engineering: "In eng.",
  engineering_blocked: "Eng. blocked",
  ready_for_production: "Ready for prod.",
  in_production: "In prod.",
  done: "Done",
};

export function getOrderFieldLabel(
  fieldKey: string,
  t: Translate,
  fallbackName?: string,
) {
  const translationKey = coreFieldTranslationKeys[fieldKey];
  if (!translationKey) {
    return fallbackName ?? fieldKey;
  }
  const defaultCoreLabel = defaultCoreLabels.get(fieldKey);
  if (
    fallbackName &&
    defaultCoreLabel &&
    fallbackName.trim().toLowerCase() !== defaultCoreLabel.trim().toLowerCase()
  ) {
    return fallbackName;
  }
  return t(translationKey);
}

export function getOrderStatusLabel(
  status: OrderStatus,
  t: Translate,
  fallbackLabel?: string,
) {
  const defaultLabel = defaultWorkflowStatusLabels[status];
  if (
    fallbackLabel &&
    fallbackLabel.trim().toLowerCase() !== defaultLabel.trim().toLowerCase()
  ) {
    return fallbackLabel;
  }
  return t(`settings.options.workflowStatus.${status}`);
}

export function getOrderPriorityLabel(
  priority: "low" | "normal" | "high" | "urgent",
  t: Translate,
) {
  return t(`orders.modal.priority.${priority}`);
}
