// 기공소 AI 디자인 — 디자인 프리셋(내면 파라미터).
// 프리셋마다 크라운·인레이온레이·임플란트 열을 둔다. 치아에는 고른 열의 숫자만 복사한다.
// related files:
// - web/backend/utils/labDesignPresets.js
// - web/frontend/src/shared/practice/labDesignPresetApi.ts
// - web/frontend/src/shared/components/practice/LabDesignPresetDialog.tsx
// - web/frontend/src/shared/practice/labProsthesisModify.ts

export type InnerKind = "crown" | "cavity" | "implant";
export type InnerMethod = "milling" | "print";
export type InnerMaterial = "zirconia" | "glass" | "pmma" | "resin";

export type InnerParams = {
  method: InnerMethod;
  material: InnerMaterial;
  /** 밀링 버 반지름. 프린트는 0. */
  toolRadiusMm: number;
  minThicknessMm: number;
  cementGapMm: number;
  /** 버가 닿지 않는 오목한 곳에 더 주는 간격. */
  extraGapMm: number;
  /** 마진 쪽 띠의 간격. */
  sealGapMm: number;
  /** 마진에서 마진 실 갭을 두는 높이. */
  sealHeightMm: number;
  marginWidthMm: number;
  marginAngleDeg: number;
};

export type InnerNumberKey = Exclude<keyof InnerParams, "method" | "material">;

export type DesignPreset = {
  id: string;
  name: string;
  /** 이 치과 의뢰를 열면 이 프리셋을 기본으로 쓴다. */
  clinicName: string;
} & Record<InnerKind, InnerParams>;

export type DesignPresetLibrary = {
  presets: DesignPreset[];
  defaultId: string;
};

export const INNER_KINDS: Array<{ id: InnerKind; label: string }> = [
  { id: "crown", label: "크라운" },
  { id: "cavity", label: "인레이·온레이" },
  { id: "implant", label: "임플란트" },
];

export const INNER_METHODS: Array<{ id: InnerMethod; label: string }> = [
  { id: "print", label: "3D 프린트" },
  { id: "milling", label: "밀링" },
];

export const INNER_MATERIALS: Array<{ id: InnerMaterial; label: string; method: InnerMethod }> = [
  { id: "zirconia", label: "지르코니아", method: "milling" },
  { id: "glass", label: "글라스 세라믹", method: "milling" },
  { id: "pmma", label: "PMMA", method: "milling" },
  { id: "resin", label: "프린트 레진", method: "print" },
];

export type InnerField = {
  key: InnerNumberKey;
  label: string;
  unit: "mm" | "°";
  min: number;
  max: number;
  step: number;
  digits: number;
  hint: string;
};

/** 범위는 서버 `INNER_RANGES`와 같다. */
export const INNER_FIELDS: InnerField[] = [
  {
    key: "toolRadiusMm",
    label: "툴 반지름",
    unit: "mm",
    min: 0,
    max: 1.5,
    step: 0.05,
    digits: 3,
    hint: "밀링 버 반지름입니다. 버보다 좁은 내면 굴곡은 깎이지 않아 그만큼 넓힙니다.",
  },
  {
    key: "minThicknessMm",
    label: "최소 두께",
    unit: "mm",
    min: 0.2,
    max: 3,
    step: 0.05,
    digits: 3,
    hint: "보철 벽이 이보다 얇으면 빨갛게 표시합니다.",
  },
  {
    key: "cementGapMm",
    label: "시멘트 갭",
    unit: "mm",
    min: 0,
    max: 0.3,
    step: 0.005,
    digits: 3,
    hint: "마진 실 위 내면 전체에 두는 시멘트 간격입니다.",
  },
  {
    key: "extraGapMm",
    label: "추가 갭",
    unit: "mm",
    min: 0,
    max: 0.3,
    step: 0.005,
    digits: 3,
    hint: "버가 닿지 않는 오목한 곳과 교합면 쪽에 더 주는 간격입니다.",
  },
  {
    key: "sealGapMm",
    label: "마진 실 갭",
    unit: "mm",
    min: 0,
    max: 0.3,
    step: 0.005,
    digits: 3,
    hint: "마진 쪽 띠의 간격입니다. 시멘트 갭보다 작게 두어 마진을 밀착합니다.",
  },
  {
    key: "sealHeightMm",
    label: "마진 실 높이",
    unit: "mm",
    min: 0,
    max: 3,
    step: 0.1,
    digits: 3,
    hint: "마진에서 위로 마진 실 갭을 두는 높이입니다.",
  },
  {
    key: "marginWidthMm",
    label: "마진 폭",
    unit: "mm",
    min: 0,
    max: 1,
    step: 0.01,
    digits: 3,
    hint: "마진 끝의 두께입니다.",
  },
  {
    key: "marginAngleDeg",
    label: "마진 각도",
    unit: "°",
    min: 0,
    max: 90,
    step: 1,
    digits: 1,
    hint: "마진 끝에서 외면이 올라가는 각도입니다.",
  },
];

