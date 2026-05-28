"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { InputField } from "@/components/ui/InputField";
import { Calendar } from "@/components/ui/Calendar";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { SelectField } from "@/components/ui/SelectField";
import { Tooltip } from "@/components/ui/Tooltip";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  buildOperatorOrderBreakdown,
  buildOperatorStationBreakdown,
  buildOperatorSummaryRows,
  buildOperatorUnitBreakdown,
  formatLaborCost,
  formatWorkedDuration,
  type OperatorAssignmentRow,
  type OperatorConfigRow,
  type OperatorOrderItemRow,
  type OperatorProfileRow,
  type OperatorStationRow,
} from "@/lib/domain/productionOperators";
import {
  parseWorkingCalendar,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import type {
  BatchRunRow,
  JoinedProductionOrder,
  ProductionItemRow,
  ProductionStatus,
  ProductionStatusEventRow,
  ProductionWorkSessionRow,
} from "@/types/production";
import type { DateRange } from "react-day-picker";

function getCurrentPeriodValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(
      new Date(year, now.getMonth() + 1, 0).getDate(),
    ).padStart(2, "0")}`,
  };
}

function parseDateValue(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return null;
  }
  const [yearValue, monthPart, dayPart] = dateValue.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const parsed = new Date(year, monthIndex, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureDate(date: Date) {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  return date.getTime() > today.getTime();
}

function buildDateRange(startDate: string, endDate: string) {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) {
    return null;
  }
  const normalizedStart = start <= end ? start : end;
  const normalizedEnd = end >= start ? end : start;
  const endExclusive = new Date(normalizedEnd);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    startAt: normalizedStart.toISOString(),
    endAt: endExclusive.toISOString(),
  };
}

function formatPeriodLabel(startDate: string, endDate: string, locale: string) {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) {
    return "";
  }
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function buildDateRangeValue(range: DateRange | undefined) {
  const from = range?.from ? new Date(range.from) : null;
  const to = range?.to ? new Date(range.to) : null;
  if (!from || !to) {
    return null;
  }
  const start = from <= to ? from : to;
  const end = to >= from ? to : from;
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
  };
}

function normalizeJoinedOrder(value: unknown): JoinedProductionOrder | null {
  const item = Array.isArray(value) ? (value[0] ?? null) : value;
  if (!item || typeof item !== "object") {
    return null;
  }
  const row = item as Record<string, unknown>;
  const priority =
    row.priority === "low" ||
    row.priority === "normal" ||
    row.priority === "high" ||
    row.priority === "urgent"
      ? row.priority
      : null;
  return {
    order_number:
      typeof row.order_number === "string" ? row.order_number : null,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    production_due_date:
      typeof row.production_due_date === "string"
        ? row.production_due_date
        : null,
    priority,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : null,
    status: typeof row.status === "string" ? row.status : null,
  };
}

function formatClockValue(value: string | null | undefined, locale: string) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function isIsoInRange(
  value: string | null | undefined,
  range: { startAt: string; endAt: string } | null,
) {
  if (!value || !range) {
    return true;
  }
  const valueMs = Date.parse(value);
  const startMs = Date.parse(range.startAt);
  const endMs = Date.parse(range.endAt);
  return (
    Number.isFinite(valueMs) &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    valueMs >= startMs &&
    valueMs < endMs
  );
}

type OperatorAbsenceRow = {
  id: string;
  tenant_id: string;
  operator_id: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  note: string | null;
};

type EditableAbsenceRow = {
  id: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  note: string;
  isNew?: boolean;
};

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalHoursToMinutes(value: string) {
  const parsed = parseOptionalNumber(value);
  return parsed == null ? null : Math.max(0, Math.round(parsed * 60));
}

function formatMinutesAsHoursInput(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  const hours = value / 60;
  return Number.isInteger(hours)
    ? String(hours)
    : String(Math.round(hours * 10) / 10);
}

function getInclusiveDayCount(start: Date, end: Date) {
  const startAt = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endAt = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffMs = endAt.getTime() - startAt.getTime();
  return diffMs >= 0 ? Math.floor(diffMs / 86400000) + 1 : 0;
}

function countMatchingWeekdaysBetween(
  start: Date,
  end: Date,
  weekdays: number[],
) {
  if (weekdays.length === 0) {
    return 0;
  }
  const allowed = new Set(weekdays);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endAt = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;
  while (cursor <= endAt) {
    if (allowed.has(cursor.getDay())) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isFullCalendarMonthRange(start: Date, end: Date) {
  return (
    start.getDate() === 1 &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  );
}

const STATUS_FILTER_VALUES = [
  "queued",
  "pending",
  "in_progress",
  "paused",
  "blocked",
  "done",
] satisfies ProductionStatus[];

function getProductionItemSourceKey(item: ProductionItemRow) {
  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const sourceRowId =
    meta && typeof meta.sourceRowId === "string" ? meta.sourceRowId : undefined;
  const orderItemId =
    row && typeof row.order_item_id === "string"
      ? row.order_item_id
      : undefined;
  const rowKey =
    meta && typeof meta.rowKey === "string" ? meta.rowKey : undefined;
  return sourceRowId ?? orderItemId ?? rowKey ?? null;
}

function getProductionItemMetaRowValue(item: ProductionItemRow, key: string) {
  const meta = item.meta as Record<string, unknown> | null;
  const row =
    meta && typeof meta.row === "object" && meta.row !== null
      ? (meta.row as Record<string, unknown>)
      : null;
  const candidates = [row, meta].filter(
    (value): value is Record<string, unknown> => Boolean(value),
  );
  for (const source of candidates) {
    const value = source[key];
    if (value == null) {
      continue;
    }
    const stringValue = String(value).trim();
    if (stringValue) {
      return stringValue;
    }
  }
  return null;
}

function normalizeStatusFilterValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "unknown";
}

function getOrderItemPositionLabel(item: OperatorOrderItemRow | undefined) {
  if (!item) {
    return null;
  }
  const explicit = item.position?.trim();
  if (explicit) {
    return explicit;
  }
  return "Pos. -";
}

function getOrderItemProductTypeLabel(item: OperatorOrderItemRow | undefined) {
  const explicit = item?.item_type?.trim();
  return explicit || null;
}

function getStatusBadgeVariant(status: string | null | undefined) {
  if (status === "blocked") {
    return "status-blocked";
  }
  if (status === "paused") {
    return "status-paused";
  }
  if (status === "pending") {
    return "status-pending";
  }
  if (status === "in_progress") {
    return "status-in_progress";
  }
  if (status === "done") {
    return "status-done";
  }
  return "status-draft";
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function ProductionOperatorDetailPage() {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const params = useParams<{ operatorId?: string }>();
  const operatorId = params?.operatorId ?? "";
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [profiles, setProfiles] = useState<OperatorProfileRow[]>([]);
  const [operatorConfigs, setOperatorConfigs] = useState<OperatorConfigRow[]>(
    [],
  );
  const [assignments, setAssignments] = useState<OperatorAssignmentRow[]>([]);
  const [stations, setStations] = useState<OperatorStationRow[]>([]);
  const [events, setEvents] = useState<ProductionStatusEventRow[]>([]);
  const [workSessions, setWorkSessions] = useState<ProductionWorkSessionRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [orderItems, setOrderItems] = useState<OperatorOrderItemRow[]>([]);
  const [workingCalendar, setWorkingCalendar] = useState<WorkingCalendar>({
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "17:00" }],
    overtimeEnabled: false,
  });
  const [hourlyRateInput, setHourlyRateInput] = useState<string | null>(null);
  const [overtimeRateInput, setOvertimeRateInput] = useState<string | null>(
    null,
  );
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [weeklyTargetInput, setWeeklyTargetInput] = useState("");
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("");
  const [overtimeThresholdInput, setOvertimeThresholdInput] = useState("");
  const [absenceRows, setAbsenceRows] = useState<OperatorAbsenceRow[]>([]);
  const [absences, setAbsences] = useState<EditableAbsenceRow[]>([]);
  const [deletedAbsenceIds, setDeletedAbsenceIds] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriodValue);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [periodPickerDraft, setPeriodPickerDraft] = useState<
    DateRange | undefined
  >(undefined);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.tenantId || !operatorId) {
      return;
    }
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setDataError("");
      const [
        profilesResult,
        configsResult,
        assignmentsResult,
        stationsResult,
        settingsResult,
        eventsResult,
        workSessionsResult,
        batchRunsResult,
        itemsResult,
        orderItemsResult,
        absencesResult,
      ] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name, role, login_code, auth_mode, is_active")
          .eq("tenant_id", user.tenantId)
          .eq("id", operatorId),
        sb
          .from("operators")
          .select(
            "id, user_id, name, role, hourly_rate, overtime_rate, weekly_target_minutes, monthly_target_minutes, overtime_threshold_minutes, is_active",
          )
          .eq("tenant_id", user.tenantId)
          .order("updated_at", { ascending: false }),
        sb
          .from("operator_station_assignments")
          .select("user_id, station_id, is_active")
          .eq("tenant_id", user.tenantId)
          .eq("user_id", operatorId),
        sb
          .from("workstations")
          .select("id, name, tracking_mode")
          .eq("tenant_id", user.tenantId)
          .eq("is_active", true),
        sb
          .from("tenant_settings")
          .select("workday_start, workday_end, workdays, work_shifts")
          .eq("tenant_id", user.tenantId)
          .maybeSingle(),
        sb
          .from("production_status_events")
          .select(
            "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at, actor_user_id",
          )
          .eq("tenant_id", user.tenantId)
          .order("created_at", { ascending: false })
          .limit(5000),
        sb
          .from("production_work_sessions")
          .select(
            "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
          )
          .eq("tenant_id", user.tenantId)
          .eq("operator_user_id", operatorId)
          .order("started_at", { ascending: false })
          .limit(5000),
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("tenant_id", user.tenantId),
        sb
          .from("production_items")
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, duration_minutes, done_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("tenant_id", user.tenantId)
          .order("done_at", { ascending: false }),
        sb
          .from("order_items")
          .select(
            "id, order_id, source_row_id, sort_order, position, item_type, item_name",
          )
          .eq("tenant_id", user.tenantId)
          .limit(5000),
        sb
          .from("operator_absences")
          .select(
            "id, tenant_id, operator_id, absence_type, start_date, end_date, note",
          )
          .eq("tenant_id", user.tenantId)
          .order("start_date", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (
        profilesResult.error ||
        configsResult.error ||
        assignmentsResult.error ||
        stationsResult.error ||
        settingsResult.error ||
        eventsResult.error ||
        workSessionsResult.error ||
        batchRunsResult.error ||
        itemsResult.error ||
        orderItemsResult.error ||
        absencesResult.error
      ) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      setProfiles((profilesResult.data ?? []) as OperatorProfileRow[]);
      setOperatorConfigs((configsResult.data ?? []) as OperatorConfigRow[]);
      setAssignments((assignmentsResult.data ?? []) as OperatorAssignmentRow[]);
      setStations(
        ((stationsResult.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            id: String(row.id),
            name: String(row.name ?? ""),
            trackingMode:
              row.tracking_mode === "order_level" ||
              row.tracking_mode === "receipt_only"
                ? row.tracking_mode
                : "construction_level",
          }),
        ),
      );
      if (settingsResult.data) {
        setWorkingCalendar(parseWorkingCalendar(settingsResult.data));
      }
      setEvents((eventsResult.data ?? []) as ProductionStatusEventRow[]);
      setWorkSessions(
        (workSessionsResult.data ?? []) as ProductionWorkSessionRow[],
      );
      setBatchRuns(
        ((batchRunsResult.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            ...(row as Omit<BatchRunRow, "orders">),
            orders: normalizeJoinedOrder(row.orders),
          }),
        ),
      );
      setProductionItems(
        ((itemsResult.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            ...(row as Omit<ProductionItemRow, "orders">),
            orders: normalizeJoinedOrder(row.orders),
          }),
        ),
      );
      setOrderItems((orderItemsResult.data ?? []) as OperatorOrderItemRow[]);
      setAbsenceRows((absencesResult.data ?? []) as OperatorAbsenceRow[]);
      setIsLoading(false);
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [operatorId, t, user.tenantId]);

  const selectedRange = useMemo(
    () => buildDateRange(selectedPeriod.startDate, selectedPeriod.endDate),
    [selectedPeriod],
  );
  const selectedPeriodLabel = useMemo(
    () =>
      formatPeriodLabel(
        selectedPeriod.startDate,
        selectedPeriod.endDate,
        locale,
      ),
    [locale, selectedPeriod.endDate, selectedPeriod.startDate],
  );
  const selectedPeriodRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateValue(selectedPeriod.startDate);
    const to = parseDateValue(selectedPeriod.endDate);
    return from && to ? { from, to } : undefined;
  }, [selectedPeriod.endDate, selectedPeriod.startDate]);

  const summary = useMemo(
    () =>
      buildOperatorSummaryRows({
        profiles,
        operatorConfigs,
        assignments,
        stations,
        events,
        workSessions,
        batchRuns,
        productionItems,
        filter: {
          range: selectedRange,
          calendar: workingCalendar,
        },
      })[0] ?? null,
    [
      profiles,
      operatorConfigs,
      assignments,
      stations,
      events,
      workSessions,
      batchRuns,
      productionItems,
      selectedRange,
      workingCalendar,
    ],
  );

  const activeConfig = useMemo(() => {
    const normalizedName = summary?.name.trim().toLowerCase() ?? "";
    return (
      operatorConfigs.find((config) => config.user_id === operatorId) ??
      operatorConfigs.find(
        (config) => config.name.trim().toLowerCase() === normalizedName,
      ) ??
      null
    );
  }, [operatorConfigs, operatorId, summary?.name]);

  const assignedStationIds = useMemo(
    () =>
      assignments
        .filter(
          (assignment) =>
            assignment.user_id === operatorId && assignment.is_active,
        )
        .map((assignment) => assignment.station_id),
    [assignments, operatorId],
  );
  const orderLevelStationIds = useMemo(
    () =>
      stations
        .filter((station) => station.trackingMode !== "construction_level")
        .map((station) => station.id),
    [stations],
  );
  const hasConstructionLevelAssignment = useMemo(
    () =>
      assignedStationIds.some((stationId) => !orderLevelStationIds.includes(stationId)),
    [assignedStationIds, orderLevelStationIds],
  );
  const isOrderLevelOperator =
    assignedStationIds.length > 0 && !hasConstructionLevelAssignment;
  const [pauseReasonFilter, setPauseReasonFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [showAllPauses, setShowAllPauses] = useState(false);

  const displayedHourlyRate =
    hourlyRateInput ??
    (activeConfig?.hourly_rate != null ? String(activeConfig.hourly_rate) : "");
  const displayedOvertimeRate =
    overtimeRateInput ??
    (activeConfig?.overtime_rate != null
      ? String(activeConfig.overtime_rate)
      : "");

  useEffect(() => {
    setWeeklyTargetInput(
      formatMinutesAsHoursInput(activeConfig?.weekly_target_minutes),
    );
    setMonthlyTargetInput(
      formatMinutesAsHoursInput(activeConfig?.monthly_target_minutes),
    );
    setOvertimeThresholdInput(
      formatMinutesAsHoursInput(activeConfig?.overtime_threshold_minutes),
    );
    setAbsences(
      absenceRows
        .filter((row) => row.operator_id === activeConfig?.id)
        .map((row) => ({
          id: row.id,
          absenceType: row.absence_type,
          startDate: row.start_date,
          endDate: row.end_date,
          note: row.note ?? "",
        })),
    );
    setDeletedAbsenceIds([]);
    setSettingsError("");
    setSettingsSuccess("");
  }, [absenceRows, activeConfig]);

  const orderBreakdown = useMemo(
    () =>
      buildOperatorOrderBreakdown({
        actorUserId: operatorId,
        events,
        workSessions,
        batchRuns,
        productionItems,
        stations,
        filter: {
          range: selectedRange,
          calendar: workingCalendar,
          assignedStationIds,
          orderLevelStationIds,
        },
      }),
    [
      operatorId,
      events,
      workSessions,
      batchRuns,
      productionItems,
      stations,
      selectedRange,
      workingCalendar,
      assignedStationIds,
      orderLevelStationIds,
    ],
  );

  const unitBreakdown = useMemo(
    () =>
      buildOperatorUnitBreakdown({
        actorUserId: operatorId,
        events,
        workSessions,
        batchRuns,
        productionItems,
        orderItems,
        stations,
        filter: {
          range: selectedRange,
          calendar: workingCalendar,
          assignedStationIds,
        },
      }),
    [
      operatorId,
      events,
      workSessions,
      batchRuns,
      productionItems,
      orderItems,
      stations,
      selectedRange,
      workingCalendar,
      assignedStationIds,
    ],
  );

  const stationBreakdown = useMemo(
    () =>
      buildOperatorStationBreakdown({
        actorUserId: operatorId,
        events,
        workSessions,
        productionItems,
        stations,
        batchRuns,
        filter: {
          range: selectedRange,
          calendar: workingCalendar,
          assignedStationIds,
        },
      }),
    [
      operatorId,
      events,
      workSessions,
      productionItems,
      stations,
      batchRuns,
      selectedRange,
      workingCalendar,
      assignedStationIds,
    ],
  );

  const productionItemById = useMemo(
    () => new Map(productionItems.map((item) => [item.id, item])),
    [productionItems],
  );
  const batchRunById = useMemo(
    () => new Map(batchRuns.map((run) => [run.id, run])),
    [batchRuns],
  );
  const stationNameById = useMemo(
    () => new Map(stations.map((station) => [station.id, station.name])),
    [stations],
  );
  const stationTrackingModeById = useMemo(
    () =>
      new Map(
        stations.map((station) => [
          station.id,
          station.trackingMode ?? "construction_level",
        ]),
      ),
    [stations],
  );
  const orderItemById = useMemo(
    () => new Map(orderItems.map((item) => [item.id, item])),
    [orderItems],
  );
  const orderItemBySourceKey = useMemo(() => {
    const map = new Map<string, OperatorOrderItemRow>();
    orderItems.forEach((item) => {
      if (item.source_row_id) {
        map.set(`${item.order_id}:${item.source_row_id}`, item);
      }
    });
    return map;
  }, [orderItems]);
  const getItemUnitDisplay = useCallback(
    (item: ProductionItemRow | null) => {
      if (!item) {
        return {
          productType: null as string | null,
          itemName: null as string | null,
          position: null as string | null,
        };
      }
      const sourceKey = getProductionItemSourceKey(item);
      const orderItem = sourceKey
        ? (orderItemById.get(sourceKey) ??
          orderItemBySourceKey.get(`${item.order_id}:${sourceKey}`))
        : undefined;
      const productType =
        getProductionItemMetaRowValue(item, "item_type") ??
        getOrderItemProductTypeLabel(orderItem) ??
        item.material ??
        null;
      const itemName = item.item_name ?? orderItem?.item_name ?? null;
      const position = getOrderItemPositionLabel(orderItem);
      return {
        productType,
        itemName,
        position,
      };
    },
    [orderItemById, orderItemBySourceKey],
  );

  const pauseRowsAll = useMemo(() => {
    const orderedSessions = [...workSessions].sort((a, b) =>
      String(a.started_at).localeCompare(String(b.started_at)),
    );

    const rows = orderedSessions
      .filter(
        (session) =>
          session.operator_user_id === operatorId &&
          session.ended_status === "paused" &&
          isIsoInRange(
            session.stopped_at ?? session.updated_at ?? session.created_at,
            selectedRange,
          ),
      )
      .map((session) => {
        const run = batchRunById.get(session.batch_run_id) ?? null;
        const item = session.production_item_id
          ? (productionItemById.get(session.production_item_id) ?? null)
          : null;
        const stationId =
          session.station_id ?? item?.station_id ?? run?.station_id;
        const stationMode = stationId
          ? (stationTrackingModeById.get(stationId) ?? "construction_level")
          : "construction_level";
        const isOrderLevel = stationMode !== "construction_level";
        const orderId = item?.order_id ?? run?.order_id ?? session.order_id;
        const stopIso =
          session.stopped_at ??
          session.updated_at ??
          session.created_at ??
          null;
        const stopMs = stopIso ? Date.parse(stopIso) : NaN;
        const nextSession = orderedSessions.find((candidate) => {
          if (candidate.id === session.id) {
            return false;
          }
          if (candidate.operator_user_id !== session.operator_user_id) {
            return false;
          }
          if (candidate.batch_run_id !== session.batch_run_id) {
            return false;
          }
          if (
            !isOrderLevel &&
            (session.production_item_id ?? null) !==
              (candidate.production_item_id ?? null)
          ) {
            return false;
          }
          const candidateStartMs = Date.parse(candidate.started_at);
          return Number.isFinite(stopMs) && Number.isFinite(candidateStartMs)
            ? candidateStartMs > stopMs
            : false;
        });
        const pauseMinutes =
          nextSession && Number.isFinite(stopMs)
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(nextSession.started_at) - stopMs) / 60000,
                ),
              )
            : null;
        const reason = session.stop_reason?.trim() || "-";
        const stopMinuteKey = Number.isFinite(stopMs)
          ? String(Math.floor(stopMs / 60000))
          : (stopIso ?? "");
        const itemDisplay = !isOrderLevel
          ? getItemUnitDisplay(item)
          : { productType: null, itemName: null, position: null };
        return {
          id: session.id,
          groupKey: isOrderLevel
            ? `${stationId ?? "unknown"}-${orderId}-${stopMinuteKey}-${reason}`
            : `${stationId ?? "unknown"}-${session.batch_run_id}-${session.production_item_id ?? "run"}-${stopMinuteKey}-${reason}`,
          sortValue: stopIso ?? "",
          stoppedAt: formatClockValue(stopIso, locale),
          orderId,
          orderNumber:
            item?.orders?.order_number ??
            run?.orders?.order_number ??
            session.order_id,
          customerName:
            item?.orders?.customer_name ?? run?.orders?.customer_name ?? "",
          stationName: stationId
            ? (stationNameById.get(stationId) ?? stationId)
            : "-",
          itemProductType: itemDisplay.productType,
          itemLabel: itemDisplay.itemName,
          itemPosition: itemDisplay.position,
          reason,
          pauseMinutes,
          workedMinutes: Math.max(0, Number(session.duration_minutes ?? 0)),
        };
      })
      .sort((a, b) => String(b.sortValue).localeCompare(String(a.sortValue)));

    const grouped = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      const current = grouped.get(row.groupKey);
      if (!current) {
        grouped.set(row.groupKey, row);
        return;
      }
      if (
        row.pauseMinutes != null &&
        (current.pauseMinutes == null ||
          row.pauseMinutes > current.pauseMinutes)
      ) {
        current.pauseMinutes = row.pauseMinutes;
      }
    });
    return Array.from(grouped.values());
  }, [
    batchRunById,
    locale,
    operatorId,
    getItemUnitDisplay,
    productionItemById,
    selectedRange,
    stationNameById,
    stationTrackingModeById,
    workSessions,
  ]);
  const pauseReasonOptions = useMemo(() => {
    const reasons = Array.from(
      new Set(
        pauseRowsAll
          .map((row) => row.reason)
          .filter((reason) => reason && reason !== "-"),
      ),
    ).sort((a, b) => a.localeCompare(b, locale));
    return [
      { value: "all", label: t("production.main.operatorDetail.allReasons") },
      ...reasons.map((reason) => ({ value: reason, label: reason })),
    ];
  }, [locale, pauseRowsAll, t]);
  const filteredPauseRows = useMemo(
    () =>
      pauseRowsAll.filter(
        (row) =>
          pauseReasonFilter === "all" || row.reason === pauseReasonFilter,
      ),
    [pauseReasonFilter, pauseRowsAll],
  );
  const visiblePauseRows = showAllPauses
    ? filteredPauseRows
    : filteredPauseRows.slice(0, 10);
  const canTogglePauseRows = filteredPauseRows.length > 10;

  const getStatusLabel = useCallback(
    (status: string | null | undefined) => {
      if (!status) {
        return "-";
      }
      if (status === "unknown") {
        return "-";
      }
      if (!STATUS_FILTER_VALUES.includes(status as ProductionStatus)) {
        return status;
      }
      return t(`production.main.operatorDetail.statuses.${status}`);
    },
    [t],
  );
  const orderStatusOptions = useMemo(() => {
    const statuses = new Set([
      ...STATUS_FILTER_VALUES,
      ...orderBreakdown.map((row) => normalizeStatusFilterValue(row.status)),
    ]);
    return [
      {
        value: "all",
        label: t("production.main.operatorDetail.allStatuses"),
      },
      ...Array.from(statuses).map((status) => ({
        value: status,
        label: getStatusLabel(status),
      })),
    ];
  }, [getStatusLabel, orderBreakdown, t]);
  const unitStatusOptions = useMemo(() => {
    const statuses = new Set([
      ...STATUS_FILTER_VALUES,
      ...unitBreakdown.map((row) => normalizeStatusFilterValue(row.status)),
    ]);
    return [
      {
        value: "all",
        label: t("production.main.operatorDetail.allStatuses"),
      },
      ...Array.from(statuses).map((status) => ({
        value: status,
        label: getStatusLabel(status),
      })),
    ];
  }, [getStatusLabel, t, unitBreakdown]);
  const filteredOrderBreakdown = useMemo(
    () =>
      orderBreakdown.filter(
        (row) =>
          orderStatusFilter === "all" ||
          normalizeStatusFilterValue(row.status) === orderStatusFilter,
      ),
    [orderBreakdown, orderStatusFilter],
  );
  const filteredUnitBreakdown = useMemo(
    () =>
      unitBreakdown.filter(
        (row) =>
          unitStatusFilter === "all" ||
          normalizeStatusFilterValue(row.status) === unitStatusFilter,
      ),
    [unitBreakdown, unitStatusFilter],
  );
  const renderStatusBadge = useCallback(
    (status: string | null | undefined) => (
      <Badge variant={getStatusBadgeVariant(status)}>
        {getStatusLabel(status)}
      </Badge>
    ),
    [getStatusLabel],
  );

  useEffect(() => {
    setShowAllPauses(false);
  }, [pauseReasonFilter, selectedRange]);

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        style: "percent",
      }),
    [locale],
  );

  const workedMinutes = summary?.workedMinutes ?? 0;
  const orderUnits = orderBreakdown.reduce(
    (sum, row) => sum + (row.itemCount ?? row.completedItems),
    0,
  );
  const doneUnitRows = unitBreakdown.filter(
    (row) => normalizeStatusFilterValue(row.status) === "done",
  );
  const completedUnits = doneUnitRows.reduce(
    (sum, row) => sum + Math.max(1, Number(row.qty ?? 0)),
    0,
  );
  const orderWorkedMinutes = orderBreakdown.reduce(
    (sum, row) => sum + row.workedMinutes,
  0,
  );
  const ordersWithWorkCount = orderBreakdown.length;
  const completedUnitWorkedMinutes = doneUnitRows
    .reduce((sum, row) => sum + row.workedMinutes, 0);
  const otherWorkedMinutes = Math.max(
    0,
    workedMinutes - orderWorkedMinutes,
  );
  const qtyPerHour =
    completedUnitWorkedMinutes > 0 && completedUnits > 0
      ? completedUnits / (completedUnitWorkedMinutes / 60)
      : null;
  const minutesPerUnit =
    completedUnits > 0
      ? Math.round(completedUnitWorkedMinutes / completedUnits)
      : null;
  const stationRows = useMemo(
    () => {
      const completedUnitsByStation = new Map<string, number>();
      const relatedUnitsByStation = new Map<string, number>();
      doneUnitRows
        .forEach((row) => {
          const key = row.stationId ?? "unassigned";
          completedUnitsByStation.set(
            key,
            (completedUnitsByStation.get(key) ?? 0) +
              Math.max(1, Number(row.qty ?? 0)),
          );
        });
      orderBreakdown.forEach((row) => {
        const key = row.stationId ?? "unassigned";
        relatedUnitsByStation.set(
          key,
          (relatedUnitsByStation.get(key) ?? 0) +
            Math.max(row.itemCount ?? row.completedItems ?? 0, 0),
        );
      });
      return stationBreakdown
        .map((row) => ({
          ...row,
          workedMinutes: workedMinutes > 0 ? row.workedMinutes : 0,
          completedItems:
            completedUnitsByStation.get(row.stationId ?? "unassigned") ?? 0,
          relatedUnits:
            relatedUnitsByStation.get(row.stationId ?? "unassigned") ?? 0,
        }))
        .filter(
          (row) =>
            row.workedMinutes > 0 ||
            row.completedItems > 0 ||
            row.relatedUnits > 0,
        )
        .map((row) => ({
          ...row,
          share: workedMinutes > 0 ? row.workedMinutes / workedMinutes : 0,
        }));
    },
    [doneUnitRows, orderBreakdown, stationBreakdown, workedMinutes],
  );
  const periodPickerControl = (compact = false) => (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        className={
          compact
            ? "h-8 w-[210px] rounded-full px-3 text-xs font-medium"
            : "h-9 w-full max-w-[260px] rounded-full px-3 text-xs font-medium"
        }
        onClick={() => {
          setPeriodPickerDraft(selectedPeriodRange);
          setPeriodPickerOpen((current) => !current);
        }}
      >
        <span className="truncate">{selectedPeriodLabel}</span>
        <CalendarIcon className="h-4 w-4" />
      </Button>
      {periodPickerOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[340px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="space-y-1 border-b border-border px-3 py-2">
            <div className="text-xs font-medium text-foreground">
              {t("production.main.operatorDetail.period")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("production.main.operatorDetail.periodPickerHint")}
            </div>
          </div>
          <Calendar
            mode="range"
            className="w-full"
            classNames={{
              root: "relative p-0",
              month: "space-y-3 px-3 pb-3",
              month_caption:
                "relative flex min-h-10 items-center justify-center pt-2",
              nav: "absolute left-0 top-0 z-10 flex w-full items-center justify-between px-3 pt-2",
            }}
            selected={periodPickerDraft ?? selectedPeriodRange}
            onSelect={(range) => {
              setPeriodPickerDraft(range ?? undefined);
              const nextValue = buildDateRangeValue(range ?? undefined);
              if (!nextValue) {
                return;
              }
              setSelectedPeriod(nextValue);
            }}
            disabled={isFutureDate}
            showWeekNumber={false}
            initialFocus
          />
          <div className="flex justify-end border-t border-border px-3 py-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPeriodPickerOpen(false);
                setPeriodPickerDraft(undefined);
              }}
            >
              OK
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
  const assignedStationNames = summary?.stations ?? [];
  const operatorSubtitleText = [
    summary?.role ?? t("production.main.operatorDetail.subtitle"),
    assignedStationNames.length > 0 ? assignedStationNames.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const operatorTrackingHint = isOrderLevelOperator
    ? t("production.main.operatorDetail.orderLevelTrackingHint")
    : null;
  const workloadNormMetrics = useMemo(() => {
    const start = parseDateValue(selectedPeriod.startDate);
    const end = parseDateValue(selectedPeriod.endDate);
    if (!start || !end) {
      return null;
    }
    const orderedStart = start <= end ? start : end;
    const orderedEnd = end >= start ? end : start;
    const workdays = workingCalendar.workdays?.length
      ? workingCalendar.workdays
      : [1, 2, 3, 4, 5];
    const workdaysPerWeek = Math.max(workdays.length, 1);
    const selectedWorkdays = countMatchingWeekdaysBetween(
      orderedStart,
      orderedEnd,
      workdays,
    );
    const isFullMonth = isFullCalendarMonthRange(orderedStart, orderedEnd);
    const workingDaysInMonth = countMatchingWeekdaysBetween(
      new Date(orderedStart.getFullYear(), orderedStart.getMonth(), 1),
      new Date(orderedStart.getFullYear(), orderedStart.getMonth() + 1, 0),
      workdays,
    );

    const resolvePeriodMinutes = (value: number | null | undefined) => {
      if (value == null || !Number.isFinite(value) || value <= 0) {
        return null;
      }
      if (isFullMonth && activeConfig?.monthly_target_minutes != null && value === activeConfig.monthly_target_minutes) {
        return value;
      }
      if (isFullMonth && value === activeConfig?.overtime_threshold_minutes) {
        return value;
      }
      if (activeConfig?.weekly_target_minutes != null && value === activeConfig.weekly_target_minutes) {
        return Math.round((value * selectedWorkdays) / workdaysPerWeek);
      }
      if (activeConfig?.overtime_threshold_minutes != null && value === activeConfig.overtime_threshold_minutes) {
        if (activeConfig?.weekly_target_minutes != null) {
          return Math.round((value * selectedWorkdays) / workdaysPerWeek);
        }
        if (workingDaysInMonth > 0) {
          return Math.round((value * selectedWorkdays) / workingDaysInMonth);
        }
      }
      if (workingDaysInMonth > 0) {
        return Math.round((value * selectedWorkdays) / workingDaysInMonth);
      }
      return value;
    };

    const targetMinutes =
      activeConfig?.weekly_target_minutes != null
        ? resolvePeriodMinutes(activeConfig.weekly_target_minutes)
        : resolvePeriodMinutes(activeConfig?.monthly_target_minutes);
    const thresholdMinutes = resolvePeriodMinutes(
      activeConfig?.overtime_threshold_minutes,
    );
    const actualMinutes = summary?.workedMinutes ?? 0;
    const deviationMinutes =
      targetMinutes == null ? null : actualMinutes - targetMinutes;
    const overNormMinutes =
      deviationMinutes != null ? Math.max(0, deviationMinutes) : null;

    return {
      targetMinutes,
      actualMinutes,
      deviationMinutes,
      overNormMinutes,
      thresholdMinutes,
      selectedWorkdays,
      totalDays: getInclusiveDayCount(orderedStart, orderedEnd),
    };
  }, [
    activeConfig,
    selectedPeriod.endDate,
    selectedPeriod.startDate,
    summary?.workedMinutes,
    workingCalendar.workdays,
  ]);
  const absenceTypeOptions = useMemo(
    () => [
      {
        value: "vacation",
        label: t("production.main.operatorDetail.absence.vacation"),
      },
      {
        value: "sick_leave",
        label: t("production.main.operatorDetail.absence.sickLeave"),
      },
      {
        value: "unpaid",
        label: t("production.main.operatorDetail.absence.unpaid"),
      },
      {
        value: "training",
        label: t("production.main.operatorDetail.absence.training"),
      },
    ],
    [t],
  );

  const handleSaveSettings = async () => {
    if (!supabase || !user.tenantId || !summary) {
      return;
    }
    const hourlyRate = parseOptionalNumber(displayedHourlyRate);
    const overtimeRate = parseOptionalNumber(displayedOvertimeRate);
    const weeklyTargetMinutes = parseOptionalHoursToMinutes(weeklyTargetInput);
    const monthlyTargetMinutes =
      parseOptionalHoursToMinutes(monthlyTargetInput);
    const overtimeThresholdMinutes = parseOptionalHoursToMinutes(
      overtimeThresholdInput,
    );
    const invalidAbsence = absences.find(
      (row) => !row.startDate || !row.endDate || row.endDate < row.startDate,
    );
    if (invalidAbsence) {
      setSettingsError(
        t("production.main.operatorDetail.settingsInvalidAbsence"),
      );
      setSettingsSuccess("");
      return;
    }
    setIsSavingRates(true);
    setSettingsError("");
    setSettingsSuccess("");
    const payload = {
      tenant_id: user.tenantId,
      user_id: operatorId,
      name: summary.name,
      role: summary.role,
      hourly_rate: hourlyRate,
      overtime_rate: overtimeRate,
      weekly_target_minutes: weeklyTargetMinutes,
      monthly_target_minutes: monthlyTargetMinutes,
      overtime_threshold_minutes: overtimeThresholdMinutes,
      is_active: true,
    };
    const query = activeConfig
      ? supabase
          .from("operators")
          .update(payload)
          .eq("id", activeConfig.id)
          .select(
            "id, user_id, name, role, hourly_rate, overtime_rate, weekly_target_minutes, monthly_target_minutes, overtime_threshold_minutes, is_active",
          )
          .single()
      : supabase
          .from("operators")
          .insert(payload)
          .select(
            "id, user_id, name, role, hourly_rate, overtime_rate, weekly_target_minutes, monthly_target_minutes, overtime_threshold_minutes, is_active",
          )
          .single();
    const { data, error } = await query;
    if (error) {
      setSettingsError(error.message || t("production.main.errors.loadFailed"));
      setIsSavingRates(false);
      return;
    }
    const savedOperator = data as OperatorConfigRow | null;
    const savedOperatorId = savedOperator?.id ?? activeConfig?.id ?? "";
    if (savedOperatorId) {
      if (deletedAbsenceIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("operator_absences")
          .delete()
          .in("id", deletedAbsenceIds);
        if (deleteError) {
          setSettingsError(deleteError.message);
          setIsSavingRates(false);
          return;
        }
      }

      const rowsToUpsert = absences.map((row) => ({
        ...(row.isNew ? {} : { id: row.id }),
        tenant_id: user.tenantId,
        operator_id: savedOperatorId,
        absence_type: row.absenceType,
        start_date: row.startDate,
        end_date: row.endDate,
        note: row.note.trim() || null,
      }));
      if (rowsToUpsert.length > 0) {
        const { data: savedAbsences, error: absenceError } = await supabase
          .from("operator_absences")
          .upsert(rowsToUpsert)
          .select(
            "id, tenant_id, operator_id, absence_type, start_date, end_date, note",
          );
        if (absenceError) {
          setSettingsError(absenceError.message);
          setIsSavingRates(false);
          return;
        }
        setAbsenceRows((prev) => [
          ...prev.filter((row) => row.operator_id !== savedOperatorId),
          ...((savedAbsences ?? []) as OperatorAbsenceRow[]),
        ]);
      } else {
        setAbsenceRows((prev) =>
          prev.filter((row) => row.operator_id !== savedOperatorId),
        );
      }
    }
    setIsSavingRates(false);
    setOperatorConfigs((prev) => {
      if (!savedOperator) {
        return prev;
      }
      if (activeConfig) {
        return prev.map((config) =>
          config.id === activeConfig.id
            ? { ...config, ...savedOperator }
            : config,
        );
      }
      return [...prev, savedOperator];
    });
    setHourlyRateInput(hourlyRate != null ? String(hourlyRate) : "");
    setOvertimeRateInput(overtimeRate != null ? String(overtimeRate) : "");
    setWeeklyTargetInput(formatMinutesAsHoursInput(weeklyTargetMinutes));
    setMonthlyTargetInput(formatMinutesAsHoursInput(monthlyTargetMinutes));
    setOvertimeThresholdInput(
      formatMinutesAsHoursInput(overtimeThresholdMinutes),
    );
    setDeletedAbsenceIds([]);
    setSettingsSuccess(t("production.main.operatorDetail.settingsSaved"));
  };

  const addAbsence = () => {
    const today = getTodayDateValue();
    setAbsences((prev) => [
      {
        id: `new-${Date.now()}`,
        absenceType: "vacation",
        startDate: today,
        endDate: today,
        note: "",
        isNew: true,
      },
      ...prev,
    ]);
    setSettingsSuccess("");
    setSettingsError("");
  };

  const updateAbsence = (
    id: string,
    patch: Partial<Omit<EditableAbsenceRow, "id" | "isNew">>,
  ) => {
    setAbsences((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
    setSettingsSuccess("");
    setSettingsError("");
  };

  const removeAbsence = (row: EditableAbsenceRow) => {
    setAbsences((prev) => prev.filter((item) => item.id !== row.id));
    if (!row.isNew) {
      setDeletedAbsenceIds((prev) => [...prev, row.id]);
    }
    setSettingsSuccess("");
    setSettingsError("");
  };

  const backToOperatorsButton = (
    <Tooltip
      content={t("production.main.operatorDetail.backToOperators")}
      side="bottom"
    >
      <Button asChild variant="outline" size="icon" className="rounded-full">
        <Link
          href="/production/operators"
          aria-label={t("production.main.operatorDetail.backToOperators")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
      </Button>
    </Tooltip>
  );

  const settingsButton = (
    <Tooltip
      content={t("production.main.operatorDetail.settingsTitle")}
      side="bottom"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={() => setIsSettingsOpen(true)}
        aria-label={t("production.main.operatorDetail.settingsTitle")}
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );

  return (
    <div className="space-y-4">
      <DesktopPageHeader
        sticky
        title={
          <span className="flex items-center gap-3 text-xl">
            {backToOperatorsButton}
            <span>{summary?.name ?? t("production.main.operators.title")}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {summary?.role ?? t("production.main.operatorDetail.subtitle")}
            </span>
            {assignedStationNames.map((station) => (
              <span
                key={station}
                className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground"
              >
                {station}
              </span>
            ))}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {periodPickerControl(true)}
            {settingsButton}
          </div>
        }
        footer={
          operatorTrackingHint ? (
            <p className="text-sm text-muted-foreground">{operatorTrackingHint}</p>
          ) : null
        }
        titleBlockClassName="md:max-w-none xl:max-w-none"
      />
      <MobilePageTitle
        title={summary?.name ?? t("production.main.operators.title")}
        subtitle={operatorSubtitleText}
        showCompact={false}
        rightAction={
          <div className="flex items-center gap-2">
            {settingsButton}
            {backToOperatorsButton}
          </div>
        }
      />
      {operatorTrackingHint ? (
        <div className="px-4 pb-3 md:hidden">
          <p className="text-sm text-muted-foreground">{operatorTrackingHint}</p>
        </div>
      ) : null}
      <div className="px-4 md:hidden">{periodPickerControl()}</div>

      {dataError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      <div
        className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${
          isOrderLevelOperator ? "xl:grid-cols-4" : "xl:grid-cols-7"
        }`}
      >
        <ProductionStatCard
          label={t("production.main.operators.workedHours")}
          value={formatWorkedDuration(summary?.workedMinutes ?? 0)}
        />
        <ProductionStatCard
          label={t("production.main.operatorDetail.overtimeHours")}
          value={formatWorkedDuration(summary?.overtimeMinutes ?? 0)}
        />
        {!isOrderLevelOperator ? (
          <ProductionStatCard
            label={t("production.main.operatorDetail.completedUnits")}
            value={completedUnits}
          />
        ) : null}
        <ProductionStatCard
          label={t("production.main.operators.ordersShort")}
          value={ordersWithWorkCount}
        />
        <ProductionStatCard
          label={t("production.main.operators.laborCost")}
          value={formatLaborCost(summary?.laborCost)}
        />
        {!isOrderLevelOperator ? (
          <ProductionStatCard
            label={t("production.main.operatorDetail.efficiencyQtyPerHour")}
            value={qtyPerHour == null ? "-" : numberFormatter.format(qtyPerHour)}
          />
        ) : null}
        {!isOrderLevelOperator ? (
          <ProductionStatCard
            label={t("production.main.operatorDetail.efficiencyMinutesPerUnit")}
            value={
              minutesPerUnit == null ? "-" : formatWorkedDuration(minutesPerUnit)
            }
          />
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,9fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.orders")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderBreakdown.length > 0 || otherWorkedMinutes > 0 ? (
                <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  {orderBreakdown.length > 0 ? (
                    <span>
                      {t("production.main.operatorDetail.orderTime")}:{" "}
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(orderWorkedMinutes)}
                      </span>
                    </span>
                  ) : null}
                  {otherWorkedMinutes > 0 ? (
                    <span>
                      {t("production.main.operatorDetail.otherWorkedTime")}:{" "}
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(otherWorkedMinutes)}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {orderBreakdown.length > 0 ? (
                <div className="mb-4 max-w-xs">
                  <SelectField
                    label={t("production.main.operatorDetail.statusFilter")}
                    value={orderStatusFilter}
                    onValueChange={setOrderStatusFilter}
                    options={orderStatusOptions}
                  />
                </div>
              ) : null}
              {filteredOrderBreakdown.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noRecordsForFilters")}
                </div>
              ) : null}
              {filteredOrderBreakdown.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.order")}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.statusLabel")}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.station")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("production.main.operatorDetail.time")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {hasConstructionLevelAssignment
                            ? t("production.main.operators.itemsShort")
                            : t("production.main.operatorDetail.relatedUnitsShort")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrderBreakdown.map((row) => (
                        <tr
                          key={row.orderId}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-2 font-medium">
                            <Link
                              href={`/production/jobs/${row.orderId}`}
                              className="hover:underline"
                            >
                              {row.orderNumber}
                            </Link>
                            {row.customerName ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                {row.customerName}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {renderStatusBadge(row.status)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.stationId
                              ? (stationNameById.get(row.stationId) ?? row.stationId)
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatWorkedDuration(row.workedMinutes)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {Math.max(row.itemCount ?? row.completedItems, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.byUnits")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unitBreakdown.length > 0 ? (
                <div className="mb-4 max-w-xs">
                  <SelectField
                    label={t("production.main.operatorDetail.statusFilter")}
                    value={unitStatusFilter}
                    onValueChange={setUnitStatusFilter}
                    options={unitStatusOptions}
                  />
                </div>
              ) : null}
              {filteredUnitBreakdown.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noUnitsForFilters")}
                </div>
              ) : null}
              {filteredUnitBreakdown.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.unit")}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.order")}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.station")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("production.main.operatorDetail.quantity")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("production.main.operatorDetail.time")}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("production.main.operatorDetail.statusLabel")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnitBreakdown.map((row) => (
                        <tr
                          key={row.productionItemId}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-2 font-medium">
                            {row.productType ? (
                              <div>{row.productType}</div>
                            ) : null}
                            {row.itemName ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                {row.itemName}
                              </div>
                            ) : null}
                            {row.unitPosition ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                {row.unitPosition}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/production/jobs/${row.orderId}`}
                              className="font-medium hover:underline"
                            >
                              {row.orderNumber}
                            </Link>
                            {row.customerName ? (
                              <div className="text-xs text-muted-foreground">
                                {row.customerName}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.stationId
                              ? (stationNameById.get(row.stationId) ?? row.stationId)
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-right">{row.qty}</td>
                          <td className="px-3 py-2 text-right">
                            {formatWorkedDuration(row.workedMinutes)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {renderStatusBadge(row.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.pauses")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <SelectField
                  label={t("production.main.operatorDetail.pauseReasonFilter")}
                  value={pauseReasonFilter}
                  onValueChange={setPauseReasonFilter}
                  options={pauseReasonOptions}
                />
              </div>
              {filteredPauseRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {pauseRowsAll.length === 0
                    ? t("production.main.operatorDetail.noPausesForFilters")
                    : t("production.main.operatorDetail.noPausesForReason")}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[620px] text-sm">
                      <colgroup>
                        <col className="w-[80px]" />
                        <col />
                        <col className="w-[86px]" />
                        <col className="w-[150px]" />
                        <col className="w-[82px]" />
                      </colgroup>
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">
                            {t("production.main.operatorDetail.time")}
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            {t("production.main.operatorDetail.order")}
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            {t("production.main.operatorDetail.station")}
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            {t("production.main.operatorDetail.reason")}
                          </th>
                          <th className="px-2 py-2 text-right font-medium">
                            {t("production.main.operatorDetail.pauseDuration")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePauseRows.map((row) => (
                          <tr key={row.id} className="border-t border-border">
                            <td className="px-2 py-2 text-muted-foreground">
                              {row.stoppedAt}
                            </td>
                            <td className="min-w-0 px-2 py-2 font-medium">
                              {row.itemProductType ? (
                                <div className="truncate">
                                  {row.itemProductType}
                                </div>
                              ) : (
                                <div className="truncate">
                                  {row.orderNumber}
                                </div>
                              )}
                              {row.itemLabel ? (
                                <div className="truncate text-xs font-normal text-muted-foreground">
                                  {row.itemLabel}
                                </div>
                              ) : null}
                              {row.itemPosition ? (
                                <div className="truncate text-xs font-normal text-muted-foreground">
                                  {row.itemPosition}
                                </div>
                              ) : null}
                              <div className="truncate text-xs font-normal text-muted-foreground">
                                {row.orderNumber}
                                {row.customerName
                                  ? ` - ${row.customerName}`
                                  : ""}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {row.stationName}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              <div className="truncate">{row.reason}</div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              {row.pauseMinutes == null
                                ? "-"
                                : formatWorkedDuration(row.pauseMinutes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {canTogglePauseRows ? (
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllPauses((prev) => !prev)}
                      >
                        {showAllPauses ? (
                          <>
                            <ChevronUpIcon className="h-4 w-4" />
                            {t("production.main.operatorDetail.showLessPauses")}
                          </>
                        ) : (
                          <>
                            <ChevronDownIcon className="h-4 w-4" />
                            {t(
                              "production.main.operatorDetail.showMorePauses",
                              {
                                count: filteredPauseRows.length - 10,
                              },
                            )}
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.byStations")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stationRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noRecordsForFilters")}
                </div>
              ) : null}
              {stationRows.map((row) => (
                <div
                  key={row.stationId}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {row.stationName}
                      </div>
                      <Tooltip
                        content={t(
                          "production.main.operatorDetail.shareOfTimeHint",
                        )}
                        side="left"
                      >
                        <span className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground">
                          {t("production.main.operatorDetail.shareOfTime")}
                          <InfoIcon className="h-3 w-3" aria-hidden />
                        </span>
                      </Tooltip>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">
                        {percentFormatter.format(row.share)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("production.main.operatorDetail.time")}:{" "}
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(row.workedMinutes)}
                      </span>
                    </span>
                    <span>
                      {isOrderLevelOperator
                        ? t("production.main.operatorDetail.relatedUnitsShort")
                        : t("production.main.operatorDetail.completedUnits")}
                      :{" "}
                      <span className="font-medium text-foreground">
                        {isOrderLevelOperator ? row.relatedUnits : row.completedItems}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.max(0, row.share * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>
                  {t("production.main.operatorDetail.workNorms")}
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs font-medium"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  {t("production.main.operatorDetail.configureWorkNorms")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {workloadNormMetrics?.targetMinutes == null &&
              workloadNormMetrics?.thresholdMinutes == null ? (
                <div className="text-muted-foreground">
                  {t("production.main.operatorDetail.workNormsSummaryHint")}
                </div>
              ) : (
                <>
                  {workloadNormMetrics?.targetMinutes != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("production.main.operatorDetail.periodTarget")}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(workloadNormMetrics.targetMinutes)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t("production.main.operatorDetail.actualWorked")}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatWorkedDuration(workloadNormMetrics?.actualMinutes ?? 0)}
                    </span>
                  </div>
                  {workloadNormMetrics?.deviationMinutes != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("production.main.operatorDetail.workNormDeviation")}
                      </span>
                      <span className="font-medium text-foreground">
                        {workloadNormMetrics.deviationMinutes > 0 ? "+" : ""}
                        {formatWorkedDuration(
                          Math.abs(workloadNormMetrics.deviationMinutes),
                        )}
                      </span>
                    </div>
                  ) : null}
                  {workloadNormMetrics?.overNormMinutes != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("production.main.operatorDetail.overNorm")}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(workloadNormMetrics.overNormMinutes)}
                      </span>
                    </div>
                  ) : null}
                  {workloadNormMetrics?.thresholdMinutes != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("production.main.operatorDetail.periodOvertimeThreshold")}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatWorkedDuration(workloadNormMetrics.thresholdMinutes)}
                      </span>
                    </div>
                  ) : null}
                  <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                    {t("production.main.operatorDetail.workNormsCardHint", {
                      days: workloadNormMetrics?.selectedWorkdays ?? 0,
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ResponsiveModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        ariaLabel={t("production.main.operatorDetail.settingsTitle")}
        title={t("production.main.operatorDetail.settingsTitle")}
        closeButtonLabel={t("production.main.common.close")}
        desktopPanelClassName="w-[min(94vw,920px)]"
        desktopBodyClassName="overflow-y-auto"
      >
        <div className="space-y-5 p-4 md:p-5">
          <section className="rounded-lg border border-border p-4">
            <div className="mb-4">
              <div className="text-sm font-semibold">
                {t("production.main.operatorDetail.payRates")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("production.main.operatorDetail.settingsRatesHint")}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                label={t("production.main.operatorDetail.hourlyRate")}
                value={displayedHourlyRate}
                onChange={(event) => {
                  setHourlyRateInput(event.target.value);
                  setSettingsSuccess("");
                }}
                inputMode="decimal"
                placeholder="25.00"
              />
              <InputField
                label={t("production.main.operatorDetail.overtimeRate")}
                value={displayedOvertimeRate}
                onChange={(event) => {
                  setOvertimeRateInput(event.target.value);
                  setSettingsSuccess("");
                }}
                inputMode="decimal"
                placeholder="-"
              />
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="mb-4">
              <div className="text-sm font-semibold">
                {t("production.main.operatorDetail.workNorms")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("production.main.operatorDetail.workNormsHint")}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <InputField
                label={t("production.main.operatorDetail.weeklyTargetHours")}
                value={weeklyTargetInput}
                onChange={(event) => {
                  setWeeklyTargetInput(event.target.value);
                  setSettingsSuccess("");
                }}
                inputMode="decimal"
                placeholder="40"
              />
              <InputField
                label={t("production.main.operatorDetail.monthlyTargetHours")}
                value={monthlyTargetInput}
                onChange={(event) => {
                  setMonthlyTargetInput(event.target.value);
                  setSettingsSuccess("");
                }}
                inputMode="decimal"
                placeholder="160"
              />
              <InputField
                label={t(
                  "production.main.operatorDetail.overtimeThresholdHours",
                )}
                value={overtimeThresholdInput}
                onChange={(event) => {
                  setOvertimeThresholdInput(event.target.value);
                  setSettingsSuccess("");
                }}
                inputMode="decimal"
                placeholder="160"
              />
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("production.main.operatorDetail.absences")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("production.main.operatorDetail.absencesHint")}
                </div>
              </div>
              <Button type="button" variant="outline" onClick={addAbsence}>
                <PlusIcon className="h-4 w-4" />
                {t("production.main.operatorDetail.addAbsence")}
              </Button>
            </div>

            <div className="space-y-3">
              {absences.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noAbsences")}
                </div>
              ) : null}
              {absences.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[160px_1fr_1fr_minmax(0,1.4fr)_auto]"
                >
                  <SelectField
                    label={t("production.main.operatorDetail.absenceType")}
                    value={row.absenceType}
                    onValueChange={(value) =>
                      updateAbsence(row.id, { absenceType: value })
                    }
                    options={absenceTypeOptions}
                  />
                  <DatePicker
                    label={t("production.main.operatorDetail.absenceStart")}
                    value={row.startDate}
                    onChange={(value) =>
                      updateAbsence(row.id, { startDate: value })
                    }
                    placeholder={t(
                      "production.main.operatorDetail.absenceStart",
                    )}
                  />
                  <DatePicker
                    label={t("production.main.operatorDetail.absenceEnd")}
                    value={row.endDate}
                    onChange={(value) =>
                      updateAbsence(row.id, { endDate: value })
                    }
                    min={row.startDate}
                    placeholder={t("production.main.operatorDetail.absenceEnd")}
                  />
                  <InputField
                    label={t("production.main.operatorDetail.absenceNote")}
                    value={row.note}
                    onChange={(event) =>
                      updateAbsence(row.id, { note: event.target.value })
                    }
                    placeholder={t(
                      "production.main.operatorDetail.absenceNotePlaceholder",
                    )}
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAbsence(row)}
                      aria-label={t(
                        "production.main.operatorDetail.removeAbsence",
                      )}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {t("production.main.operatorDetail.settingsManagedElsewhere")}
            </span>
            <Button asChild type="button" variant="outline">
              <Link href="/production/operators?manage=1">
                {t("production.main.operatorDetail.openOperatorManagement")}
              </Link>
            </Button>
          </section>

          {settingsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              {settingsError}
            </div>
          ) : null}
          {settingsSuccess ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              {settingsSuccess}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSettingsOpen(false)}
            >
              {t("production.main.common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSavingRates}
            >
              {isSavingRates
                ? t("production.main.common.saving")
                : t("production.main.common.save")}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
