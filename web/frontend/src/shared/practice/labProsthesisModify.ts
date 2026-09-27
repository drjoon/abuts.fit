// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터·폰틱 수정값.
// 내면은 기공소 디자인 프리셋(labDesignPresets.ts) 열을 복사한 숫자다.

import { fdiToothDigits } from "@/shared/practice/toothArchOrder";
import type { ScanbodyMesh } from "@/shared/practice/scanbodyRegistration";
import {
  defaultInnerParams,
  findDesignPreset,
  INNER_KINDS,
  MATERIAL_OUTER,
  normalizeInnerParams,
  type DesignPreset,
  type DesignPresetLibrary,
  type InnerKind,
  type InnerMaterial,
  type InnerParams,
} from "@/shared/practice/labDesignPresets";

export const MARGIN_POINT_COUNT = 16;

export const MODIFY_TOOLS = [
  { id: "scanbody", label: "스캔바디" },
  { id: "margin", label: "마진" },
  { id: "insertion", label: "삽입" },
  { id: "inner", label: "내면" },
  { id: "refine", label: "형상" },
  { id: "hook", label: "훅" },
  { id: "cutback", label: "컷백" },
  { id: "hole", label: "홀" },
  { id: "connector", label: "커넥터" },
] as const;

export type ModifyTool = (typeof MODIFY_TOOLS)[number]["id"];

export type MarginEditMode = "point" | "pen";

export type EditBrush = "none" | "sculpt" | "erase" | "minus";

/** 스컬프트 브러시 모양. 오른쪽 클릭은 더하기·빼기를 뒤집는다. */
export type SculptShape = "add" | "remove" | "smooth" | "flatten" | "inflate";

export const SCULPT_SHAPES: Array<{ id: SculptShape; label: string; hint: string }> = [
  { id: "add", label: "더하기", hint: "누른 자리를 덧댑니다." },
  { id: "remove", label: "빼기", hint: "누른 자리를 깎습니다." },
  { id: "smooth", label: "매끈", hint: "형태를 완만하게 합니다." },
  { id: "flatten", label: "평탄", hint: "누른 자리의 굴곡을 폅니다." },
  { id: "inflate", label: "부풀리기", hint: "넓게 부풀립니다." },
];

export type SculptBrush = {
  shape: SculptShape;
  /** 브러시 지름(mm). */
  sizeMm: number;
  /** 0.1~1. */
  strength: number;
  /** 켜면 확대할수록 화면에서 같은 크기로 보이게 줄인다. */
  zoomSync: boolean;
};

export const DEFAULT_SCULPT_BRUSH: SculptBrush = {
  shape: "add",
  sizeMm: 1.6,
  strength: 0.5,
  zoomSync: false,
};

/** 기본 브러시(1.6mm)의 각도 분산. 예전 도장은 이 값으로 본다. */
const SCULPT_BASE_WIDTH = 0.09;

export function sculptStampWidth(sizeMm: number, zoom = 1) {
  const size = clamp(sizeMm, 0.4, 5) / Math.max(zoom, 0.2);
  return SCULPT_BASE_WIDTH * (size / DEFAULT_SCULPT_BRUSH.sizeMm) ** 2;
}

/** 디자인 시작 전 범위. 마진만이면 크라운을 만들지 않는다. 모델은 크라운에 모델 출력을 더한다. */
export type DesignScope = "margin" | "crown" | "model";

export function scopeMakesCrown(scope: DesignScope | null | undefined) {
  return scope === "crown" || scope === "model";
}

/** 모델 범위에서 내보낼 모델. */
export type ModelKind = "die" | "contact" | "bite";

export const MODEL_KINDS: Array<{ id: ModelKind; label: string; hint: string }> = [
  { id: "die", label: "다이만", hint: "지대치 주변만 잘라 냅니다." },
  { id: "contact", label: "접촉 확인 모델", hint: "지대치가 있는 악 전체를 냅니다." },
  { id: "bite", label: "교합 확인 모델", hint: "상악과 하악을 한 파일로 냅니다." },
];

export function parseModelKind(value: unknown): ModelKind {
  return value === "contact" || value === "bite" ? value : "die";
}

export type ModelSettings = {
  kind: ModelKind;
  /** 교합면에서 받침 바닥까지(mm). */
  heightMm: number;
  /** 지대치를 따로 빼는 다이. 다이만이면 항상 켠다. */
  dieSplit: boolean;
  /** 다이와 소켓 사이(mm). */
  dieGapMm: number;
};

export const MODEL_HEIGHT_RANGE_MM = { min: 12, max: 30 } as const;
export const MODEL_DIE_GAP_RANGE_MM = { min: 0, max: 0.2 } as const;

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  kind: "contact",
  heightMm: 20,
  dieSplit: true,
  dieGapMm: 0.05,
};

export function parseModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_MODEL_SETTINGS };
  const row = value as Partial<ModelSettings>;
  const height = Number(row.heightMm);
  const gap = Number(row.dieGapMm);
  return {
    kind: row.kind == null ? DEFAULT_MODEL_SETTINGS.kind : parseModelKind(row.kind),
    heightMm: Number.isFinite(height)
      ? clamp(height, MODEL_HEIGHT_RANGE_MM.min, MODEL_HEIGHT_RANGE_MM.max)
      : DEFAULT_MODEL_SETTINGS.heightMm,
    dieSplit: row.dieSplit == null ? DEFAULT_MODEL_SETTINGS.dieSplit : Boolean(row.dieSplit),
    dieGapMm: Number.isFinite(gap)
      ? clamp(gap, MODEL_DIE_GAP_RANGE_MM.min, MODEL_DIE_GAP_RANGE_MM.max)
      : DEFAULT_MODEL_SETTINGS.dieGapMm,
  };
}

