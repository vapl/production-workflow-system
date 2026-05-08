export type ProductionPriority = "low" | "normal" | "high" | "urgent";

export type ProductionStatus =
  | "queued"
  | "pending"
  | "in_progress"
  | "paused"
  | "blocked"
  | "done";

export type StationTrackingMode =
  | "construction_level"
  | "order_level"
  | "receipt_only";

export type JoinedProductionOrder = {
  order_number: string | null;
  due_date: string | null;
  production_due_date?: string | null;
  priority: ProductionPriority | null;
  customer_name: string | null;
  status?: string | null;
};

export type ProductionStation = {
  id: string;
  name: string;
  sortOrder: number;
  trackingMode?: StationTrackingMode;
};

export type ProductionItemRow = {
  id: string;
  order_id: string;
  batch_code: string;
  item_name: string;
  qty: number;
  material: string | null;
  status: ProductionStatus;
  station_id: string | null;
  meta?: Record<string, unknown> | null;
  started_at?: string | null;
  done_at?: string | null;
  duration_minutes?: number | null;
  created_at?: string | null;
  orders?: JoinedProductionOrder | null;
};

export type ReadyOrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  due_date: string;
  production_due_date?: string | null;
  priority: ProductionPriority;
  status?: string | null;
  quantity: number | null;
  product_name: string | null;
  production_duration_minutes?: number | null;
};

export type OrderAttachmentRow = {
  id: string;
  order_id: string;
  name: string | null;
  url: string | null;
  category?: string | null;
  created_at: string | null;
  size?: number | null;
  mime_type?: string | null;
};

export type BatchRunRow = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  route_key: string;
  step_index: number;
  status: ProductionStatus;
  blocked_reason?: string | null;
  blocked_reason_id?: string | null;
  planned_date?: string | null;
  started_at: string | null;
  done_at: string | null;
  duration_minutes?: number | null;
  orders?: JoinedProductionOrder | null;
};

export type StationDependencyRow = {
  id: string;
  station_id: string;
  depends_on_station_id: string;
};

export type OperatorQueueItem = {
  id: string;
  runIds: string[];
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: ProductionPriority;
  status: BatchRunRow["status"];
  plannedDate: string | null;
  batchCode: string;
  totalQty: number;
  completedQty?: number;
  material: string;
  attachments: OrderAttachmentRow[];
  startedAt?: string | null;
  doneAt?: string | null;
  durationMinutes?: number | null;
  items: ProductionItemRow[];
  trackingMode: StationTrackingMode;
  unitType?: string | null;
  unitName?: string | null;
};

export type ProductionStatusEventRow = {
  id: string;
  production_item_id: string | null;
  batch_run_id?: string | null;
  order_id?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
  note?: string | null;
  created_at?: string | null;
  actor_user_id?: string | null;
};
