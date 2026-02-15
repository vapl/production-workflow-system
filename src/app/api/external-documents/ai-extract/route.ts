import { NextResponse } from "next/server";

type ExtractField = {
  key: string;
  label: string;
  fieldType?: string;
  aliases?: string[];
};

function extractTextFromResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const maybe = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (typeof maybe.output_text === "string" && maybe.output_text.trim()) {
    return maybe.output_text;
  }
  const chunks: string[] = [];
  for (const item of maybe.output ?? []) {
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, string> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const tryParse = (value: string) => {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(parsed)) {
      out[key] = typeof raw === "string" ? raw : String(raw ?? "");
    }
    return out;
  };
  try {
    return tryParse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    try {
      return tryParse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image files are supported for AI extraction." },
      { status: 400 },
    );
  }

  const rawFields = formData.get("fields");
  let fields: ExtractField[] = [];
  if (typeof rawFields === "string" && rawFields.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawFields) as unknown;
      if (Array.isArray(parsed)) {
        fields = parsed
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const maybe = item as {
              key?: string;
              label?: string;
              fieldType?: string;
              aliases?: string[];
            };
            if (!maybe.key || !maybe.label) {
              return null;
            }
            return {
              key: maybe.key,
              label: maybe.label,
              fieldType: maybe.fieldType,
              aliases: Array.isArray(maybe.aliases) ? maybe.aliases : [],
            } as ExtractField;
          })
          .filter((item): item is ExtractField => Boolean(item));
      }
    } catch {
      fields = [];
    }
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "No AI extract fields are configured." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const imageUrl = `data:${file.type};base64,${base64}`;
  const model = process.env.OPENAI_ORDER_INPUT_MODEL || "gpt-4o";

  const fieldInstructions = fields
    .map((field) => {
      const aliases = (field.aliases ?? [])
        .filter((alias) => alias.trim().length > 0)
        .join(", ");
      return aliases.length > 0
        ? `- ${field.key}: ${field.label} (aliases: ${aliases})`
        : `- ${field.key}: ${field.label}`;
    })
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Extract structured values from supplier document images. " +
                "Return ONLY valid JSON object with requested keys. " +
                "Use empty string when unsure.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract the following fields and return JSON only:\n" +
                fieldInstructions,
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "AI extraction request failed." },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as unknown;
  const rawText = extractTextFromResponse(payload);
  const parsed = parseJsonObject(rawText);
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse AI response.", rawText },
      { status: 422 },
    );
  }

  const normalized: Record<string, string> = {};
  for (const field of fields) {
    normalized[field.key] = parsed[field.key]?.trim?.() ?? "";
  }
  return NextResponse.json({ fields: normalized });
}

