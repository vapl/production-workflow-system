import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { OrderRow } from "./OrderRow";
import { Order } from "@/types/orders";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

interface OrdersTableProps {
  orders: Order[];
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  groups?: {
    label: string;
    orders: Order[];
  }[];
}

export function OrdersTable({
  orders,
  onEdit,
  onDelete,
  groups,
}: OrdersTableProps) {
  const { levels } = useHierarchy();
  const activeLevels = levels
    .filter((level) => level.isActive)
    .sort((a, b) => a.order - b.order);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    {},
  );

  const totalColumns = 7 + activeLevels.length;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Customer</TableHead>
            {activeLevels.map((level) => (
              <TableHead key={level.id}>{level.name}</TableHead>
            ))}
            <TableHead>Quantity</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {groups && groups.length > 0 ? (
            groups.map((group) => {
              const isCollapsed = collapsedGroups[group.label] ?? false;
              return (
                <Fragment key={`group-${group.label}`}>
                  <TableRow>
                    <td
                      colSpan={totalColumns}
                      className="bg-muted/40 px-3 py-2 text-sm font-semibold"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [group.label]: !isCollapsed,
                          }))
                        }
                      >
                        {isCollapsed ? (
                          <ChevronRightIcon className="h-4 w-4" />
                        ) : (
                          <ChevronDownIcon className="h-4 w-4" />
                        )}
                        {group.label}
                        <span className="text-xs text-muted-foreground">
                          ({group.orders.length})
                        </span>
                      </button>
                    </td>
                  </TableRow>
                  {!isCollapsed &&
                    group.orders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        levels={activeLevels}
                      />
                    ))}
                </Fragment>
              );
            })
          ) : orders.length === 0 ? (
            <TableRow>
              <td
                colSpan={totalColumns}
                className="py-8 text-center text-muted-foreground"
              >
                No orders found
              </td>
            </TableRow>
          ) : (
            orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onEdit={onEdit}
                onDelete={onDelete}
                levels={activeLevels}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
