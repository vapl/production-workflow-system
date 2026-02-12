import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendResendEmail } from "@/lib/server/externalJobEmails";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getStoragePathFromUrl(url: string, bucket: string) {
  if (!url) {
    return null;
  }
  if (!url.startsWith("http")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return parsed.pathname.slice(index + marker.length);
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

type PortalField = {
  id: string;
  key: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "date" | "select" | "toggle";
  scope?: "manual" | "portal_response" | null;
  is_required: boolean;
  options?: { options?: string[] } | null;
  sort_order: number | null;
};

function shouldSkipPortalField(key: string) {
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized === "status";
}

function pickPreferredPortalFields(fields: PortalField[]) {
  const filtered = fields.filter((field) => !shouldSkipPortalField(field.key));
  const preferred =
    filtered.filter((field) => field.scope === "portal_response").length > 0
      ? filtered.filter((field) => field.scope === "portal_response")
      : filtered.filter((field) => (field.scope ?? "manual") === "manual");
  return Array.from(new Map(preferred.map((field) => [field.id, field])).values());
}

async function loadJobByToken(token: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { error: "Supabase service role is not configured." };
  }
  const tokenHash = hashToken(token);
  const { data: job, error } = await admin
    .from("external_jobs")
    .select(
      `
      id,
      tenant_id,
      order_id,
      partner_name,
      partner_email,
      partner_request_sender_name,
      partner_request_sender_email,
      partner_request_sender_phone,
      external_order_number,
      due_date,
      status,
      partner_request_token_expires_at,
      partner_request_viewed_at,
      orders (
        order_number,
        customer_name
      )
    `,
    )
    .eq("partner_request_token_hash", tokenHash)
    .maybeSingle();

  if (error || !job) {
    return { error: "Request not found." };
  }
  if (
    job.partner_request_token_expires_at &&
    new Date(job.partner_request_token_expires_at).getTime() < Date.now()
  ) {
    return { error: "This secure link has expired." };
  }
  return { admin, job };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  const loaded = await loadJobByToken(token);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: 404 });
  }
  const { admin, job } = loaded;

  if (!job.partner_request_viewed_at) {
    await admin
      .from("external_jobs")
      .update({ partner_request_viewed_at: new Date().toISOString() })
      .eq("id", job.id);
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
        .createSignedUrl(row.url, 60 * 60);
      if (!data?.signedUrl) {
        return null;
      }
      return {
        id: row.id,
        name: row.name ?? "Attachment",
        url: data.signedUrl,
      };
    }),
  );

  const { data: fields } = await admin
    .from("external_job_fields")
    .select("id, key, label, field_type, scope, is_required, options, sort_order")
    .eq("tenant_id", job.tenant_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const portalFields = pickPreferredPortalFields((fields ?? []) as PortalField[]);

  let tenantId = job.tenant_id;
  if (!tenantId && job.order_id) {
    const { data: orderRow } = await admin
      .from("orders")
      .select("tenant_id")
      .eq("id", job.order_id)
      .maybeSingle();
    tenantId = orderRow?.tenant_id ?? tenantId;
  }

  const { data: tenant } = tenantId
    ? await admin
        .from("tenants")
        .select("name, legal_name, billing_email, address, logo_url")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null };
  const tenantLogoBucket =
    process.env.NEXT_PUBLIC_SUPABASE_TENANT_BUCKET || "tenant-logos";
  const tenantLogoPath = getStoragePathFromUrl(
    tenant?.logo_url ?? "",
    tenantLogoBucket,
  );
  let tenantLogoUrl = tenant?.logo_url ?? null;
  if (tenantLogoPath) {
    const { data } = await admin.storage
      .from(tenantLogoBucket)
      .createSignedUrl(tenantLogoPath, 60 * 60);
    tenantLogoUrl = data?.signedUrl ?? tenant?.logo_url ?? null;
  }

  const fieldIds = portalFields.map((field) => field.id);
  const { data: valueRows } =
    fieldIds.length > 0
      ? await admin
          .from("external_job_field_values")
          .select("field_id, value")
          .eq("external_job_id", job.id)
          .in("field_id", fieldIds)
      : { data: [] as Array<{ field_id: string; value: unknown }> };
  const values = (valueRows ?? []).reduce<Record<string, unknown>>(
    (acc, row) => {
      acc[row.field_id] = row.value;
      return acc;
    },
    {},
  );

  const companyName =
    (tenant?.name ?? "").trim() ||
    (tenant?.legal_name ?? "").trim() ||
    "";

  return NextResponse.json({
    request: (() => {
      const orderRow = Array.isArray(job.orders) ? job.orders[0] : job.orders;
      return {
        partnerName: job.partner_name ?? "Partner",
        orderNumber: orderRow?.order_number ?? "-",
        customerName: orderRow?.customer_name ?? "-",
        externalOrderNumber: job.external_order_number,
        dueDate: job.due_date,
        companyName,
        companyLogoUrl: tenantLogoUrl,
        companyBillingEmail: tenant?.billing_email ?? "",
        companyAddress: tenant?.address ?? "",
        senderName: job.partner_request_sender_name ?? "",
        senderEmail: job.partner_request_sender_email ?? "",
        senderPhone: job.partner_request_sender_phone ?? "",
      };
    })(),
    attachments: attachments.filter(Boolean),
    fields: portalFields.map((field) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      fieldType: field.field_type,
      isRequired: field.is_required ?? false,
      options: field.options?.options ?? [],
      value: values[field.id] ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  const loaded = await loadJobByToken(token);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: 404 });
  }
  const { admin, job } = loaded;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Use multipart/form-data." },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const partnerOrderNumber =
    typeof formData.get("partnerOrderNumber") === "string"
      ? (formData.get("partnerOrderNumber") as string).trim()
      : "";
  const completionDate =
    typeof formData.get("completionDate") === "string"
      ? (formData.get("completionDate") as string).trim()
      : "";
  const note =
    typeof formData.get("note") === "string"
      ? (formData.get("note") as string).trim()
      : "";
  const file = formData.get("file");

  if (!partnerOrderNumber) {
    return NextResponse.json(
      { error: "Partner order number is required." },
      { status: 400 },
    );
  }
  if (!completionDate) {
    return NextResponse.json(
      { error: "Completion date is required." },
      { status: 400 },
    );
  }

  const { data: fields } = await admin
    .from("external_job_fields")
    .select("id, key, label, field_type, scope, is_required")
    .eq("tenant_id", job.tenant_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const portalFields = pickPreferredPortalFields((fields ?? []) as PortalField[]);

  const portalRows: Array<{
    tenant_id: string;
    external_job_id: string;
    field_id: string;
    value: unknown;
  }> = [];
  for (const field of portalFields) {
    const raw = formData.get(`field_${field.id}`);
    let value: unknown = null;
    if (field.field_type === "toggle") {
      value = raw === "true";
    } else if (field.field_type === "number") {
      const text = typeof raw === "string" ? raw.trim() : "";
      value = text ? Number(text) : null;
      if (value !== null && Number.isNaN(value)) {
        return NextResponse.json(
          { error: `${field.label} must be a number.` },
          { status: 400 },
        );
      }
    } else {
      value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        value = null;
      }
    }
    if (field.is_required) {
      const empty =
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim().length === 0);
      if (empty) {
        return NextResponse.json(
          { error: `${field.label} is required.` },
          { status: 400 },
        );
      }
    }
    if (value !== null) {
      portalRows.push({
        tenant_id: job.tenant_id,
        external_job_id: job.id,
        field_id: field.id,
        value,
      });
    }
  }

  let uploadedAttachment:
    | { name: string; path: string; size: number; mimeType: string }
    | undefined;

  if (file instanceof File && file.size > 0) {
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "order-attachments";
    const safeName = sanitizeFileName(file.name);
    const path = `external-jobs/${job.id}/partner-response-${Date.now()}-${safeName}`;
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    uploadedAttachment = {
      name: file.name,
      path,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    };
  }

  const shouldSetInProgress = job.status !== "in_progress";
  const { error: updateError } = await admin
    .from("external_jobs")
    .update({
      partner_response_submitted_at: new Date().toISOString(),
      partner_response_order_number: partnerOrderNumber,
      partner_response_due_date: completionDate,
      partner_response_note: note || null,
      request_mode: "partner_portal",
      status: shouldSetInProgress ? "in_progress" : job.status,
    })
    .eq("id", job.id);
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to save response." },
      { status: 500 },
    );
  }

  if (shouldSetInProgress) {
    await admin.from("external_job_status_history").insert({
      tenant_id: job.tenant_id,
      external_job_id: job.id,
      status: "in_progress",
      changed_by_name: job.partner_name ?? "Partner",
      changed_by_role: "Partner",
    });
  }

  if (uploadedAttachment) {
    await admin.from("external_job_attachments").insert({
      tenant_id: job.tenant_id,
      external_job_id: job.id,
      name: uploadedAttachment.name,
      url: uploadedAttachment.path,
      size: uploadedAttachment.size,
      mime_type: uploadedAttachment.mimeType,
      added_by_name: job.partner_name ?? "Partner",
      added_by_role: "Partner",
      category: "partner_response",
    });
  }

  if (portalRows.length > 0) {
    await admin
      .from("external_job_field_values")
      .upsert(portalRows, { onConflict: "external_job_id,field_id" });
  }

  await admin.from("order_comments").insert({
    tenant_id: job.tenant_id,
    order_id: job.order_id,
    message: `Partner response received. Partner order #${partnerOrderNumber}, completion date ${formatDate(completionDate)}.`,
    author_name: job.partner_name ?? "Partner",
    author_role: "Partner",
  });

  if (job.partner_email) {
    const orderRow = Array.isArray(job.orders) ? job.orders[0] : job.orders;
    await sendResendEmail({
      to: job.partner_email,
      subject: `PWS confirmation ${orderRow?.order_number ?? ""}`,
      html: `
        <p>Thank you. Your response was received.</p>
        <p><strong>Order:</strong> ${orderRow?.order_number ?? "-"}</p>
        <p><strong>Your order number:</strong> ${partnerOrderNumber}</p>
        <p><strong>Completion date:</strong> ${formatDate(completionDate)}</p>
      `,
      text: [
        "Thank you. Your response was received.",
        `Order: ${orderRow?.order_number ?? "-"}`,
        `Your order number: ${partnerOrderNumber}`,
        `Completion date: ${formatDate(completionDate)}`,
      ].join("\n"),
    });
  }

  return NextResponse.json({ success: true });
}
