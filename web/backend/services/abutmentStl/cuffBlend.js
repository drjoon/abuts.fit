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
const STRIP_COLUMNS = 720;
const ROW_PITCH_MM = 0.025;
/** 이음 위 끝에서 이만큼 아래까지는 새 곡선을 원본 곡면에 서서히 섞는다(위 끝 접선·반경이 원본과 같아져 선이 둘로 보이지 않는다). */
const SEAM_BLEND_DEPTH_MM = 0.3;
/** 위 끝에서 아래로 내려가는 깊이(mm) 순서로 촘촘히 두는 행. */
const SEAM_ROW_DEPTHS_MM = [0.06, 0.085, 0.11, 0.14, 0.17, 0.2, 0.235, 0.27, 0.3];

const TAPER_FIT_TOL_MM = 0.008;
const TAPER_ROUND_TOL_MM = 0.012;
const TAPER_MATCH_BELOW_MM = 0.05;
const TAPER_MATCH_ABOVE_MM = 0.08;
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
const AUTO_MAX_SLOPE = Math.tan((75 * Math.PI) / 180);
const MAX_OVERSHOOT_MM = 0.05;
/** 이음 곡선 최대 |r''|(1/mm). 옆모습 곡률 반경 약 0.25mm 이상. */
const MAX_BLEND_CURVATURE = 4;
const MAX_TOP_CURVATURE = 20;
const clampCurvature = (c) => Math.max(-MAX_TOP_CURVATURE, Math.min(MAX_TOP_CURVATURE, c));
const MIN_WALL_MM = 0.3;
/** 이보다 축 둘레로 넓게 걸친 삼각형은 곡면이 아니라 겹친 캡 조각이다. */
const FIN_SPAN_RAD = (30 * Math.PI) / 180;
const BOTTOM_ON_CONE_TOL_MM = 0.01;

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
  return { r0, slope: taperSlope, originDiameter: 2 * r0, coneAt, measuredTopZ: top };
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
/** 위쪽 기울기 목표(약 60°). */
const CORNER_END_SLOPE = Math.tan((70 * Math.PI) / 180);
/** 위쪽 최소 기울기(약 30°): 접시처럼 평평해지지 않게. */
const CORNER_MIN_END_SLOPE = Math.tan((35 * Math.PI) / 180);
/** 모서리(퍼지기 시작) 선호 위치. 낮을수록 원본처럼 일찍 퍼진다. */
const CORNER_PREF_T = 0.3;
/** 열 평균 반폭(열 수, 720열 기준 약 ±12°). */
const SMOOTH_HALF_COLUMNS = 24;
/** 긴 띠(mm) 기준과 그때의 시작 기울기(약 8°). */
const SMOOTH_MAX_SHIFT_MM = 0.04;
/** 위 끝 접선을 잴 때 쓰는 위 끝 아래 원본 구간(mm)과, 모서리 바로 아래 건너뛸 틈(mm). */
const TOP_BELOW_WINDOW_MM = 0.1;
const TOP_BELOW_GAP_MM = 0.005;
/** 위 끝 기울기 열 평균 반폭(열). */
const TOP_SLOPE_SMOOTH_COLUMNS = 24;
/** 위 끝 반경을 저주파(조화 K차 이하)만 남겨 매끈하게 한다. */
const TOP_RADIUS_HARMONICS = 6;
/** 끝 기울기를 2차 호(2d − m0)보다 이만큼 더 세워 늦게 벌어지게(더 오목하게) 한다. */
const END_SLOPE_BOOST = 1.5;
/** 둘째 제어점 간격 / 첫째 간격(작을수록 출발 후 더 빨리 수직에 가까워진다). */
const BEZIER_DIP = 0.5;
const LONG_BAND_MM = 2;
/** 띠 면 평균: 반폭(열)과 위쪽 보존 지수(t^p). */
const BAND_SMOOTH_HALF_COLUMNS = 60;
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
export function concaveHermiteProfile(ra, m0, r1, eTarget, h) {
  const d = r1 - ra;
  if (d < m0 + CONCAVE_MARGIN * h) return null;
  // 제어점 5개의 4차 베지어. 커넥션 기울기(m0, 11°)로 출발해 기울기를 점차 줄여(10°, 9°…) 거의 수직으로 올리다가,
  // 위에서 벌어져 끝 기울기 e(약 35~70°)가 된다. Δ0 = m0/4, Δ1 = Δ0·BEZIER_DIP, Δ3 = e/4, Δ1 ≤ Δ2 ≤ Δ3.
  const d0 = m0 / 4;
  const d1 = d0 * BEZIER_DIP;
  const rest = d - d0 - d1;
  if (rest < 2 * d1) return null;
  let e = Math.max(CORNER_MIN_END_SLOPE * h, Math.min(CORNER_END_SLOPE * h, eTarget));
  e = Math.max(2 * rest, Math.min(4 * (rest - d1), e));
  const d3 = e / 4;
  const d2 = rest - d3;
  const c = [ra, ra + d0, ra + d0 + d1, ra + d0 + d1 + d2, r1];
  return {
    fn: (t) => {
      const u = 1 - t;
      return (
        c[0] * u ** 4 + 4 * c[1] * u ** 3 * t + 6 * c[2] * u ** 2 * t ** 2 + 4 * c[3] * u * t ** 3 + c[4] * t ** 4
      );
    },
  };
}

