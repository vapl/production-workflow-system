import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/components/ui/utils";

type DetailTabsBarTab = {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type DetailTabsBarProps = {
  backHref?: string;
  backLabel?: string;
  tabs: DetailTabsBarTab[];
  disabled?: boolean;
  className?: string;
};

export function DetailTabsBar({
  backHref,
  backLabel,
  tabs,
  disabled = false,
  className,
}: DetailTabsBarProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 overflow-hidden py-3",
        className,
      )}
    >
      {backHref && backLabel && (
        <Link
          href={backHref}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-(--tabs-border) bg-(--tabs-bg) px-3 text-sm font-medium text-(--tabs-text) shadow-sm transition hover:text-(--tabs-hover-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tabs-ring)"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="min-w-0 flex-1 overflow-x-hidden py-1">
        <TabsList className="min-w-max h-9 shadow-sm **:data-[slot=tabs-trigger]:h-7 **:data-[slot=tabs-trigger]:py-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={disabled || tab.disabled}
              className={tab.icon ? "gap-2" : undefined}
            >
              {tab.icon ? <tab.icon className="h-4 w-4" /> : null}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  );
}
