"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";

import type { OrderStatus } from "@/types/orders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { ViewModeToggle } from "./ViewModeToggle";

export type StatusOption = { value: OrderStatus | "all"; label: string };
type StatusFilter = StatusOption["value"];
type AssignmentFilter = "queue" | "my";

interface OrdersToolbarProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  groupByContract: boolean;
  onToggleGroupByContract: () => void;
  statusCounts: Partial<Record<StatusFilter, number>>;
  statusOptions: StatusOption[];
  partnerGroupOptions?: { value: string; label: string }[];
  partnerGroupFilter?: string;
  onPartnerGroupChange?: (value: string) => void;
  assignmentFilter?: AssignmentFilter;
  onAssignmentChange?: (value: AssignmentFilter) => void;
  viewMode?: "table" | "cards";
  onViewModeChange?: (value: "table" | "cards") => void;
}

export function OrdersToolbar({
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusChange,
  groupByContract,
  onToggleGroupByContract,
  statusCounts,
  statusOptions,
  partnerGroupOptions = [],
  partnerGroupFilter = "",
  onPartnerGroupChange,
  assignmentFilter,
  onAssignmentChange,
  viewMode,
  onViewModeChange,
}: OrdersToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filtersOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) {
        return;
      }
      if (filtersRef.current && !filtersRef.current.contains(target)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [filtersOpen]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex w-full flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center">
        <div className="relative w-full">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search orders, customers, products..."
            className="h-10 w-full rounded-lg border border-border bg-input-background pl-10 pr-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        {viewMode && onViewModeChange ? (
          <ViewModeToggle
            value={viewMode}
            onChange={onViewModeChange}
            className="lg:ml-3"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2 lg:shrink-0">
        <div className="relative" ref={filtersRef}>
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/50"
          >
            <SlidersHorizontalIcon className="h-4 w-4" />
            Filters
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-11 z-50 w-[320px] rounded-xl border border-border bg-card p-4 shadow-lg">
              <div className="space-y-3">
                {assignmentFilter && onAssignmentChange && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Engineering</div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: "queue", label: "Queue" },
                        { value: "my", label: "My work" },
                      ] as const).map((option) => {
                        const isActive = assignmentFilter === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => onAssignmentChange(option.value)}
                            className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                              isActive
                                ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                                : "border-border bg-background text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Status</div>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((option) => {
                      const isActive = statusFilter === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onStatusChange(option.value)}
                          className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                            isActive
                              ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {option.label}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
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
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={groupByContract}
                    onChange={onToggleGroupByContract}
                  />
                  Group by Contract
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