/** 마진 검토. 확인 전에는 생성을 열지 않는다. */
export type MarginReview = "none" | "detected" | "confirmed";

export type ConnectorShape = "inverted" | "round" | "triangle" | "proximal";

export type CutbackRegion = "partial" | "full";

/**
 * 치아 내면. 프리셋 열의 숫자를 복사해 두고, 이후 라이브러리가 바뀌어도 케이스는 그대로다.
 * 최소 두께는 형상과 같이 쓰므로 `refine.minThicknessMm`에 둔다.
 */
export type ToothInner = Omit<InnerParams, "minThicknessMm"> & {
  /** 복사해 온 프리셋. ""=의뢰 기본 프리셋을 아직 걸지 않았다, null=직접 고쳤다. */
  presetId: string | null;
  presetName: string;
  /** 복사한 열. 치아 유형이 바뀌면 같은 프리셋의 그 유형 열로 다시 맞춘다. */
  kind: InnerKind;
  /** 삽입축 기준 언더컷을 메워 내면이 걸리지 않게 한다. */
  blockOut: boolean;
};

/** 의뢰 헤더 `치과 · 환자`의 앞부분. */
export function clinicKeyFromCasePrimary(primary: string | null | undefined): string {
  return String(primary || "")
    .split("·")[0]
    ?.trim() ?? "";
}

export function parseDesignScope(value: unknown): DesignScope | null {
  return value === "margin" || value === "crown" || value === "model" ? value : null;
}

export function parseMarginReviewMap(
  value: unknown,
  generated: Record<string, boolean>,
): Record<string, MarginReview> {
  const out: Record<string, MarginReview> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [tooth, raw] of Object.entries(value as Record<string, unknown>)) {
      if (raw === "none" || raw === "detected" || raw === "confirmed") out[tooth] = raw;
    }
  }
  for (const [tooth, flag] of Object.entries(generated)) {
    if (flag === true && out[tooth] == null) out[tooth] = "confirmed";
  }
  return out;
}

/** 치아에 걸린 내면 값을 프리셋 열 모양으로. */
export function innerParamsOf(edit: ToothDesignEdit): InnerParams {
  const { inner } = edit;
  return {
    method: inner.method,
    material: inner.material,
    toolRadiusMm: inner.toolRadiusMm,
    minThicknessMm: edit.refine.minThicknessMm,
    cementGapMm: inner.cementGapMm,
    extraGapMm: inner.extraGapMm,
    sealGapMm: inner.sealGapMm,
    sealHeightMm: inner.sealHeightMm,
    marginWidthMm: inner.marginWidthMm,
    marginAngleDeg: inner.marginAngleDeg,
  };
}

/**
 * 내면 값을 치아에 건다. 재료가 바뀌면 교합·인접 간격도 그 재료 값으로 맞춘다.
 * `source`가 없으면 직접 고친 값이다.
 */
export function applyInnerParams(
  edit: ToothDesignEdit,
  params: InnerParams,
  kind: InnerKind,
  source: Pick<DesignPreset, "id" | "name"> | null,
  blockOut = edit.inner.blockOut,
): ToothDesignEdit {
  const { minThicknessMm, ...inner } = params;
  const outer =
    source || params.material !== edit.inner.material ? MATERIAL_OUTER[params.material] : null;
  return {
    ...edit,
    inner: {
      ...inner,
      presetId: source?.id ?? null,
      presetName: source?.name ?? "",
      kind,
      blockOut,
    },
    refine: { ...edit.refine, minThicknessMm, ...(outer ?? {}) },
  };
}

export function applyDesignPreset(
  edit: ToothDesignEdit,
  preset: DesignPreset,
  kind: InnerKind,
): ToothDesignEdit {
  return applyInnerParams(edit, preset[kind], kind, preset);
}

/**
 * 의뢰 기본 프리셋을 아직 안 걸었으면 걸고, 치아 유형이 바뀌었으면 같은 프리셋의 그 열로 맞춘다.
 * 직접 고친 치아와 목록에서 지워진 프리셋은 숫자를 그대로 둔다.
 */
export function alignPresetToKind(
  edit: ToothDesignEdit,
  kind: InnerKind,
  library: DesignPresetLibrary,
  caseDefaultId: string,
): ToothDesignEdit {
  const { presetId } = edit.inner;
  if (presetId === null) return edit;
  if (presetId !== "" && edit.inner.kind === kind) return edit;
  const preset = findDesignPreset(library, presetId || caseDefaultId);
  if (!preset) return edit;
  return applyDesignPreset(edit, preset, kind);
}

/** 내면 전체 간격(mm). 마진 실 띠 위에서 쓴다. */
export function innerGapMm(inner: ToothInner) {
  return inner.cementGapMm + inner.extraGapMm * 0.5;
}

export const CONNECTOR_SHAPES: Array<{ id: ConnectorShape; label: string }> = [
  { id: "inverted", label: "역삼각" },
  { id: "round", label: "원형" },
  { id: "triangle", label: "삼각" },
  { id: "proximal", label: "인접 병합" },
];

export type PonticBase = "ridgeLap" | "modifiedRidgeLap" | "ovate" | "sanitary" | "conical";

