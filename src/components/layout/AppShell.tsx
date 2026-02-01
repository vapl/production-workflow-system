"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { TabsNav } from "@/components/layout/TabsNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser } from "@/contexts/UserContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname?.startsWith("/auth");

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

  if (!user.isAuthenticated && isAuthRoute) {
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
      <Header />
      <div className="flex min-h-screen items-start justify-center bg-background font-sans text-foreground">
        <main className="container mx-auto px-4 py-6">
          <div className="flex justify-between">
            <TabsNav />
            <ThemeToggle />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
