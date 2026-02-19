import { supabase } from "@/lib/supabaseClient";
import { parseQrInput } from "@/lib/qr/parseQrInput";

type ResolveOk = {
  ok: true;
  token: string;
  targetRoute: string;
  orderId: string | null;
  rawValue: string;
};

type ResolveError = {
  ok: false;
  error: string;
  token?: string;
  rawValue: string;
};

export type ResolveScanTargetResult = ResolveOk | ResolveError;

export async function resolveScanTarget(
  rawValue: string,
): Promise<ResolveScanTargetResult> {
  const directRoute = tryResolveDirectRoute(rawValue);
  if (directRoute) {
    return {
      ok: true,
      token: directRoute.token,
      orderId: null,
      targetRoute: directRoute.route,
      rawValue,
    };
  }

  const parsed = parseQrInput(rawValue);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, rawValue };
  }

  const sb = supabase;
  if (!sb) {
    return { ok: false, error: "Database is not available.", rawValue };
  }

  const { data, error } = await sb
    .from("production_qr_codes")
    .select("token, order_id")
    .eq("token", parsed.token)
    .maybeSingle();

  if (error || !data) {
    // Soft fallback: open QR route directly and let the dedicated page resolve details.
    return {
      ok: true,
      token: parsed.token,
      orderId: null,
      targetRoute: `/qr/${encodeURIComponent(parsed.token)}`,
      rawValue,
    };
  }

  const orderId = data.order_id ?? null;
  const targetRoute = orderId
    ? `/orders/${encodeURIComponent(orderId)}`
    : `/qr/${encodeURIComponent(data.token)}`;

  return {
    ok: true,
    token: data.token,
    orderId,
    targetRoute,
    rawValue,
  };
}

function tryResolveDirectRoute(rawValue: string) {
  const value = rawValue.trim();
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    if (cleanPath.startsWith("/qr/")) {
      const token = cleanPath.slice("/qr/".length).trim();
      if (!token) {
        return null;
      }
      return { token, route: `${cleanPath}${parsed.search}` };
    }
    if (cleanPath.startsWith("/external-jobs/respond/")) {
      const token = cleanPath.slice("/external-jobs/respond/".length).trim();
      if (!token) {
        return null;
      }
      return { token, route: `${cleanPath}${parsed.search}` };
    }
    return null;
  } catch {
    return null;
  }
}
