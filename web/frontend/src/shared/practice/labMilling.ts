// 기공소 AI 디자인 — 밀링. 보철을 98.5mm 디스크에 배치하고 디스크 좌표 STL로 낸다.
// 공구 경로는 기공소 CAM이 계산한다. 여기서는 방향·배치·핀·검사·좌표 변환만 한다.
// 디스크 좌표: 원점은 디스크 중심, z=0은 두께 가운데, +Z는 보철 교합 방향(삽입축).
// related files:
// - web/frontend/src/shared/components/practice/LabMillingStage.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/practice/labProsthesisWorkDraft.ts

import * as THREE from "three";

import type { InnerMaterial } from "@/shared/practice/labDesignPresets";

export const MILLING_DISC_DIAMETER_MM = 98.5;
export const MILLING_DISC_THICKNESSES_MM = [10, 12, 14, 16, 18, 20, 22, 25] as const;
/** 두께 위·아래에 남기는 소재. 권장 두께는 보철 높이에 양쪽을 더한다. */
export const MILLING_SKIN_MM = 1;

export type MillingDiscMaterial = "zirconia" | "pmma" | "wax";

export const MILLING_DISC_MATERIALS: Array<{ id: MillingDiscMaterial; label: string }> = [
  { id: "zirconia", label: "지르코니아" },
  { id: "pmma", label: "PMMA" },
  { id: "wax", label: "왁스" },
];

export const MILLING_RANGES = {
  gapMm: { min: 2, max: 6, step: 0.5 },
  edgeMm: { min: 2, max: 8, step: 0.5 },
  pinCount: { min: 0, max: 4, step: 1 },
  pinDiameterMm: { min: 1, max: 3, step: 0.1 },
  pinLengthMm: { min: 1, max: 5, step: 0.5 },
  shrinkFactor: { min: 1, max: 1.35 },
} as const;

export type MillingSettings = {
  /** null이면 보철 내면 프리셋 재료를 따른다. */
  material: MillingDiscMaterial | null;
  /** null이면 권장 두께. */
  thicknessMm: number | null;
  /** 보철 사이 간격. 공구가 지나갈 폭. */
  gapMm: number;
  /** 디스크 가장자리(홀더)에 남기는 폭. */
  edgeMm: number;
  pinCount: number;
  pinDiameterMm: number;
  pinLengthMm: number;
  /** 핀을 보철과 합쳐 STL에 넣는다. 끄면 핀 위치는 배치 파일에만 남긴다. */
  pinsInStl: boolean;
  /** 디스크 라벨의 소결 배율. 모르면 null. */
  shrinkFactor: number | null;
  /** 배율을 STL 좌표에 곱한다. CAM이 적용하면 끈다. */
  applyShrink: boolean;
};

export const DEFAULT_MILLING_SETTINGS: MillingSettings = {
  material: null,
  thicknessMm: null,
  gapMm: 3,
  edgeMm: 4,
  pinCount: 2,
  pinDiameterMm: 2,
  pinLengthMm: 3,
  pinsInStl: false,
  shrinkFactor: null,
  applyShrink: false,
};

export type MillingPlacement = {
  x: number;
  y: number;
  z: number;
  rotDeg: number;
  /** 이 디스크에서 뺐다. */
  excluded: boolean;
};

export type MillingDocument = {
  settings: MillingSettings;
  /** 내보내기 행 id(`tooth:16`, `bridge:14,15,16`) → 배치. */
  placements: Record<string, MillingPlacement>;
};

export const EMPTY_MILLING_DOCUMENT: MillingDocument = {
  settings: DEFAULT_MILLING_SETTINGS,
  placements: {},
};

