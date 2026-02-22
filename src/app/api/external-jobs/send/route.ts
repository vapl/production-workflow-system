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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>,
) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const value = vars[key];
    return value ?? "";
  });
}

const defaultSubjectTemplate = "PWS request {{order_number}} - action required";
const defaultHtmlTemplate = `
  <p>Hello,</p>
  <p>You have received a new external job request from {{customer_name}}.</p>
  <p><strong>Order:</strong> {{order_number}}</p>
  <p><strong>External order:</strong> {{external_order_number}}</p>
  <p><strong>Due date:</strong> {{due_date}}</p>
  {{comment_block}}
  {{attachments_block}}
  <p><a href="{{secure_form_link}}">Open secure form</a></p>
  <p>This link expires on {{expires_at}}.</p>
`;
const defaultTextTemplate = [
  "Hello,",
  "Order: {{order_number}}",
  "Customer: {{customer_name}}",
  "External order: {{external_order_number}}",
  "Due date: {{due_date}}",
  "{{comment_line}}",
  "{{attachments_line}}",
  "Secure form: {{secure_form_link}}",
  "Link expires: {{expires_at}}",
].join("\n");

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
      "name, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified, external_request_email_subject_template, external_request_email_html_template, external_request_email_text_template",
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
  const subjectTemplate =
    tenantSettings?.external_request_email_subject_template?.trim() ||
    defaultSubjectTemplate;
  const htmlTemplate =
    tenantSettings?.external_request_email_html_template?.trim() ||
    defaultHtmlTemplate;
  const textTemplate =
    tenantSettings?.external_request_email_text_template?.trim() ||
    defaultTextTemplate;
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
  const commentBlock = job.partner_request_comment
    ? `<p><strong>Comment:</strong> ${escapeHtml(job.partner_request_comment)}</p>`
    : "";
  const attachmentsBlock =
    safeAttachments.length > 0
      ? `<p><strong>Attachments</strong></p><ul>${attachmentList}</ul>`
      : "<p>No attachments provided.</p>";
  const attachmentsTextLine =
    safeAttachments.length > 0
      ? `Attachments: ${safeAttachments
          .map((item) => `${item.name}${item.url ? ` (${item.url})` : ""}`)
          .join(", ")}`
      : "Attachments: none";
  const templateVars: Record<string, string> = {
    order_number: orderNumber,
    customer_name: customerName,
    external_order_number: job.external_order_number ?? "-",
    due_date: formatDate(job.due_date),
    comment: job.partner_request_comment ?? "",
    comment_block: commentBlock,
    comment_line: job.partner_request_comment
      ? `Comment: ${job.partner_request_comment}`
      : "",
    attachments_block: attachmentsBlock,
    attachments_line: attachmentsTextLine,
    secure_form_link: secureLink,
    expires_at: formatDateTime(expiresAt),
    partner_name: job.partner_name ?? "",
    sender_name: actorName,
    sender_email: actorEmail,
    tenant_name: tenantName,
  };
  const subject = renderTemplate(subjectTemplate, templateVars).trim();
  const htmlBody = renderTemplate(htmlTemplate, templateVars);
  const textBody = renderTemplate(textTemplate, templateVars);

  const emailResult = await sendResendEmail({
    to: partnerEmail,
    from: resolvedFrom,
    replyTo: resolvedReplyTo,
    subject: subject || `PWS request ${orderNumber} - action required`,
    html: htmlBody,
    text: textBody,
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
