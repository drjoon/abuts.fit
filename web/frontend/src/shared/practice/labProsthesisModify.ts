// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터·폰틱 수정값.

import { fdiToothDigits } from "@/shared/practice/toothArchOrder";

export const MARGIN_POINT_COUNT = 16;

export const MODIFY_TOOLS = [
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

export type InnerPresetId = "zirconia" | "glass" | "pmma" | "print" | "clinic" | "custom";

/** 디자인 시작 전 범위. 마진만이면 크라운을 만들지 않는다. */
export type DesignScope = "margin" | "crown";

/** 마진 검토. 확인 전에는 생성을 열지 않는다. */
export type MarginReview = "none" | "detected" | "confirmed";

export type ConnectorShape = "inverted" | "round" | "triangle" | "proximal";

export type CutbackRegion = "partial" | "full";

export type InnerPreset = {
  id: InnerPresetId;
  label: string;
  cementGapMm: number;
  spacerMm: number;
  marginTaperMm: number;
  minThicknessMm: number;
  occlusalClearanceMm: number;
  proximalClearanceMm: number;
};

export const INNER_PRESETS: InnerPreset[] = [
  {
    id: "zirconia",
    label: "지르코니아 밀링",
    cementGapMm: 0.05,
    spacerMm: 0.08,
    marginTaperMm: 0.02,
    minThicknessMm: 0.5,
    occlusalClearanceMm: 0.1,
    proximalClearanceMm: 0.05,
  },
  {
    id: "glass",
    label: "글라스 세라믹",
    cementGapMm: 0.08,
    spacerMm: 0.04,
    marginTaperMm: 0.1,
    minThicknessMm: 0.8,
    occlusalClearanceMm: 0.1,
    proximalClearanceMm: 0.05,
  },
  {
    id: "pmma",
    label: "임시치 PMMA",
    cementGapMm: 0.12,
    spacerMm: 0.06,
    marginTaperMm: 0,
    minThicknessMm: 0.8,
    occlusalClearanceMm: 0.15,
    proximalClearanceMm: 0.08,
  },
  {
    id: "print",
    label: "3D 프린트",
    cementGapMm: 0.1,
    spacerMm: 0.08,
    marginTaperMm: 0.04,
    minThicknessMm: 0.6,
    occlusalClearanceMm: 0.12,
    proximalClearanceMm: 0.06,
  },
  {
    id: "custom",
    label: "직접 입력",
    cementGapMm: 0.05,
    spacerMm: 0.08,
    marginTaperMm: 0.02,
    minThicknessMm: 0.5,
    occlusalClearanceMm: 0.1,
    proximalClearanceMm: 0.05,
  },
];

/** 내장 목록에 없는 치과 프리셋. 케이스에는 숫자만 남긴다. */
export type ClinicMaterialPreset = {
  clinicKey: string;
  label: string;
  cementGapMm: number;
  spacerMm: number;
  marginTaperMm: number;
  minThicknessMm: number;
  occlusalClearanceMm: number;
  proximalClearanceMm: number;
};

const CLINIC_PRESET_STORAGE = "abuts.labProsthesis.clinicPresets";

/** 의뢰 헤더 `치과 · 환자`의 앞부분. */
export function clinicKeyFromCasePrimary(primary: string | null | undefined): string {
  return String(primary || "")
    .split("·")[0]
    ?.trim() ?? "";
}

export function parseDesignScope(value: unknown): DesignScope | null {
  return value === "margin" || value === "crown" ? value : null;
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

export function materialSnapshot(
  edit: ToothDesignEdit,
): Omit<ClinicMaterialPreset, "clinicKey" | "label"> {
  return {
    cementGapMm: edit.inner.cementGapMm,
    spacerMm: edit.inner.spacerMm,
    marginTaperMm: edit.inner.marginTaperMm,
    minThicknessMm: edit.refine.minThicknessMm,
    occlusalClearanceMm: edit.refine.occlusalClearanceMm,
    proximalClearanceMm: edit.refine.proximalClearanceMm,
  };
}

export function readClinicMaterialPreset(clinicKey: string): ClinicMaterialPreset | null {
  const key = String(clinicKey || "").trim();
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLINIC_PRESET_STORAGE);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, ClinicMaterialPreset>;
    const row = all?.[key];
    if (!row || !Number.isFinite(Number(row.minThicknessMm))) return null;
    return {
      clinicKey: key,
      label: String(row.label || key),
      cementGapMm: Number(row.cementGapMm) || 0,
      spacerMm: Number(row.spacerMm) || 0,
      marginTaperMm: Number(row.marginTaperMm) || 0,
      minThicknessMm: Number(row.minThicknessMm),
      occlusalClearanceMm: Number(row.occlusalClearanceMm) || 0,
      proximalClearanceMm: Number(row.proximalClearanceMm) || 0,
    };
  } catch {
    return null;
  }
}

