"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { Input } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { QrScannerModal } from "@/components/qr/QrScannerModal";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { formatDate } from "@/lib/domain/formatters";
import type { ProductionJobItemDocument } from "@/lib/domain/productionJobDetail";
import { filterProductionAttachments } from "@/lib/domain/productionAttachments";
import {
  collectRunItemIds,
  publishProductionLiveEvent,
} from "@/lib/domain/productionLive";
import {
  getProductionWorkSessionOverlapMinutes,
  listActiveProductionWorkSessions,
  startProductionWorkSession,
  stopProductionWorkSession,
  stopProductionWorkSessions,
} from "@/lib/domain/productionWorkSessions";
import {
  getProductionItemCompletedQty,
  getProductionItemQuantity,
} from "@/lib/domain/productionUnitProgress";
import { isOrderProductionComplete } from "@/lib/domain/productionCompletion";
import { transitionBatchRunStatus } from "@/lib/domain/transitionBatchRunStatus";
import { type ResolveScanTargetResult } from "@/lib/qr/resolveScanTarget";
import {
  computeWorkedMinutesBreakdown,
  computeWorkedSecondsBreakdown,
  isWithinWorkingSchedule,
  parseWorkingCalendar,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n/useI18n";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import type {
  BatchRunRow,
  OperatorQueueItem as QueueItem,
  OrderAttachmentRow,
  ProductionItemRow,
  ProductionPriority as Priority,
  ProductionStation as Station,
  ProductionWorkSessionRow,
  StationDependencyRow,
  StationTrackingMode,
} from "@/types/production";
import {
  BanIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  LogOutIcon,
  PauseIcon,
  PlayIcon,
  QrCodeIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UserCircle2Icon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Clock3Icon,
  ActivityIcon,
  XIcon,
} from "lucide-react";

