// related files:
// - web/backend/services/abutmentStl/finishline.js (단면 평면·finish line 샘플)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
//
// 마진 코너(어깨↔벽)에서 φ1.2 볼 엔드밀 미삭제 구간을 finish line 따라 검사하고,
// 피니시라인 바로 위 마진↔축면 경계의 fillet R을 재고, R<공구R이면 공구 R 필렛 보정면을 만든다.
// 보정 솔리드는 원본과 별개로 메타데이터에 담긴다. filled STL·CAM은 원본 그대로 두고,
// 뷰어에서 토글을 켰을 때만 원본 위에 빨갛게 덧입혀 보여준다.
import { cross, meshPlaneSection, normalize } from "./meshCore.js";

export const TIGHT_CORNER_VERSION = 6;
export const FINISH_BALL_DIAMETER_MM = 1.2;
export const FINISH_BALL_RADIUS_MM = FINISH_BALL_DIAMETER_MM / 2;

const DIST_TOL = 1e-8;
const FL_SAMPLE_MAX = 80;
const FL_SAMPLE_MIN = 12;
const PROFILE_W_BIN_MM = 0.06;
const PROFILE_U_MIN_MM = 0.35;
const WALL_MIN_SPAN_MM = 0.35;
const SHOULDER_MIN_SPAN_MM = 0.35;
/** 피니시라인 z와 마진 꼭짓점 z가 어긋날 수 있어 위쪽으로 넉넉히 본다. */
const CORNER_W_SEARCH_ABOVE_MM = 2.8;
const CORNER_W_SEARCH_BELOW_MM = 0.35;
/** 이 이상이면 φ1.2 볼이 설계 코너를 깎지 못해 CAM 오버컷이 예상된다. */
const GOUGE_TIGHT_THRESHOLD_MM = 0.018;
/** 금속 쪽 내각(라디안). π에 가까울수록 둥글고, 작을수록 각짐. */
const METAL_ANGLE_TIGHT_RAD = (138 * Math.PI) / 180;

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeAxis(raw) {
  if (raw && typeof raw === "object") {
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    if ([x, y, z].every((v) => Number.isFinite(v))) {
      const n = normalize([x, y, z]);
      if (Math.hypot(...n) > 0.5) return n;
    }
  }
  return [0, 0, 1];
}

function radialFromFinishPoint(fl, axis) {
  let r = [fl[0], fl[1], 0];
  if (Math.hypot(r[0], r[1]) < 1e-6) r = [1, 0, 0];
  r = normalize(r);
  const along = dot3(r, axis);
  r = normalize(sub3(r, scale3(axis, along)));
  if (Math.hypot(...r) < 0.5) {
    const helper = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    r = normalize(cross(axis, helper));
  }
  return r;
}

function sectionNormal(radial, axis) {
  const n = cross(radial, axis);
  if (Math.hypot(...n) < 1e-12) return null;
  return normalize(n);
}

function radialDistanceFromAxis(p, axis) {
  const along = dot3(p, axis);
  const px = p[0] - axis[0] * along;
  const py = p[1] - axis[1] * along;
  const pz = p[2] - axis[2] * along;
  return Math.hypot(px, py, pz);
}

function toPlaneCoords(p, radial, axis) {
  return { u: radialDistanceFromAxis(p, axis), w: dot3(p, axis) };
}

function fromPlaneCoords(u, w, radial, axis) {
  return add3(scale3(radial, u), scale3(axis, w));
}

function resampleFinishLine(points, maxCount) {
  const valid = points
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));
  if (valid.length <= maxCount) return valid;
  const out = [];
  const n = valid.length;
  for (let i = 0; i < maxCount; i += 1) {
    const t = (i / maxCount) * n;
    const i0 = Math.floor(t) % n;
    const i1 = (i0 + 1) % n;
    const f = t - Math.floor(t);
    const a = valid[i0];
    const b = valid[i1];
    out.push([
      a[0] + f * (b[0] - a[0]),
      a[1] + f * (b[1] - a[1]),
      a[2] + f * (b[2] - a[2]),
    ]);
  }
  return out;
}

function finishLineRadius(fl, axis) {
  return radialDistanceFromAxis(fl, axis);
}

function pickSectionLoop(loops, fl, radial, axis) {
  const target = toPlaneCoords(fl, radial, axis);
  const uTarget = Math.max(finishLineRadius(fl, axis), target.u, PROFILE_U_MIN_MM);
  let best = null;
  let bestScore = Infinity;
  for (const loop of loops) {
    if (!loop || loop.length < 4) continue;
    let minD = Infinity;
    let bandMaxU = 0;
    for (const p of loop) {
      const { u, w } = toPlaneCoords(p, radial, axis);
      if (Math.abs(w - target.w) > 3.5) continue;
      bandMaxU = Math.max(bandMaxU, u);
      const d = Math.hypot(u - uTarget, (w - target.w) * 1.4);
      if (d < minD) minD = d;
    }
    if (minD === Infinity) continue;
    const score = minD - bandMaxU * 0.04;
    if (score < bestScore) {
      bestScore = score;
      best = loop;
    }
  }
  return bestScore < 2.8 ? best : null;
}

function buildOuterProfile(loop, radial, axis, wCenter, wHalfSpan, uTarget) {
  const wMin = wCenter - wHalfSpan;
  const wMax = wCenter + wHalfSpan;
  const uMin = Math.max(PROFILE_U_MIN_MM, uTarget * 0.55);
  const bins = new Map();
  for (const p of loop) {
    const { u, w } = toPlaneCoords(p, radial, axis);
    if (u < uMin || w < wMin || w > wMax) continue;
    const key = Math.round(w / PROFILE_W_BIN_MM);
    const prev = bins.get(key);
    if (!prev || u > prev.u) bins.set(key, { u, w, p: p.slice() });
  }
  const profile = [...bins.values()].sort((a, b) => a.w - b.w);
  if (profile.length < 3) return null;
  return profile;
}

function fitLine(points) {
  if (!points || points.length < 2) return null;
  let su = 0;
  let sw = 0;
  let suu = 0;
  let sww = 0;
  let suw = 0;
  const n = points.length;
  for (const { u, w } of points) {
    su += u;
    sw += w;
    suu += u * u;
    sww += w * w;
    suw += u * w;
  }
  const denom = n * suu - su * su;
  let du = 0;
  let dw = 1;
  if (Math.abs(denom) > 1e-10) {
    const slope = (n * suw - su * sw) / denom;
    du = 1;
    dw = slope;
  }
  const len = Math.hypot(du, dw);
  if (len < DIST_TOL) return null;
  du /= len;
  dw /= len;
  const cu = su / n;
  const cw = sw / n;
  return { p: { u: cu, w: cw }, d: { u: du, w: dw } };
}

