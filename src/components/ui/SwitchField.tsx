"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

type SwitchFieldProps = {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function SwitchField({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  error,
  disabled,
  required,
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
}: SwitchFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? `switch-field-${generatedId}`;

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "inline-flex items-center gap-3 text-sm",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          labelClassName,
        )}
      >
        <button
          id={inputId}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border transition-colors",
            checked ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
        {label ? <span>{label}{required ? " *" : ""}</span> : null}
      </label>
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

