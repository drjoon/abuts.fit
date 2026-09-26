// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 수정값.

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

export type InnerPresetId = "zirconia" | "glass" | "pmma" | "custom";

export type ConnectorShape = "inverted" | "round" | "triangle" | "proximal";

export type CutbackRegion = "partial" | "full";

export type InnerPreset = {
  id: InnerPresetId;
  label: string;
  cementGapMm: number;
  spacerMm: number;
  marginTaperMm: number;
};

export const INNER_PRESETS: InnerPreset[] = [
  {
    id: "zirconia",
    label: "지르코니아 밀링",
    cementGapMm: 0.05,
    spacerMm: 0.08,
    marginTaperMm: 0.02,
  },
  {
    id: "glass",
    label: "글라스 세라믹",
    cementGapMm: 0.08,
    spacerMm: 0.04,
    marginTaperMm: 0.1,
  },
  {
    id: "pmma",
    label: "임시치 PMMA",
    cementGapMm: 0.12,
    spacerMm: 0.06,
    marginTaperMm: 0,
  },
  {
    id: "custom",
    label: "직접 입력",
    cementGapMm: 0.05,
    spacerMm: 0.08,
    marginTaperMm: 0.02,
  },
];

export const CONNECTOR_SHAPES: Array<{ id: ConnectorShape; label: string }> = [
  { id: "inverted", label: "역삼각" },
  { id: "round", label: "원형" },
  { id: "triangle", label: "삼각" },
  { id: "proximal", label: "인접 병합" },
];

export type ToothDesignEdit = {
  margin: {
    radii: number[];
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
};

function ones(count: number) {
  return Array.from({ length: count }, () => 1);
}

export function createToothDesignEdit(): ToothDesignEdit {
  const preset = INNER_PRESETS[0]!;
  return {
    margin: {
      radii: ones(MARGIN_POINT_COUNT),
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
      occlusalClearanceMm: 0.1,
      occlusalTrim: false,
      proximalClearanceMm: 0.05,
      proximalTrim: false,
      smooth: 0,
      minThicknessMm: 0.5,
      compensate: false,
      sculpt: [],
    },
    hook: { on: false, angle: 40, radiusMm: 0.45, lengthMm: 2.4 },
    cutback: { on: false, region: "partial", thicknessMm: 0.4, excluded: [] },
    hole: { on: false, angle: 0, tiltDeg: 8, radiusMm: 1 },
    connector: {
      shape: "round",
      transverseMm: 3.2,
      verticalMm: 2.6,
      along: 0.5,
      assembled: false,
    },
  };
}

export function marginUntouched(edit: ToothDesignEdit) {
  return (
    !edit.margin.deleted &&
    edit.margin.offsetMm === 0 &&
    edit.margin.radii.every((radius) => radius === 1)
  );
}

export function redetectMargin(edit: ToothDesignEdit): ToothDesignEdit {
  const radii = Array.from({ length: MARGIN_POINT_COUNT }, (_, index) => {
    return 0.9 + 0.08 * Math.sin(index * 1.65) + 0.03 * Math.cos(index * 0.7);
  });
  return {
    ...edit,
    margin: { ...edit.margin, radii, offsetMm: 0, deleted: false },
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
  const next = clamp(radius, 0.62, 1.45);
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
  const at = Math.min(radii.length, Math.max(0, index));
  radii.splice(at, 0, clamp(radius, 0.62, 1.45));
  return {
    ...edit,
    margin: { ...edit.margin, radii, deleted: false },
  };
}

export function applyInnerPreset(
  edit: ToothDesignEdit,
  presetId: InnerPresetId,
): ToothDesignEdit {
  const preset = INNER_PRESETS.find((row) => row.id === presetId) ?? INNER_PRESETS[0]!;
  if (presetId === "custom") {
    return { ...edit, inner: { ...edit.inner, preset: "custom", applied: false } };
  }
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
    edit.inner.cementGapMm * 0.35;
  if (edit.cutback.on) shell -= edit.cutback.thicknessMm * 0.45;
  if (edit.refine.compensate) shell = Math.max(shell, edit.refine.minThicknessMm);
  return shell;
}

export function shellIsThin(edit: ToothDesignEdit) {
  return shellThicknessMm(edit) + 1e-4 < edit.refine.minThicknessMm;
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
