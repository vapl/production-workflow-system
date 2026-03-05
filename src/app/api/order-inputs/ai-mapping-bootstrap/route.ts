import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  getBearerToken,
  requirePermissionForRequest,
  type PermissionAdminClient,
} from "@/lib/server/apiPermission";

type MappingKey =
  | "position"
  | "item_type"
  | "item_name"
  | "qty"
  | "dimensions"
  | "material";

const MAPPING_KEYS: MappingKey[] = [
  "position",
  "item_type",
  "item_name",
  "qty",
  "dimensions",
  "material",
];

function normalizeMapping(mapping: Record<string, unknown>, headers: string[]) {
  const headerSet = new Set(headers);
  const result: Record<MappingKey, string> = {
    position: "",
    item_type: "",
    item_name: "",
    qty: "",
    dimensions: "",
    material: "",
  };

  MAPPING_KEYS.forEach((key) => {
    const value = mapping[key];
    const asString = typeof value === "string" ? value.trim() : "";
    if (asString && headerSet.has(asString)) {
      result[key] = asString;
    }
  });

  return result;
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
    "orders.manage",
  );

  let tenantId: string;
  if (authCheck.response) {
    const bearer = getBearerToken(request);
    if (!bearer) {
      return authCheck.response;
    }
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) {
      return authCheck.response;
    }
    const { data: actorProfile } = await admin
      .from("profiles")
      .select("id, tenant_id, role, is_admin, is_owner")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!actorProfile?.tenant_id || actorProfile.role !== "Engineering") {
      return authCheck.response;
    }
    tenantId = actorProfile.tenant_id;
  } else {
    tenantId = authCheck.actor.tenantId;
  }

  const { data: subscription } = await admin
    .from("tenant_subscriptions")
    .select("plan_code, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const canUseAiImport =
    (subscription?.plan_code ?? "basic") === "pro" &&
    ["active", "trial"].includes(subscription?.status ?? "active");
  if (!canUseAiImport) {
    return NextResponse.json({ error: "feature_not_available" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const headers = Array.isArray(body.headers)
    ? body.headers.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
    : [];
  const sampleRows = Array.isArray(body.sampleRows)
    ? body.sampleRows.slice(0, 30)
    : [];
  const target = body.target === "bom" ? "bom" : "items";

  if (headers.length === 0) {
    return NextResponse.json({ error: "headers are required." }, { status: 400 });
  }

  const prompt = `Tu esi ERP importa mapping asistents. Dots faila kolonnu saraksts un daži rindu piemēri.\n
Atrodi labāko mappingu uz semantiskajiem laukiem:
- position
- item_type
- item_name (obligāti ja iespējams)
- qty
- dimensions
- material

Mērķis: ${target}.
Atgriez tikai JSON ar shape:
{
  "mapping": {"position":"...","item_type":"...","item_name":"...","qty":"...","dimensions":"...","material":"..."},
  "confidenceByKey": {"position":0-1,"item_type":0-1,"item_name":0-1,"qty":0-1,"dimensions":0-1,"material":0-1},
  "notes": "īss skaidrojums"
}

Izmanto TIKAI header nosaukumus no saraksta. Ja nav pārliecības, liec tukšu string.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        input: [
          {
            role: "system",
            content: "Return strict JSON only.",
          },
          {
            role: "user",
            content: `${prompt}\n\nHeaders: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(sampleRows)}`,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      output_text?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error?.message ?? "AI bootstrap request failed." },
        { status: 502 },
      );
    }

    const text = payload.output_text ?? "{}";
    const parsed = JSON.parse(text) as {
      mapping?: Record<string, unknown>;
      confidenceByKey?: Record<string, unknown>;
      notes?: string;
    };

    const normalizedMapping = normalizeMapping(parsed.mapping ?? {}, headers);
    const confidenceByKey = MAPPING_KEYS.reduce<Record<MappingKey, number>>((acc, key) => {
      const raw = parsed.confidenceByKey?.[key];
      const num = typeof raw === "number" ? raw : Number(raw ?? 0);
      acc[key] = Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : 0;
      return acc;
    }, {
      position: 0,
      item_type: 0,
      item_name: 0,
      qty: 0,
      dimensions: 0,
      material: 0,
    });

    return NextResponse.json({
      mapping: normalizedMapping,
      confidenceByKey,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      model: "gpt-4.1-mini",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI bootstrap request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
