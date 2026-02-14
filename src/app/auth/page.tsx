"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { normalizeUserRole, useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AuthPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [isRecoveryLink, setIsRecoveryLink] = useState(false);
  const [authModeChecked, setAuthModeChecked] = useState(false);
  const [urlHasRecovery, setUrlHasRecovery] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [recoverySessionError, setRecoverySessionError] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteFullName, setInviteFullName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState("");
  const [inviteError, setInviteError] = useState("");

  const withTimeout = async <T,>(promise: Promise<T>, ms = 12000) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Request timed out."));
          }, ms);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  useEffect(() => {
    if (!authModeChecked) {
      return;
    }
    const hasRecoveryHint = (() => {
      if (typeof window === "undefined") {
        return false;
      }
      const url = new URL(window.location.href);
      if (url.searchParams.get("recovery") === "1") {
        return true;
      }
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      return hashParams.get("type") === "recovery";
    })();
    if (
      user.isAuthenticated &&
      !recoveryMode &&
      !isRecoveryLink &&
      !urlHasRecovery &&
      !hasRecoveryHint &&
      !inviteMode
    ) {
      router.replace("/orders");
    }
  }, [
    user.isAuthenticated,
    recoveryMode,
    isRecoveryLink,
    urlHasRecovery,
    inviteMode,
    authModeChecked,
    router,
  ]);

  useEffect(() => {
    if (!recoveryMode) {
      setStatus("idle");
      setMessage("");
    }
  }, [tab, recoveryMode]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const url = new URL(window.location.href);
    const errorDescription =
      url.searchParams.get("error_description") ??
      new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
        "error_description",
      );
    if (errorDescription) {
      setStatus("error");
      setMessage(decodeURIComponent(errorDescription));
      return;
    }

    const code = url.searchParams.get("code");
    const recoveryFlag = url.searchParams.get("recovery") === "1";
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const recoveryType = hashParams.get("type") ?? url.searchParams.get("type");
    const isRecovery = recoveryType === "recovery";
    const isInvite = recoveryType === "invite";
    if (isRecovery || recoveryFlag) {
      setIsRecoveryLink(true);
      setRecoveryMode(true);
      setUrlHasRecovery(true);
      setRecoverySessionReady(false);
      setRecoverySessionError("");
    }

    const finalize = () => {
      window.history.replaceState({}, document.title, "/auth");
      router.replace("/orders");
    };

    if (code) {
      setStatus("sending");
      setMessage("Signing you in...");
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
          }
          if (isRecovery) {
            setRecoveryMode(true);
            setIsRecoveryLink(true);
            setUrlHasRecovery(true);
            setRecoverySessionReady(false);
            setRecoverySessionError("");
            setStatus("idle");
            setMessage("");
            window.history.replaceState({}, document.title, "/auth?recovery=1");
            setAuthModeChecked(true);
            return;
          }
          if (isInvite) {
            setInviteMode(true);
            setStatus("idle");
            setMessage("");
            window.history.replaceState({}, document.title, "/auth?invite=1");
            setAuthModeChecked(true);
            return;
          }
          finalize();
        })
        .catch(() => {
          setStatus("error");
          setMessage("Failed to complete sign in.");
        });
      return;
    }

    if (accessToken && refreshToken) {
      if (isRecovery) {
        const tokens = { accessToken, refreshToken };
        setRecoveryTokens(tokens);
        try {
          window.sessionStorage.setItem(
            "pws_recovery_tokens",
            JSON.stringify(tokens),
          );
        } catch {
          // ignore storage errors
        }
        setRecoveryMode(true);
        setIsRecoveryLink(true);
        setUrlHasRecovery(true);
        setRecoverySessionReady(false);
        setRecoverySessionError("");
        setStatus("idle");
        setMessage("");
        window.history.replaceState({}, document.title, "/auth?recovery=1");
        setAuthModeChecked(true);
        return;
      }
      setStatus("sending");
      setMessage("Signing you in...");
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
          }
          if (isInvite) {
            setInviteMode(true);
            setStatus("idle");
            setMessage("");
            window.history.replaceState({}, document.title, "/auth?invite=1");
            setAuthModeChecked(true);
            return;
          }
          finalize();
        })
        .catch(() => {
          setStatus("error");
          setMessage("Failed to complete sign in.");
        });
      return;
    }
    setAuthModeChecked(true);
  }, [router]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event !== "PASSWORD_RECOVERY") {
          return;
        }
        setRecoveryMode(true);
        setIsRecoveryLink(true);
        setUrlHasRecovery(true);
        setRecoverySessionReady(false);
        setRecoverySessionError("");
        setStatus("idle");
        setMessage("");
        try {
          window.history.replaceState({}, document.title, "/auth?recovery=1");
        } catch {
          // ignore history errors
        }
        setAuthModeChecked(true);
      },
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!recoveryMode || recoveryTokens) {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem("pws_recovery_tokens");
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (parsed.accessToken && parsed.refreshToken) {
        setRecoveryTokens({
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
        });
      }
    } catch {
      // ignore parse errors
    }
  }, [recoveryMode, recoveryTokens]);

  useEffect(() => {
    if (!supabase || !recoveryMode || recoverySessionReady || !recoveryTokens) {
      return;
    }
    const sb = supabase;
    let active = true;
    const prepare = async () => {
      const { error } = await sb.auth.setSession({
        access_token: recoveryTokens.accessToken,
        refresh_token: recoveryTokens.refreshToken,
      });
      if (!active) {
        return;
      }
      if (error) {
        setRecoverySessionError(error.message);
        setRecoverySessionReady(false);
        return;
      }
      setRecoverySessionError("");
      setRecoverySessionReady(true);
    };
    prepare();
    return () => {
      active = false;
    };
  }, [supabase, recoveryMode, recoveryTokens, recoverySessionReady]);

  useEffect(() => {
    if (!supabase || !recoveryMode || recoverySessionReady || recoveryTokens) {
      return;
    }
    const sb = supabase;
    let active = true;
    const checkSession = async () => {
      const { data } = await sb.auth.getSession();
      if (!active) {
        return;
      }
      if (data.session?.user) {
        setRecoverySessionReady(true);
        setRecoverySessionError("");
        return;
      }
      setRecoverySessionError("Open the reset link again to continue.");
    };
    checkSession();
    return () => {
      active = false;
    };
  }, [supabase, recoveryMode, recoveryTokens, recoverySessionReady]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage("Enter a valid email.");
      return;
    }
    if (!password.trim()) {
      setStatus("error");
      setMessage("Password is required.");
      return;
    }
    if (tab === "signup") {
      if (!companyName.trim()) {
        setStatus("error");
        setMessage("Company name is required.");
        return;
      }
      if (password !== confirmPassword) {
        setStatus("error");
        setMessage("Passwords do not match.");
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
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    const sb = supabase;
    setStatus("sending");
    setMessage("");
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    const stopPoll = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }
    };
    const startPoll = () => {
      if (typeof window === "undefined") {
        return;
      }
      if (pollInterval || pollTimeout) {
        return;
      }
      pollInterval = setInterval(async () => {
        try {
          const { data } = await sb.auth.getSession();
          if (data.session?.user) {
            stopPoll();
            setStatus("sent");
            setMessage("Signed in successfully.");
            router.replace("/orders");
          }
        } catch {
          // ignore session probe errors
        }
      }, 1500);
      pollTimeout = setTimeout(() => {
        stopPoll();
        setStatus("error");
        setMessage("Sign in took too long. Please try again.");
      }, 15000);
    };
    try {
      const accessCheck = await withTimeout(
        fetch("/api/auth/request-magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            mode: tab === "signup" ? "signup" : "signin",
            companyName: tab === "signup" ? companyName.trim() : undefined,
          }),
        }),
      );
      if (!accessCheck.ok) {
        const data = await accessCheck.json().catch(() => ({}));
        setStatus("error");
        setMessage(data.error ?? "Access check failed.");
        stopPoll();
        return;
      }
    } catch (error) {
      if (tab === "signup") {
        const messageText =
          error instanceof Error ? error.message : "Access check failed.";
        setStatus("error");
        setMessage(messageText);
        stopPoll();
        return;
      }
      setMessage("Access check timed out. Continuing sign in...");
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    if (tab === "signup") {
      const { error } = await withTimeout(
        supabase.auth.signUp({
          email: trimmed,
          password,
          options: {
            emailRedirectTo: origin ? `${origin}/auth` : undefined,
          },
        }),
      );
      if (error) {
        setStatus("error");
        setMessage(error.message);
        stopPoll();
        return;
      }
      setStatus("sent");
      setMessage("Account created. Check your email to confirm.");
      stopPoll();
      return;
    }
    try {
      startPoll();
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        }),
      );
      if (error) {
        setStatus("error");
        setMessage(error.message);
        stopPoll();
        return;
      }
      setStatus("sent");
      setMessage("Signed in successfully.");
      stopPoll();
      router.replace("/orders");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Sign in failed.";
      if (messageText.toLowerCase().includes("timed out")) {
        setStatus("sending");
        setMessage("Completing sign in...");
        return;
      }
      setStatus("error");
      setMessage(messageText);
      stopPoll();
    }
  }

  async function handleForgotPassword() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage("Enter your email first.");
      return;
    }
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    setStatus("sending");
    setMessage("");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: origin ? `${origin}/auth?recovery=1` : undefined,
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Password reset email sent.");
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword.trim()) {
      setStatus("error");
      setMessage("Enter a new password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    setStatus("sending");
    setMessage("");
    const updatePasswordDirect = async (accessToken: string) => {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase is not configured.");
      }
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error_description || data?.message || "Reset failed.");
      }
    };

    const withTimeout = async <T,>(promise: Promise<T>, ms: number) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race<T>([
          promise,
          new Promise<T>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error("Request timed out."));
            }, ms);
          }),
        ]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    try {
      if (!recoverySessionReady) {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          setStatus("error");
          setMessage(
            recoverySessionError ||
              "Open the reset link again to continue.",
          );
          return;
        }
        setRecoverySessionReady(true);
        setRecoverySessionError("");
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken =
        sessionData.session?.access_token ?? recoveryTokens?.accessToken ?? "";
      if (!accessToken) {
        setStatus("error");
        setMessage(
          recoverySessionError || "Open the reset link again to continue.",
        );
        return;
      }

      await updatePasswordDirect(accessToken);
      setStatus("sent");
      setMessage("Password updated.");
      try {
        window.sessionStorage.removeItem("pws_recovery_tokens");
      } catch {
        // ignore storage errors
      }
      await supabase.auth.signOut();
      window.setTimeout(() => {
        setRecoveryMode(false);
        setTab("signin");
        setMessage("");
        router.replace("/auth");
      }, 3000);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Reset failed. Try again.";
      setStatus("error");
      setMessage(messageText);
    }
  }

  async function handleInviteComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    if (!invitePassword.trim()) {
      setInviteError("Password is required.");
      return;
    }
    if (invitePassword !== inviteConfirmPassword) {
      setInviteError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setInviteError("Supabase is not configured.");
      return;
    }
    setStatus("sending");
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (!authUser) {
        setInviteError("Invite session expired. Open the invite link again.");
        setStatus("error");
        return;
      }
      const metadata = authUser.user_metadata as {
        tenant_id?: string;
        full_name?: string;
        role?: string;
      };
      const tenantId = metadata?.tenant_id ?? null;
      if (!tenantId) {
        setInviteError("Invite metadata missing tenant.");
        setStatus("error");
        return;
      }
      const normalizedRole = normalizeUserRole(metadata?.role);
      const finalName =
        inviteFullName.trim() ||
        metadata?.full_name?.trim() ||
        authUser.email ||
        "User";

      const { error: passwordError } = await supabase.auth.updateUser({
        password: invitePassword,
      });
      if (passwordError) {
        setInviteError(passwordError.message);
        setStatus("error");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authUser.id,
        full_name: finalName,
        role: normalizedRole,
        is_admin: false,
        is_owner: false,
        tenant_id: tenantId,
        phone: invitePhone.trim() || null,
        email: authUser.email ?? null,
      });
      if (profileError) {
        setInviteError(profileError.message);
        setStatus("error");
        return;
      }

      if (authUser.email) {
        await supabase
          .from("user_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("email", authUser.email)
          .is("accepted_at", null);
      }

      setStatus("sent");
      setMessage("Invite accepted. Redirecting...");
      router.replace("/orders");
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Invite failed.";
      setInviteError(messageText);
      setStatus("error");
    }
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
            <CardTitle>
              {recoveryMode
                ? "Reset password"
                : inviteMode
                  ? "Complete invite"
                  : "Access PWS"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {recoveryMode ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set a new password to continue.
                </p>
                <label className="space-y-2 text-sm font-medium">
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Create a new password"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Confirm password
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) =>
                      setConfirmNewPassword(event.target.value)
                    }
                    placeholder="Repeat new password"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    required
                  />
                </label>
                <Button
                  className="mt-2"
                  type="submit"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "Updating..." : "Update password"}
                </Button>
              </form>
            ) : inviteMode ? (
              <form onSubmit={handleInviteComplete} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Finish setting up your account to join the workspace.
                </p>
                <label className="space-y-2 text-sm font-medium">
                  Full name
                  <input
                    value={inviteFullName}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    placeholder="Your name"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Phone (optional)
                  <input
                    value={invitePhone}
                    onChange={(event) => setInvitePhone(event.target.value)}
                    placeholder="e.g. +371 20000000"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Password
                  <input
                    type="password"
                    value={invitePassword}
                    onChange={(event) =>
                      setInvitePassword(event.target.value)
                    }
                    placeholder="Create a password"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Confirm password
                  <input
                    type="password"
                    value={inviteConfirmPassword}
                    onChange={(event) =>
                      setInviteConfirmPassword(event.target.value)
                    }
                    placeholder="Repeat password"
                    className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    required
                  />
                </label>
                {inviteError ? (
                  <p className="text-sm text-destructive">{inviteError}</p>
                ) : null}
                <Button type="submit" disabled={status === "sending"}>
                  {status === "sending" ? "Saving..." : "Complete setup"}
                </Button>
              </form>
            ) : (
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
                    <label className="space-y-2 text-sm font-medium">
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Your password"
                        className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        required
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        disabled={status === "sending"}
                        className="mt-2"
                      >
                        {status === "sending" ? "Signing in..." : "Sign in"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2"
                        onClick={handleForgotPassword}
                        disabled={status === "sending"}
                      >
                        Forgot password?
                      </Button>
                    </div>
                  </form>
                  <p className="text-xs text-muted-foreground">
                    Only invited users can access the workspace. If you are not
                    invited, ask your admin.
                  </p>
                </TabsContent>
                <TabsContent value="signup" className="mt-6 space-y-4">
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    Only the company owner should create an account. Team
                    members will be invited by the admin.
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
                    <label className="space-y-2 text-sm font-medium">
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Create a password"
                        className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        required
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Confirm password
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Repeat password"
                        className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        required
                      />
                    </label>
                    <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                      Billing is coming soon. You can create an account now and
                      enable subscription later.
                    </div>
                    <Button type="submit" disabled={status === "sending"}>
                      {status === "sending" ? "Creating..." : "Create account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
            {message && (
              <p
                className={`text-sm ${
                  status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {message}{" "}
                {status === "sent" && recoveryMode ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => {
                      setRecoveryMode(false);
                      setTab("signin");
                      setMessage("");
                      router.replace("/auth");
                    }}
                  >
                    Sign in
                  </Button>
                ) : null}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
