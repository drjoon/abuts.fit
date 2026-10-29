// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (measureConnectionTaper · prepareCuffMesh · 띠 잇기 헬퍼)
// - web/backend/services/abutmentStl/cuffBlend.worker.js (커프 보정·포스트 다듬기 뒤 마지막 단계)
// - web/backend/tests/unit/connectionTaperSmooth.test.js
//
// 커넥션 11° 원뿔 면의 세로 결을 없앤다. 형상(치수)은 그대로다.
// - 헥스 어깨 바로 위부터, 면이 11°를 떠나는 높이(PRC 면까지 늘린 0.1mm 포함)까지 원뿔 전체를 다시 만든다.
// - 둘레는 커프와 같이 1°. 원뿔은 직선 면이라 높이 방향은 위·아래 두 줄이면 된다.
//   기공소 메시의 다각형(예: 46각)이나 연장 로프트(72각)를 그대로 두면 면이 평평해 결이 남는다.
// - 잘린 경계의 긴 변은 현 그대로 두지 않고 1.25°로 나누어 원뿔 면에 올린다. 맞닿은 커프·헥스 면도 같이 나눈다.
// - 원뿔에서 허용치(CONE_SNAP_TOL_MM)보다 벗어난 꼭짓점(헥스·단차·2° 커프·스크류 채널)과 그 면은 건드리지 않는다.
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import {
  angularRow,
  chainBoundaryLoops,
  measureConnectionTaper,
  prepareCuffMesh,
  splitByLevel,
  zipperRows,
} from "./cuffBlend.js";

export const CONNECTION_TAPER_SMOOTH_VERSION = "conn-taper-smooth-4";
/** 이 attribute의 삼각형은 커넥션 원뿔 다듬기로 다시 만든 면이다. */
export const CONNECTION_TAPER_SMOOTH_ATTRIBUTE = 0x4354;

/** 원뿔 아래 끝은 원점 아래로 내려가며 둘레가 원뿔에 맞는 데까지 찾는다(헥스 위 시작). */
const CONE_SCAN_STEP_MM = 0.05;
const CONE_SCAN_MIN_Z_MM = -4;
const CONE_FIT_TOL_MM = 0.012;
const CONE_BINS = 72;
/** 원뿔 면에서 이 안에 있는 꼭짓점만 옮긴다(헥스·단차는 한참 멀다). */
const CONE_SNAP_TOL_MM = 0.02;
/** 띠를 못 만들 때, 원뿔 끝 아래 이 구간에서 옮기는 양을 1 → 0으로 줄인다. */
const TOP_RAMP_MM = 0.04;
/** 헥스 어깨와 겹치지 않게 원뿔 아래 끝에서 이만큼 위에서 자른다. */
const BAND_INSET_MM = 0.02;
const BAND_MIN_HEIGHT_MM = 0.05;
/** 새 띠 둘레 칸 수(1°). 커프 이음 열과 같다. */
const BAND_COLUMNS = 360;
/** 경계 변을 이 각도보다 잘게 나눈다. 커프 하단 경계(BOTTOM_EDGE_MAX_RAD)와 같다. */
const EDGE_MAX_RAD = (1.25 * Math.PI) / 180;
/** 기존 경계와 새 1° 줄 사이 높이. 얇을수록 경계 부채꼴이 안 보인다. */
const BAND_EDGE_ROW_MM = 0.01;

const TWO_PI = Math.PI * 2;

const smooth01 = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function angleDelta(verts, a, b) {
  const a0 = Math.atan2(verts[a * 3 + 1], verts[a * 3]);
  const a1 = Math.atan2(verts[b * 3 + 1], verts[b * 3]);
  let d = Math.abs(a1 - a0);
  if (d > Math.PI) d = TWO_PI - d;
  return d;
}

/** 경계 꼭짓점을 원뿔 면으로 올린다. 원뿔에서 멀면(헥스 모서리·2° 커프) 그대로 둔다. */
function snapBoundaryVertex(verts, v, coneAt) {
  snapToCone(verts, v, coneAt, 1);
}

