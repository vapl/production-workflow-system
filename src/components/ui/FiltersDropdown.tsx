"use client";

import { useState } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/components/ui/utils";

type FiltersDropdownProps = {
  label?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function FiltersDropdown({
  label = "Filters",
  children,
  className,
  contentClassName,
}: FiltersDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/50",
            className,
          )}
          aria-label={label}
          aria-expanded={open}
        >
          <SlidersHorizontalIcon className="h-4 w-4" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          "z-50 w-90 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-lg",
          contentClassName,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
