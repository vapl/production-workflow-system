import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OrderRow } from "./OrderRow";
import { Order } from "@/types/orders";
import { useOrderFieldSettings } from "@/app/settings/OrderFieldSettingsContext";
import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getOrderFieldLabel } from "@/lib/domain/orderFieldPresentation";

interface OrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
  loadingLabel?: string;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  onTakeOrder?: (order: Order) => void;
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
  isLoading = false,
  loadingLabel,
  onEdit,
  onDelete,
  onTakeOrder,
  groups,
  dueSoonDays,
  dueIndicatorEnabled,
  dueIndicatorStatuses,
  engineerLabel,
  managerLabel,
}: OrdersTableProps) {
  const { t } = useI18n();
  const { orderFields } = useOrderFieldSettings();
  const visibleOrderFields = orderFields
    .filter((level) => level.isActive && level.showInTable)
    .sort((a, b) => a.order - b.order);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const totalColumns = visibleOrderFields.length;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="w-full min-w-225">
        <TableHeader>
          <TableRow>
            {visibleOrderFields.map((level) => (
              <TableHead
                key={level.id}
                className={`whitespace-normal ${
                  level.isRequired ? "table-cell" : "hidden md:table-cell"
                }`}
              >
                {level.key === "engineer"
                  ? engineerLabel ?? getOrderFieldLabel(level.key, t, level.name)
                  : level.key === "manager"
                    ? managerLabel ?? getOrderFieldLabel(level.key, t, level.name)
                    : getOrderFieldLabel(level.key, t, level.name)}
              </TableHead>
            ))}
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
                        onTakeOrder={onTakeOrder}
                        orderFields={visibleOrderFields}
                        dueSoonDays={dueSoonDays}
                        dueIndicatorEnabled={dueIndicatorEnabled}
                        dueIndicatorStatuses={dueIndicatorStatuses}
                      />
                    ))}
                </Fragment>
              );
            })
          ) : !isLoading && orders.length === 0 ? (
            <TableRow>
              <td
                colSpan={totalColumns}
                className="py-8 text-center text-muted-foreground"
              >
                {t("orders.page.noOrdersFound")}
              </td>
            </TableRow>
          ) : (
            orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onEdit={onEdit}
                onDelete={onDelete}
                onTakeOrder={onTakeOrder}
                orderFields={visibleOrderFields}
                dueSoonDays={dueSoonDays}
                dueIndicatorEnabled={dueIndicatorEnabled}
                dueIndicatorStatuses={dueIndicatorStatuses}
              />
            ))
          )}
          {isLoading ? (
            <TableRow>
              <td
                colSpan={totalColumns}
                className="py-6 text-center text-muted-foreground"
              >
                <div className="flex justify-center">
                  <LoadingSpinner
                    label={loadingLabel ?? t("orders.page.loadingOrders")}
                  />
                </div>
              </td>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

