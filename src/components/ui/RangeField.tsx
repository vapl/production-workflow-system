"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

type RangeFieldProps = Omit<React.ComponentProps<"input">, "type" | "id"> & {
  id?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  labelClassName?: string;
  descriptionClassName?: string;
  wrapperClassName?: string;
};

export function RangeField({
  id,
  label,
  description,
  className,
  labelClassName,
  descriptionClassName,
  wrapperClassName,
  ...props
}: RangeFieldProps) {
  const generatedId = React.useId();
  const rangeId = id ?? `range-field-${generatedId}`;

  return (
    <div className={cn("space-y-2", wrapperClassName)}>
      {label ? (
        <label
          htmlFor={rangeId}
          className={cn("text-sm font-medium text-foreground", labelClassName)}
        >
          {label}
        </label>
      ) : null}
      <input
        id={rangeId}
        type="range"
        className={cn("w-full accent-primary", className)}
        {...props}
      />
      {description ? (
        <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      ) : null}
    </div>
  );
}

