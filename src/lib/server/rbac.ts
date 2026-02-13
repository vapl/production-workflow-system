import {
  defaultPermissionRoles,
  type PermissionKey,
} from "@/lib/auth/permissions";

type ActorProfile = {
  role?: string | null;
  is_admin?: boolean | null;
  tenant_id?: string | null;
};

type QueryBuilder = {
  eq: (column: string, value: string) => QueryBuilder;
  maybeSingle: () => Promise<{
    data: { allowed_roles?: string[] | null } | null;
    error: unknown;
  }>;
};

type AdminLikeClient = {
  from: (table: string) => {
    select: (query: string) => QueryBuilder;
  };
};

export async function resolveAllowedRolesForPermission(
  admin: AdminLikeClient,
  tenantId: string,
  permission: PermissionKey,
) {
  const fallback = defaultPermissionRoles[permission];
  const { data } = await admin
    .from("role_permissions")
    .select("allowed_roles")
    .eq("tenant_id", tenantId)
    .eq("permission", permission)
    .maybeSingle();
  if (!data?.allowed_roles || data.allowed_roles.length === 0) {
    return fallback;
  }
  return data.allowed_roles;
}

export function actorHasPermission(
  actor: ActorProfile,
  allowedRoles: readonly string[],
) {
  if (!actor?.tenant_id) {
    return false;
  }
  if (actor.is_admin || actor.role === "Owner" || actor.role === "Admin") {
    return true;
  }
  if (!actor.role) {
    return false;
  }
  return allowedRoles.includes(actor.role);
}
