export function normalizeOperatorLoginCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidOperatorLoginCode(value: string) {
  return /^[A-Z0-9_-]{2,24}$/.test(value);
}

export function isValidOperatorPin(value: string) {
  return /^\d{4}$/.test(value);
}

export function buildOperatorAuthPassword(pin: string) {
  return `op-${pin}`;
}

export function buildOperatorTechnicalEmail(params: {
  loginCode: string;
  tenantId: string;
}) {
  const normalizedCode = normalizeOperatorLoginCode(params.loginCode);
  const tenantPart = params.tenantId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `operator.${normalizedCode.toLowerCase()}.${tenantPart}@internal.production.local`;
}
