"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardListIcon,
  KanbanSquareIcon,
  Users2Icon,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/components/ui/utils";
import { useI18n } from "@/lib/i18n/useI18n";

export function ProductionSubnav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { t } = useI18n();

  const items = [
    {
      href: "/production/ready",
      label: t("production.main.subnav.ready"),
      icon: ClipboardListIcon,
      match: (currentPathname: string) =>
        currentPathname.startsWith("/production/ready"),
    },
    {
      href: "/production/queues",
      label: t("production.main.subnav.queues"),
      icon: KanbanSquareIcon,
      match: (currentPathname: string) =>
        currentPathname.startsWith("/production/queues"),
    },
    {
      href: "/production/operators",
      label: t("production.main.subnav.operators"),
      icon: Users2Icon,
      match: (currentPathname: string) =>
        currentPathname.startsWith("/production/operators"),
    },
  ];

  const activeItem = items.find((item) => item.match(pathname)) ?? items[0];

  return (
    <Tabs
      value={activeItem.href}
      onValueChange={(value) => {
        if (value && value !== pathname) {
          router.push(value);
        }
      }}
      className={cn("w-full", className)}
    >
      <div className="min-w-0 overflow-x-auto py-1">
        <TabsList className="min-w-max h-9 shadow-sm **:data-[slot=tabs-trigger]:h-7 **:data-[slot=tabs-trigger]:py-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger key={item.href} value={item.href} className="gap-2">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <nav className="sr-only">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </Tabs>
  );
}