export function writeClinicMaterialPreset(preset: ClinicMaterialPreset) {
  const key = String(preset.clinicKey || "").trim();
  if (!key || typeof window === "undefined") return;
  let all: Record<string, ClinicMaterialPreset> = {};
  try {
    const raw = window.localStorage.getItem(CLINIC_PRESET_STORAGE);
    if (raw) all = JSON.parse(raw) as Record<string, ClinicMaterialPreset>;
  } catch {
    all = {};
  }
  all[key] = { ...preset, clinicKey: key };
  window.localStorage.setItem(CLINIC_PRESET_STORAGE, JSON.stringify(all));
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
const CONNECTOR_MIN_AREA: Record<InnerPresetId, { anterior: number; posterior: number }> = {
  zirconia: { anterior: 7, posterior: 9 },
  glass: { anterior: 12, posterior: 16 },
  pmma: { anterior: 10, posterior: 12 },
  print: { anterior: 10, posterior: 12 },
  clinic: { anterior: 7, posterior: 9 },
  custom: { anterior: 7, posterior: 9 },
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
  preset: InnerPresetId,
  toothNumbers: readonly string[],
) {
  const row = CONNECTOR_MIN_AREA[preset] ?? CONNECTOR_MIN_AREA.zirconia;
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
    connectorMinAreaMm2(edit.inner.preset, toothNumbers)
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
  };
  inner: {
    preset: InnerPresetId;
    cementGapMm: number;
    spacerMm: number;
    marginTaperMm: number;
    applied: boolean;
  };
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
    sculpt: Array<{ angle: number; amount: number }>;
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

export type DesignGesture =
  | { type: "margin"; tooth: string; index: number; radius: number }
  | { type: "margin-insert"; tooth: string; index: number; radius: number }
  | { type: "margin-remove"; tooth: string; index: number }
  | { type: "hook-angle"; tooth: string; angle: number }
  | { type: "hook-off"; tooth: string }
  | { type: "hole-angle"; tooth: string; angle: number }
  | { type: "hole-tilt"; tooth: string; tilt: number }
  | { type: "hole-reject"; tooth: string }
  | { type: "sculpt"; tooth: string; angle: number; amount: number }
  | { type: "smooth"; tooth: string }
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
};

function ones(count: number) {
  return Array.from({ length: count }, () => 1);
}

export function createToothDesignEdit(): ToothDesignEdit {
  const preset = INNER_PRESETS[0]!;
  return {
    pontic: { on: false, base: "modifiedRidgeLap" },
    margin: {
      radii: ones(MARGIN_POINT_COUNT),
      depths: Array.from({ length: MARGIN_POINT_COUNT }, () => 0),
      offsetMm: 0,
      showBack: false,
      deleted: false,
    },
    inner: {
      preset: preset.id,
      cementGapMm: preset.cementGapMm,
      spacerMm: preset.spacerMm,
      marginTaperMm: preset.marginTaperMm,
      applied: false,
    },
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
  return {
    ...base,
    ...row,
    pontic: {
      on: pontic.on === true,
      base: PONTIC_BASES.some((item) => item.id === pontic.base)
        ? (pontic.base as PonticBase)
        : base.pontic.base,
    },
    margin: { ...base.margin, ...(row.margin ?? {}) },
    inner: { ...base.inner, ...(row.inner ?? {}) },
    refine: { ...base.refine, ...(row.refine ?? {}) },
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
    },
  };
}

