import type { ProductionPriority } from "@/types/production";
import type {
  BatchRunRow,
  ProductionItemRow,
  ReadyOrderRow,
} from "@/types/production";

export type ReadyBatchGroupLike = {
  key: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  batchCode: string;
  totalQty: number;
  material: string;
  priority: ProductionPriority;
};

export type ReadyProductionKpis = {
  total: number;
  urgent: number;
  high: number;
  dueTodayOrEarlier: number;
};

function normalizeLogicalReadyKey(run: BatchRunRow) {
  const routeKey = run.route_key?.trim();
  if (routeKey && routeKey !== "default") {
    return `${run.order_id}:${routeKey}`;
  }
  return `${run.order_id}:${run.batch_code}`;
}

function fallbackReadyKey(orderId: string, batchCode: string) {
  return `${orderId}:${batchCode || "B1"}`;
}

function batchCodeSortValue(batchCode: string) {
  const match = /^B(\d+)$/i.exec(batchCode.trim());
  if (match?.[1]) {
    return Number(match[1]);
  }
  return 0;
}

export function filterReadyBatchGroups<T extends ReadyBatchGroupLike>(
  groups: T[],
  priority: ProductionPriority | "all",
  search: string,
) {
  const query = search.trim().toLowerCase();
  return groups.filter((group) => {
    if (priority !== "all" && group.priority !== priority) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      group.orderNumber.toLowerCase().includes(query) ||
      group.customerName.toLowerCase().includes(query) ||
      group.batchCode.toLowerCase().includes(query) ||
      group.material.toLowerCase().includes(query)
    );
  });
}

export function computeReadyProductionKpis<T extends ReadyBatchGroupLike>(
  groups: T[],
  todayIso: string,
): ReadyProductionKpis {
  return groups.reduce<ReadyProductionKpis>(
    (acc, group) => {
      acc.total += 1;
      if (group.priority === "urgent") {
        acc.urgent += 1;
      }
      if (group.priority === "high") {
        acc.high += 1;
      }
      if (group.dueDate && group.dueDate <= todayIso) {
        acc.dueTodayOrEarlier += 1;
      }
      return acc;
    },
    {
      total: 0,
      urgent: 0,
      high: 0,
      dueTodayOrEarlier: 0,
    },
  );
}

