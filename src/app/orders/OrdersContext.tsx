"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Order } from "@/types/orders";
import { mockOrders } from "@/lib/data/mockData";

interface OrdersContextValue {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  addOrder: (order: Order) => void;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  removeOrder: (orderId: string) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      setOrders,
      addOrder: (order) => setOrders((prev) => [order, ...prev]),
      updateOrder: (orderId, patch) =>
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, ...patch } : order,
          ),
        ),
      removeOrder: (orderId) =>
        setOrders((prev) => prev.filter((order) => order.id !== orderId)),
    }),
    [orders],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error("useOrders must be used within OrdersProvider");
  }
  return context;
}
