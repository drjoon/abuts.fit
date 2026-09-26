// 기공소 AI 보철 — 상악·하악·바이트를 저장된 좌표 그대로 겹쳐 본다.
// - 2026-09-26: 지대치는 불투명, 대합·바이트는 투명. 기본 뷰는 화면에 맞춘다.
// - 2026-09-26: 교합면·협측·설측, 대합 접촉 색, 삽입 방향 언더컷.
// - 2026-09-26: 열릴 때 작업 치아를 교합면 중앙에 확대한다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import type { LabOralScanRole } from "@/shared/practice/labProsthesisAiDesign";
import {
  contactColorRgb,
  createScanPointIndex,
  geometryUnitsToMm,
  isUndercutAlignment,
  UNDERCUT_RGB,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import { cn } from "@/shared/ui/cn";

export type OralScanViewPreset = "fit" | "occlusal" | "buccal" | "lingual";

export type OralScanOverlayHandle = {
  setView: (preset: OralScanViewPreset) => void;
  saveImage: () => void;
};

export type OralScanOverlaySource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
  file: File;
  companionFiles?: File[] | null;
};

type Props = {
  items: OralScanOverlaySource[];
  visible: Record<string, boolean>;
  colorMapping: boolean;
  /** 0–1. 대합악·바이트에 적용. 지대치 악은 항상 불투명. */
  ghostOpacity: number;
  /** 주문 치아가 있는 악. 반대악이 대합. */
  prepArch?: "upper" | "lower" | "both" | null;
  /** 이 FDI 치아들을 교합면 화면 중앙에 확대해 연다. */
  focusToothNumbers?: readonly string[];
  /** 대합까지 거리를 색으로 칠한다. */
  contactMap?: boolean;
  /** 삽입 방향 언더컷을 붉게 칠한다. */
  undercutMap?: boolean;
  /** 교합 간격 목표(mm). */
  occlusalGapMm?: number;
  contactMode?: ContactPaintMode;
  /** 법선·삽입축 내적. 이 값보다 크면 언더컷. */
  undercutLimit?: number;
  busy?: boolean;
  busyLabel?: string;
  onScanColorChange?: (hasScanColor: boolean) => void;
  className?: string;
};

type LoadedMesh = {
  id: string;
  role: LabOralScanRole;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  hasColor: boolean;
  /** 로드 때 붙어 있던 스캔 칼라. 분석 색을 깔 때 치워 둔다. */
  scanColor: THREE.BufferAttribute | null;
  /** 기하 단위. 대합이 없으면 null. */
  dist: Float32Array | null;
  /** 법선·삽입축. 지대치가 아니면 null. */
  align: Float32Array | null;
  analysisColor: THREE.BufferAttribute | null;
};

type SnapAnim = {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
};

const ROLE_COLOR: Record<LabOralScanRole, number> = {
  upper: 0x3b82f6,
  lower: 0xe39a3c,
  bite: 0x14b8a6,
  other: 0x94a3b8,
};

const HOME_DIR = new THREE.Vector3(0.42, -1, 0.68);
const HOME_UP = new THREE.Vector3(0, 0, 1);
const FIT_MARGIN = 1.03;

type DentalFrame = {
  up: THREE.Vector3;
  anterior: THREE.Vector3;
  right: THREE.Vector3;
};

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function samplePositions(geometry: THREE.BufferGeometry, cap: number) {
  const pos = geometry.getAttribute("position");
  const out: Array<[number, number, number]> = [];
  if (!pos || pos.count === 0) return out;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

function meanVec(points: Array<[number, number, number]>): THREE.Vector3 | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return new THREE.Vector3(x / n, y / n, z / n);
}

