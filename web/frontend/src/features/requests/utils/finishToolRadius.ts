/** D1.2 볼엔드밀의 실제 절삭 반경(mm). 호칭 직경은 1.2, 절삭 직경은 1.0. */
export const FINISH_TOOL_RADIUS_MM = 0.5;

/** 예전 메타가 호칭 직경 1.2를 절삭 직경으로 저장한 값. */
const LEGACY_NOMINAL_DIAMETER_MM = 1.2;

/** 화면의 공구 R. 직경이 없거나 예전 호칭 1.2이면 실제 절삭 반경 0.5mm. */
export function finishToolRadiusMm(toolDiameterMm?: number | null): number {
  const diameter = Number(toolDiameterMm);
  if (!Number.isFinite(diameter) || diameter <= 0) return FINISH_TOOL_RADIUS_MM;
  if (Math.abs(diameter - LEGACY_NOMINAL_DIAMETER_MM) < 0.051) return FINISH_TOOL_RADIUS_MM;
  return diameter / 2;
}

/** 이미 반경으로 온 값. 예전 검사의 0.6mm는 실제 절삭 반경으로 바꾼다. */
export function displayFinishToolRadiusMm(toolRadiusMm?: number | null): number {
  const radius = Number(toolRadiusMm);
  if (!Number.isFinite(radius) || radius <= 0) return FINISH_TOOL_RADIUS_MM;
  if (Math.abs(radius - LEGACY_NOMINAL_DIAMETER_MM / 2) < 0.011) return FINISH_TOOL_RADIUS_MM;
  return radius;
}
