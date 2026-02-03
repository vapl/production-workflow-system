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
import Link from "next/link";

export function Header() {
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
    <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Notifications"
              >
                <BellIcon className="h-4 w-4" />
              </Button>
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
                      {user.isAdmin ? " / Admin" : ""})
                    </span>
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {userMenuOpen ? (
                    <div
                      className="absolute right-0 top-full z-20 mt-2 min-w-[180px] rounded-md border border-border bg-card p-1 text-xs text-muted-foreground shadow-md"
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
