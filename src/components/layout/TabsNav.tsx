"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  PackageIcon,
  FactoryIcon,
  SettingsIcon,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useRbac } from "@/contexts/RbacContext";

const mainTabs = [
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
];

const settingsTab = {
  value: "settings",
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};

export function TabsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useRbac();

  const visibleMainTabs = mainTabs.filter((tab) => {
    if (tab.value === "dashboard") {
      return hasPermission("dashboard.view");
    }
    if (tab.value === "production") {
      return hasPermission("production.view");
    }
    return true;
  });
  const showSettings = hasPermission("settings.view");
  const tabs = showSettings ? [...visibleMainTabs, settingsTab] : visibleMainTabs;

  const activeTab =
    tabs.find((t) =>
      t.href === "/"
        ? pathname === "/"
        : pathname.startsWith(t.href),
    )?.value ?? visibleMainTabs[0]?.value ?? settingsTab.value;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const tab = tabs.find((t) => t.value === value);
        if (tab) router.push(tab.href);
      }}
      className="w-full"
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        <TabsList>
          {visibleMainTabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="w-4 h-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {showSettings ? (
          <TabsList className="ml-auto">
            <TabsTrigger value={settingsTab.value} className="gap-2">
              <SettingsIcon className="w-4 h-4" />
              {settingsTab.label}
            </TabsTrigger>
          </TabsList>
        ) : null}
      </div>
    </Tabs>
  );
}
