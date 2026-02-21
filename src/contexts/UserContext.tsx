"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  supabase,
  supabaseAvatarBucket,
  supabaseTenantLogoBucket,
} from "@/lib/supabaseClient";

export type UserRole =
  | "Admin"
  | "Sales"
  | "Engineering"
  | "Production manager"
  | "Production worker"
  | "Dealer"
  | "Production";

export const userRoleOptions: UserRole[] = [
  "Admin",
  "Sales",
  "Engineering",
  "Production manager",
  "Production worker",
  "Dealer",
  "Production",
];

export function formatUserRoleLabel(role: UserRole | string) {
  switch (role) {
    case "Production manager":
      return "Production planner";
    case "Production worker":
      return "Operator";
    case "Production":
      return "Warehouse";
    default:
      return role;
  }
}

export function normalizeUserRole(value?: string | null): UserRole {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Sales";
  }
  if (userRoleOptions.includes(trimmed as UserRole)) {
    return trimmed as UserRole;
  }
  const normalized = trimmed.toLowerCase().replace(/_/g, " ");
  if (normalized === "owner") return "Admin";
  if (normalized === "admin") return "Admin";
  if (normalized === "sales") return "Sales";
  if (normalized === "engineering") return "Engineering";
  if (normalized === "production manager") return "Production manager";
  if (normalized === "production planner") return "Production manager";
  if (normalized === "production worker") return "Production worker";
  if (normalized === "operator") return "Production worker";
  if (normalized === "dealer") return "Dealer";
  if (normalized === "production") return "Production";
  if (normalized === "warehouse") return "Production";
  return "Sales";
}

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
  tenantId?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  avatarUrl?: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

interface UserContextValue {
  user: CurrentUser;
  signOut: () => Promise<void>;
}

const fallbackUser: CurrentUser = {
  id: "user-1",
  name: "Manager",
  role: "Sales",
  isAdmin: false,
  isOwner: false,
  phone: null,
  tenantId: null,
  tenantLogoUrl: null,
  avatarUrl: null,
  isAuthenticated: false,
  loading: false,
};

const UserContext = createContext<UserContextValue>({
  user: fallbackUser,
  signOut: async () => undefined,
});

function getStoragePathFromUrl(url: string, bucket: string) {
  if (!url) {
    return null;
  }
  if (!url.startsWith("http")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) {
      return null;
    }
    return parsed.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
}

async function resolveSignedUrl(
  url: string | null | undefined,
  bucket: string,
) {
  if (!supabase || !url) {
    return url ?? null;
  }
  const storagePath = getStoragePathFromUrl(url, bucket);
  if (!storagePath) {
    return url;
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) {
    return url;
  }
  return data.signedUrl;
}

async function fetchUserRole(userId: string) {
  if (!supabase) {
    return {
      role: "Sales" as UserRole,
      isAdmin: false,
      isOwner: false,
      fullName: "Manager",
      tenantId: null,
    };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name, tenant_id, avatar_url, is_admin, is_owner, phone")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      role: "Sales" as UserRole,
      isAdmin: false,
      isOwner: false,
      fullName: "Manager",
      tenantId: null,
      avatarUrl: null,
      tenantName: null,
      phone: null,
    };
  }

  const role = normalizeUserRole(data.role);
  const isOwner = data.is_owner ?? false;
  const isAdmin = (data.is_admin ?? false) || isOwner || role === "Admin";
  const resolvedAvatarUrl = await resolveSignedUrl(
    data.avatar_url ?? null,
    supabaseAvatarBucket,
  );
  let tenantName: string | null = null;
  if (data.tenant_id) {
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name, logo_url")
      .eq("id", data.tenant_id)
      .maybeSingle();
    tenantName = tenantData?.name ?? null;
    const resolvedTenantLogo = await resolveSignedUrl(
      tenantData?.logo_url ?? null,
      supabaseTenantLogoBucket,
    );
    return {
      role,
      isAdmin,
      isOwner,
      fullName: data.full_name ?? "User",
      tenantId: data.tenant_id ?? null,
      avatarUrl: resolvedAvatarUrl,
      tenantName,
      tenantLogoUrl: resolvedTenantLogo,
      phone: data.phone ?? null,
    };
  }

  return {
    role,
    isAdmin,
    isOwner,
    fullName: data.full_name ?? "User",
    tenantId: data.tenant_id ?? null,
    avatarUrl: resolvedAvatarUrl,
    tenantName,
    tenantLogoUrl: null,
    phone: data.phone ?? null,
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

function readCachedProfile(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`pws_user_cache_${userId}`);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as {
      cachedAt: number;
      profile: {
        fullName: string;
        role: UserRole;
        isAdmin: boolean;
        isOwner: boolean;
        tenantId?: string | null;
        tenantName?: string | null;
        tenantLogoUrl?: string | null;
        avatarUrl?: string | null;
        phone?: string | null;
      };
    };
    if (!data?.profile) {
      return null;
    }
    return data.profile;
  } catch {
    return null;
  }
}

