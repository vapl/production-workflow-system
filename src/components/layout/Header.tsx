"use client";

import { useEffect, useRef, useState } from "react";
import {
  BellIcon,
  ChevronDownIcon,
  FactoryIcon,
  HelpCircleIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import { useNotifications } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { isProductionRole } from "@/lib/auth/permissions";
import { useRbac } from "@/contexts/RbacContext";

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
};

export function Header() {
  const user = useCurrentUser();
  const { permissions } = useRbac();
  const { signOut } = useAuthActions();
  const { notify } = useNotifications();
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>(
    [],
  );
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("lv-LV", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    setCurrentDate(formatter.format(new Date()));
  }, []);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!notificationsRef.current) {
        return;
      }
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsHidden(currentY > 0);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!supabase || !user.isAuthenticated || !user.tenantId) {
      return;
    }
    let isMounted = true;
    const loadUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user.tenantId)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .is("read_at", null);
      if (!isMounted) {
        return;
      }
      if (typeof count === "number") {
        setUnreadCount(count);
      }
    };
    void loadUnread();
    const channel = supabase
      .channel(`notifications:${user.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          const next = payload.new as {
            user_id?: string | null;
            title?: string;
            body?: string | null;
          };
          if (next.user_id && next.user_id !== user.id) {
            return;
          }
          if (
            !user.isAdmin &&
            !isProductionRole(
              { role: user.role, isAdmin: user.isAdmin },
              permissions,
            )
          ) {
            return;
          }
          setUnreadCount((prev) => prev + 1);
          setNotificationItems((prev) => [
            {
              id: (payload.new as any).id,
              title: next.title ?? "Notification",
              body: next.body ?? null,
              created_at: (payload.new as any).created_at ?? new Date().toISOString(),
              read_at: null,
            },
            ...prev,
          ]);
          notify({
            title: next.title ?? "Notification",
            description: next.body ?? undefined,
            variant: "info",
          });
        },
      )
      .subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [
    notify,
    permissions,
    user.id,
    user.isAdmin,
    user.isAuthenticated,
    user.role,
    user.tenantId,
  ]);

  useEffect(() => {
    if (!supabase || !user.isAuthenticated || !user.tenantId) {
      return;
    }
    if (!notificationsOpen) {
      return;
    }
    let isMounted = true;
    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      setNotificationItems(data as NotificationItem[]);
    };
    void loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [notificationsOpen, user.isAuthenticated, user.tenantId]);

  const handleMarkAllRead = async () => {
    if (!supabase || !user.tenantId) {
      return;
    }
    const ids = notificationItems
      .filter((item) => !item.read_at)
      .map((item) => item.id);
    if (ids.length === 0) {
      return;
    }
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    setNotificationItems((prev) =>
      prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  };

  const handleMarkRead = async (id: string) => {
    if (!supabase) {
      return;
    }
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setNotificationItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const tenantInitials = (user.tenantName ?? "Company")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const userInitials = user.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-card shadow-sm transition-transform duration-200 ${
        isHidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {user.isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user.tenantLogoUrl ? (
                  <img
                    src={user.tenantLogoUrl}
                    alt={user.tenantName ?? "Company logo"}
                    className="h-9 w-9 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[13px] font-semibold text-foreground">
                    {tenantInitials}
                  </div>
                )}
                <div className="leading-tight">
                  <h1 className="text-lg font-semibold">
                    {user.tenantName ?? "Company workspace"}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Production Workflow System
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-primary p-2">
                  <FactoryIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="leading-tight">
                  <h1 className="text-lg font-semibold">
                    Production Workflow System
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Operational tool for manufacturing
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <div className="text-xs text-muted-foreground">
              Shift: Day | {currentDate ?? "--"}
            </div>

            <div className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Search"
              >
                <SearchIcon className="h-4 w-4" />
              </Button>
              <div className="relative" ref={notificationsRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  aria-label="Notifications"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                >
                  <BellIcon className="h-4 w-4" />
                </Button>
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
                {notificationsOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card p-2 shadow-lg">
                    <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
                      <span>Notifications</span>
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs text-foreground hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notificationItems.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No notifications yet.
                        </div>
                      ) : (
                        notificationItems.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => handleMarkRead(item.id)}
                            className={`flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left text-xs transition ${
                              item.read_at
                                ? "text-muted-foreground hover:bg-muted/40"
                                : "bg-muted/30 text-foreground hover:bg-muted/50"
                            }`}
                          >
                            <span className="font-medium">{item.title}</span>
                            {item.body ? <span>{item.body}</span> : null}
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="mt-2 border-t border-border pt-2 text-center text-xs">
                      <Link
                        href="/notifications"
                        className="text-foreground hover:underline"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        View all
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Help"
              >
                <HelpCircleIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              {user.loading ? (
                "Loading user..."
              ) : user.isAuthenticated ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-xs text-foreground"
                    onClick={() => setUserMenuOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                  >
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                        {userInitials}
                      </div>
                    )}
                    <span className="text-foreground">
                      {user.name} ({user.role}
                      {user.isAdmin && user.role !== "Owner" ? " / Admin" : ""})
                    </span>
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {userMenuOpen ? (
                    <div
                      className="absolute right-0 top-full z-9999 mt-2 min-w-45 rounded-md border border-border bg-card p-1 text-xs text-muted-foreground shadow-md"
                      role="menu"
                    >
                      <Link
                        href="/profile"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-none text-foreground hover:bg-muted/50"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      {user.isAdmin ? (
                        <Link
                          href="/company"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-none text-foreground hover:bg-muted/50"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          Company settings
                        </Link>
                      ) : null}
                      <div className="my-1 h-px bg-border" />
                      <ThemeToggle variant="menu" />
                      <div className="my-1 h-px bg-border" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-none text-foreground hover:bg-muted/50"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut();
                        }}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Button size="sm" asChild>
                  <Link href="/auth">Sign in</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