function inferVirtualCorner(profile, wFl, uTarget) {
  const sorted = profile.slice().sort((a, b) => a.w - b.w);
  const atFl = sorted.find(
    (p) => Math.abs(p.w - wFl) < 0.35 && Math.abs(p.u - uTarget) < 0.2,
  );
  if (!atFl) return null;
  const wall = sorted.find(
    (p) => p.w > wFl + 0.85 && Math.abs(p.u - uTarget) < 0.15,
  );
  if (!wall) return null;
  const shoulderHint = sorted.find((p) => p.w < wFl + 0.45 && p.u < uTarget - 0.08);
  if (!shoulderHint) return null;
  const wCorner = Math.min(wFl + 0.32, wall.w - 0.2);
  return {
    u: uTarget,
    w: wCorner,
    p: null,
  };
}

function findCornerIndex(profile, wFl) {
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 2; i < profile.length - 2; i += 1) {
    const w = profile[i].w;
    if (w < wFl - CORNER_W_SEARCH_BELOW_MM || w > wFl + 3.2) continue;
    const a = profile[i - 1];
    const b = profile[i];
    const c = profile[i + 1];
    const v1u = b.u - a.u;
    const v1w = b.w - a.w;
    const v2u = c.u - b.u;
    const v2w = c.w - b.w;
    const l1 = Math.hypot(v1u, v1w);
    const l2 = Math.hypot(v2u, v2w);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const cos = clamp((v1u * v2u + v1w * v2w) / (l1 * l2), -1, 1);
    const turn = Math.acos(cos);
    const distPenalty = Math.abs(w - wFl) * 0.08;
    const score = Math.PI - turn - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function metalInteriorAngleRad(wallLine, shoulderLine) {
  const dWall = { u: wallLine.d.u, w: wallLine.d.w };
  const dShoulder = { u: -shoulderLine.d.u, w: -shoulderLine.d.w };
  const len = Math.hypot(dWall.u, dWall.w) * Math.hypot(dShoulder.u, dShoulder.w);
  if (len < DIST_TOL) return Math.PI;
  const cos = clamp((dWall.u * dShoulder.u + dWall.w * dShoulder.w) / len, -1, 1);
  return Math.acos(cos);
}

export function gougeDepthForCorner(metalAngleRad, toolR) {
  const half = metalAngleRad / 2;
  if (!(half > 1e-6) || half >= Math.PI / 2 - 1e-6) return 0;
  const depth = toolR * (1 / Math.sin(half) - 1);
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

const RELIEF_ARC_STEPS = 10;
const RELIEF_LEAD_MM = 0.4;
const CORNER_ABOVE_FL_MIN_MM = 0.05;
const CORNER_MIN_TURN_RAD = (25 * Math.PI) / 180;
const ABOVE_FL_SECTION_MAX_MM = 1.6;
const RELIEF_SMOOTH_HALF_WINDOW = 3;

/**
 * 오목 코너(공기 쪽 쐐기)를 φ볼 반경 필렛으로 메운 단면. 항상 같은 점 수(어깨 리드인 → 호 → 벽 리드아웃).
 * rayLedge/rayWall: 코너에서 각 면을 따라 뻗는 단위벡터. 호 중심은 두 광선 사이(공기 쪽)에 있다.
 */
export function filletConcaveCorner2d(corner, rayLedge, rayWall, toolR) {
  const cosExt = clamp(rayWall.u * rayLedge.u + rayWall.w * rayLedge.w, -1, 1);
  const extAngle = Math.acos(cosExt);
  if (!(extAngle > 0.04) || extAngle >= Math.PI - 0.04) return null;
  const trim = toolR / Math.tan(extAngle / 2);
  if (!(trim > 0.02) || trim > 4) return null;
  const at = (v, d) => ({ u: corner.u + v.u * d, w: corner.w + v.w * d });
  const tWall = at(rayWall, trim);
  const tLedge = at(rayLedge, trim);
  let bisU = rayWall.u + rayLedge.u;
  let bisW = rayWall.w + rayLedge.w;
  const bl = Math.hypot(bisU, bisW);
  if (bl < DIST_TOL) return null;
  bisU /= bl;
  bisW /= bl;
  const centerDist = toolR / Math.sin(extAngle / 2);
  const cx = corner.u + bisU * centerDist;
  const cw = corner.w + bisW * centerDist;
  const a1 = Math.atan2(tLedge.w - cw, tLedge.u - cx);
  const a2 = Math.atan2(tWall.w - cw, tWall.u - cx);
  let da = a2 - a1;
  while (da <= -Math.PI) da += Math.PI * 2;
  while (da > Math.PI) da -= Math.PI * 2;
  const pts = [at(rayLedge, trim + RELIEF_LEAD_MM)];
  for (let i = 0; i <= RELIEF_ARC_STEPS; i += 1) {
    const ang = a1 + (da * i) / RELIEF_ARC_STEPS;
    pts.push({ u: cx + toolR * Math.cos(ang), w: cw + toolR * Math.sin(ang) });
  }
  pts.push(at(rayWall, trim + RELIEF_LEAD_MM));
  return pts.map((p) => [round3(p.u), round3(p.w)]);
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** 연속한 샘플 인덱스 묶음(원형 래핑 포함). */
function groupConsecutiveRows(rows, total) {
  const sorted = rows.slice().sort((x, y) => x.sampleIndex - y.sampleIndex);
  const runs = [];
  for (const row of sorted) {
    const last = runs[runs.length - 1];
    if (last && row.sampleIndex - last[last.length - 1].sampleIndex === 1) last.push(row);
    else runs.push([row]);
  }
  if (runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0].sampleIndex === 0 && last[last.length - 1].sampleIndex === total - 1) {
      runs[0] = last.concat(first);
      runs.pop();
    }
  }
  return runs;
}

function smoothRunProfiles(run) {
  const n = run.length;
  const cols = run[0].reliefProfile.length;
  return run.map((_, i) => {
    const lo = Math.max(0, i - RELIEF_SMOOTH_HALF_WINDOW);
    const hi = Math.min(n - 1, i + RELIEF_SMOOTH_HALF_WINDOW);
    const out = [];
    for (let c = 0; c < cols; c += 1) {
      let su = 0;
      let sw = 0;
      for (let k = lo; k <= hi; k += 1) {
        su += run[k].reliefProfile[c][0];
        sw += run[k].reliefProfile[c][1];
      }
      const cnt = hi - lo + 1;
      out.push([su / cnt, sw / cnt]);
    }
    return out;
  });
}

/** 연속 샘플 묶음 + 묶음 안에서 평활한 보정 단면들. 프리뷰·솔리드·밴드가 같은 면을 쓴다. */
function reliefRuns(tightRows, total) {
  const rows = (Array.isArray(tightRows) ? tightRows : []).filter(
    (r) => Array.isArray(r?.reliefProfile) && r.reliefProfile.length >= 4 && Number.isInteger(r.sampleIndex),
  );
  if (!rows.length || !total) return [];
  const runs = [];
  for (const run of groupConsecutiveRows(rows, total)) {
    if (run.length < 2) continue;
    runs.push({ run, smooth: smoothRunProfiles(run) });
  }
  return runs;
}

/** 프리뷰용 필렛 보정면 연속 띠. 보정 솔리드의 바깥면과 같은 면이다. */
export function buildTightCornerReliefOverlay(tightRows, axis, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const total = Number(options.sampleTotal) || 0;
  const rows = (Array.isArray(tightRows) ? tightRows : []).filter(
    (r) => Array.isArray(r?.reliefProfile) && r.reliefProfile.length >= 4 && Number.isInteger(r.sampleIndex),
  );
  if (!rows.length || !total) return null;
  const positions = [];
  const indices = [];
  for (const run of groupConsecutiveRows(rows, total)) {
    if (run.length < 2) continue;
    const smooth = smoothRunProfiles(run);
    const cols = smooth[0].length;
    const base = positions.length / 3;
    run.forEach((row, ri) => {
      const radial = radialFromFinishPoint(row.finishLinePoint, axis);
      for (const [u, w] of smooth[ri]) {
        const p = fromPlaneCoords(u, w, radial, axis);
        positions.push(round3(p[0]), round3(p[1]), round3(p[2]));
      }
    });
    for (let ri = 0; ri < run.length - 1; ri += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const i0 = base + ri * cols + c;
        const i1 = i0 + 1;
        const i2 = base + (ri + 1) * cols + c;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }
  if (positions.length < 9 || indices.length < 3) return null;
  return { displayOnly: true, filletRadiusMm: toolR, positions, indices };
}

/** 보정 솔리드를 원본 몸통 안으로 묻는 깊이. 바깥면만 가공면이 된다. */
const RELIEF_SOLID_DEPTH_MM = 0.3;

/**
 * filled STL에 덧씌우는 닫힌 보정 솔리드. 바깥면은 프리뷰 reliefOverlay와 같은 공구 R 필렛이고,
 * 안쪽 면은 반경 방향으로 {@link RELIEF_SOLID_DEPTH_MM}만큼 몸통 안에 묻힌다.
 * 원본 메시와 합치지 않으므로 원본 삼각형은 그대로 남는다.
 */
export function buildTightCornerReliefSolid(tightRows, axis, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const total = Number(options.sampleTotal) || 0;
  const positions = [];
  const indices = [];
  const quad = (a, b, c, d, flip = false) => {
    if (flip) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  };
  for (const { run, smooth } of reliefRuns(tightRows, total)) {
    const cols = smooth[0].length;
    const cyclic = run.length >= total;
    const rowCount = cyclic ? run.length + 1 : run.length;
    const outerBase = positions.length / 3;
    for (let layer = 0; layer < 2; layer += 1) {
      for (let ri = 0; ri < rowCount; ri += 1) {
        const src = ri % run.length;
        const radial = radialFromFinishPoint(run[src].finishLinePoint, axis);
        for (const [u0, w] of smooth[src]) {
          const u = layer === 0 ? u0 : Math.max(u0 - RELIEF_SOLID_DEPTH_MM, 0.25);
          const p = fromPlaneCoords(u, w, radial, axis);
          positions.push(round3(p[0]), round3(p[1]), round3(p[2]));
        }
      }
    }
    const innerBase = outerBase + rowCount * cols;
    const O = (ri, c) => outerBase + ri * cols + c;
    const I = (ri, c) => innerBase + ri * cols + c;
    for (let ri = 0; ri < rowCount - 1; ri += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        quad(O(ri, c), O(ri, c + 1), O(ri + 1, c), O(ri + 1, c + 1));
        quad(I(ri, c), I(ri, c + 1), I(ri + 1, c), I(ri + 1, c + 1), true);
      }
      quad(O(ri, 0), O(ri + 1, 0), I(ri, 0), I(ri + 1, 0), true);
      quad(O(ri, cols - 1), O(ri + 1, cols - 1), I(ri, cols - 1), I(ri + 1, cols - 1));
    }
    if (!cyclic) {
      for (const ri of [0, rowCount - 1]) {
        for (let c = 0; c < cols - 1; c += 1) {
          quad(O(ri, c), O(ri, c + 1), I(ri, c), I(ri, c + 1), ri !== 0);
        }
      }
    }
  }
  if (positions.length < 9 || indices.length < 3) return null;
  return { filletRadiusMm: toolR, positions, indices, triangleCount: indices.length / 3 };
}

/** 솔리드(indexed)를 삼각형 수프 배열로 편다. */
export function reliefSolidTriangles(solid) {
  if (!solid?.positions?.length || !solid?.indices?.length) return [];
  const tris = [];
  const { positions, indices } = solid;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const tri = [];
    for (const idx of [indices[i], indices[i + 1], indices[i + 2]]) {
      tri.push([positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]]);
    }
    tris.push(tri);
  }
  return tris;
}

