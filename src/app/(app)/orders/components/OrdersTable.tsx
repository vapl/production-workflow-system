import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/Table";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OrderRow } from "./OrderRow";
import { Order } from "@/types/orders";
import { useOrderFieldSettings } from "@/app/(app)/settings/OrderFieldSettingsContext";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getOrderFieldLabel } from "@/lib/domain/orderFieldPresentation";

interface OrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
  loadingLabel?: string;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  canEditOrder?: (order: Order) => boolean;
  canDeleteOrder?: (order: Order) => boolean;
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
  canEditOrder,
  canDeleteOrder,
  onTakeOrder,
  groups,
  dueSoonDays,
  dueIndicatorEnabled,
  dueIndicatorStatuses,
  engineerLabel,
  managerLabel,
}: OrdersTableProps) {
  const stickyGapPx = 48;
  const { t } = useI18n();
  const { orderFields } = useOrderFieldSettings();
  const visibleOrderFields = orderFields
    .filter((level) => level.isActive && level.showInTable)
    .sort((a, b) => a.order - b.order);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const stickyContainerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTopPx, setStickyTopPx] = useState(240);
  const [isTablePinned, setIsTablePinned] = useState(false);

  const totalColumns = visibleOrderFields.length;

  useEffect(() => {
    const stickyHeader = document.querySelector<HTMLElement>(
      ".orders-sticky-header",
    );
    const stickyContainer = stickyContainerRef.current;

    if (!stickyHeader || !stickyContainer) {
      return;
    }

    const updateStickyLayout = () => {
      const nextStickyTop = 64 + stickyHeader.offsetHeight + stickyGapPx;
      setStickyTopPx(nextStickyTop);
      setIsTablePinned(
        window.innerWidth >= 768 &&
          stickyContainer.getBoundingClientRect().top <= nextStickyTop,
      );
    };

    updateStickyLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateStickyLayout();
    });

    resizeObserver.observe(stickyHeader);
    window.addEventListener("scroll", updateStickyLayout, { passive: true });
    window.addEventListener("resize", updateStickyLayout);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateStickyLayout);
      window.removeEventListener("resize", updateStickyLayout);
    };
  }, [stickyGapPx]);

  const stickyStyle = {
    top: `${stickyTopPx}px`,
  };

  const tableScrollStyle = isTablePinned
    ? {
        maxHeight: `calc(100vh - ${stickyTopPx}px - ${stickyGapPx}px)`,
      }
    : undefined;

  return (
    <div ref={stickyContainerRef} className="md:sticky" style={stickyStyle}>
      <div className="rounded-md border bg-background overflow-hidden">
        <div
          className={`scrollbar-hidden overflow-x-auto ${
            isTablePinned ? "md:overflow-y-auto" : "md:overflow-y-visible"
          }`}
          style={tableScrollStyle}
        >
          <table className="w-full min-w-225 caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
              <TableRow>
                {visibleOrderFields.map((level) => (
                  <TableHead
                    key={level.id}
                    className={`whitespace-normal ${
                      level.isRequired ? "table-cell" : "hidden md:table-cell"
                    }`}
                  >
                    {level.key === "engineer"
                      ? (engineerLabel ??
                        getOrderFieldLabel(level.key, t, level.name))
                      : level.key === "manager"
                        ? (managerLabel ??
                          getOrderFieldLabel(level.key, t, level.name))
                        : getOrderFieldLabel(level.key, t, level.name)}
                  </TableHead>
                ))}
              </TableRow>
            </thead>

            <TableBody>
              {groups && groups.length > 0 ? (
                groups.map((group) => {
                  const isCollapsed = collapsedGroups[group.label] ?? false;
                  return (
                    <Fragment key={`group-${group.label}`}>
                      <TableRow>
                        <TableCell
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
                        </TableCell>
                      </TableRow>
                      {!isCollapsed &&
                        group.orders.map((order) => {
                          const allowEdit = canEditOrder
                            ? canEditOrder(order)
                            : Boolean(onEdit);
                          const allowDelete = canDeleteOrder
                            ? canDeleteOrder(order)
                            : Boolean(onDelete);
                          return (
                            <OrderRow
                              key={order.id}
                              order={order}
                              onEdit={allowEdit ? onEdit : undefined}
                              onDelete={allowDelete ? onDelete : undefined}
                              onTakeOrder={onTakeOrder}
                              orderFields={visibleOrderFields}
                              dueSoonDays={dueSoonDays}
                              dueIndicatorEnabled={dueIndicatorEnabled}
                              dueIndicatorStatuses={dueIndicatorStatuses}
                            />
                          );
                        })}
                    </Fragment>
                  );
                })
              ) : !isLoading && orders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={totalColumns}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("orders.page.noOrdersFound")}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const allowEdit = canEditOrder
                    ? canEditOrder(order)
                    : Boolean(onEdit);
                  const allowDelete = canDeleteOrder
                    ? canDeleteOrder(order)
                    : Boolean(onDelete);
                  return (
                    <OrderRow
                      key={order.id}
                      order={order}
                      onEdit={allowEdit ? onEdit : undefined}
                      onDelete={allowDelete ? onDelete : undefined}
                      onTakeOrder={onTakeOrder}
                      orderFields={visibleOrderFields}
                      dueSoonDays={dueSoonDays}
                      dueIndicatorEnabled={dueIndicatorEnabled}
                      dueIndicatorStatuses={dueIndicatorStatuses}
                    />
                  );
                })
              )}
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={totalColumns}
                    className="py-6 text-center text-muted-foreground"
                  >
                    <div className="flex justify-center">
                      <LoadingSpinner
                        label={loadingLabel ?? t("orders.page.loadingOrders")}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  );
}
