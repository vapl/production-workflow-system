import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EyeIcon } from "lucide-react";

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
    <tr>
      <td className="font-medium">{order.orderNumber}</td>
      <td>{order.customerName}</td>
      <td>{order.productName}</td>
      <td>{order.quantity}</td>
      <td>{new Date(order.dueDate).toLocaleDateString()}</td>
      <td>
        <Badge variant="outline">{order.priority}</Badge>
      </td>
      <td>
        <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
      </td>
      <td className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => console.log("view", order.id)}
          className="gap-2"
        >
          <EyeIcon className="w-4 h-4" />
          View
        </Button>
      </td>
    </tr>
  );
}
