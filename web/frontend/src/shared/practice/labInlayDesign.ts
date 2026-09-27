// 기공소 AI 보철 — 인레이·온레이 와동 단면, 두께, 재료 프리셋, 와동 벽 테이퍼.

import {
  applyInnerPreset,
  INNER_PRESETS,
  shellIsThin,
  type InnerPreset,
  type InnerPresetId,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

export type CavityKind = "inlay" | "onlay";

/** 와동 검출 결과. 마진 반지름·높이와 같이 수정값 `margin.cavity`에 둔다. */
export type CavityInfo = NonNullable<ToothDesignEdit["margin"]["cavity"]>;

/** 임플란트는 인레이가 없다. 치아 유형 카드에서 바꾸면 `prosthesisType`이 따라온다. */
export function cavityKindOf(tooth: {
  prosthesisType: string;
  implant?: unknown;
}): CavityKind | null {
  if (tooth.implant) return null;
  if (tooth.prosthesisType === "인레이") return "inlay";
  if (tooth.prosthesisType === "온레이") return "onlay";
  return null;
}

export function cavityDepthMm(edit: ToothDesignEdit, kind: CavityKind) {
  const depth = normalizeCavityInfo(edit.margin.cavity)?.depthMm;
  return depth ?? DEFAULT_CAVITY_DEPTH_MM[kind];
}

/** 크라운은 껍질 두께, 인레이·온레이는 와동 단면 두께로 본다. */
export function designIsThin(edit: ToothDesignEdit, kind: CavityKind | null) {
  if (!kind || edit.pontic.on || edit.implant.on) return shellIsThin(edit);
  return cavityIsThin(edit, kind, cavityDepthMm(edit, kind));
}

/** 와동 검출값. 오프셋은 0으로 돌린다. */
export function applyDetectedCavity(
  edit: ToothDesignEdit,
  hit: { radii: number[]; depths: number[]; taperDeg: number[]; depthMm: number; openSides: number },
): ToothDesignEdit {
  const count = Math.min(hit.radii.length, hit.depths.length);
  if (count < 8) return edit;
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: hit.radii.slice(0, count),
      depths: hit.depths.slice(0, count),
      offsetMm: 0,
      deleted: false,
      cavity: {
        depthMm: hit.depthMm,
        taperDeg: hit.taperDeg.slice(0, count),
        openSides: hit.openSides,
      },
    },
  };
}

export const DEFAULT_CAVITY_DEPTH_MM: Record<CavityKind, number> = {
  inlay: 1.8,
  onlay: 2.0,
};

/** 검출 전 마진 고리. 기본 원(`toothRadius * 0.78`)에 대한 비. */
export const DEFAULT_CAVITY_MARGIN_RATIO: Record<CavityKind, number> = {
  inlay: 0.52,
  onlay: 0.82,
};

/** 마진 쪽 경사 띠. 가장자리는 얇아지는 게 정상이라 두께 경고에서 뺀다. */
export const CAVITY_EDGE_BAND = 0.22;
/** 와동 벽이 바닥에 닿는 단면 비. */
const WALL_BAND = 0.25;

/** 와동 벽 발산각(°). 이보다 작으면 삽입축과 평행하거나 언더컷이다. */
export const CAVITY_TAPER_UNDERCUT_DEG = 2;
/** 이보다 크면 유지력이 떨어진다. */
export const CAVITY_TAPER_WIDE_DEG = 15;
export const CAVITY_TAPER_RECOMMENDED = "6–10°";

type MaterialNumbers = Omit<InnerPreset, "id" | "label">;

/** 인레이·온레이 재료별 값. 크라운보다 최소 두께가 두껍다. */
const CAVITY_PRESETS: Record<
  CavityKind,
  Partial<Record<Exclude<InnerPresetId, "clinic" | "custom">, MaterialNumbers>>
