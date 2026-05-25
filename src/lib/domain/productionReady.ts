import type { ProductionPriority } from "@/types/production";
import type {
  BatchRunRow,
  ProductionItemRow,
  ReadyOrderRow,
} from "@/types/production";

type ReadyOrderItemLike = {
  order_id: string;
  qty?: number | null;
};

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

function batchCodeSortValue(batchCode: string) {
  const match = /^B(\d+)$/i.exec(batchCode.trim());
  if (match?.[1]) {
    return Number(match[1]);
  }
  return 0;
}

function formatBatchCodes(batchCodes: Iterable<string>) {
  const sortedCodes = Array.from(
    new Set(Array.from(batchCodes).map((code) => code || "B1")),
  ).sort((a, b) => batchCodeSortValue(a) - batchCodeSortValue(b));
  if (sortedCodes.length === 0) {
    return "B1";
  }
  if (sortedCodes.length === 1) {
    return sortedCodes[0];
  }
  return `${sortedCodes[0]}-${sortedCodes[sortedCodes.length - 1]}`;
}

function getPositiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  orderItems?: ReadyOrderItemLike[];
}) {
  const { productionItems, readyOrders, batchRuns, orderItems = [] } = params;
  const groups = new Map<string, ReadyBatchGroupLike>();
  const readyOrderById = new Map(readyOrders.map((order) => [order.id, order]));
  const orderItemQtyByOrderId = new Map<string, number>();
  orderItems.forEach((item) => {
    const current = orderItemQtyByOrderId.get(item.order_id) ?? 0;
    orderItemQtyByOrderId.set(
      item.order_id,
      current + getPositiveNumber(item.qty),
    );
  });
  const productionItemQtyByOrderId = new Map<string, number>();
  productionItems.forEach((item) => {
    if (item.station_id) {
      return;
    }
    const current = productionItemQtyByOrderId.get(item.order_id) ?? 0;
    productionItemQtyByOrderId.set(
      item.order_id,
      current + getPositiveNumber(item.qty),
    );
  });
  const getReadyOrderQty = (
    orderId: string,
    order: ReadyOrderRow | undefined,
  ) => {
    const orderQty = getPositiveNumber(order?.quantity);
    if (orderQty > 0) {
      return orderQty;
    }
    const orderItemQty = getPositiveNumber(orderItemQtyByOrderId.get(orderId));
    if (orderItemQty > 0) {
      return orderItemQty;
    }
    const productionItemQty = getPositiveNumber(
      productionItemQtyByOrderId.get(orderId),
    );
    if (productionItemQty > 0) {
      return productionItemQty;
    }
    return 1;
  };
  const releasedOrderIds = new Set(
    batchRuns
      .filter((run) => run.status !== "pending")
      .map((run) => run.order_id),
  );
  const pendingRunsByOrderId = new Map<string, BatchRunRow[]>();

  batchRuns
    .filter((run) => run.status === "pending")
    .forEach((run) => {
      const list = pendingRunsByOrderId.get(run.order_id) ?? [];
      list.push(run);
      pendingRunsByOrderId.set(run.order_id, list);
    });

  pendingRunsByOrderId.forEach((runs, orderId) => {
    const representativeRun = [...runs].sort(
      (a, b) => batchCodeSortValue(b.batch_code) - batchCodeSortValue(a.batch_code),
    )[0];
    if (!representativeRun || groups.has(orderId) || releasedOrderIds.has(orderId)) {
      return;
    }
    const relatedOrder = readyOrderById.get(orderId);
    groups.set(orderId, {
      key: orderId,
      orderId,
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
      batchCode: formatBatchCodes(runs.map((run) => run.batch_code)),
      totalQty: getReadyOrderQty(orderId, relatedOrder),
      material: relatedOrder?.product_name ?? "",
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
    const key = item.order_id;
    if (releasedOrderIds.has(item.order_id)) {
      return;
    }
    const existing = groups.get(key);
    const qtyValue = getPositiveNumber(item.qty);
    if (!existing) {
      groups.set(key, {
        key,
        orderId: item.order_id,
        orderNumber,
        customerName,
        dueDate,
        priority,
        batchCode: formatBatchCodes([item.batch_code]),
        totalQty: qtyValue,
        material: item.material ?? "",
      });
    } else {
      existing.totalQty += qtyValue;
      existing.batchCode = formatBatchCodes([
        ...existing.batchCode.split("-"),
        item.batch_code,
      ]);
    }
  });

  readyOrders.forEach((order) => {
    const key = order.id;
    const existing = groups.get(key);
    if (existing) {
      const qty = getReadyOrderQty(order.id, order);
      if (qty > 0 && getPositiveNumber(existing.totalQty) === 0) {
        existing.totalQty = qty;
      }
      if (!existing.material && order.product_name) {
        existing.material = order.product_name;
      }
      return;
    }
    if (releasedOrderIds.has(order.id)) {
      return;
    }
    const pendingRuns = pendingRunsByOrderId.get(order.id) ?? [];
    groups.set(key, {
      key,
      orderId: order.id,
      orderNumber: order.order_number ?? "Order",
      customerName: order.customer_name ?? "Customer",
      dueDate: order.production_due_date ?? order.due_date ?? "",
      priority: order.priority ?? "normal",
      batchCode: formatBatchCodes(pendingRuns.map((run) => run.batch_code)),
      totalQty: getReadyOrderQty(order.id, order),
      material: order.product_name ?? "",
    });
  });

  return Array.from(groups.values());
}
