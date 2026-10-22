// related files:
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js (Z_a 스펙 SSOT)
// - web/backend/services/abutmentStl/cuffBlend.service.js (S3·DB·worker)
// - web/backend/utils/screwHoleFill.js (parseStl / writeBinaryStl)
// - web/backend/tests/unit/cuffBlend.test.js
// - bg/pc1/rhino-server/compute/scripts/fill_steps.py (원점 근처 수직 불량 보정 — 별개)
//
// filled STL(정렬 완료, 원점=커넥션 원점 직경, 축=Z)의 커넥션 상단 ~ 커프 하단 이음새를 다시 만든다.
// - auto: 커넥션 상단 Z_a ~ 단차가 끝난 Z_b 사이를 곡률까지 이어지는(G2) 곡면으로 교체
// - redesign(Re): 70°보다 누운(접시형) 커프를 피니시라인-0.2mm ~ Z_a 사이 G2 곡면으로 교체(의뢰자 제안·제조사 Re 버튼)
// 제조사 커넥션(Z_a 아래)과 피니시라인 아래 0.2mm 위쪽은 정점 하나도 옮기지 않는다.
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";
import { TAPER_SLOPE, taperTopDiameterOf, CUFF_CONNECTION_SPECS } from "./cuffConnectionSpecs.js";

export const CUFF_BLEND_VERSION = "cuff-blend-1";
/** 이 attribute의 삼각형은 커프 보정 곡면이다. */
export const CUFF_BLEND_PATCH_ATTRIBUTE = 0x4342;

export const FL_PROTECT_MM = 0.2;
/** auto 이음이 평면 Z_b에서 오목하게 못 이어질 때, 피니시라인 곡선 아래 이만큼에서 끝낸다. */
const FINISH_KINK_OFFSET_MM = 0.005;
/** 피니시라인 점에서 이 높이 안에 있는 날카로운 모서리 한 바퀴를 마진 모서리로 본다. */
const CREASE_WINDOW_MM = 0.03;
const CREASE_MIN_DEG = 20;
/** 새로 만든 꼭짓점이 피니시라인 곡선 아래로 최소 이만큼 떨어져 있어야 한다(오프셋 5µm보다 작아야 재시도가 안 걸린다). */
const FINISH_MIN_CLEARANCE_MM = 0.003;
const WELD_EPS = 1e-5;
const MEASURE_BINS = 72;
const PROFILE_BINS = 720;
/** 곡선·둘레 저역 통과 그리드(1°). Esprit 두점사이 각도 제한(1°)과 맞춘다. STL에는 selectMeshColumns가 고른 열만 쓴다. */
const STRIP_COLUMNS = 360;
const columnsForDeg = (deg) => Math.max(1, Math.round((STRIP_COLUMNS * deg) / 360));
/** 행 사이 최소 간격(mm). */
const ROW_PITCH_MM = 0.025;
/** 옆모습이 이만큼 꺾이면 행을 하나 둔다. */
const ROW_TURN_DEG = 1.0;
/** 곧은 구간 행 간격 상한(mm). */
const ROW_MAX_PITCH_MM = 0.2;
const ROW_TURN_SAMPLES = 400;
const ROW_TURN_COLUMN_STRIDE = columnsForDeg(3);
/**
 * 둘레 곡선이 이만큼 꺾이면 열을 하나 둔다(행과 같은 기준). 열을 각도로 똑같이 나누면 어금니 단면 모서리에서
 * 한 칸이 6° 넘게 꺾여 가공면에 세로 결이 남는다.
 */
const COLUMN_TURN_DEG = 1.0;
const COLUMN_MAX_ARC_MM = 0.2;
const COLUMN_TURN_SMOOTH_HALF = columnsForDeg(1.5);
/**
 * 이음 위 끝에서 이만큼 아래까지는 새 곡선을 원본 곡면에 서서히 섞는다(위 끝 접선·반경이 원본과 같아져 선이 둘로 보이지 않는다).
 * 오목 곡선은 위 끝에서 원본보다 20°쯤 서 있어 이 안에서 꺾임을 되돌린다. 짧으면 그 꺾임이 몰려 가로 결이 된다.
 */
const SEAM_BLEND_DEPTH_MM = 0.45;
/**
 * 이음 맨 위 행은 원본 면을 따라 모서리에서 이만큼(mm) 떨어진다. 여기서 원본 곡면에 다 붙고, 그 위는 마진 모서리 꼭짓점까지 한 줄이다.
 * 높이로 재면 마진 아래가 거의 수평인 턱에서 첫 줄이 안쪽으로 0.5mm쯤 가 버려, 둥근 턱이 평면 한 장으로 잘린다.
 */
const SEAM_TOP_DEPTH_MM = 0.06;
/** 이음 맨 위 행은 높이로도 모서리 아래 최소 이만큼(mm)이다. */
const SEAM_TOP_MIN_DROP_MM = 0.01;
/** 이음 행 후보 간격·최소 간격(mm). 행은 옆모습이 ROW_TURN_DEG 꺾일 때마다 고른다. */
const SEAM_CANDIDATE_STEP_MM = 0.0025;
const SEAM_MIN_PITCH_MM = 0.005;
/** 이음 섞기 틀의 원본 접선은 마진 모서리 아래 이 두 깊이(mm) 사이에서 잰다. */
const SEAM_FRAME_NEAR_MM = 0.01;
const SEAM_FRAME_FAR_MM = 0.05;
/** 이음 섞기에서 원본 옆모습은 위 끝에서 이 거리(mm) 안의 선분만 본다. */
const SEAM_FRAME_REACH_MM = 1.5;

const TAPER_FIT_TOL_MM = 0.008;
const TAPER_ROUND_TOL_MM = 0.012;
const TAPER_MATCH_BELOW_MM = 0.05;
const TAPER_MATCH_ABOVE_MM = 0.08;
/** 원뿔 이탈: 72개 bin 중 이 개수 이상이 허용치(최소 3µm)를 넘으면 벗어난 것으로 본다. */
const CONE_DEPART_MIN_BINS = 2;
const CONE_DEPART_MIN_TOL_MM = 0.003;
const ALT_SPEC_DIAMETER_TOL_MM = 0.02;

const MIN_BAND_MM = 0.15;
/** 피니시라인 곡선을 따라가는 이음은 이 높이부터 만든다. */
const MIN_FOLLOW_BAND_MM = 0.02;
const MAX_BAND_MM = 2.0;
/** auto 이음 띠 상한: 피니시라인 최저 Z에서 이만큼 아래, 그리고 커넥션~피니시라인 높이의 이 비율 이내. */
const AUTO_FL_MARGIN_MM = 0.2;
const AUTO_MAX_BAND_FRACTION = 0.6;
const CLEAN_WINDOW_MM = 0.3;
const CLEAN_STEP_MM = 0.02;
const CLEAN_MAX_JUMP_MM = 0.02;
const CLEAN_MAX_SLOPE_CHANGE = 0.6;
const AUTO_MAX_MEAN_SLOPE = Math.tan((60 * Math.PI) / 180);
const AUTO_MAX_SLOPE = Math.tan((70 * Math.PI) / 180);
/** auto 이음 기울기 상한을 마진 아래 원본 기울기로 올릴 때 더 허용하는 여유(dr/dz). */
const AUTO_BELOW_SLOPE_TOL = 0.05;
/** 커프 기울기가 70°를 넘지 않도록 프로파일 제어점 기울기를 묶는 상한(약 67.5°). */
const PROFILE_MAX_SLOPE = Math.tan((67 * Math.PI) / 180);
/** 70° 이하 맞춤을 위한 볼록 변형은 원뿔 끝(Z_a) 상방 이 높이(mm) 아래로는 적용하지 않는다. */
const CUFF_DEFORM_MIN_ABOVE_ZA_MM = 0.02;
/** Z=0.3부터 볼록 변형 곡선으로 넘어가는 높이(mm). 넘어가기는 열 높이의 이 비율(t) 안에서 끝나고, 이보다 짧으면 넘어가지 않는다. 짧게 넘어가면 넘어가는 끝에서 기울기가 70°를 넘쳤다가 다시 눕는다. */
const CUFF_DEFORM_RAMP_MM = 0.4;
const CUFF_DEFORM_RAMP_MAX_T = 1;
const CUFF_DEFORM_RAMP_MIN_T = 0.05;
/** 피니시라인 min_z가 이 높이(mm) 이하일 때만 70° 초과 커프 볼록 변형·급경사 seamOrigScale을 켠다(낮은 마진·불완전 가공에 가까운 케이스). */
const CUFF_CONVEX_DEFORM_MAX_FINISH_MIN_Z_MM = 1.0;
/** 마진 아래 원본 기울기가 이 값(58°)을 넘기 시작하면 65°까지 원본 이음 섞기 비중을 0으로 줄여 70° 초과 턱을 없앤다. */
const SEAM_ORIG_FADE_START_SLOPE = Math.tan((48 * Math.PI) / 180);
const SEAM_ORIG_FADE_END_SLOPE = Math.tan((60 * Math.PI) / 180);
const MAX_OVERSHOOT_MM = 0.05;
/** 이음 곡선 최대 |r''|(1/mm). 옆모습 곡률 반경 약 0.25mm 이상. */
const MAX_BLEND_CURVATURE = 4;
const MAX_TOP_CURVATURE = 20;
const clampCurvature = (c) => Math.max(-MAX_TOP_CURVATURE, Math.min(MAX_TOP_CURVATURE, c));
const MIN_WALL_MM = 0.3;
/** 이보다 축 둘레로 넓게 걸친 삼각형은 곡면이 아니라 겹친 캡 조각이다. */
const FIN_SPAN_RAD = (30 * Math.PI) / 180;
const BOTTOM_ON_CONE_TOL_MM = 0.02;
const BOTTOM_CHORD_BLEND_MM = 0.18;
const BOTTOM_EDGE_MAX_RAD = (1.25 * Math.PI) / 180;

/** Re 기준: 이보다 누운 커프를 접시형으로 보고, 재디자인 곡선도 이보다 눕지 않게 한다. */
export const FLAT_SLOPE = Math.tan((70 * Math.PI) / 180);
const FLAT_SLOPE_TOL = 0.05;

const TWO_PI = Math.PI * 2;

class CuffBlendError extends Error {
  constructor(status, reason, detail = {}) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

const fail = (status, reason, detail) => {
  throw new CuffBlendError(status, reason, detail);
};

const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const angleOf = (x, y) => Math.atan2(y, x);
const wrapAngle = (a) => {
  let t = a % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
};

// ---------------------------------------------------------------------------
// 메시

function weldSoup(positions, attributes) {
  const triCount = Math.floor(positions.length / 9);
  const keyToIndex = new Map();
  const verts = [];
  const faces = [];
  const faceAttr = [];
  const inv = 1 / WELD_EPS;
  for (let t = 0; t < triCount; t += 1) {
    const idx = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      const x = positions[o];
      const y = positions[o + 1];
      const z = positions[o + 2];
      const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
      let v = keyToIndex.get(key);
      if (v === undefined) {
        v = verts.length / 3;
        verts.push(x, y, z);
        keyToIndex.set(key, v);
      }
      idx[k] = v;
    }
    if (idx[0] === idx[1] || idx[1] === idx[2] || idx[0] === idx[2]) continue;
    faces.push(idx[0], idx[1], idx[2]);
    faceAttr.push(attributes?.[t] || 0);
  }
  return { verts, faces, faceAttr };
}

function largestComponent(verts, faces) {
  const nv = verts.length / 3;
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i += 1) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const fc = faces.length / 3;
  for (let f = 0; f < fc; f += 1) {
    const a = find(faces[f * 3]);
    const b = find(faces[f * 3 + 1]);
    const c = find(faces[f * 3 + 2]);
    if (a !== b) parent[a] = b;
    const b2 = find(b);
    if (find(c) !== b2) parent[find(c)] = b2;
  }
  const counts = new Map();
  for (let f = 0; f < fc; f += 1) {
    const r = find(faces[f * 3]);
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  let main = -1;
  let best = -1;
  for (const [r, n] of counts) {
    if (n > best) {
      best = n;
      main = r;
    }
  }
  const inMain = new Uint8Array(fc);
  for (let f = 0; f < fc; f += 1) inMain[f] = find(faces[f * 3]) === main ? 1 : 0;
  return inMain;
}