/** 원점에서 아래로 내려가며 둘레 80% 이상이 원뿔에 맞는 마지막 높이. */
function coneBottomZ(probe, coneAt) {
  let bottom = -CONE_SCAN_STEP_MM;
  let miss = 0;
  for (let z = -CONE_SCAN_STEP_MM; z >= CONE_SCAN_MIN_Z_MM; z -= CONE_SCAN_STEP_MM) {
    const bins = Array.from(probe.bins(z, CONE_BINS));
    const near = bins.filter((r) => Math.abs(r - coneAt(z)) < CONE_FIT_TOL_MM).length;
    if (near / CONE_BINS >= 0.8) {
      bottom = z;
      miss = 0;
    } else if (++miss > 1) break;
  }
  return bottom - CONE_SCAN_STEP_MM / 2;
}

/** 꼭짓점을 원뿔 면으로 옮긴다. 옮긴 양(mm)을 돌려준다. 원뿔에서 멀면 null. */
function snapToCone(verts, v, coneAt, w = 1) {
  const x = verts[v * 3];
  const y = verts[v * 3 + 1];
  const r = Math.hypot(x, y);
  if (r < 1e-6) return null;
  const dev = coneAt(verts[v * 3 + 2]) - r;
  if (Math.abs(dev) > CONE_SNAP_TOL_MM) return null;
  const rNew = r + dev * w;
  verts[v * 3] = (x / r) * rNew;
  verts[v * 3 + 1] = (y / r) * rNew;
  return Math.abs(dev * w);
}

/**
 * 경계 루프의 긴 변(다각형 현)을 1.25°로 나누고, 새 점은 원뿔 면에 올린다.
 * 맞닿은 면(커프·헥스)도 같은 점으로 나누어 경계가 어긋나지 않게 한다.
 * @returns {number[] | null}
 */
function refineBoundaryLoop(loop, verts, faces, faceAttr, removed, coneAt) {
  const edgeFace = new Map();
  const fc = removed.length;
  for (let f = 0; f < fc; f += 1) {
    if (removed[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      edgeFace.set(`${faces[f * 3 + k]}_${faces[f * 3 + ((k + 1) % 3)]}`, f);
    }
  }
  const out = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    snapBoundaryVertex(verts, a, coneAt);
    out.push(a);
    const steps = Math.ceil(angleDelta(verts, a, b) / EDGE_MAX_RAD);
    if (steps <= 1) continue;
    const face = edgeFace.get(`${a}_${b}`);
    const tri = face == null ? null : [faces[face * 3], faces[face * 3 + 1], faces[face * 3 + 2]];
    const ia = tri ? tri.indexOf(a) : -1;
    // 맞닿은 면을 같이 나누지 못하면 그 변은 그대로 둔다. 점만 넣으면 경계가 벌어진다.
    if (ia < 0 || tri[(ia + 1) % 3] !== b) continue;
    const c = tri[(ia + 2) % 3];
    const mids = [];
    for (let s = 1; s < steps; s += 1) {
      const u = s / steps;
      const x = verts[a * 3] + u * (verts[b * 3] - verts[a * 3]);
      const y = verts[a * 3 + 1] + u * (verts[b * 3 + 1] - verts[a * 3 + 1]);
      const z = verts[a * 3 + 2] + u * (verts[b * 3 + 2] - verts[a * 3 + 2]);
      const idx = verts.length / 3;
      const r = Math.hypot(x, y);
      const target = coneAt(z);
      if (r > 1e-6 && Math.abs(target - r) <= CONE_SNAP_TOL_MM) {
        verts.push((x / r) * target, (y / r) * target, z);
      } else {
        verts.push(x, y, z);
      }
      mids.push(idx);
      out.push(idx);
    }
    const chain = [a, ...mids, b];
    const attr = faceAttr[face] || 0;
    faces[face * 3] = chain[0];
    faces[face * 3 + 1] = chain[1];
    faces[face * 3 + 2] = c;
    for (let k = 1; k < chain.length - 1; k += 1) {
      faces.push(chain[k], chain[k + 1], c);
      faceAttr.push(attr);
    }
  }
  snapBoundaryVertex(verts, loop[0], coneAt);
  return out;
}

