"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

type FileFieldProps = Omit<React.ComponentProps<"input">, "type" | "id"> & {
  id?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function FileField({
  id,
  label,
  description,
  error,
  required,
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
  ...inputProps
}: FileFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? `file-field-${generatedId}`;

  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={inputId}
          className={cn("text-sm font-medium", labelClassName)}
        >
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <input
        id={inputId}
        type="file"
        required={required}
        className={cn(
          "ui-control w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground",
          "file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          className,
        )}
        {...inputProps}
      />
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

