import type {
  BatchRunRow,
  OrderAttachmentRow,
  ProductionItemRow,
  ProductionPriority,
  ProductionStatus,
  ProductionStatusEventRow,
  ReadyOrderRow,
} from "@/types/production";

export type ProductionJobOrderItem = {
  id: string;
  order_id: string;
  position?: string | null;
  item_name: string;
  item_type?: string | null;
  qty: number | null;
  material: string | null;
  dimensions?: string | null;
  sku?: string | null;
  uom?: string | null;
  revision?: string | null;
  lifecycle_status?: string | null;
  supply_type?: string | null;
  item_group?: string | null;
  route_code?: string | null;
  quality_class?: string | null;
  production_notes?: string | null;
  attributes?: Record<string, unknown> | null;
};

export type ProductionJobBomLine = {
  id: string;
  order_item_id: string;
  component_code: string | null;
  component_name: string;
  component_type: string;
  qty: number;
  unit: string;
  length: number | null;
  width: number | null;
  height: number | null;
  source_kind: string;
};

export type ProductionJobItemDocument = {
  order_item_id: string;
  order_attachment_id: string;
  role: "source" | "production" | "reference";
  sort_order: number;
};

export type ProductionJobKpis = {
  totalUnits: number;
  completedUnits: number;
  totalRuns: number;
  completedRuns: number;
  blockedRuns: number;
  totalMinutes: number;
  dueTodayOrLate: boolean;
  progressPercent: number;
};

export function computeProductionJobKpis(params: {
  order: ReadyOrderRow | null;
  productionItems: ProductionItemRow[];
  batchRuns: BatchRunRow[];
  todayIso: string;
}): ProductionJobKpis {
  const { order, productionItems, batchRuns, todayIso } = params;
  const totalUnits = productionItems.reduce(
    (sum, item) => sum + Number(item.qty ?? 0),
    0,
  );
  const completedUnits = productionItems
    .filter((item) => item.status === "done")
    .reduce((sum, item) => sum + Number(item.qty ?? 0), 0);
  const totalRuns = batchRuns.length;
  const completedRuns = batchRuns.filter((run) => run.status === "done").length;
  const blockedRuns = batchRuns.filter((run) => run.status === "blocked").length;
  const totalMinutes = productionItems.reduce(
    (sum, item) => sum + Number(item.duration_minutes ?? 0),
    0,
  );
  const progressBase = totalRuns > 0 ? totalRuns : totalUnits;
  const progressDone = totalRuns > 0 ? completedRuns : completedUnits;
  const progressPercent =
    progressBase > 0 ? Math.round((progressDone / progressBase) * 100) : 0;

  return {
    totalUnits,
    completedUnits,
    totalRuns,
    completedRuns,
    blockedRuns,
    totalMinutes,
    dueTodayOrLate: Boolean(
      (order?.production_due_date ?? order?.due_date) &&
        (order?.production_due_date ?? order?.due_date ?? "") <= todayIso,
    ),
    progressPercent,
  };
}

export function formatProductionDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatProductionDate(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export function priorityTone(priority: ProductionPriority | null | undefined) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

export function statusLabelTone(status: ProductionStatus) {
  if (status === "blocked") return "status-blocked";
  if (status === "paused") return "status-paused";
  if (status === "pending") return "status-pending";
  if (status === "in_progress") return "status-in_engineering";
  if (status === "done") return "status-ready_for_production";
  return "status-draft";
}

export function groupBomLinesByOrderItem(lines: ProductionJobBomLine[]) {
  const map = new Map<string, ProductionJobBomLine[]>();
  lines.forEach((line) => {
    const current = map.get(line.order_item_id) ?? [];
    current.push(line);
    map.set(line.order_item_id, current);
  });
  return map;
}

export function groupDocumentsByOrderItem(docs: ProductionJobItemDocument[]) {
  const map = new Map<string, ProductionJobItemDocument[]>();
  docs.forEach((doc) => {
    const current = map.get(doc.order_item_id) ?? [];
    current.push(doc);
    map.set(doc.order_item_id, current);
  });
  return map;
}

export function groupAttachmentsById(attachments: OrderAttachmentRow[]) {
  return new Map(attachments.map((attachment) => [attachment.id, attachment]));
}

export function sortBatchRuns(runs: BatchRunRow[]) {
  return [...runs].sort((a, b) => {
    if (a.step_index !== b.step_index) {
      return a.step_index - b.step_index;
    }
    const dateA = a.planned_date ?? "";
    const dateB = b.planned_date ?? "";
    return dateA.localeCompare(dateB);
  });
}

export function sortActivity(events: ProductionStatusEventRow[]) {
  return [...events].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}