function clampNum(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseMillingSettings(value: unknown): MillingSettings {
  const row = (value && typeof value === "object" ? value : {}) as Partial<MillingSettings>;
  const d = DEFAULT_MILLING_SETTINGS;
  const r = MILLING_RANGES;
  const material = MILLING_DISC_MATERIALS.some((m) => m.id === row.material)
    ? (row.material as MillingDiscMaterial)
    : null;
  const thickness = MILLING_DISC_THICKNESSES_MM.find((t) => t === Number(row.thicknessMm)) ?? null;
  const shrink = Number(row.shrinkFactor);
  const shrinkFactor =
    row.shrinkFactor != null &&
    Number.isFinite(shrink) &&
    shrink >= r.shrinkFactor.min &&
    shrink <= r.shrinkFactor.max
      ? shrink
      : null;
  return {
    material,
    thicknessMm: thickness,
    gapMm: clampNum(row.gapMm, r.gapMm.min, r.gapMm.max, d.gapMm),
    edgeMm: clampNum(row.edgeMm, r.edgeMm.min, r.edgeMm.max, d.edgeMm),
    pinCount: Math.round(clampNum(row.pinCount, r.pinCount.min, r.pinCount.max, d.pinCount)),
    pinDiameterMm: clampNum(
      row.pinDiameterMm,
      r.pinDiameterMm.min,
      r.pinDiameterMm.max,
      d.pinDiameterMm,
    ),
    pinLengthMm: clampNum(row.pinLengthMm, r.pinLengthMm.min, r.pinLengthMm.max, d.pinLengthMm),
    pinsInStl: Boolean(row.pinsInStl),
    shrinkFactor,
    applyShrink: shrinkFactor != null && Boolean(row.applyShrink),
  };
}

export function parseMillingDocument(value: unknown): MillingDocument {
  if (!value || typeof value !== "object") return EMPTY_MILLING_DOCUMENT;
  const row = value as { settings?: unknown; placements?: unknown };
  const placements: Record<string, MillingPlacement> = {};
  if (row.placements && typeof row.placements === "object" && !Array.isArray(row.placements)) {
    for (const [id, raw] of Object.entries(row.placements as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Partial<MillingPlacement>;
      const x = Number(p.x);
      const y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      placements[id] = {
        x,
        y,
        z: Number(p.z) || 0,
        rotDeg: normalizeDeg(Number(p.rotDeg) || 0),
        excluded: Boolean(p.excluded),
      };
    }
  }
  return { settings: parseMillingSettings(row.settings), placements };
}

export function normalizeDeg(deg: number) {
  let out = deg % 360;
  if (out > 180) out -= 360;
  if (out <= -180) out += 360;
  return out;
}

/** 내면 프리셋 재료 → 디스크 재료. 글라스 세라믹·레진은 디스크가 없다. */
export function discMaterialOf(material: InnerMaterial | null | undefined): MillingDiscMaterial | null {
  if (material === "zirconia") return "zirconia";
  if (material === "pmma") return "pmma";
  return null;
}

export function millingDiscMaterialLabel(id: MillingDiscMaterial) {
  return MILLING_DISC_MATERIALS.find((row) => row.id === id)?.label ?? id;
}

// ─── 형상 ─────────────────────────────────────────────

export type Vec2 = { x: number; y: number };

export type MillingPin = {
  start: [number, number, number];
  end: [number, number, number];
};

export type MillingPart = {
  id: string;
  label: string;
  fileName: string;
  /** 삽입축을 +Z로, 긴 방향을 X로 돌리고 상자 중심을 원점에 둔 mm 삼각형. */
  local: Float32Array;
  heightMm: number;
  /** 로컬 XY 외곽을 감싸는 볼록 다각형. */
  outline: Vec2[];
  xMin: number;
  xMax: number;
  /** 삽입축이 없어 스캔 위쪽으로 세웠다. */
  axisGuessed: boolean;
};

const OUTLINE_DIRECTIONS = 24;

/**
 * 삽입축(교합 방향)을 +Z로 세우고, 교합면에서 본 긴 방향을 X로 돌린다.
 * axis가 없으면 스캔 +Z를 쓴다.
 */
export function orientMillingPart(input: {
  id: string;
  label: string;
  fileName: string;
  positions: Float32Array;
  axis: [number, number, number] | null;
}): MillingPart | null {
  const src = input.positions;
  if (src.length < 9) return null;
  const axis = new THREE.Vector3(...(input.axis ?? [0, 0, 1]));
  if (axis.lengthSq() < 1e-9) axis.set(0, 0, 1);
  axis.normalize();
  const toZ = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 0, 1));
  const out = new Float32Array(src.length);
  const v = new THREE.Vector3();
  for (let i = 0; i < src.length; i += 3) {
    v.set(src[i]!, src[i + 1]!, src[i + 2]!).applyQuaternion(toZ);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  // 교합면에서 본 주축(2차 모멘트)을 X로.
  let mx = 0;
  let my = 0;
  const n = out.length / 3;
  for (let i = 0; i < out.length; i += 3) {
    mx += out[i]!;
    my += out[i + 1]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < out.length; i += 3) {
    const dx = out[i]! - mx;
    const dy = out[i + 1]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i]!;
    const y = out[i + 1]!;
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    out[i] = rx;
    out[i + 1] = ry;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
    minZ = Math.min(minZ, out[i + 2]!);
    maxZ = Math.max(maxZ, out[i + 2]!);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= cx;
    out[i + 1] -= cy;
    out[i + 2] -= cz;
  }
  return {
    id: input.id,
    label: input.label,
    fileName: input.fileName,
    local: out,
    heightMm: maxZ - minZ,
    outline: supportOutline(out, []),
    xMin: minX - cx,
    xMax: maxX - cx,
    axisGuessed: input.axis == null,
  };
}