export const PONTIC_BASES: Array<{ id: PonticBase; label: string; hint: string }> = [
  { id: "modifiedRidgeLap", label: "변형 안장형", hint: "협측만 치조정에 닿습니다." },
  { id: "ridgeLap", label: "안장형", hint: "치조정을 넓게 덮습니다." },
  { id: "ovate", label: "난형", hint: "발치와에 볼록하게 들어갑니다." },
  { id: "conical", label: "원추형", hint: "치조정에 점으로 닿습니다." },
  { id: "sanitary", label: "위생형", hint: "치조정에서 띄워 청소가 쉽습니다." },
];

/**
 * 가로·세로 1로 정규화한 단면 윤곽(x=협설, y=교합). 면적·3D 메시·단면 보기가 같이 쓴다.
 * 원형은 타원, 삼각은 꼭짓점이 교합, 역삼각은 치은, 인접 병합은 모서리를 깎은 사각.
 */
export function connectorOutline(shape: ConnectorShape): Array<[number, number]> {
  if (shape === "triangle") return [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]];
  if (shape === "inverted") return [[-0.5, 0.5], [0, -0.5], [0.5, 0.5]];
  if (shape === "proximal") {
    const c = 0.5;
    const k = 0.16;
    return [
      [-c + k, -c], [c - k, -c], [c, -c + k], [c, c - k],
      [c - k, c], [-c + k, c], [-c, c - k], [-c, -c + k],
    ];
  }
  return Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5] as [number, number];
  });
}

