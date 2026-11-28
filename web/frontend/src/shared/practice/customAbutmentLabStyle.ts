// 기공소별 커스텀어벗 디자인 스타일 프로필(파라미터 세트).
// 치종 기본 → 기공소 스타일 → 치과 취향 → 케이스 조정 순으로 얹는다.
// 단면 형상(toothSectionRadius)은 다루지 않는다 — Gemini Carbon 전용.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/controllers/ai/customAbutmentLabStyle.controller.js

import {
  CUSTOM_ABUTMENT_PREFERENCE_KEYS,
  isAnteriorTooth,
  parseCustomAbutmentParamOverrides,
  type CustomAbutmentDesignParams,
  type CustomAbutmentPreferenceScope,
} from "@/shared/practice/customAbutmentDesignParams";

export type CustomAbutmentLabStyleScope = CustomAbutmentPreferenceScope;

/** 저장·적용 가능한 기공소 스타일 한 벌. */
export type CustomAbutmentLabStyleProfile = {
  id: string;
  name: string;
  /** 우리/알토란 등 참고 출처 메모. */
  note?: string;
  scopes: Partial<Record<CustomAbutmentLabStyleScope, Partial<CustomAbutmentDesignParams>>>;
};

export type CustomAbutmentLabStyleLibrary = {
  /** 지금 적용 중인 프로필 id. 없으면 built-in 기본. */
  activeId: string;
  profiles: CustomAbutmentLabStyleProfile[];
  updatedAt: string | null;
};

/**
 * 플랫폼 기본 = 우리치과기공소·알토란 실측에서 가져온 전치 양면 경사 스타일.
 * ML 학습이 아니라 수동 시드 파라미터다. 단면 φ 게이지는 넣지 않는다.
 */
export const BUILTIN_LAB_STYLE_PROFILES: readonly CustomAbutmentLabStyleProfile[] = [
  {
    id: "uri-altoran",
    name: "우리·알토란",
    note: "전치 순·설 사면을 뚜렷하게. 설측은 자동 싱귤럼, 순측은 치경 칼라 위 경사.",
    scopes: {
      anterior: {
        // 0=없음, >0=마진에서 사면 시작 높이. 자동보다 조금 이른 순측 경사.
        postLabialBevelMm: 1.8,
        // -1=전치 자동 설측 사면(유지). 명시 높이로 바꾸면 케이스마다 달라질 수 있어 시드는 자동.
        postLingualBevelMm: -1,
        marginScallopMm: 0.85,
        marginShoulderMm: 0.4,
      },
      posterior: {
        postLabialBevelMm: 0,
        postLingualBevelMm: 0,
        marginScallopMm: 0.55,
        marginShoulderMm: 0.5,
      },
    },
  },
  {
    id: "neutral",
    name: "기본(보정 없음)",
    note: "치종 기본값만 쓴다.",
    scopes: {},
  },
];

export const DEFAULT_LAB_STYLE_ACTIVE_ID = "uri-altoran";

export const EMPTY_CUSTOM_ABUTMENT_LAB_STYLE: CustomAbutmentLabStyleLibrary = {
  activeId: DEFAULT_LAB_STYLE_ACTIVE_ID,
  profiles: [],
  updatedAt: null,
};

function profileFromUnknown(raw: unknown): CustomAbutmentLabStyleProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    name?: unknown;
    note?: unknown;
    scopes?: Record<string, unknown>;
  };
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !name) return null;
  const scopes: CustomAbutmentLabStyleProfile["scopes"] = {};
  for (const scope of ["all", "anterior", "posterior"] as const) {
    const parsed = parseCustomAbutmentParamOverrides(
      row.scopes?.[scope],
      CUSTOM_ABUTMENT_PREFERENCE_KEYS,
    );
    if (Object.keys(parsed).length > 0) scopes[scope] = parsed;
  }
  return {
    id,
    name,
    note: row.note ? String(row.note) : undefined,
    scopes,
  };
}

export function parseCustomAbutmentLabStyle(value: unknown): CustomAbutmentLabStyleLibrary {
  if (!value || typeof value !== "object") return { ...EMPTY_CUSTOM_ABUTMENT_LAB_STYLE };
  const raw = value as {
    activeId?: unknown;
    profiles?: unknown;
    updatedAt?: unknown;
  };
  const profiles: CustomAbutmentLabStyleProfile[] = [];
  if (Array.isArray(raw.profiles)) {
    for (const row of raw.profiles) {
      const parsed = profileFromUnknown(row);
      if (parsed) profiles.push(parsed);
    }
  }
  const activeId = String(raw.activeId || "").trim() || DEFAULT_LAB_STYLE_ACTIVE_ID;
  return {
    activeId,
    profiles,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}

export function resolveActiveLabStyleProfile(
  library: CustomAbutmentLabStyleLibrary | null | undefined,
): CustomAbutmentLabStyleProfile {
  const lib = library ?? EMPTY_CUSTOM_ABUTMENT_LAB_STYLE;
  const fromLab = lib.profiles.find((p) => p.id === lib.activeId);
  if (fromLab) return fromLab;
  const builtin = BUILTIN_LAB_STYLE_PROFILES.find((p) => p.id === lib.activeId);
  if (builtin) return builtin;
  return BUILTIN_LAB_STYLE_PROFILES[0]!;
}

/** 기공소 스타일 중 이 치아에 해당하는 값(전체 → 전치/구치). */
export function labStyleOverridesForTooth(
  toothNumber: string,
  library: CustomAbutmentLabStyleLibrary | null | undefined,
): Partial<CustomAbutmentDesignParams> {
  const profile = resolveActiveLabStyleProfile(library);
  return {
    ...(profile.scopes.all ?? {}),
    ...((isAnteriorTooth(toothNumber) ? profile.scopes.anterior : profile.scopes.posterior) ?? {}),
  };
}

/**
 * 생성에 넘길 조정값 레이어.
 * 치종 기본은 design 쪽에서 얹고, 여기서는 기공소 → 치과 → 케이스만 합친다.
 */
export function mergeDesignParamLayers(args: {
  toothNumber: string;
  labStyle?: CustomAbutmentLabStyleLibrary | null;
  preference?: Partial<CustomAbutmentDesignParams> | null;
  caseOverrides?: Partial<CustomAbutmentDesignParams> | null;
}): Partial<CustomAbutmentDesignParams> {
  return {
    ...labStyleOverridesForTooth(args.toothNumber, args.labStyle),
    ...(args.preference ?? {}),
    ...(args.caseOverrides ?? {}),
  };
}

export function listLabStyleProfileChoices(
  library: CustomAbutmentLabStyleLibrary | null | undefined,
): CustomAbutmentLabStyleProfile[] {
  const lib = library ?? EMPTY_CUSTOM_ABUTMENT_LAB_STYLE;
  const byId = new Map<string, CustomAbutmentLabStyleProfile>();
  for (const p of BUILTIN_LAB_STYLE_PROFILES) byId.set(p.id, p);
  for (const p of lib.profiles) byId.set(p.id, p);
  return [...byId.values()];
}