/**
 * 걷어 낼 원본 삼각형 판정용 밴드(정렬 축=Z 전제). 열마다 평활 보정 단면(u,w)을 들고 있다.
 * 솔리드와 같은 평활 단면을 써서, 걷어 낸 자리와 덧씌운 면이 어긋나지 않는다.
 */
export function buildTightCornerReliefBand(tightRows, options = {}) {
  const total = Number(options.sampleTotal) || 0;
  const band = [];
  for (const { run, smooth } of reliefRuns(tightRows, total)) {
    run.forEach((row, ri) => {
      const profile = smooth[ri]
        .map(([u, w]) => ({ u, w }))
        .sort((a, b) => a.w - b.w);
      band.push({
        theta: Math.atan2(row.finishLinePoint[1], row.finishLinePoint[0]),
        profile,
      });
    });
  }
  return band;
}

/** 점이 보정 밴드의 바깥 표면 근처(걷어 낼 원본 코너 면)에 있는가. */
export function isPointInTightCornerReliefBand(band, p) {
  if (!band?.length || !Array.isArray(p)) return false;
  const theta = Math.atan2(p[1], p[0]);
  let best = null;
  let bestD = Infinity;
  for (const entry of band) {
    let d = Math.abs(theta - entry.theta);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  if (!best || bestD > 0.09) return false;
  const profile = best.profile;
  const w = p[2];
  if (w < profile[0].w - 0.02 || w > profile[profile.length - 1].w + 0.02) return false;
  let uOuter = profile[profile.length - 1].u;
  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    if (w >= a.w && w <= b.w) {
      const t = b.w - a.w > 1e-9 ? (w - a.w) / (b.w - a.w) : 0;
      uOuter = a.u + t * (b.u - a.u);
      break;
    }
  }
  const u = Math.hypot(p[0], p[1]);
  return u >= uOuter - RELIEF_SOLID_DEPTH_MM - 0.02 && u <= uOuter + 0.2;
}

