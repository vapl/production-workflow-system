import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  actorHasPermission,
  resolveAllowedRolesForPermission,
} from "@/lib/server/rbac";

type TableColumnType = "text" | "number" | "select";

interface ParseColumn {
  key: string;
  label: string;
  aiKey?: string;
  fieldType: TableColumnType;
  options?: string[];
  maxSelect?: number;
}

interface ParsedDocumentInput {
  name: string;
  mimeType: string;
  bytes: Buffer;
}

interface OpenAiResponse {
  output_text?: string;
  output_parsed?: {
    rows?: unknown[];
  };
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      parsed?: {
        rows?: unknown[];
      };
    }>;
  }>;
  error?: {
    message?: string;
  };
}

interface ParseAttemptResult {
  rows: unknown[];
  model: string;
  rawText: string;
}

interface OpenAiFileResponse {
  id?: string;
  error?: {
    message?: string;
  };
}

const OPENAI_REQUEST_TIMEOUT_MS = 35000;
const OPENAI_FILE_UPLOAD_TIMEOUT_MS = 45000;
const PARSE_TOTAL_TIMEOUT_MS = 90000;
const OPENAI_MAX_RETRIES = 2;

function shouldRetryOpenAiStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenAiWithTimeout(
  apiKey: string,
  payload: unknown,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (
        response.ok ||
        !shouldRetryOpenAiStatus(response.status) ||
        attempt === OPENAI_MAX_RETRIES
      ) {
        return response;
      }
      await sleep(400 * (attempt + 1));
      continue;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError =
        error instanceof Error ? error : new Error("OpenAI request failed.");
      if (attempt === OPENAI_MAX_RETRIES) {
        break;
      }
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError ?? new Error("OpenAI request failed.");
}

async function uploadOpenAiFileWithTimeout(
  apiKey: string,
  file: ParsedDocumentInput,
  timeoutMs = OPENAI_FILE_UPLOAD_TIMEOUT_MS,
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new FormData();
      form.append("purpose", "user_data");
      form.append(
        "file",
        new Blob([file.bytes], { type: file.mimeType || "application/pdf" }),
        file.name || "document.pdf",
      );
      const response = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        signal: controller.signal,
      });
      if (
        response.ok ||
        !shouldRetryOpenAiStatus(response.status) ||
        attempt === OPENAI_MAX_RETRIES
      ) {
        return response;
      }
      await sleep(400 * (attempt + 1));
      continue;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError =
        error instanceof Error
          ? error
          : new Error("OpenAI file upload failed.");
      if (attempt === OPENAI_MAX_RETRIES) {
        break;
      }
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError ?? new Error("OpenAI file upload failed.");
}

async function deleteOpenAiFile(apiKey: string, fileId: string) {
  try {
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    // best effort cleanup
  }
}

function inferValueFromTextBlock(
  block: string,
  column: ParseColumn,
): string | string[] {
  const key = normalizeToken(column.key);
  const label = normalizeToken(column.label);
  const aiKey = normalizeToken(column.aiKey ?? "");
  const text = block.replace(/\s+/g, " ").trim();

  if (
    key.includes("position") ||
    label.includes("position") ||
    aiKey.includes("position") ||
    key === "pos" ||
    label === "pos" ||
    aiKey === "pos"
  ) {
    const posMatch = block.match(/Pos\.?\s*([A-Za-z0-9-]+)/i);
    return posMatch?.[1]?.trim() ?? "";
  }

  if (
    key.includes("quantity") ||
    key.includes("skaits") ||
    label.includes("quantity") ||
    label.includes("skaits") ||
    aiKey.includes("quantity") ||
    aiKey.includes("skaits")
  ) {
    const qtyMatch = block.match(
      /(Quantity|Skaits|Qty)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    );
    return qtyMatch?.[2]?.trim() ?? "";
  }

  if (
    key.includes("system") ||
    label.includes("system") ||
    aiKey.includes("system") ||
    aiKey.includes("construction")
  ) {
    const systemMatch = block.match(/Construction\s*:?\s*([^\n\r]+)/i);
    if (systemMatch?.[1]) {
      return systemMatch[1].trim();
    }
    const posLineMatch = block.match(/Pos\.?\s*[A-Za-z0-9-]+\s*([^\n\r]+)/i);
    if (posLineMatch?.[1]) {
      return posLineMatch[1].trim();
    }
    const fallbackLine = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 6 &&
          !/^(pos|quantity|description|construction|profiles|hardware|filling|production)/i.test(
            line,
          ),
      );
    if (fallbackLine) {
      return fallbackLine;
    }
    return "";
  }

  if (
    key.includes("color") ||
    key.includes("colour") ||
    label.includes("color") ||
    label.includes("colour") ||
    aiKey.includes("color") ||
    aiKey.includes("colour")
  ) {
    const colorMatch = block.match(
      /(Paint colour|Hardware colour|colour|color)\s*:?\s*([A-Za-z0-9 _-]+)/i,
    );
    return colorMatch?.[2]?.trim() ?? "";
  }

  if (column.fieldType === "select") {
    const options = (column.options ?? []).filter(Boolean);
    const found = options.find((option) =>
      text.toLowerCase().includes(option.toLowerCase()),
    );
    if (!found) {
      return column.maxSelect && column.maxSelect > 1 ? [] : "";
    }
    return column.maxSelect && column.maxSelect > 1 ? [found] : found;
  }

  return "";
}

