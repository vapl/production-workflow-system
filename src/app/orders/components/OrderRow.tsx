import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableCell, TableRow } from "@/components/ui/Table";
import { EyeIcon } from "lucide-react";
import Link from "next/link";

interface OrderRowProps {
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: string;
    status: string;
  };
}

export function OrderRow({ order }: OrderRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">{order.orderNumber}</TableCell>
      <TableCell>{order.customerName}</TableCell>
      <TableCell>{order.productName}</TableCell>
      <TableCell>{order.quantity}</TableCell>
      <TableCell>{new Date(order.dueDate).toLocaleDateString()}</TableCell>
      <TableCell>
        <Badge variant="outline">{order.priority}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <Link href={`/orders/${order.id}`}>
          <Button variant="ghost" size="sm" className="gap-2">
            <EyeIcon className="h-4 w-4" />
            View
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