export function collectOuterProfileFromVertices(mesh, fl, axis, wFl, uTarget) {
  const angFl = Math.atan2(fl[1], fl[0]);
  const angTol = 0.22;
  const uMin = Math.max(PROFILE_U_MIN_MM, uTarget * 0.55);
  const wMin = wFl - 3.2;
  const wMax = wFl + 6.5;
  const bins = new Map();
  const v = mesh.verts;
  for (let i = 0; i < v.length; i += 3) {
    const p = [v[i], v[i + 1], v[i + 2]];
    const u = radialDistanceFromAxis(p, axis);
    if (u < uMin) continue;
    const w = dot3(p, axis);
    if (w < wMin || w > wMax) continue;
    const ang = Math.atan2(p[1], p[0]);
    let dAng = ang - angFl;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    if (Math.abs(dAng) > angTol) continue;
    const key = Math.round(w / PROFILE_W_BIN_MM);
    const prev = bins.get(key);
    if (!prev || u > prev.u) bins.set(key, { u, w, p: p.slice() });
  }
  const profile = [...bins.values()].sort((a, b) => a.w - b.w);
  if (profile.length >= 3) return profile;
  return null;
}

const PROFILE_STEP_MM = 0.03;
const PROFILE_UP_MM = 3.2;
const FL_SNAP_MAX_MM = 0.35;
/**
 * 마진 접선각 상한. 직선 마진만 찾으면 단면이 곡선으로 휘어 들어가는(움푹 패인) 케이스는
 * 벽 직전 접선각이 이미 40°를 넘어 피팅 구간이 사라진다. FL 근처 초기 접선을 벽 각(70°)과
 * 겹치지 않는 55°까지 허용해 마진 점근선을 잡는다.
 */
const MARGIN_FIT_MAX_DEG = 55;
const WALL_MIN_DEG = 70;
const TANGENT_HALF_STEPS = 5;
const JUNCTION_EXCLUDE_MM = 0.25;
const MARGIN_FIT_MIN_MM = 0.25;
const WALL_FIT_MIN_MM = 0.4;
const WALL_FIT_MAX_MM = 1.4;
/** 측정 R이 공구 R보다 이 값 이상 작을 때만 보정면을 만든다. */
const FILLET_R_TOLERANCE_MM = 0.02;

function cumulativeLength(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i += 1) {
    out.push(out[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].w - pts[i - 1].w));
  }
  return out;
}

function resampleUniform(pts, step) {
  if (pts.length < 2) return pts;
  const len = cumulativeLength(pts);
  const total = len[len.length - 1];
  const out = [];
  let j = 0;
  for (let s = 0; s <= total; s += step) {
    while (j < pts.length - 2 && len[j + 1] < s) j += 1;
    const seg = len[j + 1] - len[j] || 1;
    const t = (s - len[j]) / seg;
    out.push({
      u: pts[j].u + t * (pts[j + 1].u - pts[j].u),
      w: pts[j].w + t * (pts[j + 1].w - pts[j].w),
    });
  }
  return out;
}

/** FL에서 위로 올라가는 단면 폴리라인(부호 있는 u, w). 반경 평면 단면 루프를 그대로 따른다. */
function extractProfileAboveFl(mesh, fl, radial, axis, n) {
  const loops = meshPlaneSection(mesh, [0, 0, 0], n);
  const uFl = dot3(fl, radial);
  const wFl = dot3(fl, axis);
  let best = null;
  let bestD = Infinity;
  for (const loop of loops) {
    if (!loop || loop.length < 6) continue;
    for (let i = 0; i < loop.length; i += 1) {
      const u = dot3(loop[i], radial);
      if (u <= 0) continue;
      const d = Math.hypot(u - uFl, dot3(loop[i], axis) - wFl);
      if (d < bestD) {
        bestD = d;
        best = { loop, i };
      }
    }
  }
  if (!best || bestD > FL_SNAP_MAX_MM) return null;
  const { loop, i } = best;
  const m = loop.length;
  const walk = (dir) => {
    const out = [];
    for (let k = 0; k < m; k += 1) {
      const p = loop[(i + dir * k + m * 2) % m];
      const u = dot3(p, radial);
      const w = dot3(p, axis);
      if (u <= 0.2) break;
      out.push({ u, w });
      // 긴 변은 정점 하나뿐일 수 있어, 한도를 넘는 첫 점까지 담고 리샘플 뒤 자른다.
      if (w > wFl + PROFILE_UP_MM) break;
    }
    return out;
  };
  const rise = (seq) => {
    let mx = -Infinity;
    for (const p of seq) {
      if (Math.hypot(p.u - uFl, p.w - wFl) > 1.0) break;
      mx = Math.max(mx, p.w);
    }
    return mx;
  };
  const fwd = walk(1);
  const bwd = walk(-1);
  const seq = rise(fwd) >= rise(bwd) ? fwd : bwd;
  if (seq.length < 2) return null;
  const pts = resampleUniform(seq, PROFILE_STEP_MM).filter((p) => p.w <= wFl + PROFILE_UP_MM);
  return pts.length >= 40 ? pts : null;
}

function pcaLine(pts) {
  let cu = 0;
  let cw = 0;
  for (const p of pts) {
    cu += p.u;
    cw += p.w;
  }
  cu /= pts.length;
  cw /= pts.length;
  let suu = 0;
  let sww = 0;
  let suw = 0;
  for (const p of pts) {
    suu += (p.u - cu) ** 2;
    sww += (p.w - cw) ** 2;
    suw += (p.u - cu) * (p.w - cw);
  }
  const ang = 0.5 * Math.atan2(2 * suw, suu - sww);
  let du = Math.cos(ang);
  let dw = Math.sin(ang);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (du * (last.u - first.u) + dw * (last.w - first.w) < 0) {
    du = -du;
    dw = -dw;
  }
  return { p: { u: cu, w: cw }, d: { u: du, w: dw } };
}

function pointSegDist(p, a, b) {
  const abu = b.u - a.u;
  const abw = b.w - a.w;
  const l2 = abu * abu + abw * abw || 1;
  const t = clamp(((p.u - a.u) * abu + (p.w - a.w) * abw) / l2, 0, 1);
  return Math.hypot(p.u - (a.u + t * abu), p.w - (a.w + t * abw));
}

