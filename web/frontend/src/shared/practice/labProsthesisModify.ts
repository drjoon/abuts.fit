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

/** 스크류홀 반지름(mm). Dentbird와 같은 범위·기본값. */
export const HOLE_RADIUS_MIN_MM = 0.5;
export const HOLE_RADIUS_MAX_MM = 2.5;
export const HOLE_RADIUS_DEFAULT_MM = 1.25;

/** 시적 때 잡는 훅(mm). Dentbird와 같은 기본값. */
export const HOOK_RADIUS_RANGE_MM = { min: 0.3, max: 1.5 } as const;
export const HOOK_LENGTH_RANGE_MM = { min: 0.5, max: 4 } as const;
export const HOOK_RADIUS_DEFAULT_MM = 0.8;
export const HOOK_LENGTH_DEFAULT_MM = 1.8;
export const HOOK_MAX_COUNT = 6;

export const MODIFY_TOOLS = [
  { id: "scanbody", label: "스캔바디" },
  { id: "margin", label: "마진" },
  { id: "insertion", label: "삽입축" },
  { id: "inner", label: "내면" },
  { id: "refine", label: "형상" },
  { id: "hook", label: "훅" },
  { id: "cutback", label: "컷백" },
  { id: "hole", label: "홀" },
  { id: "connector", label: "커넥터" },
] as const;

export type ModifyTool = (typeof MODIFY_TOOLS)[number]["id"];

/** 형상 도구 안의 단계. 변형 핸들은 변형, 스컬프트는 외면에서만 쓴다. */
export type RefineTab = "transform" | "outer" | "adapt";

export const REFINE_TABS: Array<{ id: RefineTab; label: string }> = [
  { id: "transform", label: "변형" },
  { id: "outer", label: "외면" },
  { id: "adapt", label: "맞춤" },
];

export type MarginEditMode = "point" | "pen";

/** plus·minus는 컷백 선택 브러시. */
export type EditBrush = "none" | "sculpt" | "erase" | "plus" | "minus";

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

/**
 * 예전 화면의 범위. 지금은 고르지 않는다.
 * 스캔·마진·디자인·모델·밀링 단계가 어디까지 할지를 정하고, 크라운은 마진 확인 뒤에 만든다.
 */
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

/** 컷백 선택 시작점. 부분은 절단연·순면 쪽, 전체는 마진 띠를 뺀 외면. */
export type CutbackPreset = "none" | "partial" | "full";

/**
 * 컷백 선택을 쌓는 순서. 점은 크라운 메시 로컬(훅과 같은 공간)이라
 * 크라운을 옮기고 늘려도 같은 자리에 붙어 있다. 반전은 그때까지 쌓은 선택을 뒤집는다.
 */
export type CutbackOp =
  | { kind: "add" | "remove"; point: [number, number, number]; radiusMm: number }
  | { kind: "invert" };

export const CUTBACK_DEPTH_RANGE_MM = { min: 0.1, max: 2 } as const;
export const CUTBACK_DEPTH_DEFAULT_MM = 0.5;
export const CUTBACK_BRUSH_RANGE_MM = { min: 1, max: 8 } as const;
export const CUTBACK_BRUSH_DEFAULT_MM = 3;
const CUTBACK_OP_MAX = 400;