/** z 슬랩 인덱스로 평면 단면의 외곽 반경을 각도별로 잰다. */
class RadialProbe {
  constructor(verts, faces) {
    this.verts = verts;
    this.faces = faces;
    const fc = faces.length / 3;
    this.zmin = new Float64Array(fc);
    this.zmax = new Float64Array(fc);
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < fc; f += 1) {
      const za = verts[faces[f * 3] * 3 + 2];
      const zb = verts[faces[f * 3 + 1] * 3 + 2];
      const zc = verts[faces[f * 3 + 2] * 3 + 2];
      this.zmin[f] = Math.min(za, zb, zc);
      this.zmax[f] = Math.max(za, zb, zc);
      lo = Math.min(lo, this.zmin[f]);
      hi = Math.max(hi, this.zmax[f]);
    }
    this.lo = lo;
    this.hi = hi;
    this.slab = 0.05;
    const n = Math.max(1, Math.ceil((hi - lo) / this.slab) + 1);
    this.slabs = Array.from({ length: n }, () => []);
    for (let f = 0; f < fc; f += 1) {
      const s0 = Math.floor((this.zmin[f] - lo) / this.slab);
      const s1 = Math.floor((this.zmax[f] - lo) / this.slab);
      for (let s = s0; s <= s1; s += 1) this.slabs[s].push(f);
    }
    this.cache = new Map();
  }

  /** 각도 bin별 최대 반경(외곽). 빈 bin은 NaN. */
  bins(z, count) {
    const key = `${count}:${z.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const out = new Float64Array(count).fill(NaN);
    const s = Math.floor((z - this.lo) / this.slab);
    if (s < 0 || s >= this.slabs.length) return out;
    const { verts, faces } = this;
    const put = (x, y) => {
      const r = Math.hypot(x, y);
      const b = Math.min(count - 1, Math.floor((wrapAngle(angleOf(x, y)) / TWO_PI) * count));
      if (!(out[b] >= r)) out[b] = r;
    };
    const hit = [];
    for (const f of this.slabs[s]) {
      if (this.zmin[f] > z || this.zmax[f] < z || this.zmin[f] === this.zmax[f]) continue;
      hit.length = 0;
      for (let k = 0; k < 3; k += 1) {
        const a = faces[f * 3 + k] * 3;
        const b = faces[f * 3 + ((k + 1) % 3)] * 3;
        const za = verts[a + 2];
        const zb = verts[b + 2];
        if (za === zb || (za - z) * (zb - z) > 0 || zb === z) continue;
        const t = (z - za) / (zb - za);
        hit.push(verts[a] + t * (verts[b] - verts[a]), verts[a + 1] + t * (verts[b + 1] - verts[a + 1]));
      }
      if (hit.length < 4) {
        if (hit.length === 2) put(hit[0], hit[1]);
        continue;
      }
      const [x, y, x2, y2] = hit;
      // 긴 선분이 여러 bin에 걸치면 사이 bin도 채운다
      const r = Math.hypot(x, y) || 1;
      const steps = Math.max(1, Math.min(64, Math.ceil((Math.hypot(x2 - x, y2 - y) / r / TWO_PI) * count * 2)));
      for (let i = 0; i <= steps; i += 1) {
        const w = i / steps;
        put(x + w * (x2 - x), y + w * (y2 - y));
      }
    }
    this.cache.set(key, out);
    return out;
  }

  /** 높이 z, 각도 θ 방향 반직선이 곡면과 만나는 가장 바깥 반경(bin 없이 정확히). 없으면 NaN. */
  rayRadius(theta, z) {
    const s = Math.floor((z - this.lo) / this.slab);
    if (s < 0 || s >= this.slabs.length) return NaN;
    const { verts, faces } = this;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    let best = NaN;
    const hit = [];
    for (const f of this.slabs[s]) {
      if (this.zmin[f] > z || this.zmax[f] < z || this.zmin[f] === this.zmax[f]) continue;
      hit.length = 0;
      for (let k = 0; k < 3; k += 1) {
        const a = faces[f * 3 + k] * 3;
        const b = faces[f * 3 + ((k + 1) % 3)] * 3;
        const za = verts[a + 2];
        const zb = verts[b + 2];
        if (za === zb || (za - z) * (zb - z) > 0 || zb === z) continue;
        const t = (z - za) / (zb - za);
        hit.push(verts[a] + t * (verts[b] - verts[a]), verts[a + 1] + t * (verts[b + 1] - verts[a + 1]));
      }
      if (hit.length < 4) continue;
      const [x1, y1, x2, y2] = hit;
      // 반직선 p = r·d 와 선분 p1 + u·(p2 − p1) 의 교점
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const r = (x1 * ey - y1 * ex) / den;
      const u = (x1 * dy - y1 * dx) / den;
      if (r > 0 && u >= -1e-9 && u <= 1 + 1e-9 && !(best >= r)) best = r;
    }
    return best;
  }

  /**
   * 각도 θ 반평면으로 [zLo, zHi]를 한 번 잘라 둔다. 돌려준 함수는 rayRadius(θ, z)와 같은 값(그 높이의 가장 바깥 반경, 없으면 NaN)을
   * 면을 다시 훑지 않고 낸다. 같은 열에서 높이만 바꿔 여러 번 잴 때 쓴다.
   */
  meridian(theta, zLo, zHi) {
    const { verts, faces } = this;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const segs = [];
    const s0 = Math.max(0, Math.floor((zLo - this.lo) / this.slab));
    const s1 = Math.min(this.slabs.length - 1, Math.floor((zHi - this.lo) / this.slab));
    const seen = new Set();
    const pts = [];
    for (let sl = s0; sl <= s1; sl += 1) {
      for (const f of this.slabs[sl]) {
        if (seen.has(f) || this.zmin[f] > zHi || this.zmax[f] < zLo || this.zmin[f] === this.zmax[f]) continue;
        seen.add(f);
        pts.length = 0;
        for (let k = 0; k < 3; k += 1) {
          const a = faces[f * 3 + k] * 3;
          const b = faces[f * 3 + ((k + 1) % 3)] * 3;
          const wa = -verts[a] * s + verts[a + 1] * c;
          const wb = -verts[b] * s + verts[b + 1] * c;
          if (wa === wb || wa * wb > 0 || wb === 0) continue;
          const t = wa / (wa - wb);
          const x = verts[a] + t * (verts[b] - verts[a]);
          const y = verts[a + 1] + t * (verts[b + 1] - verts[a + 1]);
          pts.push(x * c + y * s, verts[a + 2] + t * (verts[b + 2] - verts[a + 2]));
        }
        if (pts.length < 4 || pts[0] <= 0 || pts[2] <= 0 || pts[1] === pts[3]) continue;
        segs.push(pts[0], pts[1], pts[2], pts[3]);
      }
    }
    const fn = (z) => {
      let best = NaN;
      for (let i = 0; i < segs.length; i += 4) {
        const za = segs[i + 1];
        const zb = segs[i + 3];
        if ((za - z) * (zb - z) > 0) continue;
        const r = segs[i] + ((z - za) / (zb - za)) * (segs[i + 2] - segs[i]);
        if (!(best >= r)) best = r;
      }
      return best;
    };
    /**
     * 옆모습 평면에서 원점 o, 단위 방향 d(아래로), 바깥 법선 nrm인 틀로 잰다. 돌려준 함수는 d 방향 거리 u에서 축 d에 가장 가까운 면의
     * 법선 거리(없으면 NaN). o에서 reach 안의 선분만 본다.
     * 마진 아래가 거의 수평인 턱이면 같은 높이로 잰 반경은 높이에 매우 민감해서, 접선 틀로 잰다.
     */
    fn.frame = (o, d, nrm, reach) => {
      const local = [];
      for (let i = 0; i < segs.length; i += 4) {
        const ar = segs[i] - o[0];
        const az = segs[i + 1] - o[1];
        const br = segs[i + 2] - o[0];
        const bz = segs[i + 3] - o[1];
        if (Math.min(Math.hypot(ar, az), Math.hypot(br, bz)) > reach) continue;
        local.push(ar * d[0] + az * d[1], ar * nrm[0] + az * nrm[1], br * d[0] + bz * d[1], br * nrm[0] + bz * nrm[1]);
      }
      return (u) => {
        let best = NaN;
        for (let i = 0; i < local.length; i += 4) {
          const ua = local[i];
          const ub = local[i + 2];
          if ((ua - u) * (ub - u) > 0 || ua === ub) continue;
          const v = local[i + 1] + ((u - ua) / (ub - ua)) * (local[i + 3] - local[i + 1]);
          if (!(Math.abs(best) <= Math.abs(v))) best = v;
        }
        return best;
      };
    };
    return fn;
  }

  /** 각도 θ의 외곽 반경(bin 선형 보간, 빈 bin은 이웃으로 메움). */
  radiusFn(z) {
    const raw = this.bins(z, PROFILE_BINS);
    const n = raw.length;
    const filled = Float64Array.from(raw);
    let missing = 0;
    for (let i = 0; i < n; i += 1) if (!Number.isFinite(filled[i])) missing += 1;
    if (missing > n * 0.15) return null;
    for (let i = 0; i < n; i += 1) {
      if (Number.isFinite(filled[i])) continue;
      let l = 1;
      while (!Number.isFinite(raw[(i - l + n) % n])) l += 1;
      let r = 1;
      while (!Number.isFinite(raw[(i + r) % n])) r += 1;
      const a = raw[(i - l + n) % n];
      const b = raw[(i + r) % n];
      filled[i] = a + ((b - a) * l) / (l + r);
    }
    return (theta) => {
      const p = (wrapAngle(theta) / TWO_PI) * n - 0.5;
      const i0 = Math.floor(p);
      const w = p - i0;
      return filled[(i0 + n) % n] * (1 - w) + filled[(i0 + 1) % n] * w;
    };
  }
}

const median = (arr) => {
  const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------------
// 커넥션 테이퍼

/** 원점 아래 11° 원뿔을 맞추고, 원뿔이 끝나는 Z를 잰다. */
export function measureConnectionTaper(probe) {
  const pts = [];
  for (let z = -0.5; z <= -0.049; z += 0.05) {
    const bins = probe.bins(z, MEASURE_BINS);
    const m = median(Array.from(bins));
    if (!Number.isFinite(m)) continue;
    const round = Array.from(bins).filter((r) => Math.abs(r - m) < TAPER_ROUND_TOL_MM).length / MEASURE_BINS;
    if (round >= 0.8) pts.push([z, m]);
  }
  if (pts.length < 5) return null;
  // 기울기는 11° 고정, 절편만 맞춘다. 맞지 않으면(예: DENTIUM 약 15°) 실측 기울기(5~20°)로 다시 맞춘다.
  const fitWith = (slope) => {
    const r0 = median(pts.map(([z, r]) => r - slope * z));
    const resid = Math.max(...pts.map(([z, r]) => Math.abs(r - (r0 + slope * z))));
    return { r0, resid, slope };
  };
  let fit = fitWith(TAPER_SLOPE);
  if (fit.resid > TAPER_FIT_TOL_MM * 2) {
    const n = pts.length;
    const mz = pts.reduce((s, p) => s + p[0], 0) / n;
    const mr = pts.reduce((s, p) => s + p[1], 0) / n;
    const num = pts.reduce((s, p) => s + (p[0] - mz) * (p[1] - mr), 0);
    const den = pts.reduce((s, p) => s + (p[0] - mz) ** 2, 0);
    const slope = den > 0 ? num / den : NaN;
    const alt = Number.isFinite(slope) ? fitWith(slope) : null;
    const deg = alt ? (Math.atan(alt.slope) * 180) / Math.PI : NaN;
    if (!alt || deg < 5 || deg > 20 || alt.resid > TAPER_FIT_TOL_MM * 2) return null;
    fit = alt;
  }
  const { r0, slope: taperSlope } = fit;

  const coneAt = (z) => r0 + taperSlope * z;
  const fits = (z) => {
    const bins = Array.from(probe.bins(z, MEASURE_BINS));
    const near = bins.filter((r) => Math.abs(r - coneAt(z)) < TAPER_ROUND_TOL_MM).length;
    return near / MEASURE_BINS >= 0.8;
  };
  let top = 0;
  let miss = 0;
  for (let z = 0.01; z < 3; z += 0.01) {
    if (fits(z)) {
      top = z;
      miss = 0;
    } else if (++miss > 2) break;
  }
  return { r0, slope: taperSlope, originDiameter: 2 * r0, coneAt, measuredTopZ: top, departZ: coneDepartZ(probe, coneAt, top) };
}

/**
 * 원뿔에서 실제로 벗어나기 시작하는 높이. measuredTopZ는 둘레 80%가 ±12µm 안이면 원뿔로 보므로,
 * 일부 열이 이미 벌어진 뒤에야 끝난다. 그 사이를 원본으로 두고 이음을 11°로 다시 출발시키면 볼록한 어깨가 된다.
 * 허용치는 원점 아래 원뿔 면의 메시 오차에서 정한다.
 */
function coneDepartZ(probe, coneAt, top) {
  const maxDev = (z) => {
    const devs = Array.from(probe.bins(z, MEASURE_BINS))
      .filter(Number.isFinite)
      .map((r) => Math.abs(r - coneAt(z)))
      .sort((a, b) => b - a);
    return devs.length >= CONE_DEPART_MIN_BINS ? devs[CONE_DEPART_MIN_BINS - 1] : NaN;
  };
  let noise = 0;
  for (let z = -0.3; z <= -0.049; z += 0.01) {
    const d = maxDev(z);
    if (Number.isFinite(d)) noise = Math.max(noise, d);
  }
  const tol = Math.max(CONE_DEPART_MIN_TOL_MM, 1.5 * noise + 0.001);
  let last = 0;
  let miss = 0;
  for (let z = 0.01; z <= top + 1e-9; z += 0.01) {
    if (maxDev(z) <= tol) {
      last = z;
      miss = 0;
    } else if (++miss > 1) break;
  }
  return Math.max(0, last - 0.01);
}

/**
 * 원뿔 맞춤이 안 될 때의 대체 측정. 원점 근처에서 위로 올라가며 반경이 갑자기 커지는 첫 계단을 찾고,
 * 그 바로 아래 반경·기울기(원뿔 11° 또는 수직)를 이음 시작 조건으로 쓴다.
 */
function measureConnectionStepTop(probe) {
  const radiusAt = (z) => median(Array.from(probe.bins(z, MEASURE_BINS)));
  const STEP = 0.01;
  const JUMP_MM = 0.02;
  let zStep = null;
  for (let z = -0.6; z <= 1.0; z += STEP) {
    const lo = radiusAt(z);
    const hi = radiusAt(z + 2 * STEP);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi - lo > JUMP_MM) {
      zStep = z;
      break;
    }
  }
  if (zStep == null) return null;
  const zA = zStep - STEP;
  const ra = radiusAt(zA);
  const rBelow = radiusAt(zA - 0.15);
  if (!Number.isFinite(ra) || !Number.isFinite(rBelow)) return null;
  // 수직이면 0, 원뿔이면 11° 기울기로 맞춘다(그 사이는 실측).
  const slope = Math.max(0, Math.min(TAPER_SLOPE, (ra - rBelow) / 0.15));
  const bins = Array.from(probe.bins(zA, MEASURE_BINS));
  if (bins.filter((r) => Math.abs(r - ra) < TAPER_ROUND_TOL_MM).length / MEASURE_BINS < 0.8) return null;
  const r0 = ra - slope * zA;
  return {
    r0,
    slope,
    originDiameter: 2 * r0,
    coneAt: (z) => r0 + slope * z,
    measuredTopZ: zA,
    fromStep: true,
  };
}

/**
 * 입력 스펙의 Z_a가 형상과 맞는지 본다. 안 맞으면 테이퍼 끝 직경이 같은 다른 스펙을 찾는다.
 * @returns {{ zA: number, matchedKey: string, warning: string | null }}
 */
export function resolveConnectionTop(taper, spec, specKey) {
  const zA = spec.taperHeightMm;
  const top = taper.measuredTopZ;
  if (top >= zA - TAPER_MATCH_BELOW_MM && top <= zA + TAPER_MATCH_ABOVE_MM) {
    // 스펙보다 원뿔이 먼저 끝나면(기공소 턱이 스펙 Z_a 아래) 원뿔이 끝난 곳에서 잇는다
    return { zA: Math.min(zA, top - 0.01), matchedKey: specKey, warning: null };
  }
  if (spec.labExtendsTaper && top > zA) {
    return { zA, matchedKey: specKey, warning: null };
  }
  const measuredTopD = 2 * taper.coneAt(top);
  // 파일마다 원점 높이가 달라 Z가 어긋나도 끝 직경이 입력 스펙과 같으면 입력 스펙으로 본다. Z_a는 실측 원뿔에서 다시 구한다.
  const ownTopD = taperTopDiameterOf(spec);
  if (Math.abs(ownTopD - measuredTopD) <= ALT_SPEC_DIAMETER_TOL_MM) {
    const ownZa = (ownTopD / 2 - taper.r0) / (taper.slope || TAPER_SLOPE);
    return { zA: Math.min(ownZa, top - 0.01), matchedKey: specKey, warning: null };
  }
  for (const alt of CUFF_CONNECTION_SPECS) {
    if (alt === spec) continue;
    const altTopD = taperTopDiameterOf(alt);
    if (Math.abs(altTopD - measuredTopD) > ALT_SPEC_DIAMETER_TOL_MM) continue;
    const altZa = (altTopD / 2 - taper.r0) / (taper.slope || TAPER_SLOPE);
    return {
      zA: Math.min(altZa, top - 0.01),
      matchedKey: alt.key,
      warning: `입력 스펙(${specKey})과 형상이 달라 ${alt.key} 테이퍼로 처리했습니다.`,
    };
  }
  return fail("spec-pending", "커넥션 테이퍼가 등록된 스펙과 맞지 않습니다. 개발팀 확인이 필요합니다.", {
    measuredTaperTopZ: round3(top),
    measuredTaperTopDiameter: round3(measuredTopD),
    specTaperHeightMm: zA,
  });
}

// ---------------------------------------------------------------------------
// 프로파일

/** 5차 Hermite: 양끝 값·1차·2차 미분을 맞춘다(G2). */
function quinticHermite(p0, v0, a0, p1, v1, a1, h) {
  const m0 = v0 * h;
  const m1 = v1 * h;
  const c0 = a0 * h * h;
  const c1 = a1 * h * h;
  const value = (t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    return (
      p0 * (1 - 10 * t3 + 15 * t4 - 6 * t5) +
      m0 * (t - 6 * t3 + 8 * t4 - 3 * t5) +
      c0 * (0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5) +
      c1 * (0.5 * t3 - t4 + 0.5 * t5) +
      m1 * (-4 * t3 + 7 * t4 - 3 * t5) +
      p1 * (10 * t3 - 15 * t4 + 6 * t5)
    );
  };
  return value;
}

/**
 * 이음 곡선을 오목(r'' ≥ 0)으로 만든다. 볼록하게 부푼 곳은 뼈에 걸린다.
 * 표본의 아래 볼록 외피(greatest convex minorant)를 잡고 살짝 평활한다. 양끝 점은 그대로다.
 * @param {(t: number) => number} fn t∈[0,1]
 */
export function toConcaveProfile(fn, samples = 160, tangents = null) {
  if (tangents) {
    const shaped = toConcaveProfileTangent(fn, samples, tangents);
    if (shaped) return shaped;
  }
  return toConcaveProfilePlain(fn, samples);
}

/**
 * 양끝 접선(커넥션 원뿔·커프)을 바깥으로 이어 붙인 뒤 볼록 외피를 잡는다.
 * 외피가 양끝 접선보다 눕거나 서지 않아 Z_a·Z_b에서 꺾이지 않는다(볼록 모서리 없음).
 * 양끝 값이 접선 연장 위에 놓이지 못하면(커프가 원뿔 연장보다 낮음 등) null.
 * @param {{ m0: number, m1: number }} tangents t 단위 기울기(dr/dt)
 */
function toConcaveProfileTangent(fn, samples, { m0, m1 }) {
  const n = samples;
  const total = 3 * n;
  const y0 = fn(0);
  const y1 = fn(1);
  const ys = Array.from({ length: total + 1 }, (_, i) => {
    const t = i / n - 1;
    if (t < 0) return y0 + m0 * t;
    if (t > 1) return y1 + m1 * (t - 1);
    return fn(t);
  });
  const xs = ys.map((_, i) => i / n - 1);
  const hull = [];
  for (let i = 0; i <= total; i += 1) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (xs[b] - xs[a]) * (ys[i] - ys[a]) - (ys[b] - ys[a]) * (xs[i] - xs[a]);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(i);
  }
  let cur = new Array(total + 1);
  for (let k = 0; k + 1 < hull.length; k += 1) {
    const a = hull[k];
    const b = hull[k + 1];
    for (let i = a; i <= b; i += 1) cur[i] = ys[a] + ((ys[b] - ys[a]) * (xs[i] - xs[a])) / (xs[b] - xs[a]);
  }
  for (let pass = 0; pass < 24; pass += 1) {
    const next = cur.slice();
    for (let i = 1; i < total; i += 1) next[i] = 0.25 * cur[i - 1] + 0.5 * cur[i] + 0.25 * cur[i + 1];
    cur = next;
  }
  if (Math.abs(cur[n] - y0) > 0.002 || Math.abs(cur[2 * n] - y1) > 0.002) return null;
  return (t) => {
    const x = n + Math.max(0, Math.min(1, t)) * n;
    const i = Math.min(2 * n - 1, Math.floor(x));
    const v = cur[i] + (cur[i + 1] - cur[i]) * (x - i);
    // 양끝은 정확히 원뿔·커프 값에 맞춘다(<=2µm 보정)
    return v + (y0 - cur[n]) * (1 - t) + (y1 - cur[2 * n]) * t;
  };
}

/**
 * 단차 부위 직경은 따르지 않는 오목 이음 곡선: r = ra + s0·t + k·t² (t∈[0,1], k>0).
 * 끝 값(커프 r1)만 맞추고 항상 살짝 오목(r''≥0)이며 부드럽게 올라간다.
 * 단차 때문에 원뿔 접선·커프 접선을 다 맞추면 볼록하게 부풀 때 쓴다.
 * @param {number} h 띠 높이(mm)
 */
export function concaveBridgeProfile(ra, m0, r1, h) {
  const delta = r1 - ra;
  // 오목 최소량: r'' ≥ BRIDGE_MIN_CURVATURE(1/mm)
  const kMin = (BRIDGE_MIN_CURVATURE * h * h) / 2;
  // 원뿔 접선(m0)을 지키는 오목 곡선이 가능하면 그것을, 아니면 시작 기울기를 낮춰 오목을 지킨다.
  const k = Math.max(kMin, delta - m0);
  const s0 = delta - k;
  return (t) => {
    const x = Math.max(0, Math.min(1, t));
    return ra + s0 * x + k * x * x;
  };
}

const BRIDGE_MIN_CURVATURE = 1.2;
/** 위 끝 기울기를 오목 조건에 맞추느라 바꿔도 되는 최대 기울기 차(z 방향 dr/dz, 약 6°). */
const CONCAVE_SLOPE_TOL = 0.1;
const CONCAVE_MARGIN = 0.01;

/** 이음 곡선 모서리의 최대 곡률(1/mm). 클수록 모서리가 날카롭다(수직에 가깝게 오르다 늦게 꺾임). */
const CORNER_CURVATURE = 2.5;
/** 시작 기울기 상한(원본 기울기를 따르되 이 이하). */
const START_MAX_SLOPE = Math.tan((40 * Math.PI) / 180);
/** 위쪽 접선 최대 기울기(약 65°). */
const CORNER_MAX_END_SLOPE = Math.tan((65 * Math.PI) / 180);
/** 위쪽 끝 기울기 상한(65°). 예전 70° 상한보다 덜 눕혀 원본에 가깝게 퍼진다. */
const CORNER_END_SLOPE = Math.tan((63 * Math.PI) / 180);
/** 위쪽 최소 기울기(약 30°): 접시처럼 평평해지지 않게. */
const CORNER_MIN_END_SLOPE = Math.tan((35 * Math.PI) / 180);
/** 모서리(퍼지기 시작) 선호 위치. 낮을수록 원본처럼 일찍 퍼진다. */
const CORNER_PREF_T = 0.3;
/** 열 평균 반폭(약 ±12°). */
const SMOOTH_HALF_COLUMNS = columnsForDeg(12);
/** 긴 띠(mm) 기준과 그때의 시작 기울기(약 8°). */
const SMOOTH_MAX_SHIFT_MM = 0.04;
/** 위 끝 접선을 잴 때 쓰는 위 끝 아래 원본 구간(mm)과, 모서리 바로 아래 건너뛸 틈(mm). */
const TOP_BELOW_WINDOW_MM = 0.1;
const TOP_BELOW_GAP_MM = 0.005;
/** 위 끝 기울기 열 평균 반폭(약 ±12°). */
const TOP_SLOPE_SMOOTH_COLUMNS = columnsForDeg(12);
/** 위 끝 반경을 저주파(조화 K차 이하)만 남겨 매끈하게 한다. */
const TOP_RADIUS_HARMONICS = 6;
/** 원본에서 잰 위 끝·이음 반경의 둘레 저역 통과: 32차(11°)까지 그대로, 64차(5.6°)부터 0. 원본 열 결(약 3°)은 지운다. */
const ANGULAR_PASS_HARMONICS = 32;
const ANGULAR_STOP_HARMONICS = 64;
const HEIGHT_SMOOTH_OVERSHOOT_MM = 0.005;
/** 원본 곡면은 STRIP_COLUMNS/MEASURE_STRIDE 간격(360열 기준 2°)으로 광선을 쏘아 재고, 저역 통과로 전체 열로 늘린다. */
const MEASURE_STRIDE = 2;
/** 끝 기울기를 2차 호(2d − m0)보다 이만큼 더 세워 늦게 벌어지게(더 오목하게) 한다. */
const END_SLOPE_BOOST = 1.5;
/**
 * 둘째 제어점 간격 / 첫째 간격. 1이면 출발 곡률이 0이라 커넥션 원뿔에 G2로 붙는다.
 * 1보다 작으면 원뿔 끝에서 곡선이 안으로 꺾였다가 다시 벌어져 커넥션↔커프 경계가 볼록한 어깨로 보인다.
 */
const BEZIER_DIP = 1;
const LONG_BAND_MM = 2;
/** 띠 면 평균: 반폭(약 ±30°)과 위쪽 보존 지수(t^p). */
const BAND_SMOOTH_HALF_COLUMNS = columnsForDeg(30);
/** 이음 구간 각도 평균을 미리 구해 두는 t 단계 수(사이는 3차 보간). */
const SEAM_AVG_LEVELS = 64;
const BAND_SMOOTH_TOP_POWER = 3;
const BAND_SMOOTH_FADE_MM = 0.4;
const LONG_BAND_START_SLOPE = Math.tan((8 * Math.PI) / 180);

/**
 * 밥그릇 이음: 제어점 4개의 3차 베지어(= 시작·끝 값과 기울기를 지정한 3차 에르미트). 꺾임 없이 매끈하다.
 * 커넥션 쪽은 m0(거의 수직)로 시작해 위로 갈수록 벌어지고, 위 끝에서 기울기 e가 된다. t∈[0,1].
 * 오목이 깨지면 곡률이 일정한 2차 곡선(끝 기울기 = 2d − m0)으로 대체한다.
 * @param {number} m0 dr/dt 시작
 * @param {number} eTarget dr/dt 끝 목표(약 35~60°로 제한)
 * @returns {{ fn: (t: number) => number } | null} d < m0이면 null
 */
export function concaveHermiteProfile(ra, m0, r1, eTarget, h, endSlopeCap = CORNER_END_SLOPE) {
  const d = r1 - ra;
  // m0가 d−여유 로 잘린 뒤 d < m0+여유 는 부동소수점으로 참이 된다. 그 열은 여유가 딱 맞는 곡선이라 버린다.
  if (d + 1e-6 < m0 + CONCAVE_MARGIN * h) return null;
  const dMax = (PROFILE_MAX_SLOPE * h) / 4;
  let d0 = Math.min(dMax, Math.max(0, m0 / 4));
  const d1Min = d0 * BEZIER_DIP;
  const rest = d - d0 - d1Min;
  if (rest + 1e-6 < 2 * d1Min) return null;
  const eClamped = Math.max(CORNER_MIN_END_SLOPE * h, Math.min(endSlopeCap * h, eTarget));
  let d1;
  let d2;
  let d3;
  if (2 * rest <= eClamped) {
    const e = Math.max(2 * rest, Math.min(4 * (rest - d1Min), eClamped));
    d3 = e / 4;
    d1 = d1Min;
    d2 = rest - d3;
  } else {
    d3 = Math.min(dMax, eClamped / 4);
    const rem = d - d0 - d3;
    if (rem <= d1Min + d3) {
      d1 = d1Min;
      d2 = rem - d1;
    } else if (rem <= 2 * d3) {
      d2 = d3;
      d1 = rem - d2;
    } else {
      const ex = rem - 2 * d3;
      const cap12 = Math.max(0, dMax - d3);
      const add2 = Math.min(cap12, ex * 0.55);
      const add1 = Math.min(cap12, ex - add2);
      const left = ex - (add1 + add2);
      d2 = d3 + add2;
      d1 = d3 + add1;
      if (left > 0) {
        const a2 = Math.min(cap12 - add2, left);
        d2 += a2;
        const rem2 = left - a2;
        const a3 = Math.min(Math.max(0, dMax - d3), rem2);
        d3 += a3;
      }
    }
  }
  const c = [ra, ra + d0, ra + d0 + d1, ra + d0 + d1 + d2, r1];
  return {
    endSlope: (4 * d3) / h,
    convexDeformed: 2 * rest > eClamped,
    fn: (t) => {
      const u = 1 - t;
      return (
        c[0] * u ** 4 + 4 * c[1] * u ** 3 * t + 6 * c[2] * u ** 2 * t ** 2 + 4 * c[3] * u * t ** 3 + c[4] * t ** 4
      );
    },
  };
}

/**
 * 원본 곡면에서 둘레로 잰 값을 기공소 메시 열 간격과 무관하게 만든다.
 * 원본 꼭짓점 사이 현(chord)만큼 처진 값이 그대로 들어가면 원본 열 간격(보통 3°)마다 세로 결이 생긴다.
 * 등간격 열 값에서 ANGULAR_PASS_HARMONICS차까지는 그대로, ANGULAR_STOP_HARMONICS차부터는 0으로 줄인다(그 사이 cos 감쇠).
 * NaN이 하나라도 있으면 null.
 * @param {ArrayLike<number>} values 열(0..2π 등간격) 값
 * @param {number} [outN] 돌려줄 등간격 열 수
 */
function angularLowPass(values, outN = values?.length) {
  if (!values) return null;
  for (let i = 0; i < values.length; i += 1) if (!Number.isFinite(values[i])) return null;
  const span = ANGULAR_STOP_HARMONICS - ANGULAR_PASS_HARMONICS;
  return fourierLowPass(
    values,
    ANGULAR_STOP_HARMONICS - 1,
    (k) => (k <= ANGULAR_PASS_HARMONICS ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (k - ANGULAR_PASS_HARMONICS)) / span)),
    outN,
  );
}

/** 커프 곡면 최소 오목 곡률 반경(mm). 공구 반경 0.65mm 이상이 되도록 여유를 둔 목표 반경. */
export const CUFF_MIN_CONCAVE_RADIUS_MM = 0.78;
/** 제어점 보정량을 둘레로 고르는 이동 평균 반폭(열). 열마다 따로 메우면 이웃 열과 보정량이 달라 세로 주름이 진다. */
const MIN_RADIUS_DELTA_SMOOTH_HALF = columnsForDeg(3);
/** 보정 → 둘레 평활 → 남은 부족분 재보정 반복 횟수. 평활로 깎인 만큼을 다음 회에 다시 채운다. */
const MIN_RADIUS_ROUNDS = 24;

/**
 * 4차 베지어 이음 프로파일의 제어점을 조정해 자오선(종단면) 및 둘레 방향(3D 주곡률) 오목 곡률 반경이
 * CUFF_MIN_CONCAVE_RADIUS_MM(실효 공구 반경 ≥0.65mm) 이상이 되도록 한다.
 * 커넥션 원점 상방 CUFF_DEFORM_MIN_Z_MM(0.3mm) 아래는 건드리지 않으며, 피니시라인 위 끝 반경(c4)도 그대로 둔다.
 * 원래 프로파일에 제어점 보정량만 더하고, 보정량은 매 회 둘레로 평활한다(열마다 갈아 끼우면 보정 열 경계가 세로 주름이 된다).
 */
function enforceMinToolRadiusOnProfiles(profiles, hs, zA, canLiftD0 = false, tailWeights = null) {
  const n = profiles.length;
  // 4차 베지어 제어점은 양 끝과 t=¼·½·¾ 세 점으로 푼다. 끝 미분을 차분으로 재면 둘레 평활(3차 보간)된 곡선에서 어긋난다.
  const ctrl0 = profiles.map((fn) => {
    const c0 = fn(0);
    const c4 = fn(1);
    const q1 = 256 * fn(0.25) - 81 * c0 - c4;
    const q2 = 16 * fn(0.5) - c0 - c4;
    const q3 = 256 * fn(0.75) - c0 - 81 * c4;
    // q1 = 108·c1 + 54·c2 + 12·c3, q2 = 4·c1 + 6·c2 + 4·c3, q3 = 12·c1 + 54·c2 + 108·c3
    const c1mc3 = (q1 - q3) / 96;
    const c1pc3 = ((q1 + q3) / 2 - 9 * q2) / 24;
    const c2 = (q2 - 4 * c1pc3) / 6;
    return [c0, (c1pc3 + c1mc3) / 2, c2, (c1pc3 - c1mc3) / 2, c4];
  });
  if (!ctrl0.every((c) => c.every(Number.isFinite))) return profiles;
  const cur = ctrl0.map((c) => c.slice());
  let changed = false;
  for (let round = 0; round < MIN_RADIUS_ROUNDS; round += 1) {
    const next = cur.map((c) => c.slice());
    if (!enforceMinToolRadiusOnCtrl(next, hs, zA, canLiftD0, tailWeights)) break;
    changed = true;
    for (let k = 1; k <= 3; k += 1) {
      const step = circularSmooth(
        circularSmooth(
          next.map((c, j) => c[k] - cur[j][k]),
          MIN_RADIUS_DELTA_SMOOTH_HALF,
        ),
        MIN_RADIUS_DELTA_SMOOTH_HALF,
      );
      for (let j = 0; j < n; j += 1) cur[j][k] += step[j];
    }
  }
  if (!changed) return profiles;
  return profiles.map((fn, j) => {
    const e1 = cur[j][1] - ctrl0[j][1];
    const e2 = cur[j][2] - ctrl0[j][2];
    const e3 = cur[j][3] - ctrl0[j][3];
    if (Math.abs(e1) + Math.abs(e2) + Math.abs(e3) < 1e-9) return fn;
    return (t) => {
      const u = 1 - t;
      return fn(t) + 4 * e1 * u ** 3 * t + 6 * e2 * u ** 2 * t ** 2 + 4 * e3 * u * t ** 3;
    };
  });
}

/** enforceMinToolRadiusOnProfiles 한 회: 열별 4차 베지어 제어점(ctrl)을 제자리에서 고친다. 고친 열이 있으면 true. */
function enforceMinToolRadiusOnCtrl(ctrl, hs, zA, canLiftD0, tailWeights) {
  const n = ctrl.length;
  const modified = new Uint8Array(n);
  const dMaxs = hs.map((h) => (PROFILE_MAX_SLOPE * h) / 4);
  const stepLim = (h, dLo, dHi) => {
    const s = (4 * Math.min(dLo, dHi)) / h;
    return (h * h * Math.pow(1 + s * s, 1.5)) / (12 * CUFF_MIN_CONCAVE_RADIUS_MM);
  };
  for (let j = 0; j < n; j += 1) {
    const c = ctrl[j];
    const h = hs[j];
    const dMax = dMaxs[j];
    let d0 = c[1] - c[0];
    let d1 = c[2] - c[1];
    let d2 = c[3] - c[2];
    let d3 = c[4] - c[3];
    const hasConvexTail = tailWeights && tailWeights[j] > 1e-3 && d3 < d2;
    for (let pass = 0; pass < 40; pass += 1) {
      let changed = false;
      const lim23 = stepLim(h, d2, d3);
      if (d3 - d2 > lim23 + 1e-6) {
        const ex = d3 - d2 - lim23;
        d3 -= 0.5 * ex;
        d2 += 0.5 * ex;
        changed = true;
      }
      const lim12 = stepLim(h, d1, d2);
      if (d2 - d1 > lim12 + 1e-6) {
        const ex = d2 - d1 - lim12;
        if (hasConvexTail) {
          d2 -= 0.5 * ex;
          d1 += 0.5 * ex;
        } else {
          const to3 = Math.min(ex, Math.max(0, Math.min(dMax, d2 + lim23) - d3));
          d2 -= to3;
          d3 += to3;
          const rem1 = ex - to3;
          d2 -= 0.5 * rem1;
          d1 += 0.5 * rem1;
        }
        changed = true;
      }
      const lim01 = stepLim(h, d0, d1);
      if (d1 - d0 > lim01 + 1e-6) {
        const ex = d1 - d0 - lim01;
        const to2 = Math.min(ex, Math.max(0, Math.min(dMax, d1 + lim12) - d2));
        d1 -= to2;
        d2 += to2;
        const rem1 = ex - to2;
        const to3 = hasConvexTail ? 0 : Math.min(rem1, Math.max(0, Math.min(dMax, d2 + lim23) - d3));
        d1 -= to3;
        d3 += to3;
        const rem2 = rem1 - to3;
        if (canLiftD0 && rem2 > 0) {
          d1 -= 0.5 * rem2;
          d0 += 0.5 * rem2;
        }
        changed = true;
      }
      if (!changed) break;
      modified[j] = 1;
    }
    c[1] = c[0] + d0;
    c[2] = c[1] + d1;
    c[3] = c[2] + d2;
  }

  const zStart = zA + 0.05;
  const zTops = hs.map((h) => zA + h);
  const zMaxAll = Math.max(...zTops);
  const zLevels = [];
  for (let z = zStart; z <= zMaxAll - 0.04; z += 0.06) zLevels.push(z);
  const nz = zLevels.length;
  if (nz > 0) {
    const active = Array.from({ length: nz }, (_, iz) => {
      const z = zLevels[iz];
      return Array.from({ length: n }, (_, j) => {
        if (z >= zTops[j] - 0.02) return null;
        const h = hs[j];
        const invH = 1 / h;
        const invH2 = invH * invH;
        const t = (z - zA) * invH;
        const u = 1 - t;
        const u2 = u * u;
        const u3 = u2 * u;
        const u4 = u2 * u2;
        const t2 = t * t;
        const t3 = t2 * t;
        const t4 = t2 * t2;
        const b0 = u4;
        const b1 = canLiftD0 ? 4 * u3 * t : 0;
        const b2 = 6 * u2 * t2;
        const b3 = 4 * u * t3;
        const b4 = t4;
        const norm = b1 * b1 + b2 * b2 + b3 * b3 + 1e-6;
        return {
          b0,
          b1: 4 * u3 * t,
          b2,
          b3,
          b4,
          u3,
          u2t: 3 * u2 * t,
          ut2: 3 * u * t2,
          t3,
          u2,
          ut: 2 * u * t,
          t2,
          s1: 4 * invH,
          s2: 12 * invH2,
          w1: b1 / norm,
          w2: b2 / norm,
          w3: b3 / norm,
        };
      });
    });
    const dth = TWO_PI / n;
    const step = dth;
    const kLim = 1 / CUFF_MIN_CONCAVE_RADIUS_MM;
    const rs = new Float64Array(n);
    const rzs = new Float64Array(n);
    const dc1 = new Float64Array(n);
    const dc2 = new Float64Array(n);
    const dc3 = new Float64Array(n);
    for (let iter = 0; iter < 80; iter += 1) {
      dc1.fill(0);
      dc2.fill(0);
      dc3.fill(0);
      let any = false;
      for (let iz = 0; iz < nz; iz += 1) {
        const row = active[iz];
        for (let j = 0; j < n; j += 1) {
          const a = row[j];
          if (!a) {
            rs[j] = NaN;
            rzs[j] = NaN;
            continue;
          }
          const c = ctrl[j];
          const d0 = c[1] - c[0];
          const d1 = c[2] - c[1];
          const d2 = c[3] - c[2];
          const d3 = c[4] - c[3];
          rs[j] = a.b0 * c[0] + a.b1 * c[1] + a.b2 * c[2] + a.b3 * c[3] + a.b4 * c[4];
          rzs[j] = a.s1 * (a.u3 * d0 + a.u2t * d1 + a.ut2 * d2 + a.t3 * d3);
        }
        for (let j = 0; j < n; j += 1) {
          const a = row[j];
          if (!a) continue;
          const jm = (j - 1 + n) % n;
          const jp = (j + 1) % n;
          const rm = rs[jm];
          const r = rs[j];
          const rp = rs[jp];
          const rzm = rzs[jm];
          const rz = rzs[j];
          const rzp = rzs[jp];
          if (!Number.isFinite(rm) || !Number.isFinite(rp) || !Number.isFinite(rzm) || !Number.isFinite(rzp)) continue;
          const rTh = (rp - rm) / (2 * step);
          const rThth = (rp - 2 * r + rm) / (step * step);
          // 둘레가 오목하게 들어간 골(rThth > r + 2·rTh²/r, L > 0)만 바깥으로 메운다.
          if (r * (rThth - r) - 2 * rTh * rTh <= 0) continue;
          const rThz = (rzp - rzm) / (2 * step);
          const E = r * r + rTh * rTh;
          const F = rTh * rz;
          const G = 1 + rz * rz;
          const W2 = E * G - F * F;
          const W = Math.sqrt(W2);
          const L = (r * (rThth - r) - 2 * rTh * rTh) / W;
          const M = (r * rThz - rTh * rz) / W;
          // 자오선 오목(N)도 넣은 최대 주곡률. 둘레만 보면 두 방향이 같이 오목한 곳(커넥션 바로 위 골)을 놓친다.
          const c = ctrl[j];
          const rzz = a.s2 * (a.u2 * (c[2] - 2 * c[1] + c[0]) + a.ut * (c[3] - 2 * c[2] + c[1]) + a.t2 * (c[4] - 2 * c[3] + c[2]));
          const N = (r * rzz) / W;
          const Hc = (E * N - 2 * F * M + G * L) / (2 * W2);
          const Kc = (L * N - M * M) / W2;
          const kTh = Hc + Math.sqrt(Math.max(0, Hc * Hc - Kc));
          if (kTh > kLim) {
            const need = 0.5 * step * step * (kTh - kLim) * ((W * E) / r);
            if (need > 1e-6) {
              any = true;
              if (need * a.w1 > dc1[j]) dc1[j] = need * a.w1;
              if (need * a.w2 > dc2[j]) dc2[j] = need * a.w2;
              if (need * a.w3 > dc3[j]) dc3[j] = need * a.w3;
            }
          }
        }
      }
      if (!any) break;
      for (const dc of [dc1, dc2, dc3]) {
        const sm = circularSmooth(circularSmooth(dc, MIN_RADIUS_DELTA_SMOOTH_HALF), MIN_RADIUS_DELTA_SMOOTH_HALF);
        for (let j = 0; j < n; j += 1) dc[j] = Math.max(dc[j] * 0.5, sm[j]);
      }
      for (let j = 0; j < n; j += 1) {
        if (!(dc1[j] > 1e-6 || dc2[j] > 1e-6 || dc3[j] > 1e-6)) continue;
        modified[j] = 1;
        const c = ctrl[j];
        const dMax = dMaxs[j];
        const h = hs[j];
        c[1] = Math.min(c[0] + dMax, c[1] + 0.5 * dc1[j]);
        c[2] = Math.min(c[1] + dMax, c[2] + 0.5 * dc2[j]);
        c[3] = Math.min(c[2] + dMax, c[4], c[3] + 0.5 * dc3[j]);
        let d0 = c[1] - c[0];
        let d1 = c[2] - c[1];
        let d2 = c[3] - c[2];
        let d3 = c[4] - c[3];
        for (let pass = 0; pass < 6; pass += 1) {
          const lim23 = stepLim(h, d2, d3);
          if (d3 - d2 > lim23) {
            const ex = d3 - d2 - lim23;
            d3 -= 0.5 * ex;
            d2 += 0.5 * ex;
          }
          const lim12 = stepLim(h, d1, d2);
          if (d2 - d1 > lim12) {
            const ex = d2 - d1 - lim12;
            d2 -= 0.5 * ex;
            d1 += 0.5 * ex;
          }
          const lim01 = stepLim(h, d0, d1);
          if (d1 - d0 > lim01) {
            const ex = d1 - d0 - lim01;
            if (canLiftD0) {
              d1 -= 0.5 * ex;
              d0 += 0.5 * ex;
            } else {
              d1 -= ex;
              d2 = Math.min(dMax, d2 + ex);
            }
          }
        }
        c[1] = c[0] + d0;
        c[2] = c[1] + d1;
        c[3] = c[2] + d2;
      }
    }
  }
  return modified.some(Boolean);
}

/** 이음 프로파일 둘레 평활에 쓰는 t 단계 수(사이는 3차 보간). */
const PROFILE_SMOOTH_LEVELS = 128;
const PROFILE_START_SLOPE_EPS = 1e-4;

/**
 * 열마다 따로 만든 이음 프로파일을 둘레 방향으로 저역 통과한다.
 * 프로파일 식의 상한·분기(끝 기울기 상한, 볼록 변형 분기 등)가 열 사이에서 바뀌면 반경이 각도에 대해 꺾여
 * 커프에 세로 꺾임선이 남는다. 둘레 평활(bandSmoothKeep)이 꺼진 열(seamOrigScale=0)에서는 그대로 보인다.
 * 열마다 시작 반경·시작 기울기·위 끝 반경으로 정한 3차 기준 곡선(시작 곡률 0)과의 차만 평활하므로
 * 원뿔 끝 G2 출발과 위 끝 반경은 바뀌지 않는다.
 * @param {((t: number) => number)[]} profiles 등간격 열의 t∈[0,1] 반경 함수
 */
function smoothProfilesAcrossColumns(profiles) {
  const ends = profiles.map((p) => {
    const r0 = p(0);
    return { r0, r1: p(1), s0: (p(PROFILE_START_SLOPE_EPS) - r0) / PROFILE_START_SLOPE_EPS };
  });
  if (!ends.every(({ r0, r1, s0 }) => Number.isFinite(r0) && Number.isFinite(r1) && Number.isFinite(s0))) return profiles;
  // 시작 기울기는 반경 차가 작은 열에서 m0 상한(d − 여유)에 잘려 열 사이에서 꺾인다. 그대로 두면 그 꺾임이 기준 곡선으로 빠져 평활되지 않는다.
  const s0s = angularLowPass(ends.map((e) => e.s0));
  if (!s0s) return profiles;
  ends.forEach((e, j) => {
    e.s0 = s0s[j];
  });
  const base = (j, t) => {
    const { r0, r1, s0 } = ends[j];
    return r0 + s0 * t + (r1 - r0 - s0) * t * t * t;
  };
  const L = PROFILE_SMOOTH_LEVELS;
  const levels = [];
  for (let i = 0; i <= L; i += 1) {
    const t = i / L;
    const q = profiles.map((p, j) => p(t) - base(j, t));
    const lp = angularLowPass(q);
    if (!lp) return profiles;
    levels.push(lp);
  }
  return profiles.map((_, j) => (t) => {
    const x = Math.min(1, Math.max(0, t));
    const u = x * L;
    const i = Math.min(L - 1, Math.floor(u));
    const f = u - i;
    const p0 = levels[Math.max(0, i - 1)][j];
    const p1 = levels[i][j];
    const p2 = levels[i + 1][j];
    const p3 = levels[Math.min(L, i + 2)][j];
    const q = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    return base(j, x) + q;
  });
}

/** 원형 열 값의 빈 칸(NaN)을 양옆 값으로 선형 보간한다. 빈 칸이 MISSING_FILL_MAX_RATIO를 넘으면 null. */
function fillMissingCircular(values) {
  const n = values.length;
  const ok = values.map(Number.isFinite);
  const missing = ok.filter((x) => !x).length;
  if (!missing) return values;
  if (missing > n * MISSING_FILL_MAX_RATIO) return null;
  return values.map((x, j) => {
    if (ok[j]) return x;
    let a = 1;
    while (!ok[(j - a + n) % n]) a += 1;
    let b = 1;
    while (!ok[(j + b) % n]) b += 1;
    return values[(j - a + n) % n] + ((values[(j + b) % n] - values[(j - a + n) % n]) * a) / (a + b);
  });
}
const MISSING_FILL_MAX_RATIO = 0.05;

const unitCircleTables = new Map();
/** cos/sin(2π·m/n), m = 0..n-1. */
function unitCircle(n) {
  let t = unitCircleTables.get(n);
  if (!t) {
    t = { cos: new Float64Array(n), sin: new Float64Array(n) };
    for (let m = 0; m < n; m += 1) {
      t.cos[m] = Math.cos((TWO_PI * m) / n);
      t.sin[m] = Math.sin((TWO_PI * m) / n);
    }
    unitCircleTables.set(n, t);
  }
  return t;
}

/** 원형 신호의 저주파 성분(0..K차 조화)만 남긴다. weightOf(k)로 차수별 비중을 줄 수 있고, outN 등간격 점에서 돌려준다. */
function fourierLowPass(values, harmonics, weightOf = () => 1, outN = values.length) {
  const n = values.length;
  const inT = unitCircle(n);
  const outT = unitCircle(outN);
  const out = new Array(outN).fill(0);
  for (let k = 0; k <= harmonics; k += 1) {
    let re = 0;
    let im = 0;
    for (let j = 0, m = 0; j < n; j += 1, m = (m + k) % n) {
      re += values[j] * inT.cos[m];
      im += values[j] * inT.sin[m];
    }
    const w = ((k === 0 ? 1 : 2) * weightOf(k)) / n;
    for (let j = 0, m = 0; j < outN; j += 1, m = (m + k) % outN) {
      out[j] += w * (re * outT.cos[m] + im * outT.sin[m]);
    }
  }
  return out;
}

/** 각도(원형) 이동 평균. */
function circularSmooth(values, half) {
  const n = values.length;
  const at = (k) => values[(((k % n) + n) % n)];
  let sum = 0;
  for (let k = -half; k <= half; k += 1) sum += at(k);
  const out = new Array(n);
  for (let j = 0; j < n; j += 1) {
    out[j] = sum / (2 * half + 1);
    sum += at(j + half + 1) - at(j - half);
  }
  return out;
}

function toConcaveProfilePlain(fn, samples) {
  const n = samples;
  const xs = Array.from({ length: n + 1 }, (_, i) => i / n);
  const ys = xs.map((x) => fn(x));
  // 아래 볼록 외피 (monotone chain)
  const hull = [];
  for (let i = 0; i <= n; i += 1) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (xs[b] - xs[a]) * (ys[i] - ys[a]) - (ys[b] - ys[a]) * (xs[i] - xs[a]);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(i);
  }
  const out = new Array(n + 1);
  for (let k = 0; k + 1 < hull.length; k += 1) {
    const a = hull[k];
    const b = hull[k + 1];
    for (let i = a; i <= b; i += 1) out[i] = ys[a] + ((ys[b] - ys[a]) * (xs[i] - xs[a])) / (xs[b] - xs[a]);
  }
  // 외피의 꺾임을 평활(볼록 수열의 이동평균은 볼록). 양끝 고정.
  let cur = out;
  for (let pass = 0; pass < 24; pass += 1) {
    const next = cur.slice();
    for (let i = 1; i < n; i += 1) next[i] = 0.25 * cur[i - 1] + 0.5 * cur[i] + 0.25 * cur[i + 1];
    cur = next;
  }
  return (t) => {
    const x = Math.max(0, Math.min(1, t)) * n;
    const i = Math.min(n - 1, Math.floor(x));
    return cur[i] + (cur[i + 1] - cur[i]) * (x - i);
  };
}

/** z 표본 [z0, z0+span]에서 r(z)=a+b·dz+c·dz² 최소제곱. */
function fitQuadratic(samples, z0) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const [z, r] of samples) {
    const d = z - z0;
    const d2 = d * d;
    s0 += 1; s1 += d; s2 += d2; s3 += d2 * d; s4 += d2 * d2;
    t0 += r; t1 += r * d; t2 += r * d2;
  }
  const m = [
    [s0, s1, s2, t0],
    [s1, s2, s3, t1],
    [s2, s3, s4, t2],
  ];
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let j = i + 1; j < 3; j += 1) if (Math.abs(m[j][i]) > Math.abs(m[p][i])) p = j;
    [m[i], m[p]] = [m[p], m[i]];
    if (Math.abs(m[i][i]) < 1e-12) return null;
    for (let j = 0; j < 3; j += 1) {
      if (j === i) continue;
      const f = m[j][i] / m[i][i];
      for (let k = i; k < 4; k += 1) m[j][k] -= f * m[i][k];
    }
  }
  return { a: m[0][3] / m[0][0], b: m[1][3] / m[1][1], c: m[2][3] / m[2][2] };
}

/** 모든 bin에서 [z, z+CLEAN_WINDOW] 외곽이 튀거나 꺾이지 않는가. */
function isCleanFrom(probe, z) {
  const rows = [];
  for (let d = 0; d <= CLEAN_WINDOW_MM + 1e-9; d += CLEAN_STEP_MM) {
    rows.push(probe.bins(z + d, MEASURE_BINS));
  }
  for (let b = 0; b < MEASURE_BINS; b += 1) {
    const col = rows.map((row) => row[b]);
    if (col.some((r) => !Number.isFinite(r))) return false;
    const slopes = [];
    for (let i = 1; i < col.length; i += 1) {
      const dr = col[i] - col[i - 1];
      if (Math.abs(dr) > CLEAN_MAX_JUMP_MM + AUTO_MAX_MEAN_SLOPE * CLEAN_STEP_MM) return false;
      slopes.push(dr / CLEAN_STEP_MM);
    }
    // 3칸 평균 기울기 변화로 꺾임을 본다(면 분할 잡음 완화)
    for (let i = 3; i + 3 <= slopes.length; i += 3) {
      const s1 = (slopes[i - 3] + slopes[i - 2] + slopes[i - 1]) / 3;
      const s2 = (slopes[i] + slopes[i + 1] + slopes[i + 2]) / 3;
      if (Math.abs(s2 - s1) > CLEAN_MAX_SLOPE_CHANGE) return false;
    }
  }
  return true;
}

/** 이 Z_b로 이었을 때 이음 곡선의 최대 |r''| (36열 표본). */
function blendCurvature(probe, zA, ra, zB) {
  const thetas = Array.from({ length: 36 }, (_, j) => (j / 36) * TWO_PI);
  const tops = sampleTopConditions(probe, thetas, thetas.map(() => zB), CLEAN_WINDOW_MM);
  if (tops.some((t) => !t)) return Infinity;
  const h = zB - zA;
  const n = 40;
  let worst = 0;
  for (const t of tops) {
    const fn = quinticHermite(ra, TAPER_SLOPE, 0, t.r, t.slope, clampCurvature(t.curvature), h);
    const dz = h / n;
    for (let i = 1; i < n; i += 1) {
      const c = (fn((i + 1) / n) - 2 * fn(i / n) + fn((i - 1) / n)) / (dz * dz);
      worst = Math.max(worst, Math.abs(c));
    }
  }
  return worst;
}

/**
 * 단차가 끝나고(깨끗한 창) 기울기·곡률이 허용 범위인 가장 낮은 Z_b.
 * 곡률 기준을 못 맞추면 깨끗한 후보 중 곡률이 가장 작은 곳.
 */
function findBlendTop(probe, zA, ra, zLimit) {
  const maxZ = Math.min(zLimit, zA + MAX_BAND_MM);
  let best = null;
  for (let zB = zA + MIN_BAND_MM; zB <= maxZ + 1e-9; zB += CLEAN_STEP_MM) {
    const bins = probe.bins(zB, MEASURE_BINS);
    let steep = false;
    for (let b = 0; b < MEASURE_BINS; b += 1) {
      if (!Number.isFinite(bins[b]) || Math.abs(bins[b] - ra) > AUTO_MAX_MEAN_SLOPE * (zB - zA)) {
        steep = true;
        break;
      }
    }
    if (steep || !isCleanFrom(probe, zB)) continue;
    const curvature = blendCurvature(probe, zA, ra, zB);
    if (curvature <= MAX_BLEND_CURVATURE) return { zB, curvature };
    if (!best || curvature < best.curvature) best = { zB, curvature };
  }
  return best;
}

/** 모든 열의 lab 곡면 값·기울기·곡률(z 방향)을 z=top(θ)에서 잰다. */
function sampleTopConditions(probe, thetas, topZ, span) {
  const zLo = Math.min(...topZ);
  const zHi = Math.max(...topZ) + span;
  const fns = [];
  for (let z = zLo; z <= zHi + 1e-9; z += CLEAN_STEP_MM) {
    fns.push([z, probe.radiusFn(z)]);
  }
  return thetas.map((theta, j) => {
    const z0 = topZ[j];
    const samples = [];
    for (const [z, fn] of fns) {
      if (!fn || z < z0 - 1e-9 || z > z0 + span + 1e-9) continue;
      samples.push([z, fn(theta)]);
    }
    if (samples.length < 4) return null;
    const q = fitQuadratic(samples, z0);
    if (!q) return null;
    return { r: q.a, slope: q.b, curvature: 2 * q.c };
  });
}

/** 못 읽은 열을 양옆 열에서 원형 선형보간으로 채운다. 못 읽은 비율이 maxRatio를 넘으면 그대로 둔다. */
function fillMissingTopConditions(tops, maxRatio) {
  const n = tops.length;
  const missing = tops.filter((t) => !t).length;
  if (!missing || missing > n * maxRatio || missing === n) return;
  const src = tops.slice();
  for (let j = 0; j < n; j += 1) {
    if (src[j]) continue;
    let a = 1;
    while (!src[(j - a + n) % n]) a += 1;
    let b = 1;
    while (!src[(j + b) % n]) b += 1;
    const p = src[(j - a + n) % n];
    const q = src[(j + b) % n];
    const w = a / (a + b);
    tops[j] = {
      r: p.r + (q.r - p.r) * w,
      slope: p.slope + (q.slope - p.slope) * w,
      curvature: p.curvature + (q.curvature - p.curvature) * w,
    };
  }
}

/** 위 끝(topZ) 바로 아래 [topZ − span, topZ] 원본 곡면을 2차로 맞춰 위 끝의 반경·기울기(dr/dz)를 잰다. */
function sampleBelowConditions(probe, thetas, topZ, span) {
  return thetas.map((theta, j) => {
    const z0 = topZ[j];
    const samples = [];
    for (let d = TOP_BELOW_GAP_MM; d <= span + 1e-9; d += CLEAN_STEP_MM / 2) {
      const r = probe.rayRadius(theta, z0 - d);
      if (Number.isFinite(r)) samples.push([z0 - d, r]);
    }
    if (samples.length < 4) return null;
    const q = fitQuadratic(samples, z0);
    return q ? { r: q.a, slope: q.b } : null;
  });
}

// ---------------------------------------------------------------------------
// 메시 수술

function splitByLevel(mesh, levelOf) {
  const { verts } = mesh;
  const nv0 = verts.length / 3;
  const fv = new Float64Array(nv0);
  for (let v = 0; v < nv0; v += 1) {
    let f = levelOf(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
    if (Math.abs(f) < 1e-7) f = 0;
    fv[v] = f;
  }
  const values = Array.from(fv);
  const cache = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const t = values[a] / (values[a] - values[b]);
    const idx = verts.length / 3;
    verts.push(
      verts[a * 3] + t * (verts[b * 3] - verts[a * 3]),
      verts[a * 3 + 1] + t * (verts[b * 3 + 1] - verts[a * 3 + 1]),
      verts[a * 3 + 2] + t * (verts[b * 3 + 2] - verts[a * 3 + 2]),
    );
    values.push(0);
    cache.set(key, idx);
    return idx;
  };
  const sign = (v) => (values[v] > 0 ? 1 : values[v] < 0 ? -1 : 0);
  const faces = [];
  const faceAttr = [];
  const faceMain = [];
  const fc = mesh.faces.length / 3;
  for (let f = 0; f < fc; f += 1) {
    const tri = [mesh.faces[f * 3], mesh.faces[f * 3 + 1], mesh.faces[f * 3 + 2]];
    const attr = mesh.faceAttr[f];
    const main = mesh.faceMain[f];
    const push = (a, b, c) => {
      faces.push(a, b, c);
      faceAttr.push(attr);
      faceMain.push(main);
    };
    const s = tri.map(sign);
    if (!main || !(s[0] * s[1] < 0 || s[1] * s[2] < 0 || s[2] * s[0] < 0)) {
      push(tri[0], tri[1], tri[2]);
      continue;
    }
    const zeroAt = s.indexOf(0);
    if (zeroAt >= 0) {
      const v0 = tri[zeroAt];
      const v1 = tri[(zeroAt + 1) % 3];
      const v2 = tri[(zeroAt + 2) % 3];
      const m = mid(v1, v2);
      push(v0, v1, m);
      push(v0, m, v2);
      continue;
    }
    let iso = 0;
    if (s[0] === s[1]) iso = 2;
    else if (s[0] === s[2]) iso = 1;
    const v0 = tri[iso];
    const v1 = tri[(iso + 1) % 3];
    const v2 = tri[(iso + 2) % 3];
    const m1 = mid(v0, v1);
    const m2 = mid(v0, v2);
    push(v0, m1, m2);
    push(m1, v1, v2);
    push(m1, v2, m2);
  }
  return { verts, faces, faceAttr, faceMain, values };
}

function chainBoundaryLoops(directedEdges) {
  const next = new Map();
  for (const [a, b] of directedEdges) {
    if (next.has(a)) return null;
    next.set(a, b);
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    while (!seen.has(v)) {
      seen.add(v);
      loop.push(v);
      v = next.get(v);
      if (v === undefined) return null;
    }
    if (v !== start) return null;
    loops.push(loop);
  }
  return loops;
}

/**
 * 경계 루프를 각도가 커지는 방향의 루프 순서로 돌려준다(a는 누적 각, 시작 ∈ [0, 2π)).
 * 정렬하지 않는다: 루프 모서리를 그대로 써야 띠가 원래 메시와 빈틈없이 맞물린다.
 * 한 바퀴가 아니거나 크게 되돌아가면(언더컷) null.
 */
function angularRow(loop, verts) {
  const ang = loop.map((v) => angleOf(verts[v * 3], verts[v * 3 + 1]));
  const steps = ang.map((a, i) => {
    let d = ang[(i + 1) % ang.length] - a;
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    return d;
  });
  const turn = steps.reduce((s, d) => s + d, 0);
  const dir = Math.sign(turn);
  if (Math.abs(Math.abs(turn) - TWO_PI) > 0.1 || steps.some((d) => d * dir < -0.02)) return null;
  let order = loop.map((_, i) => i);
  if (dir < 0) order = order.reverse();
  let start = 0;
  for (let i = 1; i < order.length; i += 1) {
    if (wrapAngle(ang[order[i]]) < wrapAngle(ang[order[start]])) start = i;
  }
  order = [...order.slice(start), ...order.slice(0, start)];
  const out = [];
  let acc = wrapAngle(ang[order[0]]);
  for (let i = 0; i < order.length; i += 1) {
    if (i > 0) {
      let d = ang[order[i]] - ang[order[i - 1]];
      if (d > Math.PI) d -= TWO_PI;
      if (d < -Math.PI) d += TWO_PI;
      acc += d;
    }
    out.push({ v: loop[order[i]], a: acc });
  }
  return out;
}

/** 각도순 두 행 사이를 지퍼처럼 잇는다. 행 원소: { v, a } (a ∈ [0, 2π)) */
function zipperRows(lower, upper, emit) {
  const A = lower.length;
  const B = upper.length;
  let i = 0;
  let j = 0;
  const angA = (k) => lower[k % A].a + Math.floor(k / A) * TWO_PI;
  const angB = (k) => upper[k % B].a + Math.floor(k / B) * TWO_PI;
  // 시작 정렬: 두 행 모두 가장 작은 각에서 출발
  while (i < A || j < B) {
    const nextA = i < A ? (angA(i) + angA(i + 1)) / 2 : Infinity;
    const nextB = j < B ? (angB(j) + angB(j + 1)) / 2 : Infinity;
    if (nextA <= nextB) {
      emit(lower[i % A].v, lower[(i + 1) % A].v, upper[j % B].v);
      i += 1;
    } else {
      emit(lower[i % A].v, upper[(j + 1) % B].v, upper[j % B].v);
      j += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 공통 실행

function prepare(buffer) {
  const { positions, attributes } = parseStl(buffer);
  const triCount = Math.floor(positions.length / 9);
  if (triCount < 100) fail("failed", "STL 삼각형이 너무 적습니다.");
  const welded = weldSoup(positions, attributes);
  const faceMain = Array.from(largestComponent(welded.verts, welded.faces));
  const mainFaces = [];
  for (let f = 0; f < faceMain.length; f += 1) {
    if (faceMain[f]) mainFaces.push(welded.faces[f * 3], welded.faces[f * 3 + 1], welded.faces[f * 3 + 2]);
  }
  const probe = new RadialProbe(welded.verts, mainFaces);
  return { mesh: { ...welded, faceMain }, probe, triCount };
}

function detachedInBand(mesh, zLo, zHi, rCut) {
  const { verts, faces, faceMain } = mesh;
  for (let f = 0; f < faceMain.length; f += 1) {
    if (faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k] * 3;
      const z = verts[v + 2];
      if (z >= zLo && z <= zHi && Math.hypot(verts[v], verts[v + 1]) > rCut) return true;
    }
  }
  return false;
}

/**
 * 본체와 떨어진 fill_steps 솔리드(Z≈0 수직 구간을 덮은 로프트 조각)를 통째로 지운다.
 * 띠 높이 안에서 채널 밖(r>rCut)으로 걸친 분리 조각만 대상이며, 스크류홀 패치(채널 안쪽·위쪽)는 건드리지 않는다.
 * 이 조각이 띠 위로 남으면 새 곡면과 겹쳐 세로 줄무늬·이중 면이 생긴다.
 */
function stripDetachedFillSolid(mesh, zLo, zHi, rCut) {
  const { verts, faces, faceAttr, faceMain } = mesh;
  const fc = faceMain.length;
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = a;
    while (parent.get(c) !== r) {
      const n = parent.get(c);
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const join = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let f = 0; f < fc; f += 1) {
    if (faceMain[f]) continue;
    join(faces[f * 3], faces[f * 3 + 1]);
    join(faces[f * 3], faces[f * 3 + 2]);
  }
  const hit = new Set();
  for (let f = 0; f < fc; f += 1) {
    if (faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k] * 3;
      const z = verts[v + 2];
      if (z >= zLo && z <= zHi && Math.hypot(verts[v], verts[v + 1]) > rCut) {
        hit.add(find(faces[f * 3]));
        break;
      }
    }
  }
  if (!hit.size) return { mesh, stripped: 0 };
  const nf = [];
  const na = [];
  const nm = [];
  let stripped = 0;
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f] && hit.has(find(faces[f * 3]))) {
      stripped += 1;
      continue;
    }
    nf.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    na.push(faceAttr[f]);
    nm.push(faceMain[f]);
  }
  return { mesh: { ...mesh, faces: nf, faceAttr: na, faceMain: nm }, stripped };
}

/** 띠 안에 세 면 이상이 공유하는 모서리(겹친 캡·보정 조각)가 있는가. */
function nonManifoldInBand(mesh, zLo, zHi) {
  const { verts, faces, faceMain } = mesh;
  const nv = verts.length / 3;
  const use = new Map();
  for (let f = 0; f < faceMain.length; f += 1) {
    if (!faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      use.set(key, (use.get(key) || 0) + 1);
    }
  }
  for (const [key, n] of use) {
    if (n <= 2) continue;
    const a = Math.floor(key / nv);
    const b = key - a * nv;
    const z = (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2;
    if (z >= zLo && z <= zHi) {
      return true;
    }
  }
  return false;
}

/**
 * 띠 위치에 남은 예전 fill_steps 캡 조각을 지운다: 축 둘레로 넓게 걸친 삼각형, 같은 세 꼭짓점으로 겹친 양면 면,
 * 같은 원 위 세 점으로 된 수평 삼각형(원판 캡). 곡면과 고리 턱은 그대로 남는다. 보통 곡면 삼각형은 각도 폭이 몇 도뿐이다.
 */
function stripSpanFins(mesh, zLo, zHi, rMin) {
  const { verts, faces, faceAttr, faceMain } = mesh;
  const fc = faces.length / 3;
  const keep = new Uint8Array(fc);
  let stripped = 0;
  // 같은 꼭짓점 세 개로 겹쳐 앉은 면(양면 캡)은 두 장 모두 지운다.
  const triKey = (f) => [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]].sort((p, q) => p - q).join("_");
  const seenTri = new Map();
  for (let f = 0; f < fc; f += 1) {
    const k = triKey(f);
    seenTri.set(k, (seenTri.get(k) || 0) + 1);
  }
  for (let f = 0; f < fc; f += 1) {
    keep[f] = 1;
    let zMin = Infinity;
    let zMax = -Infinity;
    let rLow = Infinity;
    let rHigh = -Infinity;
    const ang = [];
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k] * 3;
      zMin = Math.min(zMin, verts[v + 2]);
      zMax = Math.max(zMax, verts[v + 2]);
      const rv = Math.hypot(verts[v], verts[v + 1]);
      rLow = Math.min(rLow, rv);
      rHigh = Math.max(rHigh, rv);
      ang.push(angleOf(verts[v], verts[v + 1]));
    }
    if (zMax < zLo || zMax > zHi || rLow < rMin) continue;
    // 수평 고리 턱은 안·바깥 원에 꼭짓점이 걸치지만, 세 꼭짓점이 같은 원 위에 놓인 수평 삼각형은 원판을 덮은 캡 조각이다.
    const flatChordCap = zMax - zMin < 1e-3 && rHigh - rLow < 0.02;
    if (flatChordCap || seenTri.get(triKey(f)) > 1) {
      keep[f] = 0;
      stripped += 1;
      continue;
    }
    let span = 0;
    for (let k = 0; k < 3; k += 1) {
      let d = Math.abs(ang[k] - ang[(k + 1) % 3]);
      if (d > Math.PI) d = TWO_PI - d;
      span = Math.max(span, d);
    }
    if (span > FIN_SPAN_RAD) {
      keep[f] = 0;
      stripped += 1;
    }
  }
  if (!stripped) return { mesh, stripped: 0 };
  const nf = [];
  const na = [];
  const nm = [];
  for (let f = 0; f < fc; f += 1) {
    if (!keep[f]) continue;
    nf.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    na.push(faceAttr[f]);
    nm.push(faceMain[f]);
  }
  return { mesh: { ...mesh, faces: nf, faceAttr: na, faceMain: nm }, stripped };
}

/** 띠 안쪽 스크류 채널 반경(법선이 축을 향하는 면의 최대 반경). */
function channelRadius(mesh, zLo, zHi, rOuter) {
  const { verts, faces, faceMain } = mesh;
  let best = 0;
  for (let f = 0; f < faceMain.length; f += 1) {
    if (!faceMain[f]) continue;
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    const cz = (verts[a + 2] + verts[b + 2] + verts[c + 2]) / 3;
    if (cz < zLo || cz > zHi) continue;
    const cx = (verts[a] + verts[b] + verts[c]) / 3;
    const cy = (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3;
    const rc = Math.hypot(cx, cy);
    if (rc >= rOuter - 0.1 || rc < 1e-6) continue;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const len = Math.hypot(nx, ny, ux * vy - uy * vx);
    if (len < 1e-12) continue;
    if (-(nx * cx + ny * cy) / (len * rc) > 0.5) best = Math.max(best, rc);
  }
  return best;
}

/** 높이별 스크류 채널 반경(법선이 축을 향하는 면). 0.1mm 칸의 최댓값, 위아래 한 칸까지 넓혀 돌려준다. */
function channelRadiusByZ(mesh, zLo, zHi, rOuter) {
  const { verts, faces, faceMain } = mesh;
  const bin = 0.1;
  const n = Math.max(1, Math.ceil((zHi - zLo) / bin) + 1);
  const best = new Float64Array(n);
  for (let f = 0; f < faceMain.length; f += 1) {
    if (!faceMain[f]) continue;
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    const cz = (verts[a + 2] + verts[b + 2] + verts[c + 2]) / 3;
    if (cz < zLo || cz > zHi) continue;
    const cx = (verts[a] + verts[b] + verts[c]) / 3;
    const cy = (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3;
    const rc = Math.hypot(cx, cy);
    if (rc >= rOuter - 0.1 || rc < 1e-6) continue;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const len = Math.hypot(nx, ny, ux * vy - uy * vx);
    if (len < 1e-12) continue;
    if (-(nx * cx + ny * cy) / (len * rc) > 0.5) {
      const k = Math.min(n - 1, Math.max(0, Math.floor((cz - zLo) / bin)));
      best[k] = Math.max(best[k], rc);
    }
  }
  return (z) => {
    const k = Math.min(n - 1, Math.max(0, Math.floor((z - zLo) / bin)));
    return Math.max(best[k], k > 0 ? best[k - 1] : 0, k < n - 1 ? best[k + 1] : 0);
  };
}

/**
 * 띠 행의 원래 곡선 비중(나머지는 각도 평균). 위 끝 BAND_SMOOTH_FADE_MM 안에서는 평균을 0까지 줄여,
 * 위 끝에서 맞춘 원본 접선이 이웃 열 평균에 끌려 휘지 않게 한다.
 */
/**
 * 옆모습 곡선이 ROW_TURN_DEG만큼 꺾일 때마다 행 하나(t∈(0, tEnd)). 곧은 곳은 ROW_MAX_PITCH_MM까지 벌린다.
 * 꺾임은 열마다 재서 가장 큰 값을 쓴다.
 */
function adaptiveRowTs(radiusAt, heights, tEnd) {
  const n = ROW_TURN_SAMPLES;
  const maxHeight = Math.max(...heights);
  const turn = new Float64Array(n + 1);
  for (let j = 0; j < heights.length; j += ROW_TURN_COLUMN_STRIDE) {
    const dz = heights[j] / n;
    let r0 = radiusAt(j, 0);
    let prev = null;
    for (let i = 1; i <= n; i += 1) {
      const r1 = radiusAt(j, i / n);
      const a = Math.atan2(r1 - r0, dz);
      if (prev !== null) turn[i - 1] = Math.max(turn[i - 1], Math.abs(a - prev));
      prev = a;
      r0 = r1;
    }
  }
  const step = (ROW_TURN_DEG * Math.PI) / 180;
  const ts = [];
  let acc = 0;
  let last = 0;
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    if (t >= tEnd) break;
    acc += turn[i];
    const gapMm = (t - last) * maxHeight;
    if ((acc >= step && gapMm >= ROW_PITCH_MM) || gapMm >= ROW_MAX_PITCH_MM) {
      ts.push(t);
      acc = 0;
      last = t;
    }
  }
  return ts;
}

/**
 * 위 끝 근처 이음 행(깊은 행부터). 새 곡선을 위로 갈수록 원본 곡면(반경·기울기)에 섞어 이음선을 없앤다.
 * seamDepth에서는 곡선 그대로, SEAM_TOP_DEPTH_MM에서는 원본 그대로다. 그 위는 마진 모서리 꼭짓점까지 원본 면이다.
 * 후보를 SEAM_CANDIDATE_STEP_MM 간격으로 만든 뒤, 어느 열이든 옆모습이 ROW_TURN_DEG 꺾이면 행을 고른다.
 * @returns {{ rad: Float64Array, z: Float64Array }[]}
 */
function seamRows({
  zA,
  thetas,
  heights,
  rawHeights,
  smoothHeights,
  radiusAt,
  rawCreaseR,
  origProbe,
  seamDepth,
  tEnd,
  seamOrigScale,
  seamBlendScale = seamOrigScale,
  convexCuffDeform = false,
}) {
  const n = thetas.length;
  const top = Math.min(SEAM_TOP_DEPTH_MM, seamDepth / 2);
  // 맨 아래 이음 행은 일반 행이 끝나는 t(tEnd)에 둔다. 높이가 큰 열은 그 깊이가 seamDepth보다 깊고, 그 사이는 곡선 그대로다.
  const bottoms = heights.map((h) => (1 - tEnd) * h);
  const measureN = n / MEASURE_STRIDE;
  const meridians = Array.from({ length: measureN }, (_, i) => {
    const j = i * MEASURE_STRIDE;
    // 원본이 곡선보다 가파르면 같은 접선 거리의 원본 점이 곡선 점보다 깊다. 위 끝에서 SEAM_FRAME_REACH_MM까지 읽어 둔다.
    const zLo = Math.min(
      zA + tEnd * Math.min(heights[j], smoothHeights[j]),
      Math.max(zA, zA + heights[j] - SEAM_FRAME_REACH_MM),
    ) - ROW_PITCH_MM;
    return origProbe.meridian(thetas[j], zLo, zA + heights[j]);
  });
  // 둘레 평균 반경은 일반 행처럼 이웃 열을 같은 t에서 잰 값이어야 한다. 이음 행은 열마다 t가 달라서(같은 깊이),
  // t 격자(tEnd..1)마다 평균을 구해 두고 열의 t에서 3차 보간한다. 이웃이 제 깊이에서 잰 값을 평균하면
  // 열마다 높이가 달라 일반 행에서 넘어가는 곳에 출렁임이 남는다.
  const levels = Array.from({ length: SEAM_AVG_LEVELS }, (_, i) => {
    const t = tEnd + ((1 - tEnd) * i) / (SEAM_AVG_LEVELS - 1);
    return circularSmooth(Array.from({ length: n }, (_, j) => radiusAt(j, t)), BAND_SMOOTH_HALF_COLUMNS);
  });
  const avgAt = (j, t) => {
    const u = Math.min(SEAM_AVG_LEVELS - 1, Math.max(0, ((t - tEnd) / (1 - tEnd)) * (SEAM_AVG_LEVELS - 1)));
    const i = Math.min(SEAM_AVG_LEVELS - 2, Math.floor(u));
    const f = u - i;
    const p0 = levels[Math.max(0, i - 1)][j];
    const p1 = levels[i][j];
    const p2 = levels[i + 1][j];
    const p3 = levels[Math.min(SEAM_AVG_LEVELS - 1, i + 2)][j];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  };
  // 섞는 깊이는 열마다 그 열 높이의 절반까지 SEAM_BLEND_DEPTH_MM를 쓴다. 가장 낮은 열에 맞춰 둘레 전체를 줄이면
  // 높은 쪽 커프에서 곡선→원본 꺾임이 0.2mm 안에 몰려 마진 아래에 마진과 나란한 능선이 생긴다.
  const seamDepths = (() => {
    const half = heights.map((h) => Math.min(SEAM_BLEND_DEPTH_MM, h / 2));
    return circularSmooth(half, TOP_SLOPE_SMOOTH_COLUMNS).map((d, j) => Math.max(top * 2, Math.min(d, half[j])));
  })();
  const blendSpan = Math.max(...seamDepths.map((d) => d - top));
  const tailSpan = Math.max(...bottoms.map((b, j) => b - seamDepths[j]));
  // 열마다 위 끝 접선 틀. 방향은 곡선 끝 접선과 모서리 바로 아래 원본 접선의 가운데라, 두 곡선이 모두 그 축 위의 그래프가 된다.
  const frames = (() => {
    const curveAngle = heights.map((h, j) => Math.atan((radiusAt(j, 1) - radiusAt(j, 1 - 1e-3)) / (1e-3 * h)));
    const origSlopes = angularLowPass(
      meridians.map((m, i) => {
        const zTop = zA + heights[i * MEASURE_STRIDE];
        return (m(zTop - SEAM_FRAME_NEAR_MM) - m(zTop - SEAM_FRAME_FAR_MM)) / (SEAM_FRAME_FAR_MM - SEAM_FRAME_NEAR_MM);
      }),
      n,
    );
    return heights.map((h, j) => {
      const a = origSlopes ? (curveAngle[j] + Math.atan(origSlopes[j])) / 2 : curveAngle[j];
      return {
        o: [radiusAt(j, 1), zA + h],
        d: [-Math.sin(a), -Math.cos(a)],
        nrm: [Math.cos(a), -Math.sin(a)],
      };
    });
  })();
  // v∈[0,1]은 섞는 구간, [1,2]는 그 아래 곡선 구간. 열마다 같은 비율로 내려간다.
  const depthsAt = (v) =>
    bottoms.map((b, j) => {
      const sd = seamDepths[j];
      return v <= 1 ? top + v * (sd - top) : sd + (v - 1) * (b - sd);
    });
  /** 곡선 위 점(아래 일반 행과 같은 각도 평균을 쓴 위치). */
  const curveAt = (v) => {
    const depths = depthsAt(v);
    const ts = heights.map((h, j) => 1 - depths[j] / h);
    const keeps = ts.map((t, j) => {
      if (convexCuffDeform) return 1;
      const scale = seamOrigScale ? seamOrigScale[j] : 1;
      return 1 - (1 - bandSmoothKeep(t, heights[j])) * scale;
    });
    const rad = Float64Array.from(ts, (t, j) => radiusAt(j, t) * keeps[j] + avgAt(j, t) * (1 - keeps[j]));
    const z = Float64Array.from(ts, (t, j) => zA + t * (heights[j] * keeps[j] + smoothHeights[j] * (1 - keeps[j])));
    return { rad, z };
  };
  const toFrame = (j, r, z) => {
    const { o, d, nrm } = frames[j];
    const dr = r - o[0];
    const dz = z - o[1];
    return [dr * d[0] + dz * d[1], dr * nrm[0] + dz * nrm[1]];
  };
  const meridianFrames = meridians.map((m, i) => {
    const { o, d, nrm } = frames[i * MEASURE_STRIDE];
    return m.frame(o, d, nrm, SEAM_FRAME_REACH_MM);
  });
  // 곡선은 섞는 구간 위 끝(top 깊이)~아래 끝(seamDepth)을, 원본은 같은 top 깊이 점~곡선 아래 끝과 같은 접선 거리를 쓴다.
  // 원본 위 끝은 위 끝 접선 거리 top이고, 높이로도 SEAM_TOP_MIN_DROP_MM 아래라 새 꼭짓점이 피니시라인과 떨어진다.
  // 둘 사이는 접선 거리를 선형으로 맞춘다.
  const curveTop = curveAt(0);
  const curveBottom = curveAt(1);
  const uCurveTop = heights.map((_, j) => toFrame(j, curveTop.rad[j], curveTop.z[j])[0]);
  const uCurveBottom = heights.map((_, j) => toFrame(j, curveBottom.rad[j], curveBottom.z[j])[0]);
  const uOrigTop = angularLowPass(
    meridians.map((m, i) => {
      const j = i * MEASURE_STRIDE;
      const z = zA + heights[j] - Math.min(top, SEAM_TOP_MIN_DROP_MM);
      return Math.max(top, toFrame(j, m(z), z)[0]);
    }),
    n,
  );
  const rowAt = (v, radial) => {
    const { rad: rc, z: zc } = curveAt(v);
    // 원본과 곡선의 차가 0.3mm까지 나서, 섞는 비율은 양 끝에서 곡률까지 0이어야 시작·끝에 꺾인 선이 안 남는다.
    const wsRaw = Array.from(zc, (zj, j) => {
      const sd = seamDepths[j];
      const s = Math.min(1, Math.max(0, (sd - (zA + heights[j] - zj)) / (sd - top)));
      return s * s * s * (10 - 15 * s + 6 * s * s);
    });
    const ws = wsRaw.map((w, j) => w * (seamBlendScale ? seamBlendScale[j] : 1));
    if (!(Math.max(...wsRaw) > 0)) return { rad: rc, z: zc };
    const hasOrigBlend = Math.max(...ws) > 0;
    // 같은 높이에서 반경을 섞지 않고, 위 끝 접선 틀에서 곡선 점과 원본 점을 통째로 섞는다.
    // 마진 아래 원본이 거의 수평인 턱이면 같은 높이의 반경 차가 높이에 따라 크게 출렁여 옆모습이 되돌아간다.
    const curve = hasOrigBlend ? heights.map((_, j) => toFrame(j, rc[j], zc[j])) : null;
    const uOrig = curve
      ? curve.map(([u], j) => {
          const span = uCurveBottom[j] - uCurveTop[j];
          if (!uOrigTop || !(span > 1e-9) || u >= uCurveBottom[j]) return u;
          return uOrigTop[j] + ((u - uCurveTop[j]) / span) * (uCurveBottom[j] - uOrigTop[j]);
        })
      : null;
    const vOrig =
      !hasOrigBlend || radial
        ? null
        : angularLowPass(fillMissingCircular(meridianFrames.map((at, i) => at(uOrig[i * MEASURE_STRIDE]))), n);
    // 접선 틀로 원본을 못 읽으면 예전처럼 같은 높이 반경을 섞는다.
    const rOrig =
      !hasOrigBlend || vOrig
        ? null
        : angularLowPass(fillMissingCircular(meridians.map((m, i) => m(zc[i * MEASURE_STRIDE]))), n);
    const rad = new Float64Array(n);
    const z = new Float64Array(n);
    for (let j = 0; j < n; j += 1) {
      const w = ws[j];
      const wCrease = wsRaw[j] * (1 - (seamBlendScale ? seamBlendScale[j] : 1));
      const drTop = rawCreaseR && Number.isFinite(rawCreaseR[j]) ? (rawCreaseR[j] - radiusAt(j, 1)) * wCrease : 0;
      const dzTop = rawHeights ? (rawHeights[j] - heights[j]) * wCrease : 0;
      if (!vOrig || !(w > 0)) {
        rad[j] = (rOrig && w > 0 ? rc[j] * (1 - w) + rOrig[j] * w : rc[j]) + drTop;
        z[j] = zc[j] + dzTop;
        continue;
      }
      const { o, d, nrm } = frames[j];
      const u = curve[j][0] * (1 - w) + uOrig[j] * w;
      const vv = curve[j][1] * (1 - w) + vOrig[j] * w;
      rad[j] = o[0] + u * d[0] + vv * nrm[0] + drTop;
      z[j] = o[1] + u * d[1] + vv * nrm[1] + dzTop;
    }
    return { rad, z };
  };

  const blendCount = Math.max(1, Math.round(blendSpan / SEAM_CANDIDATE_STEP_MM));
  const tailCount = Math.max(1, Math.round(tailSpan / SEAM_CANDIDATE_STEP_MM));
  const vs = [
    ...Array.from({ length: blendCount }, (_, i) => i / blendCount),
    ...Array.from({ length: tailCount + 1 }, (_, i) => 1 + i / tailCount),
  ];
  const pickRows = (rows) => {
    // 행 최소 간격은 가장 좁은 열로 재서 µm 간격 행을 막고, 최대 간격은 가장 넓은 열로 재서 높은 열에 빈 구간이 안 생기게 한다.
    const gapsMm = (a, b) => {
      let minG = Infinity;
      let maxG = 0;
      for (let j = 0; j < n; j += 1) {
        const d = Math.hypot(rows[a].rad[j] - rows[b].rad[j], rows[a].z[j] - rows[b].z[j]);
        if (d < minG) minG = d;
        if (d > maxG) maxG = d;
      }
      return { minG, maxG };
    };
    // 꺾임은 열마다 따로 누적한다. 열마다 가장 큰 꺾임을 더하면 서로 다른 깊이의 꺾임을 겹쳐 행이 두 배 가까이 는다.
    const angle = (i, j) => Math.atan2(rows[i].rad[j] - rows[i + 1].rad[j], rows[i].z[j] - rows[i + 1].z[j]);
    const prevAngle = Float64Array.from({ length: n }, (_, j) => angle(0, j));
    const acc = new Float64Array(n);
    const step = (ROW_TURN_DEG * Math.PI) / 180;
    const picked = [0];
    for (let i = 1; i < rows.length; i += 1) {
      let worst = 0;
      if (i < rows.length - 1) {
        for (let j = 0; j < n; j += 1) {
          const a = angle(i, j);
          acc[j] += Math.abs(a - prevAngle[j]);
          prevAngle[j] = a;
          if (acc[j] > worst) worst = acc[j];
        }
      }
      const { minG: gap, maxG } = gapsMm(i, picked[picked.length - 1]);
      if (i === rows.length - 1) {
        // 맨 아래 행은 일반 행에 붙으므로 꼭 둔다. 바로 앞 행과 너무 붙으면 앞 행을 뺀다.
        if (gap < SEAM_MIN_PITCH_MM && picked.length > 1) picked.pop();
        picked.push(i);
      } else if (gap >= SEAM_MIN_PITCH_MM && (worst >= step || maxG >= ROW_MAX_PITCH_MM)) {
        picked.push(i);
        acc.fill(0);
      }
    }
    return picked.map((i) => rows[i]);
  };
  // 고른 행이 어느 열에서든 위 끝 접선 방향으로 되돌아가면(면 접힘) 같은 높이 반경 섞기로 다시 만든다.
  const folds = (rows) =>
    rows.some((a, k) => {
      const b = rows[k + 1];
      if (!b) return false;
      for (let j = 0; j < n; j += 1) {
        const { d } = frames[j];
        if ((b.rad[j] - a.rad[j]) * d[0] + (b.z[j] - a.z[j]) * d[1] <= 0) return true;
      }
      return false;
    });
  let picked = pickRows(vs.map((v) => rowAt(v, false)));
  if (folds(picked)) picked = pickRows(vs.map((v) => rowAt(v, true)));
  return picked.reverse();
}

/**
 * 메시에 쓸 열을 고른다. 둘레 곡선이 COLUMN_TURN_DEG만큼 꺾일 때마다 열 하나, 곧은 곳은 COLUMN_MAX_ARC_MM까지 벌린다.
 * 꺾임·길이는 모든 행에서 재서 가장 큰 값을 쓴다. 볼록한 단면은 한 바퀴 꺾임이 360°라 열은 모서리에 몰린다.
 * @param {{ rad: Float64Array, z: Float64Array }[]} rows
 * @returns {number[]} 열 번호(오름차순, 0 포함)
 */
function selectMeshColumns(rows, thetas) {
  const n = thetas.length;
  const turn = new Float64Array(n);
  const arc = new Float64Array(n);
  const cos = thetas.map(Math.cos);
  const sin = thetas.map(Math.sin);
  for (const row of rows) {
    // 열 사이 µm 잡음이 0.375° 간격에서는 몇 도 꺾임으로 보인다. 꺾임은 ±1.5° 평균한 곡선에서 잰다.
    const rad = circularSmooth(Array.from(row.rad), COLUMN_TURN_SMOOTH_HALF);
    const z = circularSmooth(Array.from(row.z), COLUMN_TURN_SMOOTH_HALF);
    const seg = (j) => {
      const k = (j + 1) % n;
      return [rad[k] * cos[k] - rad[j] * cos[j], rad[k] * sin[k] - rad[j] * sin[j], z[k] - z[j]];
    };
    let prev = seg(n - 1);
    for (let j = 0; j < n; j += 1) {
      const cur = seg(j);
      const lp = Math.hypot(...prev);
      const lc = Math.hypot(...cur);
      if (lc > arc[j]) arc[j] = lc;
      if (lp > 0 && lc > 0) {
        const dot = (prev[0] * cur[0] + prev[1] * cur[1] + prev[2] * cur[2]) / (lp * lc);
        const a = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (a > turn[j]) turn[j] = a;
      }
      prev = cur;
    }
  }
  const step = (COLUMN_TURN_DEG * Math.PI) / 180;
  const cols = [0];
  let acc = 0;
  let gap = 0;
  for (let j = 1; j < n; j += 1) {
    acc += turn[j];
    gap += arc[j - 1];
    if (acc >= step || gap + arc[j] > COLUMN_MAX_ARC_MM) {
      cols.push(j);
      acc = 0;
      gap = 0;
    }
  }
  return cols;
}

function bandSmoothKeep(t, height) {
  const s = Math.min(1, Math.max(0, ((1 - t) * height) / 0.9));
  return 1 - (1 - t ** 1.5) * s * s * (3 - 2 * s);
}

/**
 * Z_a 평면 ~ 위쪽 레벨면(topLevel) 사이 외곽 면을 지우고 profiles로 만든 띠를 붙인다.
 * @param {(theta: number, t: number) => number} radiusAt t∈[0,1] (0=Z_a, 1=위)
 */
function replaceBand(
  mesh,
  {
    zA,
    ra,
    topZOf,
    radiusAt,
    rawCreaseR = null,
    rCut,
    origProbe,
    crease,
    seamOrigScale = null,
    seamBlendScale = seamOrigScale,
    convexCuffDeform = false,
  },
) {
  let cut = splitByLevel(mesh, (x, y, z) => z - zA);
  if (!crease) cut = splitByLevel(cut, (x, y, z) => z - topZOf(angleOf(x, y)));
  const { verts, faces, faceAttr, faceMain } = cut;
  const fc = faces.length / 3;
  const removed = new Uint8Array(fc);
  const centroid = (f) => {
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    return [
      (verts[a] + verts[b] + verts[c]) / 3,
      (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3,
      (verts[a + 2] + verts[b + 2] + verts[c + 2]) / 3,
    ];
  };
  const inBandOuter = (f, zTopSlack) => {
    const [cx, cy, cz] = centroid(f);
    if (!(cz > zA && cz < topZOf(angleOf(cx, cy)) + zTopSlack)) return false;
    // 겹친 캡 조각은 길쭉해서 무게중심이 축 쪽으로 들어온다. 세 꼭짓점이 모두 채널 밖이면 외곽 면이다.
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k] * 3;
      if (Math.hypot(verts[v], verts[v + 1]) <= rCut) return false;
    }
    return true;
  };
  if (crease) {
    // 마진 모서리를 넘지 않고, 모서리 아래 외곽 면만 이웃을 따라 지운다(모서리 위 면은 하나도 안 지운다).
    const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const edgeFaces = new Map();
    for (let f = 0; f < fc; f += 1) {
      if (!faceMain[f]) continue;
      for (let k = 0; k < 3; k += 1) {
        const key = ek(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
        const list = edgeFaces.get(key);
        if (list) list.push(f);
        else edgeFaces.set(key, [f]);
      }
    }
    const stack = [];
    for (let f = 0; f < fc; f += 1) {
      if (faceMain[f] && inBandOuter(f, -CREASE_WINDOW_MM)) {
        removed[f] = 1;
        stack.push(f);
      }
    }
    while (stack.length) {
      const f = stack.pop();
      for (let k = 0; k < 3; k += 1) {
        const key = ek(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
        if (crease.edges.has(key)) continue;
        for (const g of edgeFaces.get(key) || []) {
          if (removed[g] || !faceMain[g] || !inBandOuter(g, CREASE_WINDOW_MM)) continue;
          removed[g] = 1;
          stack.push(g);
        }
      }
    }
  } else {
    for (let f = 0; f < fc; f += 1) {
      if (faceMain[f] && inBandOuter(f, 0)) removed[f] = 1;
    }
  }
  let outwardVotes = 0;
  for (let f = 0; f < fc; f += 1) {
    if (!removed[f]) continue;
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    const [cx, cy] = centroid(f);
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    outwardVotes += Math.sign(nx * cx + ny * cy);
  }

  const keptEdges = new Set();
  const removedEdges = [];
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      if (removed[f]) removedEdges.push([a, b]);
      else keptEdges.add(`${a}_${b}`);
    }
  }
  // 지운 면의 모서리 중 남은 면과 맞닿은 것 = 구멍 경계. 남은 면 기준 방향(b→a)으로 잇는다.
  const boundary = [];
  for (const [a, b] of removedEdges) {
    if (keptEdges.has(`${b}_${a}`)) boundary.push([b, a]);
  }
  const loops = chainBoundaryLoops(boundary);
  if (!loops || loops.length !== 2) {
    fail("manual-review", "이음부 경계가 닫힌 루프 2개로 나오지 않습니다(언더컷·구멍).", {
      loopCount: loops ? loops.length : null,
    });
  }
  const meanZ = (loop) => loop.reduce((s, v) => s + verts[v * 3 + 2], 0) / loop.length;
  loops.sort((p, q) => meanZ(p) - meanZ(q));
  const rawBottomLoop = loops[0];
  const bottomRayAt = creaseRayIntersector(rawBottomLoop, verts);
  const bottomChordOffset = thetaColumns().map((theta) => {
    const hit = bottomRayAt(theta);
    return hit && Number.isFinite(hit.r) ? hit.r - ra : 0;
  });
  // 원뿔 경계(bottom)는 한 칸이 ~7.8°로 넓어 ~1° 간격인 첫 행과 바로 지퍼로 이으면 모서리 쪽 부채꼴 삼각형이 35° 이상 눕는다.
  // 원뿔 삼각형의 위쪽 직선 모서리를 현 위에서 잘게 나누어 원뿔 평면은 바꾸지 않고 경계 정점 간격만 맞춘다.
  const bottomEdgeSub = new Map();
  const bottomLoop = [];
  for (let i = 0; i < rawBottomLoop.length; i += 1) {
    const a = rawBottomLoop[i];
    const b = rawBottomLoop[(i + 1) % rawBottomLoop.length];
    bottomLoop.push(a);
    let da = Math.abs(angleOf(verts[b * 3], verts[b * 3 + 1]) - angleOf(verts[a * 3], verts[a * 3 + 1]));
    if (da > Math.PI) da = TWO_PI - da;
    const steps = Math.ceil(da / BOTTOM_EDGE_MAX_RAD);
    if (steps <= 1) continue;
    const mids = [];
    for (let s = 1; s < steps; s += 1) {
      const u = s / steps;
      const idx = verts.length / 3;
      verts.push(
        verts[a * 3] + u * (verts[b * 3] - verts[a * 3]),
        verts[a * 3 + 1] + u * (verts[b * 3 + 1] - verts[a * 3 + 1]),
        verts[a * 3 + 2] + u * (verts[b * 3 + 2] - verts[a * 3 + 2]),
      );
      mids.push(idx);
      bottomLoop.push(idx);
    }
    bottomEdgeSub.set(`${a}_${b}`, [a, ...mids, b]);
  }
  const bottom = angularRow(bottomLoop, verts);
  const top = angularRow(loops[1], verts);
  if (!bottom || !top) {
    fail("manual-review", "이음부 경계가 축 둘레로 한 바퀴 돌지 않습니다(언더컷).");
  }
  const offCone = Math.max(...bottom.map(({ v }) => Math.abs(Math.hypot(verts[v * 3], verts[v * 3 + 1]) - ra)));
  if (offCone > BOTTOM_ON_CONE_TOL_MM) {
    fail("manual-review", "커넥션 상단 경계가 11° 원뿔 위에 있지 않습니다.", { offConeMm: round3(offCone) });
  }

  const thetas = thetaColumns();
  const rawHeights = thetas.map((theta) => topZOf(theta) - zA);
  // 위 끝 높이(마진 모서리 꼭짓점을 직선으로 이은 곡선)도 원본 열마다 꺾여 있다. 띠 행은 매끈한 높이를 따르되
  // 위 끝을 넘지 않는다. 이음 행(가장 위가 0.06mm 아래)이 있으면 HEIGHT_SMOOTH_OVERSHOOT_MM까지는 넘어도 된다.
  const overshoot = origProbe ? HEIGHT_SMOOTH_OVERSHOOT_MM : 0;
  const heights = (angularLowPass(rawHeights) || rawHeights).map((h, j) => Math.min(h, rawHeights[j] + overshoot));
  // 면이 쭈글하지 않도록, 아래쪽 행일수록 각도 방향으로 반경·높이를 평균한다.
  // 위쪽 행(피니시라인·원본 곡면과 만나는 곳)은 평균하지 않고 그대로 둔다.
  const smoothHeights = circularSmooth(heights, BAND_SMOOTH_HALF_COLUMNS);
  /** 행마다 전체 열의 반경·z. 메시에는 selectMeshColumns로 고른 열만 쓴다. */
  const rowData = [];
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const seamDepth = origProbe ? Math.min(SEAM_BLEND_DEPTH_MM, minHeight / 2) : 0;
  const tEnd = origProbe ? 1 - (seamDepth + ROW_PITCH_MM) / minHeight : 1 - ROW_PITCH_MM / maxHeight;
  for (const t of adaptiveRowTs(radiusAt, heights, tEnd)) {
    const raw = Array.from({ length: STRIP_COLUMNS }, (_, j) => radiusAt(j, t));
    const avg = circularSmooth(raw, BAND_SMOOTH_HALF_COLUMNS);
    const rad = new Float64Array(STRIP_COLUMNS);
    const z = new Float64Array(STRIP_COLUMNS);
    for (let j = 0; j < STRIP_COLUMNS; j += 1) {
      const scale = seamOrigScale ? seamOrigScale[j] : 1;
      const keep = convexCuffDeform ? 1 : 1 - (1 - bandSmoothKeep(t, heights[j])) * scale;
      const zj = zA + t * (heights[j] * keep + smoothHeights[j] * (1 - keep));
      const uChord = Math.min(1, Math.max(0, (zj - zA) / BOTTOM_CHORD_BLEND_MM));
      const wChord = (1 - uChord) ** 3 * (1 + 3 * uChord);
      rad[j] = raw[j] * keep + avg[j] * (1 - keep) + bottomChordOffset[j] * wChord;
      z[j] = zj;
    }
    rowData.push({ rad, z });
  }
  if (origProbe) {
    rowData.push(
      ...seamRows({
        zA,
        thetas,
        heights,
        rawHeights,
        smoothHeights,
        radiusAt,
        rawCreaseR,
        origProbe,
        seamDepth,
        tEnd,
        seamOrigScale,
        seamBlendScale,
        convexCuffDeform,
      }),
    );
  }
  const meshColumns = selectMeshColumns(rowData, thetas);
  const grid = rowData.map(({ rad, z }) =>
    meshColumns.map((j) => {
      const idx = verts.length / 3;
      verts.push(rad[j] * Math.cos(thetas[j]), rad[j] * Math.sin(thetas[j]), z[j]);
      return { v: idx, a: thetas[j] };
    }),
  );
  // 마진 아래 커프 띠도 포스트와 같은 규칙이다. 크라운 내면이 닿는 면이라 원본 외곽보다 바깥으로 나가면 안 된다.
  // 열마다 원본 자오선을 읽어 두고, 새 꼭짓점 반경이 그 높이의 원본 반경을 넘으면(1µm 여유) 끌어내린다.
  // 아래 경계(원뿔 위)·위 경계(마진 모서리)는 원본 꼭짓점 그대로라 건드리지 않는다.
  // 예외: 낮은 마진의 볼록 변형(convexCuffDeform)은 커프 아래를 70° 이하로 만들려고 일부러 부풀리는 동작이라 그대로 둔다.
  if (origProbe && !convexCuffDeform && grid.length) {
    const meridians = meshColumns.map((j) => origProbe.meridian(thetas[j], zA, topZOf(thetas[j])));
    for (const row of grid) {
      for (let c = 0; c < row.length; c += 1) {
        const vi = row[c].v * 3;
        const x = verts[vi];
        const y = verts[vi + 1];
        const r = Math.hypot(x, y);
        if (!(r > 0)) continue;
        const ro = meridians[c](verts[vi + 2]);
        if (!Number.isFinite(ro)) continue;
        const cap = ro - 0.001;
        if (r > cap && cap > 0) {
          const s = cap / r;
          verts[vi] = x * s;
          verts[vi + 1] = y * s;
        }
      }
    }
  }

  const outward = outwardVotes >= 0 ? 1 : -1;
  const newFaces = [];
  const emit = (a, b, c) => {
    const pa = a * 3, pb = b * 3, pc = c * 3;
    const ux = verts[pb] - verts[pa], uy = verts[pb + 1] - verts[pa + 1], uz = verts[pb + 2] - verts[pa + 2];
    const vx = verts[pc] - verts[pa], vy = verts[pc + 1] - verts[pa + 1], vz = verts[pc + 2] - verts[pa + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const cx = (verts[pa] + verts[pb] + verts[pc]) / 3;
    const cy = (verts[pa + 1] + verts[pb + 1] + verts[pc + 1]) / 3;
    if (Math.hypot(nx, ny, ux * vy - uy * vx) < 1e-14) return;
    if (Math.sign(nx * cx + ny * cy) === outward) newFaces.push(a, b, c);
    else newFaces.push(a, c, b);
  };
  const stack = [bottom, ...grid, top];
  for (let r = 0; r + 1 < stack.length; r += 1) zipperRows(stack[r], stack[r + 1], emit);

  const outFaces = [];
  const outAttr = [];
  for (let f = 0; f < fc; f += 1) {
    if (removed[f]) continue;
    const f0 = faces[f * 3], f1 = faces[f * 3 + 1], f2 = faces[f * 3 + 2];
    const chain01 = bottomEdgeSub.get(`${f0}_${f1}`);
    const chain12 = bottomEdgeSub.get(`${f1}_${f2}`);
    const chain20 = bottomEdgeSub.get(`${f2}_${f0}`);
    const chain = chain01 || chain12 || chain20;
    if (chain) {
      const opp = chain01 ? f2 : chain12 ? f0 : f1;
      for (let s = 0; s + 1 < chain.length; s += 1) {
        outFaces.push(chain[s], chain[s + 1], opp);
        outAttr.push(faceAttr[f]);
      }
      continue;
    }
    outFaces.push(f0, f1, f2);
    outAttr.push(faceAttr[f]);
  }
  for (let i = 0; i < newFaces.length; i += 3) {
    outFaces.push(newFaces[i], newFaces[i + 1], newFaces[i + 2]);
    outAttr.push(CUFF_BLEND_PATCH_ATTRIBUTE);
  }
  const triCount = outFaces.length / 3;
  const positions = new Float64Array(triCount * 9);
  for (let t = 0; t < triCount; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = outFaces[t * 3 + k] * 3;
      positions[t * 9 + k * 3] = verts[v];
      positions[t * 9 + k * 3 + 1] = verts[v + 1];
      positions[t * 9 + k * 3 + 2] = verts[v + 2];
    }
  }
  return {
    buffer: writeBinaryStl({ positions, attributes: Uint16Array.from(outAttr) }),
    removedTriangles: removed.reduce((s, x) => s + x, 0),
    patchTriangles: newFaces.length / 3,
    rows: grid.length,
    columns: meshColumns.length,
  };
}

/** 피니시라인 점 중 커넥션 높이(z<0.5)에 잘못 잡힌 점(예: 반경 1.5, z −0.8)을 뺀다. 진짜 피니시라인은 그 위에 있다. */
function validFinishLinePoints(finishLine) {
  const all = (Array.isArray(finishLine?.points) ? finishLine.points : [])
    .map((p) => [Number(p?.[0]), Number(p?.[1]), Number(p?.[2])])
    .filter((p) => p.every(Number.isFinite) && Math.hypot(p[0], p[1]) > 0.1);
  const kept = all.filter((p) => p[2] >= 0.5);
  return kept.length >= all.length * 0.85 ? kept : all;
}

function finishLineMinZ(finishLine) {
  const pts = validFinishLinePoints(finishLine);
  const zs = pts.map((p) => p[2]);
  if (zs.length) return Math.min(...zs);
  const direct = Number(finishLine?.min_z);
  return Number.isFinite(direct) ? direct : NaN;
}

/** 피니시라인 Z를 축 둘레 각도로 보간하는 함수. */
function finishLineZByAngle(finishLine) {
  return zByAngle(validFinishLinePoints(finishLine).map((p) => ({ a: angleOf(p[0], p[1]), z: p[2] })));
}

/**
 * 피니시라인 점 근처에서 메시의 실제 마진 모서리(날카로운 모서리 한 바퀴)를 찾는다.
 * 피니시라인 점을 각도로 선형 보간한 곡선은 실제 모서리와 수십 µm 어긋나므로, 이음 위 끝은 이 모서리에 붙인다.
 * 고리에 꼭짓점 하나가 더 붙어 있으면(차수 1) 그 가지만 떼고 닫힌 고리는 쓴다.
 * @returns {{ loop: number[], edges: Set<string>, zOf: (theta: number) => number, meanOffsetMm: number } | null}
 */
function creaseRayIntersector(loop, verts) {
  const n = loop.length;
  const pts = loop.map((v) => [verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]]);
  return (theta) => {
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    let best = null;
    for (let i = 0; i < n; i += 1) {
      const [x1, y1, z1] = pts[i];
      const [x2, y2, z2] = pts[(i + 1) % n];
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const r = (x1 * ey - y1 * ex) / den;
      const u = (x1 * dy - y1 * dx) / den;
      if (r > 0 && u >= -1e-7 && u <= 1 + 1e-7) {
        const z = z1 + u * (z2 - z1);
        if (!best || r > best.r) best = { r, z };
      }
    }
    return best;
  };
}

function findFinishCrease(mesh, flZ) {
  const { verts, faces, faceMain } = mesh;
  const fc = faces.length / 3;
  const normals = new Float64Array(fc * 3);
  const edgeFaces = new Map();
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    const a = faces[f * 3] * 3;
    const b = faces[f * 3 + 1] * 3;
    const c = faces[f * 3 + 2] * 3;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[f * 3] = nx / len;
    normals[f * 3 + 1] = ny / len;
    normals[f * 3 + 2] = nz / len;
    for (let k = 0; k < 3; k += 1) {
      const key = ek(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }
  const near = (v) => Math.abs(flZ(angleOf(verts[v * 3], verts[v * 3 + 1])) - verts[v * 3 + 2]) < CREASE_WINDOW_MM;
  const cosMax = Math.cos((CREASE_MIN_DEG * Math.PI) / 180);
  const adj = new Map();
  for (const [key, fs] of edgeFaces) {
    if (fs.length !== 2) continue;
    const [p, q] = fs;
    const dot = normals[p * 3] * normals[q * 3] + normals[p * 3 + 1] * normals[q * 3 + 1] + normals[p * 3 + 2] * normals[q * 3 + 2];
    if (dot > cosMax) continue;
    const [a, b] = key.split("_").map(Number);
    if (!near(a) || !near(b)) continue;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  // 닫힌 고리에 붙은 짧은 가지(끝점) 때문에 모서리 전체를 버리지 않는다.
  const pending = [];
  for (const [v, ns] of adj) if (ns.length < 2) pending.push(v);
  while (pending.length) {
    const v = pending.pop();
    const ns = adj.get(v);
    if (!ns || ns.length >= 2) continue;
    adj.delete(v);
    for (const w of ns) {
      const next = (adj.get(w) || []).filter((x) => x !== v);
      if (next.length) adj.set(w, next);
      else adj.delete(w);
      if (next.length < 2) pending.push(w);
    }
  }
  let best = null;
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of adj.get(v)) {
        if (!seen.has(w)) {
          seen.add(w);
          stack.push(w);
        }
      }
    }
    if (comp.length < 16 || comp.some((v) => adj.get(v).length !== 2)) continue;
    const loop = [start];
    let prev = -1;
    let cur = start;
    for (;;) {
      const [n0, n1] = adj.get(cur);
      const nxt = n0 !== prev ? n0 : n1;
      if (nxt === start) break;
      loop.push(nxt);
      prev = cur;
      cur = nxt;
      if (loop.length > comp.length) break;
    }
    if (loop.length !== comp.length || !angularRow(loop, verts)) continue;
    const meanOffsetMm =
      loop.reduce((s, v) => s + Math.abs(flZ(angleOf(verts[v * 3], verts[v * 3 + 1])) - verts[v * 3 + 2]), 0) / loop.length;
    if (!best || meanOffsetMm < best.meanOffsetMm) best = { loop, meanOffsetMm };
  }
  if (!best) return null;
  const edges = new Set(best.loop.map((v, i) => ek(v, best.loop[(i + 1) % best.loop.length])));
  const fallbackZ = zByAngle(best.loop.map((v) => ({ a: angleOf(verts[v * 3], verts[v * 3 + 1]), z: verts[v * 3 + 2] })));
  const rayAt = creaseRayIntersector(best.loop, verts);
  const zOf = (theta) => rayAt(theta)?.z ?? fallbackZ(theta);
  const rOf = (theta) => rayAt(theta)?.r ?? NaN;
  return { loop: best.loop, edges, zOf, rOf, meanOffsetMm: best.meanOffsetMm };
}

/** 각도별 점({a, z})을 선형 보간하는 z(θ). 점이 8개 미만이면 null. */
function zByAngle(points) {
  const pts = points.map((p) => ({ a: wrapAngle(p.a), z: p.z })).sort((p, q) => p.a - q.a);
  if (pts.length < 8) return null;
  return (theta) => {
    const a = wrapAngle(theta);
    let hi = pts.findIndex((p) => p.a >= a);
    if (hi < 0) hi = 0;
    const lo = (hi - 1 + pts.length) % pts.length;
    let span = pts[hi].a - pts[lo].a;
    if (span <= 0) span += TWO_PI;
    let d = a - pts[lo].a;
    if (d < 0) d += TWO_PI;
    const w = span > 1e-9 ? d / span : 0;
    return pts[lo].z * (1 - w) + pts[hi].z * w;
  };
}

function setup(buffer, { spec, specKey }) {
  if (!spec) {
    fail("spec-pending", `커넥션 스펙이 등록되지 않은 임플란트입니다(${specKey || "스펙 없음"}). 개발팀 확인이 필요합니다.`);
  }
  const { mesh, probe, triCount } = prepare(buffer);
  const taper = measureConnectionTaper(probe);
  try {
    if (!taper) fail("manual-review", "원점 아래 11° 커넥션 테이퍼를 찾지 못했습니다.");
    const top = resolveConnectionTop(taper, spec, specKey);
    // 스펙 Z_a보다 원뿔이 먼저 벌어지면 벌어지기 전에서 잇는다. 그 사이 원본 커프를 남기면 이음이 11°로 다시 출발해 어깨가 진다.
    const zA = taper.departZ > 0 ? Math.min(top.zA, taper.departZ) : top.zA;
    return { mesh, probe, triCount, taper, ...top, zA };
  } catch (error) {
    // 기공소가 11° 원뿔을 스펙보다 짧게 끝내고 수직 구간(fill_steps 포함)을 둔 설계: 첫 계단 바로 아래에서 잇는다.
    const stepTaper = error instanceof CuffBlendError ? measureConnectionStepTop(probe) : null;
    if (!stepTaper) throw error;
    return {
      mesh,
      probe,
      triCount,
      taper: stepTaper,
      zA: stepTaper.measuredTopZ,
      matchedKey: specKey,
      warning: "11° 원뿔이 스펙보다 짧아 첫 계단 아래에서 이었습니다.",
    };
  }
}

/** 보정으로 새로 생긴 꼭짓점 중 피니시라인 곡선과의 최소 여유(mm). 음수면 피니시라인을 넘은 것. */
function finishLineClearance(inputBuffer, outputBuffer, flZ) {
  const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const before = new Set();
  const src = parseStl(inputBuffer).positions;
  for (let i = 0; i < src.length; i += 3) before.add(key(src[i], src[i + 1], src[i + 2]));
  const dst = parseStl(outputBuffer).positions;
  let min = Infinity;
  for (let i = 0; i < dst.length; i += 3) {
    const x = dst[i];
    const y = dst[i + 1];
    const z = dst[i + 2];
    if (before.has(key(x, y, z))) continue;
    min = Math.min(min, flZ(angleOf(x, y)) - z);
  }
  return min;
}

function thetaColumns() {
  return Array.from({ length: STRIP_COLUMNS }, (_, j) => (j / STRIP_COLUMNS) * TWO_PI);
}

function wrapResult(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CuffBlendError) {
      return { ok: false, status: error.status, reason: error.reason, detail: error.detail };
    }
    return { ok: false, status: "failed", reason: String(error?.message || error), detail: {} };
  }
}

// ---------------------------------------------------------------------------
// auto: 커넥션 상단 ~ 커프 하단 G2 이음

/**
 * @param {Buffer} buffer filled STL
 * @param {{ spec: object|null, specKey: string, finishLine: object|null }} options
 */
export function blendCuffJunction(buffer, options = {}) {
  return wrapResult(() => {
    const prepared = setup(buffer, options);
    const { taper, zA, matchedKey, warning } = prepared;
    let { mesh, probe } = prepared;
    const flMin = finishLineMinZ(options.finishLine);
    if (!Number.isFinite(flMin)) fail("manual-review", "피니시라인이 없어 커프 보호 범위를 정할 수 없습니다.");
    const convexCuffDeform = flMin <= CUFF_CONVEX_DEFORM_MAX_FINISH_MIN_Z_MM;
    // 피니시라인(크라운 안착)과 그 위는 절대 건드리지 않는다.
    // 단차 직경은 무시하고, 원뿔 끝에서 피니시라인 곡선 −0.05mm까지 오목한 곡선으로 잇는다(수평 평면 Z_b는 쓰지 않는다).
    const ra = taper.coneAt(zA);
    const thetas = thetaColumns();
    const flZ = finishLineZByAngle(options.finishLine);
    if (!flZ) fail("manual-review", "피니시라인 곡선을 읽지 못해 이음 위 끝을 정할 수 없습니다.");
    // 예전 fill_steps 캡이 남긴 얇은 부채·고리(축 둘레로 넓게 걸친 삼각형)를 먼저 걷어 낸다.
    const flMaxZ = Math.max(...thetaColumns().map(flZ));
    const fins = stripSpanFins(mesh, zA - 0.05, flMaxZ + 0.3, taper.coneAt(zA) * 0.6);
    if (fins.stripped) {
      mesh = fins.mesh;
      const mainFaces = [];
      for (let f = 0; f < mesh.faceMain.length; f += 1) {
        if (mesh.faceMain[f]) mainFaces.push(mesh.faces[f * 3], mesh.faces[f * 3 + 1], mesh.faces[f * 3 + 2]);
      }
      probe = new RadialProbe(mesh.verts, mainFaces);
    }
    let strippedSolid = 0;
    if (taper.fromStep) {
      // 원뿔이 짧은 설계: 수직 구간을 덮은 예전 fill_steps 솔리드는 본체와 떨어져 있어 새 곡면 아래·위로 겹친다. 통째로 걷어 낸다.
      const rChPre = channelRadius(mesh, zA - 0.3, flMaxZ + 0.3, ra);
      const solid = stripDetachedFillSolid(mesh, -0.6, flMaxZ + 0.3, rChPre > 0 ? (rChPre + ra) / 2 : ra * 0.75);
      mesh = solid.mesh;
      strippedSolid = solid.stripped;
    }
    const crease = findFinishCrease(mesh, flZ);
    const seamZ = crease ? crease.zOf : flZ;
    const attempt = (offsetMm) => {
      let topZ;
      let topZOf;
      {
      topZOf = (theta) => seamZ(theta) - offsetMm;
      topZ = thetas.map(topZOf);
      if (Math.min(...topZ) - zA < MIN_FOLLOW_BAND_MM) {
        fail("manual-review", "피니시라인이 커넥션 상단보다 낮거나 너무 가까워 이음부를 만들 수 없습니다.", {
          zA: round3(zA),
          finishLineMinZ: round3(flMin),
        });
      }
    }
    const zTopMax = Math.max(...topZ);
    const rCh = channelRadius(mesh, zA - 0.3, zTopMax + 0.3, ra);
    const rCut = rCh > 0 ? (rCh + ra) / 2 : ra * 0.75;
    if (detachedInBand(mesh, -0.5, zTopMax, rCut) || nonManifoldInBand(mesh, zA - 0.1, zTopMax + 0.1)) {
      fail("manual-review", "이음부에 겹친 보정 조각(예전 fill_steps 캡 등)이 있습니다.");
    }
    const tops = sampleTopConditions(probe, thetas, topZ, CLEAN_WINDOW_MM);
    if (tops.some((t) => !t)) fail("manual-review", "커프 하단 곡면을 읽지 못했습니다.");
    const hs = topZ.map((z) => z - zA);
    // 위 끝 반경·기울기는 위 끝 바로 아래 원본 커프에서 잰다. 곡선이 위 끝에서 원본과 같은 접선으로 이어져야 꺾인 선이 안 생긴다.
    const measureCols = thetas.map((_, j) => j).filter((j) => j % MEASURE_STRIDE === 0);
    const below = sampleBelowConditions(
      probe,
      measureCols.map((j) => thetas[j]),
      measureCols.map((j) => topZ[j]),
      TOP_BELOW_WINDOW_MM,
    );
    const belowOk = below.every(Boolean);
    const belowSlopes = belowOk
      ? circularSmooth(
          fourierLowPass(below.map((b) => b.slope), measureCols.length / 2 - 1, undefined, STRIP_COLUMNS),
          TOP_SLOPE_SMOOTH_COLUMNS,
        )
      : null;
    // 볼록(부푼) 구간은 뼈에 걸리므로 오목 프로파일로 바로잡는다.
    // 커넥션 쪽(피니시라인에서 먼 쪽)은 원뿔 접선에서 오목하게 벌어지고, 위 끝은 커프 접선에 맞춘다.
    // 단차 직경은 따르지 않는다: 원뿔에서 커프까지 항상 살짝 오목하게 부드럽게 올린다.
    // 원뿔 접선에서 시작해 Z_b에서 원본 곡면 접선에 이어지는 G1 오목 곡선. 불가능한 열만 단순 오목 곡선.
    // 열마다 들쭉날쭉하면 면에 주름이 생기므로, 위 끝 반경은 저주파 성분만 남겨 매끈하게 한다.
    // 출발 기울기는 커넥션 원뿔 기울기(11° 등)를 그대로 이어 받고, 곡선이 기울기를 줄여 가며 오목하게 오른다.
    // 평균값이 원본 반경에서 ±SMOOTH_MAX_SHIFT_MM 넘게 벗어나면 위 끝에 단차가 생기므로 그 안으로 제한한다.
    const r1avg = fourierLowPass(tops.map((t) => t.r), TOP_RADIUS_HARMONICS);
    const belowR = belowSlopes
      ? angularLowPass(below.map((b) => b.r), STRIP_COLUMNS)
      : tops.map((t, j) => t.r + Math.max(-SMOOTH_MAX_SHIFT_MM, Math.min(SMOOTH_MAX_SHIFT_MM, r1avg[j] - t.r)));
    const rawCreaseR = crease && offsetMm === 0 ? thetas.map((theta) => crease.rOf(theta)) : null;
    const smoothCreaseR =
      rawCreaseR && rawCreaseR.every(Number.isFinite) ? angularLowPass(rawCreaseR, STRIP_COLUMNS) : null;
    // 낮은 피니시라인(불완전 가공에 가까운 케이스)에서만: 마진 아래 원본 기울기가 가파른 곳(70° 초과 턱 등)은 원본 턱으로 섞지 않고 70° 이하 볼록 변형 곡선을 마진까지 바로 잇는다.
    const seamOrigScale = convexCuffDeform
      ? (() => {
      if (!belowOk) return null;
      const rawKeep = measureCols.map((j, i) => {
        const bSlope = below[i]?.slope ?? 0;
        const rTopCol = rawCreaseR && Number.isFinite(rawCreaseR[j]) ? rawCreaseR[j] : below[i]?.r;
        const r35 = probe.rayRadius(thetas[j], topZ[j] - 0.035);
        const r80 = probe.rayRadius(thetas[j], topZ[j] - 0.08);
        const s35 = Number.isFinite(rTopCol) && Number.isFinite(r35) ? (rTopCol - r35) / 0.035 : 0;
        const s80 = Number.isFinite(rTopCol) && Number.isFinite(r80) ? (rTopCol - r80) / 0.08 : 0;
        const s = Math.max(bSlope, s35, s80);
        if (!Number.isFinite(s) || s <= SEAM_ORIG_FADE_START_SLOPE) return 1;
        if (s >= SEAM_ORIG_FADE_END_SLOPE) return 0;
        const u = (s - SEAM_ORIG_FADE_START_SLOPE) / (SEAM_ORIG_FADE_END_SLOPE - SEAM_ORIG_FADE_START_SLOPE);
        return 1 - u * u * (3 - 2 * u);
      });
      const lp = angularLowPass(fillMissingCircular(rawKeep), STRIP_COLUMNS) || rawKeep;
      return circularSmooth(lp, TOP_SLOPE_SMOOTH_COLUMNS).map((w) => Math.max(0, Math.min(1, w)));
    })()
      : null;
    const coneSlope = Number.isFinite(taper.slope) ? taper.slope : TAPER_SLOPE;
    // 기본 오목 프로파일의 끝 기울기가 원본 상부보다 가파르면(예: 55° vs 36°) 마진 아래 이음에서 원본으로 되돌아가며 오목 골이 생긴다.
    // 중간에서 별도 곡선을 이어 붙이면 곡률(2차 미분) 불연속으로 희미한 가로 경계가 보이므로,
    // 하나의 4차 베지어 곡선 안에서 위 끝 제어점 비중만 살짝 낮춰(relax) 하부 오목에서 상부 약한 볼록으로 경계 없이(C∞) 이어지게 한다.
    const tailWeights = circularSmooth(
      tops.map((_, j) => {
        if (convexCuffDeform || !belowSlopes) return 0;
        const rTop = smoothCreaseR ? smoothCreaseR[j] : belowR[j];
        const hb = hs[j];
        const d = rTop - ra;
        const m0 = Math.max(0, Math.min(coneSlope * hb, d - CONCAVE_MARGIN * hb));
        const d0 = m0 / 4;
        const d1 = d0 * BEZIER_DIP;
        const rest = d - d0 - d1;
        const sEnd = (2 * rest) / hb;
        const diff = sEnd - belowSlopes[j];
        return Math.max(0, Math.min(1, (diff - 0.05) / 0.15));
      }),
      TOP_SLOPE_SMOOTH_COLUMNS,
    ).map((w) => Math.max(0, Math.min(1, w)));
    const finalSeamOrigScale = smoothCreaseR
      ? thetas.map(() => 0)
      : seamOrigScale
        ? seamOrigScale.map((w, j) => w * (1 - tailWeights[j]))
        : tailWeights.some((w) => w > 1e-3)
          ? tailWeights.map((w) => 1 - w)
          : null;
    const r1s = belowR.map((r, j) => {
      if (!smoothCreaseR) return r;
      if (!convexCuffDeform || !seamOrigScale) return smoothCreaseR[j];
      const w = seamOrigScale[j];
      return smoothCreaseR[j] * w + Math.max(r, smoothCreaseR[j]) * (1 - w);
    });
    const legacyConcaveOf = (rTop, eSlope, hb, relax = 0) => {
      const d = rTop - ra;
      const m0 = Math.max(0, Math.min(coneSlope * hb, d - CONCAVE_MARGIN * hb));
      const eTarget = eSlope != null ? eSlope * hb : END_SLOPE_BOOST * (2 * d - m0);
      // m0가 d−여유 로 잘리면 d < m0+여유 가 1ulp 로 참이 되어, 높은 마진 열을 통째로 버린다.
      if (d + 1e-6 < m0 + CONCAVE_MARGIN * hb) return null;
      const d0 = m0 / 4;
      const d1 = d0 * BEZIER_DIP;
      const rest = d - d0 - d1;
      if (rest + 1e-6 < 2 * d1) return null;
      let e = Math.max(CORNER_MIN_END_SLOPE * hb, Math.min(CORNER_END_SLOPE * hb, eTarget));
      const minE = (2 - 4 * relax) * rest;
      e = Math.max(minE, Math.min(4 * (rest - d1), e));
      const d3 = e / 4;
      const d2 = rest - d3;
      const c = [ra, ra + d0, ra + d0 + d1, ra + d0 + d1 + d2, rTop];
      return (t) => {
        const u = 1 - t;
        return (
          c[0] * u ** 4 + 4 * c[1] * u ** 3 * t + 6 * c[2] * u ** 2 * t ** 2 + 4 * c[3] * u * t ** 3 + c[4] * t ** 4
        );
      };
    };
    const bowlOf = (rTop, rTopBase, eSlope, hb, scaleOrig, relax = 0) => {
      if (!convexCuffDeform) {
        const fn = legacyConcaveOf(rTop, eSlope, hb, relax);
        if (!fn) {
          const dR = rTop - ra;
          const m0 = Math.max(0, Math.min(coneSlope * hb, dR - CONCAVE_MARGIN * hb));
          return { fn: concaveBridgeProfile(ra, m0, rTop, hb), endSlope: NaN };
        }
        return { fn, endSlope: NaN };
      }
      const dR = rTop - ra;
      // 반경 차가 작으면 출발 기울기를 줄여 범위를 벗어나지 않게 한다.
      const m0 = Math.max(0, Math.min(coneSlope * hb, dR - CONCAVE_MARGIN * hb));
      const eTarget = eSlope != null ? eSlope * hb : END_SLOPE_BOOST * (2 * dR - m0);
      const p = concaveHermiteProfile(ra, m0, rTop, eTarget, hb);
      if (!p) return { fn: concaveBridgeProfile(ra, m0, rTop, hb), endSlope: NaN };
      // 원뿔 끝(Z_a) 상방 CUFF_DEFORM_MIN_ABOVE_ZA_MM(0.02mm) 아래로는 70° 이하 볼록 변형을 적용하지 않고 11° 오목 진입을 유지한다(floorBase, 공구 반경 보정 뒤 withDeformFloor).
      const floorBase = legacyConcaveOf(rTopBase, eSlope, hb);
      const floorOn = Boolean(floorBase) && (p.convexDeformed || scaleOrig < 1 - 1e-3);
      return { fn: p.fn, endSlope: p.endSlope, floorBase, floorOn };
    };
    // Z_a + 0.02mm에서 두 곡선을 기울기만 맞춰 이으면 곡률이 튀어 원뿔 바로 위가 꺾인다. 기본 곡선에서 C2 가중치로 서서히 넘어간다.
    // 공구 반경 보정은 4차 베지어 제어점을 역산하므로, 섞은 곡선이 아니라 4차 곡선에 먼저 걸고 그 뒤에 섞는다.
    const withDeformFloor = (fn, baseFn, keep, hb) => {
      if (!baseFn || !(keep > 1e-3)) return fn;
      const tFloor = CUFF_DEFORM_MIN_ABOVE_ZA_MM / hb;
      const tEnd = Math.min(CUFF_DEFORM_RAMP_MAX_T, tFloor + CUFF_DEFORM_RAMP_MM / hb);
      if (!(tFloor > 0) || tEnd - tFloor < CUFF_DEFORM_RAMP_MIN_T) return fn;
      const span = tEnd - tFloor;
      return (t) => {
        const r = fn(t);
        if (t >= tEnd) return r;
        const u = t <= tFloor ? 0 : (t - tFloor) / span;
        const w = u * u * u * (10 + u * (6 * u - 15));
        return r + keep * (1 - w) * (baseFn(t) - r);
      };
    };
    const bowls = tops.map((t, j) =>
      bowlOf(
        r1s[j],
        belowR[j],
        belowSlopes ? belowSlopes[j] : null,
        hs[j],
        seamOrigScale ? seamOrigScale[j] : 1,
        0.1 * tailWeights[j],
      ),
    );
    // 바닥 보호가 열마다 켜지고 꺼지면 원뿔 상단 근처에 세로 단차가 생기므로 비중을 둘레로 고른다.
    const floorKeep = bowls.some((b) => b.floorOn)
      ? circularSmooth(
          bowls.map((b) => (b.floorOn ? 1 : 0)),
          TOP_SLOPE_SMOOTH_COLUMNS,
        ).map((w, j) => (bowls[j].floorBase ? w : 0))
      : null;
    const enforcedProfiles = enforceMinToolRadiusOnProfiles(
      smoothProfilesAcrossColumns(bowls.map((b) => b.fn)),
      hs,
      zA,
      false,
      tailWeights,
    );
    const profiles = floorKeep
      ? enforcedProfiles.map((fn, j) => withDeformFloor(fn, bowls[j].floorBase, floorKeep[j], hs[j]))
      : enforcedProfiles;
    let maxSlope = 0;
    let maxExcess = 0;
    let minWall = Infinity;
    const chAtZ = channelRadiusByZ(mesh, zA - 0.3, zTopMax + 0.3, ra);
    for (let j = 0; j < profiles.length; j += 1) {
      const h = hs[j];
      const rTopJ = smoothCreaseR ? smoothCreaseR[j] : r1s[j];
      const lo = Math.min(ra, tops[j].r, r1s[j], rTopJ) - MAX_OVERSHOOT_MM;
      const hi = Math.max(ra, tops[j].r, r1s[j], rTopJ) + MAX_OVERSHOOT_MM;
      // 마진 아래 원본 커프가 이미 70°보다 누운 열은, 곡선이 그 기울기로 마진에 붙어야 하므로 원본 기울기까지 허용한다.
      const slopeCap = Math.max(AUTO_MAX_SLOPE, belowSlopes ? belowSlopes[j] + AUTO_BELOW_SLOPE_TOL : 0);
      let prev = profiles[j](0);
      for (let i = 1; i <= 50; i += 1) {
        const r = profiles[j](i / 50);
        if (r < lo || r > hi) fail("manual-review", "이음 곡면이 커넥션·커프 범위를 벗어납니다.");
        const slope = Math.abs(r - prev) / (h / 50);
        maxSlope = Math.max(maxSlope, slope);
        maxExcess = Math.max(maxExcess, slope - slopeCap);
        // 벽 두께는 같은 높이의 채널 반경과 비교한다(채널이 위에서 벌어져도 아래 원뿔 벽은 영향 없음).
        minWall = Math.min(minWall, r - chAtZ(zA + (i / 50) * h));
        prev = r;
      }
    }
    if (maxExcess > 0) {
      fail("manual-review", "단차가 커서 이음 곡면이 너무 가파릅니다.", {
        maxAngleDeg: round3((Math.atan(maxSlope) * 180) / Math.PI),
      });
    }
    if (rCh > 0 && minWall < MIN_WALL_MM) {
      fail("manual-review", "이음부 벽 두께가 스크류 채널 대비 너무 얇아집니다.");
    }
    const out = replaceBand(mesh, {
      zA,
      ra,
      topZOf,
      radiusAt: (j, t) => profiles[j](t),
      rawCreaseR: crease && offsetMm === 0 ? rawCreaseR : null,
      rCut,
      origProbe: probe,
      crease: crease && offsetMm === 0 ? crease : null,
      seamOrigScale,
      seamBlendScale: finalSeamOrigScale,
      convexCuffDeform,
    });
      return { out, zTopMax, maxSlope };
    };
    // 메시 모서리를 선형으로 자르면 곡선 경계가 수 µm 어긋난다. 새 꼭짓점이 피니시라인과 최소 여유를 갖도록 확인하고, 모자라면 띠 위 끝을 더 내려 한 번 다시 만든다(2번 안에 안 되면 manual-review).
    // 마진 모서리를 찾으면 이음 위 끝을 그 모서리 꼭짓점에 그대로 붙인다(모서리를 자르지 않아 선이 하나만 남는다). 새 꼭짓점은 모서리 아래 첫 행부터다.
    let offsetMm = crease ? 0 : FINISH_KINK_OFFSET_MM;
    const minClearanceFor = (off) => (crease && off === 0 ? SEAM_TOP_MIN_DROP_MM / 2 : FINISH_MIN_CLEARANCE_MM);
    let built = attempt(offsetMm);
    let clearance = finishLineClearance(buffer, built.out.buffer, seamZ);
    for (let i = 0; i < 1 && clearance < minClearanceFor(offsetMm); i += 1) {
      offsetMm += FINISH_MIN_CLEARANCE_MM - Math.min(clearance, 0) + 0.005;
      built = attempt(offsetMm);
      clearance = finishLineClearance(buffer, built.out.buffer, seamZ);
    }
    if (clearance < minClearanceFor(offsetMm)) {
      fail("manual-review", "이음 곡면이 피니시라인과 너무 가까워 적용하지 않았습니다.", { clearanceMm: round3(clearance) });
    }
    const { out, zTopMax, maxSlope } = built;
    return {
      ok: true,
      status: "applied",
      reason: warning,
      buffer: out.buffer,
      detail: {
        matchedSpecKey: matchedKey,
        zA: round3(zA),
        zB: round3(zTopMax),
        followsFinishLine: true,
        seam: crease && offsetMm === 0 ? "crease" : "finish-line-offset",
        creaseOffsetMm: crease ? round3(crease.meanOffsetMm) : null,
        finishLineOffsetMm: round3(offsetMm),
        finishLineClearanceMm: round3(clearance),
        measuredTaperTopZ: round3(taper.measuredTopZ),
        originDiameter: round3(taper.originDiameter),
        maxAngleDeg: round3((Math.atan(maxSlope) * 180) / Math.PI),
        removedTriangles: out.removedTriangles,
        strippedFinTriangles: fins.stripped,
        patchTriangles: out.patchTriangles,
        patchRows: out.rows,
        patchColumns: out.columns,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// redesign(Re): 70°보다 누운(접시형) 커프 → 피니시라인-0.2mm ~ Z_a를 G2 곡선으로

/** 한 열의 옆모습 곡선 표본(차트·제안용). */
function sampleColumnCurve(probe, theta, zLo, zHi, bandLo, bandHi, profile) {
  const before = [];
  const after = [];
  for (let z = zLo; z <= zHi + 1e-9; z += CLEAN_STEP_MM) {
    const fn = probe.radiusFn(z);
    const r = fn ? fn(theta) : NaN;
    if (!Number.isFinite(r)) continue;
    before.push([round3(r), round3(z)]);
    const inBand = z > bandLo && z < bandHi;
    after.push([round3(inBand ? profile((z - bandLo) / (bandHi - bandLo)) : r), round3(z)]);
  }
  return { before, after };
}

/** Re 계획: 판정·곡선·안전검사까지. 메시는 아직 바꾸지 않는다. */
function planCuffRedesign(buffer, options) {
  const { mesh, probe, taper, zA, matchedKey, warning } = setup(buffer, options);
  const flZ = finishLineZByAngle(options.finishLine);
  if (!flZ) fail("manual-review", "피니시라인이 없어 재디자인 범위를 정할 수 없습니다.");
  const thetas = thetaColumns();
  // 실험용 완화: options.flProtectMm / minBandMm / skipFlatCheck. 기본값은 기존 제한 그대로다.
  const overshoot = Number.isFinite(options.maxOvershootMm) ? options.maxOvershootMm : MAX_OVERSHOOT_MM;
  const flProtect = Number.isFinite(options.flProtectMm) ? options.flProtectMm : FL_PROTECT_MM;
  const minBand = Number.isFinite(options.minBandMm) ? options.minBandMm : MIN_BAND_MM;
  const topZ = thetas.map((theta) => flZ(theta) - flProtect);
  if (Math.min(...topZ) - zA < minBand) {
    fail("manual-review", "피니시라인과 커넥션 사이가 너무 좁아 재디자인할 수 없습니다.");
  }
  const ra = taper.coneAt(zA);
  const flatSlope = options.flatAngleDeg ? Math.tan((options.flatAngleDeg * Math.PI) / 180) : FLAT_SLOPE;
  const flatDegLimit = (Math.atan(flatSlope) * 180) / Math.PI;

  // 현재 커프가 70°보다 누운 구간이 있는지(접시형) 본다
  let flatDeg = 0;
  let worstJ = 0;
  const zMaxAll = Math.max(...topZ);
  const fns = [];
  // 커넥션 상단 단차(수평 턱)는 auto 이음 대상이라 접시 판정에서 뺀다
  for (let z = zA + 0.1; z <= zMaxAll + 1e-9; z += CLEAN_STEP_MM) fns.push([z, probe.radiusFn(z)]);
  for (let j = 0; j < thetas.length; j += 4) {
    const col = fns.filter(([z, fn]) => fn && z <= topZ[j]).map(([z, fn]) => [z, fn(thetas[j])]);
    for (let i = 3; i < col.length; i += 1) {
      const slope = (col[i][1] - col[i - 3][1]) / (col[i][0] - col[i - 3][0]);
      const deg = (Math.atan(Math.abs(slope)) * 180) / Math.PI;
      if (deg > flatDeg) {
        flatDeg = deg;
        worstJ = j;
      }
    }
  }
  if (!options.skipFlatCheck && flatDegLimit >= flatDeg) {
    return {
      notFlat: true,
      reason: `납작한(${flatDegLimit.toFixed(0)}° 넘게 누운) 커프 구간이 없어 재디자인하지 않았습니다. (최대 ${flatDeg.toFixed(0)}°)`,
      flatDeg,
    };
  }

  const rawTops = sampleTopConditions(probe, thetas, topZ, 0.15);
  if (options.fillMissing) fillMissingTopConditions(rawTops, options.fillMissingMaxRatio ?? 0.25);
  if (rawTops.some((t) => !t)) fail("manual-review", "피니시라인 아래 곡면을 읽지 못했습니다.");
  const [topR, topSlope, topCurvature] = ["r", "slope", "curvature"].map(
    (k) => angularLowPass(rawTops.map((t) => t[k])) || rawTops.map((t) => t[k]),
  );
  const tops = rawTops.map((_, j) => ({ r: topR[j], slope: topSlope[j], curvature: topCurvature[j] }));
  const profiles = tops.map((t, j) => {
    const h = topZ[j] - zA;
    const gentle = Math.abs(t.slope) <= flatSlope;
    let slope = gentle ? t.slope : Math.sign(t.slope || 1) * flatSlope;
    // 실험용: 위 끝에서 안쪽으로 접히는 커프(slope<0)는 곡선이 부풀지 않게 수직(0)으로 붙인다.
    if (options.monotonicEnd && slope < 0) slope = 0;
    const curvature = gentle && !(options.monotonicEnd && t.slope < 0) ? clampCurvature(t.curvature) : 0;
    // 띠가 길면 위 끝 곡률 항(c·h²)이 곡선을 부풀린다. 범위를 벗어나면 곡률을 반씩 줄여 본다(0이면 G1).
    for (const scale of [1, 0.5, 0.25, 0]) {
      const fn = quinticHermite(ra, TAPER_SLOPE, 0, t.r, slope, curvature * scale, h);
      let worst = 0;
      let low = Infinity;
      let inRange = true;
      let prev = fn(0);
      for (let i = 1; i <= 80; i += 1) {
        const r = fn(i / 80);
        worst = Math.max(worst, Math.abs(r - prev) / (h / 80));
        low = Math.min(low, r);
        prev = r;
        if (r < Math.min(ra, t.r) - overshoot || r > Math.max(ra, t.r) + overshoot) {
          inRange = false;
          break;
        }
      }
      if (inRange) return { h, fn, worst, low };
    }
    return fail("manual-review", "재디자인 곡선이 커넥션·피니시라인 범위를 벗어납니다.");
  });
  const maxSlope = Math.max(...profiles.map((p) => p.worst));
  const minR = Math.min(...profiles.map((p) => p.low));
  const maxDeg = (Math.atan(maxSlope) * 180) / Math.PI;
  if (maxSlope > flatSlope + FLAT_SLOPE_TOL) {
    fail(
      "manual-review",
      `피니시라인~커넥션 높이가 부족해 ${flatDegLimit.toFixed(0)}° 이내로 만들 수 없습니다. (필요 최대 ${maxDeg.toFixed(0)}°)`,
      { maxAngleDeg: round3(maxDeg) },
    );
  }
  const rCh = channelRadius(mesh, zA - 0.3, zMaxAll, ra);
  if (rCh > 0 && minR - rCh < (Number.isFinite(options.minWallMm) ? options.minWallMm : MIN_WALL_MM)) {
    fail("manual-review", "재디자인 곡면 벽 두께가 스크류 채널 대비 너무 얇아집니다.");
  }
  const rCut = rCh > 0 ? (rCh + ra) / 2 : ra * 0.75;
  if (detachedInBand(mesh, -0.5, zMaxAll, rCut) || nonManifoldInBand(mesh, zA - 0.1, zMaxAll + 0.1)) {
    fail("manual-review", "커프에 겹친 보정 조각(예전 fill_steps 캡 등)이 있습니다.");
  }

  const theta = thetas[worstJ];
  const curve = {
    angleDeg: round3((theta * 180) / Math.PI),
    zA: round3(zA),
    zTop: round3(topZ[worstJ]),
    finishLineZ: round3(flZ(theta)),
    ...sampleColumnCurve(
      probe,
      theta,
      Math.max(probe.lo, zA - 0.4),
      Math.min(probe.hi, flZ(theta) + 0.6),
      zA,
      topZ[worstJ],
      profiles[worstJ].fn,
    ),
  };
  return {
    mesh,
    zA,
    ra,
    flZ,
    flProtect,
    topZ,
    profiles,
    rCut,
    curve,
    detail: {
      matchedSpecKey: matchedKey,
      zA: round3(zA),
      zB: round3(Math.min(...topZ)),
      measuredTaperTopZ: round3(taper.measuredTopZ),
      originDiameter: round3(taper.originDiameter),
      maxAngleDeg: round3(maxDeg),
      maxCuffAngleDegBefore: round3(flatDeg),
    },
    warning,
  };
}

const notFlatResult = (plan) => ({
  ok: false,
  status: "not-flat",
  reason: plan.reason,
  detail: { maxCuffAngleDeg: round3(plan.flatDeg) },
});

/** 의뢰자 제안용: 메시는 바꾸지 않고 바꿀 옆모습 곡선만 돌려준다. */
export function proposeCuffRedesign(buffer, options = {}) {
  return wrapResult(() => {
    const plan = planCuffRedesign(buffer, options);
    if (plan.notFlat) return notFlatResult(plan);
    return { ok: true, status: "proposed", reason: plan.warning, curve: plan.curve, detail: plan.detail };
  });
}

export function redesignCuffBowl(buffer, options = {}) {
  return wrapResult(() => {
    const plan = planCuffRedesign(buffer, options);
    if (plan.notFlat) return notFlatResult(plan);
    const out = replaceBand(plan.mesh, {
      zA: plan.zA,
      ra: plan.ra,
      topZOf: (theta) => plan.flZ(theta) - plan.flProtect,
      radiusAt: (j, t) => plan.profiles[j].fn(t),
      rCut: plan.rCut,
    });
    return {
      ok: true,
      status: "applied",
      reason: plan.warning,
      buffer: out.buffer,
      curve: plan.curve,
      detail: {
        ...plan.detail,
        removedTriangles: out.removedTriangles,
        patchTriangles: out.patchTriangles,
        patchRows: out.rows,
        patchColumns: out.columns,
      },
    };
  });
}

/**
 * 스펙 등록용: filled STL의 원점 직경과 11° 원뿔이 끝나는 높이를 잰다.
 * taperTopZ가 CUFF_CONNECTION_SPECS.taperHeightMm 후보다.
 */
export function measureCuffConnection(buffer) {
  const { probe } = prepare(buffer);
  const taper = measureConnectionTaper(probe);
  if (!taper) return null;
  const top = taper.measuredTopZ;
  const above = median(Array.from(probe.bins(top + 0.03, MEASURE_BINS)));
  return {
    originDiameter: round3(taper.originDiameter),
    taperTopZ: round3(top),
    taperTopDiameter: round3(2 * taper.coneAt(top)),
    stepAboveTopMm: round3(above - taper.coneAt(top + 0.03)),
  };
}

export {
  RadialProbe as _RadialProbe,
  prepare as _prepare,
  finishLineZByAngle as _finishLineZByAngle,
  findFinishCrease as _findFinishCrease,
  smoothProfilesAcrossColumns as _smoothProfilesAcrossColumns,
  prepare as prepareCuffMesh,
  splitByLevel,
  chainBoundaryLoops,
  angularRow,
  zipperRows,
  finishLineZByAngle,
  findFinishCrease,
};
