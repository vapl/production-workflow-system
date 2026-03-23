import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  requirePermissionForRequest,
  type PermissionAdminClient,
} from "@/lib/server/apiPermission";
import {
  buildOperatorAuthPassword,
  buildOperatorTechnicalEmail,
  isValidOperatorLoginCode,
  isValidOperatorPin,
  normalizeOperatorLoginCode,
} from "@/lib/domain/operatorPinAuth";

type UpsertPayload = {
  userId?: string;
  fullName?: string;
  loginCode?: string;
  pin?: string;
  hourlyRate?: number | null;
  overtimeRate?: number | null;
  stationIds?: string[];
};

function sanitizeOperatorAuthError(
  message: string | null | undefined,
  fallback: string,
) {
  const normalized = String(message ?? "").trim();
  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("already exists")
  ) {
    return "Operatora piekļuves konts jau eksistē. Atjauninām esošo kontu.";
  }

  if (
    lower.includes("@internal.production.local") ||
    lower.includes("email address")
  ) {
    return fallback;
  }

  return normalized;
}

function parseOptionalNumber(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

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
  const { tenantId } = authCheck.actor;

  const body = (await request.json().catch(() => ({}))) as UpsertPayload;
  const userId = typeof body.userId === "string" ? body.userId : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const normalizedLoginCode = normalizeOperatorLoginCode(
    typeof body.loginCode === "string" ? body.loginCode : "",
  );
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const hourlyRate = parseOptionalNumber(body.hourlyRate);
  const overtimeRate = parseOptionalNumber(body.overtimeRate);
  const stationIds = Array.isArray(body.stationIds)
    ? Array.from(
        new Set(body.stationIds.filter((value): value is string => typeof value === "string")),
      )
    : [];

  if (!fullName) {
    return NextResponse.json(
      { error: "fullName is required." },
      { status: 400 },
    );
  }
  if (!normalizedLoginCode || !isValidOperatorLoginCode(normalizedLoginCode)) {
    return NextResponse.json(
      { error: "loginCode must be 2-24 characters and contain only letters, numbers, underscore, or dash." },
      { status: 400 },
    );
  }
  if (!userId && !isValidOperatorPin(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }
  if (pin && !isValidOperatorPin(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const { data: conflictingProfile, error: conflictingProfileError } = await admin
    .from("profiles")
    .select("id")
    .eq("login_code", normalizedLoginCode)
    .neq("id", userId || "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  if (conflictingProfileError) {
    return NextResponse.json(
      { error: conflictingProfileError.message ?? "Failed to validate login code." },
      { status: 500 },
    );
  }
  if (conflictingProfile?.id) {
    return NextResponse.json(
      { error: "This login code is already used by another operator." },
      { status: 409 },
    );
  }

  let targetUserId = userId;
  const technicalEmail = buildOperatorTechnicalEmail({
    loginCode: normalizedLoginCode,
    tenantId,
  });
  const authPassword = pin ? buildOperatorAuthPassword(pin) : "";

  if (!targetUserId) {
    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email: technicalEmail,
        password: authPassword,
        email_confirm: true,
        user_metadata: {
          auth_mode: "pin",
          login_code: normalizedLoginCode,
          full_name: fullName,
        },
      });

    if (createUserError || !createdUser.user) {
      const createMessage = createUserError?.message ?? "";
      const isDuplicateEmail =
        createMessage.toLowerCase().includes("already been registered") ||
        createMessage.toLowerCase().includes("already registered") ||
        createMessage.toLowerCase().includes("already exists");

      if (isDuplicateEmail) {
        const { data: listedUsers, error: listUsersError } =
          await admin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });

        if (listUsersError) {
          return NextResponse.json(
            {
              error: sanitizeOperatorAuthError(
                listUsersError.message,
                "Neizdevās atrast esošo operatora kontu.",
              ),
            },
            { status: 500 },
          );
        }

        const existingUser = listedUsers.users.find(
          (listedUser) =>
            String(listedUser.email ?? "").toLowerCase() ===
            technicalEmail.toLowerCase(),
        );

        if (!existingUser) {
          return NextResponse.json(
            {
              error: sanitizeOperatorAuthError(
                createMessage,
                "Neizdevās izveidot operatora kontu.",
              ),
            },
            { status: 500 },
          );
        }

        targetUserId = existingUser.id;

        const { error: recoverUserError } =
          await admin.auth.admin.updateUserById(targetUserId, {
            email: technicalEmail,
            password: authPassword,
            user_metadata: {
              auth_mode: "pin",
              login_code: normalizedLoginCode,
              full_name: fullName,
            },
          });

        if (recoverUserError) {
          return NextResponse.json(
            {
              error: sanitizeOperatorAuthError(
                recoverUserError.message,
                "Neizdevās atjaunot esošo operatora kontu.",
              ),
            },
            { status: 500 },
          );
        }
      } else {
        return NextResponse.json(
          {
            error: sanitizeOperatorAuthError(
              createMessage,
              "Neizdevās izveidot operatora kontu.",
            ),
          },
          { status: 500 },
        );
      }
    } else {
      targetUserId = createdUser.user.id;
    }
  } else {
    const updatePayload: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {
      email: technicalEmail,
      user_metadata: {
        auth_mode: "pin",
        login_code: normalizedLoginCode,
        full_name: fullName,
      },
    };
    if (pin) {
      updatePayload.password = authPassword;
    }
    const { error: updateUserError } = await admin.auth.admin.updateUserById(
      targetUserId,
      updatePayload,
    );
    if (updateUserError) {
      return NextResponse.json(
        {
          error: sanitizeOperatorAuthError(
            updateUserError.message,
            "Neizdevās atjaunināt operatora piekļuvi.",
          ),
        },
        { status: 500 },
      );
    }
  }

  const profilePayload = {
    id: targetUserId,
    tenant_id: tenantId,
    full_name: fullName,
    role: "Operator",
    is_admin: false,
    is_owner: false,
    is_active: true,
    login_code: normalizedLoginCode,
    auth_mode: "pin",
  };

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message ?? "Failed to save operator profile." },
      { status: 500 },
    );
  }

  const { data: existingOperator, error: existingOperatorError } = await admin
    .from("operators")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existingOperatorError) {
    return NextResponse.json(
      { error: existingOperatorError.message ?? "Failed to load operator configuration." },
      { status: 500 },
    );
  }

  const operatorPayload = {
    tenant_id: tenantId,
    user_id: targetUserId,
    name: fullName,
    role: "Operator",
    hourly_rate: hourlyRate,
    overtime_rate: overtimeRate,
    is_active: true,
  };

  const operatorQuery = existingOperator?.id
    ? admin
        .from("operators")
        .update(operatorPayload)
        .eq("id", existingOperator.id)
    : admin.from("operators").insert(operatorPayload);

  const { error: operatorError } = await operatorQuery;
  if (operatorError) {
    return NextResponse.json(
      { error: operatorError.message ?? "Failed to save operator config." },
      { status: 500 },
    );
  }

  const { error: assignmentsDeleteError } = await admin
    .from("operator_station_assignments")
    .delete()
    .eq("user_id", targetUserId);

  if (assignmentsDeleteError) {
    return NextResponse.json(
      { error: assignmentsDeleteError.message ?? "Failed to reset station assignments." },
      { status: 500 },
    );
  }

  if (stationIds.length > 0) {
    const { error: assignmentsInsertError } = await admin
      .from("operator_station_assignments")
      .insert(
        stationIds.map((stationId) => ({
          tenant_id: tenantId,
          user_id: targetUserId,
          station_id: stationId,
          is_active: true,
        })),
      );

    if (assignmentsInsertError) {
      return NextResponse.json(
        { error: assignmentsInsertError.message ?? "Failed to save station assignments." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    userId: targetUserId,
  });
}