export function cutbackHasSelection(cutback: ToothDesignEdit["cutback"]) {
  return cutback.preset !== "none" || cutback.ops.some((op) => op.kind !== "remove");
}

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
  /**
   * 내면을 지대치 스캔에서 실제 메시로 만든다. 끄면 예전처럼 외면만 그린다.
   * 켜도 지대치 스캔·마진이 없거나 폰틱·임플란트·인레이/온레이면 만들지 않는다.
   */
  intaglio: boolean;
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
      intaglio: edit.inner.intaglio,
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
    /** 점마다 삽입축 둘레 각도. 없으면 점을 등각으로 둔다. 재설정으로 닫은 곡선은 찍은 각도를 그대로 둔다. */
    angles?: number[];
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
    /** 변형 상자에서 끈 배율. x=가로, y=높이, z=세로. 크기(scale)에 곱한다. */
    stretch: [number, number, number];
    /** 치아 평면에서 옮긴 거리(mm). x=가로, y=세로. */
    offsetMm: [number, number];
    /** 삽입축 둘레 회전(°). */
    rotateDeg: number;
    cusp: number;
    ridge: number;
    /** -1~1. 협측·설측 교두를 낮추고 높인다. 방향은 치아마다 악궁에서 잰다. */
    buccalCusp: number;
    lingualCusp: number;
    /** -1~1. 근심·원심 변연융선. 근심은 FDI 사분면 기준 정중선 쪽. */
    mesialRidge: number;
    distalRidge: number;
    /** -1~1. 교합면 테이블을 좁히고 넓힌다. */
    occlusalTable: number;
    /** -1~1. 중심 구를 얕게·깊게. */
    groove: number;
    /** 대합까지 목표 간격(mm). 음수는 겹침. */
    occlusalClearanceMm: number;
    /** 목표보다 가까운 면을 대합 스캔에 맞춰 깎는다. */
    occlusalTrim: boolean;
    /** 목표보다 먼 면을 대합까지 늘려 닿게 한다. */
    occlusalFit: boolean;
    proximalClearanceMm: number;
    proximalTrim: boolean;
    proximalFit: boolean;
    /** 삽입 경로에 걸리는 인접치 언더컷까지 깎는다. */
    proximalBlockOut: boolean;
    /** 폰틱 기저면·크라운 경부에서 치은 스캔까지(mm). 음수는 누름. 크라운은 마진 아래로 내리지 않는다. */
    gingivalMm: number;
    gingivalFit: boolean;
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
    /** 기공소가 치과 의뢰와 다른 라이브러리로 바꾸겠다고 확인했다. */
    orderOverride: boolean;
    screwHole: boolean;
  };
  /** 반지름·길이는 치아의 모든 훅에 같이 쓴다. */
  hook: {
    hooks: DesignHook[];
    radiusMm: number;
    lengthMm: number;
  };
  cutback: {
    /** 선택 영역을 깊이만큼 깎았다. 끄면 선택만 칠해 보인다. */
    applied: boolean;
    preset: CutbackPreset;
    ops: CutbackOp[];
    depthMm: number;
    /** 지대치 내면에서 잰 두께가 최소 두께 밑으로 내려가지 않게 깊이를 줄인다. */
    preserveMinThickness: boolean;
    /** 선택 브러시 지름. */
    brushMm: number;
  };
  /**
   * 스크류홀. 좌표는 치아 프레임(치아 추정 중심 원점, +Y 삽입축) mm.
   * 임플란트는 임플란트 축을 쓰고 `radiusMm`만 읽는다.
   */
  hole: {
    /** 교합면에 자리를 잡았다. */
    on: boolean;
    /** 크라운을 뚫었다. 자리만 잡은 홀은 내보내지 않는다. */
    applied: boolean;
    /** 축 위 한 점. 처음 누른 교합면 자리이고 회전 중심이다. */
    point: [number, number, number];
    /** 교합면 쪽을 향하는 축 단위 벡터. */
    dir: [number, number, number];
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
    /** 커넥터를 껐을 때 두 크라운 사이를 떼어 두는 디스크 간격(mm). 0이면 깎지 않는다. */
    discMm: number;
    assembled: boolean;
  };
};

/**
 * 크라운 외면에 붙인 훅. 좌표는 크라운 메시 로컬(변형 배율 전 단위 공간)이라
 * 크라운을 옮기고 돌리고 늘려도 같은 자리에 붙어 있다.
 */