/**
 * 방향마다 가장 먼 점으로 지지선을 긋고 이웃 지지선의 교점으로 다각형을 만든다.
 * 실제 외곽을 항상 감싼다(보수적).
 */
function supportOutline(local: Float32Array, extra: readonly Vec2[]): Vec2[] {
  const dirs: Vec2[] = [];
  for (let k = 0; k < OUTLINE_DIRECTIONS; k += 1) {
    const a = (k / OUTLINE_DIRECTIONS) * Math.PI * 2;
    dirs.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  const h = dirs.map(() => -Infinity);
  const visit = (x: number, y: number) => {
    for (let k = 0; k < dirs.length; k += 1) {
      const d = x * dirs[k]!.x + y * dirs[k]!.y;
      if (d > h[k]!) h[k] = d;
    }
  };
  for (let i = 0; i < local.length; i += 3) visit(local[i]!, local[i + 1]!);
  for (const p of extra) visit(p.x, p.y);
  const out: Vec2[] = [];
  for (let k = 0; k < dirs.length; k += 1) {
    const a = dirs[k]!;
    const b = dirs[(k + 1) % dirs.length]!;
    const ha = h[k]!;
    const hb = h[(k + 1) % dirs.length]!;
    const det = a.x * b.y - a.y * b.x;
    out.push({ x: (ha * b.y - hb * a.y) / det, y: (a.x * hb - b.x * ha) / det });
  }
  return out;
}

/**
 * 협측·설측(±Y)에 핀을 나눠 둔다. 한쪽에 여러 개면 긴 방향(X)으로 고르게 벌린다.
 * 핀은 보철 표면 안쪽 0.8mm에서 시작해 바깥으로 lengthMm 나간다.
 */
export function millingPins(part: MillingPart, settings: MillingSettings): MillingPin[] {
  const count = settings.pinCount;
  if (count <= 0) return [];
  const pins: MillingPin[] = [];
  const perSide = [Math.ceil(count / 2), Math.floor(count / 2)];
  const span = part.xMax - part.xMin;
  const local = part.local;
  for (const [sideIndex, side] of [1, -1].entries()) {
    const m = perSide[sideIndex]!;
    for (let k = 0; k < m; k += 1) {
      const xa = part.xMin + span * ((k + 1) / (m + 1));
      let reach = -Infinity;
      for (const band of [1, 2, 4, Infinity]) {
        for (let i = 0; i < local.length; i += 3) {
          if (Math.abs(local[i]! - xa) > band || Math.abs(local[i + 2]!) > band) continue;
          const y = local[i + 1]! * side;
          if (y > reach) reach = y;
        }
        if (reach > 0) break;
      }
      if (!(reach > 0)) continue;
      pins.push({
        start: [xa, side * Math.max(0, reach - 0.8), 0],
        end: [xa, side * (reach + settings.pinLengthMm), 0],
      });
    }
  }
  return pins;
}

/** 핀 끝까지 포함한 로컬 외곽. */
export function millingOutline(part: MillingPart, pins: readonly MillingPin[], pinRadius: number) {
  if (pins.length === 0) return part.outline;
  const extra: Vec2[] = [];
  for (const pin of pins) {
    const [x, y] = pin.end;
    extra.push(
      { x: x + pinRadius, y },
      { x: x - pinRadius, y },
      { x, y: y + Math.sign(y) * pinRadius },
    );
  }
  const flat = new Float32Array(part.outline.length * 3);
  part.outline.forEach((p, i) => {
    flat[i * 3] = p.x;
    flat[i * 3 + 1] = p.y;
  });
  return supportOutline(flat, extra);
}

function placeOutline(outline: readonly Vec2[], p: Pick<MillingPlacement, "x" | "y" | "rotDeg">) {
  const a = (p.rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return outline.map((q) => ({ x: q.x * c - q.y * s + p.x, y: q.x * s + q.y * c + p.y }));
}

function outlineRadius(outline: readonly Vec2[]) {
  let r = 0;
  for (const p of outline) r = Math.max(r, Math.hypot(p.x, p.y));
  return r;
}

/** 원점에서 가장 가까운 변까지. 이 원은 외곽 안에 있어서 두 원이 간격보다 가까우면 외곽도 가깝다. */
function outlineInnerRadius(outline: readonly Vec2[]) {
  let r = Infinity;
  for (let i = 0; i < outline.length; i += 1) {
    r = Math.min(r, pointSegment({ x: 0, y: 0 }, outline[i]!, outline[(i + 1) % outline.length]!));
  }
  return Number.isFinite(r) ? r : 0;
}

function convexOverlap(a: readonly Vec2[], b: readonly Vec2[]) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let aMin = Infinity;
      let aMax = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}

function pointSegment(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function outlineDistance(a: readonly Vec2[], b: readonly Vec2[]) {
  if (convexOverlap(a, b)) return 0;
  let best = Infinity;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const v of p) {
      for (let i = 0; i < q.length; i += 1) {
        best = Math.min(best, pointSegment(v, q[i]!, q[(i + 1) % q.length]!));
      }
    }
  }
  return best;
}