function outlineArea(points: ReadonlyArray<[number, number]>) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index]!;
    const [x2, y2] = points[(index + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** 커넥터 단면 모양별 면적 계수. 가로×세로에 곱한다. */
const CONNECTOR_AREA_FACTOR: Record<ConnectorShape, number> = {
  round: Math.PI / 4,
  inverted: outlineArea(connectorOutline("inverted")),
  triangle: outlineArea(connectorOutline("triangle")),
  proximal: outlineArea(connectorOutline("proximal")),
};

/** 재료별 커넥터 최소 단면적(mm²). 전치부·구치부. */
const CONNECTOR_MIN_AREA: Record<InnerMaterial, { anterior: number; posterior: number }> = {
  zirconia: { anterior: 7, posterior: 9 },
  glass: { anterior: 12, posterior: 16 },
  pmma: { anterior: 10, posterior: 12 },
  resin: { anterior: 10, posterior: 12 },
};

/** 단면 이동 한계(mm). 치아 밖으로 빠지지 않게 한다. */
export const CONNECTOR_SHIFT_LIMIT_MM = 2.5;

export function clampConnectorShift(value: number) {
  return Math.min(CONNECTOR_SHIFT_LIMIT_MM, Math.max(-CONNECTOR_SHIFT_LIMIT_MM, value));
}

export function connectorAreaMm2(connector: ToothDesignEdit["connector"]) {
  return connector.transverseMm * connector.verticalMm * CONNECTOR_AREA_FACTOR[connector.shape];
}

/** 전치부(1~3번)가 하나라도 있으면 전치부 기준. */
export function connectorMinAreaMm2(
  material: InnerMaterial,
  toothNumbers: readonly string[],
) {
  const row = CONNECTOR_MIN_AREA[material] ?? CONNECTOR_MIN_AREA.zirconia;
  const anterior = toothNumbers.some((tooth) => /^[1-4][1-3]$/.test(fdiToothDigits(tooth)));
  return anterior ? row.anterior : row.posterior;
}

export function connectorIsWeak(
  edit: ToothDesignEdit,
  toothNumbers: readonly string[],
) {
  if (!edit.connector.linked) return false;
  return (
    connectorAreaMm2(edit.connector) + 1e-4 <
    connectorMinAreaMm2(edit.inner.material, toothNumbers)
  );
}

export type ToothDesignEdit = {
  /** 브리지 폰틱. 마진 없이 기저면으로 치조정에 얹는다. */
  pontic: {
    on: boolean;
    base: PonticBase;
  };
  margin: {
    radii: number[];
    /** 삽입축 방향 오프셋. 기하 단위. 0이면 치아 중심 평면. */
    depths: number[];
    offsetMm: number;
    showBack: boolean;
    deleted: boolean;
    /** 인레이·온레이 와동 검출값. 크라운이거나 검출 전이면 없다. */
    cavity?: {
      depthMm: number;
      /** 마진 점마다 와동 벽 발산각(°). 못 잰 자리는 NaN(저장하면 null). */
      taperDeg: number[];
      openSides: number;
    } | null;
  };
  inner: ToothInner;
  refine: {
    scale: number;
    cusp: number;
    ridge: number;
    occlusalClearanceMm: number;
    occlusalTrim: boolean;
    proximalClearanceMm: number;
    proximalTrim: boolean;
    smooth: number;
    minThicknessMm: number;
    compensate: boolean;
    /** width는 각도 분산. 없으면 기본 브러시. */
    sculpt: Array<{ angle: number; amount: number; width?: number }>;
  };
  /** 임플란트 크라운. 마진 대신 EPL, 지대치 대신 스캔바디를 쓴다. */
  implant: {
    on: boolean;
    /** `implantLibraryId`. 고르기 전이면 null. */
    libraryId: string | null;
    /** 라이브러리를 스캔바디에 맞춘 결과. 월드 좌표, 치아 추정 중심 기준. */
    aligned: boolean;
    axis: [number, number, number] | null;
    offset: [number, number, number];
    rotDeg: number;
    /** 맞춘 뒤 평균 거리(mm). */
    fitMm: number | null;
    /** 맞춘 스캔바디·심플어벗 템플릿 형상(S3 키). 원기둥으로 맞췄으면 null. */
    scanbodyKey: string | null;
    screwHole: boolean;
  };
  hook: {
    on: boolean;
    angle: number;
    radiusMm: number;
    lengthMm: number;
  };
  cutback: {
    on: boolean;
    region: CutbackRegion;
    thicknessMm: number;
    excluded: number[];
  };
  hole: {
    on: boolean;
    angle: number;
    tiltDeg: number;
    radiusMm: number;
  };
  connector: {
    shape: ConnectorShape;
    transverseMm: number;
    verticalMm: number;
    along: number;
    /** 단면 안에서 옮긴 거리(mm). x=협설, y=교합(+)·치은(−). */
    shiftXMm: number;
    shiftYMm: number;
    /** 이 치아와 다음 치아 사이 커넥터. 끄면 두 치아를 잇지 않는다. */
    linked: boolean;
    assembled: boolean;
  };
};

/** 치아 프레임의 마진 표본. radius는 기본 고리 비율, depth는 삽입축 방향 기하 단위. */
export type MarginSample = { angle: number; radius: number; depth: number };

export type DesignGesture =
  | { type: "margin"; tooth: string; index: number; radius: number; depth?: number }
  | { type: "margin-stroke"; tooth: string; samples: MarginSample[] }
  | { type: "margin-trace"; tooth: string; samples: MarginSample[] }
  | { type: "margin-insert"; tooth: string; index: number; radius: number; depth?: number }
  | { type: "margin-remove"; tooth: string; index: number }
  | { type: "hook-angle"; tooth: string; angle: number }
  | { type: "hook-off"; tooth: string }
  | { type: "hole-angle"; tooth: string; angle: number }
  | { type: "hole-tilt"; tooth: string; tilt: number }
  | { type: "hole-reject"; tooth: string }
  | { type: "sculpt"; tooth: string; angle: number; amount: number; width?: number }
  | { type: "smooth"; tooth: string }
  | { type: "flatten"; tooth: string; angle: number; width: number; strength: number }
  | {
      type: "scanbody-fit";
      tooth: string;
      axis: [number, number, number];
      offset: [number, number, number];
      fitMm: number | null;
      /** 실제 형상으로 맞추면 헥스 방향까지 나온다. */
      rotDeg?: number;
      scanbodyKey?: string | null;
    }
  | { type: "cutback-exclude"; tooth: string; angle: number }
  | { type: "transform"; tooth: string; scale: number }
  | { type: "connector"; tooth: string; along: number };

export type ProsthesisDesignEdit = {
  tool: ModifyTool;
  marginMode: MarginEditMode;
  brush: EditBrush;
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  activeTooth: string | null;
  bridges: Array<{ from: string; to: string }>;
  prepBackTransparent: boolean;
  /** 마진 선. 끄면 점과 고리를 그리지 않는다. */
  showMargin: boolean;
  sculptBrush: SculptBrush;
  /** 임플란트 치아별 스캔바디 라이브러리 치수(mm). */
  scanbodies: Record<string, ScanbodyShape>;
  /** 스크류홀을 켠 임플란트의 스크류 경로. */
  showScrewPath: boolean;
  /** 인레이·온레이 치아. 없는 치아는 크라운으로 그린다. */
  cavityKinds?: Record<string, "inlay" | "onlay">;
};

export type ScanbodyShape = {
  radiusMm: number;
  /** 플랫폼에서 윗면까지. 원기둥은 윗면에서 이만큼 내려 그린다. */
  heightMm: number;
  /** 라이브러리·템플릿 실제 형상(mm, 플랫폼 원점·+Y 축). 없으면 원기둥. */
  mesh?: ScanbodyMesh | null;
  /** 심플어벗 템플릿이면 플랫폼에서 마진까지(mm). */
  marginHeightMm?: number | null;
};

function ones(count: number) {
  return Array.from({ length: count }, () => 1);
}

function withoutMinThickness(params: InnerParams): Omit<InnerParams, "minThicknessMm"> {
  const out: Partial<InnerParams> = { ...params };
  delete out.minThicknessMm;
  return out as Omit<InnerParams, "minThicknessMm">;
}

function defaultToothInner(): ToothInner {
  return {
    ...withoutMinThickness(defaultInnerParams("crown")),
    presetId: "",
    presetName: "",
    kind: "crown",
    blockOut: true,
  };
}

/** 예전 초안은 재료 id·스페이서였다. 숫자는 두고 직접 고친 값으로 본다. */
function normalizeToothInner(raw: unknown, minThicknessMm: number): ToothInner {
  const base = defaultToothInner();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  if (typeof row.preset === "string" && !("presetId" in row)) {
    const print = row.preset === "print";
    const material: InnerMaterial =
      print ? "resin" : row.preset === "glass" || row.preset === "pmma" ? row.preset : "zirconia";
    const cement = Number(row.cementGapMm);
    const spacer = Number(row.spacerMm);
    return {
      ...base,
      method: print ? "print" : "milling",
      material,
      toolRadiusMm: print ? 0 : base.toolRadiusMm,
      cementGapMm: Number.isFinite(cement) ? cement : base.cementGapMm,
      extraGapMm: Number.isFinite(spacer) ? spacer : base.extraGapMm,
      presetId: null,
    };
  }
  const params = withoutMinThickness(
    normalizeInnerParams({ ...row, minThicknessMm }, { ...base, minThicknessMm }),
  );
  const presetId =
    row.presetId === null ? null : typeof row.presetId === "string" ? row.presetId : "";
  return {
    ...params,
    presetId,
    presetName: typeof row.presetName === "string" ? row.presetName : "",
    kind: INNER_KINDS.some((item) => item.id === row.kind) ? (row.kind as InnerKind) : "crown",
    blockOut: row.blockOut !== false,
  };
}

export function createToothDesignEdit(): ToothDesignEdit {
  const preset = { ...defaultInnerParams("crown"), ...MATERIAL_OUTER.zirconia };
  return {
    pontic: { on: false, base: "modifiedRidgeLap" },
    margin: {
      radii: ones(MARGIN_POINT_COUNT),
      depths: Array.from({ length: MARGIN_POINT_COUNT }, () => 0),
      offsetMm: 0,
      showBack: false,
      deleted: false,
    },
    inner: defaultToothInner(),
    refine: {
      scale: 1,
      cusp: 0,
      ridge: 0,
      occlusalClearanceMm: preset.occlusalClearanceMm,
      occlusalTrim: false,
      proximalClearanceMm: preset.proximalClearanceMm,
      proximalTrim: false,
      smooth: 0,
      minThicknessMm: preset.minThicknessMm,
      compensate: false,
      sculpt: [],
    },
    implant: {
      on: false,
      libraryId: null,
      aligned: false,
      axis: null,
      offset: [0, 0, 0],
      rotDeg: 0,
      fitMm: null,
      scanbodyKey: null,
      screwHole: false,
    },
    hook: { on: false, angle: 40, radiusMm: 0.45, lengthMm: 2.4 },
    cutback: { on: false, region: "partial", thicknessMm: 0.4, excluded: [] },
    hole: { on: false, angle: 0, tiltDeg: 8, radiusMm: 1 },
    connector: {
      shape: "round",
      transverseMm: 4,
      verticalMm: 3.2,
      along: 0.5,
      shiftXMm: 0,
      shiftYMm: 0,
      linked: true,
      assembled: false,
    },
  };
}

/** 예전 초안에 없는 항목은 기본값으로 채운다. */
export function normalizeToothDesignEdit(raw: unknown): ToothDesignEdit {
  const base = createToothDesignEdit();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<ToothDesignEdit>;
  const pontic = (row.pontic ?? {}) as Partial<ToothDesignEdit["pontic"]>;
  const connector = (row.connector ?? {}) as Partial<ToothDesignEdit["connector"]>;
  const implant = (row.implant ?? {}) as Partial<ToothDesignEdit["implant"]>;
  const refine = { ...base.refine, ...(row.refine ?? {}) };
  return {
    ...base,
    ...row,
    implant: {
      on: implant.on === true,
      libraryId: typeof implant.libraryId === "string" && implant.libraryId ? implant.libraryId : null,
      aligned: implant.aligned === true,
      axis: vec3OrNull(implant.axis),
      offset: vec3OrNull(implant.offset) ?? [0, 0, 0],
      rotDeg: Number(implant.rotDeg) || 0,
      fitMm: Number.isFinite(Number(implant.fitMm)) && implant.fitMm != null ? Number(implant.fitMm) : null,
      scanbodyKey:
        typeof implant.scanbodyKey === "string" && implant.scanbodyKey ? implant.scanbodyKey : null,
      screwHole: implant.screwHole === true,
    },
    pontic: {
      on: pontic.on === true,
      base: PONTIC_BASES.some((item) => item.id === pontic.base)
        ? (pontic.base as PonticBase)
        : base.pontic.base,
    },
    margin: { ...base.margin, ...(row.margin ?? {}) },
    inner: normalizeToothInner(row.inner, refine.minThicknessMm),
    refine,
    hook: { ...base.hook, ...(row.hook ?? {}) },
    cutback: { ...base.cutback, ...(row.cutback ?? {}) },
    hole: { ...base.hole, ...(row.hole ?? {}) },
    connector: {
      ...base.connector,
      ...connector,
      shiftXMm: Number(connector.shiftXMm) || 0,
      shiftYMm: Number(connector.shiftYMm) || 0,
      linked: connector.linked !== false,
    },
  };
}

function vec3OrNull(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const out = [Number(value[0]), Number(value[1]), Number(value[2])] as [number, number, number];
  return out.every((n) => Number.isFinite(n)) ? out : null;
}

export function normalizeToothDesignEdits(raw: unknown): Record<string, ToothDesignEdit> {
  const out: Record<string, ToothDesignEdit> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [tooth, edit] of Object.entries(raw as Record<string, unknown>)) {
    out[tooth] = normalizeToothDesignEdit(edit);
  }
  return out;
}

export function marginUntouched(edit: ToothDesignEdit) {
  return (
    !edit.margin.deleted &&
    edit.margin.offsetMm === 0 &&
    edit.margin.radii.every((radius) => radius === 1) &&
    (edit.margin.depths ?? []).every((depth) => depth === 0)
  );
}

export function redetectMargin(edit: ToothDesignEdit): ToothDesignEdit {
  const radii = Array.from({ length: MARGIN_POINT_COUNT }, (_, index) => {
    return 0.9 + 0.08 * Math.sin(index * 1.65) + 0.03 * Math.cos(index * 0.7);
  });
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii,
      depths: Array.from({ length: radii.length }, () => 0),
      offsetMm: 0,
      deleted: false,
      cavity: null,
    },
  };
}

