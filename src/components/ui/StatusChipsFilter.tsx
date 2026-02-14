"use client";

import { cn } from "@/components/ui/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export type FilterOption<T extends string = string> = {
  value: T;
  label: string;
  count?: number;
};

type FilterOptionSelectorProps<T extends string = string> = {
  title?: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  mode?: "chips" | "select";
  selectPlaceholder?: string;
  className?: string;
  chipsClassName?: string;
};

export function FilterOptionSelector<T extends string = string>({
  title = "Status",
  options,
  value,
  onChange,
  mode = "chips",
  selectPlaceholder = "Select option",
  className,
  chipsClassName,
}: FilterOptionSelectorProps<T>) {
  if (mode === "select") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <Select value={value} onValueChange={(next) => onChange(next as T)}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder={selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {typeof option.count === "number" ? ` (${option.count})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className={cn("flex flex-wrap gap-2", chipsClassName)}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                active
                  ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center gap-2">
                {option.label}
                {typeof option.count === "number" ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      active
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {option.count}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type StatusChipsFilterProps<T extends string = string> = Omit<
  FilterOptionSelectorProps<T>,
  "mode"
>;

export function StatusChipsFilter<T extends string = string>(
  props: StatusChipsFilterProps<T>,
) {
  return <FilterOptionSelector {...props} mode="chips" />;
}
