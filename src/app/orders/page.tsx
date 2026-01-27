"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OrdersTable } from "./components/OrdersTable";
import { OrdersToolbar } from "./components/OrdersToolbar";
import type { Order, OrderStatus } from "@/types/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "lucide-react";
import { OrderModal } from "./components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";

export default function OrdersPage() {
  const { orders, addOrder, updateOrder, removeOrder } = useOrders();
  const { nodes, levels, addNode } = useHierarchy();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [archivedExternalIds, setArchivedExternalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupByContract, setGroupByContract] = useState(true);
  const [horizonOrders, setHorizonOrders] = useState<Order[]>([]);
  const horizonLoadedRef = useRef(false);

  useEffect(() => {
    if (horizonLoadedRef.current) {
      return;
    }
    horizonLoadedRef.current = true;

    const contractLevel = levels.find((level) => level.key === "contract");
    const categoryLevel = levels.find((level) => level.key === "category");
    const productLevel = levels.find((level) => level.key === "product");

    const nodeLookup = new Map<string, string>();
    nodes.forEach((node) => {
      const key = `${node.levelId}|${node.parentId ?? ""}|${node.label.toLowerCase()}`;
      nodeLookup.set(key, node.id);
    });

    const ensureNode = (
      label: string,
      levelId: string | undefined,
      parentId?: string | null,
    ) => {
      const trimmedLabel = label.trim();
      if (!levelId || trimmedLabel.length === 0) {
        return undefined;
      }
      const key = `${levelId}|${parentId ?? ""}|${trimmedLabel.toLowerCase()}`;
      const existingId = nodeLookup.get(key);
      if (existingId) {
        return existingId;
      }
      const newId = crypto.randomUUID();
      void addNode({
        id: newId,
        levelId,
        label: trimmedLabel,
        parentId: parentId ?? null,
      });
      nodeLookup.set(key, newId);
      return newId;
    };

    async function loadHorizonOrders() {
      try {
        const response = await fetch("/api/horizon/orders");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const baseDate = new Date();
        baseDate.setHours(0, 0, 0, 0);
        const mappedOrders: Order[] = (data.orders ?? []).map(
          (
            item: {
              id: string;
              contractNo?: string;
              customer: string;
              category?: string;
              product?: string;
              quantity?: number;
            },
            index: number,
          ) => {
            const contractId = item.contractNo
              ? ensureNode(item.contractNo, contractLevel?.id, null)
              : undefined;
            const categoryId =
              item.category && categoryLevel?.id
                ? ensureNode(item.category, categoryLevel.id, contractId ?? null)
                : undefined;
            const productId =
              item.product && productLevel?.id
                ? ensureNode(item.product, productLevel.id, categoryId ?? null)
                : undefined;
            const dueDate = new Date(baseDate);
            dueDate.setDate(baseDate.getDate() + 7 + index);
            const hierarchy: Record<string, string> = {};
            if (contractId && contractLevel?.id) {
              hierarchy[contractLevel.id] = contractId;
            }
            if (categoryId && categoryLevel?.id) {
              hierarchy[categoryLevel.id] = categoryId;
            }
            if (productId && productLevel?.id) {
              hierarchy[productLevel.id] = productId;
            }
            return {
              id: `hz-${item.id}`,
              orderNumber: `HZ-${item.id.replace(/^hz-?/i, "")}`,
              customerName: item.customer,
              productName: item.product ?? "",
              quantity: item.quantity ?? 1,
              hierarchy,
              dueDate: dueDate.toISOString().slice(0, 10),
              priority: "normal",
              status: "pending",
            };
          },
        );
        setHorizonOrders(mappedOrders);
      } catch {
        // Ignore fetch errors for now.
      }
    }

    loadHorizonOrders();
  }, [addNode, levels, nodes]);

  const mergedOrders = useMemo(() => {
    const filteredExternal = horizonOrders.filter(
      (order) => !archivedExternalIds.has(order.id),
    );
    return [...orders, ...filteredExternal];
  }, [archivedExternalIds, orders, horizonOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const nodeLabelMap = new Map(
      nodes.map((node) => [node.id, node.label.toLowerCase()]),
    );

    return mergedOrders.filter((order) => {
      const hierarchyLabels = Object.values(order.hierarchy ?? {})
        .map((id) => nodeLabelMap.get(id) ?? "")
        .join(" ");
      const matchesQuery =
        normalizedQuery.length === 0 ||
        order.orderNumber.toLowerCase().includes(normalizedQuery) ||
        order.customerName.toLowerCase().includes(normalizedQuery) ||
        hierarchyLabels.includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [mergedOrders, nodes, searchQuery, statusFilter]);

  const statusCounts = useMemo(
    () => ({
      all: mergedOrders.length,
      pending: mergedOrders.filter((order) => order.status === "pending").length,
      in_progress: mergedOrders.filter((order) => order.status === "in_progress")
        .length,
      completed: mergedOrders.filter((order) => order.status === "completed")
        .length,
      cancelled: mergedOrders.filter((order) => order.status === "cancelled")
        .length,
    }),
    [mergedOrders],
  );

  const contractLevel = useMemo(
    () => levels.find((level) => level.key === "contract"),
    [levels],
  );
  const contractLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => {
      map.set(node.id, node.label);
    });
    return map;
  }, [nodes]);
  const groupedOrders = useMemo(() => {
    if (!groupByContract || !contractLevel) {
      return [];
    }
    const groups = new Map<string, Order[]>();
    filteredOrders.forEach((order) => {
      const contractId = order.hierarchy?.[contractLevel.id] ?? "none";
      const label =
        contractId === "none"
          ? "No contract"
          : contractLabelMap.get(contractId) ?? contractId;
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)?.push(order);
    });
    return Array.from(groups.entries()).map(([label, orders]) => ({
      label,
      orders,
    }));
  }, [contractLabelMap, contractLevel, filteredOrders, groupByContract]);

  const isExternalOrder = (order: Order) => order.id.startsWith("hz-");

  async function handleCreateOrder(values: {
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
    hierarchy?: Record<string, string>;
  }) {
    const maxOrderNumber = orders.reduce((max, order) => {
      const match = order.orderNumber.match(/\d+/);
      if (!match) {
        return max;
      }
      return Math.max(max, Number(match[0]));
    }, 0);
    const orderNumber = `ORD-${String(maxOrderNumber + 1).padStart(4, "0")}`;
    const newOrder = {
      orderNumber,
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      hierarchy: values.hierarchy,
      dueDate: values.dueDate,
      priority: values.priority,
      status: "pending" as const,
    };

    await addOrder(newOrder);
  }

  async function handleEditOrder(values: {
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
    hierarchy?: Record<string, string>;
  }) {
    if (!editingOrder) {
      return;
    }
    await updateOrder(editingOrder.id, {
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      hierarchy: values.hierarchy,
      dueDate: values.dueDate,
      priority: values.priority,
    });
    setEditingOrder(null);
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customer Orders</CardTitle>
          <Button
            className="gap-2"
            onClick={() => {
              setEditingOrder(null);
              setIsModalOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            New Order
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrdersToolbar
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onSearchChange={setSearchQuery}
            onStatusChange={setStatusFilter}
            groupByContract={groupByContract}
            onToggleGroupByContract={() =>
              setGroupByContract((prev) => !prev)
            }
            statusCounts={statusCounts}
          />
          <OrdersTable
            orders={filteredOrders}
            groups={groupByContract ? groupedOrders : undefined}
            onEdit={(order) => {
              setEditingOrder(order);
              setIsModalOpen(true);
            }}
            onDelete={(order) => {
              setPendingDelete(order);
            }}
          />
        </CardContent>
      </Card>
      <OrderModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingOrder(null);
        }}
        onSubmit={editingOrder ? handleEditOrder : handleCreateOrder}
        title={editingOrder ? "Edit Order" : "Create New Order"}
        submitLabel={editingOrder ? "Save Changes" : "Create Order"}
        editMode={
          editingOrder && isExternalOrder(editingOrder)
            ? "category-product-only"
            : "full"
        }
        initialValues={
          editingOrder
            ? {
                customerName: editingOrder.customerName,
                productName: editingOrder.productName ?? "",
                quantity: editingOrder.quantity ?? 1,
                dueDate: editingOrder.dueDate,
                priority: editingOrder.priority,
                hierarchy: editingOrder.hierarchy,
              }
            : undefined
        }
      />
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {isExternalOrder(pendingDelete)
                ? "Archive external order?"
                : "Delete order?"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isExternalOrder(pendingDelete)
                ? `This will hide ${pendingDelete.orderNumber} in PWS only.`
                : `This will remove ${pendingDelete.orderNumber} from the list.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (isExternalOrder(pendingDelete)) {
                    setArchivedExternalIds((prev) => {
                      const next = new Set(prev);
                      next.add(pendingDelete.id);
                      return next;
                    });
                  } else {
                    await removeOrder(pendingDelete.id);
                  }
                  setPendingDelete(null);
                }}
              >
                {isExternalOrder(pendingDelete) ? "Archive" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