/** 재료별 교합·인접 간격(외면). 프리셋을 고르면 같이 맞춘다. */
export const MATERIAL_OUTER: Record<
  InnerMaterial,
  { occlusalClearanceMm: number; proximalClearanceMm: number }
> = {
  zirconia: { occlusalClearanceMm: 0.1, proximalClearanceMm: 0.05 },
  glass: { occlusalClearanceMm: 0.1, proximalClearanceMm: 0.05 },
  pmma: { occlusalClearanceMm: 0.15, proximalClearanceMm: 0.08 },
  resin: { occlusalClearanceMm: 0.12, proximalClearanceMm: 0.06 },
};

function params(
  method: InnerMethod,
  material: InnerMaterial,
  [toolRadiusMm, minThicknessMm, cementGapMm, extraGapMm, sealGapMm, sealHeightMm, marginWidthMm, marginAngleDeg]: number[],
): InnerParams {
  return {
    method,
    material,
    toolRadiusMm: toolRadiusMm!,
    minThicknessMm: minThicknessMm!,
    cementGapMm: cementGapMm!,
    extraGapMm: extraGapMm!,
    sealGapMm: sealGapMm!,
    sealHeightMm: sealHeightMm!,
    marginWidthMm: marginWidthMm!,
    marginAngleDeg: marginAngleDeg!,
  };
}

export const DEFAULT_DESIGN_PRESET_ID = "builtin-zirconia";

/** 지울 수 없는 기본 프리셋. 값은 고칠 수 있다. */
export const BUILTIN_DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "builtin-print",
    name: "기본 - 3D 프린트",
    clinicName: "",
    crown: params("print", "resin", [0, 0.5, 0.04, 0.03, 0.02, 1, 0.2, 45]),
    cavity: params("print", "resin", [0, 0.6, 0.08, 0.02, 0.03, 1, 0.1, 0]),
    implant: params("print", "resin", [0, 0.5, 0.03, 0.02, 0.02, 1, 0.2, 45]),
  },
  {
    id: "builtin-pmma",
    name: "기본 - 밀링(PMMA)",
    clinicName: "",
    crown: params("milling", "pmma", [0.6, 0.8, 0.05, 0.03, 0.02, 1, 0.15, 45]),
    cavity: params("milling", "pmma", [0.6, 1, 0.06, 0.02, 0.02, 1, 0.1, 0]),
    implant: params("milling", "pmma", [0.6, 0.8, 0.03, 0.02, 0.02, 1, 0.15, 45]),
  },
  {
    id: DEFAULT_DESIGN_PRESET_ID,
    name: "기본 - 밀링(지르코니아)",
    clinicName: "",
    crown: params("milling", "zirconia", [0.6, 0.5, 0.03, 0.03, 0.02, 1, 0.15, 45]),
    cavity: params("milling", "zirconia", [0.6, 0.6, 0.05, 0.02, 0.02, 1, 0.1, 0]),
    implant: params("milling", "zirconia", [0.6, 0.5, 0.02, 0.02, 0.02, 1, 0.15, 45]),
  },
  {
    id: "builtin-glass",
    name: "기본 - 밀링(글라스 세라믹)",
    clinicName: "",
    crown: params("milling", "glass", [0.5, 0.8, 0.05, 0.03, 0.02, 1, 0.15, 45]),
    cavity: params("milling", "glass", [0.5, 1, 0.06, 0.02, 0.02, 1, 0.1, 0]),
    implant: params("milling", "glass", [0.5, 0.8, 0.03, 0.02, 0.02, 1, 0.15, 45]),
  },
];

export const BUILTIN_DESIGN_LIBRARY: DesignPresetLibrary = {
  presets: BUILTIN_DESIGN_PRESETS,
  defaultId: DEFAULT_DESIGN_PRESET_ID,
};

export function isBuiltinDesignPreset(id: string) {
  return BUILTIN_DESIGN_PRESETS.some((row) => row.id === id);
}

export function defaultInnerParams(kind: InnerKind): InnerParams {
  const preset = BUILTIN_DESIGN_PRESETS.find((row) => row.id === DEFAULT_DESIGN_PRESET_ID)!;
  return { ...preset[kind] };
}

export function materialsFor(method: InnerMethod) {
  return INNER_MATERIALS.filter((row) => row.method === method);
}

export function materialLabel(material: InnerMaterial) {
  return INNER_MATERIALS.find((row) => row.id === material)?.label ?? material;
}

export function methodLabel(method: InnerMethod) {
  return INNER_METHODS.find((row) => row.id === method)?.label ?? method;
}

/** 재료 한 줄 표시. 방식은 재료에 묶여 있다. */
export function methodMaterialLabel(material: InnerMaterial) {
  const row = INNER_MATERIALS.find((item) => item.id === material);
  if (!row) return material;
  return `${methodLabel(row.method)} · ${row.label}`;
}

export function clampInnerNumber(key: InnerNumberKey, value: number) {
  const field = INNER_FIELDS.find((row) => row.key === key)!;
  if (!Number.isFinite(value)) return field.min;
  return Math.round(Math.min(field.max, Math.max(field.min, value)) * 1000) / 1000;
}