/**
 * zLo~zHi 사이 원뿔 면을 지우고 둘레 1° 띠로 다시 잇는다. 경계가 한 바퀴 루프 2개가 아니면 null(원본 유지).
 * @returns {{ verts, faces: number[], faceAttr: number[], newFaceStart: number } | null}
 */
function rebuildConeBand(mesh, coneAt, zLo, zHi) {
  let cut = splitByLevel(mesh, (x, y, z) => z - zLo);
  cut = splitByLevel(cut, (x, y, z) => z - zHi);
  const { verts, faces, faceAttr, faceMain } = cut;
  // 자른 자리 꼭짓점은 다각형 변 위에 있어 원뿔보다 살짝 안쪽이다.
  for (let v = mesh.verts.length / 3; v < verts.length / 3; v += 1) snapToCone(verts, v, coneAt);
  const fc = faces.length / 3;
  const removed = new Uint8Array(fc);
  const onCone = (v) => {
    const r = Math.hypot(verts[v * 3], verts[v * 3 + 1]);
    return Math.abs(r - coneAt(verts[v * 3 + 2])) <= CONE_SNAP_TOL_MM;
  };
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    const a = faces[f * 3];
    const b = faces[f * 3 + 1];
    const c = faces[f * 3 + 2];
    const cz = (verts[a * 3 + 2] + verts[b * 3 + 2] + verts[c * 3 + 2]) / 3;
    if (cz > zLo && cz < zHi && onCone(a) && onCone(b) && onCone(c)) removed[f] = 1;
  }
  const keptEdges = new Set();
  const removedEdges = [];
  for (let f = 0; f < fc; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      if (removed[f]) removedEdges.push([a, b]);
      else keptEdges.add(`${a}_${b}`);
    }
  }
  const boundary = [];
  for (const [a, b] of removedEdges) {
    if (keptEdges.has(`${b}_${a}`)) boundary.push([b, a]);
  }
  const loops = chainBoundaryLoops(boundary);
  if (!loops || loops.length !== 2) return null;
  const meanZ = (loop) => loop.reduce((s, v) => s + verts[v * 3 + 2], 0) / loop.length;
  loops.sort((p, q) => meanZ(p) - meanZ(q));
  if (Math.abs(meanZ(loops[0]) - zLo) > 1e-4 || Math.abs(meanZ(loops[1]) - zHi) > 1e-4) return null;
  const bottomLoop = refineBoundaryLoop(loops[0], verts, faces, faceAttr, removed, coneAt);
  const topLoop = refineBoundaryLoop(loops[1], verts, faces, faceAttr, removed, coneAt);
  if (!bottomLoop || !topLoop) return null;
  const bottom = angularRow(bottomLoop, verts);
  const top = angularRow(topLoop, verts);
  if (!bottom || !top) return null;

  const edgeRow = Math.min(BAND_EDGE_ROW_MM, (zHi - zLo) / 4);
  const ring = (z) => {
    const r = coneAt(z);
    const row = [];
    for (let j = 0; j < BAND_COLUMNS; j += 1) {
      const a = (j / BAND_COLUMNS) * TWO_PI;
      row.push({ v: verts.length / 3, a });
      verts.push(r * Math.cos(a), r * Math.sin(a), z);
    }
    return row;
  };
  const rings = [ring(zLo + edgeRow), ring(zHi - edgeRow)];

  const outFaces = [];
  const outAttr = [];
  const faceCount = faces.length / 3;
  for (let f = 0; f < faceCount; f += 1) {
    if (f < fc && removed[f]) continue;
    outFaces.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    outAttr.push(faceAttr[f] || 0);
  }
  const newFaceStart = outAttr.length;
  // 원뿔 바깥 면: 법선이 축에서 멀어지는 쪽.
  const emit = (a, b, c) => {
    const pa = a * 3, pb = b * 3, pc = c * 3;
    const ux = verts[pb] - verts[pa], uy = verts[pb + 1] - verts[pa + 1], uz = verts[pb + 2] - verts[pa + 2];
    const vx = verts[pc] - verts[pa], vy = verts[pc + 1] - verts[pa + 1], vz = verts[pc + 2] - verts[pa + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    if (Math.hypot(nx, ny, ux * vy - uy * vx) < 1e-14) return;
    const cx = verts[pa] + verts[pb] + verts[pc];
    const cy = verts[pa + 1] + verts[pb + 1] + verts[pc + 1];
    if (nx * cx + ny * cy >= 0) outFaces.push(a, b, c);
    else outFaces.push(a, c, b);
    outAttr.push(CONNECTION_TAPER_SMOOTH_ATTRIBUTE);
  };
  const stack = [bottom, ...rings, top];
  for (let r = 0; r + 1 < stack.length; r += 1) zipperRows(stack[r], stack[r + 1], emit);
  return { verts, faces: outFaces, faceAttr: outAttr, newFaceStart };
}

