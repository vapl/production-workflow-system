"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BellIcon,
  LayoutDashboardIcon,
  PackageIcon,
  FactoryIcon,
  SettingsIcon,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useRbac } from "@/contexts/RbacContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/components/ui/utils";

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

const notificationsTab = {
  value: "notifications",
  href: "/notifications",
  label: "Notifications",
  icon: BellIcon,
};

export function TabsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useRbac();
  const user = useCurrentUser();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.isAuthenticated || !user.tenantId) {
      return;
    }
    let isMounted = true;
    const loadUnread = async () => {
      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user.tenantId)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .is("read_at", null);
      if (!isMounted) {
        return;
      }
      setUnreadCount(typeof count === "number" ? count : 0);
    };

    void loadUnread();
    const channel = sb
      .channel(`notifications-mobile:${user.tenantId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        () => {
          void loadUnread();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      sb.removeChannel(channel);
    };
  }, [user.id, user.isAuthenticated, user.tenantId]);

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
  const desktopTabs = showSettings
    ? [...visibleMainTabs, settingsTab]
    : visibleMainTabs;
  const mobileTabs = showSettings
    ? [...visibleMainTabs, notificationsTab, settingsTab]
    : [...visibleMainTabs, notificationsTab];

  const activeDesktopTab =
    desktopTabs.find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
    )?.value ??
    visibleMainTabs[0]?.value ??
    settingsTab.value;

  return (
    <>
      <Tabs
        value={activeDesktopTab}
        onValueChange={(value) => {
          const tab = desktopTabs.find((t) => t.value === value);
          if (tab) router.push(tab.href);
        }}
        className="hidden w-full md:flex"
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <TabsList>
            {visibleMainTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {showSettings ? (
            <TabsList className="ml-auto">
              <TabsTrigger value={settingsTab.value} className="gap-2">
                <SettingsIcon className="h-4 w-4" />
                {settingsTab.label}
              </TabsTrigger>
            </TabsList>
          ) : null}
        </div>
      </Tabs>

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="rounded-2xl border border-border/80 bg-background/95 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80">
          <ul
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))`,
            }}
          >
            {mobileTabs.map(({ value, href, label, icon: Icon }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => router.push(href)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-15 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="relative inline-flex">
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5",
                          isActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                      {value === "notifications" && unreadCount > 0 ? (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
