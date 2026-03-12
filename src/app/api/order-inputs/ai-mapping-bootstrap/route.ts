import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  getBearerToken,
  requirePermissionForRequest,
  type PermissionAdminClient,
} from "@/lib/server/apiPermission";

type MappingKey =
  | "position"
  | "sku"
  | "item_type"
  | "item_name"
  | "qty"
  | "dimensions"
  | "material";

type ImportTarget = "items" | "bom";

type ParserProfileDraft = {
  layout?: "flat_table" | "grouped_blocks";
  documentHints?: {
    fileNameTokens?: string[];
    sourceFieldKeys?: string[];
    sourceFieldLabels?: string[];
    layoutMarkers?: string[];
  };
  matching?: {
    requiredHeaders?: string[];
  };
  sheet?: {
    role?: "products" | "components";
    sourceSheetName?: string | null;
  };
  rowRules?: {
    itemNameRequired?: boolean;
    startRowIndex?: number;
  };
  blockRules?: {
    articleLabels?: string[];
    positionLabels?: string[];
    quantityLabels?: string[];
  };
};

const MAPPING_KEYS: MappingKey[] = [
  "position",
  "sku",
  "item_type",
  "item_name",
  "qty",
  "dimensions",
  "material",
];

const HEADER_ALIASES: Record<MappingKey, string[]> = {
  position: [
    "position",
    "poz",
    "pozicija",
    "artikuls",
    "article",
    "item code",
    "component code",
    "kods",
  ],
  sku: ["sku", "artikuls", "article", "item", "model", "code", "product", "element"],
  item_type: ["item type", "type", "tips", "viras", "atvilktnes", "kategorija"],
  item_name: [
    "item name",
    "name",
    "nosaukums",
    "furnitura",
    "description",
    "komponente",
    "component",
  ],
  qty: ["qty", "quantity", "skaits", "daudzums", "q-ty"],
  dimensions: ["dimensions", "dim", "izmeri", "izmers", "size", "garums"],
  material: [
    "material",
    "materials",
    "materials / apdare",
    "apdare",
    "piegadatajs",
    "supplier",
  ],
};

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeMapping(mapping: Record<string, unknown>, headers: string[]) {
  const headerSet = new Set(headers);
  const result: Record<MappingKey, string> = {
    position: "",
    sku: "",
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

function extractTextFromResponse(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
  if (payload.output_text && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const fragments =
    payload.output
      ?.flatMap((entry) => entry.content ?? [])
      .map((item) => item.text ?? "")
      .filter((text) => text.trim().length > 0) ?? [];

  return fragments.join("\n").trim();
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function fallbackMappingFromHeaders(headers: string[]) {
  const byNormalized = new Map(headers.map((header) => [normalizeToken(header), header]));
  const mapping: Record<MappingKey, string> = {
    position: "",
    sku: "",
    item_type: "",
    item_name: "",
    qty: "",
    dimensions: "",
    material: "",
  };

  MAPPING_KEYS.forEach((key) => {
    const aliases = HEADER_ALIASES[key] ?? [];
    const exact = aliases.find((alias) => byNormalized.has(normalizeToken(alias)));
    if (exact) {
      mapping[key] = byNormalized.get(normalizeToken(exact)) ?? "";
      return;
    }

    const fuzzy = headers.find((header) => {
      const normalizedHeader = normalizeToken(header);
      return aliases.some((alias) => normalizedHeader.includes(normalizeToken(alias)));
    });
    if (fuzzy) {
      mapping[key] = fuzzy;
    }
  });

  return mapping;
}

function confidenceFromMapping(mapping: Record<MappingKey, string>, base = 0.75) {
  return MAPPING_KEYS.reduce<Record<MappingKey, number>>(
    (acc, key) => {
      acc[key] = mapping[key] ? base : 0;
      return acc;
    },
    {
      position: 0,
      sku: 0,
      item_type: 0,
      item_name: 0,
      qty: 0,
      dimensions: 0,
      material: 0,
    },
  );
}

function detectSampleRowKind(
  row: Record<string, unknown>,
  mapping: Record<MappingKey, string>,
): "product" | "component" | "unknown" {
  const getValue = (key: MappingKey) => {
    const header = mapping[key];
    return header ? String(row[header] ?? "").trim() : "";
  };

  const itemType = getValue("item_type");
  const sku = getValue("sku");
  const position = getValue("position");
  const qty = getValue("qty");
  const material = getValue("material");
  const dimensions = getValue("dimensions");

  if (itemType || sku) {
    return "product";
  }
  if ((position && qty) || (material && qty) || (dimensions && qty)) {
    return "component";
  }
  return "unknown";
}

function buildParserProfileDraft(
  target: ImportTarget,
  mapping: Record<MappingKey, string>,
  sampleRows: Record<string, unknown>[],
  parseMode: "flat_table" | "grouped_blocks",
  fileName?: string,
) {
  let productLikeRows = 0;
  let componentLikeRows = 0;
  let unknownRows = 0;

  sampleRows.forEach((row) => {
    const kind = detectSampleRowKind(row, mapping);
    if (kind === "product") {
      productLikeRows += 1;
      return;
    }
    if (kind === "component") {
      componentLikeRows += 1;
      return;
    }
    unknownRows += 1;
  });

  const suggestedTarget: ImportTarget =
    componentLikeRows > productLikeRows ? "bom" : "items";

  return {
    parserProfileDraft: {
      layout: parseMode,
      documentHints: {
        fileNameTokens: String(fileName ?? "")
          .toLowerCase()
          .replace(/\.[a-z0-9]+$/i, "")
          .split(/[^a-z0-9]+/i)
          .map((value) => value.trim())
          .filter((value) => value.length >= 3),
        sourceFieldKeys: Array.from(
          new Set([
            ...Object.keys(sampleRows[0] ?? {}),
            ...Object.values(mapping).filter(Boolean),
          ]),
        ),
        sourceFieldLabels: Array.from(new Set(Object.values(mapping).filter(Boolean))),
        layoutMarkers: [
          parseMode,
          ...(parseMode === "grouped_blocks"
            ? ["article_header", "summary_row", "component_grid"]
            : ["header_row"]),
        ],
      },
      matching: {
        requiredHeaders: MAPPING_KEYS.map((key) => mapping[key]).filter(Boolean),
      },
      sheet: {
        role: target === "bom" ? "components" : "products",
        sourceSheetName: null,
      },
      blockRules:
        parseMode === "grouped_blocks"
          ? {
              articleLabels: ["Artikuls", "Article", "Item", "Model", "Code"],
              positionLabels: ["PozÄ†ā€˛Ä€Ā«cija", "Position", "Pos"],
              quantityLabels: ["Artikulu skaits", "Quantity", "Qty", "Count"],
            }
          : undefined,
      rowRules: {
        itemNameRequired: true,
        startRowIndex: 2,
      },
    } satisfies ParserProfileDraft,
    rowTypeHints: {
      productLikeRows,
      componentLikeRows,
      unknownRows,
      suggestedTarget,
    },
  };
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
    ? body.headers.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const sampleRows = Array.isArray(body.sampleRows)
    ? (body.sampleRows.slice(0, 30) as Record<string, unknown>[])
    : [];
  const target: ImportTarget = body.target === "bom" ? "bom" : "items";
  const parseMode =
    body.parseMode === "grouped_blocks" ? "grouped_blocks" : "flat_table";
  const fileName =
    typeof body.fileName === "string" ? body.fileName.trim() : "";

  if (headers.length === 0) {
    return NextResponse.json({ error: "headers are required." }, { status: 400 });
  }

  const fallback = fallbackMappingFromHeaders(headers);
  const fallbackConfidence = confidenceFromMapping(fallback, 0.6);
  const fallbackDraft = buildParserProfileDraft(
    target,
    fallback,
    sampleRows,
    parseMode,
    fileName,
  );

  const prompt = `Tu esi vienību importa mapping asistents. Dots faila kolonnu saraksts un daži rindu piemēri.

Atrodi labāko mappingu uz šiem semantiskajiem laukiem:
- position
- sku
- item_type
- item_name (obligāti, ja iespējams)
- qty
- dimensions
- material

Mērķis: ${target}.
Atgriez tikai JSON ar shape:
{
  "mapping": {"position":"...","sku":"...","item_type":"...","item_name":"...","qty":"...","dimensions":"...","material":"..."},
  "confidenceByKey": {"position":0-1,"sku":0-1,"item_type":0-1,"item_name":0-1,"qty":0-1,"dimensions":0-1,"material":0-1},
  "notes": "Īss skaidrojums",
  "parserProfileDraft": {
    "documentHints": {"fileNameTokens":["..."],"sourceFieldKeys":["..."],"sourceFieldLabels":["..."],"layoutMarkers":["..."]},
    "matching": {"requiredHeaders":["..."]},
    "sheet": {"role":"products|components","sourceSheetName":null},
    "blockRules": {"articleLabels":["..."],"positionLabels":["..."],"quantityLabels":["..."]},
    "rowRules": {"itemNameRequired":true,"startRowIndex":2}
  }
}

Izmanto tikai header nosaukumus no saraksta. Ja nav pārliecības, liec tukšu string.`;
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
          { role: "system", content: "Return strict JSON only." },
          {
            role: "user",
            content: `${prompt}\n\nHeaders: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(sampleRows)}`,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload.error?.message ?? "AI bootstrap request failed.",
          mapping: fallback,
          confidenceByKey: fallbackConfidence,
          parserProfileDraft: fallbackDraft.parserProfileDraft,
          rowTypeHints: fallbackDraft.rowTypeHints,
          notes: "AI nepieejams, izmantots heuristiskais fallback.",
          model: "heuristic-fallback",
        },
        { status: 200 },
      );
    }

    const aiText = extractTextFromResponse(payload);
    const aiJson = tryParseJsonObject(aiText);
    const aiMapping = normalizeMapping(
      (aiJson?.mapping as Record<string, unknown>) ?? {},
      headers,
    );
    const aiConfidence = MAPPING_KEYS.reduce<Record<MappingKey, number>>(
      (acc, key) => {
        const raw = (aiJson?.confidenceByKey as Record<string, unknown> | undefined)?.[key];
        const num = typeof raw === "number" ? raw : Number(raw ?? 0);
        acc[key] = Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : 0;
        return acc;
      },
      {
        position: 0,
        sku: 0,
        item_type: 0,
        item_name: 0,
        qty: 0,
        dimensions: 0,
        material: 0,
      },
    );

    const mergedMapping: Record<MappingKey, string> = { ...fallback };
    MAPPING_KEYS.forEach((key) => {
      if (aiMapping[key]) {
        mergedMapping[key] = aiMapping[key];
      }
    });

    const mergedConfidence: Record<MappingKey, number> = { ...fallbackConfidence };
    MAPPING_KEYS.forEach((key) => {
      if (aiMapping[key]) {
        mergedConfidence[key] = aiConfidence[key] > 0 ? aiConfidence[key] : 0.8;
      }
    });

    const hasAny = MAPPING_KEYS.some((key) => mergedMapping[key]);
    if (!hasAny) {
      return NextResponse.json(
        {
          mapping: fallback,
          confidenceByKey: fallbackConfidence,
          parserProfileDraft: fallbackDraft.parserProfileDraft,
          rowTypeHints: fallbackDraft.rowTypeHints,
          notes: "Neizdev?s uzticami ieg?t AI mappingu; lietots fallback p?c header aliasiem.",
          model: "heuristic-fallback",
        },
        { status: 200 },
      );
    }

    const aiParserProfileDraft =
      aiJson?.parserProfileDraft &&
      typeof aiJson.parserProfileDraft === "object" &&
      !Array.isArray(aiJson.parserProfileDraft)
        ? (aiJson.parserProfileDraft as ParserProfileDraft)
        : null;

    const mergedDraft = buildParserProfileDraft(
      target,
      mergedMapping,
      sampleRows,
      parseMode,
      fileName,
    );

    const parserProfileDraft: ParserProfileDraft = {
      layout:
        aiParserProfileDraft?.layout === "grouped_blocks"
          ? "grouped_blocks"
          : "flat_table",
      documentHints: {
        fileNameTokens: aiParserProfileDraft?.documentHints?.fileNameTokens
          ?.map((value) => String(value ?? "").trim())
          .filter(Boolean),
        sourceFieldKeys: aiParserProfileDraft?.documentHints?.sourceFieldKeys
          ?.map((value) => String(value ?? "").trim())
          .filter(Boolean),
        sourceFieldLabels: aiParserProfileDraft?.documentHints?.sourceFieldLabels
          ?.map((value) => String(value ?? "").trim())
          .filter(Boolean),
        layoutMarkers: aiParserProfileDraft?.documentHints?.layoutMarkers
          ?.map((value) => String(value ?? "").trim())
          .filter(Boolean),
      },
      matching: {
        requiredHeaders:
          aiParserProfileDraft?.matching?.requiredHeaders
            ?.map((value) => String(value ?? "").trim())
            .filter((value) => headers.includes(value)) ??
          mergedDraft.parserProfileDraft.matching?.requiredHeaders,
      },
      sheet: {
        role:
          aiParserProfileDraft?.sheet?.role === "products" ||
          aiParserProfileDraft?.sheet?.role === "components"
            ? aiParserProfileDraft.sheet.role
            : mergedDraft.parserProfileDraft.sheet?.role,
        sourceSheetName:
          typeof aiParserProfileDraft?.sheet?.sourceSheetName === "string"
            ? aiParserProfileDraft.sheet.sourceSheetName
            : null,
      },
      rowRules: {
        itemNameRequired:
          typeof aiParserProfileDraft?.rowRules?.itemNameRequired === "boolean"
            ? aiParserProfileDraft.rowRules.itemNameRequired
            : true,
        startRowIndex:
          typeof aiParserProfileDraft?.rowRules?.startRowIndex === "number"
            ? aiParserProfileDraft.rowRules.startRowIndex
            : 2,
      },
      blockRules: {
        articleLabels: aiParserProfileDraft?.blockRules?.articleLabels?.map((value) =>
          String(value ?? "").trim(),
        ).filter(Boolean),
        positionLabels: aiParserProfileDraft?.blockRules?.positionLabels?.map((value) =>
          String(value ?? "").trim(),
        ).filter(Boolean),
        quantityLabels: aiParserProfileDraft?.blockRules?.quantityLabels?.map((value) =>
          String(value ?? "").trim(),
        ).filter(Boolean),
      },
    };

    return NextResponse.json({
      mapping: mergedMapping,
      confidenceByKey: mergedConfidence,
      parserProfileDraft,
      rowTypeHints: mergedDraft.rowTypeHints,
      notes:
        typeof aiJson?.notes === "string" && aiJson.notes.trim().length > 0
          ? aiJson.notes
          : "AI + header alias fallback",
      model: "gpt-4.1-mini",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI bootstrap request failed.";
    return NextResponse.json(
      {
        error: message,
        mapping: fallback,
        confidenceByKey: fallbackConfidence,
        parserProfileDraft: fallbackDraft.parserProfileDraft,
        rowTypeHints: fallbackDraft.rowTypeHints,
        notes: "Neizdev?s uzticami ieg?t AI mappingu; lietots fallback p?c header aliasiem.",
        model: "heuristic-fallback",
      },
      { status: 200 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