export type DesignHook = {
  point: [number, number, number];
  /** 그 자리 외면 법선(메시 로컬). */
  normal: [number, number, number];
};

/** 치아 프레임의 마진 표본. radius는 기본 고리 비율, depth는 삽입축 방향 기하 단위. */
export type MarginSample = { angle: number; radius: number; depth: number };

export type DesignGesture =
  | { type: "margin"; tooth: string; index: number; radius: number; depth?: number }
  | { type: "margin-stroke"; tooth: string; samples: MarginSample[] }
  | { type: "margin-trace"; tooth: string; samples: MarginSample[] }
  | { type: "margin-insert"; tooth: string; index: number; radius: number; depth?: number }
  | { type: "margin-remove"; tooth: string; index: number }
  | { type: "hook-add"; tooth: string; hook: DesignHook }
  | { type: "hook-move"; tooth: string; index: number; hook: DesignHook }
  | { type: "hook-remove"; tooth: string; index: number }
  | {
      type: "hole-place";
      tooth: string;
      point: [number, number, number];
      dir: [number, number, number];
    }
  | { type: "hole-move"; tooth: string; point: [number, number, number] }
  | { type: "hole-dir"; tooth: string; dir: [number, number, number] }
  | { type: "hole-remove"; tooth: string }
  | { type: "hole-reject"; tooth: string; reason: string }
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
  | { type: "cutback-paint"; tooth: string; point: [number, number, number]; add: boolean }
  | { type: "transform"; tooth: string; patch: Partial<RefineTransform> }
  | { type: "connector"; tooth: string; along: number };

export type RefineTransform = Pick<
  ToothDesignEdit["refine"],
  "scale" | "stretch" | "offsetMm" | "rotateDeg"
>;

export const STRETCH_RANGE = { min: 0.6, max: 1.6 } as const;
export const REFINE_OFFSET_LIMIT_MM = 3;
export const CLEARANCE_RANGE_MM = { min: -0.1, max: 0.4 } as const;
export const GINGIVAL_RANGE_MM = { min: -0.5, max: 1.5 } as const;
export const DISC_RANGE_MM = { min: 0, max: 0.5 } as const;

export function transformUntouched(refine: ToothDesignEdit["refine"]) {
  return (
    refine.stretch.every((value) => value === 1) &&
    refine.offsetMm.every((value) => value === 0) &&
    refine.rotateDeg === 0
  );
}

export function resetRefineTransform(edit: ToothDesignEdit): ToothDesignEdit {
  return {
    ...edit,
    refine: { ...edit.refine, scale: 1, stretch: [1, 1, 1], offsetMm: [0, 0], rotateDeg: 0 },
  };
}

export function applyRefineTransform(
  edit: ToothDesignEdit,
  patch: Partial<RefineTransform>,
): ToothDesignEdit {
  const refine = { ...edit.refine };
  if (patch.scale != null) refine.scale = clamp(patch.scale, 0.75, 1.35);
  if (patch.stretch) {
    refine.stretch = patch.stretch.map((value) =>
      Math.round(clamp(value, STRETCH_RANGE.min, STRETCH_RANGE.max) * 1000) / 1000,
    ) as [number, number, number];
  }
  if (patch.offsetMm) {
    refine.offsetMm = patch.offsetMm.map((value) =>
      Math.round(clamp(value, -REFINE_OFFSET_LIMIT_MM, REFINE_OFFSET_LIMIT_MM) * 1000) / 1000,
    ) as [number, number];
  }
  if (patch.rotateDeg != null) {
    let deg = patch.rotateDeg;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    refine.rotateDeg = Math.round(deg * 10) / 10;
  }
  return { ...edit, refine };
}

