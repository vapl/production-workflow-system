"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  UserCircle2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { OperatorManagementModal } from "@/components/production/OperatorManagementModal";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  buildOperatorSummaryRows,
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

export default function ProductionOperatorsPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [search, setSearch] = useState("");
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
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

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.tenantId) {
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
          .from("production_status_events")
          .select(
            "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at, actor_user_id",
          )
          .eq("tenant_id", user.tenantId)
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
  }, [reloadNonce, t, user.tenantId]);

  const operatorRows = useMemo(
    () =>
      buildOperatorSummaryRows({
        profiles,
        operatorConfigs,
        assignments,
        stations,
        events,
        batchRuns,
        productionItems,
      }),
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

  const visibleOperatorRows = useMemo(
    () =>
      operatorRows.filter(
        (row) =>
          row.role.trim().toLowerCase() === "operator" ||
          profiles.some(
            (profile) =>
              profile.id === row.userId &&
              ((profile.role?.trim().toLowerCase() === "operator") ||
                profile.auth_mode === "pin"),
          ),
      ),
    [operatorRows, profiles],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return visibleOperatorRows;
    }
    return visibleOperatorRows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        row.role.toLowerCase().includes(query) ||
        row.stations.some((station) => station.toLowerCase().includes(query))
      );
    });
  }, [search, visibleOperatorRows]);

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.workedMinutes += row.workedMinutes;
          acc.completedItems += row.completedItems;
          acc.completedQty += row.completedQty;
          acc.completedOrders += row.completedOrders;
          acc.laborCost += row.laborCost ?? 0;
          return acc;
        },
        {
          workedMinutes: 0,
          completedItems: 0,
          completedQty: 0,
          completedOrders: 0,
          laborCost: 0,
        },
      ),
    [filteredRows],
  );

  return (
    <div className="space-y-4">
      <DesktopPageHeader
        title={
          <span className="flex items-center gap-2 text-xl">
            <Link
              href="/production/ready"
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              {t("production.main.operators.readyBreadcrumb")}
            </Link>
            <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
            <span>{t("production.main.operators.title")}</span>
          </span>
        }
        subtitle={t("production.main.operators.subtitle")}
        titleBlockClassName="md:max-w-none xl:max-w-none"
      />
      <MobilePageTitle
        title={t("production.main.operators.title")}
        subtitle={t("production.main.operators.mobileSubtitle")}
        showCompact={false}
      />

      {dataError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          {dataError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ProductionStatCard
          label={t("production.main.operators.operators")}
          value={filteredRows.length}
          hint={t("production.main.operators.operatorsHint")}
        />
        <ProductionStatCard
          label={t("production.main.operators.workedHours")}
          value={formatWorkedHours(totals.workedMinutes)}
          hint={t("production.main.operators.workedHoursHint")}
        />
        <ProductionStatCard
          label={t("production.main.operators.completedQty")}
          value={totals.completedQty}
          hint={t("production.main.operators.completedQtyHint")}
        />
        <ProductionStatCard
          label={t("production.main.operators.ordersShort")}
          value={totals.completedOrders}
          hint={t("production.main.operators.ordersHint")}
        />
        <ProductionStatCard
          label={t("production.main.operators.laborCost")}
          value={formatLaborCost(totals.laborCost)}
          hint={t("production.main.operators.laborCostHint")}
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{t("production.main.operators.listTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("production.main.operators.listSubtitle")}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsManageModalOpen(true)}
            >
              {t("production.main.operators.manageTitle")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1 text-xs text-muted-foreground">
            {t("production.main.common.search")}
            <Input
              icon="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("production.main.operators.searchPlaceholder")}
              className="h-10"
            />
          </label>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">
              {t("production.main.operators.loading")}
            </div>
          ) : null}

          <div className="space-y-3">
            {filteredRows.map((row) => (
              <div
                key={row.userId}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/20">
                      <UserCircle2Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-base font-semibold">{row.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.role}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full border border-border px-2 py-1">
                      {formatWorkedHours(row.workedMinutes)}h
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      {t("production.main.operators.itemsShort")}{" "}
                      {row.completedItems}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      {t("production.main.common.qty")} {row.completedQty}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      {t("production.main.operators.ordersShort")}{" "}
                      {row.completedOrders}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      {t("production.main.operators.rateShort")}{" "}
                      {row.hourlyRate != null
                        ? formatLaborCost(row.hourlyRate)
                        : "-"}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      {t("production.main.operators.costShort")}{" "}
                      {formatLaborCost(row.laborCost)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {row.stations.length > 0 ? (
                    row.stations.map((station) => (
                      <span
                        key={station}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
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

                <div className="mt-3">
                  <Button asChild variant="secondary">
                    <Link href={`/production/operators/${row.userId}`}>
                      {t("production.main.operators.openProfile")}
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <OperatorManagementModal
        open={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onSaved={() => setReloadNonce((value) => value + 1)}
        profiles={profiles}
        operatorConfigs={operatorConfigs}
        assignments={assignments}
        stations={stations}
        t={t}
      />
    </div>
  );
}