/**
 * 피니시라인 바로 위, 마진(수평에 가까움)↔축면(수직에 가까움) 경계의 fillet R을 잰다.
 * R < 공구 R이면 공구 R 필렛 보정면 단면(reliefProfile)을 돌려준다. 메시는 바꾸지 않는다.
 */
export function analyzeMarginAtPoint(mesh, fl, toolR, axis, log) {
  const radial = radialFromFinishPoint(fl, axis);
  const n = sectionNormal(radial, axis);
  if (!n) return null;
  const no = (why) => {
    log?.(`[tight-corner] skip: ${why}`);
    return { tight: false };
  };
  const pts = extractProfileAboveFl(mesh, fl, radial, axis, n);
  if (!pts) {
    log?.("[tight-corner] skip: no-profile");
    return null;
  }

  const stepsPerMm = 1 / PROFILE_STEP_MM;
  const H = TANGENT_HALF_STEPS;
  const phi = pts.map((_, i) => {
    if (i < H || i >= pts.length - H) return null;
    const du = Math.abs(pts[i + H].u - pts[i - H].u);
    const dw = Math.abs(pts[i + H].w - pts[i - H].w);
    return (Math.atan2(dw, du) * 180) / Math.PI;
  });

  // 축면 시작: 이후 0.4mm가 계속 수직에 가까운 첫 지점.
  const wallRun = Math.round(0.4 * stepsPerMm);
  let iw = -1;
  for (let i = H; i < pts.length - H - wallRun; i += 1) {
    let ok = true;
    for (let j = i; j <= i + wallRun; j += 1) {
      if (phi[j] == null || phi[j] < WALL_MIN_DEG) {
        ok = false;
        break;
      }
    }
    if (ok) {
      iw = i;
      break;
    }
  }
  if (iw < 0) return no("wall-not-found");

  // 마진 점근선: FL에서 시작해 접선각이 MARGIN_FIT_MAX_DEG를 처음 넘는 지점까지.
  // 곡선 전이(움푹 패인 마진)는 벽 직전 구간이 이미 휘어 있어, 벽에서 거꾸로 찾으면
  // 직선 구간이 남지 않는다. 초기 접선으로 점근선을 잡아야 가상 코너·R을 잴 수 있다.
  let mEnd = H;
  while (mEnd < iw && phi[mEnd] != null && phi[mEnd] <= MARGIN_FIT_MAX_DEG) mEnd += 1;
  if (mEnd <= H) return no("margin-not-found");

  const excl = Math.round(JUNCTION_EXCLUDE_MM * stepsPerMm);
  const marginPts = pts.slice(2, mEnd);
  const wallEnd = Math.min(pts.length, iw + Math.round(WALL_FIT_MAX_MM * stepsPerMm));
  const wallPts = pts.slice(iw + excl, wallEnd);
  if (
    marginPts.length < MARGIN_FIT_MIN_MM * stepsPerMm ||
    wallPts.length < WALL_FIT_MIN_MM * stepsPerMm
  ) {
    return no("fit-span-short");
  }

  const lm = pcaLine(marginPts);
  const lw = pcaLine(wallPts);
  const det = lm.d.u * lw.d.w - lm.d.w * lw.d.u;
  // 오목(공기 쪽이 벌어진) 코너만: 마진→축면 회전이 시계 방향.
  if (!(det < -0.05)) return no("not-concave");
  const du = lw.p.u - lm.p.u;
  const dw = lw.p.w - lm.p.w;
  const tm = (du * lw.d.w - dw * lw.d.u) / det;
  const corner = { u: lm.p.u + lm.d.u * tm, w: lm.p.w + lm.d.w * tm };
  const near = Math.hypot(corner.u - pts[iw].u, corner.w - pts[iw].w);
  if (!Number.isFinite(near) || near > 1.5) return no("corner-far");

  const rayLedge = { u: -lm.d.u, w: -lm.d.w };
  const rayWall = { u: lw.d.u, w: lw.d.w };
  const ext = Math.acos(clamp(rayLedge.u * rayWall.u + rayLedge.w * rayWall.w, -1, 1));
  if (!(ext > (30 * Math.PI) / 180) || ext > (168 * Math.PI) / 180) return no("wedge-angle");

  const k = 1 / Math.sin(ext / 2) - 1;
  const from = Math.max(0, mEnd - 10);
  const to = Math.min(pts.length - 1, iw + 10);
  let dMin = Infinity;
  for (let i = from; i < to; i += 1) {
    dMin = Math.min(dMin, pointSegDist(corner, pts[i], pts[i + 1]));
  }
  const measuredR = dMin / k;
  if (!(measuredR < toolR - FILLET_R_TOLERANCE_MM)) {
    log?.(
      `[tight-corner] ok az=${((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1)}° R=${measuredR.toFixed(3)}mm`,
    );
    return { tight: false };
  }

  const reliefProfile = filletConcaveCorner2d(corner, rayLedge, rayWall, toolR);
  if (!reliefProfile) return no("relief-null");
  const cornerPoint3 = fromPlaneCoords(corner.u, corner.w, radial, axis);
  log?.(
    `[tight-corner] tight az=${((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1)}° ` +
      `R=${measuredR.toFixed(3)}mm<${toolR}`,
  );
  return {
    tight: true,
    finishLinePoint: fl.slice(),
    cornerPoint: cornerPoint3.slice(),
    airAngleDeg: Math.round((ext * 1800) / Math.PI) / 10,
    filletRadiusMm: Math.round(Math.max(0, measuredR) * 1000) / 1000,
    reliefProfile,
  };
}

function buildTightFinishLineSegments(finishLinePoints, samples) {
  const n = finishLinePoints.length;
  if (n < 2) return [];
  const tightFlags = finishLinePoints.map((fl) => {
    let best = Infinity;
    let hit = false;
    for (const s of samples) {
      if (!s?.tight) continue;
      const d = dist3(fl, s.finishLinePoint);
      if (d < best) {
        best = d;
        hit = d <= 1.4;
      }
    }
    return hit;
  });
  const segments = [];
  let start = null;
  for (let i = 0; i < n; i += 1) {
    if (tightFlags[i]) {
      if (start == null) start = i;
    } else if (start != null) {
      segments.push({ startIndex: start, endIndex: i - 1 });
      start = null;
    }
  }
  if (start != null) segments.push({ startIndex: start, endIndex: n - 1 });
  return segments;
}

/**
 * @param {import("./meshCore.js").Mesh} mesh filled 직전/직후 메시(정렬 좌표계)
 * @param {number[][]} finishLinePoints
 * @param {{ tiltAxisVector?: {x?:number,y?:number,z?:number}|null, toolRadiusMm?: number, log?: Function }} [options]
 */