function extractPositionValue(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const fromPos = normalized.match(/(?:\bpos\b[\s\.:]*)([A-Za-z0-9-]{1,8})/i);
  if (fromPos?.[1]) {
    return { value: fromPos[1].trim(), sourceKey: "Pos." };
  }
  const token = normalized.match(/\b([A-Za-z]\d{1,3})\b/);
  if (token?.[1]) {
    return { value: token[1].trim(), sourceKey: "token" };
  }
  return { value: "", sourceKey: "" };
}

function extractQuantityValue(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const qty = normalized.match(
    /(Quantity|Skaits|Qty|On)\s*[:.]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (qty?.[2]) {
    return { value: qty[2].trim(), sourceKey: qty[1] ?? "Quantity" };
  }
  const afterQuantity = normalized.match(
    /(Quantity|Skaits|Qty)\s*[:.]?\s*([A-Za-z ]{0,20})?([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (afterQuantity?.[3]) {
    return {
      value: afterQuantity[3].trim(),
      sourceKey: afterQuantity[1] ?? "Quantity",
    };
  }
  return { value: "", sourceKey: "" };
}

function extractColorValue(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const color = normalized.match(
    /(Profiles colour|Profiles color|Hardware colour|Hardware color|Paint colour|colour|color)\s*[:.]?\s*([A-Za-z0-9 \-]{3,80})/i,
  );
  if (color?.[2]) {
    return { value: color[2].trim(), sourceKey: color[1] ?? "colour" };
  }
  const code = normalized.match(/\b([A-Za-z0-9]{2,6}-[A-Za-z0-9]{1,6})\b/);
  if (code?.[1]) {
    return { value: code[1].trim(), sourceKey: "color-code" };
  }
  return { value: "", sourceKey: "" };
}

function extractSystemValue(text: string) {
  const construction = text.match(/Constructions?\s*:?\s*([^\n\r]+)/i);
  if (construction?.[1]) {
    return { value: construction[1].trim(), sourceKey: "Construction" };
  }
  const posSystem = text.match(
    /Pos\.?\s*[A-Za-z0-9-]+\s+([A-Za-z0-9][^,\n\r-]{2,60})/i,
  );
  if (posSystem?.[1]) {
    return { value: posSystem[1].trim(), sourceKey: "Pos. system" };
  }
  const posLine = text.match(/Pos\.?\s*[A-Za-z0-9-]+\s*([^\n\r]+)/i);
  if (posLine?.[1]) {
    return { value: posLine[1].trim(), sourceKey: "Pos. line" };
  }
  return { value: "", sourceKey: "" };
}

function inferValueWithSource(
  block: string,
  column: ParseColumn,
): { value: string | string[]; sourceKey: string } {
  const key = normalizeToken(column.key);
  const label = normalizeToken(column.label);
  const aiKey = normalizeToken(column.aiKey ?? "");
  const text = block.replace(/\s+/g, " ").trim();

  if (
    key.includes("position") ||
    label.includes("position") ||
    aiKey.includes("position") ||
    key === "pos" ||
    label === "pos" ||
    aiKey === "pos"
  ) {
    return extractPositionValue(block);
  }

  if (
    key.includes("quantity") ||
    key.includes("skaits") ||
    label.includes("quantity") ||
    label.includes("skaits") ||
    aiKey.includes("quantity") ||
    aiKey.includes("skaits")
  ) {
    return extractQuantityValue(block);
  }

  if (
    key.includes("system") ||
    label.includes("system") ||
    aiKey.includes("system") ||
    aiKey.includes("construction")
  ) {
    const extracted = extractSystemValue(block);
    if (extracted.value) {
      return extracted;
    }
    const fallbackLine = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 6 &&
          !/^(pos|quantity|description|construction|profiles|hardware|filling|production)/i.test(
            line,
          ),
      );
    if (fallbackLine) {
      return { value: fallbackLine, sourceKey: "text line" };
    }
    return { value: "", sourceKey: "" };
  }

  if (
    key.includes("color") ||
    key.includes("colour") ||
    label.includes("color") ||
    label.includes("colour") ||
    aiKey.includes("color") ||
    aiKey.includes("colour")
  ) {
    return extractColorValue(block);
  }

  if (column.fieldType === "select") {
    const options = (column.options ?? []).filter(Boolean);
    const found = options.find((option) =>
      text.toLowerCase().includes(option.toLowerCase()),
    );
    if (!found) {
      return {
        value: column.maxSelect && column.maxSelect > 1 ? [] : "",
        sourceKey: "",
      };
    }
    return {
      value: column.maxSelect && column.maxSelect > 1 ? [found] : found,
      sourceKey: "option-match",
    };
  }

  return { value: inferValueFromTextBlock(block, column), sourceKey: "" };
}

function heuristicRowsFromOcrText(text: string, columns: ParseColumn[]) {
  if (!text.trim()) return [];

  // Stabils Pos regex – bez word boundary
  const posRegex = /Pos\.?\s*[A-Za-z0-9-]+/gi;
  const matches = Array.from(text.matchAll(posRegex));

  const blocks: string[] = [];

  if (matches.length > 0) {
    matches.forEach((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < matches.length
          ? (matches[index + 1].index ?? text.length)
          : text.length;

      blocks.push(text.slice(start, end).trim());
    });
  } else {
    // ja nav Pos – treat whole doc kā vienu bloku
    blocks.push(text.trim());
  }

  const rows = blocks.map((block) => {
    const row: Record<string, unknown> = {};
    const sourceKeys: Record<string, string> = {};

    columns.forEach((column) => {
      const inferred = inferValueWithSource(block, column);
      row[column.key] = inferred.value;
      sourceKeys[column.key] = inferred.sourceKey;
    });

    row.__sourceKeys = sourceKeys;
    return row;
  });

  // FILTRĒJAM TIKAI PĒC REĀLĀM KOLONNĀM
  const rowsWithValues = rows.filter((row) =>
    columns.some((column) => {
      const value = row[column.key];
      if (Array.isArray(value)) return value.length > 0;
      return String(value ?? "").trim().length > 0;
    }),
  );

  return rowsWithValues;
}

async function extractPdfText(bytes: Buffer) {
  try {
    const pdf = (await import("pdf-parse")).default;
    const data = await pdf(bytes);
    return (data.text ?? "").trim();
  } catch (err) {
    console.error("PDF parse failed:", err);
    return "";
  }
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildColumnTokens(column: ParseColumn) {
  const key = normalizeToken(column.key);
  const label = normalizeToken(column.label);
  const aiKey = normalizeToken(column.aiKey ?? "");
  const tokens = new Set<string>([key, label, aiKey]);
  if (key.includes("position") || label.includes("position") || key === "pos") {
    ["pos", "position"].forEach((item) => tokens.add(item));
  }
  if (
    key.includes("quantity") ||
    key.includes("skaits") ||
    label.includes("quantity") ||
    label.includes("skaits")
  ) {
    ["quantity", "qty", "skaits", "gab", "count", "on"].forEach((item) =>
      tokens.add(item),
    );
  }
  if (key.includes("system") || label.includes("system")) {
    ["system", "construction", "profile", "profiles"].forEach((item) =>
      tokens.add(item),
    );
  }
  if (
    key.includes("color") ||
    key.includes("colour") ||
    label.includes("color")
  ) {
    ["color", "colour", "paint_colour", "profiles_colour"].forEach((item) =>
      tokens.add(item),
    );
  }
  return Array.from(tokens).filter(Boolean);
}

function isPositionColumn(column: ParseColumn) {
  const key = normalizeToken(column.key);
  const label = normalizeToken(column.label);
  const aiKey = normalizeToken(column.aiKey ?? "");
  return (
    key.includes("position") ||
    label.includes("position") ||
    aiKey.includes("position") ||
    key === "pos" ||
    aiKey === "pos"
  );
}

function extractPositionAnchors(text: string) {
  const anchors = new Set<string>();
  const normalized = text.replace(/\s+/g, " ");
  const matches = normalized.matchAll(
    /(?:^|[\s(])Pos\.?\s*([A-Za-z]{0,4}\d{1,4}(?:-[A-Za-z0-9]{1,6})?)/gi,
  );
  for (const match of matches) {
    if (match[1]) {
      anchors.add(match[1].trim());
    }
  }
  return Array.from(anchors);
}

function sanitizeRowsWithPositionAnchors(
  rows: Array<Record<string, unknown>>,
  columns: ParseColumn[],
  sourceText: string,
) {
  const anchors = extractPositionAnchors(sourceText);
  if (anchors.length === 0) {
    return rows;
  }
  const anchorSet = new Set(anchors.map((item) => item.toLowerCase()));
  return rows.map((row) => {
    const next = { ...row };
    columns.forEach((column) => {
      if (!isPositionColumn(column)) {
        return;
      }
      const raw = String(next[column.key] ?? "").trim();
      if (!raw) {
        next[column.key] = anchors[0];
        return;
      }
      const rawLower = raw.toLowerCase();
      const isGlLike = /^gl-\d+/i.test(raw);
      const matchesAnchor = anchorSet.has(rawLower);
      if (!matchesAnchor && (isGlLike || anchors.length > 0)) {
        next[column.key] = anchors[0];
      }
    });
    return next;
  });
}

function parseSpreadsheetRows(bytes: Buffer, columns: ParseColumn[]) {
  try {
    const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        rows: [] as Array<Record<string, unknown>>,
        model: "xlsx-local",
      };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as unknown[][];
    if (matrix.length === 0) {
      return {
        rows: [] as Array<Record<string, unknown>>,
        model: "xlsx-local",
      };
    }

    const headerRowIndex = matrix.findIndex((row) =>
      row.some((cell) => String(cell ?? "").trim().length > 0),
    );
    if (headerRowIndex === -1) {
      return {
        rows: [] as Array<Record<string, unknown>>,
        model: "xlsx-local",
      };
    }
    const headerRow = matrix[headerRowIndex].map((cell) =>
      String(cell ?? "").trim(),
    );
    const headerTokens = headerRow.map((item) => normalizeToken(item));

    const columnIndexes = columns.map((column, index) => {
      const candidates = buildColumnTokens(column);
      const foundIndex = headerTokens.findIndex((token) =>
        candidates.some(
          (candidate) =>
            token === candidate ||
            token.includes(candidate) ||
            candidate.includes(token),
        ),
      );
      return foundIndex >= 0 ? foundIndex : index;
    });

    const rows = matrix
      .slice(headerRowIndex + 1)
      .map((row) => {
        const next: Record<string, unknown> = {};
        const sourceKeys: Record<string, string> = {};
        columns.forEach((column, colIndex) => {
          const sourceIndex = columnIndexes[colIndex];
          const rawValue =
            sourceIndex >= 0 && sourceIndex < row.length
              ? row[sourceIndex]
              : "";
          const value = String(rawValue ?? "").trim();
          next[column.key] = value;
          sourceKeys[column.key] =
            headerRow[sourceIndex] ?? `Column ${sourceIndex + 1}`;
        });
        next.__sourceKeys = sourceKeys;
        return next;
      })
      .filter((row) =>
        columns.some(
          (column) => String(row[column.key] ?? "").trim().length > 0,
        ),
      );

    return { rows, model: "xlsx-local" };
  } catch {
    return { rows: [] as Array<Record<string, unknown>>, model: "xlsx-local" };
  }
}

type KnownConstructionRow = {
  position: string;
  system: string;
  quantity: string;
  color: string;
  sourceKeys: Record<string, string>;
};

function parseConstructionRowsFromPdfText(text: string): KnownConstructionRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const posIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^Pos\.?/i.test(line)) {
      posIndexes.push(index);
    }
  });
  if (posIndexes.length === 0) {
    return [];
  }

  const rows: KnownConstructionRow[] = [];
  posIndexes.forEach((startIndex, idx) => {
    const endIndex = idx + 1 < posIndexes.length ? posIndexes[idx + 1] : lines.length;
    const block = lines.slice(startIndex, endIndex);
    const posLine = block[0] ?? "";
    const positionMatch = posLine.match(/^Pos\.?\s*([A-Za-z0-9-]+)/i);
    const systemMatch = posLine.match(
      /^Pos\.?\s*[A-Za-z0-9-]+\s+(.+?)(?:\s*-\s*|\s*\(|\s*,|$)/i,
    );

    let quantity = "";
    for (let i = 0; i < block.length; i += 1) {
      if (/^(Quantity|Skaits|Qty|On)\s*[:.]?$/i.test(block[i])) {
        const next = block[i + 1] ?? "";
        const number = next.match(/([0-9]+(?:[.,][0-9]+)?)/);
        if (number?.[1]) {
          quantity = number[1];
          break;
        }
      }
      const inline = block[i].match(
        /(Quantity|Skaits|Qty|On)\s*[:.]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      );
      if (inline?.[2]) {
        quantity = inline[2];
        break;
      }
    }

    let color = "";
    for (let i = 0; i < block.length; i += 1) {
      const colorLine = block[i].match(
        /^Profiles?\s+colou?r\s*[:.]?\s*(.+)$/i,
      );
      if (colorLine?.[1]) {
        color = colorLine[1].trim();
        const next = block[i + 1] ?? "";
        if (/^[0-9A-Za-z.\- ]{4,}$/.test(next) && !/^(Hardware|Fillings|Quantity|Description)/i.test(next)) {
          color = `${color} ${next}`.trim();
        }
        break;
      }
    }

    rows.push({
      position: positionMatch?.[1]?.trim() ?? "",
      system: systemMatch?.[1]?.trim() ?? "",
      quantity,
      color,
      sourceKeys: {
        position: positionMatch ? "Pos." : "",
        system: systemMatch ? "Pos. line" : "",
        quantity: quantity ? "Quantity/On" : "",
        color: color ? "Profiles colour" : "",
      },
    });
  });

  return rows.filter(
    (row) =>
      row.position.trim().length > 0 ||
      row.system.trim().length > 0 ||
      row.quantity.trim().length > 0 ||
      row.color.trim().length > 0,
  );
}

function mapKnownConstructionRowsToColumns(
  rows: KnownConstructionRow[],
  columns: ParseColumn[],
) {
  const mapped = rows.map((source) => {
    const next: Record<string, unknown> = {};
    const sourceKeys: Record<string, string> = {};
    columns.forEach((column) => {
      const key = normalizeToken(column.key);
      const label = normalizeToken(column.label);
      const aiKey = normalizeToken(column.aiKey ?? "");
      const isPosition =
        key.includes("position") ||
        label.includes("position") ||
        aiKey.includes("position") ||
        key === "pos" ||
        aiKey === "pos";
      const isSystem =
        key.includes("system") ||
        label.includes("system") ||
        aiKey.includes("system") ||
        aiKey.includes("construction");
      const isQuantity =
        key.includes("quantity") ||
        key.includes("skaits") ||
        label.includes("quantity") ||
        label.includes("skaits") ||
        aiKey.includes("quantity") ||
        aiKey.includes("skaits");
      const isColor =
        key.includes("color") ||
        key.includes("colour") ||
        label.includes("color") ||
        label.includes("colour") ||
        aiKey.includes("color") ||
        aiKey.includes("colour");

      if (isPosition) {
        next[column.key] = source.position;
        sourceKeys[column.key] = source.sourceKeys.position;
        return;
      }
      if (isSystem) {
        if (column.fieldType === "select") {
          const option =
            (column.options ?? []).find((item) => {
              const a = item.trim().toLowerCase();
              const b = source.system.trim().toLowerCase();
              return b.includes(a) || a.includes(b);
            }) ?? source.system;
          next[column.key] = option;
        } else {
          next[column.key] = source.system;
        }
        sourceKeys[column.key] = source.sourceKeys.system;
        return;
      }
      if (isQuantity) {
        next[column.key] = source.quantity;
        sourceKeys[column.key] = source.sourceKeys.quantity;
        return;
      }
      if (isColor) {
        next[column.key] = source.color;
        sourceKeys[column.key] = source.sourceKeys.color;
        return;
      }
      next[column.key] = "";
      sourceKeys[column.key] = "";
    });
    next.__sourceKeys = sourceKeys;
    return next;
  });
  return mapped;
}

function tryParseRowsJsonFromText(text: string, columns: ParseColumn[]) {
  const attempts: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return [] as Array<Record<string, unknown>>;
  }
  attempts.push(trimmed);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const rawRows = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { rows?: unknown[] }).rows)
          ? (parsed as { rows: unknown[] }).rows
          : [];
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        continue;
      }
      const normalized = rawRows
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const source = item as Record<string, unknown>;
          const row: Record<string, unknown> = {};
          const sourceKeys: Record<string, string> = {};
          columns.forEach((column) => {
            const directByKey = source[column.key];
            const directByLabel = source[column.label];
            const directByAiKey = column.aiKey ? source[column.aiKey] : undefined;
            let chosenKey = "";
            let value: unknown = "";
            if (directByKey !== undefined) {
              chosenKey = column.key;
              value = directByKey;
            } else if (directByLabel !== undefined) {
              chosenKey = column.label;
              value = directByLabel;
            } else if (directByAiKey !== undefined) {
              chosenKey = column.aiKey ?? "";
              value = directByAiKey;
            } else {
              const targetTokens = new Set([
                normalizeToken(column.key),
                normalizeToken(column.label),
                normalizeToken(column.aiKey ?? ""),
              ]);
              for (const [rawKey, rawValue] of Object.entries(source)) {
                const token = normalizeToken(rawKey);
                if (targetTokens.has(token)) {
                  chosenKey = rawKey;
                  value = rawValue;
                  break;
                }
              }
            }
            row[column.key] = value;
            sourceKeys[column.key] = chosenKey;
          });
          row.__sourceKeys = sourceKeys;
          const hasAny = columns.some(
            (column) => String(row[column.key] ?? "").trim().length > 0,
          );
          return hasAny ? row : null;
        })
        .filter((row): row is Record<string, unknown> => Boolean(row));
      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      continue;
    }
  }
  return [] as Array<Record<string, unknown>>;
}

