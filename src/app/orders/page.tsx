import { Order } from "@/types/orders";
import { OrdersTable } from "./components/OrdersTable";
// import { OrdersToolbar } from "./components/OrdersToolbar";

const mockOrders: (Order & {
  productName: string;
  quantity: number;
})[] = [
  {
    id: "1",
    orderNumber: "ORD-0287",
    customerName: "FPgruppen",
    productName: "PE 78 EI (EI60) Durvis",
    quantity: 1,
    dueDate: "2026-01-28",
    priority: "normal",
    status: "pending",
  },
  {
    id: "2",
    orderNumber: "ORD-0288",
    customerName: "Hallgruppen",
    productName: "PE 50 Logs",
    quantity: 4,
    dueDate: "2026-02-02",
    priority: "high",
    status: "in_progress",
  },
];

export default function OrdersPage() {
  return (
    <section className="space-y-4">
      {/* <OrdersToolbar /> */}
      <OrdersTable orders={mockOrders} />
    </section>
  );
}