function collectTightSamples(mesh, finishLinePoints, options = {}) {
  const toolR = Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const axis = normalizeAxis(options.tiltAxisVector);
  const raw = Array.isArray(finishLinePoints) ? finishLinePoints : [];
  if (raw.length < FL_SAMPLE_MIN) return { toolR, axis, raw, sampled: [], samples: [] };
  const sampled = resampleFinishLine(raw, FL_SAMPLE_MAX);
  const samples = [];
  sampled.forEach((fl, sampleIndex) => {
    const row = analyzeMarginAtPoint(mesh, fl, toolR, axis, options.log);
    if (row?.tight) samples.push({ ...row, sampleIndex });
  });
  return { toolR, axis, raw, sampled, samples };
}

function tightCornerMeta({ toolR, axis, raw, sampled, samples }) {
  const rValues = samples
    .map((s) => Number(s.filletRadiusMm))
    .filter((v) => Number.isFinite(v));
  return {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: samples.length,
    /** 타이트 샘플 전체의 현재 fillet R 평균(mm). 타이트 없으면 null. */
    averageFilletRadiusMm: rValues.length
      ? Math.round((rValues.reduce((a, b) => a + b, 0) / rValues.length) * 1000) / 1000
      : null,
    samples: samples.map(({ reliefProfile, ...rest }) => rest),
    tightFinishLineSegments: buildTightFinishLineSegments(raw, samples),
    /** @deprecated v2 — 프리뷰는 reliefOverlay만 사용. */
    ballPassPolylines: [],
    reliefOverlay: buildTightCornerReliefOverlay(samples, axis, {
      toolRadiusMm: toolR,
      sampleTotal: sampled.length,
    }),
    /**
     * 원본과 별개인 보정 솔리드(닫힌 메시). filled STL에는 넣지 않는다.
     * 뷰어 토글 ON일 때만 원본 위에 빨갛게 덧입혀 보여준다.
     */
    correctionSolid: buildTightCornerReliefSolid(samples, axis, {
      toolRadiusMm: toolR,
      sampleTotal: sampled.length,
    }),
  };
}

export function detectTightCorners(mesh, finishLinePoints, options = {}) {
  return tightCornerMeta(collectTightSamples(mesh, finishLinePoints, options));
}

/**
 * 보정 솔리드 적용 시뮬레이션(테스트·검증용). triangles를 수프에 덧씌우고, band에 걸리는
 * 원본 삼각형은 걷어 낸다. 실제 파이프라인은 filled STL을 변형하지 않으므로 이 계획을 쓰지 않는다.
 * @returns {{ tightCorner: object, triangles: number[][][], band: object[] }}
 */
export function planTightCornerCorrection(mesh, finishLinePoints, options = {}) {
  const collected = collectTightSamples(mesh, finishLinePoints, options);
  const tightCorner = tightCornerMeta(collected);
  if (!collected.samples.length) return { tightCorner, triangles: [], band: [] };
  const solid = buildTightCornerReliefSolid(collected.samples, collected.axis, {
    toolRadiusMm: collected.toolR,
    sampleTotal: collected.sampled.length,
  });
  if (!solid) return { tightCorner, triangles: [], band: [] };
  return {
    tightCorner,
    triangles: reliefSolidTriangles(solid),
    band: buildTightCornerReliefBand(collected.samples, {
      sampleTotal: collected.sampled.length,
    }),
  };
}

function axisFrame(axis) {
  const helper = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let xAxis = cross(helper, axis);
  if (Math.hypot(xAxis[0], xAxis[1], xAxis[2]) < 1e-8) xAxis = cross([0, 1, 0], axis);
  xAxis = normalize(xAxis);
  const yAxis = normalize(cross(axis, xAxis));
  return { xAxis, yAxis };
}

function thetaAboutAxis(p, axis, frame) {
  const along = dot3(p, axis);
  const radial = sub3(p, scale3(axis, along));
  return Math.atan2(dot3(radial, frame.yAxis), dot3(radial, frame.xAxis));
}

function angDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 필렛 아래 마진 실루엣에서 날개를 깎아 내는 높이. */
const CUFF_SHOULDER_BELOW_MM = 0.6;
const SILHOUETTE_BINS = 72;

/** 단면 (u,w)에서 w에 해당하는 필렛 반경. 구간 밖이면 null. */
function profileUAtW(profile, w) {
  const n = profile.length;
  if (n < 2) return null;
  const w0 = profile[0].w;
  const w1 = profile[n - 1].w;
  if (w < w0 - 0.03 || w > w1 + 0.03) return null;
  if (w <= w0) return profile[0].u;
  if (w >= w1) return profile[n - 1].u;
  for (let i = 0; i < n - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    const lo = Math.min(a.w, b.w);
    const hi = Math.max(a.w, b.w);
    if (w < lo || w > hi) continue;
    const span = b.w - a.w;
    const t = Math.abs(span) > 1e-9 ? (w - a.w) / span : 0;
    return a.u + t * (b.u - a.u);
  }
  return null;
}

const RELIEF_MAX_PULL_MM = 1.2;
const RELIEF_MIN_PULL_MM = 0.004;
const RELIEF_MAX_SEGMENT_RAD = 0.4;
/** 필렛보다 밖으로 튀어나온 날개를 끌어당기는 한도. */
const CUFF_WING_PULL_MM = 2.8;
/** 이보다 필렛 안쪽이면 보어·육각이라 움직이지 않는다. */
const CUFF_BORE_GAP_MM = 0.7;
const CUFF_SPLIT_EDGE_MM = 0.32;
const CUFF_SPLIT_ROUNDS = 4;

/**
 * 인접 샘플의 공구 R 필렛을 (theta, w)에서 잇는다.
 * 런 사이 빈 각도는 건너뛴다.
 */
/** 떨어진 타이트 구간을 이 각도(라디안) 안이면 하나의 커프로 잇는다. */
const CUFF_BRIDGE_GAP_RAD = 0.95;

function stationColsFromRun(run, smooth, axis, frame) {
  return run.map((row, ri) => ({
    theta: thetaAboutAxis(row.finishLinePoint, axis, frame),
    profile: smooth[ri]
      .map(([u, w]) => ({ u, w }))
      .sort((a, b) => a.w - b.w || a.u - b.u),
  }));
}

function lerpStation(from, to, t, gap) {
  return {
    theta: from.theta + gap * t,
    profile: from.profile.map((p, k) => ({
      u: p.u + t * (to.profile[k].u - p.u),
      w: p.w + t * (to.profile[k].w - p.w),
    })),
  };
}

