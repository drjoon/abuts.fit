// related files:
// - web/backend/services/abutmentStl/compare.js
//
// Rhino·JS 결과 각각의 "스펙 대비" 지표. 어느 쪽이 맞는지 볼 때 쓴다(원본 일치 여부와 별개).
import { Mesh, meshZSection, parseStl } from "./meshCore.js";

/** z=0 단면 외곽 직경. 정렬 목표(커넥션 직경)와 비교한다. */
export function connectionDiameterAtOrigin(mesh) {
  let best = null;
  for (const pl of meshZSection(mesh, 0)) {
    const pts = pl.slice(0, -1);
    if (pts.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
    }
    cx /= pts.length;
    cy /= pts.length;
    const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    if (!best || r > best.r) best = { r, cx, cy };
  }
  return best ? { diameter: best.r * 2, centerOffset: Math.hypot(best.cx, best.cy) } : null;
}

export const HOLE_FILL_PATCH_ATTRIBUTE = 0x4846;

/** filled STL 버퍼 요약: 삼각형 수, HF 패치 수, 본체(HF 제외) 메시. */
export function summarizeFilledStl(buffer) {
  const { positions, attributes } = parseStl(buffer);
  const triCount = Math.floor(positions.length / 9);
  let hf = 0;
  const kept = [];
  for (let t = 0; t < triCount; t += 1) {
    if (attributes[t] === HOLE_FILL_PATCH_ATTRIBUTE) {
      hf += 1;
      continue;
    }
    for (let k = 0; k < 9; k += 1) kept.push(positions[t * 9 + k]);
  }
  const mesh = Mesh.fromTriangleSoup(Float64Array.from(kept));
  return { triangleCount: triCount, hfPatchTriangles: hf, mesh };
}
