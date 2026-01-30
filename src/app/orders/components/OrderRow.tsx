import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableCell, TableRow } from "@/components/ui/Table";
import {
  EyeIcon,
  MessageCircleIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import type { Order } from "@/types/orders";
import type { HierarchyLevel } from "@/app/settings/HierarchyContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

interface OrderRowProps {
  order: Order;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
  levels: HierarchyLevel[];
}

export function OrderRow({ order, onEdit, onDelete, levels }: OrderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { nodes } = useHierarchy();
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
      : "status-ready_for_production";

  const engineerInitials = order.assignedEngineerName
    ? order.assignedEngineerName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  useEffect(() => {
    function handlePosition() {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 120);
      const viewportPadding = 0;
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
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">
        {order.orderNumber}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {order.customerName}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {order.assignedEngineerName ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {engineerInitials}
            </div>
            <span>{order.assignedEngineerName}</span>
          </div>
        ) : (
          "--"
        )}
      </TableCell>
      {levels.map((level) => {
        const value = order.hierarchy?.[level.id];
        return (
          <TableCell
            key={level.id}
            className={`whitespace-normal wrap-break-word ${
              level.isRequired ? "table-cell" : "hidden md:table-cell"
            }`}
          >
            {value ? (nodeLabelMap.get(value) ?? value) : "--"}
          </TableCell>
        );
      })}
      <TableCell>{order.quantity ?? "--"}</TableCell>
      <TableCell>{formatDate(order.dueDate)}</TableCell>
      <TableCell>
        <Badge variant={priorityVariant}>{order.priority}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant}>{formatOrderStatus(order.status)}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-2">
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="View order"
          >
            <EyeIcon className="h-4 w-4" />
          </Link>
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PaperclipIcon className="h-3.5 w-3.5" />
            <span>{order.attachments?.length ?? 0}</span>
          </div>
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageCircleIcon className="h-3.5 w-3.5" />
            <span>{order.comments?.length ?? 0}</span>
          </div>
          <div className="relative inline-flex">
            <Button
              variant="ghost"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              ref={triggerRef}
              onClick={() => setMenuOpen((prev) => !prev)}
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
                    minWidth: Math.max(menuPosition.width, 120),
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
