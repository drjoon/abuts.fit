// 마진 fillet / 공구 R 검사 — 의뢰자 업로드 preflight · 제조사 PreviewModal 공통 SSOT.
// related files:
// - web/backend/services/abutmentStl/tightCorner.js (TIGHT_CORNER_VERSION)
// - web/frontend/src/features/requests/utils/finishToolRadius.ts
// - web/frontend/src/features/requests/components/StlMachiningPreflightNotice.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/incompleteMachiningReason.ts

import {
  FINISH_TOOL_RADIUS_MM,
  displayFinishToolRadiusMm,
  finishToolRadiusMm,
} from "./finishToolRadius";

/** 백엔드 `TIGHT_CORNER_VERSION`과 같아야 한다. 미만이면 피니시라인 날 R0 오검사라 표시하지 않는다. */
export const CURRENT_TIGHT_CORNER_VERSION = 9;

export const MARGIN_FILLET_TIGHT_NOTES = [
  "마진 코너가 깊게 패입니다.",
  `반경 ${FINISH_TOOL_RADIUS_MM.toFixed(1)}mm 이상으로 둥글게 디자인해 주세요.`,
] as const;

export type MarginFilletTightCorner = {
  version?: number | null;
  tightCount?: number | null;
  needsCorrectionReview?: boolean | null;
  averageFilletRadiusMm?: number | null;
  toolDiameterMm?: number | null;
  toolRadiusMm?: number | null;
  samples?: Array<{ filletRadiusMm?: number | null }> | null;
  correctionSolid?: { positions?: number[] } | null;
  reliefOverlay?: { positions?: number[] } | null;
};

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatToolRadiusMm(toolRadiusMm?: number | null): string {
  return displayFinishToolRadiusMm(toolRadiusMm).toFixed(2);
}

export function toolRadiusMmFromTightCorner(
  tightCorner?: MarginFilletTightCorner | null,
): number {
  const fromRadius = finite(tightCorner?.toolRadiusMm);
  if (fromRadius != null && fromRadius > 0) {
    return displayFinishToolRadiusMm(fromRadius);
  }
  return finishToolRadiusMm(finite(tightCorner?.toolDiameterMm));
}

/** v9 미만(또는 version 없음)은 피니시라인 날을 R0으로 잰 구메타 — 화면·뱃지에 쓰지 않는다. */
export function isCurrentTightCornerMeta(
  tightCorner?: MarginFilletTightCorner | null,
): boolean {
  if (!tightCorner || typeof tightCorner !== "object") return false;
  const version = finite(tightCorner.version);
  return version != null && version >= CURRENT_TIGHT_CORNER_VERSION;
}

export function minFilletRadiusMm(
  samples?: MarginFilletTightCorner["samples"],
): number | null {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  let min: number | null = null;
  for (const sample of samples) {
    const radius = finite(sample?.filletRadiusMm);
    if (radius == null) continue;
    if (min == null || radius < min) min = radius;
  }
  return min;
}

export function pickPreferredTightCorner<T extends MarginFilletTightCorner>(
  primary?: T | null,
  fallback?: T | null,
): T | null {
  if (!primary) return fallback ?? null;
  if (!fallback) return primary;
  const primaryVersion = finite(primary.version) ?? -1;
  const fallbackVersion = finite(fallback.version) ?? -1;
  if (fallbackVersion > primaryVersion) {
    return {
      ...primary,
      ...fallback,
      averageFilletRadiusMm:
        finite(fallback.averageFilletRadiusMm) ?? primary.averageFilletRadiusMm,
      toolDiameterMm:
        finite(fallback.toolDiameterMm) != null && Number(fallback.toolDiameterMm) > 0
          ? fallback.toolDiameterMm
          : primary.toolDiameterMm,
      tightCount: finite(fallback.tightCount) ?? primary.tightCount,
      samples:
        Array.isArray(fallback.samples) && fallback.samples.length > 0
          ? fallback.samples
          : primary.samples,
      needsCorrectionReview:
        typeof fallback.needsCorrectionReview === "boolean"
          ? fallback.needsCorrectionReview
          : primary.needsCorrectionReview,
      version: fallback.version ?? primary.version,
    };
  }
  const primarySamples =
    Array.isArray(primary.samples) && primary.samples.length > 0
      ? primary.samples
      : null;
  return {
    ...fallback,
    ...primary,
    averageFilletRadiusMm:
      finite(primary.averageFilletRadiusMm) ?? fallback.averageFilletRadiusMm,
    toolDiameterMm:
      finite(primary.toolDiameterMm) != null && Number(primary.toolDiameterMm) > 0
        ? primary.toolDiameterMm
        : fallback.toolDiameterMm,
    tightCount: finite(primary.tightCount) ?? fallback.tightCount,
    samples: primarySamples ?? fallback.samples,
    needsCorrectionReview:
      typeof primary.needsCorrectionReview === "boolean"
        ? primary.needsCorrectionReview
        : fallback.needsCorrectionReview,
    version: primary.version ?? fallback.version,
  };
}

/** 표시·오버레이에 쓸 수 있는 현재 버전 메타만 남긴다. */
export function usableTightCornerMeta<T extends MarginFilletTightCorner>(
  tightCorner?: T | null,
): T | null {
  return isCurrentTightCornerMeta(tightCorner) ? (tightCorner as T) : null;
}

export type MarginFilletInspectionStatus = "tight" | "ok" | "unknown";

export type MarginFilletInspection = {
  status: MarginFilletInspectionStatus;
  tightCount?: number;
  averageFilletRadiusMm?: number | null;
  minFilletRadiusMm?: number | null;
  toolRadiusMm?: number | null;
  toolDiameterMm?: number | null;
  reason?: string;
};

/** 저장된 tightCorner → 의뢰자/제조사 공통 검사 요약. 구버전은 unknown(표시 안 함). */
export function tightCornerToMarginFilletInspection(
  tightCorner?: MarginFilletTightCorner | null,
): MarginFilletInspection | null {
  if (!tightCorner) return null;
  if (!isCurrentTightCornerMeta(tightCorner)) {
    return { status: "unknown", reason: "stale_tight_corner_version" };
  }
  const toolRadiusMm = toolRadiusMmFromTightCorner(tightCorner);
  const average = finite(tightCorner.averageFilletRadiusMm);
  const min = minFilletRadiusMm(tightCorner.samples);
  const count = finite(tightCorner.tightCount);
  const tight =
    (typeof tightCorner.needsCorrectionReview === "boolean"
      ? tightCorner.needsCorrectionReview
      : false) ||
    (count != null && count > 0);
  return {
    status: tight ? "tight" : "ok",
    tightCount: count ?? undefined,
    averageFilletRadiusMm: average,
    minFilletRadiusMm: min,
    toolRadiusMm,
    toolDiameterMm:
      finite(tightCorner.toolDiameterMm) != null && Number(tightCorner.toolDiameterMm) > 0
        ? Number(tightCorner.toolDiameterMm)
        : toolRadiusMm * 2,
  };
}