export function buildReadyBatchGroups(params: {
  productionItems: ProductionItemRow[];
  readyOrders: ReadyOrderRow[];
  batchRuns: BatchRunRow[];
}) {
  const { productionItems, readyOrders, batchRuns } = params;
  const groups = new Map<string, ReadyBatchGroupLike>();
  const readyOrderById = new Map(readyOrders.map((order) => [order.id, order]));
  const releasedOrderIds = new Set(
    batchRuns
      .filter((run) => run.status !== "pending")
      .map((run) => run.order_id),
  );
  const releasedKeys = new Set(
    batchRuns
      .filter((run) => run.status !== "pending")
      .map((run) => normalizeLogicalReadyKey(run)),
  );
  const pendingRunsByKey = new Map<string, BatchRunRow[]>();

  batchRuns
    .filter((run) => run.status === "pending")
    .forEach((run) => {
      const key = normalizeLogicalReadyKey(run);
      const list = pendingRunsByKey.get(key) ?? [];
      list.push(run);
      pendingRunsByKey.set(key, list);
    });

  pendingRunsByKey.forEach((runs, key) => {
    const representativeRun = [...runs].sort(
      (a, b) => batchCodeSortValue(b.batch_code) - batchCodeSortValue(a.batch_code),
    )[0];
    if (
      !representativeRun ||
      groups.has(key) ||
      releasedKeys.has(key) ||
      releasedOrderIds.has(representativeRun.order_id)
    ) {
      return;
    }
    const relatedOrder = readyOrderById.get(representativeRun.order_id);
    groups.set(key, {
      key,
      orderId: representativeRun.order_id,
      orderNumber:
        representativeRun.orders?.order_number ??
        relatedOrder?.order_number ??
        "Order",
      customerName:
        representativeRun.orders?.customer_name ??
        relatedOrder?.customer_name ??
        "Customer",
      dueDate:
        representativeRun.orders?.production_due_date ??
        representativeRun.orders?.due_date ??
        relatedOrder?.production_due_date ??
        relatedOrder?.due_date ??
        "",
      priority:
        representativeRun.orders?.priority ?? relatedOrder?.priority ?? "normal",
      batchCode: representativeRun.batch_code || "B1",
      totalQty: Number(relatedOrder?.quantity ?? 0),
      material: relatedOrder?.product_name ?? "",
    });
  });

  readyOrders.forEach((order) => {
    if (Number(order.quantity ?? 0) !== 1) {
      return;
    }

    const matchingGroups = Array.from(groups.values()).filter(
      (group) => group.orderId === order.id,
    );

    if (matchingGroups.length <= 1) {
      return;
    }

    const preferredGroup = [...matchingGroups].sort(
      (a, b) => batchCodeSortValue(b.batchCode) - batchCodeSortValue(a.batchCode),
    )[0];

    matchingGroups.forEach((group) => {
      if (group.key !== preferredGroup.key) {
        groups.delete(group.key);
      }
    });
  });

  const sourceItems =
    productionItems.length > 0
      ? productionItems.filter(
          (item) => item.status === "queued" && !item.station_id,
        )
      : [];

  sourceItems.forEach((item) => {
    const orderNumber = item.orders?.order_number ?? "Order";
    const customerName = item.orders?.customer_name ?? "Customer";
    const dueDate =
      item.orders?.production_due_date ?? item.orders?.due_date ?? "";
    const priority = item.orders?.priority ?? "normal";
    const batchCode = item.batch_code || "B1";
    const key = fallbackReadyKey(item.order_id, batchCode);
    if (releasedKeys.has(key) || releasedOrderIds.has(item.order_id)) {
      return;
    }
    const existing = groups.get(key);
    const qtyValue = Number(item.qty ?? 0);
    if (!existing) {
      groups.set(key, {
        key,
        orderId: item.order_id,
        orderNumber,
        customerName,
        dueDate,
        priority,
        batchCode,
        totalQty: qtyValue,
        material: item.material ?? "",
      });
    } else {
      existing.totalQty += qtyValue;
    }
  });

  readyOrders.forEach((order) => {
    const batchCode = "B1";
    const key = fallbackReadyKey(order.id, batchCode);
    if (
      groups.has(key) ||
      releasedKeys.has(key) ||
      releasedOrderIds.has(order.id)
    ) {
      return;
    }
    groups.set(key, {
      key,
      orderId: order.id,
      orderNumber: order.order_number ?? "Order",
      customerName: order.customer_name ?? "Customer",
      dueDate: order.production_due_date ?? order.due_date ?? "",
      priority: order.priority ?? "normal",
      batchCode,
      totalQty: order.quantity ?? 0,
      material: order.product_name ?? "",
    });
  });

  readyOrders.forEach((order) => {
    if (Number(order.quantity ?? 0) !== 1) {
      return;
    }

    const matchingGroups = Array.from(groups.values()).filter(
      (group) => group.orderId === order.id,
    );

    if (matchingGroups.length <= 1) {
      return;
    }

    const preferredGroup = [...matchingGroups].sort((a, b) => {
      const qtyDiff = Number(b.totalQty ?? 0) - Number(a.totalQty ?? 0);
      if (qtyDiff !== 0) {
        return qtyDiff;
      }
      return batchCodeSortValue(b.batchCode) - batchCodeSortValue(a.batchCode);
    })[0];

    matchingGroups.forEach((group) => {
      if (group.key !== preferredGroup.key) {
        groups.delete(group.key);
      }
    });
  });

  return Array.from(groups.values());
}