/** 마진 일괄 수축 / 확장 (mm 단위) */
export function adjustMarginOffset(
  edit: ToothDesignEdit,
  deltaMm: number,
): ToothDesignEdit {
  const currentOffset = edit.margin.offsetMm;
  const nextOffset = clamp(
    Math.round((currentOffset + deltaMm) * 100) / 100,
    -0.4,
    0.6,
  );
  return {
    ...edit,
    margin: {
      ...edit.margin,
      offsetMm: nextOffset,
      deleted: false,
    },
  };
}

/** 색 경계로 잡은 마진. 간격 오프셋은 다시 0이다. */
export function applyDetectedMargin(
  edit: ToothDesignEdit,
  radii: number[],
  depths: number[],
): ToothDesignEdit {
  const count = Math.min(radii.length, depths.length);
  if (count < 8) return edit;
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: radii.slice(0, count),
      depths: depths.slice(0, count),
      offsetMm: 0,
      deleted: false,
      cavity: null,
    },
  };
}

export function applyMarginRadius(
  edit: ToothDesignEdit,
  index: number,
  radius: number,
  pen: boolean,
  depth?: number,
): ToothDesignEdit {
  const radii = edit.margin.radii.slice();
  const count = radii.length || MARGIN_POINT_COUNT;
  while (radii.length < count) radii.push(1);
  let depths = edit.margin.depths;
  if (depth != null && Number.isFinite(depth)) {
    depths = (edit.margin.depths ?? []).slice();
    while (depths.length < count) depths.push(0);
    depths[((index % count) + count) % count] = depth;
  }
  const next = clamp(radius, MARGIN_RATIO_MIN, 2.85);
  const paint = (slot: number, weight: number) => {
    const key = ((slot % count) + count) % count;
    const current = radii[key] ?? 1;
    radii[key] = current * (1 - weight) + next * weight;
  };
  paint(index, 1);
  if (pen) {
    paint(index - 1, 0.55);
    paint(index + 1, 0.55);
    paint(index - 2, 0.22);
    paint(index + 2, 0.22);
  }
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, deleted: false },
  };
}

