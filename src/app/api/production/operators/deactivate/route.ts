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
    "production.view",
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
      { error: "You cannot deactivate your own operator access." },
      { status: 400 },
    );
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetProfileError || !targetProfile) {
    return NextResponse.json({ error: "Operator not found." }, { status: 404 });
  }
  if (targetProfile.tenant_id !== tenantId) {
    return NextResponse.json(
      { error: "Operator does not belong to this workspace." },
      { status: 403 },
    );
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      is_active: false,
    })
    .eq("id", userId);

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message ?? "Failed to deactivate operator profile." },
      { status: 500 },
    );
  }

  const { error: operatorError } = await admin
    .from("operators")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (operatorError) {
    return NextResponse.json(
      { error: operatorError.message ?? "Failed to deactivate operator config." },
      { status: 500 },
    );
  }

  const { error: assignmentsError } = await admin
    .from("operator_station_assignments")
    .delete()
    .eq("user_id", userId);

  if (assignmentsError) {
    return NextResponse.json(
      { error: assignmentsError.message ?? "Failed to clear station assignments." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, userId });
}
