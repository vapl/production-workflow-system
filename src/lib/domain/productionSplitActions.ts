import { supabase } from "@/lib/supabaseClient";
import type { BatchRunRow, ProductionItemRow, ProductionStation } from "@/types/production";
import type { ProductionSplitRow } from "@/lib/domain/buildProductionSplitRows";

type SupabaseClientLike = Exclude<typeof supabase, null>;

export type ProductionSplitMode = "release" | "replan";

export type ApplyProductionSplitPlanParams = {
  supabase: SupabaseClientLike;
  mode: ProductionSplitMode;
  rows: ProductionSplitRow[];
  selections: Record<string, string[]>;
  plannedDates: Record<string, string>;
  fallbackPlannedDate: string;
  stations: Pick<ProductionStation, "id">[];
  batchRuns: BatchRunRow[];
  productionItems: ProductionItemRow[];
};

export type ApplyProductionSplitPlanResult = {
  insertedItems: ProductionItemRow[];
  insertedRuns: BatchRunRow[];
  removedItemIds: Set<string>;
  removedRunIds: Set<string>;
  affectedOrderIds: string[];
  processedRowIds: Set<string>;
};

type JoinedOrderValue = BatchRunRow["orders"];

function normalizeJoinedOrder(value: unknown): JoinedOrderValue {
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

export function rowKeyForProductionItem(item: ProductionItemRow) {
  if (!item.meta || typeof item.meta !== "object") {
    return item.id;
  }
  const raw = (item.meta as Record<string, unknown>).rowKey;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : item.id;
}

export async function applyProductionSplitPlan(
  params: ApplyProductionSplitPlanParams,
): Promise<ApplyProductionSplitPlanResult> {
  const {
    supabase: sb,
    mode,
    rows,
    selections,
    plannedDates,
    fallbackPlannedDate,
    stations,
    batchRuns,
    productionItems,
  } = params;

  const selectedRows = rows.filter((row) => (selections[row.id] ?? []).length > 0);
  if (selectedRows.length === 0) {
    throw new Error("No constructions selected.");
  }

  const effectiveDatesByRow = new Map<string, string>();
  selectedRows.forEach((row) => {
    const date = plannedDates[row.id] ?? fallbackPlannedDate;
    if (!date) {
      throw new Error("Planned date is required.");
    }
    effectiveDatesByRow.set(row.id, date);
  });

  const usedCodesByOrder = new Map<string, Set<string>>();
  const registerCode = (orderId: string, code: string) => {
    if (!usedCodesByOrder.has(orderId)) {
      usedCodesByOrder.set(orderId, new Set());
    }
    usedCodesByOrder.get(orderId)?.add(code);
  };

  batchRuns.forEach((run) => registerCode(run.order_id, run.batch_code));
  productionItems.forEach((item) =>
    registerCode(item.order_id, item.batch_code || "B1"),
  );

  const nextBatchCode = (orderId: string, preferred?: string) => {
    const used = usedCodesByOrder.get(orderId) ?? new Set<string>();
    if (!usedCodesByOrder.has(orderId)) {
      usedCodesByOrder.set(orderId, used);
    }
    if (preferred && !used.has(preferred)) {
      used.add(preferred);
      return preferred;
    }
    let max = 0;
    used.forEach((code) => {
      const match = /^B(\d+)$/i.exec(code.trim());
      if (match?.[1]) {
        max = Math.max(max, Number(match[1]));
      }
    });
    const generated = `B${Math.max(1, max + 1)}`;
    used.add(generated);
    return generated;
  };

  const batchCodeByOrderDate = new Map<string, string>();
  const selectedRowsByOrder = new Map<string, ProductionSplitRow[]>();

  selectedRows.forEach((row) => {
    if (!selectedRowsByOrder.has(row.orderId)) {
      selectedRowsByOrder.set(row.orderId, []);
    }
    selectedRowsByOrder.get(row.orderId)?.push(row);
  });

  selectedRowsByOrder.forEach((orderRows, orderId) => {
    const uniqueDates = Array.from(
      new Set(
        orderRows.map((row) => effectiveDatesByRow.get(row.id) ?? fallbackPlannedDate),
      ),
    ).sort();
    orderRows.sort((a, b) => a.id.localeCompare(b.id));

    uniqueDates.forEach((date, index) => {
      const firstRow = orderRows.find(
        (row) => (effectiveDatesByRow.get(row.id) ?? fallbackPlannedDate) === date,
      );
      const preferred = mode === "release" && index === 0 ? firstRow?.batchCode : undefined;
      batchCodeByOrderDate.set(
        `${orderId}:${date}`,
        nextBatchCode(orderId, preferred),
      );
    });
  });

  const productionRows = selectedRows.flatMap((row) =>
    (selections[row.id] ?? []).map((stationId) => {
      const rowDate = effectiveDatesByRow.get(row.id) ?? fallbackPlannedDate;
      return {
        order_id: row.orderId,
        batch_code:
          batchCodeByOrderDate.get(`${row.orderId}:${rowDate}`) ?? row.batchCode,
        item_name: row.itemName,
        qty: row.qty,
        material: row.material || null,
        priority: row.priority,
        status: "queued",
        station_id: stationId,
        meta: {
          fieldId: row.fieldId,
          fieldLabel: row.fieldLabel,
          rowIndex: row.rowIndex,
          sourceRowId: row.sourceRowId ?? null,
          rowKey: row.id,
          plannedDate: rowDate,
          row: row.rawRow,
        },
      };
    }),
  );

  const insertedItemsResult =
    productionRows.length > 0
      ? await sb
          .from("production_items")
          .insert(productionRows)
          .select(
            "id, order_id, batch_code, item_name, qty, material, status, station_id, meta, duration_minutes, created_at, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
      : { data: [], error: null };

  if (insertedItemsResult.error) {
    throw new Error(
      insertedItemsResult.error.message ?? "Failed to create production items.",
    );
  }

  const runsToInsert = Array.from(
    selectedRows.reduce((map, row) => {
      const rowDate = effectiveDatesByRow.get(row.id) ?? fallbackPlannedDate;
      const batchCode =
        batchCodeByOrderDate.get(`${row.orderId}:${rowDate}`) ?? row.batchCode;
      (selections[row.id] ?? []).forEach((stationId) => {
        map.set(`${row.orderId}:${batchCode}:${stationId}:${rowDate}`, {
          order_id: row.orderId,
          batch_code: batchCode,
          station_id: stationId,
          route_key: "default",
          step_index: Math.max(
            stations.findIndex((station) => station.id === stationId),
            0,
          ),
          status: "queued",
          planned_date: rowDate,
        });
      });
      return map;
    }, new Map<string, Record<string, unknown>>()).values(),
  );

  const insertedRunsResult =
    runsToInsert.length > 0
      ? await sb
          .from("batch_runs")
          .insert(runsToInsert)
          .select(
            "id, order_id, batch_code, station_id, route_key, step_index, status, blocked_reason, blocked_reason_id, planned_date, started_at, done_at, duration_minutes, orders (order_number, due_date, production_due_date, priority, customer_name)",
          )
      : { data: [], error: null };

  if (insertedRunsResult.error) {
    throw new Error(
      insertedRunsResult.error.message ?? "Failed to create batch runs.",
    );
  }

  const affectedOrderIds = Array.from(new Set(selectedRows.map((row) => row.orderId)));

  await sb.from("orders").update({ status: "in_production" }).in("id", affectedOrderIds);

  let removedItemIds = new Set<string>();
  let removedRunIds = new Set<string>();
  const processedRowIds = new Set(selectedRows.map((row) => row.id));

  if (mode === "replan") {
    const sourceGroups = new Map<string, Set<string>>();
    selectedRows.forEach((row) => {
      sourceGroups.set(`${row.orderId}:${row.batchCode}`, processedRowIds);
    });

    for (const [sourceKey, sourceRowKeys] of sourceGroups.entries()) {
      const [sourceOrderId, sourceBatchCode] = sourceKey.split(":");
      const sourceItems = productionItems.filter(
        (item) =>
          item.order_id === sourceOrderId &&
          item.batch_code === sourceBatchCode &&
          sourceRowKeys.has(rowKeyForProductionItem(item)),
      );

      if (sourceItems.length === 0) {
        continue;
      }

      const sourceItemIds = sourceItems.map((item) => item.id);
      const removeItemsResult = await sb
        .from("production_items")
        .delete()
        .in("id", sourceItemIds);

      if (removeItemsResult.error) {
        throw new Error(
          removeItemsResult.error.message ?? "Failed to remove old construction rows.",
        );
      }

      removedItemIds = new Set([...removedItemIds, ...sourceItemIds]);

      const affectedStationIds = new Set(
        sourceItems
          .map((item) => item.station_id)
          .filter((id): id is string => Boolean(id)),
      );
      const remainingSourceItems = productionItems.filter(
        (item) =>
          item.order_id === sourceOrderId &&
          item.batch_code === sourceBatchCode &&
          !sourceRowKeys.has(rowKeyForProductionItem(item)),
      );
      const stationIdsWithRemaining = new Set(
        remainingSourceItems
          .map((item) => item.station_id)
          .filter((id): id is string => Boolean(id)),
      );
      const sourceRunIdsToDelete = batchRuns
        .filter(
          (run) =>
            run.order_id === sourceOrderId &&
            run.batch_code === sourceBatchCode &&
            Boolean(run.station_id) &&
            affectedStationIds.has(run.station_id as string) &&
            !stationIdsWithRemaining.has(run.station_id as string) &&
            (run.status === "queued" ||
              run.status === "pending" ||
              run.status === "blocked"),
        )
        .map((run) => run.id);

      if (sourceRunIdsToDelete.length > 0) {
        const removeRunsResult = await sb
          .from("batch_runs")
          .delete()
          .in("id", sourceRunIdsToDelete);

        if (removeRunsResult.error) {
          throw new Error(
            removeRunsResult.error.message ?? "Failed to cleanup empty runs.",
          );
        }

        removedRunIds = new Set([...removedRunIds, ...sourceRunIdsToDelete]);
      }
    }
  }

  const insertedItems = ((insertedItemsResult.data ?? []) as ProductionItemRow[]).map(
    (row) => ({
      ...(row as Omit<ProductionItemRow, "orders">),
      orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
    }),
  );

  const insertedRuns = ((insertedRunsResult.data ?? []) as BatchRunRow[]).map((row) => ({
    ...(row as Omit<BatchRunRow, "orders">),
    orders: normalizeJoinedOrder((row as { orders?: unknown }).orders),
  }));

  return {
    insertedItems,
    insertedRuns,
    removedItemIds,
    removedRunIds,
    affectedOrderIds,
    processedRowIds,
  };
}