function parseRowsFromAnyConstructionText(text: string, columns: ParseColumn[]) {
  const jsonRows = tryParseRowsJsonFromText(text, columns);
  if (jsonRows.length > 0) {
    return jsonRows;
  }
  const structured = mapKnownConstructionRowsToColumns(
    parseConstructionRowsFromPdfText(text),
    columns,
  );
  if (structured.length > 0) {
    return structured;
  }
  return heuristicRowsFromOcrText(text, columns);
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function extractRowsFromResponse(payload: OpenAiResponse): unknown[] {
  if (Array.isArray(payload.output_parsed?.rows)) {
    return payload.output_parsed.rows;
  }
  const firstParsed = payload.output
    ?.flatMap((entry) => entry.content ?? [])
    .find((item) => Array.isArray(item.parsed?.rows));
  if (firstParsed?.parsed?.rows) {
    return firstParsed.parsed.rows;
  }
  if (payload.output_text) {
    try {
      const parsed = JSON.parse(payload.output_text) as { rows?: unknown[] };
      if (Array.isArray(parsed.rows)) {
        return parsed.rows;
      }
    } catch {
      return [];
    }
  }
  return [];
}

function extractTextFromResponse(payload: OpenAiResponse): string {
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

function getRawMatchByColumn(
  row: Record<string, unknown>,
  column: ParseColumn,
): { value: unknown; sourceKey: string } {
  const sourceKeys =
    row.__sourceKeys && typeof row.__sourceKeys === "object"
      ? (row.__sourceKeys as Record<string, unknown>)
      : {};
  if (row[column.key] !== undefined) {
    const value = row[column.key];
    const hasValue = Array.isArray(value)
      ? value.length > 0
      : String(value ?? "").trim().length > 0;
    return {
      value,
      sourceKey:
        typeof sourceKeys[column.key] === "string"
          ? (sourceKeys[column.key] as string)
          : hasValue
            ? column.key
            : "",
    };
  }
  if (column.aiKey && row[column.aiKey] !== undefined) {
    return { value: row[column.aiKey], sourceKey: column.aiKey };
  }
  if (row[column.label] !== undefined) {
    return { value: row[column.label], sourceKey: column.label };
  }
  const keyToken = normalizeToken(column.key);
  const labelToken = normalizeToken(column.label);
  const aiKeyToken = normalizeToken(column.aiKey ?? "");
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const token = normalizeToken(rawKey);
    if (token === keyToken || token === labelToken || token === aiKeyToken) {
      return { value: rawValue, sourceKey: rawKey };
    }
  }
  return { value: undefined, sourceKey: "" };
}

function normalizeRowValue(value: unknown, column: ParseColumn): unknown {
  if (column.fieldType === "number") {
    const text = toStringValue(value).replace(",", ".");
    if (!text) {
      return "";
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? String(parsed) : text;
  }

  if (column.fieldType === "select") {
    const maxSelect = Math.max(1, Math.min(3, column.maxSelect ?? 1));
    const options = (column.options ?? []).map((item) => item.trim());
    const optionMap = new Map(
      options.map((item) => [normalizeToken(item), item]),
    );
    const rawItems = Array.isArray(value)
      ? value
      : toStringValue(value)
          .split(/[\/;,\n]+/)
          .map((item) => item.trim())
          .filter(Boolean);
    const normalized = rawItems
      .map((item) => {
        const mapped = optionMap.get(normalizeToken(item));
        return mapped ?? item;
      })
      .filter(Boolean);
    if (maxSelect === 1) {
      return normalized[0] ?? "";
    }
    return normalized.slice(0, maxSelect);
  }

  return toStringValue(value);
}

function normalizeModelRowKeys(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeToken(key)] = value;
  }

  return normalized;
}

