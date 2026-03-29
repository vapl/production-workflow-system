import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";

export type KpiCardTone = "default" | "danger" | "success" | "warning";

function getToneClasses(tone: KpiCardTone) {
  switch (tone) {
    case "danger":
      return {
        value: "text-destructive",
        icon: "text-destructive/80",
      };
    case "success":
      return {
        value: "text-emerald-700",
        icon: "text-emerald-700/80",
      };
    case "warning":
      return {
        value: "text-amber-700",
        icon: "text-amber-700/80",
      };
    default:
      return {
        value: "text-foreground",
        icon: "text-muted-foreground",
      };
  }
}

export function KpiCard({
  label,
  value,
  hint,
  footer,
  tone = "default",
  icon,
  className = "",
  valueClassName = "",
  labelClassName = "",
  hintClassName = "",
  contentClassName = "",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  tone?: KpiCardTone;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
  contentClassName?: string;
}) {
  const toneClasses = getToneClasses(tone);

  return (
    <Card className={`border-border/80 shadow-sm ${className}`.trim()}>
      <CardContent className={`h-full pt-5 pb-3! ${contentClassName}`.trim()}>
        <div className="flex h-full items-stretch justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex h-full min-h-[96px] flex-col justify-between gap-3">
              <div
                className={`text-xs uppercase tracking-[0.12em] text-muted-foreground ${labelClassName}`.trim()}
              >
                {label}
              </div>
              <div className="flex flex-1 items-center">
                <div
                  className={`text-2xl font-semibold ${toneClasses.value} ${valueClassName}`.trim()}
                >
                  {value}
                </div>
              </div>
              <div className="min-h-4">
                {hint ? (
                  <div
                    className={`text-xs text-muted-foreground ${hintClassName}`.trim()}
                  >
                    {hint}
                  </div>
                ) : null}
                {footer ? (
                  <div className={hint ? "mt-3" : ""}>{footer}</div>
                ) : null}
              </div>
            </div>
          </div>
          {icon ? (
            <div
              className={`self-start rounded-xl border border-border bg-muted/30 p-2 ${toneClasses.icon}`.trim()}
            >
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
