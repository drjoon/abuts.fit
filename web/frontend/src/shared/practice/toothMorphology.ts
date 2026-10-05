// 치아 형태 라이브러리 — FDI 치아 종류별 해부 형태(절단연·교두·열구·변연융선)를 절차적으로 만든다.
//
// 크라운 로컬 좌표(단위 구, y=교합)에서 교합 쪽만 민다. 열린 테두리(경부)는 건드리지 않아
// 마진 정렬·내면 생성·대합/인접 맞춤 파이프라인이 그대로 이어진다.
// 3Shape 라이브러리처럼 치아 번호가 형태를 고른다. 치아 값은 기공의뢰에서 온다.

import * as THREE from "three";

import { fdiToothDigits } from "@/shared/practice/toothArchOrder";

export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export type MorphologyDirs = { bx: number; bz: number; mx: number; mz: number };

export type ToothForm = {
  kind: ToothKind;
  upper: boolean;
};

/** FDI 번호(예 "26", "#26")로 치아 종류와 악을 정한다. 번호를 못 읽으면 null. */
export function toothFormOf(tooth: string): ToothForm | null {
  const digits = fdiToothDigits(tooth);
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const quadrant = Number(digits[0]);
  const position = Number(digits[1]);
  const kind: ToothKind =
    position <= 2 ? "incisor" : position === 3 ? "canine" : position <= 5 ? "premolar" : "molar";
  return { kind, upper: quadrant <= 2 };
}

type Cusp = { u: number; v: number; h: number; s: number };

const gauss = (u: number, v: number, c: Cusp) =>
  c.h * Math.exp(-((u - c.u) ** 2 + (v - c.v) ** 2) / (c.s * c.s));

/** u=협설(+협측), v=근원심(+근심). 교두 위치·높이·퍼짐은 단위 구 기준이다. */
function cuspsOf(form: ToothForm): Cusp[] {
  switch (form.kind) {
    case "canine":
      return [{ u: 0.05, v: 0, h: 0.2, s: 0.36 }];
    case "premolar":
      return [
        { u: 0.42, v: 0, h: 0.17, s: 0.3 },
        { u: -0.4, v: 0, h: form.upper ? 0.14 : 0.08, s: 0.28 },
      ];
    case "molar": {
      const list: Cusp[] = [
        { u: 0.42, v: 0.4, h: 0.17, s: 0.27 },
        { u: 0.42, v: -0.4, h: 0.15, s: 0.27 },
        { u: -0.42, v: 0.4, h: form.upper ? 0.2 : 0.15, s: 0.27 },
        { u: -0.42, v: -0.4, h: form.upper ? 0.1 : 0.14, s: 0.27 },
      ];
      if (!form.upper) list.push({ u: 0.05, v: -0.66, h: 0.11, s: 0.22 });
      return list;
    }
    default:
      return [];
  }
}

const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);

/**
 * 치아 종류별 형태를 지오메트리에 입힌다. 위치(x,z)와 높이(y)를 교합 쪽 가중치로만 민다.
 * `dirs`가 없으면 로컬 x=협설, z=근원심으로 본다.
 */
export function shapeToothMorphology(
  geometry: THREE.BufferGeometry,
  tooth: string,
  dirs: MorphologyDirs | null,
) {
  const form = toothFormOf(tooth);
  if (!form) return;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const d = dirs ?? { bx: 1, bz: 0, mx: 0, mz: 1 };
  const cusps = cuspsOf(form);
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const body = smooth(y, 0, 0.6);
    const top = smooth(y, 0.3, 0.85);
    if (body <= 0 && top <= 0) continue;
    let u = x * d.bx + z * d.bz;
    let v = x * d.mx + z * d.mz;

    // 1) 평면 비율: 협설·근원심 폭을 종류별로 맞춘다.
    const ratioU = form.kind === "incisor" ? 0.74 : form.kind === "canine" ? 0.86 : form.kind === "premolar" ? 0.92 : 1.04;
    const ratioV = form.kind === "incisor" ? 1.04 : form.kind === "canine" ? 0.94 : form.kind === "premolar" ? 0.84 : 1.04;
    const du = u * (ratioU - 1) * body;
    const dv = v * (ratioV - 1) * body;
    x += d.bx * du + d.mx * dv;
    z += d.bz * du + d.mz * dv;
    u += du;
    v += dv;

    // 2) 교합면 높이: 교두는 올리고 열구·소와는 낮춘다.
    let lift = 0;
    for (const cusp of cusps) lift += gauss(u, v, cusp);

    if (form.kind === "incisor") {
      // 절단연: 윗면을 납작하게 하고 설측에 얕은 와를 둔다.
      const edge = 0.7;
      if (y > edge) y = edge + (y - edge) * 0.18;
      lift -= 0.07 * Math.exp(-((u + 0.3) ** 2) / 0.1 - (v * v) / 0.35);
    } else if (form.kind === "canine") {
      // 첨두 쪽으로 좁힌다.
      const taper = 1 - 0.3 * smooth(y, 0.45, 1);
      x *= taper;
      z *= taper;
      lift -= 0.05 * Math.exp(-((u + 0.35) ** 2) / 0.09 - (v * v) / 0.3);
    } else if (form.kind === "premolar") {
      lift -= 0.13 * Math.exp(-(u * u) / 0.025 - (v * v) / 0.5);
      lift += 0.07 * Math.exp(-((Math.abs(v) - 0.66) ** 2) / 0.03 - (u * u) / 0.3);
    } else {
      // 대구치: 십자 열구와 중심와, 근원심 변연융선.
      lift -= 0.12 * Math.exp(-(u * u) / 0.02 - (v * v) / 0.6);
      lift -= 0.11 * Math.exp(-(v * v) / 0.02 - (u * u) / 0.6);
      lift -= 0.05 * Math.exp(-(u * u + v * v) / 0.05);
      lift += 0.06 * Math.exp(-((Math.abs(v) - 0.72) ** 2) / 0.03 - (u * u) / 0.3);
      if (form.upper) lift += 0.06 * Math.exp(-((u + v * 0.9) ** 2) / 0.02 - (v * v) / 0.25);
    }

    y += lift * top;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}