export type ProsthesisDesignEdit = {
  tool: ModifyTool;
  /** 형상 도구 단계. 변형 핸들은 변형 단계에서만 그린다. */
  refineTab?: RefineTab;
  marginMode: MarginEditMode;
  /** 마진 점을 끌어 옮기는 편집 중. 아니면 점·선이 클릭을 받지 않는다. */
  marginEdit?: boolean;
  /** 마진 재설정 중. 마진 위를 찍어 새로 잡는다. */
  marginReset?: boolean;
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
    intaglio: true,
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
    intaglio: row.intaglio !== false,
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
      stretch: [1, 1, 1],
      offsetMm: [0, 0],
      rotateDeg: 0,
      cusp: 0,
      ridge: 0,
      buccalCusp: 0,
      lingualCusp: 0,
      mesialRidge: 0,
      distalRidge: 0,
      occlusalTable: 0,
      groove: 0,
      occlusalClearanceMm: preset.occlusalClearanceMm,
      occlusalTrim: false,
      occlusalFit: false,
      proximalClearanceMm: preset.proximalClearanceMm,
      proximalTrim: false,
      proximalFit: false,
      proximalBlockOut: true,
      gingivalMm: 0,
      gingivalFit: false,
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
      orderOverride: false,
      screwHole: false,
    },
    hook: { hooks: [], radiusMm: HOOK_RADIUS_DEFAULT_MM, lengthMm: HOOK_LENGTH_DEFAULT_MM },
    cutback: {
      applied: false,
      preset: "none",
      ops: [],
      depthMm: CUTBACK_DEPTH_DEFAULT_MM,
      preserveMinThickness: true,
      brushMm: CUTBACK_BRUSH_DEFAULT_MM,
    },
    hole: {
      on: false,
      applied: false,
      point: [0, 0, 0],
      dir: [0, 1, 0],
      radiusMm: HOLE_RADIUS_DEFAULT_MM,
    },
    connector: {
      shape: "round",
      transverseMm: 4,
      verticalMm: 3.2,
      along: 0.5,
      shiftXMm: 0,
      shiftYMm: 0,
      linked: true,
      discMm: 0,
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
  const rawRefine = (row.refine ?? {}) as Partial<ToothDesignEdit["refine"]>;
  const refine = {
    ...base.refine,
    ...rawRefine,
    stretch: finiteTuple(rawRefine.stretch, 3, base.refine.stretch),
    offsetMm: finiteTuple(rawRefine.offsetMm, 2, base.refine.offsetMm),
    rotateDeg: Number(rawRefine.rotateDeg) || 0,
  };
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
      orderOverride: implant.orderOverride === true,
      screwHole: implant.screwHole === true,
    },
    pontic: {
      on: pontic.on === true,
      base: PONTIC_BASES.some((item) => item.id === pontic.base)
        ? (pontic.base as PonticBase)
        : base.pontic.base,
    },
    margin: normalizeMargin({ ...base.margin, ...(row.margin ?? {}) }),
    inner: normalizeToothInner(row.inner, refine.minThicknessMm),
    refine,
    hook: normalizeHook(row.hook, base.hook),
    cutback: normalizeCutback(row.cutback, base.cutback),
    hole: normalizeHole(row.hole, base.hole),
    connector: {
      ...base.connector,
      ...connector,
      shiftXMm: Number(connector.shiftXMm) || 0,
      shiftYMm: Number(connector.shiftYMm) || 0,
      linked: connector.linked !== false,
      discMm: clamp(Number(connector.discMm) || 0, DISC_RANGE_MM.min, DISC_RANGE_MM.max),
    },
  };
}

function unitVec3(value: unknown): [number, number, number] | null {
  const v = vec3OrNull(value);
  if (!v) return null;
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-9 ? null : [v[0] / length, v[1] / length, v[2] / length];
}