export function usableRadiusMm(settings: MillingSettings) {
  return MILLING_DISC_DIAMETER_MM / 2 - settings.edgeMm;
}

/** 모든 보철을 담는 가장 얇은 디스크. 없으면 null. */
export function recommendedThicknessMm(parts: readonly MillingPart[]): number | null {
  const tallest = parts.reduce((max, part) => Math.max(max, part.heightMm), 0);
  return (
    MILLING_DISC_THICKNESSES_MM.find((t) => t >= tallest + MILLING_SKIN_MM * 2) ?? null
  );
}

/** 보철 가운데를 둘 수 있는 z 범위(절댓값). 음수면 두께가 모자란다. */
export function zLimitMm(part: MillingPart, thicknessMm: number) {
  return thicknessMm / 2 - MILLING_SKIN_MM - part.heightMm / 2;
}

export type MillingIssue = "outside" | "tight" | "thick";

export const MILLING_ISSUE_LABEL: Record<MillingIssue, string> = {
  outside: "디스크 밖",
  tight: "간격 부족",
  thick: "두께 초과",
};

export type MillingShape = {
  part: MillingPart;
  outline: Vec2[];
  pins: MillingPin[];
};

export function millingShapes(parts: readonly MillingPart[], settings: MillingSettings) {
  return parts.map((part): MillingShape => {
    const pins = millingPins(part, settings);
    return { part, pins, outline: millingOutline(part, pins, settings.pinDiameterMm / 2) };
  });
}

export function millingIssues(
  shapes: readonly MillingShape[],
  placements: Readonly<Record<string, MillingPlacement>>,
  settings: MillingSettings,
  thicknessMm: number,
): Map<string, MillingIssue[]> {
  const radius = usableRadiusMm(settings);
  const placed = shapes.flatMap((shape) => {
    const p = placements[shape.part.id];
    if (!p || p.excluded) return [];
    return [{ shape, p, poly: placeOutline(shape.outline, p) }];
  });
  const out = new Map<string, MillingIssue[]>();
  const add = (id: string, issue: MillingIssue) => {
    const list = out.get(id) ?? [];
    if (!list.includes(issue)) list.push(issue);
    out.set(id, list);
  };
  for (const row of placed) {
    if (row.poly.some((v) => Math.hypot(v.x, v.y) > radius + 1e-6)) add(row.shape.part.id, "outside");
    if (Math.abs(row.p.z) > zLimitMm(row.shape.part, thicknessMm) + 1e-6) {
      add(row.shape.part.id, "thick");
    }
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (outlineDistance(a.poly, b.poly) < settings.gapMm - 1e-6) {
        add(a.shape.part.id, "tight");
        add(b.shape.part.id, "tight");
      }
    }
  }
  return out;
}

