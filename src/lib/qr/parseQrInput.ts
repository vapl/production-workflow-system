export type ParsedQrInput =
  | { ok: true; token: string }
  | { ok: false; error: string };

export function parseQrInput(rawValue: string): ParsedQrInput {
  const value = rawValue.trim();
  if (!value) {
    return { ok: false, error: "Empty QR value." };
  }

  const tokenFromUrl = tryParseTokenFromUrl(value);
  if (tokenFromUrl) {
    return { ok: true, token: tokenFromUrl };
  }

  const tokenFromText = tryParseTokenFromText(value);
  if (tokenFromText) {
    return { ok: true, token: tokenFromText };
  }

  const compact = value.replace(/^\/+|\/+$/g, "");
  if (isLikelyToken(compact)) {
    return { ok: true, token: compact };
  }

  return { ok: false, error: "Unsupported QR format." };
}

function tryParseTokenFromUrl(value: string) {
  try {
    const parsed = new URL(value);
    const tokenParam = parsed.searchParams.get("token");
    if (tokenParam && isLikelyToken(tokenParam)) {
      return tokenParam;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const qrIndex = parts.findIndex((part) => part === "qr");
    const next = qrIndex >= 0 ? parts[qrIndex + 1] : null;
    if (next && isLikelyToken(next)) {
      return next;
    }
    const lastPart = parts[parts.length - 1] ?? "";
    if (isLikelyToken(lastPart)) {
      return lastPart;
    }
    return null;
  } catch {
    return null;
  }
}

function tryParseTokenFromText(value: string) {
  const cleaned = value.trim();
  const tokenQueryMatch = cleaned.match(/[?&]token=([^&#\s]+)/i);
  if (tokenQueryMatch?.[1]) {
    const decoded = safeDecode(tokenQueryMatch[1]).replace(/^\/+|\/+$/g, "");
    if (isLikelyToken(decoded)) {
      return decoded;
    }
  }

  const qrPathMatch = cleaned.match(/\/qr\/([^/?#\s]+)/i);
  if (qrPathMatch?.[1]) {
    const decoded = safeDecode(qrPathMatch[1]).replace(/^\/+|\/+$/g, "");
    if (isLikelyToken(decoded)) {
      return decoded;
    }
  }

  const externalPathMatch = cleaned.match(/\/external-jobs\/respond\/([^/?#\s]+)/i);
  if (externalPathMatch?.[1]) {
    const decoded = safeDecode(externalPathMatch[1]).replace(/^\/+|\/+$/g, "");
    if (isLikelyToken(decoded)) {
      return decoded;
    }
  }

  return null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLikelyToken(value: string) {
  return /^[A-Za-z0-9_-]{6,200}$/.test(value);
}