/** 예전 훅은 크라운 옆 각도 하나였다. 켜져 있었으면 그 방향 외면에 하나를 붙인다. */
function normalizeHook(raw: unknown, base: ToothDesignEdit["hook"]): ToothDesignEdit["hook"] {
  if (!raw || typeof raw !== "object") return { ...base, hooks: [] };
  const row = raw as Record<string, unknown>;
  const radius = Number(row.radiusMm);
  const length = Number(row.lengthMm);
  let hooks: DesignHook[] = [];
  if (Array.isArray(row.hooks)) {
    hooks = row.hooks.flatMap((item) => {
      const hook = (item ?? {}) as Record<string, unknown>;
      const point = vec3OrNull(hook.point);
      const normal = unitVec3(hook.normal);
      return point && normal ? [{ point, normal }] : [];
    });
  } else if (row.on === true) {
    const angle = ((Number(row.angle) || 0) * Math.PI) / 180;
    const dir = unitVec3([Math.cos(angle), 0.15, Math.sin(angle)])!;
    hooks = [{ point: dir, normal: dir }];
  }
  return {
    hooks: hooks.slice(0, HOOK_MAX_COUNT),
    radiusMm: Number.isFinite(radius)
      ? clamp(radius, HOOK_RADIUS_RANGE_MM.min, HOOK_RADIUS_RANGE_MM.max)
      : base.radiusMm,
    lengthMm: Number.isFinite(length)
      ? clamp(length, HOOK_LENGTH_RANGE_MM.min, HOOK_LENGTH_RANGE_MM.max)
      : base.lengthMm,
  };
}

function parseCutbackOp(raw: unknown): CutbackOp | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "invert") return { kind: "invert" };
  if (row.kind !== "add" && row.kind !== "remove") return null;
  const point = vec3OrNull(row.point);
  const radius = Number(row.radiusMm);
  if (!point || !Number.isFinite(radius) || radius <= 0) return null;
  return { kind: row.kind, point, radiusMm: radius };
}

/**
 * 예전 컷백은 부분·전체 영역, 두께, 제외한 방위각이었다. 켜져 있었으면
 * 그 영역을 프리셋으로, 제외 각도를 크라운 옆면 빼기 브러시로 옮겨 깎은 채로 둔다.
 */
function normalizeCutback(
  raw: unknown,
  base: ToothDesignEdit["cutback"],
): ToothDesignEdit["cutback"] {
  if (!raw || typeof raw !== "object") return { ...base, ops: [] };
  const row = raw as Record<string, unknown>;
  const depthOf = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n)
      ? clamp(n, CUTBACK_DEPTH_RANGE_MM.min, CUTBACK_DEPTH_RANGE_MM.max)
      : base.depthMm;
  };
  if (!("preset" in row) && !("ops" in row)) {
    if (row.on !== true) return { ...base, ops: [] };
    const excluded = Array.isArray(row.excluded) ? row.excluded.map(Number) : [];
    return {
      ...base,
      applied: true,
      preset: row.region === "full" ? "full" : "partial",
      ops: excluded
        .filter(Number.isFinite)
        .map((angle) => ({
          kind: "remove" as const,
          point: [Math.cos(angle) * 0.95, 0.45, Math.sin(angle) * 0.95] as [number, number, number],
          radiusMm: 2,
        })),
      depthMm: depthOf(row.thicknessMm),
    };
  }
  const brush = Number(row.brushMm);
  return {
    applied: row.applied === true,
    preset: row.preset === "partial" || row.preset === "full" ? row.preset : "none",
    ops: Array.isArray(row.ops)
      ? row.ops.flatMap((op) => parseCutbackOp(op) ?? []).slice(-CUTBACK_OP_MAX)
      : [],
    depthMm: depthOf(row.depthMm),
    preserveMinThickness: row.preserveMinThickness !== false,
    brushMm: Number.isFinite(brush)
      ? clamp(brush, CUTBACK_BRUSH_RANGE_MM.min, CUTBACK_BRUSH_RANGE_MM.max)
      : base.brushMm,
  };
}

