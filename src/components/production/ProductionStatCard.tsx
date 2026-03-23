import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";

export function ProductionStatCard({
  label,
  value,
  hint,
  footer,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
  icon?: ReactNode;
}) {
  const valueClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-foreground";

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </div>
            <div className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</div>
            {hint ? (
              <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
            ) : null}
            {footer ? <div className="mt-3">{footer}</div> : null}
          </div>
          {icon ? (
            <div className="rounded-xl border border-border bg-muted/30 p-2 text-muted-foreground">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