const TAU = Math.PI * 2;

function wrapTurn(angle: number) {
  return ((angle % TAU) + TAU) % TAU;
}

/** 각도를 앞 점에 이어 풀어 쓴다. 한 바퀴를 넘으면 누적된다. */
function unwrapSamples(samples: readonly MarginSample[]): MarginSample[] {
  const out: MarginSample[] = [];
  for (const sample of samples) {
    if (![sample.angle, sample.radius, sample.depth].every(Number.isFinite)) continue;
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...sample });
      continue;
    }
    let delta = sample.angle - wrapTurn(prev.angle);
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    out.push({ ...sample, angle: prev.angle + delta });
  }
  return out;
}

/** 풀어 쓴 각도 곡선에서 target(풀어 쓴 값)을 처음 지나는 자리를 보간한다. */
function sampleAtAngle(path: readonly MarginSample[], target: number) {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const lo = Math.min(a.angle, b.angle);
    const hi = Math.max(a.angle, b.angle);
    if (target < lo - 1e-9 || target > hi + 1e-9) continue;
    const span = b.angle - a.angle;
    const t = Math.abs(span) < 1e-9 ? 0 : (target - a.angle) / span;
    return {
      radius: a.radius + (b.radius - a.radius) * t,
      depth: a.depth + (b.depth - a.depth) * t,
    };
  }
  return null;
}

/**
 * 시작점에서 찍어 시작점으로 닫은 마진. 치아 중심을 한 바퀴 돌아야 한다.
 * 못 닫으면 null.
 */
export function applyMarginTrace(
  edit: ToothDesignEdit,
  samples: readonly MarginSample[],
  count = 24,
): ToothDesignEdit | null {
  const path = unwrapSamples(samples);
  if (path.length < 3) return null;
  const first = path[0]!;
  const last = path[path.length - 1]!;
  let closing = wrapTurn(first.angle) - wrapTurn(last.angle);
  while (closing > Math.PI) closing -= TAU;
  while (closing < -Math.PI) closing += TAU;
  path.push({ ...first, angle: last.angle + closing });
  const turn = path[path.length - 1]!.angle - first.angle;
  if (Math.abs(Math.abs(turn) - TAU) > 0.5) return null;
  const forward = turn > 0 ? path : path.slice().reverse();
  const start = forward[0]!.angle;
  const radii: number[] = [];
  const depths: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = start + wrapTurn(marginPointAngle(index, count) - start);
    const hit = sampleAtAngle(forward, target);
    if (!hit) return null;
    radii.push(clamp(hit.radius, MARGIN_RATIO_MIN, 2.85));
    depths.push(hit.depth);
  }
  const cavity = edit.margin.cavity
    ? { ...edit.margin.cavity, taperDeg: Array.from({ length: count }, () => NaN) }
    : edit.margin.cavity;
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, cavity, deleted: false },
  };
}

