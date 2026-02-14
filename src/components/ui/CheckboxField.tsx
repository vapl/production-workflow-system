"use client";

import * as React from "react";
import { Checkbox, type CheckboxProps } from "@/components/ui/Checkbox";
import { cn } from "@/components/ui/utils";

type CheckboxFieldProps = Omit<CheckboxProps, "id"> & {
  id?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function CheckboxField({
  id,
  label,
  required,
  description,
  error,
  descriptionClassName,
  errorClassName,
  ...checkboxProps
}: CheckboxFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? `checkbox-field-${generatedId}`;

  return (
    <div className="space-y-2">
      <Checkbox
        id={inputId}
        label={label ? <>{label}{required ? " *" : ""}</> : undefined}
        {...checkboxProps}
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

