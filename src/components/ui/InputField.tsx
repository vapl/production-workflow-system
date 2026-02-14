"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/Input";
import { cn } from "@/components/ui/utils";

type InputFieldProps = Omit<InputProps, "id"> & {
  id?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function InputField({
  id,
  label,
  description,
  error,
  required,
  labelClassName,
  descriptionClassName,
  errorClassName,
  wrapperClassName,
  ...inputProps
}: InputFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? `input-field-${generatedId}`;

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
      <Input
        id={inputId}
        required={required}
        wrapperClassName={wrapperClassName}
        {...inputProps}
      />
      {description ? (
        <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className={cn("text-xs text-destructive", errorClassName)}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
