import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  buildOperatorTechnicalEmail,
  normalizeOperatorLoginCode,
} from "@/lib/domain/operatorPinAuth";

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const normalizedLoginCode = normalizeOperatorLoginCode(
    typeof body.loginCode === "string" ? body.loginCode : "",
  );

  if (!normalizedLoginCode) {
    return NextResponse.json(
      { error: "loginCode is required." },
      { status: 400 },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, tenant_id, full_name, auth_mode, is_active, role")
    .eq("login_code", normalizedLoginCode)
    .eq("auth_mode", "pin")
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message ?? "Failed to resolve operator login." },
      { status: 500 },
    );
  }
  if (!profile?.tenant_id || profile.role !== "Operator") {
    return NextResponse.json(
      { error: "Operator login code not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    email: buildOperatorTechnicalEmail({
      loginCode: normalizedLoginCode,
      tenantId: profile.tenant_id,
    }),
    fullName: profile.full_name ?? "",
  });
}
