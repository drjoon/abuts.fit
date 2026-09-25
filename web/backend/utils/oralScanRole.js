export const ORAL_SCAN_ROLES = new Set(["upper", "lower", "bite", "other"]);

export function normalizeOralScanRole(value) {
  const role = String(value || "").trim();
  return ORAL_SCAN_ROLES.has(role) ? role : "";
}

export function normalizeOralScanRoleSetBy(value) {
  const who = String(value || "").trim();
  return who === "practice" || who === "lab" ? who : "";
}
