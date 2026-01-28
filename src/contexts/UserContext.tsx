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
  isAuthenticated: boolean;
  loading: boolean;
}

interface UserContextValue {
  user: CurrentUser;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<string | null>;
}

const fallbackUser: CurrentUser = {
  id: "user-1",
  name: "Manager",
  role: "Sales",
  tenantId: null,
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
    .select("role, full_name, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { role: "Sales" as UserRole, fullName: "Manager", tenantId: null };
  }

  const role = ["Sales", "Engineering", "Production", "Admin"].includes(data.role)
    ? (data.role as UserRole)
    : ("Sales" as UserRole);
  return {
    role,
    fullName: data.full_name ?? "User",
    tenantId: data.tenant_id ?? null,
  };
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>({
    ...fallbackUser,
    loading: true,
  });

  useEffect(() => {
    if (!supabase) {
      setUser(fallbackUser);
      return;
    }

    let isMounted = true;

    async function hydrate() {
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
      if (!isMounted) {
        return;
      }
      setUser({
        id: sessionUser.id,
        name: profile.fullName,
        email: sessionUser.email ?? undefined,
        role: profile.role,
        tenantId: profile.tenantId ?? null,
        isAuthenticated: true,
        loading: false,
      });
    }

    hydrate();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const sessionUser = session?.user;
        if (!sessionUser) {
          setUser({ ...fallbackUser, loading: false });
          return;
        }
        const profile = await fetchUserRole(sessionUser.id);
        setUser({
          id: sessionUser.id,
          name: profile.fullName,
          email: sessionUser.email ?? undefined,
          role: profile.role,
          tenantId: profile.tenantId ?? null,
          isAuthenticated: true,
          loading: false,
        });
      },
    );

    return () => {
      isMounted = false;
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
      signInWithMagicLink: async (email: string) => {
        if (!supabase) {
          return "Supabase is not configured.";
        }
        const { error } = await supabase.auth.signInWithOtp({ email });
        return error ? error.message : null;
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
