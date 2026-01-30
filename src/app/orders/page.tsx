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
import { useCurrentUser } from "@/contexts/UserContext";
import { buildOrdersTemplate } from "@/lib/excel/ordersExcel";
import { ImportWizard } from "./components/ImportWizard";

export default function OrdersPage() {
  const {
    orders,
    addOrder,
    updateOrder,
    removeOrder,
    error,
    syncAccountingOrders,
  } = useOrders();
  const { nodes, levels } = useHierarchy();
  const user = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState("");
  const roleStatusOptions = useMemo(() => {
    if (user.role === "Engineering") {
      return [
        { value: "ready_for_engineering", label: "Ready for Eng." },
        { value: "in_engineering", label: "In Eng." },
        { value: "engineering_blocked", label: "Eng. Blocked" },
        { value: "ready_for_production", label: "Ready for Prod." },
      ];
    }
    if (user.role === "Production") {
      return [{ value: "ready_for_production", label: "Ready for Prod." }];
    }
    if (user.role === "Sales") {
      return [
        { value: "all", label: "All" },
        { value: "draft", label: "Draft" },
        { value: "ready_for_engineering", label: "Ready for Eng." },
        { value: "in_engineering", label: "In Eng." },
        { value: "engineering_blocked", label: "Eng. Blocked" },
        { value: "ready_for_production", label: "Ready for Prod." },
      ];
    }
    return [
      { value: "all", label: "All" },
      { value: "draft", label: "Draft" },
      { value: "ready_for_engineering", label: "Ready for Eng." },
      { value: "in_engineering", label: "In Eng." },
      { value: "engineering_blocked", label: "Eng. Blocked" },
      { value: "ready_for_production", label: "Ready for Prod." },
    ];
  }, [user.role]);
  const defaultStatusFilter =
    roleStatusOptions[0]?.value ?? ("all" as const);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">(
    defaultStatusFilter,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [groupByContract, setGroupByContract] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncStartedRef = useRef(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (syncStartedRef.current) {
      return;
    }
    if (levels.length === 0) {
      return;
    }
    syncStartedRef.current = true;
    void syncAccountingOrders();
  }, [levels, syncAccountingOrders]);

  useEffect(() => {
    if (!isImportMenuOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (importMenuRef.current && !importMenuRef.current.contains(target)) {
        setIsImportMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isImportMenuOpen]);

  useEffect(() => {
    setStatusFilter(defaultStatusFilter);
  }, [defaultStatusFilter]);

  const roleFilteredOrders = useMemo(() => {
    const allowedStatuses = roleStatusOptions
      .map((option) => option.value)
      .filter((value): value is OrderStatus => value !== "all");
    if (roleStatusOptions.some((option) => option.value === "all")) {
      return orders;
    }
    return orders.filter((order) => allowedStatuses.includes(order.status));
  }, [orders, roleStatusOptions]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const nodeLabelMap = new Map(
      nodes.map((node) => [node.id, node.label.toLowerCase()]),
    );

    return roleFilteredOrders.filter((order) => {
      const hierarchyLabels = Object.values(order.hierarchy ?? {})
        .map((value) => nodeLabelMap.get(value) ?? value ?? "")
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
  }, [nodes, roleFilteredOrders, searchQuery, statusFilter]);

  const statusCounts = useMemo(() => {
    const base = {
      all: roleFilteredOrders.length,
      draft: roleFilteredOrders.filter((order) => order.status === "draft")
        .length,
      ready_for_engineering: roleFilteredOrders.filter(
        (order) => order.status === "ready_for_engineering",
      ).length,
      in_engineering: roleFilteredOrders.filter(
        (order) => order.status === "in_engineering",
      ).length,
      engineering_blocked: roleFilteredOrders.filter(
        (order) => order.status === "engineering_blocked",
      ).length,
      ready_for_production: roleFilteredOrders.filter(
        (order) => order.status === "ready_for_production",
      ).length,
    };
    return base;
  }, [roleFilteredOrders]);

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

  async function handleCreateOrder(values: {
    orderNumber: string;
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
    hierarchy?: Record<string, string>;
  }) {
    const newOrder = {
      orderNumber: values.orderNumber,
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      hierarchy: values.hierarchy,
      dueDate: values.dueDate,
      priority: values.priority,
      status: "draft" as const,
      notes: values.notes,
      authorName: user.name,
      authorRole: user.role,
    };

    await addOrder(newOrder);
  }

  async function handleEditOrder(values: {
    orderNumber: string;
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                setIsSyncing(true);
                await syncAccountingOrders();
                setIsSyncing(false);
              }}
              disabled={isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync Accounting"}
            </Button>
            <div className="relative" ref={importMenuRef}>
              <Button
                variant="outline"
                onClick={() => setIsImportMenuOpen((prev) => !prev)}
              >
                Import
              </Button>
              {isImportMenuOpen && (
                <div className="absolute right-0 top-11 z-50 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => {
                      const levelNames = levels.map((level) => level.name);
                      const blob = buildOrdersTemplate(levelNames);
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = "pws-orders-template.xlsx";
                      anchor.click();
                      URL.revokeObjectURL(url);
                      setIsImportMenuOpen(false);
                    }}
                  >
                    Download template
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => {
                      setIsImportOpen(true);
                      setIsImportMenuOpen(false);
                    }}
                  >
                    Import Excel
                  </button>
                </div>
              )}
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setEditingOrder(null);
                setIsModalOpen(true);
              }}
              disabled={!["Sales", "Admin"].includes(user.role)}
            >
              <PlusIcon className="h-4 w-4" />
              New Order
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
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
            statusOptions={roleStatusOptions}
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
        editMode="full"
        initialValues={
          editingOrder
            ? {
                orderNumber: editingOrder.orderNumber,
                customerName: editingOrder.customerName,
                productName: editingOrder.productName ?? "",
                quantity: editingOrder.quantity ?? 1,
                dueDate: editingOrder.dueDate,
                priority: editingOrder.priority,
                hierarchy: editingOrder.hierarchy,
              }
            : undefined
        }
        existingOrderNumbers={orders.map((order) => order.orderNumber)}
      />
      <ImportWizard
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete order?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {`This will remove ${pendingDelete.orderNumber} from the list.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await removeOrder(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
