export const ORAL_SCAN_ROLES = new Set(["upper", "lower", "bite", "other"]);

const MESH_EXT = /\.(stl|ply|obj|dcm)$/i;

export function normalizeOralScanRole(value) {
  const role = String(value || "").trim();
  return ORAL_SCAN_ROLES.has(role) ? role : "";
}

export function normalizeOralScanRoleSetBy(value) {
  const who = String(value || "").trim();
  return who === "practice" || who === "lab" || who === "filename" ? who : "";
}

/**
 * 파일명으로 상악·하악·바이트를 구분한다. 메시가 아니면 빈 문자열.
 * 애매하면 other. FE classifyOralScanFileName 과 같은 토큰.
 */
export function classifyOralScanFileName(fileName) {
  const name = String(fileName || "").trim();
  if (!name || !MESH_EXT.test(name)) return "";
  const base = name.toLowerCase();
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[\s_-]+/g, "");
  const tokens = [
    "upperjawscan",
    "lowerjawscan",
    "bitescan",
    "preopscan",
    "upperjaw",
    "lowerjaw",
    "bite",
  ];
  let token = stem;
  for (const candidate of tokens) {
    if (stem.includes(candidate)) {
      token = candidate;
      break;
    }
  }
  if (
    token === "bitescan" ||
    token === "bite" ||
    token.includes("occlusion") ||
    token.includes("바이트") ||
    token.includes("교합")
  ) {
    return "bite";
  }
  if (
    token === "upperjawscan" ||
    token === "upperjaw" ||
    token.includes("maxilla") ||
    token.includes("상악") ||
    token.includes("upper")
  ) {
    return "upper";
  }
  if (
    token === "lowerjawscan" ||
    token === "lowerjaw" ||
    token.includes("mandib") ||
    token.includes("하악") ||
    token.includes("lower")
  ) {
    return "lower";
  }
  return "other";
}

/** 비어 있으면 파일명 구분(setBy=filename). 사람이 고른 값은 유지. */
export function resolveStoredScanRole({ originalName, scanRole, scanRoleSetBy } = {}) {
  const explicit = normalizeOralScanRole(scanRole);
  const role = explicit || classifyOralScanFileName(originalName);
  if (!role) return { scanRole: "", scanRoleSetBy: "" };
  const setBy = normalizeOralScanRoleSetBy(scanRoleSetBy) || "filename";
  return { scanRole: role, scanRoleSetBy: setBy };
}