/**
 * @param {Buffer} buffer filled STL (원점=커넥션 원점, 축=Z)
 * @returns {{ ok: boolean, status: string, reason?: string, buffer?: Buffer|null, detail?: object }}
 */
export function smoothConnectionTaper(buffer) {
  try {
    const { mesh, probe, triCount } = prepareCuffMesh(buffer);
    const taper = measureConnectionTaper(probe);
    if (!taper) return { ok: false, status: "skipped", reason: "11° 원뿔 없음", buffer: null };
    // 11°가 실제로 끝나는 높이. 그 위 2° 커프는 원뿔로 되돌리지 않는다.
    const zTop = taper.departZ > 0 ? taper.departZ : taper.measuredTopZ - 0.02;
    const zBottom = coneBottomZ(probe, taper.coneAt);
    const verts = Array.from(mesh.verts);
    const nv = verts.length / 3;
    let moved = 0;
    let maxUm = 0;
    // 띠가 실패하면 이 스냅만 남는다. 끝 0.04mm는 커프와 단차가 나지 않게 양을 줄인다.
    // 띠가 되면 이 구간 면은 지워지고, 경계는 refineBoundaryLoop가 원뿔 면에 올린다.
    for (let v = 0; v < nv; v += 1) {
      const z = verts[v * 3 + 2];
      if (z < zBottom || z > zTop) continue;
      const w = 1 - smooth01((z - (zTop - TOP_RAMP_MM)) / TOP_RAMP_MM);
      if (w <= 0) continue;
      const d = snapToCone(verts, v, taper.coneAt, w);
      if (d == null || d < 1e-7) continue;
      moved += 1;
      maxUm = Math.max(maxUm, d * 1000);
    }
    const snapped = { ...mesh, verts, faceAttr: Array.from(mesh.faceAttr) };
    const zLo = zBottom + BAND_INSET_MM;
    const zHi = zTop;
    const band = zHi - zLo >= BAND_MIN_HEIGHT_MM ? rebuildConeBand(snapped, taper.coneAt, zLo, zHi) : null;
    if (!moved && !band) return { ok: false, status: "skipped", reason: "다듬을 원뿔 면 없음", buffer: null };
    const out = band || { verts, faces: mesh.faces, faceAttr: snapped.faceAttr };
    const tc = out.faces.length / 3;
    const positions = new Float64Array(tc * 9);
    const attributes = new Uint16Array(tc);
    for (let f = 0; f < tc; f += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = out.faces[f * 3 + k];
        positions[f * 9 + k * 3] = out.verts[v * 3];
        positions[f * 9 + k * 3 + 1] = out.verts[v * 3 + 1];
        positions[f * 9 + k * 3 + 2] = out.verts[v * 3 + 2];
      }
      attributes[f] = out.faceAttr[f] || 0;
    }
    return {
      ok: true,
      status: "applied",
      buffer: writeBinaryStl({ positions, attributes }),
      detail: {
        movedVertices: moved,
        maxMovedUm: Math.round(maxUm * 10) / 10,
        bandRebuilt: !!band,
        trianglesBefore: triCount,
        triangles: tc,
        zTop: Math.round(zTop * 1000) / 1000,
        zBottom: Math.round(zBottom * 1000) / 1000,
      },
    };
  } catch (error) {
    return { ok: false, status: "failed", reason: String(error?.message || error), buffer: null };
  }
}
