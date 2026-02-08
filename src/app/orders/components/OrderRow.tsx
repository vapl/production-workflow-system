import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableCell, TableRow } from "@/components/ui/Table";
import {
  MessageCircleIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import type { Order } from "@/types/orders";
import type { HierarchyLevel } from "@/app/settings/HierarchyContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface OrderRowProps {
  order: Order;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  levels: HierarchyLevel[];
  dueSoonDays?: number;
  dueIndicatorEnabled?: boolean;
  dueIndicatorStatuses?: Order["status"][];
}

export function OrderRow({
  order,
  onEdit,
  onDelete,
  levels,
  dueSoonDays = 5,
  dueIndicatorEnabled = true,
  dueIndicatorStatuses,
}: OrderRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { nodes } = useHierarchy();
  const { rules } = useWorkflowRules();
  const nodeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => {
      map.set(node.id, node.label);
    });
    return map;
  }, [nodes]);

  const priorityVariant =
    order.priority === "low"
      ? "priority-low"
      : order.priority === "high"
        ? "priority-high"
        : order.priority === "urgent"
          ? "priority-urgent"
          : "priority-normal";
    const statusVariant =
      order.status === "draft"
        ? "status-draft"
        : order.status === "ready_for_engineering"
          ? "status-ready_for_engineering"
          : order.status === "in_engineering"
            ? "status-in_engineering"
            : order.status === "engineering_blocked"
              ? "status-engineering_blocked"
              : order.status === "in_production"
                ? "status-in_production"
                : "status-ready_for_production";
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
  const engineerAvatarUrl = order.assignedEngineerAvatarUrl;
  const managerAvatarUrl = order.assignedManagerAvatarUrl;

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
    <TableRow
      className="group cursor-pointer"
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
      <TableCell className="font-medium whitespace-nowrap">
        {order.orderNumber}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {order.customerName}
      </TableCell>
      {levels.map((level) => {
        const value = order.hierarchy?.[level.id];
        const fallbackLabel = order.hierarchyLabels?.[level.id];
        const displayValue = value
          ? nodeLabelMap.get(value) ?? fallbackLabel ?? value
          : "--";
        return (
          <TableCell
            key={level.id}
            className={`whitespace-normal wrap-break-word ${
              level.isRequired ? "table-cell" : "hidden md:table-cell"
            }`}
          >
            {displayValue}
          </TableCell>
        );
      })}
      <TableCell>{order.quantity ?? "--"}</TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm ${
            dueState === "overdue"
              ? "border border-rose-500 text-rose-600"
              : dueState === "due-soon"
                ? "border border-amber-400 text-amber-700"
                : "text-foreground"
          }`}
          title={
            dueState === "overdue"
              ? "Overdue"
              : dueState === "due-soon"
                ? "Due soon"
                : undefined
          }
        >
          {formatDate(order.dueDate)}
        </span>
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {order.assignedEngineerName ? (
          <div className="flex items-center gap-2">
            {engineerAvatarUrl ? (
              <img
                src={engineerAvatarUrl}
                alt={order.assignedEngineerName}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {engineerInitials}
              </div>
            )}
            <span>{order.assignedEngineerName}</span>
          </div>
        ) : (
          "--"
        )}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {order.assignedManagerName ? (
          <div className="flex items-center gap-2">
            {managerAvatarUrl ? (
              <img
                src={managerAvatarUrl}
                alt={order.assignedManagerName}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {managerInitials}
              </div>
            )}
            <span>{order.assignedManagerName}</span>
          </div>
        ) : (
          "--"
        )}
      </TableCell>
      <TableCell>
        <Badge variant={priorityVariant}>{order.priority}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant}>
            {rules.statusLabels[order.status] ??
              formatOrderStatus(order.status)}
          </Badge>
          {hasOverdueExternal && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              Overdue
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right align-middle">
        <div className="relative flex items-center justify-between gap-2 pr-12 md:pr-16">
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PaperclipIcon className="h-3.5 w-3.5" />
            <span>
              {order.attachmentCount ?? order.attachments?.length ?? 0}
            </span>
          </div>
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageCircleIcon className="h-3.5 w-3.5" />
            <span>{order.commentCount ?? order.comments?.length ?? 0}</span>
          </div>
          <div className="pointer-events-none absolute -right-2 top-1/2 hidden h-9 w-20 -translate-y-1/2 bg-gradient-to-l from-background via-background/80 to-transparent md:group-hover:block" />
          <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-background/90 p-0.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur md:flex md:opacity-0 md:group-hover:opacity-100">
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
          <div className="relative inline-flex md:hidden">
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
      </TableCell>
    </TableRow>
  );
}
