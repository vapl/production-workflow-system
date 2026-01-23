import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { OrderRow } from "./OrderRow";
import { Order } from "@/types/orders";

interface OrdersTableProps {
  orders: (Order & {
    productName: string;
    quantity: number;
  })[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <td
                colSpan={8}
                className="py-8 text-center text-muted-foreground"
              >
                No orders found
              </td>
            </TableRow>
          ) : (
            orders.map((order) => <OrderRow key={order.id} order={order} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
