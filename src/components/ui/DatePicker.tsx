"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parseISO, startOfDay } from "date-fns";

import { cn } from "@/components/ui/utils";
import { Calendar } from "@/components/ui/Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  min?: string;
  placeholder?: string;
};

export function DatePicker({
  value,
  onChange,
  label,
  className,
  triggerClassName,
  disabled,
  min,
  placeholder = "Select date",
}: DatePickerProps) {
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  const minDate = React.useMemo(() => {
    if (!min) return undefined;
    const parsed = parseISO(min);
    return isValid(parsed) ? parsed : undefined;
  }, [min]);

  const formatted = selectedDate ? format(selectedDate, "dd.MM.yyyy") : "";

  return (
    <label className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      {label ? <span>{label}</span> : null}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "relative flex h-9 w-full items-center justify-between rounded-lg border border-border bg-input-background px-3 pr-9 text-sm text-foreground",
              "text-left disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName,
            )}
          >
            <span className={formatted ? "text-foreground" : "text-muted-foreground"}>
              {formatted || placeholder}
            </span>
            <CalendarIcon className="absolute right-3 h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) {
                onChange("");
                return;
              }
              onChange(format(date, "yyyy-MM-dd"));
            }}
            disabled={(date) =>
              minDate ? startOfDay(date) < startOfDay(minDate) : false
            }
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </label>
  );
}