/** 펜으로 그은 구간만 새 선으로 바꾼다. 거의 한 바퀴면 새로 닫은 마진으로 본다. */
export function applyMarginStroke(
  edit: ToothDesignEdit,
  samples: readonly MarginSample[],
): ToothDesignEdit {
  const path = unwrapSamples(samples);
  if (path.length < 2) return edit;
  const count = edit.margin.radii.length || MARGIN_POINT_COUNT;
  const span = path[path.length - 1]!.angle - path[0]!.angle;
  if (Math.abs(span) >= TAU * 0.92) {
    return applyMarginTrace(edit, path, Math.max(count, 24)) ?? edit;
  }
  const step = TAU / count;
  if (Math.abs(span) < step * 0.5) return edit;
  const radii = edit.margin.radii.slice();
  const depths = (edit.margin.depths ?? []).slice();
  while (radii.length < count) radii.push(1);
  while (depths.length < count) depths.push(0);
  const lo = Math.min(path[0]!.angle, path[path.length - 1]!.angle);
  const hi = Math.max(path[0]!.angle, path[path.length - 1]!.angle);
  const taper = edit.margin.cavity?.taperDeg.slice() ?? null;
  const touched: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = lo + wrapTurn(marginPointAngle(index, count) - lo);
    if (target > hi) continue;
    const hit = sampleAtAngle(path, target);
    if (!hit) continue;
    radii[index] = clamp(hit.radius, MARGIN_RATIO_MIN, 2.85);
    depths[index] = hit.depth;
    if (taper) taper[index] = NaN;
    touched.push(index);
  }
  if (touched.length === 0) return edit;
  const inside = new Set(touched);
  for (const index of touched) {
    for (const side of [-1, 1]) {
      const slot = (index + side + count) % count;
      if (inside.has(slot)) continue;
      const far = (slot + side + count) % count;
      radii[slot] = (radii[slot]! + (radii[index]! + radii[far]!) / 2) / 2;
      depths[slot] = (depths[slot]! + (depths[index]! + depths[far]!) / 2) / 2;
    }
  }
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii,
      depths,
      cavity: taper && edit.margin.cavity ? { ...edit.margin.cavity, taperDeg: taper } : edit.margin.cavity,
      deleted: false,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 인레이 와동은 기본 원 안쪽 깊이 들어온다. */
const MARGIN_RATIO_MIN = 0.15;

/** 마진 점을 넣고 빼면 점마다 잰 와동 벽 각도도 같이 옮긴다. */
function spliceCavityTaper(
  cavity: ToothDesignEdit["margin"]["cavity"],
  edit: (taper: number[]) => number[],
): ToothDesignEdit["margin"]["cavity"] {
  if (!cavity) return cavity;
  return { ...cavity, taperDeg: edit(cavity.taperDeg.slice()) };
}

export function removeMarginPoint(edit: ToothDesignEdit, index: number): ToothDesignEdit {
  if (edit.margin.radii.length <= 8) return edit;
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: edit.margin.radii.filter((_, slot) => slot !== index),
      depths: (edit.margin.depths ?? []).filter((_, slot) => slot !== index),
      cavity: spliceCavityTaper(edit.margin.cavity, (taper) =>
        taper.filter((_, slot) => slot !== index),
      ),
    },
  };
}

export function insertMarginPoint(
  edit: ToothDesignEdit,
  index: number,
  radius: number,
  depth?: number,
): ToothDesignEdit {
  if (edit.margin.radii.length >= 32) return edit;
  const radii = edit.margin.radii.slice();
  const depths = (edit.margin.depths ?? []).slice();
  while (depths.length < radii.length) depths.push(0);
  const at = Math.min(radii.length, Math.max(0, index));
  radii.splice(at, 0, clamp(radius, MARGIN_RATIO_MIN, 2.85));
  const before = depths[at - 1] ?? depths[at] ?? 0;
  const after = depths[at] ?? before;
  depths.splice(at, 0, depth != null && Number.isFinite(depth) ? depth : (before + after) / 2);
  const cavity = spliceCavityTaper(edit.margin.cavity, (taper) => {
    taper.splice(at, 0, NaN);
    return taper;
  });
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, cavity, deleted: false },
  };
}

/** 외면 껍질 두께(mm). 보상은 최소 두께까지 올린다. */
export function shellThicknessMm(edit: ToothDesignEdit) {
  const dent = edit.refine.sculpt.reduce(
    (max, stamp) => Math.max(max, -stamp.amount),
    0,
  );
  let shell =
    0.55 * edit.refine.scale -
    dent * 0.25 -
    (edit.refine.occlusalTrim ? edit.refine.occlusalClearanceMm * 0.35 : 0) -
    innerGapMm(edit.inner) * 0.35;
  if (edit.cutback.on) shell -= edit.cutback.thicknessMm * 0.45;
  if (edit.refine.compensate) shell = Math.max(shell, edit.refine.minThicknessMm);
  return shell;
}

export function shellIsThin(edit: ToothDesignEdit) {
  return shellThicknessMm(edit) + 1e-4 < edit.refine.minThicknessMm;
}

function wrapAngle(delta: number) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

/** 마진 실 높이를 교합 0~1로 옮길 때 보는 크라운 높이. */
const CROWN_HEIGHT_MM = 7;

/** 교합 0~1. 스컬프트·컷백·교합 절삭이 있는 자리만 더 얇다. 마진 실 띠는 마진 실 갭을 쓴다. */
export function localShellThicknessMm(
  edit: ToothDesignEdit,
  angle: number,
  occlusal01: number,
) {
  const damp = 1 - edit.refine.smooth;
  let dent = 0;
  for (const stamp of edit.refine.sculpt) {
    const influence = Math.exp(
      -(wrapAngle(angle - stamp.angle) ** 2) / (stamp.width ?? SCULPT_BASE_WIDTH),
    );
    if (stamp.amount < 0) dent += -stamp.amount * influence;
  }
  dent *= damp;
  const gap =
    occlusal01 < edit.inner.sealHeightMm / CROWN_HEIGHT_MM
      ? edit.inner.sealGapMm
      : innerGapMm(edit.inner);
  let shell = 0.55 * edit.refine.scale - dent * 0.25 - gap * 0.35;
  if (edit.refine.occlusalTrim) {
    const band = Math.min(1, Math.max(0, (occlusal01 - 0.55) / 0.45));
    shell -= edit.refine.occlusalClearanceMm * 0.35 * band;
  }
  if (edit.cutback.on) {
    const inRegion = edit.cutback.region === "full" || occlusal01 > 0.62;
    const excluded = edit.cutback.excluded.some(
      (slot) => Math.abs(wrapAngle(angle - slot)) < 0.42,
    );
    if (inRegion && !excluded) shell -= edit.cutback.thicknessMm * 0.45;
  }
  if (edit.refine.compensate) shell = Math.max(shell, edit.refine.minThicknessMm);
  return shell;
}

