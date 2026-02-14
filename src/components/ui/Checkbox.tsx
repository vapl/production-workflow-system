"use client";

import * as React from "react";
import { cn } from "@/components/ui/utils";

export type CheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  variant?: "toggle" | "box";
  label?: React.ReactNode;
  labelClassName?: string;
  inputClassName?: string;
  containerClassName?: string;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      id,
      checked,
      disabled,
      variant = "toggle",
      className,
      label,
      labelClassName,
      inputClassName,
      containerClassName,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? `checkbox-${generatedId}`;

    const control = (
      <span
        className={cn(
          variant === "toggle"
            ? "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors"
            : "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors",
          checked
            ? variant === "toggle"
              ? "bg-primary"
              : "border-primary bg-primary"
            : variant === "toggle"
              ? "bg-muted"
              : "",
          disabled ? "opacity-60" : "",
          className,
        )}
      >
        {variant === "toggle" ? (
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
              checked ? "translate-x-[1.25rem]" : "translate-x-0.5",
            )}
          />
        ) : (
          <span
            className={cn(
              "pointer-events-none h-3 w-3 rounded-[2px] bg-primary-foreground transition-opacity",
              checked ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer opacity-0",
            disabled ? "cursor-not-allowed" : "",
            inputClassName,
          )}
          {...props}
        />
      </span>
    );

    if (!label) {
      return control;
    }

    return (
      <label
        htmlFor={inputId}
        className={cn(
          "inline-flex items-center gap-2 text-sm",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          containerClassName,
        )}
      >
        {control}
        <span className={cn(labelClassName)}>{label}</span>
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
