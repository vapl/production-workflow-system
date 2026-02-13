import { NextResponse } from "next/server";
import {
  actorHasPermission,
  resolveAllowedRolesForPermission,
} from "@/lib/server/rbac";
import type { PermissionKey } from "@/lib/auth/permissions";

type AdminClient = {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: {
        user: {
          id: string;
          email?: string | null;
        } | null;
      };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (query: string) => QueryBuilder;
  };
};

type QueryBuilder = {
  eq: (column: string, value: string) => QueryBuilder;
  maybeSingle: () => Promise<{
    data: {
      id?: string;
      tenant_id?: string | null;
      role?: string | null;
      is_admin?: boolean | null;
      full_name?: string | null;
      phone?: string | null;
      allowed_roles?: string[] | null;
    } | null;
    error: unknown;
  }>;
};

export interface AuthorizedActorContext {
  authUser: {
    id: string;
    email?: string | null;
  };
  actorProfile: {
    id?: string;
    tenant_id?: string | null;
    role?: string | null;
    is_admin?: boolean | null;
    full_name?: string | null;
    phone?: string | null;
  };
  tenantId: string;
}

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export async function requirePermissionForRequest(
  request: Request,
  admin: AdminClient,
  permission: PermissionKey,
) {
  const bearer = getBearerToken(request);
  if (!bearer) {
    return {
      response: NextResponse.json(
        { error: "Missing auth token." },
        { status: 401 },
      ),
    };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("id, tenant_id, full_name, role, phone, is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!actorProfile?.tenant_id) {
    return {
      response: NextResponse.json(
        { error: "User tenant is not configured." },
        { status: 403 },
      ),
    };
  }

  const allowedRoles = await resolveAllowedRolesForPermission(
    admin,
    actorProfile.tenant_id,
    permission,
  );

  if (!actorHasPermission(actorProfile, allowedRoles)) {
    return {
      response: NextResponse.json(
        { error: `Missing permission: ${permission}` },
        { status: 403 },
      ),
    };
  }

  return {
    actor: {
      authUser: authData.user,
      actorProfile,
      tenantId: actorProfile.tenant_id,
    } satisfies AuthorizedActorContext,
  };
}