/** 최소보다 얇을수록 빨강, 최소에 가까우면 초록. 충족이면 null. */
export function thicknessAlertRgb(
  edit: ToothDesignEdit,
  thicknessMm: number,
): [number, number, number] | null {
  const deficit = edit.refine.minThicknessMm - thicknessMm;
  if (deficit <= 1e-4) return null;
  const u = Math.min(1, deficit / 0.2);
  const mild: [number, number, number] = [0.2, 0.72, 0.32];
  const severe: [number, number, number] = [0.86, 0.2, 0.18];
  return [
    mild[0] * (1 - u) + severe[0] * u,
    mild[1] * (1 - u) + severe[1] * u,
    mild[2] * (1 - u) + severe[2] * u,
  ];
}

export function holeIssue(hole: ToothDesignEdit["hole"]): string | null {
  if (!hole.on) return null;
  if (hole.radiusMm > 2.2) {
    return "홀이 교합면보다 큽니다. 반지름을 줄이세요.";
  }
  if (Math.abs(hole.tiltDeg) > 42) {
    return "이 기울기는 교합면을 벗어납니다. 다른 각도를 고르세요.";
  }
  return null;
}

export function crownScale(edit: ToothDesignEdit) {
  let scale = clamp(edit.refine.scale, 0.75, 1.35);
  if (
    edit.refine.compensate &&
    0.55 * scale < edit.refine.minThicknessMm
  ) {
    scale = clamp(edit.refine.minThicknessMm / 0.55, 0.75, 1.35);
  }
  return scale;
}

export function reduceDesignGesture(
  edit: ToothDesignEdit,
  gesture: DesignGesture,
  pen: boolean,
): ToothDesignEdit {
  switch (gesture.type) {
    case "margin":
      return applyMarginRadius(edit, gesture.index, gesture.radius, pen, gesture.depth);
    case "margin-stroke":
      return applyMarginStroke(edit, gesture.samples);
    case "margin-trace":
      return applyMarginTrace(edit, gesture.samples) ?? edit;
    case "margin-insert":
      return insertMarginPoint(edit, gesture.index, gesture.radius, gesture.depth);
    case "margin-remove":
      return removeMarginPoint(edit, gesture.index);
    case "hook-angle":
      return {
        ...edit,
        hook: { ...edit.hook, on: true, angle: gesture.angle },
      };
    case "hook-off":
      return { ...edit, hook: { ...edit.hook, on: false } };
    case "hole-angle":
      return { ...edit, hole: { ...edit.hole, on: true, angle: gesture.angle } };
    case "hole-tilt":
      return {
        ...edit,
        hole: {
          ...edit.hole,
          on: true,
          tiltDeg: clamp(gesture.tilt, -50, 50),
        },
      };
    case "sculpt": {
      const stamp =
        gesture.width != null
          ? { angle: gesture.angle, amount: gesture.amount, width: gesture.width }
          : { angle: gesture.angle, amount: gesture.amount };
      const sculpt = [...edit.refine.sculpt, stamp].slice(-24);
      return { ...edit, refine: { ...edit.refine, sculpt } };
    }
    case "flatten": {
      const keep = 1 - clamp(gesture.strength, 0.1, 1) * 0.8;
      return {
        ...edit,
        refine: {
          ...edit.refine,
          sculpt: edit.refine.sculpt.map((stamp) => {
            const near = Math.exp(
              -(wrapAngle(stamp.angle - gesture.angle) ** 2) / Math.max(gesture.width, 1e-3),
            );
            return { ...stamp, amount: stamp.amount * (1 - near * (1 - keep)) };
          }),
        },
      };
    }
    case "scanbody-fit":
      return {
        ...edit,
        implant: {
          ...edit.implant,
          aligned: true,
          axis: gesture.axis,
          offset: gesture.offset,
          fitMm: gesture.fitMm,
          rotDeg: gesture.rotDeg ?? edit.implant.rotDeg,
          scanbodyKey: gesture.scanbodyKey ?? null,
        },
      };
    case "smooth":
      return {
        ...edit,
        refine: {
          ...edit.refine,
          smooth: Math.min(1, edit.refine.smooth + 0.18),
          sculpt: edit.refine.sculpt.map((stamp) => ({
            ...stamp,
            amount: stamp.amount * 0.45,
          })),
        },
      };
    case "cutback-exclude":
      return {
        ...edit,
        cutback: {
          ...edit.cutback,
          on: true,
          excluded: [...edit.cutback.excluded, gesture.angle].slice(-10),
        },
      };
    case "transform":
      return {
        ...edit,
        refine: {
          ...edit.refine,
          scale: clamp(gesture.scale, 0.75, 1.35),
        },
      };
    case "connector":
      return {
        ...edit,
        connector: {
          ...edit.connector,
          along: clamp(gesture.along, 0.28, 0.72),
        },
      };
    default:
      return edit;
  }
}

export function marginPointAngle(index: number, count = MARGIN_POINT_COUNT) {
  return (index / count) * Math.PI * 2;
}
