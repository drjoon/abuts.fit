// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (measureConnectionTaper · prepareCuffMesh)
// - web/backend/services/abutmentStl/cuffBlend.worker.js (커프 보정·포스트 다듬기 뒤 마지막 단계)
// - web/backend/tests/unit/connectionTaperSmooth.test.js
//
// 커넥션 11° 원뿔 면의 메시 잡음을 없앤다.
// - 원점 아래 원뿔(측정된 r0 + slope·z) 위에 있는 꼭짓점을 그 원뿔 면으로 정확히 옮긴다. Z는 그대로, 반경만 바뀐다.
// - 원뿔 면 위 다각형 변(예: 46각)은 중점을 원뿔 면에 얹어 쪼갠다. 꼭짓점만 옮기면 면 하나하나가 평평해 세로 결이 남는다.
// - 원뿔에서 허용치(CONE_SNAP_TOL_MM)보다 벗어난 꼭짓점(헥스·단차·커프)은 건드리지 않는다.
// - 원뿔이 끝나는 높이 바로 아래에서 옮기는 양을 0으로 줄여 위쪽 이음과 단차가 생기지 않게 한다.
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { measureConnectionTaper, prepareCuffMesh } from "./cuffBlend.js";

export const CONNECTION_TAPER_SMOOTH_VERSION = "conn-taper-smooth-2";
/** 이 attribute의 삼각형은 커넥션 원뿔 다듬기로 꼭짓점이 옮겨진 면이다. */
export const CONNECTION_TAPER_SMOOTH_ATTRIBUTE = 0x4354;

/** 원뿔 아래 끝은 원점 아래로 내려가며 둘레가 원뿔에 맞는 데까지 찾는다(헥스 위 시작). */
const CONE_SCAN_STEP_MM = 0.05;
const CONE_SCAN_MIN_Z_MM = -4;
const CONE_FIT_TOL_MM = 0.012;
const CONE_BINS = 72;
/** 원뿔 면에서 이 안에 있는 꼭짓점만 옮긴다(헥스·단차는 한참 멀다). */
const CONE_SNAP_TOL_MM = 0.02;
/** 원뿔 끝 높이 아래 이 구간에서 옮기는 양을 1 → 0으로 줄인다. */
const TOP_RAMP_MM = 0.04;
/** 둘레 방향으로 이 각도보다 벌어진 원뿔 위 변은 쪼갠다. */
const SPLIT_MIN_DEG = 1.5;
const SPLIT_MAX_ROUNDS = 5;
const MAX_TRIANGLES = 3_000_000;

const smooth01 = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

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

/**
 * 원뿔 위 꼭짓점끼리 이은 변 중 둘레로 많이 벌어진 변의 중점을 원뿔 면에 얹어 삼각형을 쪼갠다.
 * 변 단위로 쪼개므로 이웃 삼각형과 틈(T 접합)이 생기지 않는다.
 */
function refineCone({ pos, tris, attrs, eligible, coneAt }) {
  const minCos = Math.cos((SPLIT_MIN_DEG * Math.PI) / 180);
  let splitCount = 0;
  for (let round = 0; round < SPLIT_MAX_ROUNDS; round += 1) {
    const mids = new Map();
    const midOf = (a, b) => {
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const have = mids.get(key);
      if (have !== undefined) return have;
      const x = (pos[a * 3] + pos[b * 3]) / 2;
      const y = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2;
      const z = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2;
      const r = Math.hypot(x, y);
      const rt = coneAt(z);
      const k = r > 1e-9 ? rt / r : 1;
      const id = pos.length / 3;
      pos.push(x * k, y * k, z);
      eligible.push(1);
      mids.set(key, id);
      return id;
    };
    const wantSplit = (a, b) => {
      if (!eligible[a] || !eligible[b]) return false;
      const ra = Math.hypot(pos[a * 3], pos[a * 3 + 1]);
      const rb = Math.hypot(pos[b * 3], pos[b * 3 + 1]);
      if (ra < 1e-6 || rb < 1e-6) return false;
      const cos = (pos[a * 3] * pos[b * 3] + pos[a * 3 + 1] * pos[b * 3 + 1]) / (ra * rb);
      return cos < minCos;
    };
    const nextTris = [];
    const nextAttrs = [];
    let any = false;
    const emit = (a, b, c, at) => {
      nextTris.push(a, b, c);
      nextAttrs.push(at);
    };
    const tc = tris.length / 3;
    for (let t = 0; t < tc; t += 1) {
      const v = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
      const at = attrs[t];
      const sp = [wantSplit(v[0], v[1]), wantSplit(v[1], v[2]), wantSplit(v[2], v[0])];
      const n = sp.filter(Boolean).length;
      if (n === 0) {
        emit(v[0], v[1], v[2], at);
        continue;
      }
      any = true;
      if (n === 1) {
        const s = sp.indexOf(true);
        const a = v[s];
        const b = v[(s + 1) % 3];
        const c = v[(s + 2) % 3];
        const m = midOf(a, b);
        emit(a, m, c, at);
        emit(m, b, c, at);
      } else if (n === 2) {
        const u = sp.indexOf(false);
        const a = v[(u + 1) % 3];
        const b = v[(u + 2) % 3];
        const c = v[u];
        const m0 = midOf(a, b);
        const m1 = midOf(b, c);
        emit(m0, b, m1, at);
        emit(a, m0, m1, at);
        emit(a, m1, c, at);
      } else {
        const m0 = midOf(v[0], v[1]);
        const m1 = midOf(v[1], v[2]);
        const m2 = midOf(v[2], v[0]);
        emit(v[0], m0, m2, at);
        emit(m0, v[1], m1, at);
        emit(m2, m1, v[2], at);
        emit(m0, m1, m2, at);
      }
    }
    if (!any) break;
    splitCount += 1;
    tris = nextTris;
    attrs = nextAttrs;
    if (tris.length / 3 > MAX_TRIANGLES) break;
  }
  return { tris, attrs, rounds: splitCount };
}

