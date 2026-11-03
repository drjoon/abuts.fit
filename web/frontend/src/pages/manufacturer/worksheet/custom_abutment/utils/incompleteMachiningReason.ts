// 불완전 뱃지가 붙은 이유를 문장으로 만든다. 카드 툴팁과 프리뷰 하단이 같은 문장을 쓴다.
// 마진 fillet·공구 R 수치/문구는 features/requests/utils/marginFilletInspection SSOT.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/tightCornerReview.ts
// - web/frontend/src/features/requests/utils/marginFilletInspection.ts

import {
  MARGIN_FILLET_TIGHT_NOTES,
  minFilletRadiusMm,
  pickPreferredTightCorner,
  toolRadiusMmFromTightCorner,
  usableTightCornerMeta,
  type MarginFilletTightCorner,
} from "@/features/requests/utils/marginFilletInspection";
import { isTightCornerCorrectionRequired } from "./tightCornerReview";

export type IncompleteMachiningTightCorner = MarginFilletTightCorner;

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mm(value: number): string {
  return value.toFixed(2);
}

/** 목록 응답은 건수만 있고, STL 메타는 평균·샘플을 가진다. 있는 숫자를 남긴다. 버전 높은 쪽을 고른다. */
export function mergeTightCornerDetail(
  primary?: IncompleteMachiningTightCorner | null,
  fallback?: IncompleteMachiningTightCorner | null,
): IncompleteMachiningTightCorner | null {
  return pickPreferredTightCorner(primary, fallback);
}

export type IncompleteMachiningReasonStat = {
  label: string;
  value: string;
};

export type IncompleteMachiningReasonCard = {
  stats: IncompleteMachiningReasonStat[];
  notes: string[];
};

function tightCornerCard(
  tightCorner: IncompleteMachiningTightCorner,
): IncompleteMachiningReasonCard {
  const tool = toolRadiusMmFromTightCorner(tightCorner);
  const average = finite(tightCorner.averageFilletRadiusMm);
  const narrowest = minFilletRadiusMm(tightCorner.samples);
  const count = finite(tightCorner.tightCount);
  const stats: IncompleteMachiningReasonStat[] = [];

  if (average != null) stats.push({ label: "평균 fillet", value: `${mm(average)}mm` });
  stats.push({ label: "공구 R", value: `${mm(tool)}mm` });
  if (narrowest != null) stats.push({ label: "가장 좁음", value: `${mm(narrowest)}mm` });
  if (count != null && count > 0) {
    stats.push({ label: "좁은 구간", value: `${Math.round(count)}곳` });
  }

  return {
    stats,
    notes: [...MARGIN_FILLET_TIGHT_NOTES],
  };
}

function tightCornerLines(card: IncompleteMachiningReasonCard): string[] {
  const average = card.stats.find((stat) => stat.label === "평균 fillet");
  const tool = card.stats.find((stat) => stat.label === "공구 R");
  const narrowest = card.stats.find((stat) => stat.label === "가장 좁음");
  const count = card.stats.find((stat) => stat.label === "좁은 구간");
  const lines: string[] = [];
  if (average && tool) {
    lines.push(`마진 fillet 평균 ${average.value}가 공구 R ${tool.value}보다 작습니다.`);
  } else if (tool) {
    lines.push(`마진 fillet이 공구 R ${tool.value}보다 작습니다.`);
  }
  if (narrowest) lines.push(`가장 좁은 곳은 ${narrowest.value}입니다.`);
  if (count) lines.push(`좁은 구간은 ${count.value}입니다.`);
  lines.push(...card.notes);
  return lines;
}

export function incompleteMachiningReasonCard(input: {
  tightCorner?: IncompleteMachiningTightCorner | null;
  filletOvercutAllowed?: boolean;
  lowFinishLine?: boolean;
  finishLineMinZ?: number | null;
  finishLineDefective?: boolean;
  unmachinable?: boolean;
  unmachinableReason?: string | null;
}): IncompleteMachiningReasonCard {
  const stats: IncompleteMachiningReasonStat[] = [];
  const notes: string[] = [];
  const usable = usableTightCornerMeta(input.tightCorner);
  const tight = isTightCornerCorrectionRequired(usable);
  if (tight && usable) {
    const tightCard = tightCornerCard(usable);
    stats.push(...tightCard.stats);
    notes.push(...tightCard.notes);
  }
  if (input.finishLineDefective) {
    notes.push("피니시라인이 어깨를 따라가지 않습니다.");
  }
  if (input.lowFinishLine) {
    const minZ = finite(input.finishLineMinZ);
    if (minZ != null) stats.push({ label: "피니시라인", value: `${mm(minZ)}mm` });
    notes.push(
      minZ != null
        ? "피니시라인 최저 높이가 1mm보다 낮습니다."
        : "피니시라인 높이가 1mm보다 낮습니다.",
    );
  }
  if (input.unmachinable) {
    const reason = String(input.unmachinableReason || "").trim();
    notes.push(reason || "불완전가공으로 판정된 건입니다.");
  }
  return { stats, notes };
}

export function incompleteMachiningReasonLines(input: {
  tightCorner?: IncompleteMachiningTightCorner | null;
  filletOvercutAllowed?: boolean;
  lowFinishLine?: boolean;
  finishLineMinZ?: number | null;
  finishLineDefective?: boolean;
  unmachinable?: boolean;
  unmachinableReason?: string | null;
}): string[] {
  const usable = usableTightCornerMeta(input.tightCorner);
  const card = incompleteMachiningReasonCard({ ...input, tightCorner: usable });
  const tight = isTightCornerCorrectionRequired(usable);
  const lines = tight ? tightCornerLines(card) : [];
  for (const note of card.notes) {
    if (!lines.includes(note)) lines.push(note);
  }
  if (input.lowFinishLine) {
    const minZ = finite(input.finishLineMinZ);
    const lowLine =
      minZ != null
        ? `피니시라인 최저 높이 ${mm(minZ)}mm가 1mm보다 낮습니다.`
        : "피니시라인 높이가 1mm보다 낮습니다.";
    const shortLine =
      minZ != null
        ? "피니시라인 최저 높이가 1mm보다 낮습니다."
        : "피니시라인 높이가 1mm보다 낮습니다.";
    const index = lines.indexOf(shortLine);
    if (index >= 0) lines[index] = lowLine;
  }
  return lines;
}
