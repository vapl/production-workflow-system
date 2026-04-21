"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrders } from "@/app/(app)/orders/OrdersContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { isOrderProductionComplete } from "@/lib/domain/productionCompletion";
import { supabase } from "@/lib/supabaseClient";
import type { Activity } from "@/types/activity";
import type { DashboardBottleneck, DashboardKpis } from "@/types/dashboard";
import type { Order, OrderStatus } from "@/types/orders";
import type { BatchRunRow, ProductionStatusEventRow } from "@/types/production";

type JoinedOrderLike = BatchRunRow["orders"];

function normalizeJoinedOrder(value: unknown): JoinedOrderLike {
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

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function safeDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getEffectiveOrderStatus(
  order: Order,
  batchRuns: BatchRunRow[],
  productionCompletionConfig: Parameters<typeof isOrderProductionComplete>[1],
): OrderStatus {
  const runs = batchRuns.filter((run) => run.order_id === order.id);
  if (runs.length === 0) {
    return order.statusDisplay ?? order.status;
  }
  return isOrderProductionComplete(
    runs.map((run) => ({
      status: run.status,
      stationId: run.station_id,
    })),
    productionCompletionConfig,
  )
    ? "done"
    : "in_production";
}

function getOrderDoneAt(order: Order, batchRuns: BatchRunRow[]): Date | null {
  const latestRunDoneAt = batchRuns
    .filter((run) => run.order_id === order.id && run.status === "done")
    .map((run) => safeDate(run.done_at))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (latestRunDoneAt) {
    return latestRunDoneAt;
  }
  const doneHistory = (order.statusHistory ?? [])
    .filter((entry) => entry.status === "done")
    .map((entry) => safeDate(entry.changedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (doneHistory) {
    return doneHistory;
  }
  if (order.status === "done" || order.statusDisplay === "done") {
    return safeDate(order.statusChangedAt);
  }
  return null;
}

function getOrderStartAt(order: Order, batchRuns: BatchRunRow[]): Date | null {
  const earliestRunStartAt = batchRuns
    .filter((run) => run.order_id === order.id)
    .flatMap((run) => [safeDate(run.started_at), safeDate(run.done_at)])
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (earliestRunStartAt) {
    return earliestRunStartAt;
  }
  const earliestStatusChange = (order.statusHistory ?? [])
    .map((entry) => safeDate(entry.changedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (earliestStatusChange) {
    return earliestStatusChange;
  }
  return safeDate(order.createdAt);
}

function mapActivityStatus(
  toStatus: string | null | undefined,
): Activity["status"] | null {
  if (toStatus === "blocked") {
    return "blocked";
  }
  if (toStatus === "done") {
    return "completed";
  }
  if (toStatus === "in_progress") {
    return "in_progress";
  }
  return null;
}

export interface UseDashboardResult {
  orders: Order[];
  bottlenecks: DashboardBottleneck[];
  kpis: DashboardKpis;
  activities: Activity[];
}

export function useDashboard(): UseDashboardResult {
  const { orders } = useOrders();
  const user = useCurrentUser();
  const { rules } = useWorkflowRules();
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [events, setEvents] = useState<ProductionStatusEventRow[]>([]);
  const [stationNameById, setStationNameById] = useState<Map<string, string>>(
    () => new Map(),
  );

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.tenantId) {
      return;
    }
    let isMounted = true;

    const load = async () => {
      const [runsResult, eventsResult, stationsResult] = await Promise.all([
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name, status)",
          )
          .eq("tenant_id", user.tenantId),
        sb
          .from("production_status_events")
          .select(
            "id, production_item_id, order_id, batch_run_id, from_status, to_status, reason, created_at, actor_user_id",
          )
          .eq("tenant_id", user.tenantId)
          .order("created_at", { ascending: false })
          .limit(200),
        sb
          .from("workstations")
          .select("id, name")
          .eq("tenant_id", user.tenantId)
          .eq("is_active", true),
      ]);

      if (!isMounted) {
        return;
      }

      setBatchRuns(
        ((runsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          ...(row as Omit<BatchRunRow, "orders">),
          orders: normalizeJoinedOrder(row.orders),
        })),
      );
      setEvents((eventsResult.data ?? []) as ProductionStatusEventRow[]);
      setStationNameById(
        new Map(
          ((stationsResult.data ?? []) as Array<{ id: string; name: string }>).map(
            (station) => [station.id, station.name],
          ),
        ),
      );
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [user.tenantId]);

  const effectiveOrders = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        statusDisplay: getEffectiveOrderStatus(
          order,
          batchRuns,
          rules.productionCompletionConfig,
        ),
      })),
    [batchRuns, orders, rules.productionCompletionConfig],
  );

  const todayIso = getTodayIso();

  const bottlenecks = useMemo<DashboardBottleneck[]>(() => {
    return batchRuns
      .filter((run) => {
        if (run.status === "blocked") {
          return true;
        }
        return Boolean(
          run.planned_date &&
            run.planned_date < todayIso &&
            run.status !== "done",
        );
      })
      .map((run) => ({
        id: run.id,
        label: run.batch_code || run.orders?.order_number || run.id,
        orderNumber: run.orders?.order_number ?? run.order_id,
        stationName: run.station_id
          ? (stationNameById.get(run.station_id) ?? run.station_id)
          : "-",
        durationMinutes: Math.max(0, Number(run.duration_minutes ?? 0)),
        plannedDate: run.planned_date ?? null,
        status: run.status === "blocked" ? "blocked" : "late",
      }))
      .sort((a, b) => b.durationMinutes - a.durationMinutes)
      .slice(0, 5);
  }, [batchRuns, stationNameById, todayIso]);

  const kpis = useMemo<DashboardKpis>(() => {
    const activeOrders = effectiveOrders.filter(
      (order) => (order.statusDisplay ?? order.status) !== "done",
    ).length;
    const activeBatches = batchRuns.filter(
      (run) => run.status === "in_progress",
    ).length;
    const completedToday = batchRuns.filter(
      (run) => run.status === "done" && run.done_at?.slice(0, 10) === todayIso,
    ).length;

    const dueSoonDate = new Date();
    dueSoonDate.setDate(dueSoonDate.getDate() + Math.max(0, rules.dueSoonDays));
    const dueSoonIso = dueSoonDate.toISOString().slice(0, 10);
    const eligibleOrders = rules.dueIndicatorEnabled
      ? effectiveOrders.filter((order) =>
          rules.dueIndicatorStatuses.includes(
            (order.statusDisplay ?? order.status) as OrderStatus,
          ),
        )
      : [];
    const dueSoonOrders = eligibleOrders.filter((order) => {
      const dueDate = order.dueDate?.slice(0, 10);
      return (
        Boolean(dueDate) &&
        rules.dueSoonDays > 0 &&
        dueDate! >= todayIso &&
        dueDate! <= dueSoonIso
      );
    }).length;
    const overdueOrders = eligibleOrders.filter((order) => {
      const dueDate = order.dueDate?.slice(0, 10);
      return Boolean(dueDate) && dueDate! < todayIso;
    }).length;

    const completedOrders = effectiveOrders
      .map((order) => {
        const status = order.statusDisplay ?? order.status;
        if (status !== "done") {
          return null;
        }
        const doneAt = getOrderDoneAt(order, batchRuns);
        const dueAt = safeDate(order.dueDate);
        if (!doneAt || !dueAt) {
          return null;
        }
        return { order, doneAt, dueAt };
      })
      .filter(
        (
          value,
        ): value is { order: Order; doneAt: Date; dueAt: Date } => value !== null,
      );

    const onTimeCount = completedOrders.filter(
      ({ doneAt, dueAt }) => doneAt.getTime() <= dueAt.getTime(),
    ).length;
    const onTimeRate =
      completedOrders.length > 0
        ? (onTimeCount / completedOrders.length) * 100
        : null;

    const leadTimeMedianHours = median(
      effectiveOrders
        .map((order) => {
          const startAt = getOrderStartAt(order, batchRuns);
          const doneAt = getOrderDoneAt(order, batchRuns);
          if (!startAt || !doneAt) {
            return null;
          }
          const diffHours = (doneAt.getTime() - startAt.getTime()) / 3_600_000;
          return diffHours >= 0 ? diffHours : null;
        })
        .filter((value): value is number => value !== null),
    );

    const stationDurations = new Map<string, number[]>();
    batchRuns
      .filter((run) => run.status === "done" && run.station_id)
      .forEach((run) => {
        const durationHours = Math.max(0, Number(run.duration_minutes ?? 0)) / 60;
        if (durationHours <= 0) {
          return;
        }
        const stationId = run.station_id as string;
        const list = stationDurations.get(stationId) ?? [];
        list.push(durationHours);
        stationDurations.set(stationId, list);
      });

    let slowestStationName: string | null = null;
    let slowestStationMedianHours: number | null = null;
    let slowestStationSampleSize = 0;

    stationDurations.forEach((durations, stationId) => {
      const stationMedian = median(durations);
      if (stationMedian == null) {
        return;
      }
      if (
        slowestStationMedianHours == null ||
        stationMedian > slowestStationMedianHours
      ) {
        slowestStationMedianHours = stationMedian;
        slowestStationName = stationNameById.get(stationId) ?? stationId;
        slowestStationSampleSize = durations.length;
      }
    });

    return {
      activeOrders,
      activeBatches,
      completedToday,
      lateBatches: bottlenecks.length,
      totalOrders: effectiveOrders.length,
      dueSoonOrders,
      overdueOrders,
      onTimeRate,
      completedOrdersForOnTime: completedOrders.length,
      leadTimeMedianHours,
      slowestStationName,
      slowestStationMedianHours,
      slowestStationSampleSize,
    };
  }, [batchRuns, bottlenecks.length, effectiveOrders, rules, stationNameById, todayIso]);

  const activities = useMemo<Activity[]>(() => {
    return events
      .map((event) => {
        const status = mapActivityStatus(event.to_status);
        if (!status || !event.created_at) {
          return null;
        }
        const relatedRun = event.batch_run_id
          ? batchRuns.find((run) => run.id === event.batch_run_id)
          : null;
        const order = effectiveOrders.find((item) => item.id === event.order_id);
        return {
          id: event.id,
          title:
            status === "completed"
              ? "Batch completed"
              : status === "blocked"
                ? "Batch blocked"
                : "Batch started",
          timestamp: event.created_at,
          status,
          orderNumber:
            relatedRun?.orders?.order_number ?? order?.orderNumber ?? undefined,
          workStation:
            relatedRun?.station_id
              ? (stationNameById.get(relatedRun.station_id) ?? relatedRun.station_id)
              : undefined,
        } satisfies Activity;
      })
      .filter((value): value is Activity => value !== null)
      .slice(0, 5);
  }, [batchRuns, effectiveOrders, events, stationNameById]);

  return {
    orders: effectiveOrders,
    bottlenecks,
    kpis,
    activities,
  };
}