/** 상악·하악 중심 차이와 치열 형태로 교합 축을 잡는다. 메시 상대 위치는 바꾸지 않는다. */
function estimateDentalFrame(loaded: LoadedMesh[]): DentalFrame | null {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  if (archPts.length < 30) return null;

  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mean = meanVec(archPts)!;
  let up = new THREE.Vector3();
  if (upperC && lowerC) up.subVectors(upperC, lowerC);
  if (up.lengthSq() < 1e-4) {
    up = smallestPcaAxis(archPts, mean);
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();

  const tangent = Math.abs(up.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const axisA = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const axisB = new THREE.Vector3().crossVectors(up, axisA).normalize();

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  const proj: Array<{ a: number; b: number }> = [];
  for (const p of archPts) {
    const dx = p[0] - mean.x;
    const dy = p[1] - mean.y;
    const dz = p[2] - mean.z;
    const a = dx * axisA.x + dy * axisA.y + dz * axisA.z;
    const b = dx * axisB.x + dy * axisB.y + dz * axisB.z;
    proj.push({ a, b });
    cxx += a * a;
    cxy += a * b;
    cyy += b * b;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const lAlong = cxx * ct * ct + 2 * cxy * ct * st + cyy * st * st;
  const lAcross = cxx * st * st - 2 * cxy * ct * st + cyy * ct * ct;
  let major = new THREE.Vector2(ct, st);
  let minor = new THREE.Vector2(-st, ct);
  if (lAcross > lAlong) {
    major = new THREE.Vector2(-st, ct);
    minor = new THREE.Vector2(ct, st);
  }

  const minorScores = proj.map((p) => p.a * minor.x + p.b * minor.y);
  const sorted = [...minorScores].sort((a, b) => a - b);
  const loCut = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
  const hiCut = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
  const spread = (side: "lo" | "hi") => {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < proj.length; i += 1) {
      const score = minorScores[i] ?? 0;
      if (side === "lo" ? score > loCut : score < hiCut) continue;
      const majorScore = (proj[i]?.a ?? 0) * major.x + (proj[i]?.b ?? 0) * major.y;
      sum += majorScore;
      sum2 += majorScore * majorScore;
      n += 1;
    }
    if (n < 2) return 0;
    const avg = sum / n;
    return sum2 / n - avg * avg;
  };
  const loSpread = spread("lo");
  const hiSpread = spread("hi");
  const minor3 = new THREE.Vector3()
    .addScaledVector(axisA, minor.x)
    .addScaledVector(axisB, minor.y)
    .normalize();
  // 좌우로 벌어진 쪽이 구치(원심), 모아진 쪽이 전치(협측이 바라보는 방향).
  const anterior = hiSpread < loSpread ? minor3 : minor3.negate();
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}

function smallestPcaAxis(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
): THREE.Vector3 {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const vars = [xx, yy, zz];
  let best = 0;
  if ((vars[1] ?? 0) < (vars[best] ?? 0)) best = 1;
  if ((vars[2] ?? 0) < (vars[best] ?? 0)) best = 2;
  const axis = axes[best] ?? new THREE.Vector3(0, 0, 1);
  if (xy * xy + xz * xz + yz * yz > 1) {
    const candidates = [
      new THREE.Vector3(yy + zz, -xy, -xz),
      new THREE.Vector3(-xy, xx + zz, -yz),
      new THREE.Vector3(-xz, -yz, xx + yy),
    ];
    let pick = candidates[0]!;
    let score = Infinity;
    for (const c of candidates) {
      if (c.lengthSq() < 1e-8) continue;
      const v = xx * c.x * c.x + yy * c.y * c.y + zz * c.z * c.z +
        2 * xy * c.x * c.y + 2 * xz * c.x * c.z + 2 * yz * c.y * c.z;
      if (v < score) {
        score = v;
        pick = c;
      }
    }
    if (pick.lengthSq() > 1e-8) return pick.normalize();
  }
  return axis;
}

function applyDentalFrame(frame: DentalFrame) {
  const { up, anterior } = frame;
  HOME_DIR.copy(anterior).multiplyScalar(-1).addScaledVector(up, 0.62).normalize();
  HOME_UP.copy(up);
}

type AnalysisLook = {
  contactMap: boolean;
  undercutMap: boolean;
  occlusalGapMm: number;
  contactMode: ContactPaintMode;
  undercutLimit: number;
};

function paintAnalysisColors(
  entry: LoadedMesh,
  look: AnalysisLook,
  unitToMm: number,
): boolean {
  const showContact = look.contactMap && entry.dist != null;
  const showUndercut = look.undercutMap && entry.align != null;
  if (!showContact && !showUndercut) {
    if (entry.scanColor) entry.geometry.setAttribute("color", entry.scanColor);
    else entry.geometry.deleteAttribute("color");
    return false;
  }
  const pos = entry.geometry.getAttribute("position");
  const count = pos?.count ?? 0;
  if (!count) return false;
  if (!entry.analysisColor || entry.analysisColor.count !== count) {
    entry.analysisColor = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  }
  const out = entry.analysisColor.array as Float32Array;
  const base = entry.scanColor;
  const roleHex = ROLE_COLOR[entry.role];
  const br = ((roleHex >> 16) & 255) / 255;
  const bg = ((roleHex >> 8) & 255) / 255;
  const bb = (roleHex & 255) / 255;
  for (let i = 0; i < count; i += 1) {
    let r = base ? base.getX(i) : br;
    let g = base ? base.getY(i) : bg;
    let b = base ? base.getZ(i) : bb;
    const align = entry.align?.[i] ?? 0;
    if (showUndercut && isUndercutAlignment(align, look.undercutLimit)) {
      r = UNDERCUT_RGB[0];
      g = UNDERCUT_RGB[1];
      b = UNDERCUT_RGB[2];
    } else if (showContact && entry.dist) {
      const painted = contactColorRgb(
        (entry.dist[i] ?? Infinity) * unitToMm,
        look.occlusalGapMm,
        look.contactMode,
      );
      if (painted) {
        r = painted[0];
        g = painted[1];
        b = painted[2];
      }
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  entry.analysisColor.needsUpdate = true;
  entry.geometry.setAttribute("color", entry.analysisColor);
  return true;
}

function isGhostScanRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
) {
  if (role === "bite") return true;
  if (prepArch !== "upper" && prepArch !== "lower") return false;
  return (role === "upper" || role === "lower") && role !== prepArch;
}

function insertionForRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
): THREE.Vector3 | null {
  if (!frame) return null;
  if (role === "upper" && (prepArch === "upper" || prepArch === "both")) {
    return frame.up.clone();
  }
  if (role === "lower" && (prepArch === "lower" || prepArch === "both")) {
    return frame.up.clone().negate();
  }
  return null;
}

function antagonistRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
): LabOralScanRole | null {
  if (prepArch === "upper" && role === "upper") return "lower";
  if (prepArch === "lower" && role === "lower") return "upper";
  if (prepArch === "both" && role === "upper") return "lower";
  if (prepArch === "both" && role === "lower") return "upper";
  return null;
}

async function fillDesignAnalysis(
  loaded: LoadedMesh[],
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
  unitToMm: number,
  cancelled: () => boolean,
) {
  const indexes = new Map<
    LabOralScanRole,
    ReturnType<typeof createScanPointIndex>
  >();
  for (const role of ["upper", "lower"] as const) {
    const index = createScanPointIndex(unitToMm);
    let any = false;
    for (const entry of loaded) {
      if (entry.role !== role) continue;
      const pos = entry.geometry.getAttribute("position");
      if (!pos) continue;
      const stride = Math.max(1, Math.floor(pos.count / 70000));
      for (let i = 0; i < pos.count; i += stride) {
        index.add(pos.getX(i), pos.getY(i), pos.getZ(i));
        any = true;
      }
    }
    if (any) indexes.set(role, index);
  }

  for (const entry of loaded) {
    const against = antagonistRole(entry.role, prepArch);
    const insertion = insertionForRole(entry.role, prepArch, frame);
    const index = against ? indexes.get(against) : undefined;
    const pos = entry.geometry.getAttribute("position");
    const nor = entry.geometry.getAttribute("normal");
    if (!pos || (!index && !insertion)) {
      entry.dist = null;
      entry.align = null;
      continue;
    }
    const count = pos.count;
    const dist = index ? new Float32Array(count) : null;
    const align = insertion && nor ? new Float32Array(count) : null;
    if (dist) dist.fill(Infinity);
    for (let i = 0; i < count; i += 1) {
      if ((i & 16383) === 0) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        if (cancelled()) return;
      }
      if (align && insertion && nor) {
        align[i] =
          nor.getX(i) * insertion.x +
          nor.getY(i) * insertion.y +
          nor.getZ(i) * insertion.z;
      }
      if (dist && index) {
        dist[i] = index.nearest(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
    }
    if (cancelled()) return;
    entry.dist = dist;
    entry.align = align;
  }
}

function viewBasis(viewDir: THREE.Vector3, viewUp: THREE.Vector3) {
  const dir = viewDir.clone().normalize();
  const up = viewUp.clone();
  if (Math.abs(up.dot(dir)) > 0.92) up.set(0, 0, 1);
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  return { dir, up, right, screenUp };
}

/** 정점 실루엣으로 화면에 맞춘다. 박스 모서리는 빈 공간을 포함한다. */
function measureMeshFit(
  meshes: LoadedMesh[],
  groupPosition: THREE.Vector3,
  viewDir: THREE.Vector3,
  viewUp: THREE.Vector3,
) {
  const { right, screenUp } = viewBasis(viewDir, viewUp);
  const xs: number[] = [];
  const ys: number[] = [];
  const point = new THREE.Vector3();
  for (const entry of meshes) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = pos.count > 250000 ? Math.ceil(pos.count / 250000) : 1;
    for (let i = 0; i < pos.count; i += stride) {
      point.set(
        pos.getX(i) + groupPosition.x,
        pos.getY(i) + groupPosition.y,
        pos.getZ(i) + groupPosition.z,
      );
      xs.push(point.dot(right));
      ys.push(point.dot(screenUp));
    }
  }
  if (xs.length < 8) {
    return {
      halfW: 40,
      halfH: 40,
      target: new THREE.Vector3(),
    };
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  // 떨어진 스캔 파편은 빼고 치열에 맞춘다.
  const at = (sorted: number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ?? 0;
  const minX = at(xs, 0.004);
  const maxX = at(xs, 0.996);
  const minY = at(ys, 0.004);
  const maxY = at(ys, 0.996);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    halfW: Math.max((maxX - minX) / 2, 0.5),
    halfH: Math.max((maxY - minY) / 2, 0.5),
    target: new THREE.Vector3()
      .addScaledVector(right, cx)
      .addScaledVector(screenUp, cy),
  };
}

/** 중절치에서 제2대구치 원심까지, 치아 중심이 놓이는 비율. */
const TOOTH_SPAN_T = [0, 0.075, 0.208, 0.332, 0.46, 0.584, 0.739, 0.916, 0.97];

type WorkFraming = {
  dir: THREE.Vector3;
  up: THREE.Vector3;
  halfW: number;
  halfH: number;
  target: THREE.Vector3;
};

function quantile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[i] ?? 0;
}

function angleAbsDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function parseFdi(raw: string): {
  arch: "upper" | "lower";
  side: 1 | -1;
  pos: number;
} | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const quadrant = Number(digits[0]);
  const pos = Number(digits[1]);
  return {
    arch: quadrant <= 2 ? "upper" : "lower",
    side: quadrant === 1 || quadrant === 4 ? 1 : -1,
    pos,
  };
}