/** 가까운 런 사이를 보간해 날개 사이 빈 각이 남지 않게 한다. */
function connectCuffRuns(runs) {
  if (!runs.length) return [];
  const ordered = runs.filter((cols) => cols.length).slice().sort((a, b) => a[0].theta - b[0].theta);
  const groups = [ordered[0].slice()];
  const bridge = (from, to, gap) => {
    if (!(gap > 0.04) || gap > CUFF_BRIDGE_GAP_RAD) return null;
    if (from.profile.length < 2 || from.profile.length !== to.profile.length) return null;
    const steps = Math.max(2, Math.round(gap / 0.16));
    const cols = [];
    for (let s = 1; s < steps; s += 1) cols.push(lerpStation(from, to, s / steps, gap));
    return cols;
  };
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const cur = groups[groups.length - 1];
    const next = ordered[i + 1];
    const gap = angDelta(next[0].theta, cur[cur.length - 1].theta);
    const mid = bridge(cur[cur.length - 1], next[0], gap);
    if (mid) cur.push(...mid, ...next);
    else groups.push(next.slice());
  }
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    const gap = angDelta(first[0].theta + Math.PI * 2, last[last.length - 1].theta);
    const mid = bridge(last[last.length - 1], first[0], gap);
    if (mid) {
      const shifted = first.map((col) => ({
        theta: col.theta + Math.PI * 2,
        profile: col.profile,
      }));
      groups[0] = last.concat(mid, shifted);
      groups.pop();
    }
  } else {
    const cols = groups[0];
    const gap = angDelta(cols[0].theta + Math.PI * 2, cols[cols.length - 1].theta);
    const mid = bridge(cols[cols.length - 1], cols[0], gap);
    if (mid) cols.push(...mid);
  }
  return groups;
}

function fairCuffCols(cols) {
  const n = cols.length;
  if (n < 5) return cols;
  const half = Math.max(4, Math.round(n / 12));
  const m = cols[0].profile.length;
  const endGap = angDelta(cols[0].theta + Math.PI * 2, cols[n - 1].theta);
  const cyclic = endGap < 0.5;
  return cols.map((col, i) => {
    const acc = Array.from({ length: m }, () => ({ u: 0, w: 0 }));
    let cnt = 0;
    for (let k = -half; k <= half; k += 1) {
      let j = i + k;
      if (cyclic) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      const profile = cols[j].profile;
      if (profile.length !== m) continue;
      for (let c = 0; c < m; c += 1) {
        acc[c].u += profile[c].u;
        acc[c].w += profile[c].w;
      }
      cnt += 1;
    }
    if (!cnt) return col;
    return {
      theta: col.theta,
      profile: acc.map((a) => ({ u: a.u / cnt, w: a.w / cnt })),
    };
  });
}

function reliefStationPairs(tightRows, axis, sampleTotal, options = {}) {
  const frame = axisFrame(axis);
  const pairs = [];
  let wMin = Infinity;
  let wMax = -Infinity;
  const runs = [];
  for (const { run, smooth } of reliefRuns(tightRows, sampleTotal)) {
    runs.push(stationColsFromRun(run, smooth, axis, frame));
  }
  const groups = options.fairCuff ? connectCuffRuns(runs).map(fairCuffCols) : runs;
  for (const cols of groups) {
    if (cols.length < 2) continue;
    for (const col of cols) {
      const profile = col.profile;
      if (!profile.length) continue;
      wMin = Math.min(wMin, profile[0].w);
      wMax = Math.max(wMax, profile[profile.length - 1].w);
    }
    const endGap = angDelta(cols[0].theta + Math.PI * 2, cols[cols.length - 1].theta);
    const cyclic = endGap < 0.5 && cols.length >= 8;
    const last = cyclic ? cols.length : cols.length - 1;
    for (let i = 0; i < last; i += 1) {
      pairs.push([cols[i], cols[(i + 1) % cols.length]]);
    }
  }
  return { frame, pairs, wMin, wMax };
}

function filletUAt(pairs, theta, w) {
  for (const [a, b] of pairs) {
    const span = angDelta(b.theta, a.theta);
    if (Math.abs(span) < 1e-8 || Math.abs(span) > RELIEF_MAX_SEGMENT_RAD) continue;
    const t = angDelta(theta, a.theta) / span;
    if (t < -0.02 || t > 1.02) continue;
    const u0 = profileUAtW(a.profile, w);
    const u1 = profileUAtW(b.profile, w);
    if (u0 == null || u1 == null) continue;
    const clamped = Math.min(1, Math.max(0, t));
    return u0 + clamped * (u1 - u0);
  }
  return null;
}

function vertexMetrics(p, axis, frame) {
  const along = dot3(p, axis);
  const radial = sub3(p, scale3(axis, along));
  const u = Math.hypot(radial[0], radial[1], radial[2]);
  const theta = Math.atan2(dot3(radial, frame.yAxis), dot3(radial, frame.xAxis));
  return { along, radial, u, theta };
}

/**
 * 커프 구간의 긴 변을 나눠 필렛을 따라가는 면을 만든다.
 * 변 분할은 인접 면을 같이 나눠서 경계 개수가 늘지 않는다.
 */
function subdivideCuffBand(mesh, onCuff) {
  let verts = Array.from(mesh.verts);
  let faces = Array.from(mesh.faces);
  const pos = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  for (let round = 0; round < CUFF_SPLIT_ROUNDS; round += 1) {
    const mid = new Map();
    const keyOf = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const want = (a, b) => {
      const pa = pos(a);
      const pb = pos(b);
      const len = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (len <= CUFF_SPLIT_EDGE_MM || len > 2.4) return false;
      return onCuff(pa) || onCuff(pb);
    };
    const midpoint = (a, b) => {
      const key = keyOf(a, b);
      const hit = mid.get(key);
      if (hit != null) return hit;
      const pa = pos(a);
      const pb = pos(b);
      const idx = verts.length / 3;
      verts.push((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);
      mid.set(key, idx);
      return idx;
    };
    const next = [];
    let grew = false;
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f];
      const b = faces[f + 1];
      const c = faces[f + 2];
      const mab = want(a, b) ? midpoint(a, b) : -1;
      const mbc = want(b, c) ? midpoint(b, c) : -1;
      const mca = want(c, a) ? midpoint(c, a) : -1;
      const n = (mab >= 0 ? 1 : 0) + (mbc >= 0 ? 1 : 0) + (mca >= 0 ? 1 : 0);
      if (!n) {
        next.push(a, b, c);
        continue;
      }
      grew = true;
      if (n === 3) {
        next.push(a, mab, mca, b, mbc, mab, c, mca, mbc, mab, mbc, mca);
      } else if (n === 1) {
        if (mab >= 0) next.push(a, mab, c, mab, b, c);
        else if (mbc >= 0) next.push(b, mbc, a, mbc, c, a);
        else next.push(c, mca, b, mca, a, b);
      } else if (mab < 0) {
        next.push(a, b, mbc, a, mbc, mca, mbc, c, mca);
      } else if (mbc < 0) {
        next.push(b, c, mca, b, mca, mab, mca, a, mab);
      } else {
        next.push(c, a, mab, c, mab, mbc, mab, b, mbc);
      }
    }
    faces = next;
    if (!grew) break;
  }
  if (faces.length === mesh.faces.length && verts.length === mesh.verts.length) return;
  mesh.verts = Float64Array.from(verts);
  mesh.faces = Int32Array.from(faces);
  mesh.invalidate();
}

