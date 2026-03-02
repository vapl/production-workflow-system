import type { UserRole } from "@/contexts/UserContext";
import type { Order, OrderStatus } from "@/types/orders";

type PermissionUser = {
  role: UserRole;
  isAdmin?: boolean;
  isOwner?: boolean;
};

export type OrderInlineEditableField =
  | "customerName"
  | "dueDate"
  | "quantity"
  | "priority"
  | "assignedEngineer"
  | "assignedManager"
  | "deliveryAddress"
  | "customerPhone"
  | `orderField:${string}`;

function isAdminOverride(user: PermissionUser) {
  return Boolean(user.isAdmin || user.isOwner || user.role === "Admin");
}

export function isSalesEditableOrderStatus(status: OrderStatus) {
  return status === "draft" || status === "ready_for_engineering";
}

export function isEngineeringEditableOrderStatus(status: OrderStatus) {
  return (
    status === "ready_for_engineering" ||
    status === "in_engineering" ||
    status === "engineering_blocked" ||
    status === "ready_for_production"
  );
}

export function isOrderReadOnly(status: OrderStatus) {
  return status === "done";
}

export function canEditOrderCoreField(
  user: PermissionUser,
  status: OrderStatus,
) {
  if (isOrderReadOnly(status)) {
    return false;
  }
  if (isAdminOverride(user)) {
    return true;
  }
  return user.role === "Sales" && isSalesEditableOrderStatus(status);
}

export function canEditOrderPriority(
  user: PermissionUser,
  status: OrderStatus,
) {
  if (isOrderReadOnly(status)) {
    return false;
  }
  if (isAdminOverride(user)) {
    return true;
  }
  return (
    (user.role === "Sales" && isSalesEditableOrderStatus(status)) ||
    user.role === "Production planner"
  );
}

export function canEditOrderAssigneeField(
  user: PermissionUser,
  status: OrderStatus,
  field: "assignedEngineer" | "assignedManager",
) {
  if (isOrderReadOnly(status)) {
    return false;
  }
  if (isAdminOverride(user)) {
    return true;
  }
  if (field === "assignedManager") {
    return user.role === "Sales" && isSalesEditableOrderStatus(status);
  }
  return user.role === "Engineering" && isEngineeringEditableOrderStatus(status);
}

export function canEditOrderCustomField(
  user: PermissionUser,
  status: OrderStatus,
) {
  if (isOrderReadOnly(status)) {
    return false;
  }
  if (isAdminOverride(user)) {
    return true;
  }
  return user.role === "Sales" && isSalesEditableOrderStatus(status);
}

export function canEditOrderInlineField(
  user: PermissionUser,
  status: OrderStatus,
  fieldId: OrderInlineEditableField,
) {
  if (
    fieldId === "customerName" ||
    fieldId === "dueDate" ||
    fieldId === "quantity" ||
    fieldId === "deliveryAddress" ||
    fieldId === "customerPhone"
  ) {
    return canEditOrderCoreField(user, status);
  }
  if (fieldId === "priority") {
    return canEditOrderPriority(user, status);
  }
  if (fieldId === "assignedEngineer" || fieldId === "assignedManager") {
    return canEditOrderAssigneeField(user, status, fieldId);
  }
  if (fieldId.startsWith("orderField:")) {
    return canEditOrderCustomField(user, status);
  }
  return false;
}

export function canEditOrderInputs(
  user: PermissionUser,
  status: OrderStatus,
) {
  if (isOrderReadOnly(status)) {
    return false;
  }
  if (isAdminOverride(user)) {
    return true;
  }
  return user.role === "Engineering" && isEngineeringEditableOrderStatus(status);
}

export function canEditOrderViaModal(user: PermissionUser, status: OrderStatus) {
  return canEditOrderCoreField(user, status);
}

export function canDeleteOrder(user: PermissionUser, status: OrderStatus) {
  if (isAdminOverride(user)) {
    return true;
  }
  return user.role === "Sales" && status === "draft";
}

export function canEditOrderInstanceViaModal(
  user: PermissionUser,
  order: Pick<Order, "status">,
) {
  return canEditOrderViaModal(user, order.status);
}

export function canDeleteOrderInstance(
  user: PermissionUser,
  order: Pick<Order, "status">,
) {
  return canDeleteOrder(user, order.status);
}
