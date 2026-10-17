// related files:
// - web/backend/services/abutmentStl/finishline.js (단면 평면·finish line 샘플)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
//
// 마진 코너(어깨↔벽)에서 φ1.2 볼 엔드밀 미삭제 구간을 finish line 따라 검사하고,
// 프리뷰 전용 reliefOverlay(필렛 보정면) 메타를 만든다 — STL·CAM에는 쓰지 않는다.
import { cross, meshPlaneSection, normalize } from "./meshCore.js";

export const TIGHT_CORNER_VERSION = 2;
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

function rotateAroundAxis(v, axis, angleRad) {
  const [ax, ay, az] = axis;
  const len = Math.hypot(ax, ay, az) || 1;
  const x = ax / len;
  const y = ay / len;
  const z = az / len;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const dot = v[0] * x + v[1] * y + v[2] * z;
  return [
    v[0] * c + (y * v[2] - z * v[1]) * s + x * dot * (1 - c),
    v[1] * c + (z * v[0] - x * v[2]) * s + y * dot * (1 - c),
    v[2] * c + (x * v[1] - y * v[0]) * s + z * dot * (1 - c),
  ];
}

/** 외곽 단면에서 φ볼 반경만큼 코너를 깎은 뒤 프로파일(가공 가능 형상). */
export function filletExteriorCorner2d(corner, wallLine, shoulderLine, toolR) {
  const wallDir = { u: wallLine.d.u, w: wallLine.d.w };
  const wl = Math.hypot(wallDir.u, wallDir.w);
  if (wl < DIST_TOL) return null;
  const vWall = { u: wallDir.u / wl, w: wallDir.w / wl };
  const shDir = shoulderLine.d;
  const sl = Math.hypot(shDir.u, shDir.w);
  if (sl < DIST_TOL) return null;
  const vShoulder = { u: -shDir.u / sl, w: -shDir.w / sl };
  const cosExt = clamp(vWall.u * vShoulder.u + vWall.w * vShoulder.w, -1, 1);
  const extAngle = Math.acos(cosExt);
  if (!(extAngle > 0.04) || extAngle >= Math.PI - 0.04) return null;
  const trim = toolR / Math.tan(extAngle / 2);
  if (!(trim > 0.02) || trim > 4) return null;
  const tWall = { u: corner.u + vWall.u * trim, w: corner.w + vWall.w * trim };
  const tShoulder = { u: corner.u + vShoulder.u * trim, w: corner.w + vShoulder.w * trim };
  let bisU = vWall.u + vShoulder.u;
  let bisW = vWall.w + vShoulder.w;
  const bl = Math.hypot(bisU, bisW);
  if (bl < DIST_TOL) return null;
  bisU /= bl;
  bisW /= bl;
  const centerDist = toolR / Math.sin(extAngle / 2);
  const cx = corner.u + bisU * centerDist;
  const cw = corner.w + bisW * centerDist;
  let a1 = Math.atan2(tWall.w - cw, tWall.u - cx);
  let a2 = Math.atan2(tShoulder.w - cw, tShoulder.u - cx);
  let da = a2 - a1;
  while (da <= -Math.PI) da += Math.PI * 2;
  while (da > Math.PI) da -= Math.PI * 2;
  const steps = Math.max(5, Math.ceil((Math.abs(da) / Math.PI) * 18));
  const arc = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = a1 + da * t;
    arc.push({ u: cx + toolR * Math.cos(ang), w: cw + toolR * Math.sin(ang) });
  }
  return { arc, tWall, tShoulder };
}

