"use client";

import { useEffect, useState } from "react";
import { FactoryIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import Link from "next/link";

export function Header() {
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const [currentDate, setCurrentDate] = useState<string | null>(null);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("lv-LV", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    setCurrentDate(formatter.format(new Date()));
  }, []);

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
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user.isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user.tenantLogoUrl ? (
                  <img
                    src={user.tenantLogoUrl}
                    alt={user.tenantName ?? "Company logo"}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                    {tenantInitials}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-semibold">
                    {user.tenantName ?? "Company workspace"}
                  </h1>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-primary p-2">
                  <FactoryIcon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">
                    Production Workflow System
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Operational tool for manufacturing
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <div className="text-xs text-muted-foreground">
              Shift: Day | {currentDate ?? "--"}
            </div>

            <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {user.loading ? (
                "Loading user..."
              ) : user.isAuthenticated ? (
                <div className="flex items-center gap-2">
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
                    {user.isAdmin ? " / Admin" : ""})
                  </span>
                  <Link
                    href="/profile"
                    className="text-xs text-muted-foreground underline"
                  >
                    Profile
                  </Link>
                  <Button variant="ghost" size="sm" onClick={signOut}>
                    Sign out
                  </Button>
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