/**
 * 코너 정점을 매끈한 커프 필렛으로 옮긴다.
 * 밖으로 튀어나온 날개도 같은 단면으로 당기고, 긴 면은 나눠 붙인다.
 * @returns {boolean} 정점을 하나라도 옮겼으면 true
 */
function projectVerticesOntoRelief(mesh, tightRows, axis, sampleTotal) {
  const { frame, pairs, wMin, wMax } = reliefStationPairs(tightRows, axis, sampleTotal, {
    fairCuff: true,
  });
  if (!pairs.length || !Number.isFinite(wMin)) return false;
  subdivideCuffBand(mesh, (p) => {
    const m = vertexMetrics(p, axis, frame);
    if (m.along < wMin - 0.05 || m.along > wMax + 0.05) return false;
    const uFillet = filletUAt(pairs, m.theta, m.along);
    if (!(uFillet > 0)) return false;
    return m.u >= uFillet - CUFF_BORE_GAP_MM && m.u <= uFillet + CUFF_WING_PULL_MM;
  });
  const v = mesh.verts;
  let moved = 0;
  for (let i = 0; i < v.length; i += 3) {
    const p = [v[i], v[i + 1], v[i + 2]];
    const { along, radial, u, theta } = vertexMetrics(p, axis, frame);
    if (along < wMin - 0.05 || along > wMax + 0.05) continue;
    if (u < 0.2) continue;
    const uFillet = filletUAt(pairs, theta, along);
    if (!(uFillet > 0)) continue;
    const excess = u - uFillet;
    // 필렛 안쪽은 코너만(보어는 한도 밖), 바깥 날개는 더 멀리까지 단면에 붙인다.
    if (excess < -RELIEF_MAX_PULL_MM || excess > CUFF_WING_PULL_MM) continue;
    if (Math.abs(excess) <= RELIEF_MIN_PULL_MM) continue;
    const s = uFillet / u;
    v[i] = radial[0] * s + axis[0] * along;
    v[i + 1] = radial[1] * s + axis[1] * along;
    v[i + 2] = radial[2] * s + axis[2] * along;
    moved += 1;
  }
  const wings = pullSilhouetteWings(mesh, axis, frame, wMin);
  if (moved > 0 || wings) mesh.invalidate();
  return moved > 0 || wings;
}

/**
 * 필렛 아래 마진에서 둘레보다 튀어나온 꼭짓점을, 주변에서 가장 낮은 반경으로 당긴다.
 * 골은 밀지 않아서 매끈한 커프 지름은 그대로 둔다.
 */
function pullSilhouetteWings(mesh, axis, frame, wMin) {
  const lo = wMin - CUFF_SHOULDER_BELOW_MM;
  const hi = wMin + 0.08;
  subdivideCuffBand(mesh, (p) => {
    const m = vertexMetrics(p, axis, frame);
    return m.along >= lo && m.along <= hi && m.u > 1.8;
  });
  const bins = new Array(SILHOUETTE_BINS).fill(0);
  const v = mesh.verts;
  for (let i = 0; i < v.length; i += 3) {
    const m = vertexMetrics([v[i], v[i + 1], v[i + 2]], axis, frame);
    if (m.along < lo || m.along > hi || m.u < 1.8) continue;
    let idx = Math.floor(((m.theta + Math.PI) / (Math.PI * 2)) * SILHOUETTE_BINS);
    if (idx < 0) idx = 0;
    if (idx >= SILHOUETTE_BINS) idx = SILHOUETTE_BINS - 1;
    if (m.u > bins[idx]) bins[idx] = m.u;
  }
  const half = Math.max(3, Math.round(SILHOUETTE_BINS / 14));
  const target = bins.map((_, i) => {
    let m = Infinity;
    let n = 0;
    for (let k = -half; k <= half; k += 1) {
      const u = bins[(i + k + SILHOUETTE_BINS) % SILHOUETTE_BINS];
      if (!(u > 0)) continue;
      m = Math.min(m, u);
      n += 1;
    }
    return n ? m : 0;
  });
  let moved = 0;
  for (let i = 0; i < v.length; i += 3) {
    const p = [v[i], v[i + 1], v[i + 2]];
    const { along, radial, u, theta } = vertexMetrics(p, axis, frame);
    if (along < lo || along > hi || u < 1.8) continue;
    let idx = Math.floor(((theta + Math.PI) / (Math.PI * 2)) * SILHOUETTE_BINS);
    if (idx < 0) idx = 0;
    if (idx >= SILHOUETTE_BINS) idx = SILHOUETTE_BINS - 1;
    const goal = target[idx];
    if (!(goal > 0)) continue;
    const excess = u - goal;
    if (excess <= 0.04 || excess > CUFF_WING_PULL_MM) continue;
    const s = goal / u;
    v[i] = radial[0] * s + axis[0] * along;
    v[i + 1] = radial[1] * s + axis[1] * along;
    v[i + 2] = radial[2] * s + axis[2] * along;
    moved += 1;
  }
  return moved > 0;
}

/**
 * 재측정할 때 가상 코너가 필렛 쪽으로 따라오므로,
 * 공구 R보다 이만큼 큰 호를 만들어야 측정 R이 공구를 넘긴다.
 */
const CORRECTION_FILLET_CLEARANCE_MM = 0.3;

/**
 * 타이트 코너를 공구보다 넉넉한 필렛으로 밀어 낸 메시(정렬 좌표계).
 * 면을 도려내지 않아서 경계가 갈라지지 않는다.
 * @returns {import("./meshCore.js").Mesh | null}
 */
export function applyTightCornerCorrectionToMesh(mesh, finishLinePoints, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const collected = collectTightSamples(mesh, finishLinePoints, {
    ...options,
    toolRadiusMm: toolR + CORRECTION_FILLET_CLEARANCE_MM,
  });
  const samples = collected.samples.filter(
    (s) => Number(s.filletRadiusMm) < toolR - FILLET_R_TOLERANCE_MM,
  );
  if (!samples.length) return null;
  const next = mesh.clone();
  const moved = projectVerticesOntoRelief(
    next,
    samples,
    collected.axis,
    collected.sampled.length,
  );
  return moved ? next : null;
}
