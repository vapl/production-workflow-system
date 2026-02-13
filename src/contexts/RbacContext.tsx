"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  defaultPermissionRoles,
  hasPermission as hasPermissionWithMap,
  mergePermissionRoles,
  type PermissionKey,
  type PermissionRoleMap,
} from "@/lib/auth/permissions";
import { normalizeUserRole, useCurrentUser, type UserRole } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";

interface RbacContextValue {
  permissions: PermissionRoleMap;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: PermissionKey) => boolean;
  savePermissionRoles: (
    permission: PermissionKey,
    roles: UserRole[],
  ) => Promise<{ error?: string }>;
  refresh: () => Promise<void>;
}

const fallback: RbacContextValue = {
  permissions: defaultPermissionRoles,
  loading: false,
  error: null,
  hasPermission: () => false,
  savePermissionRoles: async () => ({ error: "RBAC context not available." }),
  refresh: async () => undefined,
};

const RbacContext = createContext<RbacContextValue>(fallback);

function mapDbRoles(raw: unknown): UserRole[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((value) => normalizeUserRole(typeof value === "string" ? value : null))
    .filter(Boolean);
}

export function RbacProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [permissions, setPermissions] =
    useState<PermissionRoleMap>(defaultPermissionRoles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user.isAuthenticated || !user.tenantId) {
      setPermissions(defaultPermissionRoles);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("role_permissions")
      .select("permission, allowed_roles")
      .eq("tenant_id", user.tenantId);
    if (fetchError) {
      setPermissions(defaultPermissionRoles);
      setError(fetchError.message);
      setLoading(false);
      return;
    }
    const mapped: Partial<Record<PermissionKey, UserRole[]>> = {};
    (data ?? []).forEach((row) => {
      const key = row.permission as PermissionKey;
      if (!(key in defaultPermissionRoles)) {
        return;
      }
      mapped[key] = mapDbRoles(row.allowed_roles);
    });
    setPermissions(mergePermissionRoles(mapped));
    setLoading(false);
  }, [user.isAuthenticated, user.tenantId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [refresh]);

  const value: RbacContextValue = {
    permissions,
    loading,
    error,
    hasPermission: (permission) =>
      hasPermissionWithMap(user, permission, permissions),
    savePermissionRoles: async (permission, roles) => {
      if (!supabase || !user.tenantId) {
        return { error: "Supabase is not configured." };
      }
      const { error: saveError } = await supabase
        .from("role_permissions")
        .upsert(
          {
            tenant_id: user.tenantId,
            permission,
            allowed_roles: Array.from(new Set(roles)),
          },
          { onConflict: "tenant_id,permission" },
        );
      if (saveError) {
        return { error: saveError.message };
      }
      setPermissions((prev) =>
        mergePermissionRoles({
          ...prev,
          [permission]: Array.from(new Set(roles)),
        }),
      );
      return {};
    },
    refresh,
  };

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac() {
  return useContext(RbacContext);
}
