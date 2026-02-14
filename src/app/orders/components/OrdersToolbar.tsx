"use client";

import { SearchIcon } from "lucide-react";

import type { OrderStatus } from "@/types/orders";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { ViewModeToggle } from "./ViewModeToggle";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";

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
  assignmentFilter,
  onAssignmentChange,
  viewMode,
  onViewModeChange,
}: OrdersToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex w-full flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center">
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search orders, customers, products..."
          startIcon={<SearchIcon className="h-4 w-4" />}
          wrapperClassName="w-full"
        />
        {viewMode && onViewModeChange ? (
          <ViewModeToggle
            value={viewMode}
            onChange={onViewModeChange}
            className="lg:ml-3"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2 lg:shrink-0">
        <FiltersDropdown contentClassName="w-[320px] p-4">
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
            {assignmentFilter && onAssignmentChange ? (
              <div className="h-px bg-border/70" />
            ) : null}
            <div className="space-y-2">
              <FilterOptionSelector
                title="Status"
                value={statusFilter}
                onChange={onStatusChange}
                options={statusOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  count: statusCounts[option.value] ?? 0,
                }))}
              />
            </div>
            <div className="h-px bg-border/70" />
            <Checkbox
              checked={groupByContract}
              onChange={onToggleGroupByContract}
              label="Group by Contract"
            />
          </div>
        </FiltersDropdown>
      </div>
    </div>
  );
}
