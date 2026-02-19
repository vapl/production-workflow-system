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
    return {
      ok: false,
      error: "QR code was not found.",
      token: parsed.token,
      rawValue,
    };
  }

  const orderId = data.order_id ?? null;
  const targetRoute = orderId
    ? `/production/operator?order=${encodeURIComponent(orderId)}`
    : `/qr/${encodeURIComponent(data.token)}`;

  return {
    ok: true,
    token: data.token,
    orderId,
    targetRoute,
    rawValue,
  };
}
