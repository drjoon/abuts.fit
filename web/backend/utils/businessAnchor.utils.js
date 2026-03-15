export function normalizeBusinessNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").trim();
  return digits || "";
}

export function isNormalizedBusinessNumber(value) {
  return /^\d{10}$/.test(String(value || ""));
}

export function assertNormalizedBusinessNumber(value) {
  const normalized = normalizeBusinessNumber(value);
  if (!normalized) {
    throw new Error("사업자등록번호가 비어 있습니다.");
  }
  if (!isNormalizedBusinessNumber(normalized)) {
    throw new Error("사업자등록번호 형식이 올바르지 않습니다.");
  }
  return normalized;
}
