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
import { canAccessRoute, isProductionWorker } from "@/lib/auth/permissions";
import { useRbac } from "@/contexts/RbacContext";
import { cn } from "@/components/ui/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const { permissions, hasPermission } = useRbac();
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const isAuthRoute = pathname?.startsWith("/auth");
  const isExternalJobRespondRoute = pathname?.startsWith(
    "/external-jobs/respond/",
  );
  const isPublicRoute = isAuthRoute || isExternalJobRespondRoute;
  const hideTabsNav =
    isExternalJobRespondRoute ||
    pathname?.startsWith("/profile") ||
    pathname?.startsWith("/company") ||
    pathname?.startsWith("/production/operator");
  const hideHeader =
    isExternalJobRespondRoute || pathname?.startsWith("/production/operator");
  const canViewDashboard = hasPermission("dashboard.view");
  const canViewProduction = hasPermission("production.view");
  const canViewSettings = hasPermission("settings.view");
  const canViewCompany = user.isAdmin;

  const drawerNavItems = useMemo(
    () =>
      [
        canViewDashboard
          ? {
              href: "/",
              label: "Dashboard",
              icon: LayoutDashboardIcon,
            }
          : null,
        {
          href: "/orders",
          label: "Orders",
          icon: PackageIcon,
        },
        canViewProduction
          ? {
              href: "/production",
              label: "Production",
              icon: FactoryIcon,
            }
          : null,
        canViewSettings
          ? {
              href: "/settings",
              label: "Settings",
              icon: SettingsIcon,
            }
          : null,
      ].filter(Boolean) as Array<{
        href: string;
        label: string;
        icon: React.ComponentType<{ className?: string }>;
      }>,
    [canViewDashboard, canViewProduction, canViewSettings],
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
    const threshold = 72;
    const maxDistance = 96;
    const reset = () => {
      pullStartYRef.current = null;
      setPullDistance(0);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (window.innerWidth >= 768 || isMobileDrawerOpen || isPullRefreshing) {
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
      setIsPullRefreshing(true);
      router.refresh();
      window.setTimeout(() => {
        window.location.reload();
      }, 120);
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
  }, [isMobileDrawerOpen, isPullRefreshing, pullDistance, router]);

  useEffect(() => {
    if (!user.loading && !user.isAuthenticated && !isPublicRoute) {
      router.replace("/auth");
    }
  }, [user.loading, user.isAuthenticated, isPublicRoute, router]);

  useEffect(() => {
    if (user.loading || !user.isAuthenticated || isPublicRoute || !pathname) {
      return;
    }
    const authUser = {
      role: user.role,
      isAdmin: user.isAdmin,
      isOwner: user.isOwner,
    };
    const route =
      pathname === "/"
        ? "/"
        : pathname.startsWith("/settings")
          ? "/settings"
          : pathname.startsWith("/qr/")
            ? "/orders"
          : pathname.startsWith("/production/operator")
            ? "/production/operator"
            : pathname.startsWith("/production")
              ? "/production"
              : pathname.startsWith("/company")
                ? "/company"
                : pathname.startsWith("/orders")
                  ? "/orders"
                  : null;
    if (!route) {
      return;
    }
    if (!canAccessRoute(route, authUser, permissions)) {
      const fallbackRoute = isProductionWorker(authUser)
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
    user.isAuthenticated,
    user.isAdmin,
    user.isOwner,
    user.loading,
    user.role,
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
          className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.4rem)] z-50 -translate-x-1/2 md:hidden"
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
                    {user.tenantName ?? "Company workspace"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Production Workflow System
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
                    href === "/"
                      ? pathname === "/"
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
                  Profile settings
                </Link>
                {canViewCompany ? (
                  <Link
                    href="/company"
                    onClick={() => setIsMobileDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-muted/60"
                  >
                    <Building2Icon className="h-4 w-4" />
                    Company settings
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
                  Sign out
                </Button>
              </div>
            </div>
          </SideDrawer>
        </>
      )}
      {!hideTabsNav ? (
        <div className="sticky top-0 z-30 w-full md:bg-background">
          <div className="container mx-auto w-full px-0 py-0 md:px-4 md:py-3">
            <TabsNav />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-screen w-full items-start justify-center overflow-x-clip bg-background font-sans text-foreground">
        <main
          className={`container mx-auto px-4 py-6 ${
            hideTabsNav
              ? ""
              : "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6"
          }`}
        >
          {children}
        </main>
      </div>
    </>
  );
}
