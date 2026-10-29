// related files:
// - web/backend/services/abutmentStl/cuffBlend.service.js (caseInfos.cuffBlend 기록)
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js (spec-pending 시 개발팀이 채울 스펙표)
// - .cursor/rules/cuff-connection-spec.mdc (미니·내로우 11° 면은 샘플 후 PRC·STL 콘을 다시 맞춤)
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx

export type CuffBlendRecord = {
  version?: string;
  mode?: "auto" | "redesign";
  status?: "applied" | "manual-review" | "spec-pending" | "failed" | string;
  reason?: string | null;
  specKey?: string | null;
  matchedSpecKey?: string | null;
  zA?: number | null;
  zB?: number | null;
  maxAngleDeg?: number | null;
  /** spec-pending 샘플 분석(백그라운드 워커). ready면 taperHeightMm가 다수 군집 제안값. */
  specSuggestion?: {
    status?: "collecting" | "ready" | "mixed" | string;
    sampleCount?: number;
    needed?: number;
    taperHeightMm?: number | null;
    originDiameter?: number | null;
    clusterCount?: number;
    outlierCount?: number;
    analyzedAt?: string | null;
  } | null;
  updatedAt?: string | null;
};

export function resolveCuffBlend(caseInfos: unknown): CuffBlendRecord | null {
  const rec = (caseInfos as { cuffBlend?: CuffBlendRecord } | null)?.cuffBlend;
  return rec && typeof rec === "object" && rec.status ? rec : null;
}

/** 안전 검사 실패 — FL 불량처럼 수동 검토(Re 또는 그대로 진행). */
export function isCuffBlendManualReview(rec: CuffBlendRecord | null): boolean {
  return rec?.status === "manual-review" || rec?.status === "failed";
}

/** 의뢰자에게 커프 형상 수정을 제안하고 결정을 기다리는 중. */
export function isCuffProposalPending(caseInfos: unknown): boolean {
  return (caseInfos as { cuffProposal?: { status?: string } } | null)?.cuffProposal?.status === "proposed";
}

/** 커넥션 스펙 미등록·형상 불일치 — 개발팀이 스펙표를 갱신해야 한다. */
export function isCuffSpecPending(rec: CuffBlendRecord | null): boolean {
  return rec?.status === "spec-pending";
}

const tokenFamily = (value?: string | null) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** 미니·내로우·스몰내로우. Regular RH 0.3~0.4와 달리 11° 면이 아직 브랜드별로 안 맞춰졌다. */
export function isMiniNarrowCuffFamily(input: {
  specKey?: string | null;
  implantFamily?: string | null;
}): boolean {
  const fromKey = tokenFamily(String(input.specKey || "").split("|")[2]);
  const family = fromKey || tokenFamily(input.implantFamily);
  return family === "MINI" || family === "SMALL" || family === "NARROW" || family === "SMALLNARROW" || family === "SN";
}
