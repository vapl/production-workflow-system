"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import { useCurrentUser } from "@/contexts/UserContext";
import { formatProductionDate } from "@/lib/domain/productionJobDetail";
import {
  buildOperatorOrderBreakdown,
  buildOperatorStationBreakdown,
  buildOperatorSummaryRows,
  buildOperatorUnitBreakdown,
  formatLaborCost,
  formatWorkedHours,
  type OperatorAssignmentRow,
  type OperatorConfigRow,
  type OperatorProfileRow,
  type OperatorStationRow,
} from "@/lib/domain/productionOperators";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import type {
  BatchRunRow,
  JoinedProductionOrder,
  ProductionItemRow,
  ProductionStatusEventRow,
} from "@/types/production";

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

export default function ProductionOperatorDetailPage() {
  const { t } = useI18n();
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
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [hourlyRateInput, setHourlyRateInput] = useState<string | null>(null);
  const [overtimeRateInput, setOvertimeRateInput] = useState<string | null>(
    null,
  );
  const [isSavingRates, setIsSavingRates] = useState(false);

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
        eventsResult,
        batchRunsResult,
        itemsResult,
      ] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name, role, login_code, auth_mode, is_active")
          .eq("tenant_id", user.tenantId)
          .eq("id", operatorId),
        sb
          .from("operators")
          .select("id, user_id, name, role, hourly_rate, overtime_rate, is_active")
          .eq("tenant_id", user.tenantId)
          .order("updated_at", { ascending: false }),
        sb
          .from("operator_station_assignments")
          .select("user_id, station_id, is_active")
          .eq("tenant_id", user.tenantId)
          .eq("user_id", operatorId),
        sb
          .from("workstations")
          .select("id, name")
          .eq("tenant_id", user.tenantId)
          .eq("is_active", true),
        sb
          .from("production_status_events")
          .select(
            "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at, actor_user_id",
          )
          .eq("tenant_id", user.tenantId)
          .eq("actor_user_id", operatorId)
          .order("created_at", { ascending: false })
          .limit(1000),
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

      if (
        profilesResult.error ||
        configsResult.error ||
        assignmentsResult.error ||
        stationsResult.error ||
        eventsResult.error ||
        batchRunsResult.error ||
        itemsResult.error
      ) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      setProfiles((profilesResult.data ?? []) as OperatorProfileRow[]);
      setOperatorConfigs((configsResult.data ?? []) as OperatorConfigRow[]);
      setAssignments((assignmentsResult.data ?? []) as OperatorAssignmentRow[]);
      setStations((stationsResult.data ?? []) as OperatorStationRow[]);
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
        ((itemsResult.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            ...(row as Omit<ProductionItemRow, "orders">),
            orders: normalizeJoinedOrder(row.orders),
          }),
        ),
      );
      setIsLoading(false);
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [operatorId, t, user.tenantId]);

  const summary = useMemo(
    () =>
      buildOperatorSummaryRows({
        profiles,
        operatorConfigs,
        assignments,
        stations,
        events,
        batchRuns,
        productionItems,
      })[0] ?? null,
    [
      profiles,
      operatorConfigs,
      assignments,
      stations,
      events,
      batchRuns,
      productionItems,
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

  const displayedHourlyRate =
    hourlyRateInput ??
    (activeConfig?.hourly_rate != null ? String(activeConfig.hourly_rate) : "");
  const displayedOvertimeRate =
    overtimeRateInput ??
    (activeConfig?.overtime_rate != null
      ? String(activeConfig.overtime_rate)
      : "");

  const orderBreakdown = useMemo(
    () =>
      buildOperatorOrderBreakdown({
        actorUserId: operatorId,
        events,
        batchRuns,
        productionItems,
      }),
    [operatorId, events, batchRuns, productionItems],
  );

  const unitBreakdown = useMemo(
    () =>
      buildOperatorUnitBreakdown({
        actorUserId: operatorId,
        events,
        productionItems,
      }),
    [operatorId, events, productionItems],
  );

  const stationBreakdown = useMemo(
    () =>
      buildOperatorStationBreakdown({
        actorUserId: operatorId,
        events,
        productionItems,
        stations,
        batchRuns,
      }),
    [operatorId, events, productionItems, stations, batchRuns],
  );

  const handleSaveRates = async () => {
    if (!supabase || !user.tenantId || !summary) {
      return;
    }
    const parseValue = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const hourlyRate = parseValue(displayedHourlyRate);
    const overtimeRate = parseValue(displayedOvertimeRate);
    setIsSavingRates(true);
    const payload = {
      tenant_id: user.tenantId,
      user_id: operatorId,
      name: summary.name,
      role: summary.role,
      hourly_rate: hourlyRate,
      overtime_rate: overtimeRate,
      is_active: true,
    };
    const query = activeConfig
      ? supabase
          .from("operators")
          .update(payload)
          .eq("id", activeConfig.id)
          .select("id, name, role, hourly_rate, overtime_rate")
          .single()
      : supabase
          .from("operators")
          .insert(payload)
          .select("id, name, role, hourly_rate, overtime_rate")
          .single();
    const { data, error } = await query;
    setIsSavingRates(false);
    if (error) {
      setDataError(error.message || t("production.main.errors.loadFailed"));
      return;
    }
    setOperatorConfigs((prev) => {
      if (!data) {
        return prev;
      }
      if (activeConfig) {
        return prev.map((config) =>
          config.id === activeConfig.id
            ? { ...config, ...(data as OperatorConfigRow) }
            : config,
        );
      }
      return [...prev, data as OperatorConfigRow];
    });
    setHourlyRateInput(hourlyRate != null ? String(hourlyRate) : "");
    setOvertimeRateInput(overtimeRate != null ? String(overtimeRate) : "");
  };

  return (
    <div className="space-y-4">
      <DesktopPageHeader
        title={
          <span className="flex items-center gap-2 text-xl">
            <Link
              href="/production/operators"
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              {t("production.main.operatorDetail.operatorsBreadcrumb")}
            </Link>
            <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
            <span>{summary?.name ?? t("production.main.operators.title")}</span>
          </span>
        }
        subtitle={summary?.role ?? t("production.main.operatorDetail.subtitle")}
        titleBlockClassName="md:max-w-none xl:max-w-none"
      />
      <MobilePageTitle
        title={summary?.name ?? t("production.main.operators.title")}
        subtitle={t("production.main.operatorDetail.mobileSubtitle")}
        showCompact={false}
      />

      {dataError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ProductionStatCard
          label={t("production.main.operators.workedHours")}
          value={formatWorkedHours(summary?.workedMinutes ?? 0)}
        />
        <ProductionStatCard
          label={t("production.main.operators.completedQty")}
          value={summary?.completedQty ?? 0}
        />
        <ProductionStatCard
          label={t("production.main.operators.ordersShort")}
          value={summary?.completedOrders ?? 0}
        />
        <ProductionStatCard
          label={t("production.main.operators.laborCost")}
          value={formatLaborCost(summary?.laborCost)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.profile")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {isLoading ? (
                <div className="text-muted-foreground">
                  {t("production.main.operators.loading")}
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="text-lg font-semibold">
                  {summary?.name ?? "-"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {summary?.role ?? "-"}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {t("production.main.operatorDetail.stations")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(summary?.stations.length ?? 0) > 0 ? (
                    summary?.stations.map((station) => (
                      <span
                        key={station}
                        className="rounded-full border border-border px-2.5 py-1 text-sm"
                      >
                        {station}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("production.main.operators.noStations")}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.payRates")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1 text-xs text-muted-foreground">
                {t("production.main.operatorDetail.hourlyRate")}
                <Input
                  value={displayedHourlyRate}
                  onChange={(event) => setHourlyRateInput(event.target.value)}
                  placeholder="25.00"
                />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                {t("production.main.operatorDetail.overtimeRate")}
                <Input
                  value={displayedOvertimeRate}
                  onChange={(event) => setOvertimeRateInput(event.target.value)}
                  placeholder="37.50"
                />
              </label>
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {t("production.main.operatorDetail.currentLaborCost")}
                </span>
                <span className="font-medium text-foreground">
                  {formatLaborCost(summary?.laborCost)}
                </span>
              </div>
              <Button onClick={handleSaveRates} disabled={isSavingRates}>
                {t("production.main.operatorDetail.saveRates")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.byStations")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stationBreakdown.map((row) => (
                <div
                  key={row.stationId}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="font-medium">{row.stationName}</div>
                  <div className="mt-1 text-muted-foreground">
                    {formatWorkedHours(row.workedMinutes)}h |{" "}
                    {t("production.main.operators.itemsShort")}{" "}
                    {row.completedItems}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.byOrders")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orderBreakdown.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noCompletedRecords")}
                </div>
              ) : null}
              {orderBreakdown.map((row) => (
                <div
                  key={row.orderId}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="font-medium">
                    {row.orderNumber}
                    {row.customerName ? ` - ${row.customerName}` : ""}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {formatWorkedHours(row.workedMinutes)}h |{" "}
                    {t("production.main.operators.itemsShort")}{" "}
                    {row.completedItems}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>
                {t("production.main.operatorDetail.byUnits")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unitBreakdown.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("production.main.operatorDetail.noCompletedUnits")}
                </div>
              ) : null}
              {unitBreakdown.map((row) => (
                <div
                  key={row.productionItemId}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="font-medium">
                    {row.orderNumber}
                    {row.customerName ? ` - ${row.customerName}` : ""}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {t("production.main.common.batch")} {row.batchCode} |{" "}
                    {t("production.main.common.qty")} {row.qty}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {formatWorkedHours(row.workedMinutes)}h |{" "}
                    {t("production.main.operatorDetail.done")}{" "}
                    {formatProductionDate(row.doneAt)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
