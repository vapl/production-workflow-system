"use client";

import { useMemo, useState } from "react";
import { OrdersTable } from "./components/OrdersTable";
import { OrdersToolbar } from "./components/OrdersToolbar";
import type { Order, OrderStatus } from "@/types/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "lucide-react";
import { OrderModal } from "./components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";

export default function OrdersPage() {
  const { orders, addOrder, updateOrder, removeOrder } = useOrders();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        order.orderNumber.toLowerCase().includes(normalizedQuery) ||
        order.customerName.toLowerCase().includes(normalizedQuery) ||
        (order.productName ?? "").toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  function handleCreateOrder(values: {
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
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
      id: `o-${Date.now()}`,
      orderNumber,
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      dueDate: values.dueDate,
      priority: values.priority,
      status: "pending" as const,
    };

    addOrder(newOrder);
  }

  function handleEditOrder(values: {
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
  }) {
    if (!editingOrder) {
      return;
    }
    updateOrder(editingOrder.id, {
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
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
          />
          <OrdersTable
            orders={filteredOrders}
            onEdit={(order) => {
              setEditingOrder(order);
              setIsModalOpen(true);
            }}
            onDelete={(order) => setPendingDelete(order)}
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
        initialValues={
          editingOrder
            ? {
                customerName: editingOrder.customerName,
                productName: editingOrder.productName ?? "",
                quantity: editingOrder.quantity ?? 1,
                dueDate: editingOrder.dueDate,
                priority: editingOrder.priority,
              }
            : undefined
        }
      />
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete order?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will remove {pendingDelete.orderNumber} from the list.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  removeOrder(pendingDelete.id);
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