/** 선택을 바꾸면 깎은 결과는 풀고 선택부터 다시 보인다. */
export function editCutbackSelection(
  edit: ToothDesignEdit,
  patch: Partial<Pick<ToothDesignEdit["cutback"], "preset" | "ops">>,
): ToothDesignEdit {
  return { ...edit, cutback: { ...edit.cutback, ...patch, applied: false } };
}

/** 반전을 두 번 누르면 쌓지 않고 앞 반전을 지운다. */
export function invertCutbackSelection(edit: ToothDesignEdit): ToothDesignEdit {
  const ops = edit.cutback.ops;
  const last = ops[ops.length - 1];
  return editCutbackSelection(edit, {
    ops: last?.kind === "invert" ? ops.slice(0, -1) : [...ops, { kind: "invert" }],
  });
}

/** 예전 홀은 크라운 중심을 지나는 각도·기울기였다. 켜져 있었으면 중심 삽입축으로 뚫는다. */
function normalizeHole(raw: unknown, base: ToothDesignEdit["hole"]): ToothDesignEdit["hole"] {
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const on = row.on === true;
  const radius = Number(row.radiusMm);
  return {
    on,
    applied: on && ("applied" in row ? row.applied === true : true),
    point: vec3OrNull(row.point) ?? base.point,
    dir: clampHoleDir(vec3OrNull(row.dir) ?? base.dir),
    radiusMm: Number.isFinite(radius)
      ? clamp(radius, HOLE_RADIUS_MIN_MM, HOLE_RADIUS_MAX_MM)
      : base.radiusMm,
  };
}

/** 삽입축에서 이만큼까지만 기울인다. 더 누우면 교합면이 아니라 옆벽을 뚫는다. */
export const HOLE_TILT_MAX_DEG = 45;

export function clampHoleDir(dir: readonly number[]): [number, number, number] {
  let [x, y, z] = [dir[0] ?? 0, dir[1] ?? 1, dir[2] ?? 0];
  const length = Math.hypot(x, y, z);
  if (length < 1e-9) return [0, 1, 0];
  x /= length;
  y /= length;
  z /= length;
  const minY = Math.cos((HOLE_TILT_MAX_DEG * Math.PI) / 180);
  if (y >= minY) return [x, y, z];
  const side = Math.hypot(x, z);
  if (side < 1e-9) return [0, 1, 0];
  const keep = Math.sqrt(1 - minY * minY) / side;
  return [x * keep, minY, z * keep];
}

export function holeTiltDeg(dir: readonly number[]) {
  const y = clamp(dir[1] ?? 1, -1, 1);
  return (Math.acos(y) * 180) / Math.PI;
}

function finiteTuple<T extends number[]>(value: unknown, length: number, fallback: T): T {
  if (!Array.isArray(value) || value.length < length) return fallback.slice() as T;
  const out = value.slice(0, length).map(Number);
  return (out.every((n) => Number.isFinite(n)) ? out : fallback.slice()) as T;
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
      angles: undefined,
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
function normalizeMargin(margin: ToothDesignEdit["margin"]): ToothDesignEdit["margin"] {
  const radii = Array.isArray(margin.radii) ? margin.radii.filter((n) => Number.isFinite(n)) : [];
  const depths = Array.isArray(margin.depths)
    ? margin.depths.map((n) => (Number.isFinite(n) ? n : 0))
    : [];
  const rawAngles = margin.angles;
  const angles =
    Array.isArray(rawAngles) && rawAngles.length === radii.length
      ? rawAngles.map((n) => (Number.isFinite(n) ? wrapTurn(n) : 0))
      : undefined;
  return { ...margin, radii, depths, angles };
}

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
      angles: undefined,
      offsetMm: 0,
      deleted: false,
      cavity: null,
    },
  };
}