function sampleWorldPoints(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  cap: number,
) {
  const out: Array<[number, number, number]> = [];
  const per = Math.max(800, Math.floor(cap / Math.max(entries.length, 1)));
  for (const entry of entries) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = Math.max(1, Math.floor(pos.count / per));
    const ox = groupPosition.x;
    const oy = groupPosition.y;
    const oz = groupPosition.z;
    for (let i = 0; i < pos.count; i += stride) {
      out.push([pos.getX(i) + ox, pos.getY(i) + oy, pos.getZ(i) + oz]);
    }
  }
  return out;
}

type PlanePoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
};

function projectArch(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  origin: THREE.Vector3,
): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (const p of points) {
    const dx = p[0] - origin.x;
    const dy = p[1] - origin.y;
    const dz = p[2] - origin.z;
    out.push({
      x: p[0],
      y: p[1],
      z: p[2],
      r: dx * frame.right.x + dy * frame.right.y + dz * frame.right.z,
      a:
        dx * frame.anterior.x +
        dy * frame.anterior.y +
        dz * frame.anterior.z,
    });
  }
  return out;
}

function archPole(plane: PlanePoint[]) {
  const rs = plane.map((p) => p.r).sort((a, b) => a - b);
  const as = plane.map((p) => p.a).sort((a, b) => a - b);
  const rLo = quantile(rs, 0.05);
  const rHi = quantile(rs, 0.95);
  const aLo = quantile(as, 0.05);
  const aHi = quantile(as, 0.95);
  const depth = Math.max(aHi - aLo, 1e-6);
  return {
    poleR: (rLo + rHi) / 2,
    poleA: aHi - depth * 0.38,
    depth,
  };
}

