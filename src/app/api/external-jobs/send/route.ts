import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendResendEmail } from "@/lib/server/externalJobEmails";
import {
  getBearerToken,
  type PermissionAdminClient,
} from "@/lib/server/apiPermission";
import {
  actorHasPermission,
  resolveAllowedRolesForPermission,
} from "@/lib/server/rbac";

function getOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : undefined;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function emailDomain(value?: string | null) {
  if (!value || !value.includes("@")) {
    return "";
  }
  return value.split("@")[1]?.trim().toLowerCase() ?? "";
}

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const bearer = getBearerToken(request);
  if (!bearer) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }
  const { data: authData, error: authError } = await (
    admin as unknown as PermissionAdminClient
  ).auth.getUser(bearer);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const authUser = authData.user;
  const { data: actorProfile } = await admin
    .from("profiles")
    .select("id, tenant_id, full_name, role, phone, is_admin, is_owner")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!actorProfile?.tenant_id) {
    return NextResponse.json(
      { error: "User tenant is not configured." },
      { status: 403 },
    );
  }
  const tenantId = actorProfile.tenant_id;
  const [ordersManageRoles, productionViewRoles, productionOperatorViewRoles] =
    await Promise.all([
      resolveAllowedRolesForPermission(
        admin as unknown as PermissionAdminClient,
        tenantId,
        "orders.manage",
      ),
      resolveAllowedRolesForPermission(
        admin as unknown as PermissionAdminClient,
        tenantId,
        "production.view",
      ),
      resolveAllowedRolesForPermission(
        admin as unknown as PermissionAdminClient,
        tenantId,
        "production.operator.view",
      ),
    ]);
  const canSendExternalRequest =
    actorHasPermission(actorProfile, ordersManageRoles) ||
    actorHasPermission(actorProfile, productionViewRoles) ||
    actorHasPermission(actorProfile, productionOperatorViewRoles) ||
    actorProfile.role === "Engineering";
  if (!canSendExternalRequest) {
    return NextResponse.json(
      { error: "Missing permission: external_jobs.send" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const externalJobId =
    typeof body.externalJobId === "string" ? body.externalJobId : "";
  if (!externalJobId) {
    return NextResponse.json(
      { error: "externalJobId is required." },
      { status: 400 },
    );
  }

  const { data: subscription } = await admin
    .from("tenant_subscriptions")
    .select("plan_code, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const canSendToPartner =
    (subscription?.plan_code ?? "basic") === "pro" &&
    ["active", "trial"].includes(subscription?.status ?? "active");
  if (!canSendToPartner) {
    return NextResponse.json(
      { error: "feature_not_available" },
      { status: 403 },
    );
  }

  const { data: tenantSettings } = await admin
    .from("tenants")
    .select(
      "name, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified",
    )
    .eq("id", tenantId)
    .maybeSingle();

  const { data: job, error: jobError } = await admin
    .from("external_jobs")
    .select(
      `
      id,
      tenant_id,
      order_id,
      partner_id,
      partner_name,
      partner_email,
      partner_request_comment,
      external_order_number,
      due_date,
      status,
      request_mode,
      partner_request_sender_name,
      partner_request_sender_email,
      partner_request_sender_phone,
      partner_request_sent_at,
      partner_request_token_hash,
      partner_request_token_expires_at,
      orders (
        order_number,
        customer_name
      )
    `,
    )
    .eq("id", externalJobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (jobError || !job) {
    return NextResponse.json(
      { error: "External job not found." },
      { status: 404 },
    );
  }

  let partnerEmail = job.partner_email ?? "";
  if (!partnerEmail && job.partner_id) {
    const { data: partner } = await admin
      .from("partners")
      .select("email")
      .eq("id", job.partner_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    partnerEmail = partner?.email ?? "";
  }
  if (!partnerEmail) {
    return NextResponse.json(
      { error: "Partner email is missing." },
      { status: 400 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const shouldSetOrdered = job.status === "requested";
  const nextStatus = shouldSetOrdered ? "ordered" : job.status;

  const { error: updateError } = await admin
    .from("external_jobs")
    .update({
      request_mode: "partner_portal",
      partner_email: partnerEmail,
      partner_request_sender_name:
        actorProfile.full_name ?? authUser.email ?? "User",
      partner_request_sender_email: authUser.email ?? null,
      partner_request_sender_phone: actorProfile.phone ?? null,
      partner_request_sent_at: new Date().toISOString(),
      partner_request_token_hash: tokenHash,
      partner_request_token_expires_at: expiresAt,
      status: nextStatus,
    })
    .eq("id", job.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to send to partner." },
      { status: 500 },
    );
  }

  const { data: attachmentRows } = await admin
    .from("external_job_attachments")
    .select("id, name, url")
    .eq("external_job_id", job.id)
    .order("created_at", { ascending: true });

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "order-attachments";
  const attachments = await Promise.all(
    (attachmentRows ?? []).map(async (row) => {
      if (!row.url) {
        return null;
      }
      const { data } = await admin.storage
        .from(bucket)
        .createSignedUrl(row.url, 7 * 24 * 60 * 60);
      return {
        name: row.name ?? "Attachment",
        url: data?.signedUrl ?? null,
      };
    }),
  );
  const safeAttachments = attachments.filter(
    (item): item is { name: string; url: string | null } => Boolean(item),
  );

  const origin = getOrigin(request);
  const secureLink = `${origin ?? ""}/external-jobs/respond/${token}`;
  const orderRow = Array.isArray(job.orders) ? job.orders[0] : job.orders;
  const orderNumber = orderRow?.order_number ?? "-";
  const customerName = orderRow?.customer_name ?? "-";
  const attachmentList = safeAttachments
    .map((item) => {
      if (!item.url) {
        return `<li>${item.name}</li>`;
      }
      return `<li><a href="${item.url}" target="_blank" rel="noreferrer">${item.name}</a></li>`;
    })
    .join("");
  const subject = `PWS request ${orderNumber} - action required`;
  const actorEmail = authUser.email ?? "";
  const actorName = actorProfile.full_name ?? actorEmail ?? "User";
  const tenantName = tenantSettings?.name?.trim() || "PWS";
  const tenantFromName = tenantSettings?.outbound_from_name?.trim() || tenantName;
  const tenantFromEmail = tenantSettings?.outbound_from_email?.trim() || "";
  const tenantReplyTo = tenantSettings?.outbound_reply_to_email?.trim() || "";
  const useUserSender = tenantSettings?.outbound_use_user_sender ?? true;
  const isSenderVerified = tenantSettings?.outbound_sender_verified ?? false;
  const tenantDomain = emailDomain(tenantFromEmail);
  const actorDomain = emailDomain(actorEmail);
  const canUseActorSender =
    isSenderVerified &&
    useUserSender &&
    Boolean(actorEmail) &&
    Boolean(tenantDomain) &&
    actorDomain === tenantDomain;
  const resolvedFrom =
    isSenderVerified && tenantFromEmail
      ? canUseActorSender
        ? `${actorName} <${actorEmail}>`
        : `${tenantFromName} <${tenantFromEmail}>`
      : undefined;
  const resolvedReplyTo = actorEmail || tenantReplyTo || undefined;

  const emailResult = await sendResendEmail({
    to: partnerEmail,
    from: resolvedFrom,
    replyTo: resolvedReplyTo,
    subject,
    html: `
      <p>Hello,</p>
      <p>You have received a new external job request from ${customerName}.</p>
      <p><strong>Order:</strong> ${orderNumber}</p>
      <p><strong>External order:</strong> ${job.external_order_number}</p>
      <p><strong>Due date:</strong> ${formatDate(job.due_date)}</p>
      ${
        job.partner_request_comment
          ? `<p><strong>Comment:</strong> ${job.partner_request_comment}</p>`
          : ""
      }
      ${
        safeAttachments.length > 0
          ? `<p><strong>Attachments</strong></p><ul>${attachmentList}</ul>`
          : "<p>No attachments provided.</p>"
      }
      <p><a href="${secureLink}">Open secure form</a></p>
      <p>This link expires on ${formatDateTime(expiresAt)}.</p>
    `,
    text: [
      "Hello,",
      `Order: ${orderNumber}`,
      `External order: ${job.external_order_number}`,
      `Due date: ${formatDate(job.due_date)}`,
      job.partner_request_comment
        ? `Comment: ${job.partner_request_comment}`
        : "",
      `Secure form: ${secureLink}`,
      `Link expires: ${expiresAt}`,
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n"),
  });
  if (!emailResult.ok) {
    await admin
      .from("external_jobs")
      .update({
        request_mode: job.request_mode ?? "manual",
        partner_email: job.partner_email ?? null,
        partner_request_sender_name: job.partner_request_sender_name ?? null,
        partner_request_sender_email: job.partner_request_sender_email ?? null,
        partner_request_sender_phone: job.partner_request_sender_phone ?? null,
        partner_request_sent_at: job.partner_request_sent_at ?? null,
        partner_request_token_hash: job.partner_request_token_hash ?? null,
        partner_request_token_expires_at:
          job.partner_request_token_expires_at ?? null,
        status: job.status,
      })
      .eq("id", job.id);
    return NextResponse.json(
      { error: emailResult.error ?? "Failed to send email." },
      { status: 500 },
    );
  }

  if (shouldSetOrdered) {
    await admin.from("external_job_status_history").insert({
      tenant_id: tenantId,
      external_job_id: job.id,
      status: "ordered",
      changed_by_name: actorProfile.full_name ?? authUser.email ?? "User",
      changed_by_role: actorProfile.role ?? "Sales",
    });
  }

  return NextResponse.json({
    success: true,
    expiresAt,
  });
}
