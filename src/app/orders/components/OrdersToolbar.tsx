"use client";

import { SearchIcon } from "lucide-react";

import type { OrderStatus } from "@/types/orders";

const statusOptions: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];
type StatusFilter = (typeof statusOptions)[number]["value"];

interface OrdersToolbarProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  groupByContract: boolean;
  onToggleGroupByContract: () => void;
  statusCounts: Record<StatusFilter, number>;
}

export function OrdersToolbar({
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusChange,
  groupByContract,
  onToggleGroupByContract,
  statusCounts,
}: OrdersToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search orders, customers, products..."
          className="h-10 w-full rounded-lg border border-border bg-input-background pl-10 pr-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
        {statusOptions.map((option) => {
          const isActive = statusFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusChange(option.value)}
              className={`h-9 rounded-full border px-4 text-sm font-medium transition ${
                isActive
                  ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center gap-2">
                {option.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isActive
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {statusCounts[option.value] ?? 0}
                </span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onToggleGroupByContract}
          className={`h-9 rounded-full border px-4 text-sm font-medium transition ${
            groupByContract
              ? "border-transparent bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background text-foreground hover:bg-muted/50"
          }`}
        >
          Group by Contract
        </button>
      </div>
    </div>
  );
}
