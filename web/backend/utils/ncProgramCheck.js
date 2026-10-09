// related files:
// - web/backend/controllers/bg/bg.controller.js (3-nc 등록 후 분석)
// - web/backend/controllers/cnc/machiningBridge.js (auto-next 건너뛰기)
// - web/backend/models/request.model.js (caseInfos.ncFile.analysis)
// change-log:
// - 2026-10-09: 신설. Esprit NC의 좌표 범위를 사후 점검한다(원점 이탈·행정 초과 방지).
/**
 * NC 텍스트의 축 좌표 범위를 읽는다. 괄호 주석은 제외한다.
 * 기본 한계는 정상 NC 33개(2026-09~10, M4/M5)의 실측 범위에서 여유를 둔 값이다.
 *   X −9.4~60 / Y −9.6~10.4 / Z −17.5~40, 오버트래블 알람 건은 X −11.3.
 * 장비 행정 한계 확정값이 있으면 SystemSettings.autoMachiningGate.ncLimits로 대체한다.
 */
export const DEFAULT_NC_LIMITS = Object.freeze({
  xMin: -10.5,
  xMax: 61,
  yMin: -12,
  yMax: 12,
  zMin: -18,
  zMax: 41,
});

const AXES = ["X", "Y", "Z"];

export function analyzeNcText(text) {
  const src = String(text || "").replace(/\([^)]*\)/g, " ");
  const bbox = {};
  for (const m of src.matchAll(/(?<![A-Za-z])([XYZ])\s*(-?\d+\.?\d*)/g)) {
    const axis = m[1];
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    const cur = bbox[axis] || { min: v, max: v };
    cur.min = Math.min(cur.min, v);
    cur.max = Math.max(cur.max, v);
    bbox[axis] = cur;
  }
  return { bytes: Buffer.byteLength(String(text || ""), "latin1"), bbox };
}

/** @returns {string[]} 위반 플래그(없으면 빈 배열) */
export function evaluateNcLimits(analysis, limits = DEFAULT_NC_LIMITS) {
  const flags = [];
  if (!analysis?.bbox || !AXES.some((a) => analysis.bbox[a])) {
    return ["nc_no_coordinates"];
  }
  for (const axis of AXES) {
    const range = analysis.bbox[axis];
    if (!range) continue;
    const lo = limits[`${axis.toLowerCase()}Min`];
    const hi = limits[`${axis.toLowerCase()}Max`];
    if (Number.isFinite(lo) && range.min < lo) flags.push(`nc_${axis.toLowerCase()}_below_limit`);
    if (Number.isFinite(hi) && range.max > hi) flags.push(`nc_${axis.toLowerCase()}_above_limit`);
  }
  return flags;
}

export function buildNcAnalysis(text, limits = DEFAULT_NC_LIMITS) {
  const a = analyzeNcText(text);
  return { ...a, flags: evaluateNcLimits(a, limits), checkedAt: new Date() };
}