/** 점 하나를 끌 때 양옆으로 같이 움직이는 점 수. */
const MARGIN_DRAG_REACH = 4;

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
  const hasDepth = depth != null && Number.isFinite(depth);
  if (hasDepth) {
    depths = (edit.margin.depths ?? []).slice();
    while (depths.length < count) depths.push(0);
  }
  const slot = ((index % count) + count) % count;
  const next = clamp(radius, MARGIN_RATIO_MIN, 2.85);
  if (pen) {
    const paint = (at: number, weight: number) => {
      const key = ((at % count) + count) % count;
      radii[key] = (radii[key] ?? 1) * (1 - weight) + next * weight;
    };
    paint(index, 1);
    paint(index - 1, 0.55);
    paint(index + 1, 0.55);
    paint(index - 2, 0.22);
    paint(index + 2, 0.22);
    return { ...edit, margin: { ...edit.margin, radii, depths, deleted: false } };
  }
  // 끈 점을 따라 이웃 점도 코사인 감쇠로 같이 움직여 뾰족함을 줄인다.
  const dr = next - (radii[slot] ?? 1);
  const dd = hasDepth ? depth! - (depths?.[slot] ?? 0) : 0;
  const reach = Math.min(MARGIN_DRAG_REACH, Math.floor((count - 1) / 2));
  for (let k = -reach; k <= reach; k += 1) {
    const w = 0.5 * (1 + Math.cos((Math.PI * k) / (reach + 1)));
    const key = (((slot + k) % count) + count) % count;
    radii[key] = clamp((radii[key] ?? 1) + dr * w, MARGIN_RATIO_MIN, 2.85);
    if (hasDepth && depths) depths[key] = (depths[key] ?? 0) + dd * w;
  }
  return { ...edit, margin: { ...edit.margin, radii, depths, deleted: false } };
}

const TAU = Math.PI * 2;

function wrapTurn(angle: number) {
  return ((angle % TAU) + TAU) % TAU;
}

function shortestTurn(delta: number) {
  let d = delta % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
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
 * 시작점에서 찍어 시작점으로 닫은 마진. 찍은 점·중간점의 각도·반경·깊이를 그대로 둔다.
 * 등각으로 다시 나누지 않는다(그러면 자동검출과 같은 원형으로 바뀐다). 못 닫으면 null.
 */
export function applyMarginTrace(
  edit: ToothDesignEdit,
  samples: readonly MarginSample[],
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
  const loop = path.slice(0, -1);
  const radii = loop.map((sample) => clamp(sample.radius, MARGIN_RATIO_MIN, 2.85));
  const depths = loop.map((sample) => sample.depth);
  const angles = loop.map((sample) => wrapTurn(sample.angle));
  const cavity = edit.margin.cavity
    ? { ...edit.margin.cavity, taperDeg: Array.from({ length: radii.length }, () => NaN) }
    : edit.margin.cavity;
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, angles, cavity, deleted: false },
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
    return applyMarginTrace(edit, path) ?? edit;
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
  const keep = (_: unknown, slot: number) => slot !== index;
  const angles =
    edit.margin.angles?.length === edit.margin.radii.length
      ? edit.margin.angles.filter(keep)
      : undefined;
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: edit.margin.radii.filter(keep),
      depths: (edit.margin.depths ?? []).filter(keep),
      angles,
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
  if (edit.margin.radii.length >= 256) return edit;
  const radii = edit.margin.radii.slice();
  const depths = (edit.margin.depths ?? []).slice();
  while (depths.length < radii.length) depths.push(0);
  const at = Math.min(radii.length, Math.max(0, index));
  radii.splice(at, 0, clamp(radius, MARGIN_RATIO_MIN, 2.85));
  const before = depths[at - 1] ?? depths[at] ?? 0;
  const after = depths[at] ?? before;
  depths.splice(at, 0, depth != null && Number.isFinite(depth) ? depth : (before + after) / 2);
  const angles =
    edit.margin.angles?.length === edit.margin.radii.length
      ? edit.margin.angles.slice()
      : undefined;
  if (angles) {
    const prev = angles[(at - 1 + angles.length) % angles.length] ?? 0;
    const next = angles[at % angles.length] ?? prev;
    let mid = shortestTurn(next - prev) / 2;
    angles.splice(at, 0, wrapTurn(prev + mid));
  }
  const cavity = spliceCavityTaper(edit.margin.cavity, (taper) => {
    taper.splice(at, 0, NaN);
    return taper;
  });
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, angles, cavity, deleted: false },
  };
}

