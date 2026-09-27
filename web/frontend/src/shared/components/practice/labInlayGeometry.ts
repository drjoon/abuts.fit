// 기공소 AI 보철 — 마진 고리 안 와동을 채우는 인레이·온레이 메시.
// 로컬 프레임은 편집 레이어와 같다. y는 삽입축, x·z는 마진 각도의 cos·sin이다.

import * as THREE from "three";

import {
  CAVITY_EDGE_BAND,
  cavityProfileMm,
  type CavityKind,
} from "@/shared/practice/labInlayDesign";
import {
  thicknessAlertRgb,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

const ANGLES = 64;
const RINGS = 14;
const INLAY_RGB: [number, number, number] = [243 / 255, 239 / 255, 232 / 255];
const INNER_RGB: [number, number, number] = [0.79, 0.75, 0.7];

/** 마진 점 사이를 각도로 잇는다. 점은 0부터 같은 각도 간격이다. */
function sampleLoop(values: readonly number[], angle: number) {
  const count = values.length;
  const turn = Math.PI * 2;
  const at = ((((angle % turn) + turn) % turn) / turn) * count;
  const i0 = Math.floor(at) % count;
  const i1 = (i0 + 1) % count;
  const u = at - Math.floor(at);
  return (values[i0] ?? 0) * (1 - u) + (values[i1] ?? 0) * u;
}

/**
 * `radial[i]`·`axial[i]`는 마진 점 i의 반지름·높이(기하 단위).
 * 반환 메시는 로컬 좌표다. 레이어가 삽입축 회전과 치아 중심을 입힌다.
 */
export function makeCavityRestorationGeometry(args: {
  edit: ToothDesignEdit;
  kind: CavityKind;
  depthMm: number;
  unitToMm: number;
  radial: readonly number[];
  axial: readonly number[];
}) {
  const unit = args.unitToMm > 0 ? args.unitToMm : 1;
  const count = Math.min(args.radial.length, args.axial.length);
  if (count < 3) return null;
  const radial = args.radial.slice(0, count);
  const axial = args.axial.slice(0, count);
  const meanAxial = axial.reduce((sum, value) => sum + value, 0) / count;

  const perSurface = ANGLES * (RINGS + 1);
  const positions = new Float32Array(perSurface * 2 * 3);
  const colors = new Float32Array(perSurface * 2 * 3);
  const vertex = (surface: number, a: number, ring: number) =>
    surface * perSurface + a * (RINGS + 1) + ring;

  for (let a = 0; a < ANGLES; a += 1) {
    const angle = (a / ANGLES) * Math.PI * 2;
    const r0 = sampleLoop(radial, angle);
    const y0 = sampleLoop(axial, angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let ring = 0; ring <= RINGS; ring += 1) {
      const t = ring / RINGS;
      const r = r0 * (1 - t);
      const blend = t * t * (3 - 2 * t);
      const rim = y0 * (1 - blend) + meanAxial * blend;
      const { top, bottom } = cavityProfileMm(args.edit, args.kind, args.depthMm, angle, t);
      const x = cos * r;
      const z = sin * r;

      const up = vertex(0, a, ring) * 3;
      positions[up] = x;
      positions[up + 1] = rim + top / unit;
      positions[up + 2] = z;
      const alert =
        t >= CAVITY_EDGE_BAND ? thicknessAlertRgb(args.edit, top - bottom) : null;
      const rgb = alert ?? INLAY_RGB;
      colors[up] = rgb[0];
      colors[up + 1] = rgb[1];
      colors[up + 2] = rgb[2];

      const down = vertex(1, a, ring) * 3;
      positions[down] = x;
      positions[down + 1] = rim + bottom / unit;
      positions[down + 2] = z;
      colors[down] = INNER_RGB[0];
      colors[down + 1] = INNER_RGB[1];
      colors[down + 2] = INNER_RGB[2];
    }
  }

  const indices: number[] = [];
  for (let a = 0; a < ANGLES; a += 1) {
    const b = (a + 1) % ANGLES;
    for (let ring = 0; ring < RINGS; ring += 1) {
      const p = vertex(0, a, ring);
      const q = vertex(0, b, ring);
      const pIn = vertex(0, a, ring + 1);
      const qIn = vertex(0, b, ring + 1);
      indices.push(p, pIn, q, q, pIn, qIn);
      const s = vertex(1, a, ring);
      const u = vertex(1, b, ring);
      const sIn = vertex(1, a, ring + 1);
      const uIn = vertex(1, b, ring + 1);
      indices.push(s, u, sIn, u, uIn, sIn);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
