"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { cn } from "@/components/ui/utils";

type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  id?: string;
  label?: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectFieldOption[];
  children?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function SelectField({
  id,
  label,
  value,
  onValueChange,
  options,
  children,
  placeholder,
  required,
  disabled,
  className,
  labelClassName,
  triggerClassName,
  contentClassName,
  description,
  error,
  descriptionClassName,
  errorClassName,
}: SelectFieldProps) {
  const generatedId = React.useId();
  const labelId = id ?? `select-field-${generatedId}`;

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <label
          id={labelId}
          className={cn("text-sm font-medium text-foreground", labelClassName)}
        >
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      {children ? (
        children
      ) : (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger
            aria-labelledby={label ? labelId : undefined}
            className={cn("h-10 w-full", triggerClassName)}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className={contentClassName}>
            {(options ?? []).map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {description ? (
        <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className={cn("text-xs text-destructive", errorClassName)}>{error}</div>
      ) : null}
    </div>
  );
}
