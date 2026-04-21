"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  buildOperatorSummaryRows,
  formatWorkedDuration,
  type OperatorAssignmentRow,
  type OperatorConfigRow,
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
  ProductionStatusEventRow,
} from "@/types/production";

type PeriodKey = "7d" | "30d" | "90d" | "all";

type OperatorRow = {
  operator: string;
  hours: number;
  constructions: number;
  orders: number;
  stations: string[];
};

const periodDaysMap: Record<Exclude<PeriodKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

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

function buildPeriodRange(period: PeriodKey) {
  if (period === "all") {
    return null;
  }
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (periodDaysMap[period] - 1));
  start.setHours(0, 0, 0, 0);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function buildDayRange(dayOffset: number) {
  const start = new Date();
  start.setDate(start.getDate() - dayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    key: start.toISOString().slice(0, 10),
    label: start.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
    }),
    range: {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    },
  };
}

export function OperatorPerformancePanel() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [station, setStation] = useState("all");
  const [operator, setOperator] = useState("all");
  const [profiles, setProfiles] = useState<OperatorProfileRow[]>([]);
  const [operatorConfigs, setOperatorConfigs] = useState<OperatorConfigRow[]>([]);
  const [assignments, setAssignments] = useState<OperatorAssignmentRow[]>([]);
  const [stations, setStations] = useState<OperatorStationRow[]>([]);
  const [events, setEvents] = useState<ProductionStatusEventRow[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>([]);
  const [workingCalendar, setWorkingCalendar] = useState<WorkingCalendar>({
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "17:00" }],
    overtimeEnabled: false,
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.tenantId) {
      return;
    }
    let isMounted = true;

    const loadData = async () => {
      const [
        profilesResult,
        configsResult,
        assignmentsResult,
        stationsResult,
        settingsResult,
        eventsResult,
        batchRunsResult,
        itemsResult,
      ] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name, role, login_code, auth_mode, is_active")
          .eq("tenant_id", user.tenantId)
          .in("role", ["Operator", "Production planner", "Admin"]),
        sb
          .from("operators")
          .select(
            "id, user_id, name, role, hourly_rate, overtime_rate, is_active",
          )
          .eq("tenant_id", user.tenantId)
          .order("updated_at", { ascending: false }),
        sb
          .from("operator_station_assignments")
          .select("user_id, station_id, is_active")
          .eq("tenant_id", user.tenantId),
        sb
          .from("workstations")
          .select("id, name")
          .eq("tenant_id", user.tenantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
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
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("tenant_id", user.tenantId),
        sb
          .from("production_items")
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, duration_minutes, done_at, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("tenant_id", user.tenantId)
          .order("done_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      setProfiles((profilesResult.data ?? []) as OperatorProfileRow[]);
      setOperatorConfigs((configsResult.data ?? []) as OperatorConfigRow[]);
      setAssignments((assignmentsResult.data ?? []) as OperatorAssignmentRow[]);
      setStations((stationsResult.data ?? []) as OperatorStationRow[]);
      if (settingsResult.data) {
        setWorkingCalendar(parseWorkingCalendar(settingsResult.data));
      }
      setEvents((eventsResult.data ?? []) as ProductionStatusEventRow[]);
      setBatchRuns(
        ((batchRunsResult.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            ...(row as Omit<BatchRunRow, "orders">),
            orders: normalizeJoinedOrder(row.orders),
          }),
        ),
      );
      setProductionItems(
        ((itemsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          ...(row as Omit<ProductionItemRow, "orders">),
          orders: normalizeJoinedOrder(row.orders),
        })),
      );
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [user.tenantId]);

  const periodRange = useMemo(() => buildPeriodRange(period), [period]);

  const baseRows = useMemo(
    () =>
      buildOperatorSummaryRows({
        profiles,
        operatorConfigs,
        assignments,
        stations,
        events,
        batchRuns,
        productionItems,
        filter: {
          range: periodRange,
          calendar: workingCalendar,
        },
      }).filter(
        (row) =>
          row.role.trim().toLowerCase() === "operator" ||
          profiles.some(
            (profile) =>
              profile.id === row.userId &&
              ((profile.role?.trim().toLowerCase() === "operator") ||
                profile.auth_mode === "pin"),
          ),
      ),
    [
      assignments,
      batchRuns,
      events,
      operatorConfigs,
      periodRange,
      productionItems,
      profiles,
      stations,
      workingCalendar,
    ],
  );

  const stationOptions = useMemo(
    () =>
      Array.from(
        new Set(baseRows.flatMap((row) => row.stations).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [baseRows],
  );

  const stationFilteredRows = useMemo(
    () =>
      baseRows.filter((row) =>
        station === "all" ? true : row.stations.includes(station),
      ),
    [baseRows, station],
  );

  const operatorOptions = useMemo(
    () => stationFilteredRows.map((row) => row.name).sort((a, b) => a.localeCompare(b)),
    [stationFilteredRows],
  );

  const selectedOperator =
    operator === "all" || operatorOptions.includes(operator) ? operator : "all";

  const visibleRows = useMemo(
    () =>
      stationFilteredRows.filter((row) =>
        selectedOperator === "all" ? true : row.name === selectedOperator,
      ),
    [selectedOperator, stationFilteredRows],
  );

  const operatorRows = useMemo<OperatorRow[]>(
    () =>
      visibleRows.map((row) => ({
        operator: row.name,
        hours: row.workedMinutes / 60,
        constructions: row.completedItems,
        orders: row.completedOrders,
        stations: row.stations,
      })),
    [visibleRows],
  );

  const totals = useMemo(() => {
    return {
      hours: operatorRows.reduce((sum, row) => sum + row.hours, 0),
      constructions: operatorRows.reduce(
        (sum, row) => sum + row.constructions,
        0,
      ),
      orders: operatorRows.reduce((sum, row) => sum + row.orders, 0),
    };
  }, [operatorRows]);

  const hoursTrend30d = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, index) => buildDayRange(29 - index));
    return days.map((day) => {
      const rows = buildOperatorSummaryRows({
        profiles,
        operatorConfigs,
        assignments,
        stations,
        events,
        batchRuns,
        productionItems,
        filter: {
          range: day.range,
          calendar: workingCalendar,
        },
      }).filter((row) =>
        station === "all" ? true : row.stations.includes(station),
      );
      const selectedRows = rows.filter((row) =>
        selectedOperator === "all" ? true : row.name === selectedOperator,
      );
      const value =
        selectedRows.reduce((sum, row) => sum + row.workedMinutes, 0) / 60;
      return {
        key: day.key,
        label: day.label,
        value: Math.round(value * 10) / 10,
      };
    });
  }, [
    assignments,
    batchRuns,
    events,
    selectedOperator,
    operatorConfigs,
    productionItems,
    profiles,
    station,
    stations,
    workingCalendar,
  ]);

  const chartConfig = useMemo(() => {
    const width = 760;
    const height = 220;
    const padding = { top: 20, right: 16, bottom: 32, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...hoursTrend30d.map((point) => point.value));
    const points = hoursTrend30d.map((point, index) => {
      const x =
        padding.left +
        (hoursTrend30d.length <= 1
          ? 0
          : (index / (hoursTrend30d.length - 1)) * chartWidth);
      const y =
        padding.top + chartHeight - (point.value / maxValue) * chartHeight;
      return { x, y, value: point.value, label: point.label };
    });

    return {
      width,
      height,
      padding,
      chartHeight,
      maxValue,
      points,
      linePath: points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" "),
    };
  }, [hoursTrend30d]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{t("dashboard.operatorPerformance.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.operatorPerformance.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
              <SelectTrigger className="h-9 w-34">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t("dashboard.operatorPerformance.period7d")}</SelectItem>
                <SelectItem value="30d">{t("dashboard.operatorPerformance.period30d")}</SelectItem>
                <SelectItem value="90d">{t("dashboard.operatorPerformance.period90d")}</SelectItem>
                <SelectItem value="all">{t("dashboard.operatorPerformance.periodAll")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={station} onValueChange={setStation}>
              <SelectTrigger className="h-9 w-46">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.operatorPerformance.allStations")}</SelectItem>
                {stationOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedOperator} onValueChange={setOperator}>
              <SelectTrigger className="h-9 w-46">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.operatorPerformance.allOperators")}</SelectItem>
                {operatorOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              {t("dashboard.operatorPerformance.totalHours")}
            </div>
            <div className="text-2xl font-semibold">
              {formatWorkedDuration(Math.round(totals.hours * 60))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              {t("dashboard.operatorPerformance.totalConstructions")}
            </div>
            <div className="text-2xl font-semibold">{totals.constructions}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              {t("dashboard.operatorPerformance.totalOrders")}
            </div>
            <div className="text-2xl font-semibold">{totals.orders}</div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t("dashboard.operatorPerformance.trendTitle")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("dashboard.operatorPerformance.trendSubtitle")}
            </div>
          </div>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
              className="h-[220px] min-w-[760px] w-full"
              role="img"
              aria-label={t("dashboard.operatorPerformance.trendTitle")}
            >
              <line
                x1={chartConfig.padding.left}
                y1={chartConfig.padding.top + chartConfig.chartHeight}
                x2={chartConfig.width - chartConfig.padding.right}
                y2={chartConfig.padding.top + chartConfig.chartHeight}
                stroke="currentColor"
                strokeOpacity="0.2"
              />
              <line
                x1={chartConfig.padding.left}
                y1={chartConfig.padding.top}
                x2={chartConfig.padding.left}
                y2={chartConfig.padding.top + chartConfig.chartHeight}
                stroke="currentColor"
                strokeOpacity="0.2"
              />
              <path
                d={chartConfig.linePath}
                fill="none"
                stroke="var(--color-chart-1)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {chartConfig.points.map((point, index) => (
                <g key={`${point.label}-${index}`}>
                  <circle cx={point.x} cy={point.y} r="3" fill="var(--color-chart-1)" />
                  {(index === 0 ||
                    index === chartConfig.points.length - 1 ||
                    index % 7 === 0) && (
                    <text
                      x={point.x}
                      y={chartConfig.height - 10}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {point.label}
                    </text>
                  )}
                </g>
              ))}
              <text
                x={chartConfig.padding.left - 8}
                y={chartConfig.padding.top + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {Math.round(chartConfig.maxValue * 10) / 10}h
              </text>
              <text
                x={chartConfig.padding.left - 8}
                y={chartConfig.padding.top + chartConfig.chartHeight}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                0h
              </text>
            </svg>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t("dashboard.operatorPerformance.operator")}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t("dashboard.operatorPerformance.stations")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("dashboard.operatorPerformance.hours")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("dashboard.operatorPerformance.constructions")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("dashboard.operatorPerformance.orders")}
                </th>
              </tr>
            </thead>
            <tbody>
              {operatorRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("dashboard.operatorPerformance.empty")}
                  </td>
                </tr>
              ) : (
                operatorRows.map((row) => (
                  <tr key={row.operator} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{row.operator}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.stations.length > 0
                        ? row.stations.join(", ")
                        : t("dashboard.operatorPerformance.notAvailable")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {Math.round(row.hours * 10) / 10}h
                    </td>
                    <td className="px-4 py-2 text-right">{row.constructions}</td>
                    <td className="px-4 py-2 text-right">{row.orders}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
