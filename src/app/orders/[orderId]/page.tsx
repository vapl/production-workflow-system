"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockBatches } from "@/lib/data/mockData";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import type { Batch } from "@/types/batch";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { OrderModal } from "@/app/orders/components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";

export default function OrderDetailPage() {
  const params = useParams<{ orderId?: string }>();
  const normalizeId = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[‐‑‒–—]/g, "-");

  const decodedOrderId = params?.orderId
    ? normalizeId(decodeURIComponent(params.orderId))
    : "";

  const { orders, updateOrder } = useOrders();
  const order = useMemo(
    () =>
      orders.find(
        (item) =>
          normalizeId(item.id) === decodedOrderId ||
          normalizeId(item.orderNumber) === decodedOrderId,
      ),
    [decodedOrderId, orders],
  );

  const [orderState, setOrderState] = useState(order);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    setOrderState(order);
  }, [order]);

  if (!orderState) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Order not found</h1>
        <p className="text-sm text-muted-foreground">
          No order matches this ID.
        </p>
      </section>
    );
  }

  const batches: Batch[] = mockBatches.filter(
    (batch) => batch.orderId === orderState.id,
  );

  return (
    <section className="space-y-6">
      <div>
        <Link href="/orders">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Orders
          </Button>
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{orderState.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {orderState.customerName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">{orderState.priority}</Badge>
          <Badge variant="outline">
            {formatOrderStatus(orderState.status)}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsEditOpen(true)}
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>
            <strong>Due date:</strong> {formatDate(orderState.dueDate)}
          </p>
          <p>
            <strong>Quantity:</strong> {orderState.quantity ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm">
            <span>{orderState.productName ?? "—"}</span>
            <span>x {orderState.quantity ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Production Batches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {batches.length === 0 ? (
            <p className="text-muted-foreground">
              No production batches created yet.
            </p>
          ) : (
            batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="font-medium">{batch.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Station: {batch.workstation}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>
                    {batch.actualHours ?? 0}h / {batch.estimatedHours}h
                  </div>
                  <div>{batch.status.replace("_", " ")}</div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <OrderModal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSubmit={(values) => {
          setOrderState((prev) =>
            prev
              ? {
                  ...prev,
                  customerName: values.customerName,
                  productName: values.productName,
                  quantity: values.quantity,
                  dueDate: values.dueDate,
                  priority: values.priority,
                }
              : prev,
          );
          updateOrder(orderState.id, {
            customerName: values.customerName,
            productName: values.productName,
            quantity: values.quantity,
            dueDate: values.dueDate,
            priority: values.priority,
          });
        }}
        title="Edit Order"
        submitLabel="Save Changes"
        initialValues={{
          customerName: orderState.customerName,
          productName: orderState.productName ?? "",
          quantity: orderState.quantity ?? 1,
          dueDate: orderState.dueDate,
          priority: orderState.priority,
        }}
      />
    </section>
  );
}
