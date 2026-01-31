"use client";

import { cn } from "./utils";

export function LoadingSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
