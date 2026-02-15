"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

type TextAreaFieldProps = Omit<React.ComponentProps<"textarea">, "id"> & {
  id?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function TextAreaField({
  id,
  label,
  description,
  error,
  required,
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
  ...props
}: TextAreaFieldProps) {
  const generatedId = React.useId();
  const textareaId = id ?? `textarea-field-${generatedId}`;

  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={textareaId}
          className={cn("text-sm font-medium text-foreground", labelClassName)}
        >
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <textarea
        id={textareaId}
        required={required}
        className={cn(
          "w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          className,
        )}
        {...props}
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

