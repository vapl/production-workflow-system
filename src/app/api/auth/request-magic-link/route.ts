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

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
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

  if (mode !== "signup") {
    const { data: invite } = await admin
      .from("user_invites")
      .select("id")
      .eq("email", email)
      .is("accepted_at", null)
      .order("invited_at", { ascending: false })
      .maybeSingle();

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

  const origin = getOrigin(request);
  const redirectTo = origin ? `${origin}/auth` : undefined;

  const { error } = await admin.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
