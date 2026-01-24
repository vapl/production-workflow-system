"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  PackageIcon,
  FactoryIcon,
  SettingsIcon,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const tabs = [
  {
    value: "dashboard",
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboardIcon,
  },
  { value: "orders", href: "/orders", label: "Orders", icon: PackageIcon },
  {
    value: "production",
    href: "/production",
    label: "Production",
    icon: FactoryIcon,
  },
  {
    value: "settings",
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
  },
];

export function TabsNav() {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab =
    tabs.find((t) =>
      t.href === "/"
        ? pathname === "/"
        : pathname.startsWith(t.href),
    )?.value ?? "dashboard";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const tab = tabs.find((t) => t.value === value);
        if (tab) router.push(tab.href);
      }}
    >
      <TabsList className="mb-6">
        {tabs.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="gap-2">
            <Icon className="w-4 h-4" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
