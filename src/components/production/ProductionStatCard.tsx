import type { ReactNode } from "react";
import { KpiCard } from "@/components/ui/KpiCard";

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
  return (
    <KpiCard
      label={label}
      value={value}
      hint={hint}
      footer={footer}
      tone={tone}
      icon={icon}
    />
  );
}