function getProductionItemRowIndex(item: ProductionItemRow) {
  if (!item.meta || typeof item.meta !== "object") {
    return null;
  }
  const raw = (item.meta as Record<string, unknown>).rowIndex;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getProductionItemRowKey(item: ProductionItemRow) {
  if (!item.meta || typeof item.meta !== "object") {
    return null;
  }
  const raw = (item.meta as Record<string, unknown>).rowKey;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function UserAvatar({
  avatarUrl,
  name,
  fallback,
  sizeClass,
}: {
  avatarUrl?: string | null;
  name: string;
  fallback: string;
  sizeClass: string;
}) {
  if (avatarUrl) {
    return (
      <div className={`relative overflow-hidden rounded-full ${sizeClass}`}>
        <Image
          src={avatarUrl}
          alt={name}
          fill
          sizes="48px"
          unoptimized
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground ${sizeClass}`}
    >
      {fallback}
    </div>
  );
}

type PendingAction = {
  itemId: string;
  action: "in_progress" | "done" | "paused" | "blocked";
};
type OrderItemLinkRow = {
  id: string;
  source_row_id: string;
  position?: string | null;
  qty?: number | null;
};
type ProductionDisplayFieldConfig = {
  key: string;
  label: string;
  sortOrder: number;
};
type OperatorProfileNameRow = {
  id: string;
  full_name: string | null;
};
type OperatorConfigNameRow = {
  user_id: string | null;
  name: string | null;
};
type OperatorWorkStatusGroups = {
  working: Set<string>;
  paused: Set<string>;
  blocked: Set<string>;
};
type PendingQuickAction = {
  orderId: string;
  rowKey: string | null;
  rowIndex: number | null;
};
type PendingRunAction = {
  runId: string;
  action: "in_progress" | "done" | "paused" | "blocked";
};

type QueueStatusFilter = "all" | BatchRunRow["status"];

function priorityBadge(priority: Priority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function statusBadge(status: BatchRunRow["status"]) {
  if (status === "blocked") return "status-blocked";
  if (status === "paused") return "status-paused";
  if (status === "pending") return "status-pending";
  if (status === "in_progress") return "status-in_engineering";
  if (status === "done") return "status-ready_for_production";
  return "status-draft";
}

function normalizeTrackingMode(value: unknown): StationTrackingMode {
  if (value === "order_level" || value === "receipt_only") {
    return value;
  }
  return "construction_level";
}

function isFuturePlannedDate(plannedDate: string | null | undefined) {
  if (!plannedDate) return false;
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return plannedDate > today;
}

function getProductionItemSourceKey(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const sourceRowId =
    meta && typeof meta.sourceRowId === "string" ? meta.sourceRowId : undefined;
  const rowKey =
    meta && typeof meta.rowKey === "string" ? meta.rowKey : undefined;
  return sourceRowId ?? rowKey ?? null;
}

function getProductionItemMetaRowValue(item: ProductionItemRow, key: string) {
  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const value = row?.[key] ?? meta?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeProductionMetaKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/№/g, "no")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getProductionItemMetaPosition(item: ProductionItemRow) {
  const direct = getProductionItemMetaRowValue(item, "position");
  if (direct) {
    return direct;
  }

  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const candidates = [row, meta].filter(
    (value): value is Record<string, unknown> => Boolean(value),
  );
  const positionKeys = new Set([
    "position",
    "pos",
    "pozicija",
    "pozicija",
    "line_no",
    "line",
    "row_no",
    "rindas_nr",
    "no_stroki",
    "stroki",
  ]);

  for (const source of candidates) {
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = normalizeProductionMetaKey(rawKey);
      const isPositionKey =
        positionKeys.has(key) ||
        key.includes("position") ||
        key.includes("pozic") ||
        key.includes("line_no") ||
        key.includes("rindas") ||
        key.includes("stroki");
      if (!isPositionKey) {
        continue;
      }
      const value = String(rawValue ?? "").trim();
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function getBatchRunSourceKey(run: Pick<BatchRunRow, "route_key">) {
  return run.route_key && run.route_key !== "default" ? run.route_key : null;
}

function getOperatorVisibleCompletedQty(item: ProductionItemRow) {
  const quantity = getProductionItemQuantity(item);
  const completedQty = getProductionItemCompletedQty(item);
  if (item.status !== "done" && completedQty >= quantity) {
    return 0;
  }
  return completedQty;
}

function getOperatorVisibleRemainingQty(item: ProductionItemRow) {
  return Math.max(
    0,
    getProductionItemQuantity(item) - getOperatorVisibleCompletedQty(item),
  );
}

function getOperatorVisibleItemsProgress(items: ProductionItemRow[]) {
  return items.reduce(
    (acc, item) => {
      acc.totalQty += getProductionItemQuantity(item);
      acc.completedQty += getOperatorVisibleCompletedQty(item);
      return acc;
    },
    { completedQty: 0, totalQty: 0 },
  );
}

function matchesProductionItemToRun(
  item: ProductionItemRow,
  run: Pick<
    BatchRunRow,
    "order_id" | "station_id" | "batch_code" | "route_key"
  >,
) {
  if (item.order_id !== run.order_id) {
    return false;
  }
  const itemSourceKey = getProductionItemSourceKey(item);
  const runSourceKey = getBatchRunSourceKey(run);
  if (itemSourceKey && runSourceKey) {
    return itemSourceKey === runSourceKey;
  }
  if (item.station_id && item.station_id !== run.station_id) {
    return false;
  }
  return item.batch_code === run.batch_code;
}

type WorkSessionScopeSummary = {
  activeCount: number;
  totalMinutes: number;
  totalSeconds: number;
  elapsedSeconds: number;
  earliestStartedAt: string | null;
  latestStoppedAt: string | null;
  latestStatus: BatchRunRow["status"] | null;
};

function getWorkSessionScopeKey(
  batchRunId: string,
  productionItemId?: string | null,
) {
  return `${batchRunId}::${productionItemId ?? "*"}`;
}

function getWorkSessionSortTime(session: ProductionWorkSessionRow) {
  return Date.parse(
    session.updated_at ??
      session.stopped_at ??
      session.started_at ??
      "1970-01-01T00:00:00.000Z",
  );
}

function getConstructionWorkSessionLogicalKey(
  run: Pick<
    BatchRunRow,
    "order_id" | "station_id" | "batch_code" | "route_key"
  >,
  item: ProductionItemRow,
) {
  const runSourceKey = getBatchRunSourceKey(run) ?? "";
  return [
    run.order_id,
    run.station_id ?? "",
    run.batch_code ?? "",
    runSourceKey,
    getItemGroupKey(item),
  ].join("|");
}

function createOperatorWorkStatusGroups(): OperatorWorkStatusGroups {
  return {
    working: new Set<string>(),
    paused: new Set<string>(),
    blocked: new Set<string>(),
  };
}

function addOperatorWorkStatus(
  groups: OperatorWorkStatusGroups,
  operatorId: string,
  status: BatchRunRow["status"] | null,
) {
  if (status === "in_progress") {
    groups.working.add(operatorId);
  } else if (status === "paused") {
    groups.paused.add(operatorId);
  } else if (status === "blocked") {
    groups.blocked.add(operatorId);
  }
}

function mergeOperatorWorkStatusGroups(
  target: OperatorWorkStatusGroups,
  source: OperatorWorkStatusGroups | null | undefined,
) {
  source?.working.forEach((operatorId) => target.working.add(operatorId));
  source?.paused.forEach((operatorId) => target.paused.add(operatorId));
  source?.blocked.forEach((operatorId) => target.blocked.add(operatorId));
}

function resolveConstructionItemState(
  item: ProductionItemRow,
  queueItem: Pick<QueueItem, "runIds" | "startedAt" | "doneAt">,
  batchRuns: BatchRunRow[],
  workSessionScopeSummaryByKey?: Map<string, WorkSessionScopeSummary>,
) {
  const matchedRun =
    queueItem.runIds
      .map((runId) => batchRuns.find((run) => run.id === runId))
      .filter((run): run is BatchRunRow => Boolean(run))
      .find((run) => matchesProductionItemToRun(item, run)) ?? null;
  const scopeKey = getWorkSessionScopeKey(
    matchedRun?.id ?? queueItem.runIds[0] ?? "",
    item.id,
  );
  const scopeSummary = workSessionScopeSummaryByKey?.get(scopeKey) ?? null;
  const effectiveStatus =
    item.status === "done" || matchedRun?.status === "done"
      ? "done"
      : (scopeSummary?.activeCount ?? 0) > 0
        ? "in_progress"
        : scopeSummary?.latestStatus === "blocked"
          ? "blocked"
          : scopeSummary?.latestStatus === "paused"
            ? "paused"
            : item.status === "queued" || item.status === "pending"
              ? (matchedRun?.status ?? item.status)
              : item.status;
  const effectiveStartedAt =
    scopeSummary?.earliestStartedAt ??
    item.started_at ??
    matchedRun?.started_at ??
    queueItem.startedAt ??
    null;
  const effectiveDoneAt =
    (scopeSummary?.activeCount ?? 0) > 0
      ? null
      : (scopeSummary?.latestStoppedAt ??
        item.done_at ??
        matchedRun?.done_at ??
        queueItem.doneAt ??
        null);
  return {
    matchedRun,
    scopeSummary,
    effectiveStatus,
    effectiveStartedAt,
    effectiveDoneAt,
  };
}

function getItemGroupKey(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const sourceKey = getProductionItemSourceKey(item);
  const fieldLabel =
    meta && typeof meta.fieldLabel === "string" ? meta.fieldLabel : "";
  const rowIndex =
    meta &&
    (typeof meta.rowIndex === "number" || typeof meta.rowIndex === "string")
      ? String(meta.rowIndex)
      : "";
  const fallback = `${item.item_name}|${fieldLabel}|${rowIndex}`;
  return `${item.order_id}|${sourceKey ?? fallback}`;
}

function pickLatestItem(
  current: ProductionItemRow | undefined,
  candidate: ProductionItemRow,
) {
  if (!current) return candidate;
  const currentTime = current.created_at ? Date.parse(current.created_at) : 0;
  const candidateTime = candidate.created_at
    ? Date.parse(candidate.created_at)
    : 0;
  if (candidateTime > currentTime) {
    return candidate;
  }
  return current;
}

function formatDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatLiveDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function getElapsedSeconds(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  nowMs: number,
) {
  if (!startedAt) {
    return 0;
  }
  const startMs = Date.parse(startedAt);
  const endMs = endedAt ? Date.parse(endedAt) : nowMs;
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return 0;
  }
  return Math.floor((endMs - startMs) / 1000);
}

function getWorkSessionLoadErrorMessage(error: unknown) {
  const details =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string; name?: string })
      : null;
  const message = details?.message ?? "";
  if (
    details?.name === "AbortError" ||
    message.toLowerCase().includes("abort")
  ) {
    return null;
  }
  if (details?.code === "42P01") {
    return "Production work sessions table is missing. Run the latest Supabase migration.";
  }
  return message
    ? `Failed to load activity sessions: ${message}`
    : "Failed to load activity sessions.";
}

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekRangeForDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const baseDate = new Date(year, (month ?? 1) - 1, day ?? 1);
  if (Number.isNaN(baseDate.getTime())) {
    const fallback = new Date();
    const todayIso = toIsoDateLocal(fallback);
    return { weekStart: todayIso, weekEnd: todayIso };
  }
  const dayOfWeek = baseDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStartDate = new Date(baseDate);
  weekStartDate.setDate(baseDate.getDate() + diffToMonday);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  return {
    weekStart: toIsoDateLocal(weekStartDate),
    weekEnd: toIsoDateLocal(weekEndDate),
  };
}

function getIsoWeekNumber(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // ISO: ceturtdiena nosaka nedēļas gadu
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return weekNumber;
}

const operatorPrimaryActionClass =
  "h-11 min-w-0 shrink basis-0 grow-[1.15] rounded-xl px-2.5 text-[13px] font-semibold shadow-sm sm:px-4 sm:text-sm";
const operatorSuccessActionClass =
  "h-11 min-w-0 shrink basis-0 grow rounded-xl border-emerald-200 bg-emerald-50 px-2.5 text-[13px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 hover:text-emerald-800 sm:px-4 sm:text-sm";
const operatorWarningIconActionClass =
  "size-10 shrink-0 rounded-xl border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100 hover:text-amber-800 sm:size-11";

function isSameDayIso(value: string | null | undefined, dayIso: string) {
  return Boolean(value) && String(value).slice(0, 10) === dayIso;
}

function getOverlapWorkedMinutes(params: {
  startIso: string | null | undefined;
  endIso: string | null | undefined;
  rangeStartIso: string;
  rangeEndIso: string;
  calendar: WorkingCalendar;
  nowMs: number;
}) {
  const { startIso, endIso, rangeStartIso, rangeEndIso, calendar, nowMs } =
    params;
  if (!startIso) {
    return 0;
  }
  const startMs = Date.parse(startIso);
  const effectiveEndIso = endIso ?? new Date(nowMs).toISOString();
  const endMs = Date.parse(effectiveEndIso);
  const rangeStartMs = Date.parse(rangeStartIso);
  const rangeEndMs = Date.parse(rangeEndIso);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(rangeStartMs) ||
    !Number.isFinite(rangeEndMs)
  ) {
    return 0;
  }
  const overlapStartMs = Math.max(startMs, rangeStartMs);
  const overlapEndMs = Math.min(endMs, rangeEndMs);
  if (overlapEndMs <= overlapStartMs) {
    return 0;
  }
  return computeWorkedMinutesBreakdown(
    new Date(overlapStartMs).toISOString(),
    new Date(overlapEndMs).toISOString(),
    calendar,
  ).totalMinutes;
}

function getStoragePathFromUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    return url;
  }
  return url.slice(index + marker.length);
}

function getProductionItemMetaRow(item: ProductionItemRow) {
  if (!item.meta || typeof item.meta !== "object") {
    return null;
  }
  const rawRow = (item.meta as Record<string, unknown>).row;
  return rawRow && typeof rawRow === "object"
    ? (rawRow as Record<string, unknown>)
    : null;
}

function formatProductionDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    const values = value
      .map((entry) => formatProductionDisplayValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values.join(", ") : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      formatProductionDisplayValue(record.label) ??
      formatProductionDisplayValue(record.name) ??
      formatProductionDisplayValue(record.value)
    );
  }
  return null;
}

function buildProductionDisplayEntries(
  items: ProductionItemRow[],
  fields: ProductionDisplayFieldConfig[],
  options?: { limit?: number; excludeValues?: string[] },
) {
  if (fields.length === 0 || items.length === 0) {
    return [] as Array<{ label: string; value: string }>;
  }
  const rows = items
    .map((item) => getProductionItemMetaRow(item))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  if (rows.length === 0) {
    return [] as Array<{ label: string; value: string }>;
  }
  const excluded = new Set(
    (options?.excludeValues ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const entries = fields.flatMap((field) => {
    const values = Array.from(
      new Set(
        rows
          .map((row) => formatProductionDisplayValue(row[field.key]))
          .filter((value): value is string => Boolean(value))
          .filter((value) => !excluded.has(value.trim().toLowerCase())),
      ),
    );
    if (values.length === 0) {
      return [];
    }
    return [
      {
        label: field.label,
        value:
          values.length <= 2
            ? values.join(", ")
            : `${values.slice(0, 2).join(", ")} +${values.length - 2}`,
      },
    ];
  });
  return (options?.limit ? entries.slice(0, options.limit) : entries).filter(
    (entry) => entry.value.trim().length > 0,
  );
}

function renderAttachmentIcon(attachment: OrderAttachmentRow) {
  const name = (attachment.name ?? "").toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isImage =
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp");

  if (isPdf) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <FileTextIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
      <FileIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function mergeAttachments(...lists: OrderAttachmentRow[][]) {
  const merged: OrderAttachmentRow[] = [];
  const seen = new Set<string>();
  lists.forEach((list) => {
    list.forEach((attachment) => {
      if (seen.has(attachment.id)) {
        return;
      }
      seen.add(attachment.id);
      merged.push(attachment);
    });
  });
  return merged;
}

export default function OperatorProductionPage() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const currentUser = useCurrentUser();
  const { rules } = useWorkflowRules();
  const { signOut } = useAuthActions();
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWeekDateFilterActive = searchParams.get("dateFilter") === "week";
  const selectedDateParam = isWeekDateFilterActive
    ? (searchParams.get("date") ?? "")
    : "";
  const stationFilter = searchParams.get("station");
  const orderFilter = searchParams.get("order");
  const [selectedDate, setSelectedDate] = useState(selectedDateParam);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>(
    (searchParams.get("status") as QueueStatusFilter) || "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>(
    (searchParams.get("priority") as "all" | Priority) || "all",
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [onlyBlocked, setOnlyBlocked] = useState(
    searchParams.get("blocked") === "1",
  );
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [quickActionOrderId, setQuickActionOrderId] = useState<string | null>(
    null,
  );
  const [quickActionItemId, setQuickActionItemId] = useState<string | null>(
    null,
  );
  const [quickActionRowKey, setQuickActionRowKey] = useState<string | null>(
    null,
  );
  const [quickActionRowIndex, setQuickActionRowIndex] = useState<number | null>(
    null,
  );
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] =
    useState<PendingQuickAction | null>(null);
  const [completeMultipleQtyByItem, setCompleteMultipleQtyByItem] = useState<
    Record<string, string>
  >({});
  const [scannerError, setScannerError] = useState("");
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const hideMobileFloatingControls = useHideMobileFloatingControls();
  const isWarehouseQueueView = pathname.startsWith("/warehouse");
  const { weekStart: selectedWeekStart, weekEnd: selectedWeekEnd } = useMemo(
    () => getWeekRangeForDate(selectedDate || today),
    [selectedDate, today],
  );
  const cacheKey =
    currentUser.id && !orderFilter
      ? `pws_operator_cache_${currentUser.id}_${selectedDate || "all"}_${selectedWeekStart}_${selectedWeekEnd}`
      : "";
  const [stations, setStations] = useState<Station[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [stationDependencies, setStationDependencies] = useState<
    StationDependencyRow[]
  >([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [attachments, setAttachments] = useState<OrderAttachmentRow[]>([]);
  const [itemDocuments, setItemDocuments] = useState<
    ProductionJobItemDocument[]
  >([]);
  const [orderItemLinks, setOrderItemLinks] = useState<OrderItemLinkRow[]>([]);
  const [productionDisplayFields, setProductionDisplayFields] = useState<
    ProductionDisplayFieldConfig[]
  >([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [signingJobs, setSigningJobs] = useState<Set<string>>(new Set());
  const [workingCalendar, setWorkingCalendar] = useState<WorkingCalendar>({
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "17:00" }],
    overtimeEnabled: false,
  });
  const [stopReasons, setStopReasons] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [blockedRunId, setBlockedRunId] = useState<string | null>(null);
  const [blockedItemId, setBlockedItemId] = useState<string | null>(null);
  const [blockedReasonId, setBlockedReasonId] = useState<string>("");
  const [blockedReasonText, setBlockedReasonText] = useState<string>("");
  const [pausedRunId, setPausedRunId] = useState<string | null>(null);
  const [pausedItemId, setPausedItemId] = useState<string | null>(null);
  const [pausedReasonId, setPausedReasonId] = useState<string>("");
  const [pausedReasonText, setPausedReasonText] = useState<string>("");
  const [pausedReasonError, setPausedReasonError] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [pendingRunAction, setPendingRunAction] =
    useState<PendingRunAction | null>(null);
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workSessions, setWorkSessions] = useState<ProductionWorkSessionRow[]>(
    [],
  );
  const [operatorProfiles, setOperatorProfiles] = useState<
    OperatorProfileNameRow[]
  >([]);
  const [operatorConfigs, setOperatorConfigs] = useState<
    OperatorConfigNameRow[]
  >([]);
  const [activityError, setActivityError] = useState("");
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [notificationRoles, setNotificationRoles] = useState<string[]>([
    "Production planner",
    "Admin",
    "Owner",
  ]);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const quickActionCloseGuardUntilRef = useRef(0);
  const handleRunStatusUpdateRef = useRef<
    | ((
        runId: string,
        status: PendingRunAction["action"],
        extra?: { reason?: string | null; reasonId?: string | null },
      ) => Promise<void>)
    | null
  >(null);
  const autoPausedRunIdsRef = useRef<Set<string>>(new Set());
  const autoPauseInFlightRunIdsRef = useRef<Set<string>>(new Set());
  const statusOptions: Array<{ value: QueueStatusFilter; label: string }> = [
    { value: "all", label: t("production.operator.status.all") },
    { value: "queued", label: t("production.operator.status.queued") },
    { value: "pending", label: t("production.operator.status.pending") },
    {
      value: "in_progress",
      label: t("production.operator.status.in_progress"),
    },
    { value: "paused", label: t("production.operator.status.paused") },
    { value: "blocked", label: t("production.operator.status.blocked") },
    { value: "done", label: t("production.operator.status.done") },
  ];
  const priorityOptions: Array<{
    value: "all" | Priority;
    label: string;
  }> = [
    { value: "all", label: t("production.operator.priority.all") },
    { value: "urgent", label: t("production.operator.priority.urgent") },
    { value: "high", label: t("production.operator.priority.high") },
    { value: "normal", label: t("production.operator.priority.normal") },
    { value: "low", label: t("production.operator.priority.low") },
  ];
  const blockedOnlyLabel = onlyBlocked
    ? t("production.operator.filters.blockedOnlyOn")
    : t("production.operator.filters.blockedOnly");
  const hiddenFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (onlyBlocked ? 1 : 0);
  const runStatusLabel = (status: BatchRunRow["status"]) =>
    t(`production.operator.status.${status}`);
  const priorityLabel = (priority: Priority) =>
    t(`production.operator.priority.${priority}`);

  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";

  const setQueryParams = (
    updates: Record<string, string | null | undefined>,
    replace = true,
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    if (replace) {
      router.replace(url, { scroll: false });
      return;
    }
    router.push(url, { scroll: false });
  };

  useEffect(() => {
    setSelectedDate(selectedDateParam);
    const nextStatus =
      (searchParams.get("status") as QueueStatusFilter) || "all";
    setStatusFilter(nextStatus);
    const nextPriority =
      (searchParams.get("priority") as "all" | Priority) || "all";
    setPriorityFilter(nextPriority);
    setSearchQuery(searchParams.get("q") || "");
    setOnlyBlocked(searchParams.get("blocked") === "1");
  }, [searchParams, selectedDateParam]);

  const refreshWorkSessions = useCallback(async () => {
    const sb = supabase;
    if (!sb || !currentUser.id) {
      return;
    }
    let query = sb
      .from("production_work_sessions")
      .select(
        "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
      )
      .order("started_at", { ascending: false })
      .limit(500);
    if (currentUser.tenantId) {
      query = query.eq("tenant_id", currentUser.tenantId);
    } else {
      query = query.eq("operator_user_id", currentUser.id);
    }
    const { data, error } = await query;
    if (error) {
      const message = getWorkSessionLoadErrorMessage(error);
      if (message) {
        setActivityError(message);
      } else {
        setActivityError("");
      }
      return;
    }
    setActivityError("");
    setWorkSessions((data ?? []) as ProductionWorkSessionRow[]);
  }, [currentUser.id, currentUser.tenantId]);

  const refreshBatchRuns = useCallback(async () => {
    const sb = supabase;
    if (!sb || batchRuns.length === 0) {
      return;
    }
    const runIds = Array.from(new Set(batchRuns.map((run) => run.id))).filter(
      Boolean,
    );
    if (runIds.length === 0) {
      return;
    }
    const { data, error } = await sb
      .from("batch_runs")
      .select(
        "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name)",
      )
      .in("id", runIds);
    if (error) {
      return;
    }
    const rows: BatchRunRow[] = (data ?? []).map((row) => {
      const relatedOrder = Array.isArray(row.orders)
        ? (row.orders[0] ?? null)
        : (row.orders ?? null);
      return {
        ...(row as Omit<BatchRunRow, "orders">),
        orders: relatedOrder
          ? {
              order_number: relatedOrder.order_number ?? null,
              due_date: relatedOrder.due_date ?? null,
              production_due_date: relatedOrder.production_due_date ?? null,
              priority: (relatedOrder.priority ?? null) as Priority | null,
              customer_name: relatedOrder.customer_name ?? null,
            }
          : null,
      };
    });
    setBatchRuns((prev) => {
      const map = new Map(prev.map((run) => [run.id, run]));
      rows.forEach((run) => {
        map.set(run.id, { ...(map.get(run.id) ?? run), ...run });
      });
      return Array.from(map.values());
    });
  }, [batchRuns]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const hasLiveWork =
      batchRuns.some((run) => run.status === "in_progress") ||
      workSessions.some((session) => session.is_active);
    if (!hasLiveWork) {
      return;
    }
    let cancelled = false;
    const refreshLiveState = async () => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }
      await Promise.all([refreshWorkSessions(), refreshBatchRuns()]);
    };
    const intervalId = window.setInterval(() => {
      void refreshLiveState();
    }, 2500);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshLiveState();
      }
    };
    const handleFocus = () => {
      void refreshLiveState();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void refreshLiveState();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [batchRuns, refreshBatchRuns, refreshWorkSessions, workSessions]);

  useEffect(() => {
    void refreshWorkSessions();
  }, [refreshWorkSessions]);

  useEffect(() => {
    const onScroll = () => {
      setShowCompactMobileTitle(window.scrollY > 48);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return;
    }
    const tryFocus = () => {
      const input = mobileSearchInputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      input.select();
    };
    const frame1 = window.requestAnimationFrame(() => {
      tryFocus();
      window.requestAnimationFrame(() => {
        tryFocus();
      });
    });
    const timer = window.setTimeout(() => {
      tryFocus();
    }, 180);
    return () => {
      window.cancelAnimationFrame(frame1);
      window.clearTimeout(timer);
    };
  }, [isMobileSearchOpen]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.id) {
      return;
    }
    let isMounted = true;
    let usedCache = false;

    if (cacheKey) {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as {
            cachedAt: number;
            stations: Station[];
            batchRuns: BatchRunRow[];
            stationDependencies: StationDependencyRow[];
            productionItems: ProductionItemRow[];
            attachments: OrderAttachmentRow[];
            itemDocuments?: ProductionJobItemDocument[];
            orderItemLinks?: OrderItemLinkRow[];
            tenantId?: string | null;
            date?: string;
            weekStart?: string;
            weekEnd?: string;
          };
          if (
            cached &&
            Date.now() - cached.cachedAt < 15000 &&
            cached.tenantId === currentUser.tenantId &&
            cached.date === selectedDate &&
            cached.weekStart === selectedWeekStart &&
            cached.weekEnd === selectedWeekEnd
          ) {
            setStations(
              (cached.stations ?? []).map((station) => ({
                ...station,
                trackingMode: normalizeTrackingMode(
                  (station as { trackingMode?: unknown }).trackingMode,
                ),
              })),
            );
            setBatchRuns(cached.batchRuns ?? []);
            setStationDependencies(cached.stationDependencies ?? []);
            setProductionItems(cached.productionItems ?? []);
            setAttachments(cached.attachments ?? []);
            setItemDocuments(cached.itemDocuments ?? []);
            setOrderItemLinks(cached.orderItemLinks ?? []);
            usedCache = true;
            setIsLoading(false);
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    const load = async () => {
      if (!usedCache) {
        setIsLoading(true);
      }
      setDataError("");
      const { data: assignments, error: assignmentsError } = await sb
        .from("operator_station_assignments")
        .select("station_id")
        .eq("user_id", currentUser.id)
        .eq("is_active", true);
      if (!isMounted) {
        return;
      }
      if (assignmentsError) {
        setDataError("Failed to load station assignments.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const stationIds = (assignments ?? [])
        .map((row) => row.station_id)
        .filter(Boolean) as string[];
      if (stationIds.length === 0) {
        setStations([]);
        setBatchRuns([]);
        setStationDependencies([]);
        setProductionItems([]);
        setAttachments([]);
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      let runsQuery = sb
        .from("batch_runs")
        .select(
          "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name)",
        )
        .in("station_id", stationIds)
        .neq("status", "pending")
        .order("created_at", { ascending: false });
      if (orderFilter) {
        runsQuery = runsQuery.eq("order_id", orderFilter);
      }

      const [stationsResult, runsResult, depsResult] = await Promise.all([
        sb
          .from("workstations")
          .select("id, name, sort_order, tracking_mode")
          .in("id", stationIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        runsQuery,
        sb
          .from("station_dependencies")
          .select("id, station_id, depends_on_station_id")
          .in("station_id", stationIds),
      ]);
      if (!isMounted) {
        return;
      }
      if (stationsResult.error || runsResult.error || depsResult.error) {
        setDataError("Failed to load production queue.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const runs: BatchRunRow[] = (runsResult.data ?? []).map((row) => {
        const relatedOrder = Array.isArray(row.orders)
          ? (row.orders[0] ?? null)
          : (row.orders ?? null);
        return {
          ...(row as Omit<BatchRunRow, "orders">),
          orders: relatedOrder
            ? {
                order_number: relatedOrder.order_number ?? null,
                due_date: relatedOrder.due_date ?? null,
                production_due_date: relatedOrder.production_due_date ?? null,
                priority: (relatedOrder.priority ?? null) as Priority | null,
                customer_name: relatedOrder.customer_name ?? null,
              }
            : null,
        };
      });
      const orderIds = Array.from(
        new Set(runs.map((run) => run.order_id)),
      ).filter(Boolean);
      const batchCodes = Array.from(
        new Set(runs.map((run) => run.batch_code)),
      ).filter(Boolean);

      const [itemsResult, attachmentsResult] = await Promise.all([
        orderIds.length === 0
          ? Promise.resolve({ data: [] as ProductionItemRow[], error: null })
          : sb
              .from("production_items")
              .select(
                "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, started_at, done_at, duration_minutes, created_at",
              )
              .in("order_id", orderIds)
              .in("batch_code", batchCodes),
        orderIds.length === 0
          ? Promise.resolve({ data: [] as OrderAttachmentRow[], error: null })
          : sb
              .from("order_attachments")
              .select(
                "id, order_id, name, url, created_at, size, mime_type, category",
              )
              .in("order_id", orderIds)
              .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }
      if (itemsResult.error || attachmentsResult.error) {
        setDataError("Failed to load production details.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      setStations(
        (stationsResult.data ?? []).map((station) => ({
          id: station.id,
          name: station.name,
          sortOrder: station.sort_order ?? 0,
          trackingMode: normalizeTrackingMode(station.tracking_mode),
        })),
      );
      setBatchRuns(runs);
      setStationDependencies((depsResult.data ?? []) as StationDependencyRow[]);
      const allItems = (itemsResult.data ?? []) as ProductionItemRow[];
      const orderItemLinksResult =
        orderIds.length === 0
          ? { data: [] as OrderItemLinkRow[], error: null }
          : await sb
              .from("order_items")
              .select("id, source_row_id, position, qty")
              .in("order_id", orderIds);
      if (!isMounted) {
        return;
      }
      if (orderItemLinksResult.error) {
        setDataError("Failed to load production details.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      const orderItemIds = Array.from(
        new Set(
          ((orderItemLinksResult.data ?? []) as OrderItemLinkRow[]).map(
            (row) => row.id,
          ),
        ),
      );
      const itemDocumentsResult =
        orderItemIds.length === 0
          ? {
              data: [] as ProductionJobItemDocument[],
              error: null,
            }
          : await sb
              .from("order_item_documents")
              .select("order_item_id, order_attachment_id, role, sort_order")
              .in("order_item_id", orderItemIds)
              .eq("role", "production")
              .order("sort_order", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (itemDocumentsResult.error) {
        setDataError("Failed to load production details.");
        if (!usedCache) {
          setIsLoading(false);
        }
        return;
      }
      setProductionItems(allItems);
      setAttachments((attachmentsResult.data ?? []) as OrderAttachmentRow[]);
      setItemDocuments(
        (itemDocumentsResult.data ?? []) as ProductionJobItemDocument[],
      );
      setOrderItemLinks(
        (orderItemLinksResult.data ?? []) as OrderItemLinkRow[],
      );
      if (!usedCache) {
        setIsLoading(false);
      }
      if (cacheKey) {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              cachedAt: Date.now(),
              stations: stationsResult.data ?? [],
              batchRuns: runs,
              stationDependencies: depsResult.data ?? [],
              productionItems: allItems,
              attachments: attachmentsResult.data ?? [],
              itemDocuments: itemDocumentsResult.data ?? [],
              orderItemLinks: orderItemLinksResult.data ?? [],
              tenantId: currentUser.tenantId ?? null,
              date: selectedDate,
              weekStart: selectedWeekStart,
              weekEnd: selectedWeekEnd,
            }),
          );
        } catch {
          // ignore cache errors
        }
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [
    currentUser.id,
    currentUser.tenantId,
    cacheKey,
    selectedDate,
    selectedWeekEnd,
    selectedWeekStart,
    orderFilter,
  ]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      setOperatorProfiles([]);
      setOperatorConfigs([]);
      return;
    }
    let isMounted = true;
    const loadOperatorNames = async () => {
      const [profilesResult, operatorsResult] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name")
          .eq("tenant_id", currentUser.tenantId),
        sb
          .from("operators")
          .select("user_id, name")
          .eq("tenant_id", currentUser.tenantId),
      ]);
      if (!isMounted) {
        return;
      }
      setOperatorProfiles(
        profilesResult.error
          ? []
          : ((profilesResult.data ?? []) as OperatorProfileNameRow[]),
      );
      setOperatorConfigs(
        operatorsResult.error
          ? []
          : ((operatorsResult.data ?? []) as OperatorConfigNameRow[]),
      );
    };
    void loadOperatorNames();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadNotificationRoles = async () => {
      const { data, error } = await sb
        .from("tenant_settings")
        .select("notification_roles")
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      if (Array.isArray(data.notification_roles)) {
        setNotificationRoles(
          data.notification_roles.filter(
            (value: unknown) => typeof value === "string",
          ),
        );
      }
    };
    void loadNotificationRoles();
    return () => {
      isMounted = false;
    };
  }, [currentUser.id, currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.id) {
      return;
    }
    let isMounted = true;
    const loadActivity = async () => {
      setActivityError("");
      let query = sb
        .from("production_work_sessions")
        .select(
          "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
        )
        .order("started_at", { ascending: false })
        .limit(500);
      if (currentUser.tenantId) {
        query = query.eq("tenant_id", currentUser.tenantId);
      } else {
        query = query.eq("operator_user_id", currentUser.id);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setWorkSessions([]);
        const message = getWorkSessionLoadErrorMessage(error);
        if (message) {
          setActivityError(message);
        } else {
          setActivityError("");
        }
        return;
      }
      setWorkSessions((data ?? []) as ProductionWorkSessionRow[]);
    };
    void loadActivity();
    return () => {
      isMounted = false;
    };
  }, [currentUser.id, currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    const channel = sb
      .channel(`operator-live-${currentUser.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_items",
          filter: `tenant_id=eq.${currentUser.tenantId}`,
        },
        (payload) => {
          const next = payload.new as ProductionItemRow | undefined;
          if (!next) {
            return;
          }
          setProductionItems((prev) => {
            const idx = prev.findIndex((item) => item.id === next.id);
            if (idx === -1) {
              return [next, ...prev];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "batch_runs",
          filter: `tenant_id=eq.${currentUser.tenantId}`,
        },
        (payload) => {
          const next = payload.new as BatchRunRow | undefined;
          if (!next) {
            return;
          }
          setBatchRuns((prev) => {
            const idx = prev.findIndex((item) => item.id === next.id);
            if (idx === -1) {
              return [next, ...prev];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_work_sessions",
          filter: `tenant_id=eq.${currentUser.tenantId}`,
        },
        (payload) => {
          const next = payload.new as ProductionWorkSessionRow | undefined;
          if (!next) {
            return;
          }
          setWorkSessions((prev) => {
            const idx = prev.findIndex((item) => item.id === next.id);
            if (idx === -1) {
              return [next, ...prev];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [currentUser.id, currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    let isMounted = true;
    const loadReasons = async () => {
      const { data, error } = await sb
        .from("stop_reasons")
        .select("id, label")
        .eq("is_active", true)
        .order("label", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        return;
      }
      setStopReasons(data ?? []);
    };
    void loadReasons();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      const { data, error } = await sb
        .from("tenant_settings")
        .select("workday_start, workday_end, workdays, work_shifts")
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      setWorkingCalendar(parseWorkingCalendar(data));
    };
    void loadWorkHours();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadProductionDisplayFields = async () => {
      const { data, error } = await sb
        .from("order_input_fields")
        .select("key, label, sort_order")
        .eq("is_active", true)
        .eq("show_in_production", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted || error) {
        return;
      }
      setProductionDisplayFields(
        (data ?? [])
          .map((row) => ({
            key: String((row as { key?: unknown }).key ?? "").trim(),
            label: String((row as { label?: unknown }).label ?? "").trim(),
            sortOrder: Number(
              (row as { sort_order?: unknown }).sort_order ?? 0,
            ),
          }))
          .filter((row) => row.key.length > 0 && row.label.length > 0),
      );
    };
    void loadProductionDisplayFields();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  const signAttachments = async (list: OrderAttachmentRow[]) => {
    const sb = supabase;
    if (!sb || list.length === 0) {
      return {} as Record<string, string>;
    }
    const results = await Promise.all(
      list.map(async (attachment) => {
        if (!attachment.url) {
          return { id: attachment.id, url: undefined };
        }
        if (
          storagePublicPrefix &&
          attachment.url.startsWith(storagePublicPrefix)
        ) {
          const path = getStoragePathFromUrl(attachment.url, supabaseBucket);
          const { data } = await sb.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }
        if (attachment.url.startsWith("http")) {
          return { id: attachment.id, url: attachment.url };
        }
        const { data } = await sb.storage
          .from(supabaseBucket)
          .createSignedUrl(attachment.url, 60 * 60);
        return { id: attachment.id, url: data?.signedUrl };
      }),
    );
    const generatedUrls: Record<string, string> = {};
    setSignedUrls((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        if (result.url) {
          next[result.id] = result.url;
          generatedUrls[result.id] = result.url;
        }
      });
      return next;
    });
    return generatedUrls;
  };

  const attachmentsByOrder = useMemo(() => {
    const map = new Map<string, OrderAttachmentRow[]>();
    filterProductionAttachments(attachments).forEach((attachment) => {
      if (!map.has(attachment.order_id)) {
        map.set(attachment.order_id, []);
      }
      map.get(attachment.order_id)?.push(attachment);
    });
    return map;
  }, [attachments]);

  const attachmentById = useMemo(
    () => new Map(attachments.map((attachment) => [attachment.id, attachment])),
    [attachments],
  );

  const productionAttachmentsByItemId = useMemo(() => {
    const map = new Map<string, OrderAttachmentRow[]>();
    itemDocuments.forEach((document) => {
      const attachment = attachmentById.get(document.order_attachment_id);
      if (!attachment) {
        return;
      }
      const current = map.get(document.order_item_id) ?? [];
      current.push(attachment);
      map.set(document.order_item_id, current);
    });
    return map;
  }, [attachmentById, itemDocuments]);

  const orderItemIdsBySourceKey = useMemo(() => {
    const map = new Map<string, string[]>();
    orderItemLinks.forEach((row) => {
      const current = map.get(row.source_row_id) ?? [];
      current.push(row.id);
      map.set(row.source_row_id, current);
    });
    return map;
  }, [orderItemLinks]);

  const orderItemQtyBySourceKey = useMemo(() => {
    const map = new Map<string, number>();
    orderItemLinks.forEach((row) => {
      const qty = Number(row.qty ?? 0);
      if (Number.isFinite(qty) && qty > 0) {
        map.set(row.id, qty);
        map.set(row.source_row_id, qty);
      }
    });
    return map;
  }, [orderItemLinks]);

  const orderItemPositionBySourceKey = useMemo(() => {
    const map = new Map<string, string>();
    orderItemLinks.forEach((row) => {
      const position = row.position?.trim();
      if (position) {
        map.set(row.id, position);
        map.set(row.source_row_id, position);
      }
    });
    return map;
  }, [orderItemLinks]);

  const stationsById = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station.name]));
  }, [stations]);

  const batchRunById = useMemo(
    () => new Map(batchRuns.map((run) => [run.id, run])),
    [batchRuns],
  );

  const productionItemById = useMemo(
    () => new Map(productionItems.map((item) => [item.id, item])),
    [productionItems],
  );

  const latestProductionItems = useMemo(() => {
    const map = new Map<string, ProductionItemRow>();
    productionItems.forEach((item) => {
      const key = `${item.station_id ?? ""}:${getItemGroupKey(item)}`;
      const existing = map.get(key);
      map.set(key, pickLatestItem(existing, item));
    });
    return Array.from(map.values());
  }, [productionItems]);

  const latestWorkEntries = useMemo(() => {
    return latestProductionItems.map((item) => {
      const matchedRun =
        batchRuns.find((run) => matchesProductionItemToRun(item, run)) ?? null;
      const effectiveStartedAt =
        item.started_at ?? matchedRun?.started_at ?? null;
      const effectiveDoneAt = item.done_at ?? matchedRun?.done_at ?? null;
      const effectiveStatus =
        item.status === "queued" || item.status === "pending"
          ? (matchedRun?.status ?? item.status)
          : item.status;
      return {
        kind: "item" as const,
        id: item.id,
        startedAt: effectiveStartedAt,
        doneAt: effectiveDoneAt,
        status: effectiveStatus,
        matchedRunId: matchedRun?.id ?? null,
      };
    });
  }, [batchRuns, latestProductionItems]);

  const unmatchedBatchRuns = useMemo(() => {
    const matchedRunIds = new Set(
      latestWorkEntries
        .map((entry) => entry.matchedRunId)
        .filter((value): value is string => Boolean(value)),
    );
    return batchRuns.filter((run) => !matchedRunIds.has(run.id));
  }, [batchRuns, latestWorkEntries]);

  const dependenciesByStation = useMemo(() => {
    const map = new Map<string, string[]>();
    stationDependencies.forEach((row) => {
      const list = map.get(row.station_id) ?? [];
      list.push(row.depends_on_station_id);
      map.set(row.station_id, list);
    });
    return map;
  }, [stationDependencies]);

  const itemsByGroupAndStation = useMemo(() => {
    const map = new Map<string, Map<string, ProductionItemRow>>();
    productionItems.forEach((item) => {
      if (!item.station_id) return;
      const key = getItemGroupKey(item);
      if (!map.has(key)) {
        map.set(key, new Map());
      }
      const stationMap = map.get(key);
      const existing = stationMap?.get(item.station_id);
      stationMap?.set(item.station_id, pickLatestItem(existing, item));
    });
    return map;
  }, [productionItems]);

  const visibleStations = useMemo(() => {
    if (!stationFilter) {
      return stations;
    }
    return stations.filter((station) => station.id === stationFilter);
  }, [stations, stationFilter]);
  const operatorNameById = useMemo(() => {
    const map = new Map<string, string>();
    operatorConfigs.forEach((operator) => {
      const userId = operator.user_id;
      const name = operator.name?.trim();
      if (userId && name) {
        map.set(userId, name);
      }
    });
    operatorProfiles.forEach((profile) => {
      const name = profile.full_name?.trim();
      if (name) {
        map.set(profile.id, name);
      }
    });
    if (currentUser.name.trim()) {
      map.set(currentUser.id, currentUser.name.trim());
    }
    return map;
  }, [currentUser.id, currentUser.name, operatorConfigs, operatorProfiles]);
  const getActiveOperatorNames = useCallback(
    (operatorIds: Iterable<string>) =>
      Array.from(new Set(operatorIds))
        .map((operatorId) => operatorNameById.get(operatorId) ?? null)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b)),
    [operatorNameById],
  );
  const ownActiveWorkSessionRunIds = useMemo(
    () =>
      new Set(
        workSessions
          .filter(
            (session) =>
              session.is_active &&
              !session.production_item_id &&
              session.operator_user_id === currentUser.id,
          )
          .map((session) => session.batch_run_id),
      ),
    [currentUser.id, workSessions],
  );
  const activeOperatorIdsByScope = useMemo(() => {
    const latestByScopeAndOperator = new Map<
      string,
      Map<string, ProductionWorkSessionRow>
    >();
    workSessions.forEach((session) => {
      const key = getWorkSessionScopeKey(
        session.batch_run_id,
        session.production_item_id,
      );
      const latestByOperator =
        latestByScopeAndOperator.get(key) ??
        new Map<string, ProductionWorkSessionRow>();
      const existing = latestByOperator.get(session.operator_user_id);
      if (
        !existing ||
        getWorkSessionSortTime(session) >= getWorkSessionSortTime(existing)
      ) {
        latestByOperator.set(session.operator_user_id, session);
      }
      latestByScopeAndOperator.set(key, latestByOperator);
    });

    const map = new Map<string, Set<string>>();
    latestByScopeAndOperator.forEach((latestByOperator, key) => {
      const operatorIds = new Set<string>();
      latestByOperator.forEach((session) => {
        if (session.is_active) {
          operatorIds.add(session.operator_user_id);
        }
      });
      if (operatorIds.size > 0) {
        map.set(key, operatorIds);
      }
    });
    return map;
  }, [workSessions]);
  const involvedOperatorIdsByScope = useMemo(() => {
    const latestByScopeAndOperator = new Map<
      string,
      Map<string, ProductionWorkSessionRow>
    >();
    workSessions.forEach((session) => {
      const key = getWorkSessionScopeKey(
        session.batch_run_id,
        session.production_item_id,
      );
      const latestByOperator =
        latestByScopeAndOperator.get(key) ??
        new Map<string, ProductionWorkSessionRow>();
      const existing = latestByOperator.get(session.operator_user_id);
      if (
        !existing ||
        getWorkSessionSortTime(session) >= getWorkSessionSortTime(existing)
      ) {
        latestByOperator.set(session.operator_user_id, session);
      }
      latestByScopeAndOperator.set(key, latestByOperator);
    });

    const map = new Map<string, Set<string>>();
    latestByScopeAndOperator.forEach((latestByOperator, key) => {
      const operatorIds = new Set<string>();
      latestByOperator.forEach((session) => {
        const status = session.is_active
          ? "in_progress"
          : ((session.ended_status as BatchRunRow["status"] | null) ?? null);
        if (status && status !== "done") {
          operatorIds.add(session.operator_user_id);
        }
      });
      if (operatorIds.size > 0) {
        map.set(key, operatorIds);
      }
    });
    return map;
  }, [workSessions]);
  const operatorStatusGroupsByScope = useMemo(() => {
    const latestByScopeAndOperator = new Map<
      string,
      Map<string, ProductionWorkSessionRow>
    >();
    workSessions.forEach((session) => {
      const key = getWorkSessionScopeKey(
        session.batch_run_id,
        session.production_item_id,
      );
      const latestByOperator =
        latestByScopeAndOperator.get(key) ??
        new Map<string, ProductionWorkSessionRow>();
      const existing = latestByOperator.get(session.operator_user_id);
      if (
        !existing ||
        getWorkSessionSortTime(session) >= getWorkSessionSortTime(existing)
      ) {
        latestByOperator.set(session.operator_user_id, session);
      }
      latestByScopeAndOperator.set(key, latestByOperator);
    });

    const map = new Map<string, OperatorWorkStatusGroups>();
    latestByScopeAndOperator.forEach((latestByOperator, key) => {
      const groups = createOperatorWorkStatusGroups();
      latestByOperator.forEach((session) => {
        addOperatorWorkStatus(
          groups,
          session.operator_user_id,
          session.is_active
            ? "in_progress"
            : ((session.ended_status as BatchRunRow["status"] | null) ?? null),
        );
      });
      if (
        groups.working.size > 0 ||
        groups.paused.size > 0 ||
        groups.blocked.size > 0
      ) {
        map.set(key, groups);
      }
    });
    return map;
  }, [workSessions]);
  const involvedOperatorIdsByConstructionScope = useMemo(() => {
    const latestByScopeAndOperator = new Map<
      string,
      Map<string, ProductionWorkSessionRow>
    >();

    workSessions.forEach((session) => {
      if (!session.production_item_id) {
        return;
      }
      const run = batchRunById.get(session.batch_run_id);
      const item = productionItemById.get(session.production_item_id);
      if (!run || !item) {
        return;
      }
      const key = getConstructionWorkSessionLogicalKey(run, item);
      const latestByOperator =
        latestByScopeAndOperator.get(key) ??
        new Map<string, ProductionWorkSessionRow>();
      const existing = latestByOperator.get(session.operator_user_id);
      if (
        !existing ||
        getWorkSessionSortTime(session) >= getWorkSessionSortTime(existing)
      ) {
        latestByOperator.set(session.operator_user_id, session);
      }
      latestByScopeAndOperator.set(key, latestByOperator);
    });

    const map = new Map<string, Set<string>>();
    latestByScopeAndOperator.forEach((latestByOperator, key) => {
      const operatorIds = new Set<string>();
      latestByOperator.forEach((session) => {
        const status = session.is_active
          ? "in_progress"
          : ((session.ended_status as BatchRunRow["status"] | null) ?? null);
        if (status && status !== "done") {
          operatorIds.add(session.operator_user_id);
        }
      });
      if (operatorIds.size > 0) {
        map.set(key, operatorIds);
      }
    });
    return map;
  }, [batchRunById, productionItemById, workSessions]);
  const operatorStatusGroupsByConstructionScope = useMemo(() => {
    const latestByScopeAndOperator = new Map<
      string,
      Map<string, ProductionWorkSessionRow>
    >();

    workSessions.forEach((session) => {
      if (!session.production_item_id) {
        return;
      }
      const run = batchRunById.get(session.batch_run_id);
      const item = productionItemById.get(session.production_item_id);
      if (!run || !item) {
        return;
      }
      const key = getConstructionWorkSessionLogicalKey(run, item);
      const latestByOperator =
        latestByScopeAndOperator.get(key) ??
        new Map<string, ProductionWorkSessionRow>();
      const existing = latestByOperator.get(session.operator_user_id);
      if (
        !existing ||
        getWorkSessionSortTime(session) >= getWorkSessionSortTime(existing)
      ) {
        latestByOperator.set(session.operator_user_id, session);
      }
      latestByScopeAndOperator.set(key, latestByOperator);
    });

    const map = new Map<string, OperatorWorkStatusGroups>();
    latestByScopeAndOperator.forEach((latestByOperator, key) => {
      const groups = createOperatorWorkStatusGroups();
      latestByOperator.forEach((session) => {
        addOperatorWorkStatus(
          groups,
          session.operator_user_id,
          session.is_active
            ? "in_progress"
            : ((session.ended_status as BatchRunRow["status"] | null) ?? null),
        );
      });
      if (
        groups.working.size > 0 ||
        groups.paused.size > 0 ||
        groups.blocked.size > 0
      ) {
        map.set(key, groups);
      }
    });
    return map;
  }, [batchRunById, productionItemById, workSessions]);
  const getInvolvedOperatorIdsForConstructionItem = useCallback(
    (runId: string, item: ProductionItemRow) => {
      const run = batchRunById.get(runId);
      if (!run) {
        return (
          involvedOperatorIdsByScope.get(
            getWorkSessionScopeKey(runId, item.id),
          ) ?? new Set<string>()
        );
      }
      return (
        involvedOperatorIdsByConstructionScope.get(
          getConstructionWorkSessionLogicalKey(run, item),
        ) ??
        involvedOperatorIdsByScope.get(
          getWorkSessionScopeKey(runId, item.id),
        ) ??
        new Set<string>()
      );
    },
    [
      batchRunById,
      involvedOperatorIdsByConstructionScope,
      involvedOperatorIdsByScope,
    ],
  );
  const getOperatorStatusGroupsForConstructionItem = useCallback(
    (runId: string, item: ProductionItemRow) => {
      const run = batchRunById.get(runId);
      if (!run) {
        return (
          operatorStatusGroupsByScope.get(
            getWorkSessionScopeKey(runId, item.id),
          ) ?? createOperatorWorkStatusGroups()
        );
      }
      return (
        operatorStatusGroupsByConstructionScope.get(
          getConstructionWorkSessionLogicalKey(run, item),
        ) ??
        operatorStatusGroupsByScope.get(
          getWorkSessionScopeKey(runId, item.id),
        ) ??
        createOperatorWorkStatusGroups()
      );
    },
    [
      batchRunById,
      operatorStatusGroupsByConstructionScope,
      operatorStatusGroupsByScope,
    ],
  );
  const workSessionScopeSummaryByKey = useMemo(() => {
    const map = new Map<string, WorkSessionScopeSummary>();
    workSessions.forEach((session) => {
      const isSessionEffectivelyActive = session.is_active;
      const key = getWorkSessionScopeKey(
        session.batch_run_id,
        session.production_item_id,
      );
      const current = map.get(key) ?? {
        activeCount: 0,
        totalMinutes: 0,
        totalSeconds: 0,
        elapsedSeconds: 0,
        earliestStartedAt: null,
        latestStoppedAt: null,
        latestStatus: null,
      };
      const workedMinutes = getProductionWorkSessionOverlapMinutes({
        session,
        calendar: workingCalendar,
        nowMs: liveNowMs,
      }).totalMinutes;
      const workedSeconds = computeWorkedSecondsBreakdown(
        session.started_at,
        session.stopped_at ??
          (isSessionEffectivelyActive
            ? new Date(liveNowMs).toISOString()
            : null),
        workingCalendar,
      ).totalSeconds;
      const nextStatus: BatchRunRow["status"] | null =
        isSessionEffectivelyActive
          ? "in_progress"
          : ((session.ended_status as BatchRunRow["status"] | null) ?? null);
      const currentStatusTime = Date.parse(
        current.latestStoppedAt ??
          current.earliestStartedAt ??
          "1970-01-01T00:00:00.000Z",
      );
      const nextStatusTime = Date.parse(
        session.updated_at ??
          session.stopped_at ??
          session.started_at ??
          "1970-01-01T00:00:00.000Z",
      );
      const nextActiveCount =
        current.activeCount + (isSessionEffectivelyActive ? 1 : 0);
      const nextEarliestStartedAt =
        !current.earliestStartedAt ||
        Date.parse(session.started_at) < Date.parse(current.earliestStartedAt)
          ? session.started_at
          : current.earliestStartedAt;
      const nextLatestStoppedAt =
        session.stopped_at &&
        (!current.latestStoppedAt ||
          Date.parse(session.stopped_at) > Date.parse(current.latestStoppedAt))
          ? session.stopped_at
          : current.latestStoppedAt;
      const elapsedSeconds = getElapsedSeconds(
        nextEarliestStartedAt,
        nextActiveCount > 0
          ? new Date(liveNowMs).toISOString()
          : nextLatestStoppedAt,
        liveNowMs,
      );
      map.set(key, {
        activeCount: nextActiveCount,
        totalMinutes: current.totalMinutes + workedMinutes,
        totalSeconds: current.totalSeconds + workedSeconds,
        elapsedSeconds,
        earliestStartedAt: nextEarliestStartedAt,
        latestStoppedAt: nextLatestStoppedAt,
        latestStatus:
          nextStatusTime >= currentStatusTime
            ? nextStatus
            : current.latestStatus,
      });
    });
    map.forEach((summary, key) => {
      summary.activeCount = activeOperatorIdsByScope.get(key)?.size ?? 0;
    });
    return map;
  }, [activeOperatorIdsByScope, liveNowMs, workSessions, workingCalendar]);
  const latestOwnWorkSessionByScope = useMemo(() => {
    const map = new Map<string, ProductionWorkSessionRow>();
    workSessions
      .filter((session) => session.operator_user_id === currentUser.id)
      .forEach((session) => {
        const key = getWorkSessionScopeKey(
          session.batch_run_id,
          session.production_item_id,
        );
        const existing = map.get(key);
        const existingTime = Date.parse(
          existing?.updated_at ??
            existing?.stopped_at ??
            existing?.started_at ??
            "1970-01-01T00:00:00.000Z",
        );
        const nextTime = Date.parse(
          session.updated_at ??
            session.stopped_at ??
            session.started_at ??
            "1970-01-01T00:00:00.000Z",
        );
        if (!existing || nextTime >= existingTime) {
          map.set(key, session);
        }
      });
    return map;
  }, [currentUser.id, workSessions]);
  const ownWorkSessions = useMemo(
    () =>
      workSessions.filter(
        (session) => session.operator_user_id === currentUser.id,
      ),
    [currentUser.id, workSessions],
  );
  const ownWorkSessionSecondsByScope = useMemo(() => {
    const map = new Map<string, number>();
    ownWorkSessions.forEach((session) => {
      const key = getWorkSessionScopeKey(
        session.batch_run_id,
        session.production_item_id,
      );
      const seconds = getElapsedSeconds(
        session.started_at,
        session.stopped_at ??
          (session.is_active ? new Date(liveNowMs).toISOString() : null),
        liveNowMs,
      );
      map.set(key, (map.get(key) ?? 0) + seconds);
    });
    return map;
  }, [liveNowMs, ownWorkSessions]);
  const ownActiveWorkSessionItemKeys = useMemo(
    () =>
      new Set(
        workSessions
          .filter(
            (session) =>
              session.is_active &&
              session.production_item_id &&
              session.operator_user_id === currentUser.id,
          )
          .map(
            (session) =>
              `${session.batch_run_id}:${session.production_item_id as string}`,
          ),
      ),
    [currentUser.id, workSessions],
  );
  const hasActiveWorkSessionForRun = useCallback(
    (runId: string) => ownActiveWorkSessionRunIds.has(runId),
    [ownActiveWorkSessionRunIds],
  );
  const hasActiveWorkSessionForItem = useCallback(
    (runId: string, itemId: string) =>
      ownActiveWorkSessionItemKeys.has(`${runId}:${itemId}`),
    [ownActiveWorkSessionItemKeys],
  );
  const getOwnWorkSessionStatus = useCallback(
    (
      runId: string,
      productionItemId?: string | null,
    ): BatchRunRow["status"] | null => {
      const key = getWorkSessionScopeKey(runId, productionItemId);
      const session = latestOwnWorkSessionByScope.get(key);
      if (!session) {
        return null;
      }
      if (session.is_active) {
        return "in_progress";
      }
      return (session.ended_status as BatchRunRow["status"] | null) ?? null;
    },
    [latestOwnWorkSessionByScope],
  );
  const mergeWorkSessionRows = useCallback(
    (rows: ProductionWorkSessionRow[]) => {
      if (rows.length === 0) {
        return;
      }
      setWorkSessions((prev) => {
        const map = new Map(prev.map((row) => [row.id, row]));
        rows.forEach((row) => {
          map.set(row.id, row);
        });
        return Array.from(map.values()).sort((a, b) => {
          const aTime = Date.parse(
            a.updated_at ??
              a.stopped_at ??
              a.started_at ??
              "1970-01-01T00:00:00.000Z",
          );
          const bTime = Date.parse(
            b.updated_at ??
              b.stopped_at ??
              b.started_at ??
              "1970-01-01T00:00:00.000Z",
          );
          return bTime - aTime;
        });
      });
    },
    [],
  );
  const getOtherOperatorsOpenStatus = useCallback(
    (
      runId: string,
      productionItemId: string | null | undefined,
      nextRows: ProductionWorkSessionRow[] = [],
    ): BatchRunRow["status"] | null => {
      const scopeKey = getWorkSessionScopeKey(runId, productionItemId);
      const latestByOperator = new Map<string, ProductionWorkSessionRow>();
      const rowsById = new Map(
        workSessions.map((session) => [session.id, session]),
      );
      nextRows.forEach((session) => rowsById.set(session.id, session));

      rowsById.forEach((session) => {
        if (session.operator_user_id === currentUser.id) {
          return;
        }
        if (
          getWorkSessionScopeKey(
            session.batch_run_id,
            session.production_item_id,
          ) !== scopeKey
        ) {
          return;
        }
        const existing = latestByOperator.get(session.operator_user_id);
        const existingTime = Date.parse(
          existing?.updated_at ??
            existing?.stopped_at ??
            existing?.started_at ??
            "1970-01-01T00:00:00.000Z",
        );
        const nextTime = Date.parse(
          session.updated_at ??
            session.stopped_at ??
            session.started_at ??
            "1970-01-01T00:00:00.000Z",
        );
        if (!existing || nextTime >= existingTime) {
          latestByOperator.set(session.operator_user_id, session);
        }
      });

      const statuses = Array.from(latestByOperator.values())
        .map((session): BatchRunRow["status"] | null => {
          if (session.is_active) {
            return "in_progress";
          }
          const endedStatus =
            (session.ended_status as BatchRunRow["status"] | null) ?? null;
          return endedStatus === "done" ? null : endedStatus;
        })
        .filter((status): status is BatchRunRow["status"] => Boolean(status));

      const statusOrder: BatchRunRow["status"][] = [
        "blocked",
        "in_progress",
        "paused",
      ];
      return (
        statusOrder.find((candidate) => statuses.includes(candidate)) ?? null
      );
    },
    [currentUser.id, workSessions],
  );

  const queueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    const stationModeById = new Map(
      visibleStations.map((station) => [station.id, station.trackingMode]),
    );
    visibleStations.forEach((station) => map.set(station.id, []));
    const queueGroups = new Map<
      string,
      {
        stationId: string;
        trackingMode: StationTrackingMode;
        runs: BatchRunRow[];
      }
    >();
    batchRuns.forEach((run) => {
      if (!run.station_id) {
        return;
      }
      if (run.status === "done") {
        return;
      }
      const trackingMode =
        stationModeById.get(run.station_id) ?? "construction_level";
      const groupKey =
        trackingMode === "construction_level"
          ? [
              run.station_id,
              run.order_id,
              run.route_key && run.route_key !== "default"
                ? run.route_key
                : run.batch_code,
            ].join(":")
          : `${run.station_id}:${run.order_id}`;
      const existingGroup = queueGroups.get(groupKey);
      if (existingGroup) {
        existingGroup.runs.push(run);
        return;
      }
      queueGroups.set(groupKey, {
        stationId: run.station_id,
        trackingMode,
        runs: [run],
      });
    });

    const queueItemByKey = new Map<string, QueueItem>();
    queueGroups.forEach(({ stationId, trackingMode, runs }, groupedKey) => {
      const representativeRun = [...runs].sort((a, b) => {
        const aStarted = a.started_at ? Date.parse(a.started_at) : 0;
        const bStarted = b.started_at ? Date.parse(b.started_at) : 0;
        if (aStarted !== bStarted) {
          return bStarted - aStarted;
        }
        return a.id.localeCompare(b.id);
      })[0];
      if (!representativeRun) {
        return;
      }
      const batchCodes = new Set(runs.map((run) => run.batch_code));
      const routeKeys = new Set(
        runs
          .map((run) => run.route_key)
          .filter((value): value is string =>
            Boolean(value && value !== "default"),
          ),
      );
      const items = productionItems.filter((item) => {
        if (item.order_id !== representativeRun.order_id) {
          return false;
        }
        if (trackingMode === "construction_level") {
          const sourceKey = getProductionItemSourceKey(item);
          if (sourceKey && routeKeys.size > 0) {
            return routeKeys.has(sourceKey);
          }
          if (item.station_id && item.station_id !== stationId) {
            return false;
          }
          return batchCodes.has(item.batch_code);
        }
        if (item.station_id && item.station_id !== stationId) {
          return false;
        }
        return true;
      });
      const latestByGroup = new Map<string, ProductionItemRow>();
      items.forEach((row) => {
        const key = getItemGroupKey(row);
        const existing = latestByGroup.get(key);
        latestByGroup.set(key, pickLatestItem(existing, row));
      });
      const dedupedItems = Array.from(latestByGroup.values());
      const effectiveDedupedItems = dedupedItems.map((item) => {
        const sourceKey = getProductionItemSourceKey(item);
        const linkedQty = sourceKey
          ? orderItemQtyBySourceKey.get(sourceKey)
          : undefined;
        return linkedQty ? { ...item, qty: linkedQty } : item;
      });
      const itemProgress = getOperatorVisibleItemsProgress(
        effectiveDedupedItems,
      );
      const itemCountProgress = {
        totalQty: effectiveDedupedItems.length,
        completedQty: effectiveDedupedItems.filter(
          (item) => item.status === "done",
        ).length,
      };
      const progress =
        trackingMode === "construction_level"
          ? itemProgress
          : itemCountProgress;
      const totalQtyFromItems = progress.totalQty;
      const totalQty =
        trackingMode === "construction_level"
          ? totalQtyFromItems
          : Math.max(totalQtyFromItems, dedupedItems.length, 1);
      const totalPiecesQty = effectiveDedupedItems.reduce(
        (sum, item) => sum + getProductionItemQuantity(item),
        0,
      );
      const material = items.find((item) => item.material)?.material ?? "";
      const primaryConstructionItem = dedupedItems[0] ?? items[0] ?? null;
      const unitType =
        trackingMode === "construction_level" &&
        typeof primaryConstructionItem?.meta?.fieldLabel === "string" &&
        primaryConstructionItem.meta.fieldLabel.trim().length > 0
          ? primaryConstructionItem.meta.fieldLabel.trim()
          : null;
      const unitName =
        trackingMode === "construction_level" &&
        typeof primaryConstructionItem?.item_name === "string" &&
        primaryConstructionItem.item_name.trim().length > 0
          ? primaryConstructionItem.item_name.trim()
          : null;
      const unitPosition =
        trackingMode === "construction_level" && primaryConstructionItem
          ? (getProductionItemMetaPosition(primaryConstructionItem) ??
            orderItemPositionBySourceKey.get(
              getProductionItemSourceKey(primaryConstructionItem) ?? "",
            ) ??
            dedupedItems
              .map(
                (item) =>
                  getProductionItemMetaPosition(item) ??
                  orderItemPositionBySourceKey.get(
                    getProductionItemSourceKey(item) ?? "",
                  ) ??
                  null,
              )
              .find((value): value is string => Boolean(value)) ??
            null)
          : null;
      const orderNumber =
        representativeRun.orders?.order_number ??
        t("production.main.common.order");
      const customerName =
        representativeRun.orders?.customer_name ??
        t("production.main.common.customer");
      const dueDate =
        representativeRun.orders?.production_due_date ??
        representativeRun.orders?.due_date ??
        "";
      const priority = representativeRun.orders?.priority ?? "normal";
      const plannedDate =
        runs
          .map((item) => item.planned_date)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null;
      const startedAt =
        runs
          .map((item) => item.started_at)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null;
      const doneAt =
        runs
          .map((item) => item.done_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
      const scopeEntries =
        trackingMode === "construction_level"
          ? dedupedItems.map((item) => {
              const matchedRun =
                runs.find((run) => matchesProductionItemToRun(item, run)) ??
                null;
              const scopeKey = getWorkSessionScopeKey(
                matchedRun?.id ?? representativeRun.id,
                item.id,
              );
              return {
                scopeKey,
                summary: workSessionScopeSummaryByKey.get(scopeKey) ?? null,
              };
            })
          : runs.map((run) => {
              const scopeKey = getWorkSessionScopeKey(run.id, null);
              return {
                scopeKey,
                summary: workSessionScopeSummaryByKey.get(scopeKey) ?? null,
              };
            });
      const scopeSummaries = scopeEntries.map((entry) => entry.summary);
      const involvedOperatorIds = new Set<string>();
      const operatorStatusGroups = createOperatorWorkStatusGroups();
      if (trackingMode === "construction_level") {
        dedupedItems.forEach((item) => {
          const matchedRun =
            runs.find((run) => matchesProductionItemToRun(item, run)) ?? null;
          const runId = matchedRun?.id ?? representativeRun.id;
          getInvolvedOperatorIdsForConstructionItem(runId, item).forEach(
            (operatorId) => involvedOperatorIds.add(operatorId),
          );
          mergeOperatorWorkStatusGroups(
            operatorStatusGroups,
            getOperatorStatusGroupsForConstructionItem(runId, item),
          );
        });
      } else {
        scopeEntries.forEach((entry) => {
          const operatorIds = involvedOperatorIdsByScope.get(entry.scopeKey);
          operatorIds?.forEach((operatorId) =>
            involvedOperatorIds.add(operatorId),
          );
          mergeOperatorWorkStatusGroups(
            operatorStatusGroups,
            operatorStatusGroupsByScope.get(entry.scopeKey),
          );
        });
      }
      const activeScopeCount = scopeSummaries.reduce(
        (sum, summary) => sum + (summary?.activeCount ?? 0),
        0,
      );
      const latestScopeStatus = scopeSummaries.reduce<
        BatchRunRow["status"] | null
      >((current, summary) => summary?.latestStatus ?? current, null);
      const earliestScopeStart =
        scopeSummaries
          .map((summary) => summary?.earliestStartedAt)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null;
      const latestScopeStop =
        scopeSummaries
          .map((summary) => summary?.latestStoppedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
      const durationMinutes =
        scopeSummaries.reduce(
          (sum, summary) => sum + Number(summary?.totalMinutes ?? 0),
          0,
        ) ||
        runs.reduce((sum, run) => sum + Number(run.duration_minutes ?? 0), 0);
      const durationSeconds =
        getElapsedSeconds(
          earliestScopeStart ?? startedAt,
          activeScopeCount > 0
            ? new Date(liveNowMs).toISOString()
            : (latestScopeStop ?? doneAt),
          liveNowMs,
        ) ||
        runs.reduce(
          (sum, run) => sum + Number(run.duration_minutes ?? 0) * 60,
          0,
        );
      const statusOrder: BatchRunRow["status"][] = [
        "blocked",
        "paused",
        "in_progress",
        "queued",
        "pending",
        "done",
      ];
      const areAllRunsDone =
        runs.length > 0 &&
        runs.every((candidateRun) => candidateRun.status === "done");
      const aggregatedStatus = areAllRunsDone
        ? "done"
        : activeScopeCount > 0
          ? "in_progress"
          : latestScopeStatus === "blocked" ||
              runs.some((candidateRun) => candidateRun.status === "blocked")
            ? "blocked"
            : latestScopeStatus === "paused" ||
                runs.some((candidateRun) => candidateRun.status === "paused")
              ? "paused"
              : (statusOrder.find((candidate) =>
                  runs.some(
                    (candidateRun) => candidateRun.status === candidate,
                  ),
                ) ?? representativeRun.status);
      const activeOperatorsCount = involvedOperatorIds.size;
      const hasOperatorActiveSession =
        trackingMode === "construction_level"
          ? dedupedItems.some((item) => {
              const matchedRun =
                runs.find((run) => matchesProductionItemToRun(item, run)) ??
                null;
              return hasActiveWorkSessionForItem(
                matchedRun?.id ?? representativeRun.id,
                item.id,
              );
            })
          : runs.some((run) => hasActiveWorkSessionForRun(run.id));
      const operatorSessionStatus =
        trackingMode === "construction_level"
          ? (() => {
              const statuses = dedupedItems
                .map((item) => {
                  const matchedRun =
                    runs.find((run) => matchesProductionItemToRun(item, run)) ??
                    null;
                  return getOwnWorkSessionStatus(
                    matchedRun?.id ?? representativeRun.id,
                    item.id,
                  );
                })
                .filter(Boolean) as BatchRunRow["status"][];
              return (
                statusOrder.find((candidate) => statuses.includes(candidate)) ??
                null
              );
            })()
          : (() => {
              const statuses = runs
                .map((run) => getOwnWorkSessionStatus(run.id, null))
                .filter(Boolean) as BatchRunRow["status"][];
              return (
                statusOrder.find((candidate) => statuses.includes(candidate)) ??
                null
              );
            })();
      const queueItem = {
        id: representativeRun.id,
        runIds: runs.map((item) => item.id),
        orderId: representativeRun.order_id,
        orderNumber,
        customerName,
        dueDate,
        priority,
        status: aggregatedStatus,
        plannedDate,
        batchCode: representativeRun.batch_code,
        totalQty,
        completedQty: progress.completedQty,
        constructionCount: itemCountProgress.totalQty,
        completedConstructionCount: itemCountProgress.completedQty,
        totalPiecesQty,
        material,
        attachments: mergeAttachments(
          attachmentsByOrder.get(representativeRun.order_id) ?? [],
          ...dedupedItems.map((item) => {
            const sourceKey = getProductionItemSourceKey(item) ?? "";
            const linkedOrderItemIds =
              orderItemIdsBySourceKey.get(sourceKey) ?? [];
            return mergeAttachments(
              ...linkedOrderItemIds.map(
                (orderItemId) =>
                  productionAttachmentsByItemId.get(orderItemId) ?? [],
              ),
            );
          }),
        ),
        startedAt: earliestScopeStart ?? startedAt,
        doneAt: activeScopeCount > 0 ? null : (latestScopeStop ?? doneAt),
        durationMinutes,
        durationSeconds,
        activeOperatorsCount,
        activeOperatorIds: Array.from(involvedOperatorIds),
        workingOperatorIds: Array.from(operatorStatusGroups.working),
        pausedOperatorIds: Array.from(operatorStatusGroups.paused),
        blockedOperatorIds: Array.from(operatorStatusGroups.blocked),
        hasOperatorActiveSession,
        operatorSessionStatus,
        items: effectiveDedupedItems,
        trackingMode,
        unitType,
        unitName,
        unitPosition,
      } satisfies QueueItem;
      const dedupeKey =
        trackingMode === "construction_level"
          ? groupedKey
          : `${stationId}:${representativeRun.order_id}`;
      const existing = queueItemByKey.get(dedupeKey);
      if (!existing) {
        queueItemByKey.set(dedupeKey, queueItem);
      } else {
        const existingDate = existing.plannedDate ?? "";
        const nextDate = queueItem.plannedDate ?? "";
        const shouldReplace =
          nextDate > existingDate ||
          (nextDate === existingDate &&
            (queueItem.startedAt ?? "") > (existing.startedAt ?? ""));
        if (shouldReplace) {
          queueItemByKey.set(dedupeKey, queueItem);
        }
      }
    });
    const stationItemsMap = new Map<string, QueueItem[]>();
    queueItemByKey.forEach((queueItem) => {
      const stationId =
        queueItem.runIds
          .map(
            (runId) =>
              batchRuns.find((run) => run.id === runId)?.station_id ?? "",
          )
          .find(Boolean) ?? "";
      const list = stationItemsMap.get(stationId) ?? [];
      list.push(queueItem);
      stationItemsMap.set(stationId, list);
    });

    stationItemsMap.forEach((items, stationId) => {
      const sourceBackedIdentities = new Set(
        items
          .filter((item) =>
            item.items.some((row) => Boolean(getProductionItemSourceKey(row))),
          )
          .map((item) => `${item.orderId}:${item.customerName}`),
      );

      const filteredItems = items.filter((item) => {
        const itemIdentity = `${item.orderId}:${item.customerName}`;
        const hasSourceBackedItems = item.items.some((row) =>
          Boolean(getProductionItemSourceKey(row)),
        );

        if (hasSourceBackedItems) {
          return true;
        }

        if (sourceBackedIdentities.has(itemIdentity)) {
          return false;
        }

        return true;
      });

      map.set(stationId, filteredItems);
    });
    return map;
  }, [
    attachmentsByOrder,
    batchRuns,
    getOwnWorkSessionStatus,
    hasActiveWorkSessionForItem,
    hasActiveWorkSessionForRun,
    getInvolvedOperatorIdsForConstructionItem,
    getOperatorStatusGroupsForConstructionItem,
    involvedOperatorIdsByScope,
    liveNowMs,
    operatorStatusGroupsByScope,
    orderItemIdsBySourceKey,
    orderItemPositionBySourceKey,
    orderItemQtyBySourceKey,
    productionAttachmentsByItemId,
    productionItems,
    t,
    visibleStations,
    workSessionScopeSummaryByKey,
  ]);

  const filteredQueueByStation = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    const query = searchQuery.trim().toLowerCase();
    visibleStations.forEach((station) => {
      const list = queueByStation.get(station.id) ?? [];
      const filtered = list.filter((item) => {
        if (orderFilter && item.orderId !== orderFilter) {
          return false;
        }
        if (
          !orderFilter &&
          item.operatorSessionStatus === "done" &&
          !item.hasOperatorActiveSession &&
          (item.status === "done" || (item.activeOperatorsCount ?? 0) > 0)
        ) {
          return false;
        }
        if (!orderFilter && selectedDate) {
          const filterDate = item.plannedDate ?? item.dueDate ?? null;
          if (
            filterDate &&
            (filterDate < selectedWeekStart || filterDate > selectedWeekEnd)
          ) {
            return false;
          }
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        if (priorityFilter !== "all" && item.priority !== priorityFilter) {
          return false;
        }
        if (
          onlyBlocked &&
          !item.items.some((row) => row.status === "blocked")
        ) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          item.orderNumber.toLowerCase().includes(query) ||
          item.batchCode.toLowerCase().includes(query) ||
          item.customerName.toLowerCase().includes(query)
        );
      });
      map.set(station.id, filtered);
    });
    return map;
  }, [
    queueByStation,
    visibleStations,
    searchQuery,
    statusFilter,
    priorityFilter,
    onlyBlocked,
    orderFilter,
    selectedDate,
    selectedWeekEnd,
    selectedWeekStart,
  ]);

  const queueItems = useMemo(
    () => Array.from(queueByStation.values()).flat(),
    [queueByStation],
  );

  const queueItemByOrderId = useMemo(() => {
    const map = new Map<string, QueueItem>();
    queueItems.forEach((item) => {
      if (!map.has(item.orderId)) {
        map.set(item.orderId, item);
      }
    });
    return map;
  }, [queueItems]);

  const queueItemById = useMemo(() => {
    const map = new Map<string, QueueItem>();
    queueItems.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [queueItems]);

  const quickActionItem = useMemo(() => {
    if (!quickActionOrderId) {
      return null;
    }
    const exactItem = queueItems.find((item) => {
      if (item.orderId !== quickActionOrderId) {
        return false;
      }
      if (quickActionItemId) {
        return item.items.some((row) => row.id === quickActionItemId);
      }
      if (quickActionRowKey) {
        return item.items.some(
          (row) => getProductionItemRowKey(row) === quickActionRowKey,
        );
      }
      if (quickActionRowIndex != null) {
        return item.items.some(
          (row) => getProductionItemRowIndex(row) === quickActionRowIndex,
        );
      }
      return false;
    });
    return exactItem ?? queueItemByOrderId.get(quickActionOrderId) ?? null;
  }, [
    queueItemByOrderId,
    queueItems,
    quickActionItemId,
    quickActionOrderId,
    quickActionRowIndex,
    quickActionRowKey,
  ]);
  const quickActionVisibleItems =
    quickActionItem?.trackingMode === "construction_level" &&
    quickActionItemId &&
    quickActionItem
      ? quickActionItem.items.filter((item) => item.id === quickActionItemId)
      : (quickActionItem?.items ?? []);
  const quickActionWorkingOperatorNames = quickActionItem
    ? getActiveOperatorNames(quickActionItem.workingOperatorIds ?? [])
    : [];
  const quickActionPausedOperatorNames = quickActionItem
    ? getActiveOperatorNames(quickActionItem.pausedOperatorIds ?? [])
    : [];
  const quickActionBlockedOperatorNames = quickActionItem
    ? getActiveOperatorNames(quickActionItem.blockedOperatorIds ?? [])
    : [];
  const quickActionHasBlockingDependenciesForBatch = useMemo(() => {
    if (!quickActionItem) {
      return false;
    }
    return quickActionItem.items.some((prodItem) => {
      const dependencyStations =
        dependenciesByStation.get(prodItem.station_id ?? "") ?? [];
      if (dependencyStations.length === 0) {
        return false;
      }
      const groupKey = getItemGroupKey(prodItem);
      return dependencyStations.some((depId) => {
        const depItem =
          itemsByGroupAndStation.get(groupKey)?.get(depId) ?? null;
        return depItem && depItem.status !== "done";
      });
    });
  }, [quickActionItem, dependenciesByStation, itemsByGroupAndStation]);

  const activitySummary = useMemo(() => {
    const todayStartIso = `${today}T00:00:00`;
    const tomorrow = new Date(`${today}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString();
    const sessionStarted = ownWorkSessions.filter(
      (row) => String(row.started_at ?? "").slice(0, 10) === today,
    ).length;
    const sessionDone = ownWorkSessions.filter(
      (row) =>
        row.ended_status === "done" &&
        String(row.stopped_at ?? "").slice(0, 10) === today,
    ).length;
    const sessionBlocked = ownWorkSessions.filter(
      (row) =>
        row.ended_status === "blocked" &&
        String(row.stopped_at ?? "").slice(0, 10) === today,
    ).length;
    const sessionMinutes = ownWorkSessions.reduce(
      (sum, session) =>
        sum +
        getProductionWorkSessionOverlapMinutes({
          session,
          range: {
            startAt: todayStartIso,
            endAt: tomorrowIso,
          },
          calendar: workingCalendar,
          nowMs: liveNowMs,
        }).totalMinutes,
      0,
    );
    const rawStarted =
      latestWorkEntries.filter(
        (entry) =>
          isSameDayIso(entry.startedAt, today) &&
          entry.status !== "queued" &&
          entry.status !== "pending",
      ).length +
      unmatchedBatchRuns.filter(
        (run) =>
          isSameDayIso(run.started_at ?? null, today) &&
          run.status !== "queued" &&
          run.status !== "pending",
      ).length;
    const rawDone =
      latestWorkEntries.filter((entry) => isSameDayIso(entry.doneAt, today))
        .length +
      unmatchedBatchRuns.filter((run) =>
        isSameDayIso(run.done_at ?? null, today),
      ).length;
    const rawBlocked =
      latestWorkEntries.filter((entry) => entry.status === "blocked").length +
      unmatchedBatchRuns.filter((run) => run.status === "blocked").length;
    const rawMinutes =
      latestWorkEntries.reduce(
        (sum, entry) =>
          sum +
          getOverlapWorkedMinutes({
            startIso: entry.startedAt,
            endIso: entry.doneAt,
            rangeStartIso: todayStartIso,
            rangeEndIso: tomorrowIso,
            calendar: workingCalendar,
            nowMs: liveNowMs,
          }),
        0,
      ) +
      unmatchedBatchRuns.reduce(
        (sum, run) =>
          sum +
          getOverlapWorkedMinutes({
            startIso: run.started_at ?? null,
            endIso: run.done_at ?? null,
            rangeStartIso: todayStartIso,
            rangeEndIso: tomorrowIso,
            calendar: workingCalendar,
            nowMs: liveNowMs,
          }),
        0,
      );

    return {
      started: Math.max(sessionStarted, rawStarted),
      done: Math.max(sessionDone, rawDone),
      blocked: Math.max(sessionBlocked, rawBlocked),
      minutes: Math.max(sessionMinutes, rawMinutes),
    };
  }, [
    latestWorkEntries,
    liveNowMs,
    today,
    unmatchedBatchRuns,
    ownWorkSessions,
    workingCalendar,
  ]);

  const weeklySummary = useMemo(() => {
    const weekStart = new Date(`${today}T00:00:00`);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartIso = weekStart.toISOString();
    const weekEnd = new Date(`${today}T00:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 1);
    const weekEndIso = weekEnd.toISOString();
    const sessionStarted = ownWorkSessions.filter((row) => {
      const time = Date.parse(row.started_at);
      return (
        Number.isFinite(time) &&
        time >= Date.parse(weekStartIso) &&
        time < Date.parse(weekEndIso)
      );
    }).length;
    const sessionDone = ownWorkSessions.filter((row) => {
      if (row.ended_status !== "done" || !row.stopped_at) {
        return false;
      }
      const time = Date.parse(row.stopped_at);
      return (
        Number.isFinite(time) &&
        time >= Date.parse(weekStartIso) &&
        time < Date.parse(weekEndIso)
      );
    }).length;
    const sessionBlocked = ownWorkSessions.filter((row) => {
      if (row.ended_status !== "blocked" || !row.stopped_at) {
        return false;
      }
      const time = Date.parse(row.stopped_at);
      return (
        Number.isFinite(time) &&
        time >= Date.parse(weekStartIso) &&
        time < Date.parse(weekEndIso)
      );
    }).length;
    const sessionMinutes = ownWorkSessions.reduce(
      (sum, session) =>
        sum +
        getProductionWorkSessionOverlapMinutes({
          session,
          range: {
            startAt: weekStartIso,
            endAt: weekEndIso,
          },
          calendar: workingCalendar,
          nowMs: liveNowMs,
        }).totalMinutes,
      0,
    );
    const isInWeek = (value: string | null | undefined) => {
      if (!value) {
        return false;
      }
      const time = Date.parse(value);
      return (
        Number.isFinite(time) &&
        time >= Date.parse(weekStartIso) &&
        time < Date.parse(weekEndIso)
      );
    };
    const rawStarted =
      latestWorkEntries.filter((entry) => isInWeek(entry.startedAt)).length +
      unmatchedBatchRuns.filter((run) => isInWeek(run.started_at ?? null))
        .length;
    const rawDone =
      latestWorkEntries.filter((entry) => isInWeek(entry.doneAt)).length +
      unmatchedBatchRuns.filter((run) => isInWeek(run.done_at ?? null)).length;
    const rawBlocked =
      latestWorkEntries.filter((entry) => entry.status === "blocked").length +
      unmatchedBatchRuns.filter((run) => run.status === "blocked").length;
    const rawMinutes =
      latestWorkEntries.reduce(
        (sum, entry) =>
          sum +
          getOverlapWorkedMinutes({
            startIso: entry.startedAt,
            endIso: entry.doneAt,
            rangeStartIso: weekStartIso,
            rangeEndIso: weekEndIso,
            calendar: workingCalendar,
            nowMs: liveNowMs,
          }),
        0,
      ) +
      unmatchedBatchRuns.reduce(
        (sum, run) =>
          sum +
          getOverlapWorkedMinutes({
            startIso: run.started_at ?? null,
            endIso: run.done_at ?? null,
            rangeStartIso: weekStartIso,
            rangeEndIso: weekEndIso,
            calendar: workingCalendar,
            nowMs: liveNowMs,
          }),
        0,
      );
    return {
      started: Math.max(sessionStarted, rawStarted),
      done: Math.max(sessionDone, rawDone),
      blocked: Math.max(sessionBlocked, rawBlocked),
      minutes: Math.max(sessionMinutes, rawMinutes),
    };
  }, [
    latestWorkEntries,
    liveNowMs,
    today,
    unmatchedBatchRuns,
    ownWorkSessions,
    workingCalendar,
  ]);

  const filteredItemsCount = useMemo(
    () =>
      Array.from(filteredQueueByStation.values()).reduce(
        (sum, list) => sum + list.length,
        0,
      ),
    [filteredQueueByStation],
  );
  const getScopedProductionItemId = (
    run: BatchRunRow,
    productionItemId?: string | null,
  ) => {
    if (
      (stations.find((station) => station.id === run.station_id)
        ?.trackingMode ?? "construction_level") === "construction_level"
    ) {
      return productionItemId ?? null;
    }
    return null;
  };

  const updateItemStatus = async (
    itemId: string,
    runId: string,
    status: BatchRunRow["status"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    const targetItem = productionItems.find((item) => item.id === itemId);
    if (!run || !targetItem) {
      return;
    }
    const now = new Date().toISOString();
    const wasBlocked =
      run.status === "blocked" || targetItem.status === "blocked";
    const wasPaused = run.status === "paused" || targetItem.status === "paused";
    const isResumed = (wasBlocked || wasPaused) && status === "in_progress";
    const scopeProductionItemId = getScopedProductionItemId(run, itemId);
    const transitionRunTo = async (toStatus: BatchRunRow["status"]) => {
      const result = await transitionBatchRunStatus(sb, {
        batchRunId: runId,
        toStatus,
        reason: extra?.reason ?? null,
        reasonId: extra?.reasonId ?? null,
        productionItemId: itemId,
        actorUserId: currentUser.id,
      });
      if (result.error) {
        setDataError(
          result.error.message ?? "Failed to transition batch run status.",
        );
        return null;
      }
      if (!result.data) {
        setDataError("No batch run returned from transition.");
        return null;
      }
      return result.data;
    };

    let transitionedRun: Awaited<ReturnType<typeof transitionRunTo>> = null;
    let appliedStatus = run.status;
    let nextRunStartedAt = run.started_at ?? null;
    let nextRunDoneAt = run.done_at ?? null;
    let nextRunDuration = run.duration_minutes ?? null;

    if (status === "in_progress") {
      if (run.status !== "in_progress") {
        transitionedRun = await transitionRunTo("in_progress");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? run.started_at ?? now;
        nextRunDoneAt = transitionedRun.done_at ?? run.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = "in_progress";
        nextRunStartedAt = run.started_at ?? now;
        nextRunDoneAt = null;
      }
      if (currentUser.tenantId) {
        const { data: startedSession, error: sessionError } =
          await startProductionWorkSession(sb, {
            tenantId: currentUser.tenantId,
            orderId: run.order_id,
            batchRunId: runId,
            productionItemId: scopeProductionItemId,
            stationId: run.station_id,
            operatorUserId: currentUser.id,
            startedAt: now,
          });
        if (sessionError) {
          setDataError(
            sessionError.message ?? "Failed to start production work session.",
          );
          return;
        }
        if (startedSession) {
          mergeWorkSessionRows([startedSession]);
        }
      }
    } else if (status === "paused") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSession(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: scopeProductionItemId,
          operatorUserId: currentUser.id,
          endedStatus: "paused",
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work session.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      const remainingSessions = await listActiveProductionWorkSessions(sb, {
        tenantId: currentUser.tenantId,
        batchRunId: runId,
        productionItemId: scopeProductionItemId,
      });
      if (remainingSessions.error) {
        setDataError(
          remainingSessions.error.message ??
            "Failed to load active production work sessions.",
        );
        return;
      }
      if ((remainingSessions.data?.length ?? 0) === 0) {
        transitionedRun = await transitionRunTo("paused");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? null;
        nextRunDoneAt = transitionedRun.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = "in_progress";
        nextRunStartedAt = run.started_at ?? null;
        nextRunDoneAt = null;
      }
    } else if (status === "done") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSession(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: scopeProductionItemId,
          operatorUserId: currentUser.id,
          endedStatus: "done",
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work session.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      const otherOpenStatus = getOtherOperatorsOpenStatus(
        runId,
        scopeProductionItemId,
        stoppedSessions,
      );
      if (!otherOpenStatus) {
        transitionedRun = await transitionRunTo("done");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? null;
        nextRunDoneAt = transitionedRun.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = otherOpenStatus;
        nextRunStartedAt = run.started_at ?? null;
        nextRunDoneAt = null;
      }
    } else if (status === "blocked") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSessions(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: scopeProductionItemId,
          endedStatus: status,
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work sessions.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      transitionedRun = await transitionRunTo(status);
      if (!transitionedRun) {
        return;
      }
      appliedStatus = transitionedRun.status as BatchRunRow["status"];
      nextRunStartedAt = transitionedRun.started_at ?? null;
      nextRunDoneAt = transitionedRun.done_at ?? null;
      nextRunDuration =
        typeof transitionedRun.duration_minutes === "number"
          ? transitionedRun.duration_minutes
          : (run.duration_minutes ?? null);
    } else {
      transitionedRun = await transitionRunTo(status);
      if (!transitionedRun) {
        return;
      }
      appliedStatus = transitionedRun.status as BatchRunRow["status"];
      nextRunStartedAt = transitionedRun.started_at ?? run.started_at ?? null;
      nextRunDoneAt = transitionedRun.done_at ?? run.done_at ?? null;
      nextRunDuration =
        typeof transitionedRun.duration_minutes === "number"
          ? transitionedRun.duration_minutes
          : (run.duration_minutes ?? null);
    }

    if (appliedStatus === "blocked" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber =
        run.orders?.order_number ?? t("production.main.common.order");
      const reason = extra?.reason ?? "Blocked";
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "blocked",
        title: `Blocked: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nReason: ${reason}\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          reason,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }
    if (isResumed && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber =
        run.orders?.order_number ?? t("production.main.common.order");
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "resumed",
        title: `Resumed: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nAction: Work resumed\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }
    if (appliedStatus === "done" && currentUser.tenantId) {
      const actorName = currentUser.name?.trim() || "Operator";
      const stationName = targetItem.station_id
        ? (stationsById.get(targetItem.station_id) ?? "Station")
        : "Station";
      const orderNumber =
        run.orders?.order_number ?? t("production.main.common.order");
      const roles =
        notificationRoles.length > 0
          ? notificationRoles
          : ["Production planner", "Admin", "Owner"];
      await sb.from("notifications").insert({
        tenant_id: currentUser.tenantId,
        user_id: null,
        audience_roles: roles.length > 0 ? roles : null,
        type: "done",
        title: `Done: ${orderNumber}`,
        body: `Item: ${targetItem.item_name}\nStation: ${stationName}\nAction: Work completed\nBy: ${actorName}`,
        data: {
          order_id: run.order_id,
          production_item_id: targetItem.id,
          station_id: targetItem.station_id,
          actor_name: actorName,
          actor_user_id: currentUser.id,
        },
      });
    }

    setBatchRuns((prev) =>
      prev.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              blocked_reason: transitionedRun?.blocked_reason ?? null,
              blocked_reason_id: transitionedRun?.blocked_reason_id ?? null,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      ),
    );
    const nextItems = productionItems.map((item) =>
      matchesProductionItemToRun(item, run)
        ? {
            ...item,
            qty:
              orderItemQtyBySourceKey.get(
                getProductionItemSourceKey(item) ?? "",
              ) ?? item.qty,
            status: appliedStatus,
            meta:
              appliedStatus === "done"
                ? {
                    ...((item.meta as Record<string, unknown> | null) ?? {}),
                    completedQty:
                      orderItemQtyBySourceKey.get(
                        getProductionItemSourceKey(item) ?? "",
                      ) ?? getProductionItemQuantity(item),
                  }
                : item.meta,
            started_at:
              appliedStatus === "in_progress"
                ? (nextRunStartedAt ?? now)
                : appliedStatus === "queued" ||
                    appliedStatus === "pending" ||
                    appliedStatus === "paused" ||
                    appliedStatus === "blocked"
                  ? null
                  : item.started_at,
            done_at:
              appliedStatus === "done"
                ? (nextRunDoneAt ?? now)
                : appliedStatus === "queued" ||
                    appliedStatus === "pending" ||
                    appliedStatus === "in_progress" ||
                    appliedStatus === "paused" ||
                    appliedStatus === "blocked"
                  ? null
                  : item.done_at,
          }
        : item,
    );
    setProductionItems(nextItems);
    publishProductionLiveEvent({
      type: "status-changed",
      runId,
      orderId: run.order_id,
      batchCode: run.batch_code,
      stationId: run.station_id,
      status: appliedStatus,
      startedAt: nextRunStartedAt,
      doneAt: nextRunDoneAt,
      durationMinutes: nextRunDuration,
      itemIds: collectRunItemIds(nextItems, run),
      changedAt: new Date().toISOString(),
    });

    if (appliedStatus === "done") {
      const nextRuns = batchRuns.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      );
      if (
        isOrderProductionComplete(
          nextRuns
            .filter((item) => item.order_id === run.order_id)
            .map((item) => ({
              status: item.status,
              stationId: item.station_id,
            })),
          rules.productionCompletionConfig,
        )
      ) {
        const totalDuration = nextRuns
          .filter((item) => item.order_id === run.order_id)
          .reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0);
        await sb
          .from("orders")
          .update({ production_duration_minutes: totalDuration })
          .eq("id", run.order_id);
      }
    }
  };

  const handleUserStatusUpdate = async (
    itemId: string,
    runId: string,
    status: PendingAction["action"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    if (pendingAction) {
      return;
    }
    if (
      status === "in_progress" &&
      !isWithinWorkingSchedule(new Date(liveNowMs), workingCalendar)
    ) {
      setDataError(t("production.operator.queue.outsideWorkingHours"));
      return;
    }
    if (status === "paused") {
      const targetItem = productionItems.find((item) => item.id === itemId);
      if (!targetItem || !hasActiveWorkSessionForItem(runId, itemId)) {
        return;
      }
    }
    setPendingAction({ itemId, action: status });
    try {
      await updateItemStatus(itemId, runId, status, extra);
    } finally {
      setPendingAction(null);
    }
  };

  const updateProductionItemCompletedQty = async (
    item: ProductionItemRow,
    completedQty: number,
  ) => {
    const sb = supabase;
    if (!sb) {
      return false;
    }
    const quantity = getProductionItemQuantity(item);
    const nextCompletedQty = Math.min(Math.max(completedQty, 0), quantity);
    const now = new Date().toISOString();
    const nextMeta = {
      ...((item.meta as Record<string, unknown> | null) ?? {}),
      completedQty: nextCompletedQty,
      lastCompletedQtyAt: now,
      lastCompletedQtyBy: currentUser.id,
    };

    const { error } = await sb
      .from("production_items")
      .update({
        meta: nextMeta,
      })
      .eq("id", item.id);

    if (error) {
      setDataError(error.message ?? "Failed to update completed quantity.");
      return false;
    }

    setProductionItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? {
              ...row,
              qty: quantity,
              meta: nextMeta,
            }
          : row,
      ),
    );
    return true;
  };

  const handleCompleteItemUnits = async (
    itemId: string,
    runId: string,
    unitsToComplete: number,
  ) => {
    if (pendingAction) {
      return;
    }
    const sb = supabase;
    if (!sb) {
      return;
    }
    const targetItemRaw = productionItems.find((item) => item.id === itemId);
    if (!targetItemRaw) {
      return;
    }
    const linkedQty = orderItemQtyBySourceKey.get(
      getProductionItemSourceKey(targetItemRaw) ?? "",
    );
    const targetItem = linkedQty
      ? { ...targetItemRaw, qty: linkedQty }
      : targetItemRaw;
    const remainingQty = getOperatorVisibleRemainingQty(targetItem);
    if (
      remainingQty <= 0 ||
      targetItem.status === "blocked" ||
      targetItem.status === "paused"
    ) {
      return;
    }
    const safeUnits = Math.min(
      Math.max(Math.floor(Number(unitsToComplete) || 1), 1),
      remainingQty,
    );
    const quantity = getProductionItemQuantity(targetItem);
    const nextCompletedQty =
      getOperatorVisibleCompletedQty(targetItem) + safeUnits;
    setPendingAction({ itemId, action: "done" });
    try {
      const run = batchRuns.find((item) => item.id === runId);
      const scopeProductionItemId = run
        ? getScopedProductionItemId(run, itemId)
        : itemId;
      const otherOpenStatus =
        nextCompletedQty >= quantity && run
          ? getOtherOperatorsOpenStatus(runId, scopeProductionItemId)
          : null;
      if (nextCompletedQty >= quantity && otherOpenStatus) {
        setCompleteMultipleQtyByItem((prev) => ({
          ...prev,
          [itemId]: "1",
        }));
        await updateItemStatus(itemId, runId, "done");
        return;
      }

      const saved = await updateProductionItemCompletedQty(
        targetItem,
        nextCompletedQty,
      );
      if (!saved) {
        return;
      }
      setCompleteMultipleQtyByItem((prev) => ({
        ...prev,
        [itemId]: "1",
      }));
      if (nextCompletedQty >= quantity) {
        await updateItemStatus(itemId, runId, "done");
      } else {
        if (run) {
          publishProductionLiveEvent({
            type: "status-changed",
            runId,
            orderId: run.order_id,
            batchCode: run.batch_code,
            stationId: run.station_id,
            status: run.status === "queued" ? "in_progress" : run.status,
            startedAt: targetItem.started_at ?? new Date().toISOString(),
            doneAt: null,
            durationMinutes: run.duration_minutes ?? null,
            itemIds: [targetItem.id],
            changedAt: new Date().toISOString(),
          });
        }
      }
    } finally {
      setPendingAction(null);
    }
  };

  const confirmDoneAction = async (options?: {
    title?: string | null;
    description?: string | null;
    confirmLabel?: string | null;
  }) => {
    return confirm({
      title:
        options?.title?.trim() || t("production.operator.doneConfirm.title"),
      description:
        options?.description?.trim() ||
        t("production.operator.doneConfirm.description"),
      confirmLabel:
        options?.confirmLabel?.trim() ||
        t("production.operator.doneConfirm.confirm"),
      cancelLabel: t("production.operator.common.cancel"),
      destructive: false,
    });
  };

  const handleConfirmedRunDone = async (
    runId: string,
    label?: string | null,
  ) => {
    const confirmed = await confirmDoneAction({
      description: label
        ? t("production.operator.doneConfirm.runDescription", {
            label,
          })
        : t("production.operator.doneConfirm.description"),
    });
    if (!confirmed) {
      return;
    }
    await handleRunStatusUpdate(runId, "done");
  };

  const handleConfirmedCompleteItemUnits = async (
    itemId: string,
    runId: string,
    unitsToComplete: number,
    label?: string | null,
  ) => {
    const confirmed = await confirmDoneAction({
      description:
        unitsToComplete > 1
          ? t("production.operator.doneConfirm.unitsDescription", {
              count: unitsToComplete,
              label:
                label?.trim() ||
                t("production.main.jobs.fallbackConstructionLabel"),
            })
          : label
            ? t("production.operator.doneConfirm.itemDescription", {
                label,
              })
            : t("production.operator.doneConfirm.description"),
    });
    if (!confirmed) {
      return;
    }
    await handleCompleteItemUnits(itemId, runId, unitsToComplete);
  };

  const handleRunOnlyStatusUpdate = async (
    runId: string,
    status: PendingRunAction["action"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    if (!run) {
      return;
    }
    if (status === "paused" && !hasActiveWorkSessionForRun(runId)) {
      return;
    }
    const now = new Date().toISOString();
    const transitionRunTo = async (toStatus: BatchRunRow["status"]) => {
      const result = await transitionBatchRunStatus(sb, {
        batchRunId: runId,
        toStatus,
        reason: extra?.reason ?? null,
        reasonId: extra?.reasonId ?? null,
        actorUserId: currentUser.id,
      });
      if (result.error) {
        setDataError(
          result.error.message ?? "Failed to transition batch run status.",
        );
        return null;
      }
      if (!result.data) {
        setDataError("No batch run returned from transition.");
        return null;
      }
      return result.data;
    };

    let transitionedRun: Awaited<ReturnType<typeof transitionRunTo>> = null;
    let appliedStatus = run.status;
    let nextRunStartedAt = run.started_at ?? null;
    let nextRunDoneAt = run.done_at ?? null;
    let nextRunDuration = run.duration_minutes ?? null;

    if (status === "in_progress") {
      if (run.status !== "in_progress") {
        transitionedRun = await transitionRunTo("in_progress");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? run.started_at ?? now;
        nextRunDoneAt = transitionedRun.done_at ?? run.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = "in_progress";
        nextRunStartedAt = run.started_at ?? now;
        nextRunDoneAt = null;
      }
      if (currentUser.tenantId) {
        const { data: startedSession, error: sessionError } =
          await startProductionWorkSession(sb, {
            tenantId: currentUser.tenantId,
            orderId: run.order_id,
            batchRunId: runId,
            productionItemId: null,
            stationId: run.station_id,
            operatorUserId: currentUser.id,
            startedAt: now,
          });
        if (sessionError) {
          setDataError(
            sessionError.message ?? "Failed to start production work session.",
          );
          return;
        }
        if (startedSession) {
          mergeWorkSessionRows([startedSession]);
        }
      }
    } else if (status === "paused") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSession(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: null,
          operatorUserId: currentUser.id,
          endedStatus: "paused",
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work session.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      const remainingSessions = await listActiveProductionWorkSessions(sb, {
        tenantId: currentUser.tenantId,
        batchRunId: runId,
        productionItemId: null,
      });
      if (remainingSessions.error) {
        setDataError(
          remainingSessions.error.message ??
            "Failed to load active production work sessions.",
        );
        return;
      }
      if ((remainingSessions.data?.length ?? 0) === 0) {
        transitionedRun = await transitionRunTo("paused");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? null;
        nextRunDoneAt = transitionedRun.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = "in_progress";
        nextRunStartedAt = run.started_at ?? null;
        nextRunDoneAt = null;
      }
    } else if (status === "done") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSession(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: null,
          operatorUserId: currentUser.id,
          endedStatus: "done",
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work session.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      const otherOpenStatus = getOtherOperatorsOpenStatus(
        runId,
        null,
        stoppedSessions,
      );
      if (!otherOpenStatus) {
        transitionedRun = await transitionRunTo("done");
        if (!transitionedRun) {
          return;
        }
        appliedStatus = transitionedRun.status as BatchRunRow["status"];
        nextRunStartedAt = transitionedRun.started_at ?? null;
        nextRunDoneAt = transitionedRun.done_at ?? null;
        nextRunDuration =
          typeof transitionedRun.duration_minutes === "number"
            ? transitionedRun.duration_minutes
            : (run.duration_minutes ?? null);
      } else {
        appliedStatus = otherOpenStatus;
        nextRunStartedAt = run.started_at ?? null;
        nextRunDoneAt = null;
      }
    } else if (status === "blocked") {
      if (!currentUser.tenantId) {
        return;
      }
      const { data: stoppedSessions, error: sessionError } =
        await stopProductionWorkSessions(sb, {
          tenantId: currentUser.tenantId,
          batchRunId: runId,
          productionItemId: null,
          endedStatus: status,
          stopReason: extra?.reason ?? null,
          stopReasonId: extra?.reasonId ?? null,
          stoppedAt: now,
        });
      if (sessionError) {
        setDataError(
          sessionError.message ?? "Failed to stop production work sessions.",
        );
        return;
      }
      mergeWorkSessionRows(stoppedSessions);
      transitionedRun = await transitionRunTo(status);
      if (!transitionedRun) {
        return;
      }
      appliedStatus = transitionedRun.status as BatchRunRow["status"];
      nextRunStartedAt = transitionedRun.started_at ?? null;
      nextRunDoneAt = transitionedRun.done_at ?? null;
      nextRunDuration =
        typeof transitionedRun.duration_minutes === "number"
          ? transitionedRun.duration_minutes
          : (run.duration_minutes ?? null);
    } else {
      transitionedRun = await transitionRunTo(status);
      if (!transitionedRun) {
        return;
      }
      appliedStatus = transitionedRun.status as BatchRunRow["status"];
      nextRunStartedAt = transitionedRun.started_at ?? run.started_at ?? null;
      nextRunDoneAt = transitionedRun.done_at ?? run.done_at ?? null;
      nextRunDuration =
        typeof transitionedRun.duration_minutes === "number"
          ? transitionedRun.duration_minutes
          : (run.duration_minutes ?? null);
    }

    setBatchRuns((prev) =>
      prev.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              blocked_reason: transitionedRun?.blocked_reason ?? null,
              blocked_reason_id: transitionedRun?.blocked_reason_id ?? null,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      ),
    );
    publishProductionLiveEvent({
      type: "status-changed",
      runId,
      orderId: run.order_id,
      batchCode: run.batch_code,
      stationId: run.station_id,
      status: appliedStatus,
      startedAt: nextRunStartedAt,
      doneAt: nextRunDoneAt,
      durationMinutes: nextRunDuration,
      itemIds: collectRunItemIds(productionItems, run),
      changedAt: new Date().toISOString(),
    });

    if (appliedStatus === "done") {
      const nextRuns = batchRuns.map((item) =>
        item.id === runId
          ? {
              ...item,
              status: appliedStatus,
              started_at: nextRunStartedAt,
              done_at: nextRunDoneAt,
              duration_minutes: nextRunDuration,
            }
          : item,
      );
      if (
        isOrderProductionComplete(
          nextRuns
            .filter((item) => item.order_id === run.order_id)
            .map((item) => ({
              status: item.status,
              stationId: item.station_id,
            })),
          rules.productionCompletionConfig,
        )
      ) {
        const totalDuration = nextRuns
          .filter((item) => item.order_id === run.order_id)
          .reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0);
        await sb
          .from("orders")
          .update({ production_duration_minutes: totalDuration })
          .eq("id", run.order_id);
      }
    }
  };

  const handleRunStatusUpdate = async (
    runId: string,
    status: PendingRunAction["action"],
    extra?: { reason?: string | null; reasonId?: string | null },
  ) => {
    if (pendingRunAction || pendingAction) {
      return;
    }
    if (
      status === "in_progress" &&
      !isWithinWorkingSchedule(new Date(liveNowMs), workingCalendar)
    ) {
      setDataError(t("production.operator.queue.outsideWorkingHours"));
      return;
    }
    const run = batchRuns.find((item) => item.id === runId);
    if (!run) {
      return;
    }
    const runTrackingMode =
      stations.find((station) => station.id === run.station_id)?.trackingMode ??
      "construction_level";
    const aggregatedQueueItem = queueItemById.get(runId);
    const targetRunIds =
      runTrackingMode === "construction_level"
        ? [runId]
        : (aggregatedQueueItem?.runIds ?? [runId]);
    const batchCodes = new Set(
      targetRunIds
        .map((targetRunId) => batchRuns.find((item) => item.id === targetRunId))
        .filter(Boolean)
        .map((item) => item!.batch_code),
    );
    const routeKeys = new Set(
      targetRunIds
        .map((targetRunId) => batchRuns.find((item) => item.id === targetRunId))
        .filter(Boolean)
        .map((item) => getBatchRunSourceKey(item!))
        .filter((value): value is string => Boolean(value)),
    );
    const runItems =
      aggregatedQueueItem?.items.filter((item) => {
        const itemSourceKey = getProductionItemSourceKey(item);
        if (itemSourceKey && routeKeys.size > 0) {
          return routeKeys.has(itemSourceKey);
        }
        return batchCodes.has(item.batch_code);
      }) ??
      productionItems.filter((item) => {
        if (routeKeys.size > 0) {
          const itemSourceKey = getProductionItemSourceKey(item);
          if (itemSourceKey) {
            return (
              item.order_id === run.order_id &&
              item.station_id === run.station_id &&
              routeKeys.has(itemSourceKey)
            );
          }
        }
        return matchesProductionItemToRun(item, run);
      });
    if (runTrackingMode !== "construction_level") {
      setPendingRunAction({ runId, action: status });
      try {
        for (const targetRunId of targetRunIds) {
          await handleRunOnlyStatusUpdate(targetRunId, status, extra);
        }
      } finally {
        setPendingRunAction(null);
      }
      return;
    }
    if (runItems.length === 0) {
      setPendingRunAction({ runId, action: status });
      try {
        for (const targetRunId of targetRunIds) {
          await handleRunOnlyStatusUpdate(targetRunId, status, extra);
        }
      } finally {
        setPendingRunAction(null);
      }
      return;
    }
    if (status === "done") {
      if (isFuturePlannedDate(run.planned_date ?? null)) {
        return;
      }
      const hasBlockingDependencies = runItems.some((prodItem) => {
        const dependencyStations =
          dependenciesByStation.get(prodItem.station_id ?? "") ?? [];
        if (dependencyStations.length === 0) {
          return false;
        }
        const groupKey = getItemGroupKey(prodItem);
        return dependencyStations.some((depId) => {
          const depItem =
            itemsByGroupAndStation.get(groupKey)?.get(depId) ?? null;
          return depItem && depItem.status !== "done";
        });
      });
      if (hasBlockingDependencies) {
        return;
      }
    }
    const targetItems = runItems.filter((item) => {
      if (status === "in_progress") {
        return item.status !== "done";
      }
      if (status === "done") {
        return item.status !== "done";
      }
      if (status === "blocked") {
        return item.status !== "done";
      }
      if (status === "paused") {
        return item.status === "in_progress";
      }
      return true;
    });
    if (targetItems.length === 0) {
      return;
    }
    setPendingRunAction({ runId, action: status });
    try {
      await updateItemStatus(targetItems[0].id, runId, status, extra);
    } finally {
      setPendingRunAction(null);
    }
  };

  const isActionLoading = (itemId: string, action: PendingAction["action"]) =>
    pendingAction?.itemId === itemId && pendingAction.action === action;
  const isRunActionLoading = (
    runId: string,
    action: PendingRunAction["action"],
  ) => pendingRunAction?.runId === runId && pendingRunAction.action === action;
  handleRunStatusUpdateRef.current = handleRunStatusUpdate;

  useEffect(() => {
    const now = new Date(liveNowMs);
    if (stations.length === 0 || Number.isNaN(now.getTime())) {
      autoPausedRunIdsRef.current.clear();
      autoPauseInFlightRunIdsRef.current.clear();
      return;
    }
    if (isWithinWorkingSchedule(now, workingCalendar)) {
      autoPausedRunIdsRef.current.clear();
      autoPauseInFlightRunIdsRef.current.clear();
      return;
    }
    if (pendingAction || pendingRunAction) {
      return;
    }

    const assignedStationIds = new Set(stations.map((station) => station.id));
    const activeRunIds = batchRuns
      .filter(
        (run) =>
          run.station_id &&
          assignedStationIds.has(run.station_id) &&
          run.status === "in_progress",
      )
      .map((run) => run.id);
    const runIdsToPause = activeRunIds.filter(
      (runId) =>
        !autoPausedRunIdsRef.current.has(runId) &&
        !autoPauseInFlightRunIdsRef.current.has(runId),
    );

    if (runIdsToPause.length === 0) {
      return;
    }

    const autoPauseReason = t("production.operator.paused.autoShiftEnded");
    let cancelled = false;

    const pauseActiveRuns = async () => {
      const runStatusUpdate = handleRunStatusUpdateRef.current;
      if (!runStatusUpdate) {
        return;
      }
      for (const runId of runIdsToPause) {
        if (cancelled) {
          return;
        }
        autoPauseInFlightRunIdsRef.current.add(runId);
        try {
          await runStatusUpdate(runId, "paused", {
            reason: autoPauseReason,
            reasonId: null,
          });
          if (!cancelled) {
            autoPausedRunIdsRef.current.add(runId);
          }
        } finally {
          autoPauseInFlightRunIdsRef.current.delete(runId);
        }
      }
    };

    void pauseActiveRuns();

    return () => {
      cancelled = true;
    };
  }, [
    batchRuns,
    liveNowMs,
    pendingAction,
    pendingRunAction,
    stations,
    t,
    workingCalendar,
  ]);

  useEffect(() => {
    if (!supabase || productionItems.length === 0) {
      return;
    }
    const updatesByRun = new Map<
      string,
      { itemId: string; runId: string; status: BatchRunRow["status"] }
    >();

    productionItems.forEach((item) => {
      if (!item.station_id) {
        return;
      }
      if (
        item.status === "in_progress" ||
        item.status === "paused" ||
        item.status === "done" ||
        item.status === "blocked"
      ) {
        return;
      }
      const dependencies = dependenciesByStation.get(item.station_id) ?? [];
      const run = batchRuns.find((candidate) =>
        matchesProductionItemToRun(item, candidate),
      );
      if (!run) {
        return;
      }
      if (dependencies.length === 0) {
        if (item.status === "pending") {
          updates.push({ itemId: item.id, runId: run.id, status: "queued" });
        }
        return;
      }
      const groupKey = getItemGroupKey(item);
      const stationMap = itemsByGroupAndStation.get(groupKey);
      const hasBlocking = dependencies.some((depId) => {
        const depItem = stationMap?.get(depId);
        return depItem && depItem.status !== "done";
      });
      const desiredStatus = hasBlocking ? "pending" : "queued";
      if (item.status !== desiredStatus) {
        const existing = updatesByRun.get(run.id);
        if (!existing) {
          updatesByRun.set(run.id, {
            itemId: item.id,
            runId: run.id,
            status: desiredStatus,
          });
        }
      }
    });

    const updates = Array.from(updatesByRun.values());
    if (updates.length === 0) {
      return;
    }
    updates.forEach((update) => {
      updateItemStatus(update.itemId, update.runId, update.status);
    });
    // `updateItemStatus` intentionally omitted to avoid recreating this side-effect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supabase,
    productionItems,
    dependenciesByStation,
    itemsByGroupAndStation,
    batchRuns,
  ]);

  const handleOpenBlocked = (runId: string, itemId?: string | null) => {
    setBlockedRunId(runId);
    setBlockedItemId(itemId ?? null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleOpenPaused = (runId: string, itemId?: string | null) => {
    setPausedRunId(runId);
    setPausedItemId(itemId ?? null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };

  const handleConfirmBlocked = async () => {
    if (!blockedRunId) {
      return;
    }
    const manual = blockedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === blockedReasonId)?.label ?? "";
    const reason = manual || selectedLabel || "Blocked";
    if (blockedItemId) {
      await handleUserStatusUpdate(blockedItemId, blockedRunId, "blocked", {
        reason,
        reasonId: blockedReasonId || null,
      });
    } else {
      await handleRunStatusUpdate(blockedRunId, "blocked", {
        reason,
        reasonId: blockedReasonId || null,
      });
    }
    setBlockedRunId(null);
    setBlockedItemId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };

  const handleConfirmPaused = async () => {
    if (!pausedRunId) {
      return;
    }
    const manual = pausedReasonText.trim();
    const selectedLabel =
      stopReasons.find((reason) => reason.id === pausedReasonId)?.label ?? "";
    const reason = manual || selectedLabel;
    if (!reason) {
      setPausedReasonError(t("production.operator.paused.reasonRequired"));
      return;
    }
    if (pausedItemId) {
      await handleUserStatusUpdate(pausedItemId, pausedRunId, "paused", {
        reason,
        reasonId: pausedReasonId || null,
      });
    } else {
      await handleRunStatusUpdate(pausedRunId, "paused", {
        reason,
        reasonId: pausedReasonId || null,
      });
    }
    setPausedRunId(null);
    setPausedItemId(null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };

  const closeQuickAction = () => {
    if (Date.now() < quickActionCloseGuardUntilRef.current) {
      return;
    }
    setIsQuickActionOpen(false);
    setQuickActionOrderId(null);
    setQuickActionItemId(null);
    setQuickActionRowKey(null);
    setQuickActionRowIndex(null);
    setPendingQuickAction(null);
  };

  const applyFiltersToUrl = (next?: {
    date?: string;
    status?: QueueStatusFilter;
    priority?: "all" | Priority;
    q?: string;
    blocked?: boolean;
  }) => {
    const dateValue = next?.date ?? selectedDate;
    const statusValue = next?.status ?? statusFilter;
    const priorityValue = next?.priority ?? priorityFilter;
    const queryValue = (next?.q ?? searchQuery).trim();
    const blockedValue = next?.blocked ?? onlyBlocked;
    setQueryParams({
      date: dateValue || null,
      dateFilter: dateValue ? "week" : null,
      status: statusValue === "all" ? null : statusValue,
      priority: priorityValue === "all" ? null : priorityValue,
      q: queryValue || null,
      blocked: blockedValue ? "1" : null,
      order: orderFilter ?? null,
      station: stationFilter ?? null,
    });
  };

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true);
    window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus({ preventScroll: true });
      mobileSearchInputRef.current?.select();
    });
  };

  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false);
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  };

  useEffect(() => {
    if (!quickActionOrderId || !quickActionItem) {
      return;
    }
    setIsQuickActionOpen(true);
  }, [quickActionOrderId, quickActionItem]);

  useEffect(() => {
    if (isScannerOpen || !pendingQuickAction) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setQuickActionOrderId(pendingQuickAction.orderId);
      setQuickActionRowKey(pendingQuickAction.rowKey);
      setQuickActionRowIndex(pendingQuickAction.rowIndex);
      if (
        pendingQuickAction.rowKey == null &&
        pendingQuickAction.rowIndex == null
      ) {
        setQuickActionItemId(null);
      }
      quickActionCloseGuardUntilRef.current = Date.now() + 400;
      setIsQuickActionOpen(true);
      setPendingQuickAction(null);
    }, 260);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isScannerOpen, pendingQuickAction]);

  useEffect(() => {
    if (!quickActionOrderId) {
      return;
    }
    const candidates = productionItems.filter((item) => {
      if (item.order_id !== quickActionOrderId) {
        return false;
      }
      if (quickActionRowKey) {
        return getProductionItemRowKey(item) === quickActionRowKey;
      }
      if (quickActionRowIndex != null) {
        return getProductionItemRowIndex(item) === quickActionRowIndex;
      }
      return false;
    });
    if (candidates.length === 0) {
      return;
    }
    const target = [...candidates].sort((a, b) => {
      const aTs = a.created_at ? Date.parse(a.created_at) : 0;
      const bTs = b.created_at ? Date.parse(b.created_at) : 0;
      return bTs - aTs;
    })[0];
    setQuickActionItemId(target.id);
  }, [
    quickActionOrderId,
    quickActionRowIndex,
    quickActionRowKey,
    productionItems,
  ]);

  const handleScannerResolved = async (result: ResolveScanTargetResult) => {
    const sb = supabase;
    if (!result.ok) {
      setScannerError(result.error);
      if (sb && currentUser.tenantId) {
        await sb.from("qr_scan_events").insert({
          tenant_id: currentUser.tenantId,
          user_id: currentUser.id,
          raw_value: result.rawValue,
          token: result.token ?? null,
          result: "error",
          message: result.error,
          target_route: null,
        });
      }
      return true;
    }
    setScannerError("");
    if (result.targetRoute.startsWith("/qr/")) {
      const message = t("production.operator.errors.qrNotInQueue");
      setScannerError(message);
      if (sb && currentUser.tenantId) {
        await sb.from("qr_scan_events").insert({
          tenant_id: currentUser.tenantId,
          user_id: currentUser.id,
          raw_value: result.rawValue,
          token: result.token,
          result: "error",
          message,
          target_route: result.targetRoute,
        });
      }
      return true;
    }
    const targetRoute =
      currentUser.role === "Operator" && result.orderId
        ? `/production/operator?${selectedDate ? `date=${encodeURIComponent(selectedDate)}&dateFilter=week&` : ""}order=${encodeURIComponent(result.orderId)}`
        : result.targetRoute;
    if (sb && currentUser.tenantId) {
      await sb.from("qr_scan_events").insert({
        tenant_id: currentUser.tenantId,
        user_id: currentUser.id,
        raw_value: result.rawValue,
        token: result.token,
        result: "success",
        message: null,
        target_route: targetRoute,
      });
    }
    if (currentUser.role === "Operator" && result.orderId) {
      const rowIndex =
        typeof result.rowIndex === "number" ? result.rowIndex : null;
      const rowKey =
        result.sourceRowId && result.fieldId
          ? `${result.orderId}:${result.fieldId}:${result.sourceRowId}`
          : null;
      setPendingQuickAction({
        orderId: result.orderId,
        rowKey,
        rowIndex,
      });
      setQueryParams({
        date: selectedDate || null,
        dateFilter: selectedDate ? "week" : null,
        status: statusFilter === "all" ? null : statusFilter,
        priority: priorityFilter === "all" ? null : priorityFilter,
        q: searchQuery.trim() || null,
        blocked: onlyBlocked ? "1" : null,
        order: result.orderId,
        station: stationFilter ?? null,
      });
      return true;
    }
    router.push(targetRoute);
    return true;
  };

  const userInitials = useMemo(() => {
    return currentUser.name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [currentUser.name]);

  const userRoleLabel = currentUser.isOwner
    ? `${currentUser.role} / ${t("profile.owner")}`
    : currentUser.role;

  if (!currentUser.isAuthenticated) {
    return null;
  }

  const selectedWeekNumber = getIsoWeekNumber(selectedWeekStart);

  const selectedWeekFilterLabel = `(${selectedWeekNumber} ${t("production.operator.filters.week")}) ${formatDate(selectedWeekStart)} - ${formatDate(selectedWeekEnd)}`;
  const selectedAllOrdersLabel = t("production.operator.filters.allOrders");
  const headerSubtitle = t("production.operator.header.subtitle", {
    date: selectedDate ? selectedWeekFilterLabel : selectedAllOrdersLabel,
  });
  const selectedWeekLabel = selectedDate
    ? `${formatDate(selectedWeekStart)} - ${formatDate(selectedWeekEnd)}`
    : selectedAllOrdersLabel;
  const isWithinWorkingHoursNow = isWithinWorkingSchedule(
    new Date(liveNowMs),
    workingCalendar,
  );
  const closeBlockedDialog = () => {
    setBlockedRunId(null);
    setBlockedItemId(null);
    setBlockedReasonId("");
    setBlockedReasonText("");
  };
  const closePausedDialog = () => {
    setPausedRunId(null);
    setPausedItemId(null);
    setPausedReasonId("");
    setPausedReasonText("");
    setPausedReasonError("");
  };
  const blockedDialogContent = (
    <div className="space-y-3 text-sm">
      <SelectField
        label={t("production.operator.blocked.reasonTemplate")}
        labelClassName="text-xs text-muted-foreground"
        value={blockedReasonId || "__none__"}
        onValueChange={(value) =>
          setBlockedReasonId(value === "__none__" ? "" : value)
        }
      >
        <Select
          value={blockedReasonId || "__none__"}
          onValueChange={(value) =>
            setBlockedReasonId(value === "__none__" ? "" : value)
          }
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue
              placeholder={t("production.operator.blocked.selectReason")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              {t("production.operator.blocked.selectReason")}
            </SelectItem>
            {stopReasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectField>
      <TextAreaField
        label={t("production.operator.blocked.manualNote")}
        labelClassName="text-xs text-muted-foreground"
        value={blockedReasonText}
        onChange={(event) => setBlockedReasonText(event.target.value)}
        placeholder={t("production.operator.blocked.customReasonPlaceholder")}
        className="min-h-22.5"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={closeBlockedDialog}>
          {t("production.operator.common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleConfirmBlocked}
          disabled={
            blockedItemId
              ? isActionLoading(blockedItemId, "blocked")
              : blockedRunId
                ? isRunActionLoading(blockedRunId, "blocked")
                : false
          }
          className="gap-2"
        >
          {(blockedItemId && isActionLoading(blockedItemId, "blocked")) ||
          (blockedRunId && isRunActionLoading(blockedRunId, "blocked")) ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
          {t("production.operator.common.save")}
        </Button>
      </div>
    </div>
  );
  const pausedDialogContent = (
    <div className="space-y-3 text-sm">
      <SelectField
        label={t("production.operator.paused.reasonTemplate")}
        labelClassName="text-xs text-muted-foreground"
        value={pausedReasonId || "__none__"}
        onValueChange={(value) =>
          setPausedReasonId(value === "__none__" ? "" : value)
        }
      >
        <Select
          value={pausedReasonId || "__none__"}
          onValueChange={(value) => {
            setPausedReasonId(value === "__none__" ? "" : value);
            if (pausedReasonError) {
              setPausedReasonError("");
            }
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue
              placeholder={t("production.operator.paused.selectReason")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              {t("production.operator.paused.selectReason")}
            </SelectItem>
            {stopReasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectField>
      <TextAreaField
        label={t("production.operator.paused.manualNote")}
        labelClassName="text-xs text-muted-foreground"
        value={pausedReasonText}
        onChange={(event) => {
          setPausedReasonText(event.target.value);
          if (pausedReasonError) {
            setPausedReasonError("");
          }
        }}
        placeholder={t("production.operator.paused.customReasonPlaceholder")}
        className="min-h-22.5"
      />
      {pausedReasonError ? (
        <div className="text-xs text-destructive">{pausedReasonError}</div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={closePausedDialog}>
          {t("production.operator.common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleConfirmPaused}
          disabled={
            pausedItemId
              ? isActionLoading(pausedItemId, "paused")
              : pausedRunId
                ? isRunActionLoading(pausedRunId, "paused")
                : false
          }
          className="gap-2"
        >
          {(pausedItemId && isActionLoading(pausedItemId, "paused")) ||
          (pausedRunId && isRunActionLoading(pausedRunId, "paused")) ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
          {t("production.operator.common.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <section className="relative flex flex-col gap-3 pt-16 md:pt-0">
      <MobilePageTitle
        title={t("production.operator.header.title")}
        subtitle={headerSubtitle}
        showCompact={showCompactMobileTitle}
        className="pt-6 pb-6"
        rightAction={
          isWarehouseQueueView ? null : (
            <button
              type="button"
              onClick={() => setIsProfilePanelOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm"
              aria-label={t("production.operator.profile.openPanel")}
            >
              <UserAvatar
                avatarUrl={currentUser.avatarUrl}
                name={currentUser.name}
                fallback={userInitials || "U"}
                sizeClass="h-9 w-9"
              />
            </button>
          )
        }
      />

      <DesktopPageHeader
        sticky
        title={t("production.operator.header.title")}
        subtitle={headerSubtitle}
        actions={
          isWarehouseQueueView ? null : (
            <button
              type="button"
              onClick={() => setIsProfilePanelOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40 md:inline-flex"
            >
              <UserAvatar
                avatarUrl={currentUser.avatarUrl}
                name={currentUser.name}
                fallback={userInitials || "U"}
                sizeClass="h-7 w-7"
              />
              <span className="max-w-56 truncate font-medium">
                {currentUser.name} ({userRoleLabel})
              </span>
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          )
        }
        className="top-0!"
      />

      {isWarehouseQueueView ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 text-sm md:grid-cols-4 md:p-4">
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.todayDone")}
            </div>
            <div className="text-lg font-semibold">{activitySummary.done}</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.todayTime")}
            </div>
            <div className="text-lg font-semibold">
              {formatDuration(activitySummary.minutes)}
            </div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.weekDone")}
            </div>
            <div className="text-lg font-semibold">{weeklySummary.done}</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {t("production.operator.profile.weekTime")}
            </div>
            <div className="text-lg font-semibold">
              {formatDuration(weeklySummary.minutes)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="hidden rounded-2xl border border-border bg-muted/10 p-4 md:block">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onBlur={() => applyFiltersToUrl({ q: searchQuery })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyFiltersToUrl({ q: searchQuery });
                }
              }}
              placeholder={t("production.operator.filters.searchPlaceholder")}
              icon="search"
              className="h-10"
            />
          </div>

          <div className="flex items-center gap-2 xl:ml-auto">
            <DatePicker
              value={selectedDate}
              displayValue={selectedWeekLabel}
              placeholder={t("production.operator.filters.week")}
              className="w-[280px] max-w-[34vw]"
              triggerClassName="h-10"
              onChange={(value) => applyFiltersToUrl({ date: value || "" })}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-full bg-background shadow-sm"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCodeIcon className="h-4 w-4" />
              {t("production.operator.filters.scan")}
            </Button>
            <FiltersDropdown
              label={
                hiddenFilterCount > 0
                  ? `${t("production.operator.filters.title")} (${hiddenFilterCount})`
                  : t("production.operator.filters.title")
              }
              className="h-10"
              contentClassName="w-[360px] p-4"
            >
              <div className="space-y-4">
                <SelectField
                  label={t("production.operator.filters.status")}
                  value={statusFilter}
                  onValueChange={(value) =>
                    applyFiltersToUrl({ status: value as QueueStatusFilter })
                  }
                >
                  <Select
                    value={statusFilter}
                    onValueChange={(value) =>
                      applyFiltersToUrl({ status: value as QueueStatusFilter })
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue
                        placeholder={t("production.operator.status.all")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SelectField>

                <SelectField
                  label={t("production.operator.filters.priority")}
                  value={priorityFilter}
                  onValueChange={(value) =>
                    applyFiltersToUrl({ priority: value as "all" | Priority })
                  }
                >
                  <Select
                    value={priorityFilter}
                    onValueChange={(value) =>
                      applyFiltersToUrl({
                        priority: value as "all" | Priority,
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue
                        placeholder={t("production.operator.priority.all")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SelectField>

                <button
                  type="button"
                  onClick={() =>
                    applyFiltersToUrl({ blocked: !onlyBlocked })
                  }
                  className={`inline-flex h-9 w-full items-center justify-center rounded-full border px-3 text-sm font-medium transition ${
                    onlyBlocked
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border bg-background text-foreground hover:bg-muted/50"
                  }`}
                >
                  {blockedOnlyLabel}
                </button>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto h-9"
                    onClick={() =>
                      setQueryParams({
                        date: null,
                        dateFilter: null,
                        station: stationFilter ?? null,
                        order: null,
                        status: null,
                        priority: null,
                        q: null,
                        blocked: null,
                      })
                    }
                  >
                    {t("production.operator.filters.reset")}
                  </Button>
                </div>
              </div>
            </FiltersDropdown>
          </div>
        </div>
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.started")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.started}
              </div>
            </div>
            <Badge variant="status-in_engineering">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.done")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.done}
              </div>
            </div>
            <Badge variant="status-ready_for_production">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.blocked")}
              </div>
              <div className="text-xl font-semibold">
                {activitySummary.blocked}
              </div>
            </div>
            <Badge variant="status-blocked">
              {t("production.operator.metrics.today")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("production.operator.metrics.workTime")}
              </div>
              <div className="text-xl font-semibold">
                {formatDuration(activitySummary.minutes)}
              </div>
            </div>
            <Badge variant="status-draft">
              {t("production.operator.metrics.accumulated")}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {dataError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.loadingQueue")}
        </div>
      ) : null}

      {!isLoading && visibleStations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.noStations")}
        </div>
      ) : null}

      {activityError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {activityError}
        </div>
      ) : null}

      {!isLoading && visibleStations.length > 0 && filteredItemsCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("production.operator.states.noItemsForFilters")}
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1">
        {visibleStations.map((station) => {
          const queue = filteredQueueByStation.get(station.id) ?? [];
          const stationTotalMinutes = queue.reduce(
            (sum, item) => sum + Number(item.durationMinutes ?? 0),
            0,
          );
          const stationCardCountLabel =
            station.trackingMode === "construction_level"
              ? t("production.operator.queue.constructionCardsCount", {
                  count: queue.length,
                })
              : t("production.operator.queue.orderCardsCount", {
                  count: queue.length,
                });
          return (
            <Card key={station.id} className="min-h-60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{station.name}</CardTitle>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{stationCardCountLabel}</div>
                    {stationTotalMinutes > 0 ? (
                      <div>{formatDuration(stationTotalMinutes)}</div>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {queue.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("production.operator.queue.noWorkQueued")}
                  </div>
                ) : (
                  queue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-sm"
                    >
                      {(() => {
                        const isConstructionTracking =
                          item.trackingMode === "construction_level";
                        const isReceiptOnlyTracking =
                          item.trackingMode === "receipt_only";
                        const metaParts: string[] = [];
                        if (
                          !isConstructionTracking &&
                          (item.constructionCount ?? 0) > 0
                        ) {
                          metaParts.push(
                            t("production.operator.queue.constructionEntries", {
                              count: item.constructionCount ?? 0,
                            }),
                          );
                        }
                        if (
                          !isConstructionTracking &&
                          (item.totalPiecesQty ?? 0) > 0
                        ) {
                          metaParts.push(
                            t("production.operator.queue.totalPieces", {
                              count: item.totalPiecesQty ?? 0,
                            }),
                          );
                        }
                        if (isConstructionTracking && item.totalQty > 0) {
                          metaParts.push(
                            t("production.operator.queue.pieces", {
                              count: item.totalQty,
                            }),
                          );
                        }
                        if (item.dueDate) {
                          metaParts.push(
                            t("production.operator.queue.dueDate", {
                              date: formatDate(item.dueDate),
                            }),
                          );
                        }
                        const metaLine = metaParts.join(" - ");
                        const orderDurationMinutes = !isConstructionTracking
                          ? Number(item.durationMinutes ?? 0)
                          : 0;
                        const orderDurationSeconds = !isConstructionTracking
                          ? Number(item.durationSeconds ?? 0)
                          : 0;
                        const ownOrderDurationSeconds = !isConstructionTracking
                          ? item.runIds.reduce(
                              (sum, runId) =>
                                sum +
                                (ownWorkSessionSecondsByScope.get(
                                  getWorkSessionScopeKey(runId, null),
                                ) ?? 0),
                              0,
                            )
                          : 0;
                        const visibleOwnOrderDurationSeconds =
                          orderDurationSeconds > 0
                            ? Math.min(
                                ownOrderDurationSeconds,
                                orderDurationSeconds,
                              )
                            : ownOrderDurationSeconds;
                        const ownOrderDurationLabel =
                          visibleOwnOrderDurationSeconds > 0
                            ? formatLiveDuration(visibleOwnOrderDurationSeconds)
                            : null;
                        const hasBatchStarted =
                          Boolean(item.startedAt) ||
                          item.status === "in_progress" ||
                          item.status === "paused";
                        const isBatchBlocked = item.status === "blocked";
                        const isBatchPaused = item.status === "paused";
                        const isBatchDone = item.status === "done";
                        const completedQty = item.completedQty ?? 0;
                        const progressTotalQty = Math.max(item.totalQty, 1);
                        const batchStartLockedByDate =
                          !hasBatchStarted &&
                          !isBatchBlocked &&
                          !isBatchPaused &&
                          isFuturePlannedDate(item.plannedDate);
                        const hasBlockingDependenciesForBatch = item.items.some(
                          (prodItem) => {
                            const dependencyStations =
                              dependenciesByStation.get(
                                prodItem.station_id ?? "",
                              ) ?? [];
                            if (dependencyStations.length === 0) {
                              return false;
                            }
                            const groupKey = getItemGroupKey(prodItem);
                            return dependencyStations.some((depId) => {
                              const depItem =
                                itemsByGroupAndStation
                                  .get(groupKey)
                                  ?.get(depId) ?? null;
                              return depItem && depItem.status !== "done";
                            });
                          },
                        );
                        const isBatchCompleting = isRunActionLoading(
                          item.id,
                          "done",
                        );
                        const customerName = item.customerName?.trim() ?? "";
                        const materialName = item.material?.trim() ?? "";
                        const showMaterialName =
                          materialName.length > 0 &&
                          materialName.toLowerCase() !==
                            customerName.toLowerCase() &&
                          materialName.toLowerCase() !==
                            item.orderNumber.toLowerCase();
                        const displayFields = buildProductionDisplayEntries(
                          item.items,
                          productionDisplayFields,
                          {
                            limit: isConstructionTracking ? 2 : 3,
                            excludeValues: [
                              item.orderNumber,
                              item.customerName,
                              item.unitPosition ?? "",
                              item.unitName ?? "",
                            ],
                          },
                        );
                        const workingOperatorNames = getActiveOperatorNames(
                          item.workingOperatorIds ?? [],
                        );
                        const pausedOperatorNames = getActiveOperatorNames(
                          item.pausedOperatorIds ?? [],
                        );
                        const blockedOperatorNames = getActiveOperatorNames(
                          item.blockedOperatorIds ?? [],
                        );
                        return (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-semibold">
                                  {item.orderNumber}
                                </span>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {item.customerName}
                                </div>

                                {displayFields.length > 0 ? (
                                  <div className="mt-1.5 space-y-0.5 text-[11px] leading-5 text-muted-foreground">
                                    {displayFields.map((entry) => (
                                      <div key={`${item.id}:${entry.label}`}>
                                        <span className="font-medium text-foreground">
                                          {entry.label}:
                                        </span>{" "}
                                        <span>{entry.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                {!isConstructionTracking ? (
                                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {`${completedQty}/${progressTotalQty}`}
                                  </span>
                                ) : null}
                                <Badge variant={priorityBadge(item.priority)}>
                                  {priorityLabel(item.priority)}
                                </Badge>
                                <Badge variant={statusBadge(item.status)}>
                                  {runStatusLabel(item.status ?? "queued")}
                                </Badge>
                              </div>
                            </div>
                            {isConstructionTracking &&
                            (item.unitPosition ||
                              item.unitType ||
                              item.unitName) ? (
                              <div className="mt-1.5 flex w-full justify-between gap-3 text-[12px] leading-5">
                                <div className="min-w-0 space-y-0.5">
                                  {item.unitName ? (
                                    <div className="font-medium text-foreground">
                                      {item.unitPosition
                                        ? `${t("production.main.jobs.position")}: ${item.unitPosition} | ${item.unitName}`
                                        : item.unitName}
                                    </div>
                                  ) : null}
                                </div>
                                <div>
                                  <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    {t(
                                      "production.operator.queue.constructionModeBadge",
                                    )}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                            {metaLine ? (
                              <div className="mt-1 text-muted-foreground">
                                {metaLine}
                              </div>
                            ) : null}
                            {showMaterialName && !isConstructionTracking ? (
                              <div className="mt-1 text-muted-foreground">
                                {item.material}
                              </div>
                            ) : null}
                            {!isConstructionTracking &&
                            item.activeOperatorsCount &&
                            item.activeOperatorsCount > 0 ? (
                              <>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {t(
                                    "production.operator.queue.activeOperators",
                                    {
                                      count: item.activeOperatorsCount,
                                    },
                                  )}
                                </div>
                                {workingOperatorNames.length > 0 ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {t(
                                      "production.operator.queue.workingOperators",
                                      {
                                        names: workingOperatorNames.join(", "),
                                      },
                                    )}
                                  </div>
                                ) : null}
                                {pausedOperatorNames.length > 0 ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {t(
                                      "production.operator.queue.pausedOperators",
                                      {
                                        names: pausedOperatorNames.join(", "),
                                      },
                                    )}
                                  </div>
                                ) : null}
                                {blockedOperatorNames.length > 0 ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {t(
                                      "production.operator.queue.blockedOperators",
                                      {
                                        names: blockedOperatorNames.join(", "),
                                      },
                                    )}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                            {!isConstructionTracking &&
                            item.operatorSessionStatus ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.myStatus", {
                                  status: runStatusLabel(
                                    item.operatorSessionStatus,
                                  ),
                                })}
                              </div>
                            ) : null}
                            {!isConstructionTracking &&
                            ownOrderDurationLabel ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.myTime", {
                                  value: ownOrderDurationLabel,
                                })}
                              </div>
                            ) : null}
                            {orderDurationSeconds > 0 ||
                            orderDurationMinutes > 0 ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {t("production.operator.queue.orderTime")}{" "}
                                {orderDurationSeconds > 0
                                  ? formatLiveDuration(orderDurationSeconds)
                                  : formatDuration(orderDurationMinutes)}
                              </div>
                            ) : null}
                            {item.items.length > 0 && isConstructionTracking ? (
                              <div className="mt-3">
                                <div className="space-y-2">
                                  {item.items.map((prodItem) => {
                                    const blockedReason =
                                      (
                                        prodItem.meta as Record<
                                          string,
                                          unknown
                                        > | null
                                      )?.blocked_reason ?? null;
                                    const pausedReason =
                                      (
                                        prodItem.meta as Record<
                                          string,
                                          unknown
                                        > | null
                                      )?.paused_reason ?? null;
                                    const groupKey = getItemGroupKey(prodItem);
                                    const dependencyStations =
                                      dependenciesByStation.get(
                                        prodItem.station_id ?? "",
                                      ) ?? [];
                                    const blockingDependencies =
                                      dependencyStations
                                        .map((depId) => {
                                          const depItem =
                                            itemsByGroupAndStation
                                              .get(groupKey)
                                              ?.get(depId) ?? null;
                                          if (
                                            !depItem ||
                                            depItem.status === "done"
                                          ) {
                                            return null;
                                          }
                                          return {
                                            stationId: depId,
                                            status: depItem.status,
                                          };
                                        })
                                        .filter(Boolean) as Array<{
                                        stationId: string;
                                        status: ProductionItemRow["status"];
                                      }>;
                                    const hasBlockingDependencies =
                                      blockingDependencies.length > 0;
                                    const {
                                      effectiveStatus,
                                      matchedRun,
                                      scopeSummary,
                                    } = resolveConstructionItemState(
                                      prodItem,
                                      item,
                                      batchRuns,
                                      workSessionScopeSummaryByKey,
                                    );
                                    const infoRunId = matchedRun?.id ?? item.id;
                                    const infoScopeKey = getWorkSessionScopeKey(
                                      infoRunId,
                                      prodItem.id,
                                    );
                                    const activeOperatorIds =
                                      getInvolvedOperatorIdsForConstructionItem(
                                        infoRunId,
                                        prodItem,
                                      );
                                    const activeOperatorCount =
                                      activeOperatorIds.size;
                                    const operatorStatusGroups =
                                      getOperatorStatusGroupsForConstructionItem(
                                        infoRunId,
                                        prodItem,
                                      );
                                    const workingOperatorNames =
                                      getActiveOperatorNames(
                                        operatorStatusGroups.working,
                                      );
                                    const pausedOperatorNames =
                                      getActiveOperatorNames(
                                        operatorStatusGroups.paused,
                                      );
                                    const blockedOperatorNames =
                                      getActiveOperatorNames(
                                        operatorStatusGroups.blocked,
                                      );
                                    const ownSessionStatus =
                                      getOwnWorkSessionStatus(
                                        infoRunId,
                                        prodItem.id,
                                      );
                                    const ownElapsedSeconds =
                                      ownWorkSessionSecondsByScope.get(
                                        infoScopeKey,
                                      ) ?? 0;
                                    const visibleOwnElapsedSeconds =
                                      Number(
                                        scopeSummary?.elapsedSeconds ?? 0,
                                      ) > 0
                                        ? Math.min(
                                            ownElapsedSeconds,
                                            Number(
                                              scopeSummary?.elapsedSeconds ?? 0,
                                            ),
                                          )
                                        : ownElapsedSeconds;
                                    const ownElapsedLabel =
                                      visibleOwnElapsedSeconds > 0
                                        ? formatLiveDuration(
                                            visibleOwnElapsedSeconds,
                                          )
                                        : null;
                                    const itemElapsedLabel =
                                      Number(
                                        scopeSummary?.elapsedSeconds ?? 0,
                                      ) > 0
                                        ? formatLiveDuration(
                                            Number(
                                              scopeSummary?.elapsedSeconds ?? 0,
                                            ),
                                          )
                                        : null;
                                    const itemQuantity =
                                      getProductionItemQuantity(prodItem);
                                    const itemCompletedQty =
                                      getOperatorVisibleCompletedQty(prodItem);
                                    const itemRemainingQty =
                                      getOperatorVisibleRemainingQty(prodItem);
                                    const showConstructionItemHeader =
                                      item.items.length > 1;
                                    const itemPosition =
                                      getProductionItemMetaPosition(prodItem) ??
                                      orderItemPositionBySourceKey.get(
                                        getProductionItemSourceKey(prodItem) ??
                                          "",
                                      ) ??
                                      null;
                                    return (
                                      <div
                                        key={prodItem.id}
                                        className="space-y-2"
                                      >
                                        {showConstructionItemHeader ? (
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-[11px] text-muted-foreground">
                                              {itemPosition
                                                ? `${t("production.main.jobs.position")}: ${itemPosition} | ${prodItem.item_name}`
                                                : prodItem.item_name}
                                            </div>
                                            <Badge
                                              variant={statusBadge(
                                                (effectiveStatus ??
                                                  "queued") as BatchRunRow["status"],
                                              )}
                                            >
                                              {runStatusLabel(
                                                (effectiveStatus ??
                                                  "queued") as BatchRunRow["status"],
                                              )}
                                            </Badge>
                                          </div>
                                        ) : null}
                                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                          <div>
                                            {t(
                                              "production.operator.queue.constructionReadyProgress",
                                              {
                                                completed: itemCompletedQty,
                                                total: itemQuantity,
                                              },
                                            )}
                                          </div>
                                          {prodItem.material ? (
                                            <div>{prodItem.material}</div>
                                          ) : null}
                                          {activeOperatorCount > 0 ? (
                                            <>
                                              <div>
                                                {t(
                                                  "production.operator.queue.activeOperators",
                                                  {
                                                    count: activeOperatorCount,
                                                  },
                                                )}
                                              </div>
                                              {workingOperatorNames.length >
                                              0 ? (
                                                <div>
                                                  {t(
                                                    "production.operator.queue.workingOperators",
                                                    {
                                                      names:
                                                        workingOperatorNames.join(
                                                          ", ",
                                                        ),
                                                    },
                                                  )}
                                                </div>
                                              ) : null}
                                              {pausedOperatorNames.length >
                                              0 ? (
                                                <div>
                                                  {t(
                                                    "production.operator.queue.pausedOperators",
                                                    {
                                                      names:
                                                        pausedOperatorNames.join(
                                                          ", ",
                                                        ),
                                                    },
                                                  )}
                                                </div>
                                              ) : null}
                                              {blockedOperatorNames.length >
                                              0 ? (
                                                <div>
                                                  {t(
                                                    "production.operator.queue.blockedOperators",
                                                    {
                                                      names:
                                                        blockedOperatorNames.join(
                                                          ", ",
                                                        ),
                                                    },
                                                  )}
                                                </div>
                                              ) : null}
                                            </>
                                          ) : null}
                                          {ownSessionStatus ? (
                                            <div>
                                              {t(
                                                "production.operator.queue.myStatus",
                                                {
                                                  status: runStatusLabel(
                                                    ownSessionStatus ??
                                                      "queued",
                                                  ),
                                                },
                                              )}
                                            </div>
                                          ) : null}
                                          {ownElapsedLabel ? (
                                            <div>
                                              {t(
                                                "production.operator.queue.myTime",
                                                {
                                                  value: ownElapsedLabel,
                                                },
                                              )}
                                            </div>
                                          ) : null}
                                        </div>
                                        {hasBlockingDependencies ? (
                                          <div className="mt-2 space-y-1">
                                            <div className="text-[11px] text-amber-600">
                                              {t(
                                                "production.operator.queue.waitingFor",
                                              )}
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {blockingDependencies.map(
                                                (dep) => {
                                                  const name =
                                                    stationsById.get(
                                                      dep.stationId,
                                                    ) ??
                                                    t(
                                                      "production.operator.queue.stationFallback",
                                                    );
                                                  return (
                                                    <span
                                                      key={dep.stationId}
                                                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                                                    >
                                                      {name} -{" "}
                                                      {runStatusLabel(
                                                        dep.status,
                                                      )}
                                                    </span>
                                                  );
                                                },
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                        {itemElapsedLabel ? (
                                          <div className="mt-1 text-[11px] text-muted-foreground">
                                            {t(
                                              "production.operator.queue.constructionTime",
                                              {
                                                value: itemElapsedLabel,
                                              },
                                            )}
                                          </div>
                                        ) : null}
                                        {prodItem.status === "blocked" &&
                                        blockedReason ? (
                                          <div className="mt-1 text-[11px] text-rose-600">
                                            {t(
                                              "production.operator.queue.blockedReason",
                                              {
                                                reason: String(blockedReason),
                                              },
                                            )}
                                          </div>
                                        ) : null}
                                        {prodItem.status === "paused" &&
                                        pausedReason ? (
                                          <div className="mt-1 text-[11px] text-amber-600">
                                            {t(
                                              "production.operator.queue.pausedReason",
                                              {
                                                reason: String(pausedReason),
                                              },
                                            )}
                                          </div>
                                        ) : null}
                                        <div className="mt-3 rounded-md border border-border bg-muted/20 px-2 py-2">
                                          <div className="text-[11px] text-muted-foreground">
                                            {t(
                                              "production.operator.queue.constructionActions",
                                            )}
                                          </div>
                                          <div className="mt-2 flex items-stretch gap-2">
                                            {(() => {
                                              const {
                                                effectiveStatus,
                                                effectiveStartedAt,
                                                matchedRun,
                                              } = resolveConstructionItemState(
                                                prodItem,
                                                item,
                                                batchRuns,
                                                workSessionScopeSummaryByKey,
                                              );
                                              const actionRunId =
                                                matchedRun?.id ?? item.id;
                                              const hasOperatorActiveSession =
                                                hasActiveWorkSessionForItem(
                                                  actionRunId,
                                                  prodItem.id,
                                                );
                                              const hasOperatorCompletedSession =
                                                ownSessionStatus === "done" &&
                                                (effectiveStatus === "done" ||
                                                  activeOperatorCount > 0);
                                              const hasStarted =
                                                Boolean(effectiveStartedAt) ||
                                                effectiveStatus ===
                                                  "in_progress" ||
                                                effectiveStatus === "paused";
                                              const isBlocked =
                                                effectiveStatus === "blocked";
                                              const isPaused =
                                                effectiveStatus === "paused";
                                              const shouldResumeOwnSession =
                                                ownSessionStatus === "paused" ||
                                                ownSessionStatus === "blocked";
                                              const startLockedByDate =
                                                !hasStarted &&
                                                !isBlocked &&
                                                isFuturePlannedDate(
                                                  item.plannedDate,
                                                );
                                              const startLockedByWorkHours =
                                                !hasOperatorActiveSession &&
                                                !isWithinWorkingHoursNow;
                                              const isDone =
                                                effectiveStatus === "done";
                                              const isStarting =
                                                isActionLoading(
                                                  prodItem.id,
                                                  "in_progress",
                                                );
                                              const isPausing = isActionLoading(
                                                prodItem.id,
                                                "paused",
                                              );
                                              const isCompleting =
                                                isActionLoading(
                                                  prodItem.id,
                                                  "done",
                                                );
                                              return (
                                                <>
                                                  <Button
                                                    variant={
                                                      hasOperatorActiveSession
                                                        ? "secondary"
                                                        : "default"
                                                    }
                                                    size="sm"
                                                    className={
                                                      operatorPrimaryActionClass
                                                    }
                                                    disabled={
                                                      isDone ||
                                                      hasOperatorCompletedSession ||
                                                      startLockedByDate ||
                                                      startLockedByWorkHours ||
                                                      (!isBlocked &&
                                                        !isPaused &&
                                                        hasBlockingDependencies) ||
                                                      (hasOperatorActiveSession
                                                        ? isPausing
                                                        : isStarting)
                                                    }
                                                    onClick={() =>
                                                      hasOperatorActiveSession
                                                        ? handleOpenPaused(
                                                            actionRunId,
                                                            prodItem.id,
                                                          )
                                                        : handleUserStatusUpdate(
                                                            prodItem.id,
                                                            actionRunId,
                                                            "in_progress",
                                                          )
                                                    }
                                                  >
                                                    {hasOperatorActiveSession ? (
                                                      isPausing ? (
                                                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                                      ) : (
                                                        <PauseIcon className="h-4 w-4" />
                                                      )
                                                    ) : isStarting ? (
                                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                                    ) : (
                                                      <PlayIcon className="h-4 w-4" />
                                                    )}
                                                    {isBlocked ||
                                                    isPaused ||
                                                    shouldResumeOwnSession
                                                      ? t(
                                                          "production.operator.actions.resume",
                                                        )
                                                      : hasOperatorActiveSession
                                                        ? t(
                                                            "production.operator.actions.pause",
                                                          )
                                                        : t(
                                                            "production.operator.actions.start",
                                                          )}
                                                  </Button>
                                                  {startLockedByDate &&
                                                  item.plannedDate ? (
                                                    <span className="self-center text-[10px] text-amber-600">
                                                      {t(
                                                        "production.operator.queue.availableOn",
                                                        {
                                                          date: formatDate(
                                                            item.plannedDate,
                                                          ),
                                                        },
                                                      )}
                                                    </span>
                                                  ) : null}
                                                  {itemRemainingQty > 1 ? (
                                                    <Popover>
                                                      <PopoverTrigger asChild>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          className={`${operatorSuccessActionClass} justify-between`}
                                                          disabled={
                                                            !hasOperatorActiveSession ||
                                                            isDone ||
                                                            isBlocked ||
                                                            isPaused ||
                                                            isCompleting
                                                          }
                                                        >
                                                          {isCompleting ? (
                                                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                                          ) : (
                                                            <CheckCheckIcon className="h-4 w-4" />
                                                          )}
                                                          {t(
                                                            "production.operator.actions.done",
                                                          )}
                                                          <ChevronDownIcon className="h-3.5 w-3.5" />
                                                        </Button>
                                                      </PopoverTrigger>
                                                      <PopoverContent className="w-64 p-3">
                                                        <div className="space-y-3">
                                                          <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="h-10 w-full justify-start rounded-lg px-3 text-left font-semibold"
                                                            onClick={() =>
                                                              void handleConfirmedCompleteItemUnits(
                                                                prodItem.id,
                                                                item.id,
                                                                1,
                                                                prodItem.item_name,
                                                              )
                                                            }
                                                          >
                                                            {t(
                                                              "production.operator.actions.completeOne",
                                                            )}
                                                          </Button>
                                                          <div className="rounded-md border border-border p-2">
                                                            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                                                              {t(
                                                                "production.operator.queue.remainingQty",
                                                                {
                                                                  count:
                                                                    itemRemainingQty,
                                                                },
                                                              )}
                                                            </div>
                                                            <div className="space-y-2">
                                                              <Input
                                                                type="number"
                                                                min={1}
                                                                max={
                                                                  itemRemainingQty
                                                                }
                                                                value={
                                                                  completeMultipleQtyByItem[
                                                                    prodItem.id
                                                                  ] ?? "1"
                                                                }
                                                                onChange={(
                                                                  event,
                                                                ) =>
                                                                  setCompleteMultipleQtyByItem(
                                                                    (prev) => ({
                                                                      ...prev,
                                                                      [prodItem.id]:
                                                                        event
                                                                          .target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                                className="h-10"
                                                              />
                                                              <Button
                                                                size="sm"
                                                                className="h-10 w-full"
                                                                onClick={() =>
                                                                  void handleConfirmedCompleteItemUnits(
                                                                    prodItem.id,
                                                                    item.id,
                                                                    Number(
                                                                      completeMultipleQtyByItem[
                                                                        prodItem
                                                                          .id
                                                                      ] ?? 1,
                                                                    ),
                                                                    prodItem.item_name,
                                                                  )
                                                                }
                                                              >
                                                                {t(
                                                                  "production.operator.actions.completeMany",
                                                                )}
                                                              </Button>
                                                            </div>
                                                          </div>
                                                        </div>
                                                      </PopoverContent>
                                                    </Popover>
                                                  ) : (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className={
                                                        operatorSuccessActionClass
                                                      }
                                                      disabled={
                                                        !hasOperatorActiveSession ||
                                                        isDone ||
                                                        isBlocked ||
                                                        isPaused ||
                                                        isCompleting
                                                      }
                                                      onClick={() =>
                                                        void handleConfirmedCompleteItemUnits(
                                                          prodItem.id,
                                                          item.id,
                                                          1,
                                                          prodItem.item_name,
                                                        )
                                                      }
                                                    >
                                                      {isCompleting ? (
                                                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                                      ) : (
                                                        <CheckCheckIcon className="h-4 w-4" />
                                                      )}
                                                      {t(
                                                        "production.operator.actions.done",
                                                      )}
                                                    </Button>
                                                  )}
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className={
                                                      operatorWarningIconActionClass
                                                    }
                                                    disabled={isDone}
                                                    aria-label={t(
                                                      "production.operator.actions.blocked",
                                                    )}
                                                    title={t(
                                                      "production.operator.actions.blocked",
                                                    )}
                                                    onClick={() =>
                                                      handleOpenBlocked(
                                                        item.id,
                                                        prodItem.id,
                                                      )
                                                    }
                                                  >
                                                    <BanIcon className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                        {(() => {
                                          const {
                                            effectiveStatus,
                                            effectiveStartedAt,
                                          } = resolveConstructionItemState(
                                            prodItem,
                                            item,
                                            batchRuns,
                                            workSessionScopeSummaryByKey,
                                          );
                                          const hasStarted =
                                            Boolean(effectiveStartedAt) ||
                                            effectiveStatus === "in_progress" ||
                                            effectiveStatus === "paused";
                                          const isBlocked =
                                            effectiveStatus === "blocked";
                                          const startLockedByDate =
                                            !hasStarted &&
                                            !isBlocked &&
                                            isFuturePlannedDate(
                                              item.plannedDate,
                                            );
                                          const startLockedByWorkHours =
                                            effectiveStatus !== "in_progress" &&
                                            !isWithinWorkingHoursNow;
                                          if (
                                            startLockedByDate ||
                                            !startLockedByWorkHours
                                          ) {
                                            return null;
                                          }
                                          return (
                                            <div className="mt-1 text-[10px] text-amber-600">
                                              {t(
                                                "production.operator.queue.outsideWorkingHours",
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {!isConstructionTracking ||
                            (isConstructionTracking &&
                              item.items.length === 0) ? (
                              <div className="mt-3 rounded-md border border-border bg-muted/20 px-2 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    {isConstructionTracking &&
                                    item.items.length === 0
                                      ? t(
                                          "production.operator.queue.batchActions",
                                        )
                                      : isReceiptOnlyTracking
                                        ? t(
                                            "production.operator.queue.receiptAction",
                                          )
                                        : t(
                                            "production.operator.queue.batchActions",
                                          )}
                                  </div>
                                  <div className="flex w-full items-stretch gap-2">
                                    {(() => {
                                      const hasOperatorActiveRunSession =
                                        item.runIds.some((runId) =>
                                          hasActiveWorkSessionForRun(runId),
                                        );
                                      const hasOperatorCompletedRunSession =
                                        item.operatorSessionStatus === "done" &&
                                        (isBatchDone ||
                                          (item.activeOperatorsCount ?? 0) > 0);
                                      const shouldResumeRunSession =
                                        item.operatorSessionStatus ===
                                          "paused" ||
                                        item.operatorSessionStatus ===
                                          "blocked";
                                      return (
                                        <>
                                          {!isReceiptOnlyTracking ? (
                                            <Button
                                              variant={
                                                hasOperatorActiveRunSession
                                                  ? "secondary"
                                                  : "default"
                                              }
                                              size="sm"
                                              className={
                                                operatorPrimaryActionClass
                                              }
                                              disabled={
                                                isBatchDone ||
                                                hasOperatorCompletedRunSession ||
                                                batchStartLockedByDate ||
                                                (!hasOperatorActiveRunSession &&
                                                  !isWithinWorkingHoursNow) ||
                                                hasBlockingDependenciesForBatch ||
                                                (hasOperatorActiveRunSession
                                                  ? isRunActionLoading(
                                                      item.id,
                                                      "paused",
                                                    )
                                                  : isRunActionLoading(
                                                      item.id,
                                                      "in_progress",
                                                    ))
                                              }
                                              onClick={() =>
                                                hasOperatorActiveRunSession
                                                  ? handleOpenPaused(item.id)
                                                  : handleRunStatusUpdate(
                                                      item.id,
                                                      "in_progress",
                                                    )
                                              }
                                            >
                                              {hasOperatorActiveRunSession ? (
                                                isRunActionLoading(
                                                  item.id,
                                                  "paused",
                                                ) ? (
                                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                                ) : (
                                                  <PauseIcon className="h-4 w-4" />
                                                )
                                              ) : isRunActionLoading(
                                                  item.id,
                                                  "in_progress",
                                                ) ? (
                                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                              ) : (
                                                <PlayIcon className="h-4 w-4" />
                                              )}
                                              {isBatchBlocked ||
                                              isBatchPaused ||
                                              shouldResumeRunSession
                                                ? t(
                                                    "production.operator.actions.resume",
                                                  )
                                                : hasOperatorActiveRunSession
                                                  ? t(
                                                      "production.operator.actions.pause",
                                                    )
                                                  : t(
                                                      "production.operator.actions.start",
                                                    )}
                                            </Button>
                                          ) : null}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className={
                                              operatorSuccessActionClass
                                            }
                                            disabled={
                                              (!isReceiptOnlyTracking &&
                                                (!hasOperatorActiveRunSession ||
                                                  isBatchDone ||
                                                  isBatchBlocked ||
                                                  isBatchPaused)) ||
                                              (isReceiptOnlyTracking &&
                                                (isBatchDone ||
                                                  isFuturePlannedDate(
                                                    item.plannedDate,
                                                  ) ||
                                                  hasBlockingDependenciesForBatch)) ||
                                              isBatchCompleting
                                            }
                                            onClick={() =>
                                              void handleConfirmedRunDone(
                                                item.id,
                                                item.orderNumber,
                                              )
                                            }
                                          >
                                            {isBatchCompleting ? (
                                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                            ) : (
                                              <CheckCheckIcon className="h-4 w-4" />
                                            )}
                                            {isReceiptOnlyTracking
                                              ? t(
                                                  "production.operator.actions.received",
                                                )
                                              : t(
                                                  "production.operator.actions.done",
                                                )}
                                          </Button>
                                        </>
                                      );
                                    })()}
                                    {!isReceiptOnlyTracking ? (
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className={
                                          operatorWarningIconActionClass
                                        }
                                        disabled={isBatchDone}
                                        aria-label={t(
                                          "production.operator.actions.blocked",
                                        )}
                                        title={t(
                                          "production.operator.actions.blocked",
                                        )}
                                        onClick={() =>
                                          handleOpenBlocked(item.id)
                                        }
                                      >
                                        <BanIcon className="h-4 w-4" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                {batchStartLockedByDate && item.plannedDate ? (
                                  <div className="mt-1 text-[10px] text-amber-600">
                                    {t(
                                      "production.operator.queue.availableOn",
                                      {
                                        date: formatDate(item.plannedDate),
                                      },
                                    )}
                                  </div>
                                ) : null}
                                {!batchStartLockedByDate &&
                                item.status !== "in_progress" &&
                                !isWithinWorkingHoursNow ? (
                                  <div className="mt-1 text-[10px] text-amber-600">
                                    {t(
                                      "production.operator.queue.outsideWorkingHours",
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="mt-3 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {item.attachments.length > 0
                                  ? t("production.operator.files.count", {
                                      count: item.attachments.length,
                                    })
                                  : t("production.operator.files.none")}
                              </div>
                              {item.attachments.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-2 text-xs"
                                      onClick={async () => {
                                        const next = new Set(expandedJobs);
                                        if (next.has(item.id)) {
                                          next.delete(item.id);
                                          setExpandedJobs(next);
                                          return;
                                        }
                                        next.add(item.id);
                                        setExpandedJobs(next);
                                        if (!signingJobs.has(item.id)) {
                                          setSigningJobs((prev) => {
                                            const updated = new Set(prev);
                                            updated.add(item.id);
                                            return updated;
                                          });
                                          await signAttachments(
                                            item.attachments.filter(
                                              (attachment) =>
                                                !signedUrls[attachment.id],
                                            ),
                                          );
                                          setSigningJobs((prev) => {
                                            const updated = new Set(prev);
                                            updated.delete(item.id);
                                            return updated;
                                          });
                                        }
                                      }}
                                    >
                                      {signingJobs.has(item.id) ? (
                                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                      ) : expandedJobs.has(item.id) ? (
                                        <ChevronUpIcon className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronDownIcon className="h-3.5 w-3.5" />
                                      )}
                                      {expandedJobs.has(item.id)
                                        ? t("production.operator.files.hide")
                                        : t("production.operator.files.show")}
                                    </Button>
                                  </div>
                                  {expandedJobs.has(item.id) ? (
                                    <div className="space-y-2">
                                      {signingJobs.has(item.id) ? (
                                        <div className="text-xs text-muted-foreground">
                                          {t(
                                            "production.operator.files.loading",
                                          )}
                                        </div>
                                      ) : null}
                                      {item.attachments.map((attachment) => {
                                        const signedUrl =
                                          signedUrls[attachment.id];
                                        return (
                                          <a
                                            key={attachment.id}
                                            href={
                                              signedUrl ?? attachment.url ?? "#"
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-3 rounded-md border border-border px-2 py-2 text-xs hover:bg-muted/30"
                                          >
                                            {renderAttachmentIcon(attachment)}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium truncate">
                                                {attachment.name}
                                              </div>
                                              <div className="text-[11px] text-muted-foreground">
                                                {attachment.created_at
                                                  ? formatDate(
                                                      attachment.created_at.slice(
                                                        0,
                                                        10,
                                                      ),
                                                    )
                                                  : ""}
                                              </div>
                                            </div>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isMobileSearchOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[1.5px] md:hidden">
          <div className="w-full px-4 pb-[calc(env(safe-area-inset-bottom)-2px)]">
            <div className="flex items-center gap-2">
              <Input
                ref={mobileSearchInputRef}
                type="search"
                autoFocus
                icon="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyFiltersToUrl({ q: searchQuery });
                    closeMobileSearch();
                  }
                }}
                placeholder={t("production.operator.search.search")}
                enterKeyHint="search"
                className="h-12 text-[16px]"
                wrapperClassName="rounded-full border-border bg-background shadow-lg"
              />
              <button
                type="button"
                onClick={closeMobileSearch}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg"
                aria-label={t("production.operator.search.close")}
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="fixed inset-0 -z-10 h-full w-full"
            aria-label={t("production.operator.search.closeOverlay")}
            onClick={closeMobileSearch}
          />
        </div>
      ) : null}

      <BottomSheet
        open={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        ariaLabel={t("production.operator.filters.aria")}
        title={t("production.operator.filters.title")}
        closeButtonLabel={t("production.operator.filters.close")}
        keyboardAware
        enableSwipeToClose
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
          <DatePicker
            label={t("production.operator.filters.week")}
            value={selectedDate}
            displayValue={selectedWeekLabel}
            description={t("production.operator.filters.weekHint")}
            onChange={(value) => applyFiltersToUrl({ date: value || "" })}
          />
          <SelectField
            label={t("production.operator.filters.status")}
            value={statusFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ status: value as QueueStatusFilter })
            }
          >
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ status: value as QueueStatusFilter })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={t("production.operator.status.all")}
                />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            label={t("production.operator.filters.priority")}
            value={priorityFilter}
            onValueChange={(value) =>
              applyFiltersToUrl({ priority: value as "all" | Priority })
            }
          >
            <Select
              value={priorityFilter}
              onValueChange={(value) =>
                applyFiltersToUrl({ priority: value as "all" | Priority })
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={t("production.operator.priority.all")}
                />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <Button
            type="button"
            variant={onlyBlocked ? "secondary" : "outline"}
            className="w-full"
            onClick={() => applyFiltersToUrl({ blocked: !onlyBlocked })}
          >
            {blockedOnlyLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsFiltersOpen(false);
              setQueryParams({
                date: null,
                dateFilter: null,
                station: stationFilter ?? null,
                order: null,
                status: null,
                priority: null,
                q: null,
                blocked: null,
              });
            }}
          >
            {t("production.operator.filters.reset")}
          </Button>
        </div>
      </BottomSheet>

      <QrScannerModal
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onResolved={handleScannerResolved}
      />
      {scannerError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {scannerError}
        </div>
      ) : null}

      <BottomSheet
        open={isQuickActionOpen}
        onClose={closeQuickAction}
        ariaLabel={t("production.operator.quickActions.aria")}
        title={
          quickActionItem
            ? `${quickActionItem.orderNumber} / ${quickActionItem.batchCode}`
            : t("production.operator.quickActions.title")
        }
        closeButtonLabel={t("production.operator.quickActions.close")}
        keyboardAware
        enableSwipeToClose
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3">
          {quickActionItem ? (
            <>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div>{quickActionItem.customerName}</div>
                <div className="mt-1">
                  {t("production.operator.queue.pieces", {
                    count: quickActionItem.totalQty,
                  })}
                  {quickActionItem.material
                    ? ` - ${quickActionItem.material}`
                    : ""}
                  {quickActionItem.plannedDate
                    ? ` - ${t("production.operator.quickActions.planned", {
                        date: formatDate(quickActionItem.plannedDate),
                      })}`
                    : ""}
                </div>
                {quickActionItem.activeOperatorsCount &&
                quickActionItem.activeOperatorsCount > 0 ? (
                  <>
                    <div className="mt-1">
                      {t("production.operator.queue.activeOperators", {
                        count: quickActionItem.activeOperatorsCount,
                      })}
                    </div>
                    {quickActionWorkingOperatorNames.length > 0 ? (
                      <div className="mt-1">
                        {t("production.operator.queue.workingOperators", {
                          names: quickActionWorkingOperatorNames.join(", "),
                        })}
                      </div>
                    ) : null}
                    {quickActionPausedOperatorNames.length > 0 ? (
                      <div className="mt-1">
                        {t("production.operator.queue.pausedOperators", {
                          names: quickActionPausedOperatorNames.join(", "),
                        })}
                      </div>
                    ) : null}
                    {quickActionBlockedOperatorNames.length > 0 ? (
                      <div className="mt-1">
                        {t("production.operator.queue.blockedOperators", {
                          names: quickActionBlockedOperatorNames.join(", "),
                        })}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {quickActionItem.operatorSessionStatus ? (
                  <div className="mt-1">
                    {t("production.operator.queue.myStatus", {
                      status: runStatusLabel(
                        quickActionItem.operatorSessionStatus,
                      ),
                    })}
                  </div>
                ) : null}
                {(() => {
                  if (quickActionItem.trackingMode === "construction_level") {
                    return null;
                  }
                  const ownSeconds = quickActionItem.runIds.reduce(
                    (sum, runId) =>
                      sum +
                      (ownWorkSessionSecondsByScope.get(
                        getWorkSessionScopeKey(runId, null),
                      ) ?? 0),
                    0,
                  );
                  const visibleOwnSeconds =
                    Number(quickActionItem.durationSeconds ?? 0) > 0
                      ? Math.min(
                          ownSeconds,
                          Number(quickActionItem.durationSeconds ?? 0),
                        )
                      : ownSeconds;
                  if (visibleOwnSeconds <= 0) {
                    return null;
                  }
                  return (
                    <div className="mt-1">
                      {t("production.operator.queue.myTime", {
                        value: formatLiveDuration(visibleOwnSeconds),
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {quickActionItem.attachments.length > 0
                    ? t("production.operator.files.count", {
                        count: quickActionItem.attachments.length,
                      })
                    : t("production.operator.files.none")}
                </div>
                {quickActionItem.attachments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 text-xs"
                        onClick={async () => {
                          const next = new Set(expandedJobs);
                          if (next.has(quickActionItem.id)) {
                            next.delete(quickActionItem.id);
                            setExpandedJobs(next);
                            return;
                          }
                          next.add(quickActionItem.id);
                          setExpandedJobs(next);
                          if (!signingJobs.has(quickActionItem.id)) {
                            setSigningJobs((prev) => {
                              const updated = new Set(prev);
                              updated.add(quickActionItem.id);
                              return updated;
                            });
                            await signAttachments(
                              quickActionItem.attachments.filter(
                                (attachment) => !signedUrls[attachment.id],
                              ),
                            );
                            setSigningJobs((prev) => {
                              const updated = new Set(prev);
                              updated.delete(quickActionItem.id);
                              return updated;
                            });
                          }
                        }}
                      >
                        {signingJobs.has(quickActionItem.id) ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                        ) : expandedJobs.has(quickActionItem.id) ? (
                          <ChevronUpIcon className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        )}
                        {expandedJobs.has(quickActionItem.id)
                          ? t("production.operator.files.hide")
                          : t("production.operator.files.show")}
                      </Button>
                    </div>
                    {expandedJobs.has(quickActionItem.id) ? (
                      <div className="space-y-2">
                        {signingJobs.has(quickActionItem.id) ? (
                          <div className="text-xs text-muted-foreground">
                            {t("production.operator.files.loading")}
                          </div>
                        ) : null}
                        {quickActionItem.attachments.map((attachment) => {
                          const signedUrl = signedUrls[attachment.id];
                          return (
                            <a
                              key={attachment.id}
                              href={signedUrl ?? attachment.url ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 rounded-md border border-border px-2 py-2 text-xs hover:bg-muted/30"
                            >
                              {renderAttachmentIcon(attachment)}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">
                                  {attachment.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {attachment.created_at
                                    ? formatDate(
                                        attachment.created_at.slice(0, 10),
                                      )
                                    : ""}
                                </div>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {quickActionItem.trackingMode !== "construction_level" ? (
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {quickActionItem.trackingMode === "receipt_only"
                        ? t("production.operator.queue.receiptAction")
                        : t("production.operator.queue.batchActions")}
                    </div>
                    <Badge variant={statusBadge(quickActionItem.status)}>
                      {runStatusLabel(quickActionItem.status ?? "queued")}
                    </Badge>
                  </div>
                  <div className="mt-3 flex w-full items-stretch gap-2">
                    {(() => {
                      const hasOperatorActiveRunSession =
                        quickActionItem.runIds.some((runId) =>
                          hasActiveWorkSessionForRun(runId),
                        );
                      const hasOperatorCompletedRunSession =
                        quickActionItem.operatorSessionStatus === "done" &&
                        (quickActionItem.status === "done" ||
                          (quickActionItem.activeOperatorsCount ?? 0) > 0);
                      const shouldResumeRunSession =
                        quickActionItem.operatorSessionStatus === "paused" ||
                        quickActionItem.operatorSessionStatus === "blocked";
                      return (
                        <>
                          {quickActionItem.trackingMode !== "receipt_only" ? (
                            <Button
                              variant={
                                hasOperatorActiveRunSession
                                  ? "secondary"
                                  : "default"
                              }
                              size="sm"
                              className={operatorPrimaryActionClass}
                              disabled={
                                quickActionItem.status === "done" ||
                                hasOperatorCompletedRunSession ||
                                isFuturePlannedDate(
                                  quickActionItem.plannedDate,
                                ) ||
                                (!hasOperatorActiveRunSession &&
                                  !isWithinWorkingHoursNow) ||
                                (hasOperatorActiveRunSession
                                  ? isRunActionLoading(
                                      quickActionItem.id,
                                      "paused",
                                    )
                                  : isRunActionLoading(
                                      quickActionItem.id,
                                      "in_progress",
                                    ))
                              }
                              onClick={() =>
                                hasOperatorActiveRunSession
                                  ? handleOpenPaused(quickActionItem.id)
                                  : handleRunStatusUpdate(
                                      quickActionItem.id,
                                      "in_progress",
                                    )
                              }
                            >
                              {hasOperatorActiveRunSession ? (
                                isRunActionLoading(
                                  quickActionItem.id,
                                  "paused",
                                ) ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                ) : (
                                  <PauseIcon className="h-4 w-4" />
                                )
                              ) : isRunActionLoading(
                                  quickActionItem.id,
                                  "in_progress",
                                ) ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                              ) : (
                                <PlayIcon className="h-4 w-4" />
                              )}
                              {quickActionItem.status === "blocked" ||
                              quickActionItem.status === "paused" ||
                              shouldResumeRunSession
                                ? t("production.operator.actions.resume")
                                : hasOperatorActiveRunSession
                                  ? t("production.operator.actions.pause")
                                  : t("production.operator.actions.start")}
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className={operatorSuccessActionClass}
                            disabled={
                              (quickActionItem.trackingMode !==
                                "receipt_only" &&
                                (!hasOperatorActiveRunSession ||
                                  quickActionItem.status === "done" ||
                                  quickActionItem.status === "paused")) ||
                              (quickActionItem.trackingMode ===
                                "receipt_only" &&
                                (quickActionItem.status === "done" ||
                                  isFuturePlannedDate(
                                    quickActionItem.plannedDate,
                                  ) ||
                                  quickActionHasBlockingDependenciesForBatch)) ||
                              isRunActionLoading(quickActionItem.id, "done")
                            }
                            onClick={() =>
                              void handleConfirmedRunDone(
                                quickActionItem.id,
                                quickActionItem.orderNumber,
                              )
                            }
                          >
                            {isRunActionLoading(quickActionItem.id, "done") ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                            ) : (
                              <CheckCheckIcon className="h-4 w-4" />
                            )}
                            {quickActionItem.trackingMode === "receipt_only"
                              ? t("production.operator.actions.received")
                              : t("production.operator.actions.done")}
                          </Button>
                        </>
                      );
                    })()}
                    {quickActionItem.trackingMode !== "receipt_only" ? (
                      <Button
                        variant="outline"
                        size="icon"
                        className={operatorWarningIconActionClass}
                        disabled={quickActionItem.status === "done"}
                        aria-label={t("production.operator.actions.blocked")}
                        title={t("production.operator.actions.blocked")}
                        onClick={() => handleOpenBlocked(quickActionItem.id)}
                      >
                        <BanIcon className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {isFuturePlannedDate(quickActionItem.plannedDate) &&
                  quickActionItem.plannedDate ? (
                    <div className="mt-1 text-[11px] text-amber-600">
                      {t("production.operator.queue.availableOn", {
                        date: formatDate(quickActionItem.plannedDate),
                      })}
                    </div>
                  ) : null}
                  {!isFuturePlannedDate(quickActionItem.plannedDate) &&
                  quickActionItem.status !== "in_progress" &&
                  quickActionItem.trackingMode !== "receipt_only" &&
                  !isWithinWorkingHoursNow ? (
                    <div className="mt-1 text-[11px] text-amber-600">
                      {t("production.operator.queue.outsideWorkingHours")}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {quickActionItem.trackingMode === "construction_level"
                ? quickActionVisibleItems.map((prodItem) => {
                    const {
                      effectiveStatus,
                      effectiveStartedAt,
                      matchedRun,
                      scopeSummary,
                    } = resolveConstructionItemState(
                      prodItem,
                      quickActionItem,
                      batchRuns,
                      workSessionScopeSummaryByKey,
                    );
                    const actionRunId = matchedRun?.id ?? quickActionItem.id;
                    const ownSessionStatus = getOwnWorkSessionStatus(
                      actionRunId,
                      prodItem.id,
                    );
                    const activeOperatorIds =
                      getInvolvedOperatorIdsForConstructionItem(
                        actionRunId,
                        prodItem,
                      );
                    const activeOperatorCount = activeOperatorIds.size;
                    const operatorStatusGroups =
                      getOperatorStatusGroupsForConstructionItem(
                        actionRunId,
                        prodItem,
                      );
                    const workingOperatorNames = getActiveOperatorNames(
                      operatorStatusGroups.working,
                    );
                    const pausedOperatorNames = getActiveOperatorNames(
                      operatorStatusGroups.paused,
                    );
                    const blockedOperatorNames = getActiveOperatorNames(
                      operatorStatusGroups.blocked,
                    );
                    const ownElapsedSeconds =
                      ownWorkSessionSecondsByScope.get(
                        getWorkSessionScopeKey(actionRunId, prodItem.id),
                      ) ?? 0;
                    const visibleOwnElapsedSeconds =
                      Number(scopeSummary?.elapsedSeconds ?? 0) > 0
                        ? Math.min(
                            ownElapsedSeconds,
                            Number(scopeSummary?.elapsedSeconds ?? 0),
                          )
                        : ownElapsedSeconds;
                    const ownElapsedLabel =
                      visibleOwnElapsedSeconds > 0
                        ? formatLiveDuration(visibleOwnElapsedSeconds)
                        : null;
                    const itemElapsedLabel =
                      Number(scopeSummary?.elapsedSeconds ?? 0) > 0
                        ? formatLiveDuration(
                            Number(scopeSummary?.elapsedSeconds ?? 0),
                          )
                        : null;
                    const hasOperatorActiveSession =
                      hasActiveWorkSessionForItem(actionRunId, prodItem.id);
                    const hasStarted =
                      Boolean(effectiveStartedAt) ||
                      effectiveStatus === "in_progress" ||
                      effectiveStatus === "paused";
                    const isBlocked = effectiveStatus === "blocked";
                    const isPaused = effectiveStatus === "paused";
                    const isDone = effectiveStatus === "done";
                    const shouldResumeOwnSession =
                      ownSessionStatus === "paused" ||
                      ownSessionStatus === "blocked";
                    const hasOperatorCompletedSession =
                      ownSessionStatus === "done" &&
                      (isDone || activeOperatorCount > 0);
                    const startLockedByDate =
                      !hasStarted &&
                      !isBlocked &&
                      isFuturePlannedDate(quickActionItem.plannedDate);
                    const startLockedByWorkHours =
                      !hasOperatorActiveSession && !isWithinWorkingHoursNow;
                    const isStarting = isActionLoading(
                      prodItem.id,
                      "in_progress",
                    );
                    const isCompleting = isActionLoading(prodItem.id, "done");
                    const itemQuantity = getProductionItemQuantity(prodItem);
                    const itemCompletedQty =
                      getOperatorVisibleCompletedQty(prodItem);
                    const itemRemainingQty =
                      getOperatorVisibleRemainingQty(prodItem);
                    const showConstructionItemHeader =
                      quickActionVisibleItems.length > 1;
                    const itemPosition =
                      getProductionItemMetaPosition(prodItem) ??
                      orderItemPositionBySourceKey.get(
                        getProductionItemSourceKey(prodItem) ?? "",
                      ) ??
                      null;
                    return (
                      <div key={prodItem.id} className="space-y-2">
                        {showConstructionItemHeader ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                              {itemPosition
                                ? `${t("production.main.jobs.position")}: ${itemPosition} | ${prodItem.item_name}`
                                : prodItem.item_name}
                            </div>
                            <Badge
                              variant={statusBadge(
                                (effectiveStatus ??
                                  "queued") as BatchRunRow["status"],
                              )}
                            >
                              {runStatusLabel(
                                (effectiveStatus ??
                                  "queued") as BatchRunRow["status"],
                              )}
                            </Badge>
                          </div>
                        ) : null}
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div>
                            {t(
                              "production.operator.queue.constructionReadyProgress",
                              {
                                completed: itemCompletedQty,
                                total: itemQuantity,
                              },
                            )}
                          </div>
                          {activeOperatorCount > 0 ? (
                            <>
                              <div>
                                {t(
                                  "production.operator.queue.activeOperators",
                                  {
                                    count: activeOperatorCount,
                                  },
                                )}
                              </div>
                              {workingOperatorNames.length > 0 ? (
                                <div>
                                  {t(
                                    "production.operator.queue.workingOperators",
                                    {
                                      names: workingOperatorNames.join(", "),
                                    },
                                  )}
                                </div>
                              ) : null}
                              {pausedOperatorNames.length > 0 ? (
                                <div>
                                  {t(
                                    "production.operator.queue.pausedOperators",
                                    {
                                      names: pausedOperatorNames.join(", "),
                                    },
                                  )}
                                </div>
                              ) : null}
                              {blockedOperatorNames.length > 0 ? (
                                <div>
                                  {t(
                                    "production.operator.queue.blockedOperators",
                                    {
                                      names: blockedOperatorNames.join(", "),
                                    },
                                  )}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                          {ownSessionStatus ? (
                            <div>
                              {t("production.operator.queue.myStatus", {
                                status: runStatusLabel(ownSessionStatus),
                              })}
                            </div>
                          ) : null}
                          {ownElapsedLabel ? (
                            <div>
                              {t("production.operator.queue.myTime", {
                                value: ownElapsedLabel,
                              })}
                            </div>
                          ) : null}
                          {itemElapsedLabel ? (
                            <div>
                              {t("production.operator.queue.constructionTime", {
                                value: itemElapsedLabel,
                              })}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 rounded-md border border-border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">
                            {t("production.operator.queue.constructionActions")}
                          </div>
                          <div className="mt-3 flex items-stretch gap-2">
                            <Button
                              variant={
                                hasOperatorActiveSession
                                  ? "secondary"
                                  : "default"
                              }
                              size="sm"
                              className={operatorPrimaryActionClass}
                              disabled={
                                isDone ||
                                hasOperatorCompletedSession ||
                                startLockedByDate ||
                                startLockedByWorkHours ||
                                (hasOperatorActiveSession
                                  ? isActionLoading(prodItem.id, "paused")
                                  : isStarting)
                              }
                              onClick={() =>
                                hasOperatorActiveSession
                                  ? handleOpenPaused(actionRunId, prodItem.id)
                                  : handleUserStatusUpdate(
                                      prodItem.id,
                                      actionRunId,
                                      "in_progress",
                                    )
                              }
                            >
                              {hasOperatorActiveSession ? (
                                isActionLoading(prodItem.id, "paused") ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                ) : (
                                  <PauseIcon className="h-4 w-4" />
                                )
                              ) : isStarting ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                              ) : (
                                <PlayIcon className="h-4 w-4" />
                              )}
                              {isBlocked || isPaused || shouldResumeOwnSession
                                ? t("production.operator.actions.resume")
                                : hasOperatorActiveSession
                                  ? t("production.operator.actions.pause")
                                  : t("production.operator.actions.start")}
                            </Button>
                            {itemRemainingQty > 1 ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`${operatorSuccessActionClass} justify-between`}
                                    disabled={
                                      !hasOperatorActiveSession ||
                                      isDone ||
                                      isBlocked ||
                                      isPaused ||
                                      isCompleting
                                    }
                                  >
                                    {isCompleting ? (
                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                    ) : (
                                      <CheckCheckIcon className="h-4 w-4" />
                                    )}
                                    {t("production.operator.actions.done")}
                                    <ChevronDownIcon className="h-3.5 w-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3">
                                  <div className="space-y-3">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-10 w-full justify-start rounded-lg px-3 text-left font-semibold"
                                      onClick={() =>
                                        void handleConfirmedCompleteItemUnits(
                                          prodItem.id,
                                          quickActionItem.id,
                                          1,
                                          prodItem.item_name,
                                        )
                                      }
                                    >
                                      {t(
                                        "production.operator.actions.completeOne",
                                      )}
                                    </Button>
                                    <div className="rounded-md border border-border p-2">
                                      <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                                        {t(
                                          "production.operator.queue.remainingQty",
                                          {
                                            count: itemRemainingQty,
                                          },
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        <Input
                                          type="number"
                                          min={1}
                                          max={itemRemainingQty}
                                          value={
                                            completeMultipleQtyByItem[
                                              prodItem.id
                                            ] ?? "1"
                                          }
                                          onChange={(event) =>
                                            setCompleteMultipleQtyByItem(
                                              (prev) => ({
                                                ...prev,
                                                [prodItem.id]:
                                                  event.target.value,
                                              }),
                                            )
                                          }
                                          className="h-10"
                                        />
                                        <Button
                                          size="sm"
                                          className="h-10 w-full"
                                          onClick={() =>
                                            void handleConfirmedCompleteItemUnits(
                                              prodItem.id,
                                              quickActionItem.id,
                                              Number(
                                                completeMultipleQtyByItem[
                                                  prodItem.id
                                                ] ?? 1,
                                              ),
                                              prodItem.item_name,
                                            )
                                          }
                                        >
                                          {t(
                                            "production.operator.actions.completeMany",
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className={operatorSuccessActionClass}
                                disabled={
                                  !hasOperatorActiveSession ||
                                  isDone ||
                                  isBlocked ||
                                  isPaused ||
                                  isCompleting
                                }
                                onClick={() =>
                                  void handleConfirmedCompleteItemUnits(
                                    prodItem.id,
                                    quickActionItem.id,
                                    1,
                                    prodItem.item_name,
                                  )
                                }
                              >
                                {isCompleting ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                                ) : (
                                  <CheckCheckIcon className="h-4 w-4" />
                                )}
                                {t("production.operator.actions.done")}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="icon"
                              className={operatorWarningIconActionClass}
                              disabled={isDone}
                              aria-label={t(
                                "production.operator.actions.blocked",
                              )}
                              title={t("production.operator.actions.blocked")}
                              onClick={() =>
                                handleOpenBlocked(
                                  quickActionItem.id,
                                  prodItem.id,
                                )
                              }
                            >
                              <BanIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {startLockedByDate && quickActionItem.plannedDate ? (
                          <div className="mt-1 text-[11px] text-amber-600">
                            {t("production.operator.queue.availableOn", {
                              date: formatDate(quickActionItem.plannedDate),
                            })}
                          </div>
                        ) : null}
                        {!startLockedByDate && startLockedByWorkHours ? (
                          <div className="mt-1 text-[11px] text-amber-600">
                            {t("production.operator.queue.outsideWorkingHours")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
              {quickActionVisibleItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {t("production.operator.quickActions.noConstructions")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {t("production.operator.quickActions.orderNotFound")}
            </div>
          )}
        </div>
      </BottomSheet>

      {!isWarehouseQueueView ? (
        <SideDrawer
          open={isProfilePanelOpen}
          onClose={() => setIsProfilePanelOpen(false)}
          ariaLabel={t("production.operator.profile.aria")}
          closeButtonLabel={t("production.operator.profile.closePanel")}
          side="right"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">
                {t("production.operator.profile.title")}
              </h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={() => setIsProfilePanelOpen(false)}
              >
                {t("production.operator.common.close")}
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
                <UserAvatar
                  avatarUrl={currentUser.avatarUrl}
                  name={currentUser.name}
                  fallback={userInitials || "U"}
                  sizeClass="h-12 w-12"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {currentUser.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {userRoleLabel}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t("production.operator.profile.todayDone")}
                  </div>
                  <div className="text-lg font-semibold">
                    {activitySummary.done}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t("production.operator.profile.todayTime")}
                  </div>
                  <div className="text-lg font-semibold">
                    {formatDuration(activitySummary.minutes)}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t("production.operator.profile.weekDone")}
                  </div>
                  <div className="text-lg font-semibold">
                    {weeklySummary.done}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t("production.operator.profile.weekTime")}
                  </div>
                  <div className="text-lg font-semibold">
                    {formatDuration(weeklySummary.minutes)}
                  </div>
                </div>
              </div>
              <div className="space-y-2 pb-2">
                <ThemeToggle
                  variant="menu"
                  className="rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
                />
                <Link
                  href="/profile"
                  onClick={() => setIsProfilePanelOpen(false)}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <UserCircle2Icon className="h-4 w-4" />
                  {t("production.operator.profile.openProfile")}
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
                  onClick={() => {
                    setIsProfilePanelOpen(false);
                    void signOut();
                  }}
                >
                  <LogOutIcon className="h-4 w-4" />
                  {t("production.operator.profile.signOut")}
                </button>
              </div>
            </div>
          </div>
        </SideDrawer>
      ) : null}

      {!isWarehouseQueueView ? (
        <div
          className={`fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex ${isProfilePanelOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          aria-hidden={!isProfilePanelOpen}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t("production.operator.profile.title")}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsProfilePanelOpen(false)}
              >
                {t("production.operator.common.close")}
              </Button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
                <UserAvatar
                  avatarUrl={currentUser.avatarUrl}
                  name={currentUser.name}
                  fallback={userInitials || "U"}
                  sizeClass="h-12 w-12"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {currentUser.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {userRoleLabel}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    <ActivityIcon className="mr-1 inline h-3.5 w-3.5" />
                    {t("production.operator.profile.todayDone")}
                  </div>
                  <div className="text-lg font-semibold">
                    {activitySummary.done}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                    {t("production.operator.profile.todayTime")}
                  </div>
                  <div className="text-lg font-semibold">
                    {formatDuration(activitySummary.minutes)}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    <ActivityIcon className="mr-1 inline h-3.5 w-3.5" />
                    {t("production.operator.profile.weekDone")}
                  </div>
                  <div className="text-lg font-semibold">
                    {weeklySummary.done}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    <Clock3Icon className="mr-1 inline h-3.5 w-3.5" />
                    {t("production.operator.profile.weekTime")}
                  </div>
                  <div className="text-lg font-semibold">
                    {formatDuration(weeklySummary.minutes)}
                  </div>
                </div>
              </div>
              <ThemeToggle
                variant="menu"
                className="rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
              />
              <div className="flex gap-2">
                <Link href="/profile" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setIsProfilePanelOpen(false)}
                  >
                    <SettingsIcon className="h-4 w-4" />
                    {t("production.operator.profile.openProfile")}
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setIsProfilePanelOpen(false);
                    void signOut();
                  }}
                >
                  <LogOutIcon className="h-4 w-4" />
                  {t("production.operator.profile.signOut")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`fixed inset-x-4 z-30 transition-all duration-200 md:hidden ${
          isWarehouseQueueView
            ? "bottom-[calc(6.75rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(2.75rem+env(safe-area-inset-bottom))]"
        } ${
          hideMobileFloatingControls
            ? "translate-y-16 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsFiltersOpen(true)}
              aria-label={t("production.operator.fab.openFilters")}
            >
              <SlidersHorizontalIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={openMobileSearch}
              aria-label={t("production.operator.fab.openSearch")}
            >
              <SearchIcon className="h-5 w-5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full bg-card shadow-lg"
            onClick={() => setIsScannerOpen(true)}
            aria-label={t("production.operator.fab.scanQr")}
          >
            <QrCodeIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {confirmDialog}

      <BottomSheet
        open={Boolean(blockedRunId)}
        onClose={closeBlockedDialog}
        ariaLabel={t("production.operator.blocked.markAsBlocked")}
        closeButtonLabel={t("production.operator.blocked.closeDialog")}
        title={t("production.operator.blocked.markAsBlocked")}
        keyboardAware
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3 md:hidden">
          {blockedDialogContent}
        </div>
      </BottomSheet>

      {blockedRunId ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 px-4 md:flex">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t("production.operator.blocked.markAsBlocked")}
              </h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={closeBlockedDialog}
              >
                {t("production.operator.common.close")}
              </button>
            </div>
            <div className="mt-4">{blockedDialogContent}</div>
          </div>
        </div>
      ) : null}

      <BottomSheet
        open={Boolean(pausedRunId)}
        onClose={closePausedDialog}
        ariaLabel={t("production.operator.paused.markAsPaused")}
        closeButtonLabel={t("production.operator.paused.closeDialog")}
        title={t("production.operator.paused.markAsPaused")}
        keyboardAware
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3 md:hidden">
          {pausedDialogContent}
        </div>
      </BottomSheet>

      {pausedRunId ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 px-4 md:flex">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t("production.operator.paused.markAsPaused")}
              </h3>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={closePausedDialog}
              >
                {t("production.operator.common.close")}
              </button>
            </div>
            <div className="mt-4">{pausedDialogContent}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
