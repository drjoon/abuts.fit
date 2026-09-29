// 기공소 AI 디자인 — 칼라맵. 간섭(대합·인접), 두께, 내면 간격을 한 색 막대로 본다.
// 값은 mm 「목표 대비 차이」다. 0이 목표(초록), 마이너스는 부족·겹침(빨강), 플러스는 여유(파랑).
// related files:
// - web/frontend/src/shared/components/practice/labProsthesisEditLayer.ts
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

export type ColorMapMode = "contact" | "thickness" | "fit";

export const COLOR_MAP_MODES: Array<{ id: ColorMapMode; label: string; hint: string }> = [
  {
    id: "contact",
    label: "간섭",
    hint: "대합·인접과의 거리에서 목표 간격을 뺀 값입니다. 빨강은 목표보다 가깝거나 겹칩니다.",
  },
  {
    id: "thickness",
    label: "두께",
    hint: "보철 벽 두께에서 최소 두께를 뺀 값입니다. 빨강은 최소보다 얇습니다.",
  },
  {
    id: "fit",
    label: "내면",
    hint: "내면과 지대치 사이 간격에서 설계 간격을 뺀 값입니다. 빨강은 지대치와 겹치고 파랑은 설계보다 뜹니다.",
  },
];

/** 범위 프리셋. 색 막대는 −값에서 +값까지다. */
export const COLOR_MAP_RANGES_MM = [0.1, 0.25, 0.5, 1] as const;
export const COLOR_MAP_HALF_MIN_MM = 0.02;
export const COLOR_MAP_HALF_MAX_MM = 2;

export type ColorMapState = {
  on: boolean;
  mode: ColorMapMode;
  /** 모드마다 색 막대 한쪽 길이(mm). */
  half: Record<ColorMapMode, number>;
};

export const DEFAULT_COLOR_MAP: ColorMapState = {
  on: false,
  mode: "contact",
  half: { contact: 0.5, thickness: 0.5, fit: 0.1 },
};

export function clampColorMapHalf(mm: number, fallback: number): number {
  if (!Number.isFinite(mm)) return fallback;
  const clamped = Math.min(COLOR_MAP_HALF_MAX_MM, Math.max(COLOR_MAP_HALF_MIN_MM, mm));
  return Math.round(clamped * 1000) / 1000;
}

export function parseColorMapState(value: unknown): ColorMapState {
  if (!value || typeof value !== "object") return DEFAULT_COLOR_MAP;
  const row = value as {
    on?: unknown;
    mode?: unknown;
    half?: Partial<Record<ColorMapMode, unknown>> | null;
  };
  const mode: ColorMapMode =
    row.mode === "thickness" || row.mode === "fit" || row.mode === "contact"
      ? row.mode
      : DEFAULT_COLOR_MAP.mode;
  const half = { ...DEFAULT_COLOR_MAP.half };
  for (const key of Object.keys(half) as ColorMapMode[]) {
    half[key] = clampColorMapHalf(Number(row.half?.[key]), half[key]);
  }
  return { on: Boolean(row.on), mode, half };
}

const STOPS: Array<[number, [number, number, number]]> = [
  [0, [0.86, 0.15, 0.15]],
  [0.25, [0.96, 0.78, 0.18]],
  [0.5, [0.2, 0.78, 0.35]],
  [0.75, [0.16, 0.74, 0.86]],
  [1, [0.15, 0.3, 0.86]],
];

/** −half 빨강 → 0 초록 → +half 파랑. 값이 없으면 null. 범위 밖은 끝 색으로 둔다. */
export function colorMapRgb(
  deltaMm: number | null | undefined,
  half: number,
): [number, number, number] | null {
  if (deltaMm == null || !Number.isFinite(deltaMm) || !(half > 0)) return null;
  const t = Math.min(1, Math.max(0, (deltaMm + half) / (half * 2)));
  for (let index = 1; index < STOPS.length; index += 1) {
    const [t1, c1] = STOPS[index]!;
    const [t0, c0] = STOPS[index - 1]!;
    if (t <= t1) {
      const u = (t - t0) / Math.max(t1 - t0, 1e-6);
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      ];
    }
  }
  return STOPS[STOPS.length - 1]![1];
}

function stopCss(rgb: [number, number, number]) {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(rgb[0])} ${channel(rgb[1])} ${channel(rgb[2])})`;
}

/** 범례 막대. 정점 색과 같은 구간이다. */
export function colorMapGradientCss(): string {
  return `linear-gradient(90deg, ${STOPS.map(
    ([t, rgb]) => `${stopCss(rgb)} ${Math.round(t * 100)}%`,
  ).join(", ")})`;
}

/** 범례 숫자. 0.5 → 0.5, 0.25 → 0.25. */
export function formatColorMapMm(mm: number): string {
  return Number(mm.toFixed(3)).toString();
}

/** 정점마다 잰 값과 그 목표. 색은 (값 − 목표)로 칠하고, 마우스 값은 값 그대로 보인다. */
export type ColorMapValues = Record<
  ColorMapMode,
  { value: Float32Array; ref: Float32Array }
>;

export function emptyColorMapValues(count: number): ColorMapValues {
  const make = () => ({
    value: new Float32Array(count).fill(Number.NaN),
    ref: new Float32Array(count),
  });
  return { contact: make(), thickness: make(), fit: make() };
}

/** 정점 색을 칠한다. 값이 없는 정점은 base 색을 둔다. */
export function paintColorMap(
  out: Float32Array,
  values: ColorMapValues,
  mode: ColorMapMode,
  half: number,
): void {
  const { value, ref } = values[mode];
  for (let i = 0; i < value.length; i += 1) {
    const rgb = colorMapRgb(value[i]! - ref[i]!, half);
    if (!rgb) continue;
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
}
