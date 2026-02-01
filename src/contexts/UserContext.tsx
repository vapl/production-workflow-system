"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "Sales" | "Engineering" | "Production" | "Admin";

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  tenantId?: string | null;
  tenantName?: string | null;
  avatarUrl?: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

interface UserContextValue {
  user: CurrentUser;
  signOut: () => Promise<void>;
  signInWithMagicLink: (
    email: string,
    options?: { mode?: "signin" | "signup"; companyName?: string },
  ) => Promise<string | null>;
}

const fallbackUser: CurrentUser = {
  id: "user-1",
  name: "Manager",
  role: "Sales",
  tenantId: null,
  avatarUrl: null,
  isAuthenticated: false,
  loading: false,
};

const UserContext = createContext<UserContextValue>({
  user: fallbackUser,
  signOut: async () => undefined,
  signInWithMagicLink: async () => "Supabase is not configured.",
});

async function fetchUserRole(userId: string) {
  if (!supabase) {
    return { role: "Sales" as UserRole, fullName: "Manager", tenantId: null };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name, tenant_id, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      role: "Sales" as UserRole,
      fullName: "Manager",
      tenantId: null,
      avatarUrl: null,
      tenantName: null,
    };
  }

  let tenantName: string | null = null;
  if (data.tenant_id) {
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", data.tenant_id)
      .maybeSingle();
    tenantName = tenantData?.name ?? null;
  }

  const role = ["Sales", "Engineering", "Production", "Admin"].includes(data.role)
    ? (data.role as UserRole)
    : ("Sales" as UserRole);
  return {
    role,
    fullName: data.full_name ?? "User",
    tenantId: data.tenant_id ?? null,
    avatarUrl: data.avatar_url ?? null,
    tenantName,
  };
}

function readPendingSignup() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem("pws_signup");
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as {
      fullName?: string;
      companyName?: string;
    };
    return data && (data.fullName || data.companyName) ? data : null;
  } catch {
    return null;
  }
}

function clearPendingSignup() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("pws_signup");
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>({
    ...fallbackUser,
    loading: true,
  });

  async function ensureProfileSetup(
    sessionUser: { id: string; email?: string | null },
    profile: {
      role: UserRole;
      fullName: string;
      tenantId: string | null;
      avatarUrl?: string | null;
      tenantName?: string | null;
    },
  ) {
    if (!supabase) {
      return profile;
    }

    let nextProfile = { ...profile };
    if (!nextProfile.tenantId) {
      const pending = readPendingSignup();
      if (pending?.companyName) {
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .insert({
            name: pending.companyName,
            legal_name: pending.companyName,
            billing_email: sessionUser.email ?? null,
          })
          .select("id, name")
          .single();
        if (!tenantError && tenant) {
          const fullName = pending.fullName || nextProfile.fullName || "Owner";
          await supabase.from("profiles").upsert({
            id: sessionUser.id,
            full_name: fullName,
            role: "Admin",
            tenant_id: tenant.id,
            email: sessionUser.email ?? null,
          });
          nextProfile = {
            ...nextProfile,
            fullName,
            role: "Admin",
            tenantId: tenant.id,
            tenantName: tenant.name ?? null,
          };
          clearPendingSignup();
        }
      } else if (sessionUser.email) {
        const { data: invite } = await supabase
          .from("user_invites")
          .select("id, tenant_id, role")
          .eq("email", sessionUser.email)
          .is("accepted_at", null)
          .order("invited_at", { ascending: false })
          .maybeSingle();
        if (invite?.tenant_id) {
          const fullName = nextProfile.fullName || "User";
          await supabase.from("profiles").upsert({
            id: sessionUser.id,
            full_name: fullName,
            role: invite.role,
            tenant_id: invite.tenant_id,
            email: sessionUser.email ?? null,
          });
          await supabase
            .from("user_invites")
            .update({ accepted_at: new Date().toISOString() })
            .eq("id", invite.id);
          nextProfile = {
            ...nextProfile,
            fullName,
            role: invite.role as UserRole,
            tenantId: invite.tenant_id,
            tenantName: nextProfile.tenantName ?? null,
          };
        }
      }
    }

    if (sessionUser.email) {
      await supabase
        .from("profiles")
        .update({ email: sessionUser.email })
        .eq("id", sessionUser.id);
    }

    if (!nextProfile.tenantId) {
      return nextProfile;
    }

    const refreshed = await fetchUserRole(sessionUser.id);
    return {
      role: refreshed.role,
      fullName: refreshed.fullName,
      tenantId: refreshed.tenantId,
      avatarUrl: refreshed.avatarUrl,
      tenantName: refreshed.tenantName ?? null,
    };
  }

  useEffect(() => {
    if (!supabase) {
      setUser(fallbackUser);
      return;
    }

    let isMounted = true;
    const loadingTimeout = window.setTimeout(() => {
      if (isMounted) {
        setUser((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    }, 4000);

    async function hydrate() {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (!isMounted) {
          return;
        }
        if (!sessionUser) {
          setUser({ ...fallbackUser, loading: false });
          return;
        }
        const profile = await fetchUserRole(sessionUser.id);
        const ensuredProfile = await ensureProfileSetup(sessionUser, profile);
        if (!isMounted) {
          return;
        }
        setUser({
          id: sessionUser.id,
          name: ensuredProfile.fullName,
          email: sessionUser.email ?? undefined,
          role: ensuredProfile.role,
          tenantId: ensuredProfile.tenantId ?? null,
          avatarUrl: ensuredProfile.avatarUrl ?? null,
          tenantName: ensuredProfile.tenantName ?? null,
          isAuthenticated: true,
          loading: false,
        });
      } catch {
        if (!isMounted) {
          return;
        }
        setUser({ ...fallbackUser, loading: false });
      }
    }

    hydrate();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          const sessionUser = session?.user;
          if (!sessionUser) {
            setUser({ ...fallbackUser, loading: false });
            return;
          }
          const profile = await fetchUserRole(sessionUser.id);
          const ensuredProfile = await ensureProfileSetup(sessionUser, profile);
          setUser({
            id: sessionUser.id,
            name: ensuredProfile.fullName,
            email: sessionUser.email ?? undefined,
            role: ensuredProfile.role,
            tenantId: ensuredProfile.tenantId ?? null,
            avatarUrl: ensuredProfile.avatarUrl ?? null,
            tenantName: ensuredProfile.tenantName ?? null,
            isAuthenticated: true,
            loading: false,
          });
        } catch {
          setUser({ ...fallbackUser, loading: false });
        }
      },
    );

    return () => {
      isMounted = false;
      window.clearTimeout(loadingTimeout);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      signOut: async () => {
        if (!supabase) {
          return;
        }
        await supabase.auth.signOut();
      },
      signInWithMagicLink: async (
        email: string,
        options?: { mode?: "signin" | "signup"; companyName?: string },
      ) => {
        const payload = {
          email,
          mode: options?.mode ?? "signin",
          companyName: options?.companyName,
        };
        const response = await fetch("/api/auth/request-magic-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return data.error ?? "Failed to send magic link.";
        }
        return null;
      },
    }),
    [user],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(UserContext).user;
}

export function useAuthActions() {
  const { signOut, signInWithMagicLink } = useContext(UserContext);
  return { signOut, signInWithMagicLink };
}