function horseshoeScore(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
) {
  if (points.length < 30) return 0;
  const origin = meanVec(points);
  if (!origin) return 0;
  const { poleR, poleA } = archPole(projectArch(points, frame, origin));
  const dists = projectArch(points, frame, origin).map((p) =>
    Math.hypot(p.r - poleR, p.a - poleA),
  );
  const sorted = [...dists].sort((a, b) => a - b);
  const outer = quantile(sorted, 0.9);
  if (outer < 1e-6) return 0;
  let rim = 0;
  for (const dist of dists) if (dist > outer * 0.62) rim += 1;
  return rim / dists.length;
}

/** 교합면 쪽 정점. 구개·혀 쪽 덩어리면 반대 밴드를 고른다. */
function occlusalBand(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
) {
  const heights = points.map(
    (p) => p[0] * frame.up.x + p[1] * frame.up.y + p[2] * frame.up.z,
  );
  const sorted = [...heights].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.2);
  const hi = quantile(sorted, 0.8);
  const low = points.filter((_, i) => (heights[i] ?? 0) <= lo);
  const high = points.filter((_, i) => (heights[i] ?? 0) >= hi);
  const preferLow = arch === "upper";
  const first = preferLow ? low : high;
  const second = preferLow ? high : low;
  if (horseshoeScore(second, frame) > horseshoeScore(first, frame) + 0.08) {
    return second;
  }
  return first.length >= 40 ? first : second;
}