/** 방식이 바뀌면 재료를 그 방식 첫 재료로, 프린트는 툴 반지름 0. */
export function withMethod<T extends Pick<InnerParams, "method" | "material" | "toolRadiusMm">>(
  row: T,
  method: InnerMethod,
): T {
  const materials = materialsFor(method);
  const material = materials.some((item) => item.id === row.material)
    ? row.material
    : materials[0]!.id;
  const fallback = defaultInnerParams("crown").toolRadiusMm;
  return {
    ...row,
    method,
    material,
    toolRadiusMm: method === "print" ? 0 : row.toolRadiusMm || fallback,
  };
}

/** 재료를 고르면 그 재료의 가공 방식도 같이 맞춘다. */
export function withMaterial<T extends Pick<InnerParams, "method" | "material" | "toolRadiusMm">>(
  row: T,
  material: InnerMaterial,
): T {
  const method = INNER_MATERIALS.find((item) => item.id === material)?.method ?? row.method;
  return withMethod({ ...row, material }, method);
}

export function normalizeInnerParams(raw: unknown, fallback: InnerParams): InnerParams {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const row = raw as Partial<InnerParams>;
  const method: InnerMethod = row.method === "print" || row.method === "milling" ? row.method : fallback.method;
  const material = INNER_MATERIALS.some((item) => item.id === row.material)
    ? (row.material as InnerMaterial)
    : fallback.material;
  const out = { ...fallback, method, material } as InnerParams;
  for (const field of INNER_FIELDS) {
    const value = Number(row[field.key]);
    out[field.key] = Number.isFinite(value) ? clampInnerNumber(field.key, value) : fallback[field.key];
  }
  if (!materialsFor(method).some((item) => item.id === out.material)) {
    out.material = materialsFor(method)[0]!.id;
  }
  if (method === "print") out.toolRadiusMm = 0;
  return out;
}

function normalizePreset(raw: unknown, fallback: DesignPreset): DesignPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<DesignPreset>;
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    clinicName: String(row.clinicName || "").trim(),
    crown: normalizeInnerParams(row.crown, fallback.crown),
    cavity: normalizeInnerParams(row.cavity, fallback.cavity),
    implant: normalizeInnerParams(row.implant, fallback.implant),
  };
}

/** 서버 목록. 비었으면 기본 프리셋, 빠진 기본 프리셋은 앞에 다시 넣는다. */
export function normalizeDesignPresetLibrary(raw: unknown): DesignPresetLibrary {
  const row = (raw && typeof raw === "object" ? raw : {}) as {
    presets?: unknown;
    defaultId?: unknown;
  };
  const fallback = BUILTIN_DESIGN_PRESETS.find((item) => item.id === DEFAULT_DESIGN_PRESET_ID)!;
  const stored: DesignPreset[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(row.presets) ? row.presets : []) {
    const id = String((item as { id?: unknown })?.id || "");
    const builtin = BUILTIN_DESIGN_PRESETS.find((preset) => preset.id === id);
    const preset = normalizePreset(item, builtin ?? fallback);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    stored.push(preset);
  }
  if (stored.length === 0) return BUILTIN_DESIGN_LIBRARY;
  const missing = BUILTIN_DESIGN_PRESETS.filter((preset) => !seen.has(preset.id));
  const presets = [...missing, ...stored];
  const wanted = String(row.defaultId || "");
  return {
    presets,
    defaultId: presets.some((preset) => preset.id === wanted) ? wanted : DEFAULT_DESIGN_PRESET_ID,
  };
}

/** 치과에 연결된 프리셋이 있으면 그것, 없으면 기본 프리셋. */
export function casePresetId(library: DesignPresetLibrary, clinicName: string | null | undefined) {
  const clinic = String(clinicName || "").trim();
  if (clinic) {
    const linked = library.presets.find((preset) => preset.clinicName === clinic);
    if (linked) return linked.id;
  }
  return library.defaultId;
}

export function findDesignPreset(library: DesignPresetLibrary, id: string | null | undefined) {
  if (!id) return null;
  return library.presets.find((preset) => preset.id === id) ?? null;
}

/** 프리셋 열. 임플란트 크라운 → 임플란트, 인레이·온레이 → 인레이온레이, 나머지 → 크라운. */
export function innerKindOf(
  edit: { implant: { on: boolean }; pontic: { on: boolean } },
  cavityKind: "inlay" | "onlay" | null,
): InnerKind {
  if (edit.implant.on) return "implant";
  if (cavityKind && !edit.pontic.on) return "cavity";
  return "crown";
}

export function newDesignPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 목록에 없는 새 이름. 「프리셋 1」부터. */
export function nextDesignPresetName(presets: readonly DesignPreset[]) {
  const names = new Set(presets.map((preset) => preset.name));
  let index = 1;
  while (names.has(`프리셋 ${index}`)) index += 1;
  return `프리셋 ${index}`;
}
