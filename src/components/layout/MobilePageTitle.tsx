import { cn } from "@/components/ui/utils";

type MobilePageTitleProps = {
  title: string;
  showCompact: boolean;
  subtitle?: string;
  compactTitle?: string;
  className?: string;
};

export function MobilePageTitle({
  title,
  showCompact,
  subtitle,
  compactTitle,
  className,
}: MobilePageTitleProps) {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 md:hidden">
        <div className="container mx-auto px-4 pt-4">
          <div className="mx-16 flex justify-center">
            <div
              className={cn(
                "inline-flex h-9 max-w-full items-center rounded-full border border-border/80 bg-card/95 px-4 text-sm font-semibold shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-[opacity,transform] duration-200",
                showCompact ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
              )}
            >
              <span className="truncate">{compactTitle ?? title}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={cn("z-10 px-4 py-3 md:hidden", className)}>
        <div
          className={cn(
            "min-w-0 transition-[opacity,transform] duration-200",
            showCompact
              ? "pointer-events-none translate-y-1 opacity-0"
              : "translate-y-0 opacity-100",
          )}
        >
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
    </>
  );
}
