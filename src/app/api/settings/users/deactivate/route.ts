import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  requirePermissionForRequest,
  type PermissionAdminClient,
} from "@/lib/server/apiPermission";

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const authCheck = await requirePermissionForRequest(
    request,
    admin as unknown as PermissionAdminClient,
    "settings.manage",
  );
  if (authCheck.response) {
    return authCheck.response;
  }
  const { authUser, tenantId } = authCheck.actor;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (userId === authUser.id) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, tenant_id, is_owner")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.tenant_id !== tenantId) {
    return NextResponse.json(
      { error: "User does not belong to this workspace." },
      { status: 403 },
    );
  }
  if (target.is_owner) {
    return NextResponse.json(
      { error: "Owner cannot be deactivated." },
      { status: 409 },
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      is_active: false,
      tenant_id: null,
      is_admin: false,
      is_owner: false,
    })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to deactivate user." },
      { status: 500 },
    );
  }

  await admin.from("operator_station_assignments").delete().eq("user_id", userId);

  return NextResponse.json({ success: true, userId });
}

