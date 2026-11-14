// 커스텀어벗 디자인 조정값. 치과 화면 AI 대화가 이 값만 바꾸고, 디자인은 이 값으로 다시 만든다.
// 범위는 백엔드 AI 응답 검증(customAbutmentDesignChat.controller.js)과 같아야 한다.
// 치과 취향(기본값)은 의뢰 치과 사업자에 저장되고, 치종 기본값 → 치과 취향 → 케이스 조정 순으로 얹는다.
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
  /** 가공 공구 R(mm). 마진 챔퍼의 오목 곡률은 이보다 작아지지 않는다. */
  marginFilletRadiusMm: number;
  /** 마진 챔퍼 폭(mm). 피니시라인에서 포스트 축벽까지 안쪽으로 들어가는 양. */
  marginShoulderMm: number;
  /** 치은연 아래 피니시라인 깊이(mm). 둘레 전체에 같게 둔다. */
  marginDepthMm: number;
  /** 마진 단면 크기 배율. */
  marginSizeScale: number;
  /** 예측 크라운이 인접치·대합치에 겹치는 접촉량(mm). */
  crownContactMm: number;
  /** 크라운 두께(mm). 포스트는 예측 크라운에서 이만큼 안쪽이다. 공간이 없으면 0.65mm까지 줄인다. */
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
  marginFilletRadiusMm: { label: "마진 챔퍼 R", unit: "mm", min: 0.5, max: 0.8, step: 0.05 },
  marginShoulderMm: { label: "마진 폭", unit: "mm", min: 0.3, max: 0.8, step: 0.05 },
  marginDepthMm: { label: "마진 깊이(치은 하방)", unit: "mm", min: 0, max: 1.5, step: 0.1 },
  marginSizeScale: { label: "마진 크기", unit: "배", min: 0.85, max: 1.2, step: 0.01 },
  crownContactMm: { label: "크라운 접촉량", unit: "mm", min: 0, max: 0.2, step: 0.01 },
  minCrownThicknessMm: { label: "크라운 두께", unit: "mm", min: 0.65, max: 1.5, step: 0.05 },
  axisToOpposing: { label: "대합치 중심 반영", unit: "", min: 0, max: 1, step: 0.05 },
  axisMaxDeg: { label: "삽입축 최대 각도", unit: "°", min: 0, max: 25, step: 0.5 },
  axisShiftLabialMm: { label: "윗면 순측 이동", unit: "mm", min: -2, max: 2, step: 0.1 },
  axisShiftMesialMm: { label: "윗면 근심 이동", unit: "mm", min: -2, max: 2, step: 0.1 },
};

export const CUSTOM_ABUTMENT_PARAM_KEYS = Object.keys(
  CUSTOM_ABUTMENT_PARAM_SPECS,
) as CustomAbutmentParamKey[];

/** 치과 취향으로 저장할 수 있는 값. 윗면 이동은 케이스마다 달라 뺀다. */
export const CUSTOM_ABUTMENT_PREFERENCE_KEYS = CUSTOM_ABUTMENT_PARAM_KEYS.filter(
  (key) => key !== "axisShiftLabialMm" && key !== "axisShiftMesialMm",
);

export type CustomAbutmentPreferenceScope = "all" | "anterior" | "posterior";

/** 치과(의뢰자) 디자인 취향. scope별 값이 치종 기본값을 덮는다. */
export type CustomAbutmentDesignPreference = {
  scopes: Partial<Record<CustomAbutmentPreferenceScope, Partial<CustomAbutmentDesignParams>>>;
  notes: string[];
  updatedAt: string | null;
};

export const EMPTY_CUSTOM_ABUTMENT_PREFERENCE: CustomAbutmentDesignPreference = {
  scopes: {},
  notes: [],
  updatedAt: null,
};

/** 치종별 기본 삽입축 상한. 추적관리 tilt p75(전치 9~10°, 소구치 8°, 대구치 7.5°)보다 여유를 둔다. */
function defaultAxisMaxDeg(toothNumber: string): number {
  const kind = toothFormOf(toothNumber)?.kind ?? "molar";
  if (kind === "incisor" || kind === "canine") return 18;
  if (kind === "premolar") return 15;
  return 12;
}