export function applyMarginRadius(
  edit: ToothDesignEdit,
  index: number,
  radius: number,
  pen: boolean,
): ToothDesignEdit {
  const radii = edit.margin.radii.slice();
  const count = radii.length || MARGIN_POINT_COUNT;
  while (radii.length < count) radii.push(1);
  const next = clamp(radius, 0.45, 2.85);
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
    margin: { ...edit.margin, radii, deleted: false },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function removeMarginPoint(edit: ToothDesignEdit, index: number): ToothDesignEdit {
  if (edit.margin.radii.length <= 8) return edit;
  return {
    ...edit,
    margin: {
      ...edit.margin,
      radii: edit.margin.radii.filter((_, slot) => slot !== index),
      depths: (edit.margin.depths ?? []).filter((_, slot) => slot !== index),
    },
  };
}

export function insertMarginPoint(
  edit: ToothDesignEdit,
  index: number,
  radius: number,
): ToothDesignEdit {
  if (edit.margin.radii.length >= 32) return edit;
  const radii = edit.margin.radii.slice();
  const depths = (edit.margin.depths ?? []).slice();
  while (depths.length < radii.length) depths.push(0);
  const at = Math.min(radii.length, Math.max(0, index));
  radii.splice(at, 0, clamp(radius, 0.45, 2.85));
  const before = depths[at - 1] ?? depths[at] ?? 0;
  const after = depths[at] ?? before;
  depths.splice(at, 0, (before + after) / 2);
  return {
    ...edit,
    margin: { ...edit.margin, radii, depths, deleted: false },
  };
}

function applyMaterialNumbers(
  edit: ToothDesignEdit,
  presetId: InnerPresetId,
  numbers: Omit<ClinicMaterialPreset, "clinicKey" | "label">,
): ToothDesignEdit {
  return {
    ...edit,
    inner: {
      ...edit.inner,
      preset: presetId,
      cementGapMm: numbers.cementGapMm,
      spacerMm: numbers.spacerMm,
      marginTaperMm: numbers.marginTaperMm,
      applied: false,
    },
    refine: {
      ...edit.refine,
      minThicknessMm: numbers.minThicknessMm,
      occlusalClearanceMm: numbers.occlusalClearanceMm,
      proximalClearanceMm: numbers.proximalClearanceMm,
    },
  };
}

export function applyInnerPreset(
  edit: ToothDesignEdit,
  presetId: InnerPresetId,
): ToothDesignEdit {
  if (presetId === "custom" || presetId === "clinic") {
    return { ...edit, inner: { ...edit.inner, preset: presetId, applied: false } };
  }
  const preset = INNER_PRESETS.find((row) => row.id === presetId) ?? INNER_PRESETS[0]!;
  return applyMaterialNumbers(edit, preset.id, preset);
}

/** 치과 프리셋 숫자를 이 치아에 고정한다. 이후 라이브러리가 바뀌어도 케이스는 그대로다. */
export function applyClinicMaterialPreset(
  edit: ToothDesignEdit,
  preset: ClinicMaterialPreset,
): ToothDesignEdit {
  return applyMaterialNumbers(edit, "clinic", preset);
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
    edit.inner.cementGapMm * 0.35;
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

/** 교합 0~1. 스컬프트·컷백·교합 절삭이 있는 자리만 더 얇다. */
export function localShellThicknessMm(
  edit: ToothDesignEdit,
  angle: number,
  occlusal01: number,
) {
  const damp = 1 - edit.refine.smooth;
  let dent = 0;
  for (const stamp of edit.refine.sculpt) {
    const influence = Math.exp(-(wrapAngle(angle - stamp.angle) ** 2) / 0.09);
    if (stamp.amount < 0) dent += -stamp.amount * influence;
  }
  dent *= damp;
  let shell =
    0.55 * edit.refine.scale - dent * 0.25 - edit.inner.cementGapMm * 0.35;
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
      return applyMarginRadius(edit, gesture.index, gesture.radius, pen);
    case "margin-insert":
      return insertMarginPoint(edit, gesture.index, gesture.radius);
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
      const sculpt = [
        ...edit.refine.sculpt,
        { angle: gesture.angle, amount: gesture.amount },
      ].slice(-14);
      return { ...edit, refine: { ...edit.refine, sculpt } };
    }
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