const NEST_STEP_MM = 1;
const NEST_ROTATIONS = Array.from({ length: 12 }, (_, i) => i * 15 - 90);

/**
 * 위쪽 가장자리부터 줄마다 왼쪽→오른쪽으로 훑어 처음 들어가는 자리에 둔다.
 * fixed는 그대로 두고 장애물로만 쓴다. 넣지 못한 보철 id를 돌려준다.
 */
export function autoNest(
  shapes: readonly MillingShape[],
  fixed: Readonly<Record<string, MillingPlacement>>,
  settings: MillingSettings,
): { placements: Record<string, MillingPlacement>; unplaced: string[] } {
  const radius = usableRadiusMm(settings);
  const gap = settings.gapMm;
  const obstacles: Array<{ poly: Vec2[]; cx: number; cy: number; r: number }> = [];
  const placements: Record<string, MillingPlacement> = {};
  const todo: MillingShape[] = [];
  const obstacleOf = (shape: MillingShape, p: MillingPlacement) => ({
    poly: placeOutline(shape.outline, p),
    cx: p.x,
    cy: p.y,
    r: outlineRadius(shape.outline),
    rIn: outlineInnerRadius(shape.outline),
  });
  for (const shape of shapes) {
    const p = fixed[shape.part.id];
    if (p && !p.excluded) obstacles.push(obstacleOf(shape, p));
    else todo.push(shape);
  }
  todo.sort((a, b) => outlineRadius(b.outline) - outlineRadius(a.outline));
  const unplaced: string[] = [];
  // 같은 외곽이 이미 못 들어갔으면 다시 훑지 않는다. 장애물은 늘기만 한다.
  const failed = new Set<string>();
  const r2 = radius * radius;
  let lastClash = 0;
  for (const shape of todo) {
    const signature = shape.outline.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(";");
    if (failed.has(signature)) {
      unplaced.push(shape.part.id);
      continue;
    }
    const r = outlineRadius(shape.outline);
    const rIn = outlineInnerRadius(shape.outline);
    let best: MillingPlacement | null = null;
    for (const rotDeg of NEST_ROTATIONS) {
      const rotated = placeOutline(shape.outline, { x: 0, y: 0, rotDeg });
      let found: MillingPlacement | null = null;
      for (let y = radius; y >= -radius && !found; y -= NEST_STEP_MM) {
        if (best && y < best.y) break;
        const half = Math.sqrt(Math.max(0, r2 - y * y));
        for (let x = -half; x <= half; x += NEST_STEP_MM) {
          let inside = true;
          for (const v of rotated) {
            const vx = v.x + x;
            const vy = v.y + y;
            if (vx * vx + vy * vy > r2) {
              inside = false;
              break;
            }
          }
          if (!inside) continue;
          let clash = false;
          let poly: Vec2[] | null = null;
          for (let k = 0; k < obstacles.length; k += 1) {
            const index = (k + lastClash) % obstacles.length;
            const o = obstacles[index]!;
            const d = Math.hypot(o.cx - x, o.cy - y);
            if (d >= o.r + r + gap) continue;
            const core = o.rIn + rIn + gap;
            if (d < core) {
              // 안쪽 원끼리 겹치는 동안은 건너뛴다.
              const dy = y - o.cy;
              x = Math.max(x, o.cx + Math.sqrt(Math.max(0, core * core - dy * dy)) - NEST_STEP_MM);
              clash = true;
              lastClash = index;
              break;
            }
            poly ??= rotated.map((v) => ({ x: v.x + x, y: v.y + y }));
            if (outlineDistance(o.poly, poly) < gap) {
              clash = true;
              lastClash = index;
              break;
            }
          }
          if (clash) continue;
          found = { x, y, z: 0, rotDeg, excluded: false };
          break;
        }
      }
      if (found && (!best || found.y > best.y || (found.y === best.y && found.x < best.x))) {
        best = found;
      }
    }
    if (!best) {
      failed.add(signature);
      unplaced.push(shape.part.id);
      continue;
    }
    placements[shape.part.id] = best;
    obstacles.push(obstacleOf(shape, best));
  }
  return { placements, unplaced };
}

