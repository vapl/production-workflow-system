// app/orders/[orderId]/page.tsx
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export default function OrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  // mock – vēlāk nāks no DB
  const order = {
    orderNumber: "ORD-0287",
    customerName: "FPgruppen",
    status: "pending",
    priority: "normal",
    dueDate: "2026-01-28",
    items: [{ productName: "PE 78 EI (EI60) Durvis", quantity: 1 }],
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">{order.customerName}</p>
        </div>

        <div className="flex gap-2">
          <Badge variant="outline">{order.priority}</Badge>
          <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            <strong>Due date:</strong>{" "}
            {new Date(order.dueDate).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{item.productName}</span>
              <span>× {item.quantity}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
