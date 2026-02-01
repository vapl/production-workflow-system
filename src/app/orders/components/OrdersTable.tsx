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
  dueSoonDays?: number;
  dueIndicatorEnabled?: boolean;
  dueIndicatorStatuses?: Order["status"][];
  engineerLabel?: string;
  managerLabel?: string;
}

export function OrdersTable({
  orders,
  onEdit,
  onDelete,
  groups,
  dueSoonDays,
  dueIndicatorEnabled,
  dueIndicatorStatuses,
  engineerLabel = "Engineer",
  managerLabel = "Manager",
}: OrdersTableProps) {
  const { levels } = useHierarchy();
  const activeLevels = levels
    .filter(
      (level) =>
        level.isActive &&
        level.showInTable &&
        level.key !== "engineer" &&
        level.key !== "manager",
    )
    .sort((a, b) => a.order - b.order);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    {},
  );

  const totalColumns = 9 + activeLevels.length;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="w-full min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Order #</TableHead>
            <TableHead className="whitespace-normal">Customer</TableHead>
            {activeLevels.map((level) => (
              <TableHead
                key={level.id}
                className={`whitespace-normal ${
                  level.isRequired ? "table-cell" : "hidden md:table-cell"
                }`}
              >
                {level.name}
              </TableHead>
            ))}
            <TableHead className="whitespace-normal">Quantity</TableHead>
            <TableHead className="whitespace-normal">Due Date</TableHead>
            <TableHead className="whitespace-normal">
              {engineerLabel}
            </TableHead>
            <TableHead className="whitespace-normal">
              {managerLabel}
            </TableHead>
            <TableHead className="whitespace-normal">Priority</TableHead>
            <TableHead className="whitespace-normal">Status</TableHead>
            <TableHead className="text-right whitespace-normal">Actions</TableHead>
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
                        dueSoonDays={dueSoonDays}
                        dueIndicatorEnabled={dueIndicatorEnabled}
                        dueIndicatorStatuses={dueIndicatorStatuses}
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
                dueSoonDays={dueSoonDays}
                dueIndicatorEnabled={dueIndicatorEnabled}
                dueIndicatorStatuses={dueIndicatorStatuses}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
