"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  MenuIcon,
  PackageIcon,
  FactoryIcon,
  SettingsIcon,
  UserIcon,
  Building2Icon,
  LogOutIcon,
  XIcon,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { TabsNav } from "@/components/layout/TabsNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  canAccessRoute,
  isAdminLike,
  isProductionWorker,
} from "@/lib/auth/permissions";
import { useRbac } from "@/contexts/RbacContext";
import { cn } from "@/components/ui/utils";
import { useI18n } from "@/lib/i18n/useI18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const { permissions, hasPermission, loading: rbacLoading } = useRbac();
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isDesktopTabsVisible, setIsDesktopTabsVisible] = useState(true);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const lastScrollYRef = useRef(0);
  const lastTabsToggleYRef = useRef(0);
  const isAuthRoute = pathname?.startsWith("/auth");
  const isExternalJobRespondRoute = pathname?.startsWith(
    "/external-jobs/respond/",
  );
  const isPublicRoute = isAuthRoute || isExternalJobRespondRoute;
  const hasAdminAccess = isAdminLike(user);
  const isWarehouseUser = user.role === "Warehouse" && !hasAdminAccess;
  const isOrderDetailRoute = /^\/orders\/[^/]+$/.test(pathname ?? "");
  const isProductionJobDetailRoute = /^\/production\/jobs\/[^/]+$/.test(
    pathname ?? "",
  );
  const isProductionQueuesRoute = pathname?.startsWith("/production/queues");
  const hideTabsNav =
    isExternalJobRespondRoute ||
    isOrderDetailRoute ||
    isProductionJobDetailRoute ||
    isProductionQueuesRoute ||
    pathname?.startsWith("/profile") ||
    pathname?.startsWith("/company") ||
    (pathname?.startsWith("/production/operator") && !isWarehouseUser);
  const hideHeader =
    isExternalJobRespondRoute ||
    isProductionQueuesRoute ||
    pathname?.startsWith("/production/operator");
  const canViewDashboard = hasPermission("dashboard.view");
  const canViewProduction = hasPermission("production.view");
  const canViewProductionOperator = hasPermission("production.operator.view");
  const canViewSettings = hasPermission("settings.view");
  const canViewCompany = user.isAdmin;
  const canUsePullToRefresh = () =>
    window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1180;

  const drawerNavItems = useMemo(
    () =>
      isWarehouseUser
        ? ([
            {
              href: "/orders",
              label: t("appShell.orders"),
              icon: PackageIcon,
            },
            {
              href: "/warehouse/queue",
              label: t("appShell.queue"),
              icon: FactoryIcon,
            },
            {
              href: "/warehouse/external",
              label: t("appShell.external"),
              icon: FactoryIcon,
            },
          ] as Array<{
            href: string;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }>)
        : ([
            canViewDashboard
              ? {
                  href: "/dashboard",
                  label: t("appShell.dashboard"),
                  icon: LayoutDashboardIcon,
                }
              : null,
            {
              href: "/orders",
              label: t("appShell.orders"),
              icon: PackageIcon,
            },
            canViewProduction
              ? {
                  href: "/production/ready",
                  label: t("appShell.production"),
                  icon: FactoryIcon,
                }
              : canViewProductionOperator
                ? {
                    href: "/production/operator",
                    label: t("appShell.production"),
                    icon: FactoryIcon,
                  }
                : null,
            canViewSettings
              ? {
                  href: "/settings",
                  label: t("appShell.settings"),
                  icon: SettingsIcon,
                }
              : null,
          ].filter(Boolean) as Array<{
            href: string;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }>),
    [
      canViewDashboard,
      canViewProduction,
      canViewProductionOperator,
      canViewSettings,
      isWarehouseUser,
      t,
    ],
  );

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      const message = event.error?.message ?? event.message ?? "";
      if (
        event.error?.name === "AbortError" ||
        message.includes("signal is aborted without reason")
      ) {
        event.preventDefault();
      }
    };
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string; name?: string } | null;
      if (
        reason?.name === "AbortError" ||
        reason?.message?.includes("signal is aborted without reason")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", handler);
    return () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", handler);
    };
  }, []);

  useEffect(() => {
    if (!isMobileDrawerOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileDrawerOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileDrawerOpen]);

  useEffect(() => {
    if (hideHeader) {
      return;
    }
    const handleTouchStart = (event: TouchEvent) => {
      if (isMobileDrawerOpen || window.innerWidth >= 768) {
        return;
      }
      const touch = event.touches[0];
      if (!touch || touch.clientX > 24) {
        return;
      }
      swipeStartX.current = touch.clientX;
      swipeStartY.current = touch.clientY;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (isMobileDrawerOpen || window.innerWidth >= 768) {
        return;
      }
      const startX = swipeStartX.current;
      const startY = swipeStartY.current;
      const touch = event.changedTouches[0];
      swipeStartX.current = null;
      swipeStartY.current = null;
      if (!touch || startX === null || startY === null) {
        return;
      }
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaX > 72 && deltaY < 48) {
        setIsMobileDrawerOpen(true);
      }
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [hideHeader, isMobileDrawerOpen]);

  useEffect(() => {
    if (hideTabsNav) {
      lastScrollYRef.current = 0;
      lastTabsToggleYRef.current = 0;
      return;
    }

    const handleScroll = () => {
      if (window.innerWidth < 768) {
        if (!isDesktopTabsVisible) {
          setIsDesktopTabsVisible(true);
        }
        lastScrollYRef.current = window.scrollY;
        lastTabsToggleYRef.current = window.scrollY;
        return;
      }

      const currentY = window.scrollY;

      if (lastScrollYRef.current === 0 && lastTabsToggleYRef.current === 0) {
        lastScrollYRef.current = currentY;
        lastTabsToggleYRef.current = currentY;
      }

      if (currentY <= 16) {
        if (!isDesktopTabsVisible) {
          setIsDesktopTabsVisible(true);
        }
        lastTabsToggleYRef.current = currentY;
      } else if (
        isDesktopTabsVisible &&
        currentY - lastTabsToggleYRef.current > 120
      ) {
        setIsDesktopTabsVisible(false);
        lastTabsToggleYRef.current = currentY;
      } else if (
        !isDesktopTabsVisible &&
        lastTabsToggleYRef.current - currentY > 96
      ) {
        setIsDesktopTabsVisible(true);
        lastTabsToggleYRef.current = currentY;
      }

      lastScrollYRef.current = currentY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [hideTabsNav, isDesktopTabsVisible]);

  useEffect(() => {
    const finishRefresh = () => {
      window.setTimeout(() => {
        setIsPullRefreshing(false);
      }, 600);
    };
    const handleAppRefresh = () => {
      setIsPullRefreshing(true);
      router.refresh();
      finishRefresh();
    };

    window.addEventListener("pws:pull-refresh", handleAppRefresh);
    return () => {
      window.removeEventListener("pws:pull-refresh", handleAppRefresh);
    };
  }, [router]);

  useEffect(() => {
    const threshold = 72;
    const maxDistance = 96;
    const reset = () => {
      pullStartYRef.current = null;
      setPullDistance(0);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (!canUsePullToRefresh() || isMobileDrawerOpen || isPullRefreshing) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) {
        return;
      }
      if (window.scrollY > 0) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      pullStartYRef.current = touch.clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const startY = pullStartYRef.current;
      if (startY == null || isPullRefreshing) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const delta = touch.clientY - startY;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      const damped = Math.min(maxDistance, delta * 0.55);
      setPullDistance(damped);
      if (delta > 8 && event.cancelable) {
        event.preventDefault();
      }
    };
    const handleTouchEnd = () => {
      const shouldRefresh = pullDistance >= threshold;
      reset();
      if (!shouldRefresh || isPullRefreshing) {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("pws:pull-refresh", {
          detail: { pathname },
        }),
      );
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isMobileDrawerOpen, isPullRefreshing, pathname, pullDistance]);

  useEffect(() => {
    if (!user.loading && !user.isAuthenticated && !isPublicRoute) {
      router.replace("/auth");
    }
  }, [user.loading, user.isAuthenticated, isPublicRoute, router]);

  useEffect(() => {
    if (
      user.loading ||
      !user.isAuthenticated ||
      user.tenantId ||
      !user.requiresPasswordSetup
    ) {
      return;
    }
    if (!isAuthRoute) {
      router.replace("/auth?invite=1");
    }
  }, [
    isAuthRoute,
    router,
    user.isAuthenticated,
    user.loading,
    user.requiresPasswordSetup,
    user.tenantId,
  ]);

  useEffect(() => {
    if (
      user.loading ||
      !user.isAuthenticated ||
      user.tenantId ||
      !user.requiresPasswordSetup ||
      isAuthRoute
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      window.location.replace("/auth?invite=1");
    }, 1200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAuthRoute,
    user.isAuthenticated,
    user.loading,
    user.requiresPasswordSetup,
    user.tenantId,
  ]);

  useEffect(() => {
    if (user.loading || !user.isAuthenticated || isPublicRoute || !pathname) {
      return;
    }
    if (rbacLoading) {
      return;
    }
    const authUser = {
      role: user.role,
      isAdmin: user.isAdmin,
      isOwner: user.isOwner,
    };
    const route =
      pathname === "/" || pathname.startsWith("/dashboard")
        ? "/dashboard"
        : pathname.startsWith("/settings")
          ? "/settings"
          : pathname.startsWith("/qr/")
            ? "/orders"
            : pathname.startsWith("/production/operator")
              ? "/production/operator"
              : pathname.startsWith("/production")
                ? "/production"
                : pathname.startsWith("/warehouse")
                  ? "/warehouse"
                  : pathname.startsWith("/company")
                    ? "/company"
                    : pathname.startsWith("/orders")
                      ? "/orders"
                      : null;
    if (!route) {
      return;
    }
    if (!canAccessRoute(route, authUser, permissions)) {
      const canUseOperatorFallback = canAccessRoute(
        "/production/operator",
        authUser,
        permissions,
      );
      const fallbackRoute = isWarehouseUser
        ? "/warehouse/queue"
        : isProductionWorker(authUser) || canUseOperatorFallback
          ? "/production/operator"
          : "/orders";
      if (pathname !== fallbackRoute) {
        router.replace(fallbackRoute);
      }
    }
  }, [
    isPublicRoute,
    pathname,
    permissions,
    router,
    isWarehouseUser,
    user.isAuthenticated,
    user.isAdmin,
    user.isOwner,
    user.loading,
    user.role,
    rbacLoading,
  ]);

  if (isExternalJobRespondRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (user.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  if (!user.isAuthenticated && !isPublicRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner label="Redirecting..." />
      </div>
    );
  }

  if (isAuthRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (user.isAuthenticated && !user.tenantId) {
    if (user.requiresPasswordSetup) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner label="Redirecting to invite setup..." />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/auth?invite=1";
              }}
            >
              Open invite setup
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Account pending</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is not linked to a company yet. Please ask your
            administrator for an invite or complete owner sign-up.
          </p>
        </div>
      </div>
    );
  }

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
  const pullProgress = Math.min(1, pullDistance / 72);
  return (
    <>
      {pullDistance > 0 || isPullRefreshing ? (
        <div
          className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.4rem)] z-50 -translate-x-1/2"
          style={{
            opacity: isPullRefreshing ? 1 : pullProgress,
            transform: `translate(-50%, ${isPullRefreshing ? 0 : (1 - pullProgress) * -8}px)`,
          }}
        >
          <div className="rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-md backdrop-blur supports-backdrop-filter:bg-card/80">
            {isPullRefreshing
              ? "Refreshing..."
              : pullDistance >= 72
                ? "Release to refresh"
                : "Pull to refresh"}
          </div>
        </div>
      ) : null}
      {hideHeader ? null : (
        <div className="hidden md:block">
          <Header />
        </div>
      )}
      {hideHeader ? null : (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 md:hidden">
          <div className="container mx-auto px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileDrawerOpen(true)}
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={isMobileDrawerOpen}
                aria-controls="global-mobile-drawer"
              >
                <MenuIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {hideHeader ? null : (
        <>
          <SideDrawer
            id="global-mobile-drawer"
            open={isMobileDrawerOpen}
            onClose={() => setIsMobileDrawerOpen(false)}
            ariaLabel="Navigation menu"
            closeButtonLabel="Close menu"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex items-center gap-3">
                {user.tenantLogoUrl ? (
                  <img
                    src={user.tenantLogoUrl}
                    alt={user.tenantName ?? "Company logo"}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                    {tenantInitials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {user.tenantName ?? t("header.companyWorkspace")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("header.appName")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setIsMobileDrawerOpen(false)}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-b border-border p-4">
              <div className="flex items-center gap-3">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {userInitials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.role}
                    {user.isOwner ? " / Owner" : user.isAdmin ? " / Admin" : ""}
                  </p>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {drawerNavItems.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === "/dashboard"
                      ? pathname === "/" || pathname?.startsWith("/dashboard")
                      : pathname?.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="space-y-3 border-t border-border p-3">
              <div className="space-y-1">
                <Link
                  href="/profile"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-muted/60"
                >
                  <UserIcon className="h-4 w-4" />
                  {t("appShell.profileSettings")}
                </Link>
                {canViewCompany ? (
                  <Link
                    href="/company"
                    onClick={() => setIsMobileDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-muted/60"
                  >
                    <Building2Icon className="h-4 w-4" />
                    {t("header.companySettings")}
                  </Link>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <ThemeToggle className="w-full justify-center" />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    void signOut();
                  }}
                >
                  <LogOutIcon className="h-4 w-4" />
                  {t("header.signOut")}
                </Button>
              </div>
            </div>
          </SideDrawer>
        </>
      )}
      {!hideTabsNav ? (
        <div
          className={cn(
            "sticky top-0 z-30 w-full overflow-hidden transition-[transform,opacity,padding,margin] duration-200 ease-out md:bg-app-surface",
            isDesktopTabsVisible || hideTabsNav
              ? "translate-y-0 opacity-100 md:mb-0"
              : "-translate-y-full opacity-0 md:-mb-16",
          )}
        >
          <div
            className={cn(
              "container mx-auto w-full px-0 py-0 transition-[padding] duration-200 ease-out md:px-4",
              isDesktopTabsVisible || hideTabsNav ? "md:py-3" : "md:py-0",
            )}
          >
            <TabsNav />
          </div>
        </div>
      ) : null}
      <div
        className="flex min-h-screen w-full items-start justify-center overflow-x-clip bg-app-surface font-sans text-foreground"
        style={
          {
            "--desktop-tabs-offset":
              hideTabsNav || !isDesktopTabsVisible ? "0rem" : "4rem",
          } as React.CSSProperties
        }
      >
        <main
          className={cn(
            "container mx-auto px-4 py-0 pb-8",
            isProductionQueuesRoute &&
              "md:flex md:h-[100dvh] md:max-h-[100dvh] md:flex-col md:overflow-hidden md:pb-0",
            hideHeader ? null : "",
            hideTabsNav
              ? null
              : "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6",
          )}
        >
          {children}
        </main>
      </div>
    </>
  );
}