function buildReliefProfileAfter(profile, corner, wallLine, shoulderLine, toolR) {
  const fillet = filletExteriorCorner2d(corner, wallLine, shoulderLine, toolR);
  if (!fillet) return null;
  const wLo = Math.min(fillet.tShoulder.w, fillet.tWall.w) - 0.08;
  const wHi = Math.max(fillet.tShoulder.w, fillet.tWall.w) + 0.08;
  const before = profile
    .filter((p) => p.w >= wLo - 0.45 && p.w <= wHi + 1.2)
    .map((p) => ({ u: p.u, w: p.w }));
  if (before.length < 4) return null;
  const after = [];
  for (const p of before) {
    if (p.w <= fillet.tShoulder.w - 0.02) after.push({ u: p.u, w: p.w });
  }
  for (const p of fillet.arc) after.push(p);
  for (const p of before) {
    if (p.w >= fillet.tWall.w + 0.02) after.push({ u: p.u, w: p.w });
  }
  after.sort((a, b) => a.w - b.w);
  if (after.length < 4) return null;
  return {
    before: before.map((p) => [round3(p.u), round3(p.w)]),
    after: after.map((p) => [round3(p.u), round3(p.w)]),
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function pushTriangle(indices, a, b, c) {
  indices.push(a, b, c);
}

/** 프리뷰 전용: φ볼 필렛 보정면을 얇은 패치 메시로 만든다(CAM·STL 미사용). */
export function buildTightCornerReliefOverlay(tightRows, axis, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const rows = Array.isArray(tightRows) ? tightRows : [];
  if (!rows.length) return null;
  const positions = [];
  const indices = [];
  const angularHalfSpan =
    Number(options.angularHalfSpanRad) > 0 ? Number(options.angularHalfSpanRad) : 0.11;
  const angularSteps = Math.max(4, Number(options.angularSteps) || 7);

  for (const row of rows) {
    const fl = row.finishLinePoint;
    const profile = row.reliefProfiles;
    if (!Array.isArray(fl) || fl.length < 3 || !profile?.after?.length) continue;
    const baseRadial = radialFromFinishPoint(fl, axis);
    const afterProf = profile.after
      .map((p) => ({ u: Number(p[0]), w: Number(p[1]) }))
      .filter((p) => Number.isFinite(p.u) && Number.isFinite(p.w));
    if (afterProf.length < 3) continue;

    const baseVert = positions.length / 3;
    for (let ai = 0; ai <= angularSteps; ai += 1) {
      const ang = -angularHalfSpan + (angularHalfSpan * 2 * ai) / angularSteps;
      const radial = normalize(rotateAroundAxis(baseRadial, axis, ang));
      for (const pt of afterProf) {
        const p3 = fromPlaneCoords(pt.u, pt.w, radial, axis);
        positions.push(p3[0], p3[1], p3[2]);
      }
    }

    const cols = afterProf.length;
    for (let ai = 0; ai < angularSteps; ai += 1) {
      for (let pi = 0; pi < cols - 1; pi += 1) {
        const i0 = baseVert + ai * cols + pi;
        const i1 = i0 + 1;
        const i2 = baseVert + (ai + 1) * cols + pi;
        const i3 = i2 + 1;
        pushTriangle(indices, i0, i2, i1);
        pushTriangle(indices, i1, i2, i3);
      }
    }
  }

  if (positions.length < 9 || indices.length < 3) return null;
  return {
    displayOnly: true,
    filletRadiusMm: toolR,
    positions,
    indices,
  };
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

  let corner = inferVirtualCorner(profile, wFl, uTarget);
  if (!corner) {
    const cornerIdx = findCornerIndex(profile, wFl);
    if (cornerIdx >= 0) corner = profile[cornerIdx];
  }
  if (!corner) return null;

  const wallPts = profile.filter((p) => p.w >= corner.w - 0.05);
  const shoulderPts = profile.filter((p) => p.w <= corner.w + 0.05);
  if (wallPts.length < 2 || shoulderPts.length < 2) return null;

  let wallLine = fitLine(wallPts);
  let shoulderLine = fitLine(shoulderPts);
  if (!wallLine || !shoulderLine) return null;
  if (Math.abs(wallLine.d.u) > 0.2) {
    wallLine = { p: { u: corner.u, w: corner.w }, d: { u: 0, w: 1 } };
  }
  if (shoulderPts.length < 3) {
    const low = profile.reduce(
      (best, p) => (p.w < corner.w && p.u < uTarget && (!best || p.w < best.w) ? p : best),
      null,
    );
    if (low) {
      const du = corner.u - low.u;
      const dw = corner.w - low.w;
      const len = Math.hypot(du, dw) || 1;
      shoulderLine = { p: { u: low.u, w: low.w }, d: { u: du / len, w: dw / len } };
    }
  }

  const wallSpan =
    Math.max(...wallPts.map((p) => p.w)) - Math.min(...wallPts.map((p) => p.w));
  const shoulderSpan =
    Math.max(...shoulderPts.map((p) => p.w)) - Math.min(...shoulderPts.map((p) => p.w));
  if (wallSpan < WALL_MIN_SPAN_MM || shoulderSpan < SHOULDER_MIN_SPAN_MM) return null;

  const metalAngle = metalInteriorAngleRad(wallLine, shoulderLine);
  const gougeDepthMm = gougeDepthForCorner(metalAngle, toolR);
  const tight =
    gougeDepthMm >= GOUGE_TIGHT_THRESHOLD_MM ||
    (metalAngle <= METAL_ANGLE_TIGHT_RAD && gougeDepthMm >= 0.008);
  if (!tight) return { tight: false };

  const reliefProfiles = buildReliefProfileAfter(profile, corner, wallLine, shoulderLine, toolR);
  const cornerPoint3 = fromPlaneCoords(corner.u, corner.w, radial, axis);
  log?.(
    `[tight-corner] tight az=${((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1)}° ` +
      `metalAngle=${((metalAngle * 180) / Math.PI).toFixed(1)}° gouge=${gougeDepthMm.toFixed(3)}mm`,
  );
  return {
    tight: true,
    finishLinePoint: fl.slice(),
    cornerPoint: cornerPoint3.slice(),
    metalInteriorAngleDeg: Math.round((metalAngle * 1800) / Math.PI) / 10,
    gougeDepthMm: Math.round(gougeDepthMm * 1000) / 1000,
    reliefProfiles,
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
  for (const fl of sampled) {
    const row = analyzeMarginAtPoint(mesh, fl, toolR, axis, log);
    if (row?.tight) samples.push(row);
  }
  const tightFinishLineSegments = buildTightFinishLineSegments(raw, samples);
  const reliefOverlay = buildTightCornerReliefOverlay(samples, axis, { toolRadiusMm: toolR });
  return {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: samples.length,
    samples: samples.map(({ reliefProfiles, ...rest }) => ({
      ...rest,
      reliefProfiles: reliefProfiles || null,
    })),
    tightFinishLineSegments,
    /** @deprecated v2 — 프리뷰는 reliefOverlay만 사용(CAM 미참조). */
    ballPassPolylines: [],
    reliefOverlay,
  };
}
