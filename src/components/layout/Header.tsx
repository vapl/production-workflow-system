"use client";

import { useEffect, useState } from "react";
import { FactoryIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import Link from "next/link";

export function Header() {
  const user = useCurrentUser();
  const { signOut, signInWithMagicLink } = useAuthActions();
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [currentDate, setCurrentDate] = useState<string | null>(null);

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString());
  }, []);

  async function handleSignIn() {
    const trimmed = email.trim();
    if (!trimmed) {
      setAuthMessage("Enter your email.");
      return;
    }
    setIsSending(true);
    setAuthMessage(null);
    const error = await signInWithMagicLink(trimmed);
    if (error) {
      setAuthMessage(error);
    } else {
      setAuthMessage("Check your email for the magic link.");
    }
    setIsSending(false);
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <div>
              <div className="text-sm font-medium">
                {user.tenantName ?? "Company workspace"}
              </div>
              <div className="text-xs text-muted-foreground">
                Shift: Day | {currentDate ?? "--"}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {user.loading ? (
                "Loading user..."
              ) : user.isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <span className="text-foreground">
                    {user.name} ({user.role})
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
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="h-8 w-40 rounded-md border border-border bg-input-background px-2 text-xs text-foreground"
                  />
                  <Button
                    size="sm"
                    onClick={handleSignIn}
                    disabled={isSending}
                  >
                    {isSending ? "Sending..." : "Magic link"}
                  </Button>
                  {authMessage && (
                    <span className="text-[11px] text-muted-foreground">
                      {authMessage}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