> = {
  inlay: {
    zirconia: {
      cementGapMm: 0.06,
      spacerMm: 0.04,
      marginTaperMm: 0.02,
      minThicknessMm: 1.0,
      occlusalClearanceMm: 0.1,
      proximalClearanceMm: 0.05,
    },
    glass: {
      cementGapMm: 0.08,
      spacerMm: 0.05,
      marginTaperMm: 0.05,
      minThicknessMm: 1.5,
      occlusalClearanceMm: 0.1,
      proximalClearanceMm: 0.05,
    },
    pmma: {
      cementGapMm: 0.1,
      spacerMm: 0.05,
      marginTaperMm: 0,
      minThicknessMm: 1.5,
      occlusalClearanceMm: 0.15,
      proximalClearanceMm: 0.08,
    },
    print: {
      cementGapMm: 0.1,
      spacerMm: 0.06,
      marginTaperMm: 0.03,
      minThicknessMm: 1.2,
      occlusalClearanceMm: 0.12,
      proximalClearanceMm: 0.06,
    },
  },
  onlay: {
    zirconia: {
      cementGapMm: 0.06,
      spacerMm: 0.05,
      marginTaperMm: 0.02,
      minThicknessMm: 1.2,
      occlusalClearanceMm: 0.1,
      proximalClearanceMm: 0.05,
    },
    glass: {
      cementGapMm: 0.08,
      spacerMm: 0.05,
      marginTaperMm: 0.05,
      minThicknessMm: 1.8,
      occlusalClearanceMm: 0.1,
      proximalClearanceMm: 0.05,
    },
    pmma: {
      cementGapMm: 0.1,
      spacerMm: 0.06,
      marginTaperMm: 0,
      minThicknessMm: 1.8,
      occlusalClearanceMm: 0.15,
      proximalClearanceMm: 0.08,
    },
    print: {
      cementGapMm: 0.1,
      spacerMm: 0.06,
      marginTaperMm: 0.03,
      minThicknessMm: 1.5,
      occlusalClearanceMm: 0.12,
      proximalClearanceMm: 0.06,
    },
  },
};

/** 보철 형태에 맞춘 재료 목록. 크라운은 기본 목록 그대로다. */
export function innerPresetsFor(kind: CavityKind | null): InnerPreset[] {
  if (!kind) return INNER_PRESETS;
  return INNER_PRESETS.map((row) => {
    const numbers = CAVITY_PRESETS[kind][row.id as keyof (typeof CAVITY_PRESETS)[CavityKind]];
    return numbers ? { ...row, ...numbers } : row;
  });
}

/** 재료를 고르면 이 숫자를 치아에 고정한다. 직접 입력·치과 프리셋은 숫자를 건드리지 않는다. */
export function applyCavityPreset(
  edit: ToothDesignEdit,
  kind: CavityKind,
  presetId: InnerPresetId,
): ToothDesignEdit {
  if (presetId === "custom" || presetId === "clinic") {
    return { ...edit, inner: { ...edit.inner, preset: presetId, applied: false } };
  }
  const preset =
    innerPresetsFor(kind).find((row) => row.id === presetId) ?? innerPresetsFor(kind)[0]!;
  return {
    ...edit,
    inner: {
      ...edit.inner,
      preset: preset.id,
      cementGapMm: preset.cementGapMm,
      spacerMm: preset.spacerMm,
      marginTaperMm: preset.marginTaperMm,
      applied: false,
    },
    refine: {
      ...edit.refine,
      minThicknessMm: preset.minThicknessMm,
      occlusalClearanceMm: preset.occlusalClearanceMm,
      proximalClearanceMm: preset.proximalClearanceMm,
    },
  };
}

/** 크라운이면 기본 재료, 인레이·온레이면 와동 재료 숫자로 고른다. */
export function applyPresetForKind(
  edit: ToothDesignEdit,
  kind: CavityKind | null,
  presetId: InnerPresetId,
): ToothDesignEdit {
  return kind ? applyCavityPreset(edit, kind, presetId) : applyInnerPreset(edit, presetId);
}

/**
 * 치아 유형이 바뀌면 고른 재료는 두고 숫자만 그 유형 값으로 맞춘다.
 * 직접 입력·치과 프리셋은 숫자를 건드리지 않는다.
 */
export function alignPresetToKind(
  edit: ToothDesignEdit,
  kind: CavityKind | null,
): ToothDesignEdit {
  const id = edit.inner.preset;
  if (id === "custom" || id === "clinic") return edit;
  const preset = innerPresetsFor(kind).find((row) => row.id === id);
  if (!preset || preset.minThicknessMm === edit.refine.minThicknessMm) return edit;
  return applyPresetForKind(edit, kind, id);
}

/** 검출 전 기본 고리. 높이는 치아 중심 평면이다. */
export function defaultCavityMargin(
  edit: ToothDesignEdit,
  kind: CavityKind,
  count: number,
): ToothDesignEdit {
  const ratio = DEFAULT_CAVITY_MARGIN_RATIO[kind];
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: Array.from({ length: count }, () => ratio),
      depths: Array.from({ length: count }, () => 0),
      offsetMm: 0,
      deleted: false,
      cavity: null,
    },
  };
}