export function isAnteriorTooth(toothNumber: string): boolean {
  const kind = toothFormOf(toothNumber)?.kind ?? "molar";
  return kind === "incisor" || kind === "canine";
}

export function defaultCustomAbutmentParams(toothNumber: string): CustomAbutmentDesignParams {
  return {
    occlusalClearanceMm: 1.25,
    postTaperDeg: 2.5,
    postHeightOffsetMm: 0,
    postWidthScale: 1,
    marginFilletRadiusMm: 0.6,
    marginShoulderMm: 0.5,
    marginDepthMm: 0.5,
    marginSizeScale: 1,
    crownContactMm: 0.05,
    minCrownThicknessMm: 1,
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

export function parseCustomAbutmentParamOverrides(
  value: unknown,
  keys: readonly CustomAbutmentParamKey[] = CUSTOM_ABUTMENT_PARAM_KEYS,
): Partial<CustomAbutmentDesignParams> {
  if (!value || typeof value !== "object") return {};
  const out: Partial<CustomAbutmentDesignParams> = {};
  for (const key of keys) {
    const raw = Number((value as Record<string, unknown>)[key]);
    if (!Number.isFinite(raw)) continue;
    const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
    out[key] = Math.min(spec.max, Math.max(spec.min, raw));
  }
  return out;
}

export function parseCustomAbutmentPreference(value: unknown): CustomAbutmentDesignPreference {
  if (!value || typeof value !== "object") return EMPTY_CUSTOM_ABUTMENT_PREFERENCE;
  const raw = value as { scopes?: Record<string, unknown>; notes?: unknown; updatedAt?: unknown };
  const scopes: CustomAbutmentDesignPreference["scopes"] = {};
  for (const scope of ["all", "anterior", "posterior"] as const) {
    const parsed = parseCustomAbutmentParamOverrides(
      raw.scopes?.[scope],
      CUSTOM_ABUTMENT_PREFERENCE_KEYS,
    );
    if (Object.keys(parsed).length > 0) scopes[scope] = parsed;
  }
  return {
    scopes,
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((n) => String(n || "").trim()).filter(Boolean).slice(-20)
      : [],
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}

/** 치과 취향 중 이 치아에 해당하는 값(전체 → 전치/구치 순으로 덮는다). */
export function preferenceOverridesForTooth(
  toothNumber: string,
  pref: CustomAbutmentDesignPreference | null | undefined,
): Partial<CustomAbutmentDesignParams> {
  if (!pref) return {};
  return {
    ...(pref.scopes.all ?? {}),
    ...((isAnteriorTooth(toothNumber) ? pref.scopes.anterior : pref.scopes.posterior) ?? {}),
  };
}

export function hasCustomAbutmentPreference(
  pref: CustomAbutmentDesignPreference | null | undefined,
): boolean {
  if (!pref) return false;
  return Object.values(pref.scopes).some((v) => v && Object.keys(v).length > 0);
}

const SCOPE_LABEL: Record<CustomAbutmentPreferenceScope, string> = {
  all: "전체",
  anterior: "전치",
  posterior: "구치",
};

/** 「전체: 마진 깊이 0.8mm · 구치: 크라운 두께 1.2mm」 */
export function describeCustomAbutmentPreference(pref: CustomAbutmentDesignPreference): string {
  const parts: string[] = [];
  for (const scope of ["all", "anterior", "posterior"] as const) {
    const values = pref.scopes[scope];
    if (!values) continue;
    const items = Object.entries(values).map(([key, v]) => {
      const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key as CustomAbutmentParamKey];
      return `${spec.label} ${Math.round(Number(v) * 100) / 100}${spec.unit}`;
    });
    if (items.length > 0) parts.push(`${SCOPE_LABEL[scope]}: ${items.join(" · ")}`);
  }
  return parts.join(" / ");
}
