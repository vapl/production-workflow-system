import { cn } from "@/components/ui/utils";
import type { ReactNode } from "react";

type MobilePageTitleProps = {
  title: string;
  showCompact: boolean;
  subtitle?: string;
  compactTitle?: string;
  className?: string;
  rightAction?: ReactNode;
};

export function MobilePageTitle({
  title,
  showCompact,
  subtitle,
  compactTitle,
  className,
  rightAction,
}: MobilePageTitleProps) {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 md:hidden">
        <div className="container mx-auto px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="relative mx-16 flex justify-center">
            <div
              className={cn(
                "inline-flex h-9 max-w-full items-center rounded-full border border-border/80 bg-card/95 px-4 text-sm font-semibold shadow-md backdrop-blur supports-backdrop-filter:bg-card/80 transition-[opacity,transform] duration-200",
                showCompact
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-1 opacity-0",
              )}
            >
              <span className="truncate">{compactTitle ?? title}</span>
            </div>
            {rightAction ? (
              <div
                className={cn(
                  "pointer-events-auto absolute -right-16 top-1/2 -translate-y-1/2 transition-[opacity,transform] duration-200",
                  showCompact
                    ? "translate-y-[-50%] opacity-100"
                    : "pointer-events-none translate-y-[-46%] opacity-0",
                )}
              >
                {rightAction}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn("z-10 px-4 pb-3 md:hidden", className)}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "min-w-0 transition-[opacity,transform] duration-200",
              showCompact
                ? "pointer-events-none translate-y-1 opacity-0"
                : "translate-y-0 opacity-100",
            )}
          >
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {rightAction ? (
            <div
              className={cn(
                "shrink-0 transition-[opacity,transform] duration-200",
                showCompact
                  ? "pointer-events-none translate-y-1 opacity-0"
                  : "translate-y-0 opacity-100",
              )}
            >
              {rightAction}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
