// related files:
// - web/backend/services/lowFinishLineWatch.service.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/lowFinishLineWatch.ts
//
// 피니시라인 min_z 1mm 미만(짧은 커프)은 제조사 준비에 불완전 경고를 남긴다.
// 실의뢰 50건이 세척.패킹 이후까지 가고 실패가 0이면 그 경고를 끈다.

export const LOW_FINISH_LINE_Z_MM = 1;
export const LOW_FINISH_LINE_SUCCESS_TARGET = 50;

const SUCCESS_STAGES = new Set(["세척.패킹", "포장.발송", "추적관리"]);
const SKIP_SOURCES = new Set(["dummy_sample", "manufacturer_sample"]);
const SKIP_CATEGORIES = new Set([
  "dummy_sample",
  "copied_sample",
  "rnd_sample",
  "manufacturer_sample",
]);

export function isLowFinishLineMinZ(minZ) {
  const n = Number(minZ);
  return Number.isFinite(n) && n < LOW_FINISH_LINE_Z_MM;
}

export function isLowFinishLineSample(requestLike) {
  const source = String(requestLike?.source || "").trim();
  const category = String(requestLike?.requestCategory || "").trim();
  return SKIP_SOURCES.has(source) || SKIP_CATEGORIES.has(category);
}

/** 관리자 고정(verdict)이 없을 때의 자동 상태. */
export function deriveLowFinishLineStatus(requestLike) {
  if (isLowFinishLineSample(requestLike)) return "skipped";
  const stage = String(requestLike?.manufacturerStage || "").trim();
  if (stage === "취소" || stage.toLowerCase() === "cancelled") return "skipped";
  if (requestLike?.rnd?.unmachinableAt) return "failed";
  if (SUCCESS_STAGES.has(stage)) return "success";
  return "open";
}

export function resolveLowFinishLineStatus(autoStatus, verdict) {
  if (verdict === "failed" || verdict === "success") return verdict;
  return autoStatus;
}

/** 실패가 없고 통과가 목표 이상이면 준비 경고를 끈다. */
export function isLowFinishLineWarningOn({ success, failed }) {
  const ok = Number(success) || 0;
  const bad = Number(failed) || 0;
  return !(ok >= LOW_FINISH_LINE_SUCCESS_TARGET && bad === 0);
}

export function lowFinishLineCaseLabel(caseInfos) {
  const clip = (value, max) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max) : text;
  };
  const ci = caseInfos && typeof caseInfos === "object" ? caseInfos : {};
  return {
    clinicName: clip(ci.clinicName, 80),
    patientName: clip(ci.patientName, 40),
    tooth: clip(ci.tooth, 16),
    connection: clip(
      ci.implantBrand || ci.implantType || ci.implantManufacturer,
      24,
    ),
  };
}