/**
 * 외면 껍질 두께(mm). 보상은 최소 두께까지 올린다.
 * `measuredMm`는 뷰어가 대합·인접 깎기까지 정점마다 잰 가장 얇은 값이다. 없으면 수정값으로 추정한다.
 */
export function shellThicknessMm(edit: ToothDesignEdit, measuredMm?: number | null) {
  if (measuredMm != null && Number.isFinite(measuredMm)) return measuredMm;
  const dent = edit.refine.sculpt.reduce(
    (max, stamp) => Math.max(max, -stamp.amount),
    0,
  );
  let shell = 0.55 * edit.refine.scale - dent * 0.25 - innerGapMm(edit.inner) * 0.35;
  if (edit.cutback.applied) shell -= edit.cutback.depthMm * 0.45;
  if (edit.refine.compensate) shell = Math.max(shell, edit.refine.minThicknessMm);
  return shell;
}

export function shellIsThin(edit: ToothDesignEdit, measuredMm?: number | null) {
  return shellThicknessMm(edit, measuredMm) + 1e-4 < edit.refine.minThicknessMm;
}

function wrapAngle(delta: number) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

/** 마진 실 높이를 교합 0~1로 옮길 때 보는 크라운 높이. */
const CROWN_HEIGHT_MM = 7;

/**
 * 교합 0~1. 스컬프트가 있는 자리만 더 얇다. 마진 실 띠는 마진 실 갭을 쓴다.
 * 대합·인접 깎기와 컷백은 여기서 빼지 않는다. 편집 레이어가 정점마다 깎은 깊이를 뺀다.
 */
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
    case "hook-add":
      if (edit.hook.hooks.length >= HOOK_MAX_COUNT) return edit;
      return { ...edit, hook: { ...edit.hook, hooks: [...edit.hook.hooks, gesture.hook] } };
    case "hook-move":
      if (!edit.hook.hooks[gesture.index]) return edit;
      return {
        ...edit,
        hook: {
          ...edit.hook,
          hooks: edit.hook.hooks.map((hook, index) => (index === gesture.index ? gesture.hook : hook)),
        },
      };
    case "hook-remove":
      return {
        ...edit,
        hook: {
          ...edit.hook,
          hooks: edit.hook.hooks.filter((_, index) => index !== gesture.index),
        },
      };
    case "hole-place":
      return {
        ...edit,
        hole: {
          ...edit.hole,
          on: true,
          applied: false,
          point: gesture.point,
          dir: clampHoleDir(gesture.dir),
        },
      };
    case "hole-move":
      if (!edit.hole.on) return edit;
      return { ...edit, hole: { ...edit.hole, point: gesture.point } };
    case "hole-dir":
      if (!edit.hole.on) return edit;
      return { ...edit, hole: { ...edit.hole, dir: clampHoleDir(gesture.dir) } };
    case "hole-remove":
      return { ...edit, hole: { ...edit.hole, on: false, applied: false } };
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
    case "cutback-paint": {
      const op: CutbackOp = {
        kind: gesture.add ? "add" : "remove",
        point: gesture.point.map((n) => Math.round(n * 1e4) / 1e4) as [number, number, number],
        radiusMm: edit.cutback.brushMm / 2,
      };
      return editCutbackSelection(edit, {
        ops: [...edit.cutback.ops, op].slice(-CUTBACK_OP_MAX),
      });
    }
    case "transform":
      return applyRefineTransform(edit, gesture.patch);
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