function wrapAngle(delta: number) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function smoothstep(u: number) {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

/**
 * 단면 높이(mm). 마진 테두리 높이가 0이다.
 * `t`는 마진 0 → 중심 1. `top`은 교합면, `bottom`은 와동 바닥에 시멘트 간격을 더한 내면.
 */
export function cavityProfileMm(
  edit: ToothDesignEdit,
  kind: CavityKind,
  depthMm: number,
  angle: number,
  t: number,
): { top: number; bottom: number } {
  const u = Math.min(1, Math.max(0, t));
  if (u <= 1e-6) return { top: 0, bottom: 0 };
  const depth = Math.max(0.3, depthMm);
  const wall = smoothstep(u / WALL_BAND);
  const gap = edit.inner.cementGapMm + edit.inner.spacerMm * 0.35;
  const bottom = -depth * wall + gap * wall;

  const cusp = kind === "onlay" ? 0.22 : 0.1;
  const crest =
    (cusp + edit.refine.cusp * 0.1 + (edit.refine.scale - 1) * 0.8) *
    depth *
    Math.sin(Math.PI * Math.min(1, u / 0.8)) ** 0.7;
  const fossa = 0.12 * depth * Math.exp(-(((1 - u) / 0.28) ** 2));
  const ridge = edit.refine.ridge * 0.06 * depth * Math.cos(2 * angle) * (1 - u);
  let top = crest - fossa + ridge;
  if (edit.refine.occlusalTrim) {
    top -= edit.refine.occlusalClearanceMm * 0.35 * smoothstep((u - 0.3) / 0.4);
  }
  const damp = 1 - edit.refine.smooth;
  const band = Math.exp(-(((u - 0.55) / 0.3) ** 2));
  for (const stamp of edit.refine.sculpt) {
    const influence = Math.exp(-(wrapAngle(angle - stamp.angle) ** 2) / (stamp.width ?? 0.09));
    top += stamp.amount * 0.6 * influence * band * damp;
  }
  if (edit.refine.compensate && u >= CAVITY_EDGE_BAND) {
    top = Math.max(top, bottom + edit.refine.minThicknessMm);
  }
  return { top, bottom };
}

const THICKNESS_ANGLES = 24;
const THICKNESS_TS = [0.3, 0.45, 0.6, 0.75, 0.9];

/** 가장자리 띠를 뺀 가장 얇은 두께(mm). */
export function cavityThicknessMm(edit: ToothDesignEdit, kind: CavityKind, depthMm: number) {
  let min = Infinity;
  for (let i = 0; i < THICKNESS_ANGLES; i += 1) {
    const angle = (i / THICKNESS_ANGLES) * Math.PI * 2;
    for (const t of THICKNESS_TS) {
      const { top, bottom } = cavityProfileMm(edit, kind, depthMm, angle, t);
      min = Math.min(min, top - bottom);
    }
  }
  return min;
}

export function cavityIsThin(edit: ToothDesignEdit, kind: CavityKind, depthMm: number) {
  return cavityThicknessMm(edit, kind, depthMm) + 1e-4 < edit.refine.minThicknessMm;
}

export type CavityTaperIssue = "undercut" | "wide";

export function cavityTaperIssue(deg: number | null | undefined): CavityTaperIssue | null {
  if (typeof deg !== "number" || !Number.isFinite(deg)) return null;
  if (deg < CAVITY_TAPER_UNDERCUT_DEG) return "undercut";
  if (deg > CAVITY_TAPER_WIDE_DEG) return "wide";
  return null;
}

export function cavityTaperSummary(info: CavityInfo | null | undefined) {
  const values = (normalizeCavityInfo(info)?.taperDeg ?? []).filter((deg) =>
    Number.isFinite(deg),
  );
  if (values.length === 0) return null;
  return {
    minDeg: Math.min(...values),
    maxDeg: Math.max(...values),
    undercut: values.filter((deg) => cavityTaperIssue(deg) === "undercut").length,
    wide: values.filter((deg) => cavityTaperIssue(deg) === "wide").length,
  };
}

export function normalizeCavityInfo(raw: unknown): CavityInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<CavityInfo>;
  const depthMm = Number(row.depthMm);
  if (!Number.isFinite(depthMm) || depthMm <= 0) return null;
  return {
    depthMm,
    taperDeg: Array.isArray(row.taperDeg)
      ? row.taperDeg.map((deg) => (typeof deg === "number" ? deg : NaN))
      : [],
    openSides: Math.max(0, Math.round(Number(row.openSides) || 0)),
  };
}