/** 원형 신호의 저주파 성분(0..K차 조화)만 남긴다. */
function fourierLowPass(values, harmonics) {
  const n = values.length;
  const out = new Array(n).fill(0);
  for (let k = 0; k <= harmonics; k += 1) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * k * j) / n;
      re += values[j] * Math.cos(a);
      im += values[j] * Math.sin(a);
    }
    const w = k === 0 ? 1 / n : 2 / n;
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * k * j) / n;
      out[j] += w * (re * Math.cos(a) + im * Math.sin(a));
    }
  }
  return out;
}

/** 각도(원형) 이동 평균. */
function circularSmooth(values, half) {
  const n = values.length;
  return values.map((_, j) => {
    let sum = 0;
    for (let k = -half; k <= half; k += 1) sum += values[(j + k + n * 4) % n];
    return sum / (2 * half + 1);
  });
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
    const nextA = i < A ? angA(i + 1) : Infinity;
    const nextB = j < B ? angB(j + 1) : Infinity;
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
function bandSmoothKeep(t, height) {
  const s = Math.min(1, Math.max(0, ((1 - t) * height) / BAND_SMOOTH_FADE_MM));
  return 1 - (1 - t ** BAND_SMOOTH_TOP_POWER) * s * s * (3 - 2 * s);
}

/**
 * Z_a 평면 ~ 위쪽 레벨면(topLevel) 사이 외곽 면을 지우고 profiles로 만든 띠를 붙인다.
 * @param {(theta: number, t: number) => number} radiusAt t∈[0,1] (0=Z_a, 1=위)
 */
function replaceBand(mesh, { zA, ra, topZOf, radiusAt, rCut, origProbe, crease }) {
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
  const bottom = angularRow(loops[0], verts);
  const top = angularRow(loops[1], verts);
  if (!bottom || !top) {
    fail("manual-review", "이음부 경계가 축 둘레로 한 바퀴 돌지 않습니다(언더컷).");
  }
  const offCone = Math.max(...bottom.map(({ v }) => Math.abs(Math.hypot(verts[v * 3], verts[v * 3 + 1]) - ra)));
  if (offCone > BOTTOM_ON_CONE_TOL_MM) {
    fail("manual-review", "커넥션 상단 경계가 11° 원뿔 위에 있지 않습니다.", { offConeMm: round3(offCone) });
  }

  const heights = [];
  for (let j = 0; j < STRIP_COLUMNS; j += 1) {
    heights.push(topZOf((j / STRIP_COLUMNS) * TWO_PI) - zA);
  }
  const rows = Math.max(6, Math.min(80, Math.ceil(Math.max(...heights) / ROW_PITCH_MM)));
  // 면이 쭈글하지 않도록, 아래쪽 행일수록 각도 방향으로 반경·높이를 평균한다.
  // 위쪽 행(피니시라인·원본 곡면과 만나는 곳)은 평균하지 않고 그대로 둔다.
  const smoothHeights = circularSmooth(heights, BAND_SMOOTH_HALF_COLUMNS);
  const grid = [];
  const minHeight = Math.min(...heights);
  const seamDepths = origProbe ? SEAM_ROW_DEPTHS_MM : [];
  const seamStart = seamDepths.length ? SEAM_ROW_DEPTHS_MM[SEAM_ROW_DEPTHS_MM.length - 1] + ROW_PITCH_MM : 0;
  for (let r = 1; r < rows; r += 1) {
    const t = r / rows;
    if (seamDepths.length && (1 - t) * minHeight < seamStart) break;
    const raw = Array.from({ length: STRIP_COLUMNS }, (_, j) => radiusAt(j, t));
    const avg = circularSmooth(raw, BAND_SMOOTH_HALF_COLUMNS);
    const row = [];
    for (let j = 0; j < STRIP_COLUMNS; j += 1) {
      const theta = (j / STRIP_COLUMNS) * TWO_PI;
      const keep = bandSmoothKeep(t, heights[j]);
      const rad = raw[j] * keep + avg[j] * (1 - keep);
      const hMix = heights[j] * keep + smoothHeights[j] * (1 - keep);
      const idx = verts.length / 3;
      verts.push(rad * Math.cos(theta), rad * Math.sin(theta), zA + t * hMix);
      row.push({ v: idx, a: theta });
    }
    grid.push(row);
  }
  // 위 끝 근처: 새 곡선을 원본 곡면(위 끝 반경·기울기)에 섞어 이음선을 없앤다. 위 끝 행은 원본 꼭짓점 그대로다.
  for (let k = seamDepths.length - 1; k >= 0; k -= 1) {
    const depth = seamDepths[k];
    const s = 1 - depth / SEAM_BLEND_DEPTH_MM;
    const w = s <= 0 ? 0 : s * s * (3 - 2 * s);
    const ts = heights.map((h) => 1 - depth / h);
    const raw = ts.map((t, j) => radiusAt(j, t));
    const avg = circularSmooth(raw, BAND_SMOOTH_HALF_COLUMNS);
    const row = [];
    for (let j = 0; j < STRIP_COLUMNS; j += 1) {
      const theta = (j / STRIP_COLUMNS) * TWO_PI;
      // 아래 일반 행과 같은 각도 평균을 쓴 곡선 위치에서 출발해, 위로 갈수록 원본 곡면으로 옮겨 간다.
      const keep = bandSmoothKeep(ts[j], heights[j]);
      const zCurve = zA + ts[j] * (heights[j] * keep + smoothHeights[j] * (1 - keep));
      const z = zCurve * (1 - w) + (zA + heights[j] - depth) * w;
      const ro = w > 0 ? origProbe.rayRadius(theta, z) : NaN;
      const rp = raw[j] * keep + avg[j] * (1 - keep);
      const rad = Number.isFinite(ro) ? rp * (1 - w) + ro * w : rp;
      const idx = verts.length / 3;
      verts.push(rad * Math.cos(theta), rad * Math.sin(theta), z);
      row.push({ v: idx, a: theta });
    }
    grid.push(row);
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
    outFaces.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
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
    rows,
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
 * @returns {{ loop: number[], edges: Set<string>, zOf: (theta: number) => number, meanOffsetMm: number } | null}
 */
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
  const zOf = zByAngle(best.loop.map((v) => ({ a: angleOf(verts[v * 3], verts[v * 3 + 1]), z: verts[v * 3 + 2] })));
  return { loop: best.loop, edges, zOf, meanOffsetMm: best.meanOffsetMm };
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
  if (!taper) fail("manual-review", "원점 아래 11° 커넥션 테이퍼를 찾지 못했습니다.");
  const top = resolveConnectionTop(taper, spec, specKey);
  return { mesh, probe, triCount, taper, ...top };
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
    const below = sampleBelowConditions(probe, thetas, topZ, TOP_BELOW_WINDOW_MM);
    const belowSlopes = below.every(Boolean) ? circularSmooth(below.map((b) => b.slope), TOP_SLOPE_SMOOTH_COLUMNS) : null;
    // 볼록(부푼) 구간은 뼈에 걸리므로 오목 프로파일로 바로잡는다.
    // 커넥션 쪽(피니시라인에서 먼 쪽)은 원뿔 접선에서 오목하게 벌어지고, 위 끝은 커프 접선에 맞춘다.
    // 단차 직경은 따르지 않는다: 원뿔에서 커프까지 항상 살짝 오목하게 부드럽게 올린다.
    // 원뿔 접선에서 시작해 Z_b에서 원본 곡면 접선에 이어지는 G1 오목 곡선. 불가능한 열만 단순 오목 곡선.
    // 열마다 들쭉날쭉하면 면에 주름이 생기므로, 위 끝 반경은 저주파 성분만 남겨 매끈하게 한다.
    // 출발 기울기는 커넥션 원뿔 기울기(11° 등)를 그대로 이어 받고, 곡선이 기울기를 줄여 가며 오목하게 오른다.
    // 평균값이 원본 반경에서 ±SMOOTH_MAX_SHIFT_MM 넘게 벗어나면 위 끝에 단차가 생기므로 그 안으로 제한한다.
    const r1avg = fourierLowPass(tops.map((t) => t.r), TOP_RADIUS_HARMONICS);
    const r1s = belowSlopes
      ? below.map((b) => b.r)
      : tops.map((t, j) => t.r + Math.max(-SMOOTH_MAX_SHIFT_MM, Math.min(SMOOTH_MAX_SHIFT_MM, r1avg[j] - t.r)));
    const coneSlope = taper.slope || TAPER_SLOPE;
    const profiles = tops.map((t, j) => {
      const h = hs[j];
      const dR = r1s[j] - ra;
      // 반경 차가 작으면 출발 기울기를 줄여 범위를 벗어나지 않게 한다.
      const m0 = Math.max(0, Math.min(coneSlope * h, dR - CONCAVE_MARGIN * h));
      const eTarget = belowSlopes ? belowSlopes[j] * h : END_SLOPE_BOOST * (2 * dR - m0);
      const p = concaveHermiteProfile(ra, m0, r1s[j], eTarget, h);
      return p ? p.fn : concaveBridgeProfile(ra, m0, r1s[j], h);
    });
    let maxSlope = 0;
    let minWall = Infinity;
    const chAtZ = channelRadiusByZ(mesh, zA - 0.3, zTopMax + 0.3, ra);
    for (let j = 0; j < profiles.length; j += 1) {
      const h = hs[j];
      const lo = Math.min(ra, tops[j].r) - MAX_OVERSHOOT_MM;
      const hi = Math.max(ra, tops[j].r) + MAX_OVERSHOOT_MM;
      let prev = profiles[j](0);
      for (let i = 1; i <= 50; i += 1) {
        const r = profiles[j](i / 50);
        if (r < lo || r > hi) fail("manual-review", "이음 곡면이 커넥션·커프 범위를 벗어납니다.");
        maxSlope = Math.max(maxSlope, Math.abs(r - prev) / (h / 50));
        // 벽 두께는 같은 높이의 채널 반경과 비교한다(채널이 위에서 벌어져도 아래 원뿔 벽은 영향 없음).
        minWall = Math.min(minWall, r - chAtZ(zA + (i / 50) * h));
        prev = r;
      }
    }
    if (maxSlope > AUTO_MAX_SLOPE) {
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
      rCut,
      origProbe: probe,
      crease: crease && offsetMm === 0 ? crease : null,
    });
      return { out, zTopMax, maxSlope };
    };
    // 메시 모서리를 선형으로 자르면 곡선 경계가 수 µm 어긋난다. 새 꼭짓점이 피니시라인과 최소 여유를 갖도록 확인하고, 모자라면 띠 위 끝을 더 내려 한 번 다시 만든다(2번 안에 안 되면 manual-review).
    // 마진 모서리를 찾으면 이음 위 끝을 그 모서리 꼭짓점에 그대로 붙인다(모서리를 자르지 않아 선이 하나만 남는다). 새 꼭짓점은 모서리 아래 첫 행부터다.
    let offsetMm = crease ? 0 : FINISH_KINK_OFFSET_MM;
    const minClearanceFor = (off) => (crease && off === 0 ? SEAM_ROW_DEPTHS_MM[0] / 2 : FINISH_MIN_CLEARANCE_MM);
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
  const topZ = thetas.map((theta) => flZ(theta) - FL_PROTECT_MM);
  if (Math.min(...topZ) - zA < MIN_BAND_MM) {
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
  if (flatDegLimit >= flatDeg) {
    return {
      notFlat: true,
      reason: `납작한(${flatDegLimit.toFixed(0)}° 넘게 누운) 커프 구간이 없어 재디자인하지 않았습니다. (최대 ${flatDeg.toFixed(0)}°)`,
      flatDeg,
    };
  }

  const tops = sampleTopConditions(probe, thetas, topZ, 0.15);
  if (tops.some((t) => !t)) fail("manual-review", "피니시라인 아래 곡면을 읽지 못했습니다.");
  const profiles = tops.map((t, j) => {
    const h = topZ[j] - zA;
    const gentle = Math.abs(t.slope) <= flatSlope;
    const slope = gentle ? t.slope : Math.sign(t.slope || 1) * flatSlope;
    const curvature = gentle ? clampCurvature(t.curvature) : 0;
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
        if (r < Math.min(ra, t.r) - MAX_OVERSHOOT_MM || r > Math.max(ra, t.r) + MAX_OVERSHOOT_MM) {
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
  if (rCh > 0 && minR - rCh < MIN_WALL_MM) {
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
      topZOf: (theta) => plan.flZ(theta) - FL_PROTECT_MM,
      radiusAt: (j, t) => plan.profiles[j].fn(t),
      rCut: plan.rCut,
    });
    return {
      ok: true,
      status: "applied",
      reason: plan.warning,
      buffer: out.buffer,
      curve: plan.curve,
      detail: { ...plan.detail, removedTriangles: out.removedTriangles, patchTriangles: out.patchTriangles },
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
};