function normalizeRows(rows: unknown[], columns: ParseColumn[]) {
  const sourceUsage = new Map<string, Map<string, number>>();
  const normalizedRows = rows
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = normalizeModelRowKeys(item as Record<string, unknown>);

      const next: Record<string, unknown> = {};
      columns.forEach((column) => {
        const match = getRawMatchByColumn(row, column);
        next[column.key] = normalizeRowValue(match.value, column);
        if (match.sourceKey) {
          const byColumn =
            sourceUsage.get(column.key) ?? new Map<string, number>();
          byColumn.set(
            match.sourceKey,
            (byColumn.get(match.sourceKey) ?? 0) + 1,
          );
          sourceUsage.set(column.key, byColumn);
        }
      });
      const hasAnyValue = columns.some((column) => {
        const value = next[column.key];
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return toStringValue(value).length > 0;
      });

      return hasAnyValue ? next : null;
    })
    .filter((item): item is Record<string, unknown> => Boolean(item));

  const mapping = columns.map((column) => {
    const byColumn = sourceUsage.get(column.key) ?? new Map<string, number>();
    const best = Array.from(byColumn.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      columnKey: column.key,
      columnLabel: column.label,
      sourceKey: best?.[0] ?? "",
      matchedRows: best?.[1] ?? 0,
    };
  });

  return { rows: normalizedRows, mapping };
}

