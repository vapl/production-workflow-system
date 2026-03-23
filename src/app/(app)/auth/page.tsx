"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogInIcon } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { normalizeUserRole, useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n/useI18n";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AuthPage() {
  const { t } = useI18n();
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

  const requiresInviteSetup = (metadata: unknown) => {
    if (!metadata || typeof metadata !== "object") {
      return false;
    }
    return Boolean(
      (metadata as { require_password_setup?: boolean }).require_password_setup,
    );
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms = 12000) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(t("authPage.errors.requestTimedOut")));
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
      !user.requiresPasswordSetup &&
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
    user.requiresPasswordSetup,
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
    const sb = supabase;
    const url = new URL(window.location.href);
    const inviteFlag = url.searchParams.get("invite") === "1";
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
      setMessage(t("authPage.messages.signingIn"));
      sb.auth
        .exchangeCodeForSession(code)
        .then(async ({ error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
          }
          const { data: userData } = await sb.auth.getUser();
          const shouldShowInviteSetup =
            isInvite ||
            inviteFlag ||
            requiresInviteSetup(userData.user?.user_metadata);
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
          if (shouldShowInviteSetup) {
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
          setMessage(t("authPage.errors.failedCompleteSignIn"));
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
      setMessage(t("authPage.messages.signingIn"));
      sb.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(async ({ error }) => {
          if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
          }
          const { data: userData } = await sb.auth.getUser();
          const shouldShowInviteSetup =
            isInvite ||
            inviteFlag ||
            requiresInviteSetup(userData.user?.user_metadata);
          if (shouldShowInviteSetup) {
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
          setMessage(t("authPage.errors.failedCompleteSignIn"));
        });
      return;
    }
    setAuthModeChecked(true);
  }, [router, t]);

  useEffect(() => {
    if (!authModeChecked || typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    const inviteFlag = url.searchParams.get("invite") === "1";
    if (inviteFlag && user.isAuthenticated && user.requiresPasswordSetup) {
      setInviteMode(true);
    }
  }, [authModeChecked, user.isAuthenticated, user.requiresPasswordSetup]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const sb = supabase;
    const { data: authListener } = sb.auth.onAuthStateChange((event) => {
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
    });
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
  }, [recoveryMode, recoveryTokens, recoverySessionReady]);

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
      setRecoverySessionError(t("authPage.errors.openResetLinkAgain"));
    };
    checkSession();
    return () => {
      active = false;
    };
  }, [recoveryMode, recoveryTokens, recoverySessionReady, t]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage(t("authPage.errors.enterValidEmail"));
      return;
    }
    if (!password.trim()) {
      setStatus("error");
      setMessage(t("authPage.errors.passwordRequired"));
      return;
    }
    if (tab === "signup") {
      if (!companyName.trim()) {
        setStatus("error");
        setMessage(t("authPage.errors.companyNameRequired"));
        return;
      }
      if (password !== confirmPassword) {
        setStatus("error");
        setMessage(t("authPage.errors.passwordsDoNotMatch"));
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
      setMessage(t("authPage.errors.supabaseNotConfigured"));
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
            setMessage(t("authPage.messages.signedInSuccessfully"));
            router.replace("/orders");
          }
        } catch {
          // ignore session probe errors
        }
      }, 1500);
      pollTimeout = setTimeout(() => {
        stopPoll();
        setStatus("error");
        setMessage(t("authPage.errors.signInTookTooLong"));
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
        setMessage(data.error ?? t("authPage.errors.accessCheckFailed"));
        stopPoll();
        return;
      }
    } catch (error) {
      if (tab === "signup") {
        const messageText =
          error instanceof Error
            ? error.message
            : t("authPage.errors.accessCheckFailed");
        setStatus("error");
        setMessage(messageText);
        stopPoll();
        return;
      }
      setMessage(t("authPage.messages.accessCheckTimedOutContinue"));
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
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
      setMessage(t("authPage.messages.accountCreatedCheckEmail"));
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
      setMessage(t("authPage.messages.signedInSuccessfully"));
      stopPoll();
      router.replace("/orders");
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : t("authPage.errors.signInFailed");
      if (messageText.toLowerCase().includes("timed out")) {
        setStatus("sending");
        setMessage(t("authPage.messages.completingSignIn"));
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
      setMessage(t("authPage.errors.enterEmailFirst"));
      return;
    }
    if (!supabase) {
      setStatus("error");
      setMessage(t("authPage.errors.supabaseNotConfigured"));
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
    setMessage(t("authPage.messages.passwordResetEmailSent"));
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword.trim()) {
      setStatus("error");
      setMessage(t("authPage.errors.enterNewPassword"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus("error");
      setMessage(t("authPage.errors.passwordsDoNotMatch"));
      return;
    }
    if (!supabase) {
      setStatus("error");
      setMessage(t("authPage.errors.supabaseNotConfigured"));
      return;
    }
    setStatus("sending");
    setMessage("");
    const updatePasswordDirect = async (accessToken: string) => {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(t("authPage.errors.supabaseNotConfigured"));
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
        throw new Error(
          data?.error_description ||
            data?.message ||
            t("authPage.errors.resetFailed"),
        );
      }
    };

    try {
      if (!recoverySessionReady) {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          setStatus("error");
          setMessage(
            recoverySessionError || t("authPage.errors.openResetLinkAgain"),
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
          recoverySessionError || t("authPage.errors.openResetLinkAgain"),
        );
        return;
      }

      await updatePasswordDirect(accessToken);
      setStatus("sent");
      setMessage(t("authPage.messages.passwordUpdated"));
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
        err instanceof Error
          ? err.message
          : t("authPage.errors.resetFailedTryAgain");
      setStatus("error");
      setMessage(messageText);
    }
  }

  async function handleInviteComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    if (!invitePassword.trim()) {
      setInviteError(t("authPage.errors.passwordRequired"));
      return;
    }
    if (invitePassword !== inviteConfirmPassword) {
      setInviteError(t("authPage.errors.passwordsDoNotMatch"));
      return;
    }
    if (!supabase) {
      setInviteError(t("authPage.errors.supabaseNotConfigured"));
      return;
    }
    setStatus("sending");
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (!authUser) {
        setInviteError(t("authPage.errors.inviteSessionExpired"));
        setStatus("error");
        return;
      }
      const metadata = authUser.user_metadata as {
        tenant_id?: string;
        full_name?: string;
        role?: string;
      };
      let tenantId = metadata?.tenant_id ?? null;
      let roleFromInvite = metadata?.role ?? null;
      let fullNameFromInvite = metadata?.full_name ?? null;
      if (!tenantId && authUser.email) {
        const { data: inviteLookup, error: inviteLookupError } = await supabase
          .from("user_invites")
          .select("tenant_id, role, full_name")
          .eq("email", authUser.email)
          .is("accepted_at", null)
          .order("invited_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (inviteLookupError) {
          setInviteError(inviteLookupError.message);
          setStatus("error");
          return;
        }
        tenantId = inviteLookup?.tenant_id ?? tenantId;
        roleFromInvite = inviteLookup?.role ?? roleFromInvite;
        fullNameFromInvite = inviteLookup?.full_name ?? fullNameFromInvite;
      }
      if (!tenantId) {
        setInviteError(t("authPage.errors.inviteMissingTenant"));
        setStatus("error");
        return;
      }
      const normalizedRole = normalizeUserRole(roleFromInvite);
      const finalName =
        inviteFullName.trim() ||
        fullNameFromInvite?.trim() ||
        authUser.email ||
        t("authPage.userFallback");

      const { error: passwordError } = await supabase.auth.updateUser({
        password: invitePassword,
        data: {
          ...(authUser.user_metadata ?? {}),
          require_password_setup: false,
        },
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
      setMessage(t("authPage.messages.inviteAcceptedRedirecting"));
      router.replace("/orders");
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : t("authPage.errors.inviteFailed");
      setInviteError(messageText);
      setStatus("error");
    }
  }

  return (
    <AuthShell currentView="auth">
      <div className="w-full max-w-xl space-y-4">
        <div className="space-y-1.5 text-center md:space-y-2">
          <h1 className="text-[2.8rem] font-semibold leading-[0.9] tracking-tight text-slate-950 md:text-[clamp(2.35rem,3vw,3.15rem)]">
            {t("authPage.title")}
          </h1>
          <p className="mx-auto max-w-md text-base text-slate-600 md:text-base">
            {t("authPage.subtitle")}
          </p>
        </div>

        <div className="rounded-4xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-6">
          <div className="space-y-6">
            {recoveryMode ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-sm text-slate-500">
                  {t("authPage.setNewPasswordHint")}
                </p>
                <InputField
                  label={t("authPage.newPassword")}
                  type="password"
                  icon="lock"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t("authPage.placeholders.createNewPassword")}
                  wrapperClassName="h-12"
                  required
                />
                <InputField
                  label={t("authPage.confirmPassword")}
                  type="password"
                  icon="lock"
                  value={confirmNewPassword}
                  onChange={(event) =>
                    setConfirmNewPassword(event.target.value)
                  }
                  placeholder={t("authPage.placeholders.repeatNewPassword")}
                  wrapperClassName="h-12"
                  required
                />
                <Button
                  className="mt-2 h-12 w-full rounded-2xl text-base"
                  type="submit"
                  disabled={status === "sending"}
                >
                  {status === "sending"
                    ? t("authPage.updating")
                    : t("authPage.updatePassword")}
                </Button>
              </form>
            ) : inviteMode ? (
              <form onSubmit={handleInviteComplete} className="space-y-4">
                <p className="text-sm text-slate-500">
                  {t("authPage.finishSetupHint")}
                </p>
                <InputField
                  label={t("authPage.fullName")}
                  icon="user"
                  value={inviteFullName}
                  onChange={(event) => setInviteFullName(event.target.value)}
                  placeholder={t("authPage.placeholders.yourName")}
                  wrapperClassName="h-12"
                />
                <InputField
                  label={t("authPage.phoneOptional")}
                  icon="phone"
                  value={invitePhone}
                  onChange={(event) => setInvitePhone(event.target.value)}
                  placeholder={t("authPage.placeholders.phoneExample")}
                  wrapperClassName="h-12"
                />
                <InputField
                  label={t("authPage.password")}
                  type="password"
                  icon="lock"
                  value={invitePassword}
                  onChange={(event) => setInvitePassword(event.target.value)}
                  placeholder={t("authPage.placeholders.createPassword")}
                  wrapperClassName="h-12"
                  required
                />
                <InputField
                  label={t("authPage.confirmPassword")}
                  type="password"
                  icon="lock"
                  value={inviteConfirmPassword}
                  onChange={(event) =>
                    setInviteConfirmPassword(event.target.value)
                  }
                  placeholder={t("authPage.placeholders.repeatPassword")}
                  wrapperClassName="h-12"
                  required
                />
                {inviteError ? (
                  <p className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {inviteError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={status === "sending"}
                  className="h-12 w-full rounded-2xl text-base"
                >
                  {status === "sending"
                    ? t("authPage.saving")
                    : t("authPage.completeSetup")}
                </Button>
              </form>
            ) : (
              <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                <TabsList className="h-auto w-full rounded-2xl border border-slate-200 bg-slate-100 p-1 [--tabs-active-bg:var(--color-white)] [--tabs-active-border:var(--color-slate-200)] [--tabs-active-text:var(--color-slate-950)] [--tabs-bg:transparent] [--tabs-border:transparent] [--tabs-hover-text:var(--color-slate-700)] [--tabs-ring:var(--color-sky-200)] [--tabs-text:var(--color-slate-500)]">
                  <TabsTrigger
                    className="h-10 flex-1 rounded-xl text-sm"
                    value="signin"
                  >
                    {t("authPage.signIn")}
                  </TabsTrigger>
                  <TabsTrigger
                    className="h-10 flex-1 rounded-xl text-sm"
                    value="signup"
                  >
                    {t("authPage.createAccount")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-0 space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <InputField
                      label={t("authPage.workEmail")}
                      type="email"
                      icon="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("authPage.placeholders.workEmail")}
                      wrapperClassName="h-12"
                      required
                    />
                    <InputField
                      label={t("authPage.password")}
                      type="password"
                      icon="lock"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("authPage.placeholders.yourPassword")}
                      wrapperClassName="h-12"
                      required
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        disabled={status === "sending"}
                        className="h-12 rounded-2xl px-6 text-base"
                      >
                        <LogInIcon className="h-5 w-5" />
                        {status === "sending"
                          ? t("authPage.signingIn")
                          : t("authPage.signIn")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-12 rounded-2xl px-4 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        onClick={handleForgotPassword}
                        disabled={status === "sending"}
                      >
                        {t("authPage.forgotPassword")}
                      </Button>
                    </div>
                  </form>
                  <p className="text-xs text-slate-500">
                    {t("authPage.inviteOnlyHint")}
                  </p>
                </TabsContent>

                <TabsContent value="signup" className="mt-0 space-y-4">
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    {t("authPage.ownerOnlySignupHint")}
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <InputField
                      label={t("authPage.fullName")}
                      icon="user"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder={t("authPage.placeholders.ownerName")}
                      wrapperClassName="h-12"
                    />
                    <InputField
                      label={t("authPage.companyName")}
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder={t("authPage.placeholders.companyName")}
                      wrapperClassName="h-12"
                    />
                    <InputField
                      label={t("authPage.workEmail")}
                      type="email"
                      icon="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("authPage.placeholders.ownerEmail")}
                      wrapperClassName="h-12"
                      required
                    />
                    <InputField
                      label={t("authPage.password")}
                      type="password"
                      icon="lock"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("authPage.placeholders.createPassword")}
                      wrapperClassName="h-12"
                      required
                    />
                    <InputField
                      label={t("authPage.confirmPassword")}
                      type="password"
                      icon="lock"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder={t("authPage.placeholders.repeatPassword")}
                      wrapperClassName="h-12"
                      required
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                      {t("authPage.billingComingSoonHint")}
                    </div>
                    <Button
                      type="submit"
                      disabled={status === "sending"}
                      className="h-12 w-full rounded-2xl text-base"
                    >
                      {status === "sending"
                        ? t("authPage.creating")
                        : t("authPage.createAccount")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}

            {message ? (
              <p
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  status === "error"
                    ? "border-destructive/25 bg-destructive/5 text-destructive"
                    : "border-slate-200 bg-slate-50 text-slate-600"
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
                    {t("authPage.signIn")}
                  </Button>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
