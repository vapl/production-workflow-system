import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : undefined;
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const mode = typeof body.mode === "string" ? body.mode : "signin";
    const companyName =
      typeof body.companyName === "string" ? body.companyName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (mode === "signup" && !companyName) {
      return NextResponse.json(
        { error: "Company name is required for sign up." },
        { status: 400 },
      );
    }

    if (mode === "invite") {
      const origin = getOrigin(request);
      const { data: invite, error: inviteError } = await admin
        .from("user_invites")
        .select("id, tenant_id, full_name, role")
        .eq("email", email)
        .is("accepted_at", null)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inviteError) {
        console.error("Invite lookup failed", inviteError);
        return NextResponse.json(
          { error: inviteError.message ?? "Failed to load invite." },
          { status: 500 },
        );
      }

      if (!invite) {
        return NextResponse.json(
          { error: "Invite not found for this email." },
          { status: 404 },
        );
      }

      if (!admin.auth?.admin?.inviteUserByEmail) {
        console.error("Supabase admin invite method unavailable.");
        return NextResponse.json(
          { error: "Invite API unavailable on this Supabase client." },
          { status: 500 },
        );
      }

      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          tenant_id: invite.tenant_id,
          full_name: invite.full_name,
          role: invite.role,
          require_password_setup: true,
        },
        redirectTo: origin ? `${origin}/auth` : undefined,
      });

      if (error) {
        const message = (error.message ?? "").toLowerCase();
        const alreadyRegistered =
          message.includes("already been registered") ||
          message.includes("already registered") ||
          message.includes("already exists");
        if (!alreadyRegistered) {
          console.error("Invite send failed", error);
          return NextResponse.json(
            { error: error.message ?? "Failed to send invite." },
            { status: 500 },
          );
        }
        const { error: fallbackError } = await admin.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: origin ? `${origin}/auth?invite=1` : undefined,
          },
        );
        if (fallbackError) {
          console.error("Invite resend fallback failed", fallbackError);
          return NextResponse.json(
            { error: fallbackError.message ?? "Failed to resend invite." },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({ success: true });
    }

    if (mode !== "signup") {
      const { data: invite, error: inviteError } = await admin
        .from("user_invites")
        .select("id")
        .eq("email", email)
        .is("accepted_at", null)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inviteError) {
        console.error("Invite lookup failed", inviteError);
        return NextResponse.json(
          { error: inviteError.message ?? "Failed to check invite." },
          { status: 500 },
        );
      }

      if (!invite) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (!profile) {
          return NextResponse.json(
            { error: "You are not invited to this workspace." },
            { status: 403 },
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Request magic link failed", error);
    return NextResponse.json(
      { error: "Unexpected error while sending invite." },
      { status: 500 },
    );
  }
}
