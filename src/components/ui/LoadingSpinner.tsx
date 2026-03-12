"use client";

import { cn } from "./utils";

export function LoadingSpinner({
  className,
  label = "Loading",
  labelClassName,
  spinnerClassName,
}: {
  className?: string;
  label?: string;
  labelClassName?: string;
  spinnerClassName?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <div
        className={cn(
          "h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent",
          spinnerClassName,
        )}
      />
      <span className={cn("text-sm text-muted-foreground", labelClassName)}>
        {label}
      </span>
    </div>
  );
}
