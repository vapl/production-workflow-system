"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { TabsNav } from "@/components/layout/TabsNav";
import { useCurrentUser } from "@/contexts/UserContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname?.startsWith("/auth");
  const hideTabsNav =
    pathname?.startsWith("/profile") ||
    pathname?.startsWith("/company") ||
    pathname?.startsWith("/production/operator");
  const hideHeader = pathname?.startsWith("/production/operator");

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
    if (!user.loading && !user.isAuthenticated && !isAuthRoute) {
      router.replace("/auth");
    }
  }, [user.loading, user.isAuthenticated, isAuthRoute, router]);

  if (user.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  if (!user.isAuthenticated && !isAuthRoute) {
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

  return (
    <>
      {hideHeader ? null : <Header />}
      {!hideTabsNav ? (
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur">
          <div className="container mx-auto px-4 py-3">
            <TabsNav />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-screen items-start justify-center bg-background font-sans text-foreground">
        <main className="container mx-auto px-4 py-6">{children}</main>
      </div>
    </>
  );
}
