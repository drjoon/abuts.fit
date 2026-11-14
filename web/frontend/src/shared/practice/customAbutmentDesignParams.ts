// 커스텀어벗 디자인 조정값. 치과 화면 AI 대화가 이 값만 바꾸고, 디자인은 이 값으로 다시 만든다.
// 범위는 백엔드 AI 응답 검증(customAbutmentDesignChat.controller.js)과 같아야 한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js

import { toothFormOf } from "@/shared/practice/toothMorphology";

export type CustomAbutmentDesignParams = {
  /** 포스트 최정점 → 대합치 거리(mm). */
  occlusalClearanceMm: number;
  /** 포스트 축벽 편측 테이퍼(°). */
  postTaperDeg: number;
  /** 대합치가 없을 때 포스트 높이 보정(mm). 대합치가 있으면 낮추기만 한다. */
  postHeightOffsetMm: number;
  /** 포스트 굵기 배율. */
  postWidthScale: number;
  /** 마진 라운드 숄더 반경(mm). 볼 공구 R 이상. */
  marginFilletRadiusMm: number;
  /** 순측 치은연 아래 마진 깊이(mm). 설측·인접면은 이 값에 비례해 얕다. */
  marginDepthMm: number;
  /** 마진 단면 크기 배율. */
  marginSizeScale: number;
  /** 예측 크라운이 인접치·대합치에 겹치는 접촉량(mm). */
  crownContactMm: number;
  /** 크라운 최소 두께(mm). 포스트는 예측 크라운에서 이만큼 안쪽이다. */
  minCrownThicknessMm: number;
  /** 0이면 악궁 교합 방향, 1이면 대합치 중심으로 삽입축을 잡는다. */
  axisToOpposing: number;
  /** 픽스쳐 장축 대비 삽입축 최대 각도(°). */
  axisMaxDeg: number;
  /** 포스트 윗면을 순측(+)·설측(-)으로 옮기는 양(mm). */
  axisShiftLabialMm: number;
  /** 포스트 윗면을 근심(+)·원심(-)으로 옮기는 양(mm). */
  axisShiftMesialMm: number;
};

export type CustomAbutmentParamKey = keyof CustomAbutmentDesignParams;

export type CustomAbutmentParamSpec = {
  label: string;
  unit: "mm" | "°" | "배" | "";
  min: number;
  max: number;
  step: number;
};

export const CUSTOM_ABUTMENT_PARAM_SPECS: Record<CustomAbutmentParamKey, CustomAbutmentParamSpec> = {
  occlusalClearanceMm: { label: "대합치 거리", unit: "mm", min: 0.8, max: 2.5, step: 0.05 },
  postTaperDeg: { label: "포스트 테이퍼(편측)", unit: "°", min: 1, max: 8, step: 0.5 },
  postHeightOffsetMm: { label: "포스트 높이 보정", unit: "mm", min: -2, max: 2, step: 0.1 },
  postWidthScale: { label: "포스트 굵기", unit: "배", min: 0.8, max: 1.15, step: 0.01 },
  marginFilletRadiusMm: { label: "마진 라운드 R", unit: "mm", min: 0.5, max: 0.8, step: 0.05 },
  marginDepthMm: { label: "순측 마진 깊이", unit: "mm", min: 0, max: 1.5, step: 0.1 },
  marginSizeScale: { label: "마진 크기", unit: "배", min: 0.85, max: 1.2, step: 0.01 },
  crownContactMm: { label: "크라운 접촉량", unit: "mm", min: 0, max: 0.2, step: 0.01 },
  minCrownThicknessMm: { label: "크라운 최소 두께", unit: "mm", min: 0.5, max: 1.5, step: 0.05 },
  axisToOpposing: { label: "대합치 중심 반영", unit: "", min: 0, max: 1, step: 0.05 },
  axisMaxDeg: { label: "삽입축 최대 각도", unit: "°", min: 0, max: 25, step: 0.5 },
  axisShiftLabialMm: { label: "윗면 순측 이동", unit: "mm", min: -2, max: 2, step: 0.1 },
  axisShiftMesialMm: { label: "윗면 근심 이동", unit: "mm", min: -2, max: 2, step: 0.1 },
};

export const CUSTOM_ABUTMENT_PARAM_KEYS = Object.keys(
  CUSTOM_ABUTMENT_PARAM_SPECS,
) as CustomAbutmentParamKey[];

/** 치종별 기본 삽입축 상한. 추적관리 tilt p75(전치 9~10°, 소구치 8°, 대구치 7.5°)보다 여유를 둔다. */
function defaultAxisMaxDeg(toothNumber: string): number {
  const kind = toothFormOf(toothNumber)?.kind ?? "molar";
  if (kind === "incisor" || kind === "canine") return 18;
  if (kind === "premolar") return 15;
  return 12;
}

export function defaultCustomAbutmentParams(toothNumber: string): CustomAbutmentDesignParams {
  return {
    occlusalClearanceMm: 1.25,
    postTaperDeg: 2.5,
    postHeightOffsetMm: 0,
    postWidthScale: 1,
    marginFilletRadiusMm: 0.55,
    marginDepthMm: 0.7,
    marginSizeScale: 1,
    crownContactMm: 0.05,
    minCrownThicknessMm: 0.8,
    axisToOpposing: 1,
    axisMaxDeg: defaultAxisMaxDeg(toothNumber),
    axisShiftLabialMm: 0,
    axisShiftMesialMm: 0,
  };
}

/** 기본값 위에 바꾼 값만 얹고 범위 안으로 자른다. */
export function resolveCustomAbutmentParams(
  toothNumber: string,
  overrides?: Partial<CustomAbutmentDesignParams> | null,
): CustomAbutmentDesignParams {
  const out = defaultCustomAbutmentParams(toothNumber);
  if (!overrides) return out;
  for (const key of CUSTOM_ABUTMENT_PARAM_KEYS) {
    const raw = Number(overrides[key]);
    if (!Number.isFinite(raw)) continue;
    const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
    out[key] = Math.min(spec.max, Math.max(spec.min, raw));
  }
  return out;
}

/** 기본값과 다른 값만 남긴다(저장·AI 요청용). */
export function diffCustomAbutmentParams(
  toothNumber: string,
  params: CustomAbutmentDesignParams,
): Partial<CustomAbutmentDesignParams> {
  const base = defaultCustomAbutmentParams(toothNumber);
  const out: Partial<CustomAbutmentDesignParams> = {};
  for (const key of CUSTOM_ABUTMENT_PARAM_KEYS) {
    if (Math.abs(params[key] - base[key]) > 1e-6) out[key] = params[key];
  }
  return out;
}

export function parseCustomAbutmentParamOverrides(
  value: unknown,
): Partial<CustomAbutmentDesignParams> {
  if (!value || typeof value !== "object") return {};
  const out: Partial<CustomAbutmentDesignParams> = {};
  for (const key of CUSTOM_ABUTMENT_PARAM_KEYS) {
    const raw = Number((value as Record<string, unknown>)[key]);
    if (!Number.isFinite(raw)) continue;
    const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
    out[key] = Math.min(spec.max, Math.max(spec.min, raw));
  }
  return out;
}
