// 기공소 AI 보철 — 컷백 선택 영역. 프리셋 위에 브러시·반전을 쌓은 순서대로 정점마다 0~1로 낸다.

import type { CutbackPreset, ToothDesignEdit } from "@/shared/practice/labProsthesisModify";

export type CutbackMaskInput = {
  /** 크라운 로컬 정점(xyz). */
  positions: ArrayLike<number>;
  count: number;
  cutback: ToothDesignEdit["cutback"];
  /** 로컬 한 칸이 축마다 몇 mm인가. 변형 배율까지 넣는다. */
  axisMm: readonly [number, number, number];
  /** 열린 테두리(마진) 높이. 로컬 y. */
  rimY: number;
  /** 로컬 xz 협측 단위 방향. 악궁을 모르면 null. */
  buccal: { x: number; z: number } | null;
};

function smoothstep(x: number, a: number, b: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** t는 마진 0 → 교합·절단 끝 1. 부분은 절단연과 순면, 절단 끝은 설측까지 넣는다. */
function presetWeight(
  preset: CutbackPreset,
  t: number,
  x: number,
  z: number,
  buccal: CutbackMaskInput["buccal"],
) {
  if (preset === "full") return 1;
  if (preset === "none") return 0;
  const height = smoothstep(t, 0.3, 0.45);
  const radial = Math.hypot(x, z);
  if (!buccal || radial < 1e-6) return height;
  const facing = (x * buccal.x + z * buccal.z) / radial;
  return height * Math.max(smoothstep(facing, -0.3, 0.05), smoothstep(t, 0.8, 0.92));
}

/** 마진 띠는 반전해도 깎지 않는다. */
const MARGIN_GUARD: readonly [number, number] = [0.08, 0.2];

export function cutbackMask(input: CutbackMaskInput): Float32Array {
  const { positions, count, cutback, axisMm, rimY, buccal } = input;
  const out = new Float32Array(count);
  const span = Math.max(1 - rimY, 1e-6);
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const t = Math.min(1, Math.max(0, (y - rimY) / span));
    let m = presetWeight(cutback.preset, t, x, z, buccal);
    for (const op of cutback.ops) {
      if (op.kind === "invert") {
        m = 1 - m;
        continue;
      }
      const d = Math.hypot(
        (x - op.point[0]) * axisMm[0],
        (y - op.point[1]) * axisMm[1],
        (z - op.point[2]) * axisMm[2],
      );
      if (d >= op.radiusMm) continue;
      const f = 1 - smoothstep(d, op.radiusMm * 0.6, op.radiusMm);
      m = op.kind === "add" ? Math.max(m, f) : m * (1 - f);
    }
    out[i] = m * smoothstep(t, MARGIN_GUARD[0], MARGIN_GUARD[1]);
  }
  return out;
}