function locateToothCenters(
  band: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
  teeth: Array<{ side: 1 | -1; pos: number }>,
) {
  if (band.length < 40 || teeth.length === 0) return [];
  const origin = meanVec(band);
  if (!origin) return [];
  const plane = projectArch(band, frame, origin);
  const { poleR, poleA, depth } = archPole(plane);
  const angled = plane.map((p) => {
    const dr = p.r - poleR;
    const da = p.a - poleA;
    return { ...p, ang: Math.atan2(dr, da), dist: Math.hypot(dr, da) };
  });
  const outer = angled.filter((p) => p.dist > depth * 0.22);
  const use = outer.length > 40 ? outer : angled;
  const rightAng = use
    .map((p) => p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  const leftAng = use
    .map((p) => -p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  let spanR = quantile(rightAng, 0.92);
  let spanL = quantile(leftAng, 0.92);
  if (spanR < 0.4) spanR = spanL;
  if (spanL < 0.4) spanL = spanR;
  if (spanR < 0.4) return [];
  const centers: THREE.Vector3[] = [];
  for (const tooth of teeth) {
    const span = tooth.side > 0 ? spanR : spanL;
    const along = TOOTH_SPAN_T[tooth.pos] ?? 0.5;
    const ang = tooth.side * Math.min(span * 0.98, along * span);
    let wedge = Math.max(0.22, span * 0.12);
    let picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    if (picked.length < 12) {
      wedge = Math.max(wedge, 0.5);
      picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    }
    if (picked.length < 8) continue;
    const heights = picked.map(
      (p) => p.x * frame.up.x + p.y * frame.up.y + p.z * frame.up.z,
    );
    const heightOrder = [...heights].sort((a, b) => a - b);
    const cuspCut =
      arch === "upper"
        ? quantile(heightOrder, 0.4)
        : quantile(heightOrder, 0.6);
    const cusps = picked.filter((_, index) =>
      arch === "upper"
        ? (heights[index] ?? 0) <= cuspCut
        : (heights[index] ?? 0) >= cuspCut,
    );
    const used = cusps.length >= 8 ? cusps : picked;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of used) {
      x += p.x;
      y += p.y;
      z += p.z;
    }
    const n = used.length;
    centers.push(new THREE.Vector3(x / n, y / n, z / n));
  }
  return centers;
}

function robustRadius(points: Array<[number, number, number]>) {
  const center = meanVec(points);
  if (!center || points.length === 0) return 1;
  const dists = points
    .map((p) => Math.hypot(p[0] - center.x, p[1] - center.y, p[2] - center.z))
    .sort((a, b) => a - b);
  return Math.max(quantile(dists, 0.9), 1e-3);
}

function occlusalCamera(frame: DentalFrame, arch: "upper" | "lower") {
  const dir = frame.up.clone();
  if (arch === "upper") dir.negate();
  const up = frame.anterior.clone();
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.copy(frame.right);
  return { dir: dir.normalize(), up: up.normalize() };
}

function pickCameraArch(
  prepArch: "upper" | "lower" | "both" | null,
  teeth: Array<{ arch: "upper" | "lower" }>,
  loaded: LoadedMesh[],
): "upper" | "lower" | null {
  const has = (role: "upper" | "lower") =>
    loaded.some((entry) => entry.role === role);
  const preferred = teeth[0]?.arch ?? prepArch;
  if (preferred === "upper" || preferred === "lower") {
    if (has(preferred)) return preferred;
  }
  if (has("upper")) return "upper";
  if (has("lower")) return "lower";
  return null;
}

/** 작업 치아를 교합면에서 화면 중앙에 확대한다. 치아를 못 잡으면 그 악 전체. */
function frameWorkOcclusal(args: {
  loaded: LoadedMesh[];
  groupPosition: THREE.Vector3;
  frame: DentalFrame;
  prepArch: "upper" | "lower" | "both" | null;
  toothNumbers: readonly string[];
}): WorkFraming | null {
  const parsed = args.toothNumbers
    .map((tooth) => parseFdi(tooth))
    .filter((row): row is NonNullable<ReturnType<typeof parseFdi>> => row != null);
  const arch = pickCameraArch(args.prepArch, parsed, args.loaded);
  if (!arch) return null;
  const meshes = args.loaded.filter((entry) => entry.role === arch);
  if (meshes.length === 0) return null;
  const world = sampleWorldPoints(meshes, args.groupPosition, 6000);
  if (world.length < 40) return null;
  const band = occlusalBand(world, args.frame, arch);
  const pose = occlusalCamera(args.frame, arch);
  const centers = locateToothCenters(
    band,
    args.frame,
    arch,
    parsed.filter((row) => row.arch === arch),
  );
  if (centers.length === 0) {
    const fit = measureMeshFit(meshes, args.groupPosition, pose.dir, pose.up);
    return {
      dir: pose.dir,
      up: pose.up,
      halfW: fit.halfW,
      halfH: fit.halfH,
      target: fit.target,
    };
  }
  const jawRadius = robustRadius(world);
  const reach = jawRadius * 0.2;
  const near: Array<[number, number, number]> = [];
  for (const point of band.length >= 24 ? band : world) {
    for (const center of centers) {
      const dx = point[0] - center.x;
      const dy = point[1] - center.y;
      const dz = point[2] - center.z;
      if (dx * dx + dy * dy + dz * dz <= reach * reach) {
        near.push(point);
        break;
      }
    }
  }
  const cloud = near.length >= 16 ? near : centers.map((c) => [c.x, c.y, c.z] as [number, number, number]);
  const target = meanVec(cloud) ?? centers[0]!.clone();
  const { right, screenUp } = viewBasis(pose.dir, pose.up);
  let maxR = jawRadius * 0.08;
  let maxU = jawRadius * 0.08;
  for (const point of cloud) {
    const dx = point[0] - target.x;
    const dy = point[1] - target.y;
    const dz = point[2] - target.z;
    maxR = Math.max(maxR, Math.abs(dx * right.x + dy * right.y + dz * right.z));
    maxU = Math.max(
      maxU,
      Math.abs(dx * screenUp.x + dy * screenUp.y + dz * screenUp.z),
    );
  }
  return {
    dir: pose.dir,
    up: pose.up,
    halfW: maxR * 1.2,
    halfH: maxU * 1.2,
    target,
  };
}

function triggerPngDownload(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "scan-overlay.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const OralScanOverlayViewer = forwardRef<OralScanOverlayHandle, Props>(
  function OralScanOverlayViewer(
    {
      items,
      visible,
      colorMapping,
      ghostOpacity,
      prepArch = null,
      focusToothNumbers = [],
      contactMap = false,
      undercutMap = false,
      occlusalGapMm = 0.1,
      contactMode = "cut",
      undercutLimit = 0.2,
      busy = false,
      busyLabel = "",
      onScanColorChange,
      className,
    },
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const loadedRef = useRef<LoadedMesh[]>([]);
  const fitRadiusRef = useRef(40);
  const fitExtentRef = useRef({ halfW: 40, halfH: 40 });
  const fitTargetRef = useRef(new THREE.Vector3());
  const snapRef = useRef<SnapAnim | null>(null);
  const lookRef = useRef({
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
  });
  const visibleRef = useRef(visible);
  const focusTeethRef = useRef(focusToothNumbers);
  const onScanColorChangeRef = useRef(onScanColorChange);
  const itemsRef = useRef(items);
  const frameRef = useRef<DentalFrame | null>(null);
  const unitToMmRef = useRef(1);
  const setViewRef = useRef<(preset: OralScanViewPreset) => void>(() => {});
  const saveImageRef = useRef<() => void>(() => {});
  const [parseNote, setParseNote] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  lookRef.current = {
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
  };
  visibleRef.current = visible;
  focusTeethRef.current = focusToothNumbers;
  onScanColorChangeRef.current = onScanColorChange;
  itemsRef.current = items;

  const itemsKey = items
    .map((item) => `${item.id}:${item.file.size}:${item.file.lastModified}`)
    .join("|");

  const frameCamera = (
    dir: THREE.Vector3,
    up: THREE.Vector3,
    animate: boolean,
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    const toTarget = fitTargetRef.current.clone();
    const toPos = dir.clone().normalize().multiplyScalar(dist).add(toTarget);
    const toUp = up.clone();
    if (Math.abs(toUp.dot(dir.clone().normalize())) > 0.92) {
      toUp.set(0, 0, 1);
    }
    toUp.normalize();
    if (!animate) {
      snapRef.current = null;
      controls.target.copy(toTarget);
      camera.position.copy(toPos);
      camera.up.copy(toUp);
      camera.zoom = 1;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.syncFromCamera();
      return;
    }
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos,
      fromUp: camera.up.clone(),
      toUp,
      fromTarget: controls.target.clone(),
      toTarget,
      fromZoom: camera.zoom,
      toZoom: 1,
    };
  };

  const applyFitFrustum = () => {
    const camera = cameraRef.current;
    const el = containerRef.current;
    if (!camera || !el) return;
    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const { halfW, halfH } = fitExtentRef.current;
    const worldW = Math.max(halfW * 2 * FIT_MARGIN, 1);
    const worldH = Math.max(halfH * 2 * FIT_MARGIN, 1);
    const frustumH = worldW / worldH > aspect ? worldW / aspect : worldH;
    const frustumW = frustumH * aspect;
    camera.top = frustumH / 2;
    camera.bottom = -frustumH / 2;
    camera.right = frustumW / 2;
    camera.left = -frustumW / 2;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    camera.near = Math.max(radius * 0.01, 0.05);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = Math.max(radius * 0.15, 1);
      controls.maxDistance = Math.max(radius * 30, 80);
    }
  };

  const restyleLoaded = () => {
    const look = lookRef.current;
    const {
      colorMapping: mapping,
      ghostOpacity: opacity,
      prepArch: prep,
    } = look;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    let anyColor = false;
    const unit = unitToMmRef.current;
    for (const entry of loadedRef.current) {
      if (entry.hasColor) anyColor = true;
      const analysis = paintAnalysisColors(entry, look, unit);
      const useScan = mapping && entry.hasColor && !analysis;
      const mat = analysis
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            metalness: 0.04,
            roughness: 0.55,
            side: THREE.DoubleSide,
          })
        : createModelPreviewMaterial(entry.geometry, entry.texture, {
            colorMapping: useScan,
          });
      mat.side = THREE.DoubleSide;
      if (!useScan && !analysis) mat.color.set(ROLE_COLOR[entry.role]);
      const ghost = isGhostScanRole(entry.role, prep);
      const alpha = ghost ? Math.min(1, Math.max(0.08, opacity)) : 1;
      mat.transparent = alpha < 0.995;
      mat.opacity = alpha;
      mat.depthWrite = !ghost || alpha > 0.92;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = ghost ? 1 : -1;
      mat.polygonOffsetUnits = 1;
      const prev = entry.mesh.material;
      entry.mesh.material = mat;
      entry.mesh.renderOrder = ghost ? 2 : 0;
      const list = Array.isArray(prev) ? prev : [prev];
      for (const old of list) old.dispose();
      entry.mesh.visible = visibleRef.current[entry.id] !== false;
    }
    if (scene && renderer) {
      if (mapping && anyColor) {
        applyScanColorToneMapping(renderer);
        scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
      } else {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        scene.background = new THREE.Color(0xf3f4f6);
      }
    }
  };

  const applyFitFrustumRef = useRef(applyFitFrustum);
  applyFitFrustumRef.current = applyFitFrustum;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);
    sceneRef.current = scene;

    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const frustum = 80;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000,
    );
    camera.up.copy(HOME_UP);
    camera.position.copy(HOME_DIR.clone().normalize().multiplyScalar(160));
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(40, -60, 90);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8eef8, 0.4);
    fill.position.set(-70, 40, 40);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(10, 80, -50);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    camera.lookAt(0, 0, 0);
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.syncFromCamera();
    controlsRef.current = controls;
    const cancelSnap = () => {
      snapRef.current = null;
    };
    controls.addEventListener("start", cancelSnap);

    let raf = 0;
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const snap = snapRef.current;
      if (snap) {
        const k = easeOutCubic(
          Math.min(1, (performance.now() - snap.start) / snap.duration),
        );
        camera.position.lerpVectors(snap.fromPos, snap.toPos, k);
        camera.up.lerpVectors(snap.fromUp, snap.toUp, k).normalize();
        controls.target.lerpVectors(snap.fromTarget, snap.toTarget, k);
        camera.zoom = snap.fromZoom + (snap.toZoom - snap.fromZoom) * k;
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        if (k >= 1) {
          snapRef.current = null;
          controls.syncFromCamera();
        }
      }
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      const w = Math.max(el.clientWidth, 1);
      const h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      applyFitFrustumRef.current();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("start", cancelSnap);
      controls.dispose();
      for (const entry of loadedRef.current) {
        entry.geometry.dispose();
        entry.texture?.dispose();
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    let cancelled = false;

    const clearGroup = () => {
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        entry.texture?.dispose();
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      group.clear();
      group.position.set(0, 0, 0);
    };

    const sources = itemsRef.current;
    if (sources.length === 0) {
      clearGroup();
      setParseNote("");
      setAnalyzing(false);
      onScanColorChangeRef.current?.(false);
      setLoadVersion((v) => v + 1);
      return;
    }

    void (async () => {
      clearGroup();
      setParseNote("");
      const failed: string[] = [];
      const loaded: LoadedMesh[] = [];
      await Promise.all(
        sources.map(async (source) => {
          try {
            const parsed = await parseModelPreview(source.file, {
              companionFiles: source.companionFiles,
            });
            if (cancelled) {
              parsed.geometry.dispose();
              parsed.texture?.dispose();
              return;
            }
            parsed.geometry.computeBoundingBox();
            if (!parsed.geometry.getAttribute("normal")) {
              parsed.geometry.computeVertexNormals();
            }
            const hasColor = isScanColorPreview(parsed.geometry, parsed.texture);
            const colorAttr = parsed.geometry.getAttribute("color");
            const mesh = new THREE.Mesh(parsed.geometry);
            loaded.push({
              id: source.id,
              role: source.role,
              mesh,
              geometry: parsed.geometry,
              texture: parsed.texture,
              hasColor,
              scanColor:
                colorAttr instanceof THREE.BufferAttribute ? colorAttr : null,
              dist: null,
              align: null,
              analysisColor: null,
            });
          } catch {
            failed.push(source.fileName);
          }
        }),
      );
      if (cancelled) {
        for (const entry of loaded) {
          entry.geometry.dispose();
          entry.texture?.dispose();
        }
        return;
      }
      for (const entry of loaded) group.add(entry.mesh);
      loadedRef.current = loaded;
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        fitRadiusRef.current = Math.max(sphere.radius, 1);
      }
      const frame = estimateDentalFrame(loaded);
      frameRef.current = frame
        ? {
            up: frame.up.clone(),
            anterior: frame.anterior.clone(),
            right: frame.right.clone(),
          }
        : null;
      unitToMmRef.current = geometryUnitsToMm(fitRadiusRef.current);
      const framed = frame
        ? frameWorkOcclusal({
            loaded,
            groupPosition: group.position,
            frame,
            prepArch: lookRef.current.prepArch ?? null,
            toothNumbers: focusTeethRef.current,
          })
        : null;
      if (framed) {
        HOME_DIR.copy(framed.dir);
        HOME_UP.copy(framed.up);
        fitExtentRef.current = { halfW: framed.halfW, halfH: framed.halfH };
        fitTargetRef.current.copy(framed.target);
      } else {
        if (frame) applyDentalFrame(frame);
        const fit = measureMeshFit(loaded, group.position, HOME_DIR, HOME_UP);
        fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
        fitTargetRef.current.copy(fit.target);
      }
      applyFitFrustum();
      frameCamera(HOME_DIR, HOME_UP, false);
      restyleLoaded();
      onScanColorChangeRef.current?.(loaded.some((entry) => entry.hasColor));
      setParseNote(
        failed.length ? `열지 못했습니다: ${failed.join(", ")}` : "",
      );
      setLoadVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [itemsKey]);

  const restyleRef = useRef(restyleLoaded);
  restyleRef.current = restyleLoaded;

  useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded.length === 0) {
      setAnalyzing(false);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    void fillDesignAnalysis(
      loaded,
      prepArch,
      frameRef.current,
      unitToMmRef.current,
      () => cancelled,
    ).then(() => {
      if (cancelled) return;
      setAnalyzing(false);
      restyleRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [prepArch, loadVersion]);

  useEffect(() => {
    for (const entry of loadedRef.current) {
      entry.mesh.visible = visible[entry.id] !== false;
    }
  }, [visible, loadVersion]);

  useEffect(() => {
    restyleLoaded();
  }, [
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    loadVersion,
  ]);

  setViewRef.current = (preset) => {
    const frame = frameRef.current;
    if (preset === "fit" || !frame) {
      frameCamera(HOME_DIR, HOME_UP, true);
      return;
    }
    if (preset === "occlusal") {
      frameCamera(HOME_DIR, HOME_UP, true);
      return;
    }
    if (preset === "buccal") {
      frameCamera(frame.anterior, frame.up, true);
      return;
    }
    frameCamera(frame.anterior.clone().negate(), frame.up, true);
  };

  useImperativeHandle(
    ref,
    () => ({
      setView: (preset) => setViewRef.current(preset),
      saveImage: () => saveImageRef.current(),
    }),
    [],
  );

  const onSaveImage = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    triggerPngDownload(renderer.domElement.toDataURL("image/png"));
  };
  saveImageRef.current = onSaveImage;

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />

      {busy && items.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <p className="rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {busyLabel || "스캔을 불러오는 중…"}
          </p>
        </div>
      ) : null}

      {parseNote ? (
        <p className="absolute left-3 top-3 z-10 max-w-sm rounded-md bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {parseNote}
        </p>
      ) : null}

      {analyzing && items.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          접촉과 언더컷을 계산하는 중
        </p>
      ) : null}
    </div>
  );
},
);
