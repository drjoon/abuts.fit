// related files:
// - web/backend/services/abutmentStl/finishline.js (단면 평면·finish line 샘플)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
//
// 마진 코너(어깨↔벽)에서 φ1.2 볼 엔드밀 미삭제 구간을 finish line 따라 검사하고,
// 피니시라인 위 오목 코너만 검사하고 프리뷰 전용 reliefOverlay(필렛 보정면) 메타를 만든다 — STL·CAM에는 쓰지 않는다.
import { cross, meshPlaneSection, normalize } from "./meshCore.js";

export const TIGHT_CORNER_VERSION = 4;
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

/** 피니시라인 위(w ≥ wFl)에서 가장 큰 오목 꺾임(ledge→벽). 아래·FL 자체 모서리는 보지 않는다. */
function findConcaveCornerAboveFl(profile, wFl) {
  let best = null;
  let bestTurn = 0;
  for (let i = 1; i < profile.length - 1; i += 1) {
    const b = profile[i];
    if (b.w < wFl + CORNER_ABOVE_FL_MIN_MM || b.w > wFl + CORNER_W_SEARCH_ABOVE_MM) continue;
    const a = profile[i - 1];
    const c = profile[i + 1];
    const v1u = b.u - a.u;
    const v1w = b.w - a.w;
    const v2u = c.u - b.u;
    const v2w = c.w - b.w;
    const l1 = Math.hypot(v1u, v1w);
    const l2 = Math.hypot(v2u, v2w);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const cross = v1u * v2w - v1w * v2u;
    if (cross >= 0) continue; // 볼록(금속 모서리)은 제외
    const turn = Math.acos(clamp((v1u * v2u + v1w * v2w) / (l1 * l2), -1, 1));
    if (turn > bestTurn) {
      bestTurn = turn;
      best = b;
    }
  }
  return bestTurn >= CORNER_MIN_TURN_RAD ? best : null;
}

function rayFromPoints(corner, pts) {
  let su = 0;
  let sw = 0;
  for (const p of pts) {
    su += p.u - corner.u;
    sw += p.w - corner.w;
  }
  const len = Math.hypot(su, sw);
  return len > DIST_TOL ? { u: su / len, w: sw / len } : null;
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

/** 프리뷰 전용: 필렛 보정면 연속 띠(CAM·STL 미사용). */
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

export function analyzeMarginAtPoint(mesh, fl, toolR, axis, log) {
  const radial = radialFromFinishPoint(fl, axis);
  const n = sectionNormal(radial, axis);
  if (!n) return null;

  const wFl = dot3(fl, axis);
  const uTarget = finishLineRadius(fl, axis);
  let profile = collectOuterProfileFromVertices(mesh, fl, axis, wFl, uTarget);
  if (!profile) {
    const loops = meshPlaneSection(mesh, [0, 0, 0], n);
    const loop = pickSectionLoop(loops, fl, radial, axis);
    if (!loop) return null;
    profile = buildOuterProfile(loop, radial, axis, wFl, 6.5, uTarget);
  }
  if (!profile) return null;

  // FL 위 오목 코너만 검사한다.
  const corner = findConcaveCornerAboveFl(profile, wFl);
  if (!corner) return { tight: false };

  const ledgePts = profile.filter((p) => p.w >= wFl - 0.02 && p.w < corner.w - 0.04);
  const wallPts = profile.filter(
    (p) => p.w > corner.w + 0.04 && p.w <= corner.w + ABOVE_FL_SECTION_MAX_MM,
  );
  if (ledgePts.length < 2 || wallPts.length < 2) return { tight: false };
  const rayLedge = rayFromPoints(corner, ledgePts);
  const rayWall = rayFromPoints(corner, wallPts);
  if (!rayLedge || !rayWall) return { tight: false };

  const ledgeSpan = Math.hypot(
    Math.max(...ledgePts.map((p) => p.u)) - Math.min(...ledgePts.map((p) => p.u)),
    Math.max(...ledgePts.map((p) => p.w)) - Math.min(...ledgePts.map((p) => p.w)),
  );
  const wallSpan = Math.hypot(
    Math.max(...wallPts.map((p) => p.u)) - Math.min(...wallPts.map((p) => p.u)),
    Math.max(...wallPts.map((p) => p.w)) - Math.min(...wallPts.map((p) => p.w)),
  );
  if (ledgeSpan < SHOULDER_MIN_SPAN_MM || wallSpan < WALL_MIN_SPAN_MM) return { tight: false };

  // 공기 쪽 쐐기 각. 작을수록 볼이 못 들어가 코너가 필렛으로 남는다.
  const airAngle = Math.acos(clamp(rayLedge.u * rayWall.u + rayLedge.w * rayWall.w, -1, 1));
  const gougeDepthMm = gougeDepthForCorner(airAngle, toolR);
  if (gougeDepthMm < GOUGE_TIGHT_THRESHOLD_MM) return { tight: false };

  const reliefProfile = filletConcaveCorner2d(corner, rayLedge, rayWall, toolR);
  if (!reliefProfile) return { tight: false };
  const cornerPoint3 = fromPlaneCoords(corner.u, corner.w, radial, axis);
  log?.(
    `[tight-corner] above-FL az=${((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1)}° ` +
      `airAngle=${((airAngle * 180) / Math.PI).toFixed(1)}° fillet=${gougeDepthMm.toFixed(3)}mm`,
  );
  return {
    tight: true,
    finishLinePoint: fl.slice(),
    cornerPoint: cornerPoint3.slice(),
    airAngleDeg: Math.round((airAngle * 1800) / Math.PI) / 10,
    gougeDepthMm: Math.round(gougeDepthMm * 1000) / 1000,
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
export function detectTightCorners(mesh, finishLinePoints, options = {}) {
  const toolR = Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const axis = normalizeAxis(options.tiltAxisVector);
  const log = options.log;
  const raw = Array.isArray(finishLinePoints) ? finishLinePoints : [];
  if (raw.length < FL_SAMPLE_MIN) {
    return {
      version: TIGHT_CORNER_VERSION,
      toolDiameterMm: FINISH_BALL_DIAMETER_MM,
      tightCount: 0,
      samples: [],
      tightFinishLineSegments: [],
      reliefOverlay: null,
    };
  }
  const sampled = resampleFinishLine(raw, FL_SAMPLE_MAX);
  const samples = [];
  sampled.forEach((fl, sampleIndex) => {
    const row = analyzeMarginAtPoint(mesh, fl, toolR, axis, log);
    if (row?.tight) samples.push({ ...row, sampleIndex });
  });
  const tightFinishLineSegments = buildTightFinishLineSegments(raw, samples);
  const reliefOverlay = buildTightCornerReliefOverlay(samples, axis, {
    toolRadiusMm: toolR,
    sampleTotal: sampled.length,
  });
  return {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: samples.length,
    samples: samples.map(({ reliefProfile, ...rest }) => rest),
    tightFinishLineSegments,
    /** @deprecated v2 — 프리뷰는 reliefOverlay만 사용(CAM 미참조). */
    ballPassPolylines: [],
    reliefOverlay,
  };
}