/**
 * @param {Buffer} buffer filled STL (원점=커넥션 원점, 축=Z)
 * @returns {{ ok: boolean, status: string, reason?: string, buffer?: Buffer|null, detail?: object }}
 */
export function smoothConnectionTaper(buffer) {
  try {
    const { mesh, probe } = prepareCuffMesh(buffer);
    const taper = measureConnectionTaper(probe);
    if (!taper) return { ok: false, status: "skipped", reason: "11° 원뿔 없음", buffer: null };
    const zTop = taper.departZ > 0 ? taper.departZ : taper.measuredTopZ - 0.02;
    const zBottom = coneBottomZ(probe, taper.coneAt);
    const { verts, faces, faceAttr } = mesh;
    const nv = verts.length / 3;
    const pos = Array.from(verts);
    const eligible = new Array(nv).fill(0);
    let count = 0;
    let maxUm = 0;
    for (let v = 0; v < nv; v += 1) {
      const x = verts[v * 3];
      const y = verts[v * 3 + 1];
      const z = verts[v * 3 + 2];
      if (z < zBottom || z > zTop) continue;
      const r = Math.hypot(x, y);
      if (r < 1e-6) continue;
      const dev = taper.coneAt(z) - r;
      if (Math.abs(dev) > CONE_SNAP_TOL_MM) continue;
      const w = 1 - smooth01((z - (zTop - TOP_RAMP_MM)) / TOP_RAMP_MM);
      if (w <= 0) continue;
      const rNew = r + dev * w;
      pos[v * 3] = (x / r) * rNew;
      pos[v * 3 + 1] = (y / r) * rNew;
      if (w >= 1 - 1e-9) eligible[v] = 1;
      if (Math.abs(dev) >= 1e-7) {
        count += 1;
        maxUm = Math.max(maxUm, Math.abs(dev * w) * 1000);
      }
    }
    const refined = refineCone({
      pos,
      tris: Array.from(faces),
      attrs: Array.from(faceAttr, (a) => a || 0),
      eligible,
      coneAt: taper.coneAt,
    });
    if (!count && !refined.rounds) return { ok: false, status: "skipped", reason: "다듬을 꼭짓점 없음", buffer: null };
    const { tris, attrs } = refined;
    const tc = tris.length / 3;
    const positions = new Float64Array(tc * 9);
    const attributes = new Uint16Array(tc);
    for (let f = 0; f < tc; f += 1) {
      let touched = false;
      for (let k = 0; k < 3; k += 1) {
        const v = tris[f * 3 + k];
        positions[f * 9 + k * 3] = pos[v * 3];
        positions[f * 9 + k * 3 + 1] = pos[v * 3 + 1];
        positions[f * 9 + k * 3 + 2] = pos[v * 3 + 2];
        if (eligible[v]) touched = true;
      }
      attributes[f] = touched ? CONNECTION_TAPER_SMOOTH_ATTRIBUTE : attrs[f];
    }
    return {
      ok: true,
      status: "applied",
      buffer: writeBinaryStl({ positions, attributes }),
      detail: {
        movedVertices: count,
        maxMovedUm: Math.round(maxUm * 10) / 10,
        splitRounds: refined.rounds,
        triangles: tc,
        zTop: Math.round(zTop * 1000) / 1000,
        zBottom: Math.round(zBottom * 1000) / 1000,
      },
    };
  } catch (error) {
    return { ok: false, status: "failed", reason: String(error?.message || error), buffer: null };
  }
}
