// 관리자가 반영한 치종 보정을 다음 생성에 더한다.
// 조정값 차이는 파라미터에, 기울기는 삽입축에 더한다.
// 축 이름·상한은 백엔드 abutmentDesignLogic.core.js 와 같아야 한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  type CustomAbutmentParamKey,
} from "@/shared/practice/customAbutmentDesignParams";

export type AbutmentToothKind = "incisor" | "canine" | "premolar" | "molar";

export type AbutmentGenerationPose = {
  tiltLabialDeg?: number;
  tiltMesialDeg?: number;
};

export type AbutmentGenerationRule = {
  toothKind: AbutmentToothKind;
  axis?: string;
  delta?: number;
  params?: Partial<Record<string, number>>;
  pose?: AbutmentGenerationPose;
};

const YAW_MIN = -30;
const YAW_MAX = 30;

export function toothKindOf(toothNumber: string): AbutmentToothKind | null {
  const digits = String(toothNumber || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const pos = Number(digits[1]);
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}

function ruleHasEffect(rule: AbutmentGenerationRule) {
  if (rule.axis && Number.isFinite(Number(rule.delta)) && Number(rule.delta) !== 0) return true;
  if (rule.params && Object.values(rule.params).some((value) => Number.isFinite(Number(value)) && Number(value) !== 0)) {
    return true;
  }
  if (rule.pose) {
    return Object.values(rule.pose).some((value) => Number.isFinite(Number(value)) && Number(value) !== 0);
  }
  return false;
}

function rulesFor(toothNumber: string, rules: readonly AbutmentGenerationRule[] | null | undefined) {
  const kind = toothKindOf(toothNumber);
  if (!kind || !rules?.length) return [];
  return rules.filter((rule) => rule.toothKind === kind && ruleHasEffect(rule));
}

/** 포스트 수평 회전만 파라미터에 더한다. 기울기·이동은 삽입축에서 따로 적용한다. */
export function applyAbutmentGenerationLogic(
  params: { postYawDeg: number },
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  for (const rule of rulesFor(toothNumber, rules)) {
    if (rule.axis !== "yawDeg" || !Number.isFinite(Number(rule.delta))) continue;
    params.postYawDeg = Math.min(YAW_MAX, Math.max(YAW_MIN, params.postYawDeg + Number(rule.delta)));
  }
}

/** 관리자가 반영한 조정값 차이를 다음 생성 파라미터에 더한다. */
export function applyStoredDesignParams(
  params: Record<string, number>,
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  for (const rule of rulesFor(toothNumber, rules)) {
    for (const [key, raw] of Object.entries(rule.params || {})) {
      const delta = Number(raw);
      const current = Number(params[key]);
      if (!Number.isFinite(delta) || delta === 0 || !Number.isFinite(current)) continue;
      if (key === "postYawDeg") {
        params.postYawDeg = Math.min(YAW_MAX, Math.max(YAW_MIN, current + delta));
        continue;
      }
      const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key as CustomAbutmentParamKey];
      const next = current + delta;
      params[key] = spec ? Math.min(spec.max, Math.max(spec.min, next)) : next;
    }
  }
}

export function generationAxisBias(
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  const bias = { tiltLabialDeg: 0, tiltMesialDeg: 0, shiftLabialMm: 0, shiftMesialMm: 0 };
  for (const rule of rulesFor(toothNumber, rules)) {
    if (rule.axis === "tiltLabialDeg") bias.tiltLabialDeg += Number(rule.delta);
    else if (rule.axis === "tiltMesialDeg") bias.tiltMesialDeg += Number(rule.delta);
    else if (rule.axis === "shiftLabialMm") bias.shiftLabialMm += Number(rule.delta);
    else if (rule.axis === "shiftMesialMm") bias.shiftMesialMm += Number(rule.delta);
    if (rule.pose?.tiltLabialDeg) bias.tiltLabialDeg += Number(rule.pose.tiltLabialDeg);
    if (rule.pose?.tiltMesialDeg) bias.tiltMesialDeg += Number(rule.pose.tiltMesialDeg);
  }
  return bias;
}

export function abutmentLogicSignature(
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  return rulesFor(toothNumber, rules)
    .map((rule) => {
      const bits = [];
      if (rule.axis && Number.isFinite(Number(rule.delta))) bits.push(`${rule.axis}:${rule.delta}`);
      if (rule.params) {
        for (const [key, value] of Object.entries(rule.params).sort(([a], [b]) => a.localeCompare(b))) {
          if (Number(value) !== 0) bits.push(`${key}:${value}`);
        }
      }
      if (rule.pose?.tiltLabialDeg) bits.push(`tiltL:${rule.pose.tiltLabialDeg}`);
      if (rule.pose?.tiltMesialDeg) bits.push(`tiltM:${rule.pose.tiltMesialDeg}`);
      return bits.join(",");
    })
    .sort()
    .join("|");
}

export function parseAbutmentGenerationRules(value: unknown): AbutmentGenerationRule[] {
  if (!Array.isArray(value)) return [];
  const out: AbutmentGenerationRule[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const toothKind = (row as { toothKind?: unknown }).toothKind;
    if (
      toothKind !== "incisor" &&
      toothKind !== "canine" &&
      toothKind !== "premolar" &&
      toothKind !== "molar"
    ) {
      continue;
    }
    const axis = String((row as { axis?: unknown }).axis || "");
    const delta = Number((row as { delta?: unknown }).delta);
    const params: Record<string, number> = {};
    const rawParams = (row as { params?: unknown }).params;
    if (rawParams && typeof rawParams === "object") {
      for (const [key, value] of Object.entries(rawParams as Record<string, unknown>)) {
        const n = Number(value);
        if (!key || !Number.isFinite(n) || n === 0) continue;
        params[key] = n;
      }
    }
    const rawPose = (row as { pose?: { tiltLabialDeg?: unknown; tiltMesialDeg?: unknown } }).pose;
    const pose: AbutmentGenerationPose = {};
    const tiltLabialDeg = Number(rawPose?.tiltLabialDeg);
    const tiltMesialDeg = Number(rawPose?.tiltMesialDeg);
    if (Number.isFinite(tiltLabialDeg) && tiltLabialDeg !== 0) pose.tiltLabialDeg = tiltLabialDeg;
    if (Number.isFinite(tiltMesialDeg) && tiltMesialDeg !== 0) pose.tiltMesialDeg = tiltMesialDeg;
    const next: AbutmentGenerationRule = { toothKind };
    if (axis && Number.isFinite(delta) && delta !== 0) {
      next.axis = axis;
      next.delta = delta;
    }
    if (Object.keys(params).length > 0) next.params = params;
    if (Object.keys(pose).length > 0) next.pose = pose;
    if (!next.axis && !next.params && !next.pose) continue;
    out.push(next);
  }
  return out;
}

