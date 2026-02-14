import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MessageCircleIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import { getStatusBadgeColorClass } from "@/lib/domain/statusBadgeColor";
import type { Order } from "@/types/orders";
import { createPortal } from "react-dom";

interface OrdersCardsProps {
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

function OrderCard({
  order,
  activeLevels,
  onEdit,
  onDelete,
  dueSoonDays = 5,
  dueIndicatorEnabled = true,
  dueIndicatorStatuses,
  engineerLabel = "Engineer",
  managerLabel = "Manager",
}: {
  order: Order;
  activeLevels: { id: string; name: string }[];
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  dueSoonDays?: number;
  dueIndicatorEnabled?: boolean;
  dueIndicatorStatuses?: Order["status"][];
  engineerLabel?: string;
  managerLabel?: string;
}) {
  const router = useRouter();
  const { nodes } = useHierarchy();
  const { rules } = useWorkflowRules();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const nodeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => {
      map.set(node.id, node.label);
    });
    return map;
  }, [nodes]);
  const engineerInitials = order.assignedEngineerName
    ? order.assignedEngineerName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";
  const managerInitials = order.assignedManagerName
    ? order.assignedManagerName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  const priorityVariant =
    order.priority === "low"
      ? "priority-low"
      : order.priority === "high"
        ? "priority-high"
        : order.priority === "urgent"
          ? "priority-urgent"
          : "priority-normal";
  const displayStatus = order.statusDisplay ?? order.status;
  const statusVariant =
    displayStatus === "draft"
      ? "status-draft"
      : displayStatus === "ready_for_engineering"
        ? "status-ready_for_engineering"
        : displayStatus === "in_engineering"
          ? "status-in_engineering"
          : displayStatus === "engineering_blocked"
            ? "status-engineering_blocked"
            : displayStatus === "in_production"
              ? "status-in_production"
              : displayStatus === "done"
                ? "status-done"
                : "status-ready_for_production";
  const statusColorClass = getStatusBadgeColorClass(
    rules.orderStatusConfig[displayStatus]?.color,
  );
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = order.dueDate ? order.dueDate.slice(0, 10) : "";
  const dueSoonDate = new Date();
  dueSoonDate.setDate(dueSoonDate.getDate() + Math.max(0, dueSoonDays));
  const dueSoonStr = dueSoonDate.toISOString().slice(0, 10);
  const isDueStatusAllowed =
    !dueIndicatorStatuses || dueIndicatorStatuses.includes(order.status);
  const dueState =
    dueIndicatorEnabled && isDueStatusAllowed
      ? dueDate && dueDate < today
        ? "overdue"
        : dueDate && dueSoonDays > 0 && dueDate <= dueSoonStr
          ? "due-soon"
          : null
      : null;
  const hasOverdueExternal = (order.externalJobs ?? []).some(
    (job) =>
      job.dueDate < today &&
      !["delivered", "approved", "cancelled"].includes(job.status),
  );
  const hierarchyItems = activeLevels
    .map((level) => {
      const value = order.hierarchy?.[level.id];
      const fallbackLabel = order.hierarchyLabels?.[level.id];
      const displayValue = value
        ? (nodeLabelMap.get(value) ?? fallbackLabel ?? value)
        : "--";
      return {
        id: level.id,
        label: level.name,
        value: displayValue,
      };
    })
    .filter((item) => item.value !== "--");

  useEffect(() => {
    function handlePosition() {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 140);
      const viewportPadding = 8;
      const maxLeft = Math.max(
        viewportPadding,
        window.innerWidth - menuWidth - viewportPadding,
      );
      const desiredLeft = rect.right - menuWidth;
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(desiredLeft, viewportPadding), maxLeft),
        width: rect.width,
      });
    }

    if (menuOpen) {
      handlePosition();
      window.addEventListener("resize", handlePosition);
      window.addEventListener("scroll", handlePosition, true);
    }

    return () => {
      window.removeEventListener("resize", handlePosition);
      window.removeEventListener("scroll", handlePosition, true);
    };
  }, [menuOpen]);

  return (
    <div
      className="group relative rounded-lg border border-border bg-card p-3 shadow-sm transition hover:bg-muted/40 md:p-4"
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/orders/${order.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/orders/${order.id}`);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{order.orderNumber}</div>
          <div className="text-xs text-muted-foreground">
            {order.customerName}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end pr-10 md:pr-0 gap-1.5">
          <Badge variant={priorityVariant}>{order.priority}</Badge>
          <Badge variant={statusVariant} className={statusColorClass}>
            {rules.statusLabels[displayStatus] ??
              formatOrderStatus(displayStatus)}
          </Badge>
          {hasOverdueExternal && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              Overdue
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 grid-cols-2">
        {hierarchyItems.map((item) => (
          <div key={item.id} className="text-xs">
            <div className="text-muted-foreground">{item.label}</div>
            <div className="text-foreground wrap-break-word">{item.value}</div>
          </div>
        ))}
        <div className="text-xs">
          <div className="text-muted-foreground">Quantity</div>
          <div className="text-foreground">{order.quantity ?? "--"}</div>
        </div>
        <div className="text-xs">
          <div className="text-muted-foreground">Due Date</div>
          <div
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${
              dueState === "overdue"
                ? "border border-rose-500 text-rose-600"
                : dueState === "due-soon"
                  ? "border border-amber-400 text-amber-700"
                  : "text-foreground"
            }`}
          >
            {formatDate(order.dueDate)}
          </div>
        </div>
        <div className="text-xs">
          <div className="text-muted-foreground">{engineerLabel}</div>
          {order.assignedEngineerName ? (
            <div className="flex items-center gap-2 text-foreground">
              {order.assignedEngineerAvatarUrl ? (
                <img
                  src={order.assignedEngineerAvatarUrl}
                  alt={order.assignedEngineerName}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                  {engineerInitials}
                </div>
              )}
              <span className="truncate">{order.assignedEngineerName}</span>
            </div>
          ) : (
            <div className="text-foreground">--</div>
          )}
        </div>
        <div className="text-xs">
          <div className="text-muted-foreground">{managerLabel}</div>
          {order.assignedManagerName ? (
            <div className="flex items-center gap-2 text-foreground">
              {order.assignedManagerAvatarUrl ? (
                <img
                  src={order.assignedManagerAvatarUrl}
                  alt={order.assignedManagerName}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                  {managerInitials}
                </div>
              )}
              <span className="truncate">{order.assignedManagerName}</span>
            </div>
          ) : (
            <div className="text-foreground">--</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <PaperclipIcon className="h-3.5 w-3.5" />
            {order.attachmentCount ?? order.attachments?.length ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircleIcon className="h-3.5 w-3.5" />
            {order.commentCount ?? order.comments?.length ?? 0}
          </span>
        </div>
        <div className="pointer-events-none absolute -right-2 top-1/2 hidden h-10 w-20 -translate-y-1/2 bg-linear-to-l from-background via-background/80 to-transparent md:group-hover:block" />
        <div className="absolute right-3 top-3 hidden items-center gap-1 rounded-full border border-border bg-background/90 p-0.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur md:flex md:opacity-0 md:group-hover:opacity-100">
          {onEdit ? (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full text-foreground hover:bg-muted/50"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(order);
              }}
              title="Edit"
              aria-label="Edit"
            >
              <PencilIcon className="h-3 w-3" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(order);
              }}
              title="Delete"
              aria-label="Delete"
            >
              <Trash2Icon className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="absolute right-2 top-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            ref={triggerRef}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {menuOpen && menuPosition
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              onClick={() => setMenuOpen(false)}
            >
              <div
                className="absolute rounded-md border border-border bg-card p-1 text-sm shadow-md"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  minWidth: Math.max(menuPosition.width, 140),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {onEdit && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-none text-foreground hover:bg-muted/50"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(order);
                    }}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-none text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(order);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function OrdersCards({
  orders,
  onEdit,
  onDelete,
  groups,
  dueSoonDays,
  dueIndicatorEnabled,
  dueIndicatorStatuses,
  engineerLabel = "Engineer",
  managerLabel = "Manager",
}: OrdersCardsProps) {
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
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  return (
    <div className="space-y-4">
      {groups && groups.length > 0 ? (
        groups.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          return (
            <Fragment key={`group-${group.label}`}>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
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
              </div>
              {!isCollapsed && (
                <div className="space-y-3">
                  {group.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      activeLevels={activeLevels}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      dueSoonDays={dueSoonDays}
                      dueIndicatorEnabled={dueIndicatorEnabled}
                      dueIndicatorStatuses={dueIndicatorStatuses}
                      engineerLabel={engineerLabel}
                      managerLabel={managerLabel}
                    />
                  ))}
                </div>
              )}
            </Fragment>
          );
        })
      ) : orders.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No orders found
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              activeLevels={activeLevels}
              onEdit={onEdit}
              onDelete={onDelete}
              dueSoonDays={dueSoonDays}
              dueIndicatorEnabled={dueIndicatorEnabled}
              dueIndicatorStatuses={dueIndicatorStatuses}
              engineerLabel={engineerLabel}
              managerLabel={managerLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