async function runOpenAiParse(
  file: ParsedDocumentInput,
  columns: ParseColumn[],
  extractedPdfText: string,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error: "OPENAI_API_KEY is not configured.",
      status: 500,
    };
  }

  const deadlineAt = Date.now() + PARSE_TOTAL_TIMEOUT_MS;
  const hasTimeLeft = () => Date.now() < deadlineAt;

  const preferredModel = process.env.OPENAI_ORDER_INPUT_MODEL || "gpt-4o";
  const fallbackModels = ["gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini"].filter(
    (model) => model !== preferredModel,
  );
  const promptColumns = columns.map((column) => ({
    key: column.key,
    label: column.label,
    aiKey: column.aiKey ?? "",
    type: column.fieldType,
    options: isPositionColumn(column) ? [] : (column.options ?? []),
    maxSelect: Math.max(1, Math.min(3, column.maxSelect ?? 1)),
  }));

  const rowSchemaProperties = Object.fromEntries(
    columns.map((column) => [
      column.key,
      column.fieldType === "select" &&
      Math.max(1, Math.min(3, column.maxSelect ?? 1)) > 1
        ? {
            anyOf: [
              { type: "string" },
              {
                type: "array",
                items: { type: "string" },
              },
            ],
          }
        : { type: "string" },
    ]),
  );
  const rowSchemaRequired = columns.map((column) => column.key);
  const extractedTextSnippet = extractedPdfText.slice(0, 50000);

  let openAiFileId = "";
  try {
    const uploadResponse = await uploadOpenAiFileWithTimeout(apiKey, file);
    const uploadPayload = (await uploadResponse
      .json()
      .catch(() => ({}))) as OpenAiFileResponse;
    if (!uploadResponse.ok || !uploadPayload.id) {
      const requestId = uploadResponse.headers.get("x-request-id") ?? "";
      return {
        error:
          uploadPayload.error?.message ??
          `OpenAI file upload failed with status ${uploadResponse.status}.${requestId ? ` request_id=${requestId}` : ""}`,
        status: 502,
      };
    }
    openAiFileId = uploadPayload.id;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { error: "OpenAI file upload timeout.", status: 504 };
    }
    return { error: "OpenAI file upload failed.", status: 502 };
  }

  const extractOcrText = async (
    model: string,
  ): Promise<{ text: string } | { error: string; status: number }> => {
    if (!hasTimeLeft()) {
      return { error: "Parsing timed out.", status: 504 };
    }
    let response: Response;
    try {
      response = await fetchOpenAiWithTimeout(apiKey, {
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Extract OCR-like plain text from the PDF. Preserve position/specification blocks and quantities.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Return only plain text extracted from the document.",
              },
              {
                type: "input_file",
                file_id: openAiFileId,
              },
            ],
          },
        ],
        max_output_tokens: 5000,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { error: "OpenAI request timeout.", status: 504 };
      }
      return { error: "OpenAI request failed.", status: 502 };
    }
    const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "";
      return {
        error:
          payload.error?.message ??
          `OpenAI request failed with status ${response.status}.${requestId ? ` request_id=${requestId}` : ""}`,
        status: 502,
      };
    }
    return { text: extractTextFromResponse(payload) };
  };

  const attemptParse = async (
    model: string,
  ): Promise<ParseAttemptResult | { error: string; status: number }> => {
    if (!hasTimeLeft()) {
      return { error: "Parsing timed out.", status: 504 };
    }
    let response: Response;
    try {
      response = await fetchOpenAiWithTimeout(apiKey, {
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You extract manufacturing row data from technical drawing PDFs. Use OCR/vision reading for labels, dimensions and the left-side specification blocks. Return only structured rows.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Map the PDF content to table rows with these target columns: ${JSON.stringify(promptColumns)}. ` +
                  "Use source cues like position (Pos), system/model names, quantity/skaits/qty and color/colour fields. " +
                  "If a value is missing, return empty string for that column. Return rows only if they are grounded in document content.\n\n" +
                  (extractedTextSnippet
                    ? `Extracted PDF text:\n${extractedTextSnippet}`
                    : "Extracted PDF text is empty. Read directly from file."),
              },
              {
                type: "input_file",
                file_id: openAiFileId,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "order_input_rows",
            strict: false,
            schema: {
              type: "object",
              additionalProperties: true,
              properties: {
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    properties: rowSchemaProperties,
                    required: rowSchemaRequired,
                  },
                },
              },
              required: ["rows"],
            },
          },
        },
        max_output_tokens: 4000,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { error: "OpenAI request timeout.", status: 504 };
      }
      return { error: "OpenAI request failed.", status: 502 };
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "";
      return {
        error:
          payload.error?.message ??
          `OpenAI request failed with status ${response.status}.${requestId ? ` request_id=${requestId}` : ""}`,
        status: 502,
      };
    }
    const rawText = extractTextFromResponse(payload);
    return {
      rows: extractRowsFromResponse(payload),
      model,
      rawText,
    };
  };

  try {
    const triedModels: string[] = [];
    let bestRawText = extractedPdfText;
    const allModels = [preferredModel, ...fallbackModels];
    if (extractedPdfText.trim().length > 0) {
      const parsedFromPdfText = parseRowsFromAnyConstructionText(
        extractedPdfText,
        columns,
      );
      if (parsedFromPdfText.length > 0) {
        return {
          rows: parsedFromPdfText,
          model: "local-pdf-text-heuristic",
          rawText: extractedPdfText,
        };
      }
    }
    for (const model of allModels) {
      if (!hasTimeLeft()) {
        break;
      }
      const result = await attemptParse(model);
      triedModels.push(model);
      if ("error" in result) {
        continue;
      }
      if (result.rawText.trim().length > bestRawText.trim().length) {
        bestRawText = result.rawText;
      }
      if (result.rows.length === 0 && result.rawText.trim().length > 0) {
        const parsedFromModelText = parseRowsFromAnyConstructionText(
          result.rawText,
          columns,
        );
        if (parsedFromModelText.length > 0) {
          return {
            rows: parsedFromModelText,
            model: `${model} response-text heuristic (${triedModels.join(" -> ")})`,
            rawText: result.rawText,
          };
        }
      }
      if (result.rows.length > 0) {
        return {
          ...result,
          model: `${result.model} (${triedModels.join(" -> ")})`,
        };
      }
      const ocr = await extractOcrText(model);
      if (!("error" in ocr) && ocr.text.trim().length > 0) {
        if (ocr.text.trim().length > bestRawText.trim().length) {
          bestRawText = ocr.text;
        }
        const parsedFromOcrText = parseRowsFromAnyConstructionText(
          ocr.text,
          columns,
        );
        if (parsedFromOcrText.length > 0) {
          return {
            rows: parsedFromOcrText,
            model: `${model} heuristic (${triedModels.join(" -> ")})`,
            rawText: ocr.text,
          };
        }
      }
    }
    return {
      rows: [],
      model: triedModels.join(" -> "),
      rawText: bestRawText,
    };
  } finally {
    if (openAiFileId) {
      await deleteOpenAiFile(apiKey, openAiFileId);
    }
  }
}

function isPdfLike(name: string, mimeType?: string | null) {
  const lowerName = name.toLowerCase();
  const lowerMime = (mimeType ?? "").toLowerCase();
  return lowerName.endsWith(".pdf") || lowerMime.includes("application/pdf");
}

function isSpreadsheetLike(name: string, mimeType?: string | null) {
  const lowerName = name.toLowerCase();
  const lowerMime = (mimeType ?? "").toLowerCase();
  return (
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    lowerMime.includes("application/vnd.ms-excel")
  );
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
  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("id, tenant_id, role, is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (!actorProfile?.tenant_id) {
    return NextResponse.json(
      { error: "User tenant is not configured." },
      { status: 403 },
    );
  }
  const orderManageRoles = await resolveAllowedRolesForPermission(
    admin,
    actorProfile.tenant_id,
    "orders.manage",
  );
  if (!actorHasPermission(actorProfile, orderManageRoles)) {
    return NextResponse.json(
      { error: "Missing permission: orders.manage" },
      { status: 403 },
    );
  }

  const { data: subscription } = await admin
    .from("tenant_subscriptions")
    .select("plan_code, status")
    .eq("tenant_id", actorProfile.tenant_id)
    .maybeSingle();
  const canUseAiImport =
    (subscription?.plan_code ?? "basic") === "pro" &&
    ["active", "trial"].includes(subscription?.status ?? "active");
  if (!canUseAiImport) {
    return NextResponse.json(
      { error: "feature_not_available" },
      { status: 403 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Use application/json." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const attachmentId =
    typeof body.attachmentId === "string" ? body.attachmentId.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const columns = Array.isArray(body.columns)
    ? (body.columns as ParseColumn[])
    : [];

  if (!attachmentId) {
    return NextResponse.json(
      { error: "attachmentId is required." },
      { status: 400 },
    );
  }
  if (!orderId) {
    return NextResponse.json(
      { error: "orderId is required." },
      { status: 400 },
    );
  }

  const validColumns = columns.filter(
    (column) =>
      typeof column?.key === "string" &&
      typeof column?.label === "string" &&
      ["text", "number", "select"].includes(column?.fieldType),
  );
  if (validColumns.length === 0) {
    return NextResponse.json(
      { error: "At least one valid table column is required." },
      { status: 400 },
    );
  }

  const { data: attachment } = await admin
    .from("order_attachments")
    .select("id, order_id, tenant_id, name, url, mime_type, size")
    .eq("id", attachmentId)
    .eq("order_id", orderId)
    .eq("tenant_id", actorProfile.tenant_id)
    .maybeSingle();
  if (!attachment?.url) {
    return NextResponse.json(
      { error: "Attachment not found." },
      { status: 404 },
    );
  }
  const isPdfAttachment = isPdfLike(
    attachment.name ?? "",
    attachment.mime_type,
  );
  const isSpreadsheetAttachment = isSpreadsheetLike(
    attachment.name ?? "",
    attachment.mime_type,
  );
  if (!isPdfAttachment && !isSpreadsheetAttachment) {
    return NextResponse.json(
      { error: "Selected attachment must be PDF, XLSX, or XLS." },
      { status: 400 },
    );
  }
  const maxFileSizeBytes = 20 * 1024 * 1024;
  if ((attachment.size ?? 0) > maxFileSizeBytes) {
    return NextResponse.json(
      { error: "PDF exceeds 20MB limit." },
      { status: 400 },
    );
  }

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "order-attachments";
  const { data: download, error: downloadError } = await admin.storage
    .from(bucket)
    .download(attachment.url);
  if (downloadError || !download) {
    return NextResponse.json(
      { error: downloadError?.message ?? "Failed to load attachment." },
      { status: 500 },
    );
  }
  if (download.size > maxFileSizeBytes) {
    return NextResponse.json(
      { error: "PDF exceeds 20MB limit." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await download.arrayBuffer());
  if (isSpreadsheetAttachment) {
    const spreadsheet = parseSpreadsheetRows(bytes, validColumns);
    const normalizedSpreadsheet = normalizeRows(spreadsheet.rows, validColumns);
    return NextResponse.json({
      rows: normalizedSpreadsheet.rows,
      mapping: normalizedSpreadsheet.mapping,
      detectedRows: normalizedSpreadsheet.rows.length,
      parserModel: spreadsheet.model,
      parserRawTextPreview: "",
    });
  }
  const extractedPdfText = await extractPdfText(bytes);
  const structuredRows = mapKnownConstructionRowsToColumns(
    parseConstructionRowsFromPdfText(extractedPdfText),
    validColumns,
  );
  if (structuredRows.length > 0) {
    const normalizedStructured = normalizeRows(structuredRows, validColumns);
    if (normalizedStructured.rows.length > 0) {
      return NextResponse.json({
        rows: normalizedStructured.rows,
        mapping: normalizedStructured.mapping,
        detectedRows: normalizedStructured.rows.length,
        parserModel: "pdf-structured-parser",
        parserRawTextPreview: extractedPdfText.slice(0, 300),
      });
    }
  }
  const parsed = await runOpenAiParse(
    {
      name: attachment.name ?? "document.pdf",
      mimeType: attachment.mime_type ?? "application/pdf",
      bytes,
    },
    validColumns,
    extractedPdfText,
  );
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }

  const candidateRows = parsed.rows ?? [];
  const sanitizedRows = sanitizeRowsWithPositionAnchors(
    candidateRows,
    validColumns,
    parsed.rawText && parsed.rawText.trim().length > 0
      ? parsed.rawText
      : extractedPdfText,
  );
  const normalized = normalizeRows(sanitizedRows, validColumns);
  if (normalized.rows.length === 0) {
    const sourceText =
      parsed.rawText && parsed.rawText.trim().length > 0
        ? parsed.rawText
        : extractedPdfText;

    const heuristicRows = heuristicRowsFromOcrText(sourceText, validColumns);

    if (heuristicRows.length > 0) {
      const heuristicNormalized = normalizeRows(heuristicRows, validColumns);

      return NextResponse.json({
        rows: heuristicNormalized.rows,
        mapping: heuristicNormalized.mapping,
        detectedRows: heuristicNormalized.rows.length,
        parserModel: `${parsed.model} -> heuristic-final`,
        parserRawTextPreview: sourceText.slice(0, 300),
      });
    }
  }

  return NextResponse.json({
    rows: normalized.rows,
    mapping: normalized.mapping,
    detectedRows: normalized.rows.length,
    parserModel: parsed.model,
    parserRawTextPreview: parsed.rawText.slice(0, 300),
  });
}
