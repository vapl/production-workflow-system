"use client";

import { useEffect, useMemo, useState } from "react";
import type { Batch } from "@/types/batch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { useI18n } from "@/lib/i18n/useI18n";

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

function toDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function OperatorPerformancePanel({ batches }: { batches: Batch[] }) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [station, setStation] = useState("all");
  const [operator, setOperator] = useState("all");

  const stationOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        batches
          .map((batch) => batch.workstation?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return values;
  }, [batches]);

  const operatorOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        batches
          .filter((batch) => batch.status === "completed")
          .filter((batch) => station === "all" || batch.workstation === station)
          .map(
            (batch) =>
              batch.operator?.trim() ||
              t("dashboard.operatorPerformance.unassigned"),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return values;
  }, [batches, station, t]);

  useEffect(() => {
    if (operator === "all") {
      return;
    }
    if (!operatorOptions.includes(operator)) {
      setOperator("all");
    }
  }, [operator, operatorOptions]);

  const completedFilteredBatches = useMemo(() => {
    const now = new Date();
    const periodStart =
      period === "all"
        ? null
        : new Date(now.getTime() - periodDaysMap[period] * 24 * 60 * 60 * 1000);

    return batches.filter((batch) => {
      if (batch.status !== "completed") {
        return false;
      }
      if (station !== "all" && batch.workstation !== station) {
        return false;
      }
      const batchOperator =
        batch.operator?.trim() || t("dashboard.operatorPerformance.unassigned");
      if (operator !== "all" && batchOperator !== operator) {
        return false;
      }
      if (!periodStart) {
        return true;
      }
      const completedAt = toDate(batch.completedAt);
      if (!completedAt) {
        return false;
      }
      return completedAt >= periodStart;
    });
  }, [batches, operator, period, station, t]);

  const hoursTrend30d = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (29 - index),
      );
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.toLocaleDateString(undefined, {
          day: "2-digit",
          month: "2-digit",
        }),
        value: 0,
      };
    });
    const byDay = new Map(days.map((day) => [day.key, 0]));

    batches
      .filter((batch) => batch.status === "completed")
      .filter((batch) => station === "all" || batch.workstation === station)
      .filter((batch) => {
        const batchOperator =
          batch.operator?.trim() || t("dashboard.operatorPerformance.unassigned");
        return operator === "all" || batchOperator === operator;
      })
      .forEach((batch) => {
        const completedAt = toDate(batch.completedAt);
        if (!completedAt) {
          return;
        }
        const dayKey = completedAt.toISOString().slice(0, 10);
        if (!byDay.has(dayKey)) {
          return;
        }
        const durationHours =
          typeof batch.actualHours === "number" && batch.actualHours > 0
            ? batch.actualHours
            : batch.estimatedHours;
        if (!Number.isFinite(durationHours) || durationHours <= 0) {
          return;
        }
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + durationHours);
      });

    return days.map((day) => ({
      ...day,
      value: Math.round((byDay.get(day.key) ?? 0) * 10) / 10,
    }));
  }, [batches, operator, station, t]);

  const chartConfig = useMemo(() => {
    const width = 760;
    const height = 220;
    const padding = { top: 20, right: 16, bottom: 32, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(
      1,
      ...hoursTrend30d.map((point) => point.value),
    );

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

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return {
      width,
      height,
      padding,
      chartHeight,
      maxValue,
      points,
      linePath,
    };
  }, [hoursTrend30d]);

  const operatorRows = useMemo<OperatorRow[]>(() => {
    const map = new Map<
      string,
      {
        hours: number;
        constructions: number;
        orderIds: Set<string>;
        stations: Set<string>;
      }
    >();

    completedFilteredBatches.forEach((batch) => {
      const operator = batch.operator?.trim() || t("dashboard.operatorPerformance.unassigned");
      const entry = map.get(operator) ?? {
        hours: 0,
        constructions: 0,
        orderIds: new Set<string>(),
        stations: new Set<string>(),
      };
      const durationHours =
        typeof batch.actualHours === "number" && batch.actualHours > 0
          ? batch.actualHours
          : batch.estimatedHours;
      if (Number.isFinite(durationHours) && durationHours > 0) {
        entry.hours += durationHours;
      }
      entry.constructions += 1;
      entry.orderIds.add(batch.orderId);
      if (batch.workstation) {
        entry.stations.add(batch.workstation);
      }
      map.set(operator, entry);
    });

    return Array.from(map.entries())
      .map(([operator, entry]) => ({
        operator,
        hours: entry.hours,
        constructions: entry.constructions,
        orders: entry.orderIds.size,
        stations: Array.from(entry.stations).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [completedFilteredBatches, t]);

  const totals = useMemo(() => {
    const hours = operatorRows.reduce((sum, row) => sum + row.hours, 0);
    const constructions = operatorRows.reduce(
      (sum, row) => sum + row.constructions,
      0,
    );
    const orders = new Set(
      completedFilteredBatches.map((batch) => batch.orderId).filter(Boolean),
    ).size;
    return { hours, constructions, orders };
  }, [completedFilteredBatches, operatorRows]);

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
            <Select
              value={period}
              onValueChange={(value) => setPeriod(value as PeriodKey)}
            >
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
            <Select value={operator} onValueChange={setOperator}>
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
              {Math.round(totals.hours * 10) / 10}h
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
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    fill="var(--color-chart-1)"
                  />
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
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
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