// ─── 내보내기 ─────────────────────────────────────────

function placeInto(
  out: Float32Array,
  src: Float32Array,
  p: MillingPlacement,
  scale: number,
) {
  const a = (p.rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    out[i] = (x * c - y * s + p.x) * scale;
    out[i + 1] = (x * s + y * c + p.y) * scale;
    out[i + 2] = (src[i + 2]! + p.z) * scale;
  }
  return out;
}

/** 로컬 삼각형을 디스크 좌표로. scale은 소결 배율(디스크 중심 기준). */
export function placedTriangles(src: Float32Array, p: MillingPlacement, scale = 1) {
  return placeInto(new Float32Array(src.length), src, p, scale);
}

/** 닫힌 원기둥. 바깥 법선이 반시계. */
export function cylinderTriangles(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  radius: number,
  segments = 16,
): Float32Array {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const axis = b.clone().sub(a).normalize();
  const helper = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const ring = (center: THREE.Vector3) =>
    Array.from({ length: segments }, (_, k) => {
      const t = (k / segments) * Math.PI * 2;
      return center
        .clone()
        .addScaledVector(u, Math.cos(t) * radius)
        .addScaledVector(w, Math.sin(t) * radius);
    });
  const ra = ring(a);
  const rb = ring(b);
  const tris: number[] = [];
  const push = (...vs: THREE.Vector3[]) => {
    for (const v of vs) tris.push(v.x, v.y, v.z);
  };
  for (let k = 0; k < segments; k += 1) {
    const n = (k + 1) % segments;
    push(ra[k]!, ra[n]!, rb[n]!);
    push(ra[k]!, rb[n]!, rb[k]!);
    push(a, ra[n]!, ra[k]!);
    push(b, rb[k]!, rb[n]!);
  }
  return Float32Array.from(tris);
}

export type MillingJobItem = {
  id: string;
  label: string;
  fileName: string;
  placement: MillingPlacement;
  heightMm: number;
  pins: MillingPin[];
};

/** CAM에 옮겨 적을 배치 기록. 좌표는 STL과 같은 디스크 좌표(배율 적용 여부 포함). */
export function millingJobJson(input: {
  caseName: string;
  material: MillingDiscMaterial;
  thicknessMm: number;
  settings: MillingSettings;
  items: readonly MillingJobItem[];
}) {
  const scale = input.settings.applyShrink ? (input.settings.shrinkFactor ?? 1) : 1;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const vec = (v: readonly number[]) => v.map((n) => round(n * scale));
  return JSON.stringify(
    {
      case: input.caseName,
      disc: {
        diameterMm: MILLING_DISC_DIAMETER_MM,
        thicknessMm: input.thicknessMm,
        material: input.material,
      },
      coordinates: "origin=disc center, z=0 at mid-thickness, +Z=occlusal (insertion axis), mm",
      shrinkFactor: input.settings.shrinkFactor,
      shrinkApplied: input.settings.applyShrink,
      gapMm: input.settings.gapMm,
      edgeMm: input.settings.edgeMm,
      pins: {
        diameterMm: input.settings.pinDiameterMm,
        lengthMm: input.settings.pinLengthMm,
        inStl: input.settings.pinsInStl,
      },
      items: input.items.map((item) => {
        const a = (item.placement.rotDeg * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const place = (v: readonly [number, number, number]) =>
          vec([
            v[0] * c - v[1] * s + item.placement.x,
            v[0] * s + v[1] * c + item.placement.y,
            v[2] + item.placement.z,
          ]);
        return {
          label: item.label,
          file: item.fileName,
          centerMm: vec([item.placement.x, item.placement.y, item.placement.z]),
          rotationZDeg: round(item.placement.rotDeg),
          heightMm: round(item.heightMm),
          pins: item.pins.map((pin) => ({ start: place(pin.start), end: place(pin.end) })),
        };
      }),
    },
    null,
    2,
  );
}
