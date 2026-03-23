"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  ClipboardListIcon,
  Layers3Icon,
  PaperclipIcon,
  TimerResetIcon,
  Users2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { ProductionStatCard } from "@/components/production/ProductionStatCard";
import {
  buildReadyBatchGroups,
  computeReadyProductionKpis,
  filterReadyBatchGroups,
} from "@/lib/domain/productionReady";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import type {
  BatchRunRow,
  OrderAttachmentRow,
  ProductionItemRow,
  ProductionPriority,
  ReadyOrderRow,
} from "@/types/production";

type OrderItemRow = {
  id: string;
  order_id: string;
  item_name: string;
  qty: number | null;
  material: string | null;
  production_notes: string | null;
};

function priorityBadge(priority: ProductionPriority) {
  if (priority === "urgent") return "priority-urgent";
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-normal";
}

function normalizeJoinedOrder(value: unknown): BatchRunRow["orders"] {
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
  };
}

function formatDateInput(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export default function ProductionReadyPage() {
  const { t } = useI18n();
  const supabaseUnavailable = !supabase;
  const todayIso = new Date().toISOString().slice(0, 10);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [readySearch, setReadySearch] = useState("");
  const [readyPriority, setReadyPriority] = useState<
    ProductionPriority | "all"
  >("all");
  const [readyDueFilter, setReadyDueFilter] = useState<
    "all" | "late" | "today" | "week"
  >("all");
  const [readyOrders, setReadyOrders] = useState<ReadyOrderRow[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );
  const [batchRuns, setBatchRuns] = useState<BatchRunRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [orderAttachments, setOrderAttachments] = useState<
    Record<string, OrderAttachmentRow[]>
  >({});

  useEffect(() => {
    if (supabaseUnavailable) {
      return;
    }
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setDataError("");
      const sb = supabase;
      if (!sb) {
        setIsLoading(false);
        return;
      }
      const [
        ordersResult,
        itemsResult,
        runsResult,
        orderItemsResult,
        attachmentsResult,
      ] = await Promise.all([
        sb
          .from("orders")
          .select(
            "id, order_number, customer_name, due_date, production_due_date, priority, quantity, product_name, production_duration_minutes",
          )
          .eq("status", "ready_for_production")
          .order("production_due_date", { ascending: true })
          .order("due_date", { ascending: true }),
        sb
          .from("production_items")
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
        sb
          .from("batch_runs")
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
          .order("created_at", { ascending: false }),
        sb
          .from("order_items")
          .select("id, order_id, item_name, qty, material, production_notes")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        sb
          .from("order_attachments")
          .select("id, order_id, name, url, category, created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (
        ordersResult.error ||
        itemsResult.error ||
        runsResult.error ||
        orderItemsResult.error ||
        attachmentsResult.error
      ) {
        setDataError(t("production.main.errors.loadFailed"));
        setIsLoading(false);
        return;
      }

      const normalizedOrders = (ordersResult.data ?? []) as ReadyOrderRow[];
      const normalizedItems = (itemsResult.data ?? []).map((row) => ({
        ...(row as Omit<ProductionItemRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      }));
      const normalizedRuns = (runsResult.data ?? []).map((row) => ({
        ...(row as Omit<BatchRunRow, "orders">),
        orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
      }));

      const attachmentMap: Record<string, OrderAttachmentRow[]> = {};
      ((attachmentsResult.data ?? []) as OrderAttachmentRow[]).forEach(
        (attachment) => {
          if (!attachmentMap[attachment.order_id]) {
            attachmentMap[attachment.order_id] = [];
          }
          attachmentMap[attachment.order_id].push(attachment);
        },
      );

      const orderItemRows = (orderItemsResult.data ?? []) as OrderItemRow[];

      if (!isMounted) {
        return;
      }

      setReadyOrders(normalizedOrders);
      setProductionItems(normalizedItems);
      setBatchRuns(normalizedRuns);
      setOrderItems(orderItemRows);
      setOrderAttachments(attachmentMap);
      setIsLoading(false);
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [supabaseUnavailable, t]);

  const readyGroups = useMemo(
    () =>
      buildReadyBatchGroups({
        productionItems,
        readyOrders,
        batchRuns,
      }),
    [productionItems, readyOrders, batchRuns],
  );

  const filteredReadyGroups = useMemo(
    () => {
      const baseGroups = filterReadyBatchGroups(
        readyGroups,
        readyPriority,
        readySearch,
      );
      if (readyDueFilter === "all") {
        return baseGroups;
      }
      const weekEnd = new Date(todayIso);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndIso = weekEnd.toISOString().slice(0, 10);

      return baseGroups.filter((group) => {
        if (!group.dueDate) {
          return false;
        }
        if (readyDueFilter === "late") {
          return group.dueDate < todayIso;
        }
        if (readyDueFilter === "today") {
          return group.dueDate === todayIso;
        }
        return group.dueDate >= todayIso && group.dueDate <= weekEndIso;
      });
    },
    [readyDueFilter, readyGroups, readyPriority, readySearch, todayIso],
  );

  const kpis = useMemo(
    () =>
      computeReadyProductionKpis(readyGroups, todayIso),
    [readyGroups, todayIso],
  );

  const orderItemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItemRow[]>();
    orderItems.forEach((item) => {
      const current = map.get(item.order_id) ?? [];
      current.push(item);
      map.set(item.order_id, current);
    });
    return map;
  }, [orderItems]);

  const activeFilterCount =
    (readyPriority !== "all" ? 1 : 0) + (readyDueFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-4">
      <DesktopPageHeader
        sticky
        title={t("production.main.planning.readyForProduction")}
        subtitle={t("production.main.ready.headerSubtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/production/queues">
                <Layers3Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.queues")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/production/operators">
                <Users2Icon className="mr-2 h-4 w-4" />
                {t("production.main.subnav.operators")}
              </Link>
            </Button>
          </div>
        }
      />
      <MobilePageTitle
        title={t("production.main.planning.readyForProduction")}
        subtitle={t("production.main.ready.mobileSubtitle")}
        showCompact={false}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ProductionStatCard
          label={t("production.main.ready.readyJobs")}
          value={kpis.total}
          hint={t("production.main.ready.readyJobsHint")}
          icon={<Layers3Icon className="h-4 w-4" />}
        />
        <ProductionStatCard
          label={t("production.main.ready.urgent")}
          value={kpis.urgent}
          hint={t("production.main.ready.urgentHint")}
          tone="warning"
          icon={<AlertTriangleIcon className="h-4 w-4" />}
        />
        <ProductionStatCard
          label={t("production.main.ready.highPriority")}
          value={kpis.high}
          hint={t("production.main.ready.highPriorityHint")}
          icon={<Layers3Icon className="h-4 w-4" />}
        />
        <ProductionStatCard
          label={t("production.main.ready.dueNow")}
          value={kpis.dueTodayOrEarlier}
          hint={t("production.main.ready.dueNowHint")}
          tone="danger"
          icon={<TimerResetIcon className="h-4 w-4" />}
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-4 pt-4">
          {supabaseUnavailable ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              {t("production.main.errors.supabaseNotConfigured")}
            </div>
          ) : null}

          {dataError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              {dataError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-muted/10 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="min-w-0 flex-1">
                <Input
                  icon="search"
                  value={readySearch}
                  onChange={(event) => setReadySearch(event.target.value)}
                  placeholder={t(
                    "production.main.planning.orderCustomerPlaceholder",
                  )}
                  className="h-10"
                />
              </div>

              <div className="flex items-center gap-2 xl:ml-auto">
                <FiltersDropdown
                  label={
                    activeFilterCount > 0
                      ? `${t("production.main.ready.filters")} (${activeFilterCount})`
                      : t("production.main.ready.filters")
                  }
                  contentClassName="w-[320px] p-4"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">
                        {t("production.main.common.priority")}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["all", t("production.main.common.all")],
                            ["urgent", t("production.main.priority.urgent")],
                            ["high", t("production.main.priority.high")],
                            ["normal", t("production.main.priority.normal")],
                            ["low", t("production.main.priority.low")],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setReadyPriority(
                                value as ProductionPriority | "all",
                              )
                            }
                            className={`inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-xs font-medium transition ${
                              readyPriority === value
                                ? "border-foreground bg-foreground text-background shadow-sm"
                                : "border-border bg-background text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">
                        {t("production.main.ready.dueFilter")}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["all", t("production.main.common.all")],
                            ["late", t("production.main.ready.dueLate")],
                            ["today", t("production.main.ready.dueToday")],
                            ["week", t("production.main.ready.dueWeek")],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setReadyDueFilter(
                                value as "all" | "late" | "today" | "week",
                              )
                            }
                            className={`inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-xs font-medium transition ${
                              readyDueFilter === value
                                ? "border-foreground bg-foreground text-background shadow-sm"
                                : "border-border bg-background text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="text-sm text-muted-foreground">
                        {t("production.main.ready.activeFilters", {
                          count: activeFilterCount,
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReadyPriority("all");
                          setReadyDueFilter("all");
                        }}
                        disabled={activeFilterCount === 0}
                      >
                        {t("production.main.ready.resetFilters")}
                      </Button>
                    </div>
                  </div>
                </FiltersDropdown>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
              {t("production.main.planning.loadingReadyBatches")}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {filteredReadyGroups.map((group) => {
              const items = orderItemsByOrder.get(group.orderId) ?? [];
              const files = orderAttachments[group.orderId] ?? [];
              const hasFiles = files.length > 0;
              const late = Boolean(
                group.dueDate &&
                group.dueDate <= new Date().toISOString().slice(0, 10),
              );
              const note = items.find(
                (item) => item.production_notes,
              )?.production_notes;

              return (
                <div
                  key={group.key}
                  className="rounded-2xl border border-border/80 bg-background p-4 shadow-sm transition hover:border-border hover:bg-muted/20"
                >
                  <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                        <div className="text-lg font-semibold leading-none">
                          {group.orderNumber}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={priorityBadge(group.priority)}>
                            {t(`production.main.priority.${group.priority}`)}
                          </Badge>
                          {late ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive">
                              <AlertTriangleIcon className="h-3 w-3" />
                              {t("production.main.ready.dueTodayBadge")}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-base text-foreground/85">
                          {group.customerName}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            {t("production.main.ready.dueLine", {
                              date: formatDateInput(group.dueDate),
                              batch: group.batchCode,
                              qty: group.totalQty,
                            })}
                          </span>
                          {hasFiles ? (
                            <span className="inline-flex items-center gap-1.5">
                              <PaperclipIcon className="h-3.5 w-3.5" />
                              {t("production.main.ready.filesCount", {
                                count: files.length,
                              })}
                            </span>
                          ) : null}
                        </div>
                        {group.material ? (
                          <div className="text-sm text-muted-foreground">
                            {group.material}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <Tooltip
                        content={t("production.main.ready.openJob")}
                        side="top"
                        interaction="hover"
                      >
                        <Button asChild size="icon">
                          <Link
                            href={`/production/jobs/${group.orderId}`}
                            aria-label={t("production.main.ready.openJob")}
                          >
                            <ClipboardListIcon className="h-4.5 w-4.5" />
                          </Link>
                        </Button>
                      </Tooltip>
                      <Tooltip
                        content={t("production.main.ready.openOrder")}
                        side="top"
                        interaction="hover"
                      >
                        <Button asChild variant="secondary" size="icon">
                          <Link
                            href={`/orders/${group.orderId}`}
                            aria-label={t("production.main.ready.openOrder")}
                          >
                            <ExternalLinkIcon className="h-4.5 w-4.5" />
                          </Link>
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  {note ? (
                    <div className="mt-3 rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                      {note}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!isLoading && filteredReadyGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {t("production.main.planning.noBatchesReady")}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
