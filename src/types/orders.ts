export type OrderStatus =
  | "draft"
  | "ready_for_engineering"
  | "in_engineering"
  | "engineering_blocked"
  | "ready_for_production"
  | "in_production"
  | "done";

export type ExternalJobStatus =
  | "requested"
  | "ordered"
  | "in_progress"
  | "delivered"
  | "approved"
  | "cancelled";

export type ExternalJobFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "toggle";

export type ExternalJobFieldScope = "manual" | "portal_response";
export type ExternalJobFieldRole = "none" | "planned_price" | "invoice_price";

export interface ExternalJobField {
  id: string;
  key: string;
  label: string;
  fieldType: ExternalJobFieldType;
  scope?: ExternalJobFieldScope;
  fieldRole?: ExternalJobFieldRole;
  unit?: string;
  options?: string[];
  aiAliases?: string[];
  aiEnabled?: boolean;
  aiMatchOnly?: boolean;
  showInTable?: boolean;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ExternalJobFieldValue {
  fieldId: string;
  value: unknown;
}

export interface OrderAttachment {
  id: string;
  name: string;
  url?: string;
  addedBy: string;
  addedByRole?: string;
  createdAt: string;
  size?: number;
  mimeType?: string;
  category?: string;
}

export interface ExternalJobAttachment {
  id: string;
  name: string;
  url?: string;
  addedBy: string;
  addedByRole?: string;
  createdAt: string;
  size?: number;
  mimeType?: string;
  category?: string;
}

export interface ExternalJobStatusEntry {
  id: string;
  status: ExternalJobStatus;
  changedBy: string;
  changedByRole?: string;
  changedAt: string;
}

export interface OrderComment {
  id: string;
  message: string;
  authorId?: string;
  author: string;
  authorRole?: string;
  createdAt: string;
}

export interface OrderStatusEntry {
  id: string;
  status: OrderStatus;
  changedBy: string;
  changedByRole?: string;
  changedAt: string;
}

export interface ExternalJob {
  id: string;
  orderId: string;
  partnerId?: string;
  partnerName: string;
  partnerEmail?: string;
  externalOrderNumber: string;
  quantity?: number;
  dueDate: string;
  status: ExternalJobStatus;
  requestMode?: "manual" | "partner_portal";
  partnerRequestComment?: string;
  partnerRequestSentAt?: string;
  partnerRequestViewedAt?: string;
  partnerResponseSubmittedAt?: string;
  partnerResponseOrderNumber?: string;
  partnerResponseDueDate?: string;
  partnerResponseNote?: string;
  deliveryNoteNo?: string;
  receivedAt?: string;
  receivedBy?: string;
  attachments?: ExternalJobAttachment[];
  statusHistory?: ExternalJobStatusEntry[];
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  productName?: string;
  quantity?: number;
  hierarchy?: Record<string, string>;
  hierarchyLabels?: Record<string, string>;
  dueDate: string; // ISO date string
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
  statusDisplay?: OrderStatus;
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  assignedEngineerAt?: string;
  assignedEngineerAvatarUrl?: string;
  assignedManagerId?: string;
  assignedManagerName?: string;
  assignedManagerAt?: string;
  assignedManagerAvatarUrl?: string;
  statusChangedBy?: string;
  statusChangedByRole?: string;
  statusChangedAt?: string;
  checklist?: Record<string, boolean>;
  statusHistory?: OrderStatusEntry[];
  source?: "manual" | "accounting" | "excel";
  externalId?: string;
  sourcePayload?: Record<string, unknown>;
  syncedAt?: string;
  productionDurationMinutes?: number;
  attachments?: OrderAttachment[];
  comments?: OrderComment[];
  attachmentCount?: number;
  commentCount?: number;
  externalJobs?: ExternalJob[];
}
