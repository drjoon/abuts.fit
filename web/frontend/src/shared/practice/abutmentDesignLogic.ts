// 관리자가 승인한 치종 보정을 다음 생성에 더한다.
// 커프·대합 거리 같은 취향은 여기 오지 않고, 의뢰자 기본값 모달에 남는다.
// 축 이름·잡음 크기는 백엔드 abutmentDesignLogic.core.js 와 같아야 한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

export type AbutmentToothKind = "incisor" | "canine" | "premolar" | "molar";

export type AbutmentGenerationRule = {
  toothKind: AbutmentToothKind;
  axis: string;
  delta: number;
};

export type GenerationGumballEdit = {
  tiltLabialDeg: number;
  tiltMesialDeg: number;
  shiftLabialMm: number;
  shiftMesialMm: number;
  yawDeg: number;
};

const NOISE = {
  tiltLabialDeg: 1.5,
  tiltMesialDeg: 1.5,
  shiftLabialMm: 0.2,
  shiftMesialMm: 0.2,
  yawDeg: 4,
} as const;

type GenerationAxis = keyof typeof NOISE;

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

function rulesFor(toothNumber: string, rules: readonly AbutmentGenerationRule[] | null | undefined) {
  const kind = toothKindOf(toothNumber);
  if (!kind || !rules?.length) return [];
  return rules.filter((rule) => rule.toothKind === kind && Number.isFinite(Number(rule.delta)));
}

/** 포스트 수평 회전만 파라미터에 더한다. 기울기·이동은 삽입축에서 따로 적용한다. */
export function applyAbutmentGenerationLogic(
  params: { postYawDeg: number },
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  for (const rule of rulesFor(toothNumber, rules)) {
    if (rule.axis !== "yawDeg") continue;
    params.postYawDeg = Math.min(YAW_MAX, Math.max(YAW_MIN, params.postYawDeg + rule.delta));
  }
}

export function generationAxisBias(
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  const bias = { tiltLabialDeg: 0, tiltMesialDeg: 0, shiftLabialMm: 0, shiftMesialMm: 0 };
  for (const rule of rulesFor(toothNumber, rules)) {
    if (rule.axis === "tiltLabialDeg") bias.tiltLabialDeg += rule.delta;
    else if (rule.axis === "tiltMesialDeg") bias.tiltMesialDeg += rule.delta;
    else if (rule.axis === "shiftLabialMm") bias.shiftLabialMm += rule.delta;
    else if (rule.axis === "shiftMesialMm") bias.shiftMesialMm += rule.delta;
  }
  return bias;
}

export function abutmentLogicSignature(
  toothNumber: string,
  rules: readonly AbutmentGenerationRule[] | null | undefined,
) {
  return rulesFor(toothNumber, rules)
    .map((rule) => `${rule.axis}:${rule.delta}`)
    .sort()
    .join("|");
}

export function parseAbutmentGenerationRules(value: unknown): AbutmentGenerationRule[] {
  if (!Array.isArray(value)) return [];
  const out: AbutmentGenerationRule[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const toothKind = (row as { toothKind?: unknown }).toothKind;
    const axis = String((row as { axis?: unknown }).axis || "");
    const delta = Number((row as { delta?: unknown }).delta);
    if (
      toothKind !== "incisor" &&
      toothKind !== "canine" &&
      toothKind !== "premolar" &&
      toothKind !== "molar"
    ) {
      continue;
    }
    if (!axis || !Number.isFinite(delta) || delta === 0) continue;
    out.push({ toothKind, axis, delta });
  }
  return out;
}

type ParamSnap = {
  axisShiftLabialMm?: number;
  axisShiftMesialMm?: number;
  postYawDeg?: number;
  occlusalClearanceMm?: number;
  marginDepthMm?: number;
};

const PARAM_AXIS: Record<"axisShiftLabialMm" | "axisShiftMesialMm" | "postYawDeg", GenerationAxis> = {
  axisShiftLabialMm: "shiftLabialMm",
  axisShiftMesialMm: "shiftMesialMm",
  postYawDeg: "yawDeg",
};

function pushDelta(
  deltas: { axis: string; before: number; after: number }[],
  axis: GenerationAxis,
  before: number,
  after: number,
) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return;
  if (Math.abs(after - before) < NOISE[axis]) return;
  deltas.push({ axis, before, after });
}

/** 취향 값(커프·대합 거리·굵기)은 빼고, 생성기가 치종마다 반복해서 틀리는 기울기·이동·회전만 남긴다. */
export function collectGenerationEditRows(args: {
  teeth: readonly { toothNumber: string; params: ParamSnap }[];
  baselineParams: Record<string, ParamSnap | undefined>;
  gumball: readonly { tooth: string; edit: GenerationGumballEdit }[];
}) {
  const gumballByTooth = new Map(args.gumball.map((row) => [row.tooth, row.edit]));
  const out: { toothNumber: string; deltas: { axis: string; before: number; after: number }[] }[] = [];
  for (const tooth of args.teeth) {
    const deltas: { axis: string; before: number; after: number }[] = [];
    const edit = gumballByTooth.get(tooth.toothNumber);
    const used = new Set<GenerationAxis>();
    if (edit) {
      const pairs: [GenerationAxis, number][] = [
        ["tiltLabialDeg", edit.tiltLabialDeg],
        ["tiltMesialDeg", edit.tiltMesialDeg],
        ["shiftLabialMm", edit.shiftLabialMm],
        ["shiftMesialMm", edit.shiftMesialMm],
        ["yawDeg", edit.yawDeg],
      ];
      for (const [axis, after] of pairs) {
        pushDelta(deltas, axis, 0, after);
        if (deltas.some((row) => row.axis === axis)) used.add(axis);
      }
    }
    const base = args.baselineParams[tooth.toothNumber];
    if (base) {
      for (const key of Object.keys(PARAM_AXIS) as (keyof typeof PARAM_AXIS)[]) {
        const axis = PARAM_AXIS[key];
        if (used.has(axis)) continue;
        const before = Number(base[key]);
        const after = Number(tooth.params[key]);
        pushDelta(deltas, axis, before, after);
      }
    }
    if (deltas.length > 0) out.push({ toothNumber: tooth.toothNumber, deltas });
  }
  return out;
}