function writeCachedProfile(
  userId: string,
  profile: {
    fullName: string;
    role: UserRole;
    isAdmin: boolean;
    isOwner: boolean;
    tenantId?: string | null;
    tenantName?: string | null;
    tenantLogoUrl?: string | null;
    avatarUrl?: string | null;
    phone?: string | null;
  },
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      `pws_user_cache_${userId}`,
      JSON.stringify({
        cachedAt: Date.now(),
        profile,
      }),
    );
  } catch {
    // ignore cache errors
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>({
    ...fallbackUser,
    loading: true,
  });
  const profileTimeoutMs = 8000;

  async function withTimeout<T>(promise: Promise<T>, ms: number) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timeoutId = setTimeout(() => resolve({ timedOut: true }), ms);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if ((result as { timedOut?: boolean }).timedOut) {
      return { timedOut: true as const };
    }
    return { timedOut: false as const, value: result as T };
  }

  async function ensureProfileSetup(
    sessionUser: {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
    },
    profile: {
      role: UserRole;
      isAdmin: boolean;
      isOwner: boolean;
      fullName: string;
      tenantId: string | null;
      avatarUrl?: string | null;
      tenantName?: string | null;
      tenantLogoUrl?: string | null;
      phone?: string | null;
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
            is_admin: true,
            is_owner: true,
            tenant_id: tenant.id,
            email: sessionUser.email ?? null,
          });
          nextProfile = {
            ...nextProfile,
            fullName,
            role: "Admin",
            isAdmin: true,
            isOwner: true,
            tenantId: tenant.id,
            tenantName: tenant.name ?? null,
          };
          clearPendingSignup();
        }
        } else if (sessionUser.user_metadata?.tenant_id) {
          const metadata = sessionUser.user_metadata as {
            tenant_id?: string;
            full_name?: string;
            role?: string;
          };
          const tenantId = metadata.tenant_id ?? null;
          if (tenantId) {
            const fullName =
              metadata.full_name?.trim() || nextProfile.fullName || "User";
            const normalizedRole = normalizeUserRole(metadata.role);
            await supabase.from("profiles").upsert({
              id: sessionUser.id,
              full_name: fullName,
              role: normalizedRole,
              is_admin: false,
              is_owner: false,
              tenant_id: tenantId,
              email: sessionUser.email ?? null,
            });
            nextProfile = {
              ...nextProfile,
              fullName,
              role: normalizedRole,
              isAdmin: false,
              isOwner: false,
              tenantId,
              tenantName: nextProfile.tenantName ?? null,
            };
          }
        } else if (sessionUser.email) {
          const { data: invite } = await supabase
            .from("user_invites")
            .select("id, tenant_id, role, full_name")
            .eq("email", sessionUser.email)
            .is("accepted_at", null)
            .order("invited_at", { ascending: false })
            .maybeSingle();
        if (invite?.tenant_id) {
          const fullName =
            invite.full_name?.trim() || nextProfile.fullName || "User";
          const normalizedRole = normalizeUserRole(invite.role);
          await supabase.from("profiles").upsert({
            id: sessionUser.id,
            full_name: fullName,
            role: normalizedRole,
            is_admin: false,
            is_owner: false,
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
            role: normalizedRole,
            isAdmin: false,
            isOwner: false,
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
      isAdmin: refreshed.isAdmin,
      isOwner: refreshed.isOwner,
      fullName: refreshed.fullName,
      tenantId: refreshed.tenantId,
      avatarUrl: refreshed.avatarUrl,
      tenantName: refreshed.tenantName ?? null,
      tenantLogoUrl: refreshed.tenantLogoUrl ?? null,
      phone: refreshed.phone ?? null,
    };
  }

  useEffect(() => {
    if (!supabase) {
      setUser(fallbackUser);
      return;
    }
    const sb = supabase;

    let isMounted = true;

    let didRetry = false;
    const scheduleRetry = () => {
      if (didRetry) {
        return;
      }
      didRetry = true;
      setTimeout(() => {
        if (isMounted) {
          hydrate();
        }
      }, 2000);
    };

    async function hydrate() {
      try {
        const { data } = await sb.auth.getSession();
        const sessionUser = data.session?.user;
        if (!isMounted) {
          return;
        }
        if (!sessionUser) {
          setUser({ ...fallbackUser, loading: false });
          return;
        }
        const cached = readCachedProfile(sessionUser.id);
        if (cached) {
          setUser({
            id: sessionUser.id,
            name: cached.fullName,
            email: sessionUser.email ?? undefined,
            phone: cached.phone ?? null,
            role: cached.role,
            isAdmin: cached.isAdmin,
            isOwner: cached.isOwner ?? false,
            tenantId: cached.tenantId ?? null,
            avatarUrl: cached.avatarUrl ?? null,
            tenantName: cached.tenantName ?? null,
            tenantLogoUrl: cached.tenantLogoUrl ?? null,
            isAuthenticated: true,
            loading: false,
          });
        }
        try {
          const profileResult = await withTimeout(
            (async () => {
              const profile = await fetchUserRole(sessionUser.id);
              return ensureProfileSetup(sessionUser, profile);
            })(),
            profileTimeoutMs,
          );
          if (profileResult.timedOut) {
            if (!isMounted) {
              return;
            }
            if (!cached) {
              setUser({
                id: sessionUser.id,
                name: sessionUser.email ?? "User",
                email: sessionUser.email ?? undefined,
                phone: null,
                role: "Sales",
                isAdmin: false,
                isOwner: false,
                tenantId: null,
                avatarUrl: null,
                tenantName: null,
                tenantLogoUrl: null,
                isAuthenticated: true,
                loading: false,
              });
            }
            scheduleRetry();
            return;
          }
          const ensuredProfile = profileResult.value;
          if (!isMounted) {
            return;
          }
          writeCachedProfile(sessionUser.id, ensuredProfile);
          setUser({
            id: sessionUser.id,
            name: ensuredProfile.fullName,
            email: sessionUser.email ?? undefined,
            phone: ensuredProfile.phone ?? null,
            role: ensuredProfile.role,
            isAdmin: ensuredProfile.isAdmin,
            isOwner: ensuredProfile.isOwner,
            tenantId: ensuredProfile.tenantId ?? null,
            avatarUrl: ensuredProfile.avatarUrl ?? null,
            tenantName: ensuredProfile.tenantName ?? null,
            tenantLogoUrl: ensuredProfile.tenantLogoUrl ?? null,
            isAuthenticated: true,
            loading: false,
          });
        } catch {
          if (!isMounted) {
            return;
          }
          setUser({
            id: sessionUser.id,
            name: sessionUser.email ?? "User",
            email: sessionUser.email ?? undefined,
            phone: null,
            role: "Sales",
            isAdmin: false,
            isOwner: false,
            tenantId: null,
            avatarUrl: null,
            tenantName: null,
            tenantLogoUrl: null,
            isAuthenticated: true,
            loading: false,
          });
        }
      } catch {
        if (!isMounted) {
          return;
        }
        setUser({ ...fallbackUser, loading: false });
      }
    }

    hydrate();

    const { data: authListener } = sb.auth.onAuthStateChange(
      async (_event, session) => {
        try {
        const sessionUser = session?.user;
        if (!sessionUser) {
          setUser({ ...fallbackUser, loading: false });
          return;
        }
        const cached = readCachedProfile(sessionUser.id);
        if (cached) {
          setUser({
            id: sessionUser.id,
            name: cached.fullName,
            email: sessionUser.email ?? undefined,
            phone: cached.phone ?? null,
            role: cached.role,
            isAdmin: cached.isAdmin,
            isOwner: cached.isOwner ?? false,
            tenantId: cached.tenantId ?? null,
            avatarUrl: cached.avatarUrl ?? null,
            tenantName: cached.tenantName ?? null,
            tenantLogoUrl: cached.tenantLogoUrl ?? null,
            isAuthenticated: true,
            loading: false,
          });
        }
        try {
          const profileResult = await withTimeout(
            (async () => {
              const profile = await fetchUserRole(sessionUser.id);
              return ensureProfileSetup(sessionUser, profile);
            })(),
            profileTimeoutMs,
          );
          if (profileResult.timedOut) {
            if (!cached) {
              setUser({
                id: sessionUser.id,
                name: sessionUser.email ?? "User",
                email: sessionUser.email ?? undefined,
                phone: null,
                role: "Sales",
                isAdmin: false,
                isOwner: false,
                tenantId: null,
                avatarUrl: null,
                tenantName: null,
                tenantLogoUrl: null,
                isAuthenticated: true,
                loading: false,
              });
            }
            scheduleRetry();
            return;
          }
          const ensuredProfile = profileResult.value;
          writeCachedProfile(sessionUser.id, ensuredProfile);
          setUser({
            id: sessionUser.id,
            name: ensuredProfile.fullName,
            email: sessionUser.email ?? undefined,
              phone: ensuredProfile.phone ?? null,
              role: ensuredProfile.role,
              isAdmin: ensuredProfile.isAdmin,
              isOwner: ensuredProfile.isOwner,
              tenantId: ensuredProfile.tenantId ?? null,
              avatarUrl: ensuredProfile.avatarUrl ?? null,
              tenantName: ensuredProfile.tenantName ?? null,
              tenantLogoUrl: ensuredProfile.tenantLogoUrl ?? null,
              isAuthenticated: true,
              loading: false,
            });
          } catch {
            setUser({
              id: sessionUser.id,
              name: sessionUser.email ?? "User",
              email: sessionUser.email ?? undefined,
              phone: null,
              role: "Sales",
              isAdmin: false,
              isOwner: false,
              tenantId: null,
              avatarUrl: null,
              tenantName: null,
              tenantLogoUrl: null,
              isAuthenticated: true,
              loading: false,
            });
          }
        } catch {
          setUser({ ...fallbackUser, loading: false });
        }
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
        const sb = supabase;
        if (!sb) {
          return;
        }
        await sb.auth.signOut();
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
  const { signOut } = useContext(UserContext);
  return { signOut };
}
