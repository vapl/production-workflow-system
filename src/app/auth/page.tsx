"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";

export default function AuthPage() {
  const { signInWithMagicLink } = useAuthActions();
  const user = useCurrentUser();
  const router = useRouter();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user.isAuthenticated) {
      router.replace("/orders");
    }
  }, [user.isAuthenticated, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage("Enter a valid email.");
      return;
    }
    if (tab === "signup") {
      if (!companyName.trim()) {
        setStatus("error");
        setMessage("Company name is required.");
        return;
      }
      try {
        window.localStorage.setItem(
          "pws_signup",
          JSON.stringify({
            fullName: fullName.trim(),
            companyName: companyName.trim(),
          }),
        );
      } catch {
        // ignore localStorage failures
      }
    }
    setStatus("sending");
    setMessage("");
    const error = await signInWithMagicLink(trimmed, {
      mode: tab === "signup" ? "signup" : "signin",
      companyName: tab === "signup" ? companyName.trim() : undefined,
    });
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    setStatus("sent");
    setMessage("Magic link sent. Check your email.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Production Workflow System</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage orders, engineering, and production.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Access PWS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-6 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="space-y-2 text-sm font-medium">
                    Work email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      required
                    />
                  </label>
                  <Button type="submit" disabled={status === "sending"} className="mt-2">
                    {status === "sending" ? "Sending..." : "Send magic link"}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  Only invited users can access the workspace. If you are not
                  invited, ask your admin.
                </p>
              </TabsContent>
              <TabsContent value="signup" className="mt-6 space-y-4">
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                  Only the company owner should create an account. Team members
                  will be invited by the admin.
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="space-y-2 text-sm font-medium">
                    Full name
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Jane Owner"
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Company name
                    <input
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Demo Manufacturing Co."
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Work email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="owner@company.com"
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      required
                    />
                  </label>
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                    Billing is coming soon. You can create an account now and
                    enable subscription later.
                  </div>
                  <Button type="submit" disabled={status === "sending"}>
                    {status === "sending" ? "Sending..." : "Send magic link"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            {message && (
              <p
                className={`text-sm ${
                  status === "error" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
