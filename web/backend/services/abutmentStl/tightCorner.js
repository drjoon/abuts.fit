// related files:
// - web/backend/services/abutmentStl/finishline.js (단면 평면·finish line 샘플)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
//
// 마진 코너(어깨↔벽)에서 D1.2 볼 엔드밀(실제 직경 1.0mm, 반경 0.5mm) 미삭제 구간을
// finish line 따라 검사하고, 피니시라인 바로 위 마진↔축면 경계의 fillet R을 재고,
// R<0.5mm이면 같은 반경의 필렛 보정면을 만든다. 검출·보정에 추가 여유는 두지 않는다.
// 보정 솔리드는 원본과 별개로 메타데이터에 담긴다. filled STL·CAM은 원본 그대로 두고,
// 뷰어에서 토글을 켰을 때만 원본 위에 빨갛게 덧입혀 보여준다.
import { Mesh, cross, meshAxisPlaneSection, normalize } from "./meshCore.js";

export const TIGHT_CORNER_VERSION = 8;
/** D1.2 볼엔드밀의 실제 절삭 직경(mm). 호칭은 1.2이고, 검출·보정 기준 반경은 0.5mm. */
export const FINISH_BALL_DIAMETER_MM = 1.0;
export const FINISH_BALL_RADIUS_MM = FINISH_BALL_DIAMETER_MM / 2;

const DIST_TOL = 1e-8;
const FL_SAMPLE_MAX = 80;
const FL_SAMPLE_MIN = 12;
/**
 * 접수 모달 검사. 한 바퀴를 이 개수로 나누고, 구간마다 가운데를 한 번 더 잰다.
 * 32곳이면 가운데까지 약 5.6° 간격이라, 8° 안쪽의 좁은 필렛도 샘플 사이에 빠지지 않는다.
 */
const PREFLIGHT_SCREEN_COUNT = 32;
/** 가운데 측정이 양 끝 보간과 이만큼 어긋나면 그 구간을 더 쪼갠다. */
const PREFLIGHT_REFINE_DEPTH = 3;
const PREFLIGHT_REFINE_R_MM = 0.03;
const PREFLIGHT_REFINE_CORNER_MM = 0.04;
/** 보정 스테이션. 피니시라인 정점마다 단면을 자르면 고해상도 STL에서 수 초가 걸린다. */
const STATION_SAMPLE_MAX = 96;
const PROFILE_W_BIN_MM = 0.06;
const PROFILE_U_MIN_MM = 0.35;
const WALL_MIN_SPAN_MM = 0.35;
const SHOULDER_MIN_SPAN_MM = 0.35;
/** 피니시라인 z와 마진 꼭짓점 z가 어긋날 수 있어 위쪽으로 넉넉히 본다. */
const CORNER_W_SEARCH_ABOVE_MM = 2.8;
const CORNER_W_SEARCH_BELOW_MM = 0.35;
/** 이 이상이면 반경 0.5mm 볼이 설계 코너를 깎지 못해 CAM 오버컷이 예상된다. */
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
 * ledgeMaxMm: 코너→피니시라인 거리. 마진 쪽은 여기서 끊는다(넘으면 마진 아래 허공에 뜬다).
 */
export function filletConcaveCorner2d(corner, rayLedge, rayWall, toolR, ledgeMaxMm = Infinity) {
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
  const ledgeMax = Number.isFinite(ledgeMaxMm) && ledgeMaxMm > 0 ? ledgeMaxMm : Infinity;
  const pts = [at(rayLedge, Math.min(trim + RELIEF_LEAD_MM, ledgeMax))];
  for (let i = 0; i <= RELIEF_ARC_STEPS; i += 1) {
    const ang = a1 + (da * i) / RELIEF_ARC_STEPS;
    const p = { u: cx + toolR * Math.cos(ang), w: cw + toolR * Math.sin(ang) };
    const along = (p.u - corner.u) * rayLedge.u + (p.w - corner.w) * rayLedge.w;
    pts.push(along > ledgeMax ? at(rayLedge, ledgeMax) : p);
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

/**
 * 묶음의 보정 단면을 3D 점으로 편다. 행마다 R을 잰 단면(기울기 축 또는 정렬 z축)의 프레임을 쓴다.
 * 다른 축 프레임에 놓으면 띠가 축 기울기만큼 돌아가 마진에서 뜨거나 묻힌다.
 * 평활은 정렬 z축 원통 좌표(반경·높이)로 하고 각 점의 둘레 각은 그대로 둔다.
 */
function reliefRun3d(run, axis, inset = 0) {
  const raw = run.map((row) => {
    const radial = Array.isArray(row.profileRadial)
      ? row.profileRadial
      : radialFromFinishPoint(row.finishLinePoint, axis);
    const ax = Array.isArray(row.profileAxis) ? row.profileAxis : axis;
    return row.reliefProfile.map(([u, w]) =>
      fromPlaneCoords(inset > 0 ? Math.max(u - inset, 0.25) : u, w, radial, ax),
    );
  });
  const n = raw.length;
  return raw.map((rowPts, i) => {
    const lo = Math.max(0, i - RELIEF_SMOOTH_HALF_WINDOW);
    const hi = Math.min(n - 1, i + RELIEF_SMOOTH_HALF_WINDOW);
    return rowPts.map((p, c) => {
      let sr = 0;
      let sz = 0;
      for (let k = lo; k <= hi; k += 1) {
        sr += Math.hypot(raw[k][c][0], raw[k][c][1]);
        sz += raw[k][c][2];
      }
      const cnt = hi - lo + 1;
      const r = Math.hypot(p[0], p[1]);
      const s = r > 1e-9 ? sr / cnt / r : 1;
      return [p[0] * s, p[1] * s, sz / cnt];
    });
  });
}

/** 프리뷰용 필렛 보정면 연속 띠. 보정 솔리드의 바깥면과 같은 면이다. */
export function buildTightCornerReliefOverlay(tightRows, axis, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const total = Number(options.sampleTotal) || 0;
  const positions = [];
  const indices = [];
  for (const { run } of reliefRuns(tightRows, total)) {
    const rows3 = reliefRun3d(run, axis);
    const cols = rows3[0].length;
    const base = positions.length / 3;
    for (const rowPts of rows3) {
      for (const p of rowPts) positions.push(round3(p[0]), round3(p[1]), round3(p[2]));
    }
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
  for (const { run } of reliefRuns(tightRows, total)) {
    const layers = [reliefRun3d(run, axis), reliefRun3d(run, axis, RELIEF_SOLID_DEPTH_MM)];
    const cols = layers[0][0].length;
    const cyclic = run.length >= total;
    const rowCount = cyclic ? run.length + 1 : run.length;
    const outerBase = positions.length / 3;
    for (const rows3 of layers) {
      for (let ri = 0; ri < rowCount; ri += 1) {
        for (const p of rows3[ri % run.length]) {
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
/** 프로파일 폴백에서 마진 초기 접선을 피팅할 최소 구간. emergence가 바로 솟는 케이스용. */
const PROFILE_MARGIN_FIT_MIN_MM = 0.12;
const WALL_FIT_MIN_MM = 0.4;
const WALL_FIT_MAX_MM = 1.4;
/** 측정 R이 공구 R보다 이 값 이상 작을 때만 보정면을 만든다. 공구 R 이상이면 통과. */
const FILLET_R_TOLERANCE_MM = 0;
/** 이보다 둔한 공기 각에서는 가상 코너 위치가 불안정해 R 기준이 깨진다. 볼 여유 부족분으로 판단한다. */
const OBTUSE_FILLET_AIR_RAD = (150 * Math.PI) / 180;

/**
 * 필렛이 공구 볼에 비해 타이트한지. 둔한 코너(공기 각 ≥150°)에서는 R 대신
 * 볼이 코너에 닿지 못해 남는 깊이(여유 부족분)가 임계(18µm)를 넘는지를 본다.
 */
function isTightFillet(measuredR, ext, toolR) {
  if (!(measuredR < toolR - FILLET_R_TOLERANCE_MM)) return false;
  if (!(ext >= OBTUSE_FILLET_AIR_RAD)) return true;
  const k = 1 / Math.sin(ext / 2) - 1;
  return toolR * k - measuredR * k > GOUGE_TIGHT_THRESHOLD_MM;
}

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
  const seq = sectionWalkAboveFl(mesh, fl, radial, axis, n);
  if (!seq || seq.length < 2) return null;
  const pts = resampleUniform(seq, PROFILE_STEP_MM).filter(
    (p) => p.w <= dot3(fl, axis) + PROFILE_UP_MM,
  );
  return pts.length >= 40 ? pts : null;
}

/** 단면 루프 정점을 FL에서 위쪽(축면) 방향으로 리샘플 없이 따라간다. */
function sectionWalkAboveFl(mesh, fl, radial, axis, n) {
  const loops = meshAxisPlaneSection(mesh, axis, [0, 0, 0], n);
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
      const last = out[out.length - 1];
      if (last && Math.hypot(u - last.u, w - last.w) < 1e-4) continue;
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
  return rise(fwd) >= rise(bwd) ? fwd : bwd;
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

const STATION_MIN_SEG_MM = 0.005;
/** 마진 직선으로 보는 첫 변 기울기 허용(도). 이보다 꺾이면 필렛 시작. */
const STATION_MARGIN_TOL_DEG = 4.5;
const STATION_WALL_REACH_MM = 2.2;
const STATION_WALL_STRAIGHT_DEG = 2.5;
/** 이보다 좁은 공기 쪽 각은 마진↔축면 필렛이 아니라 틈(브릿지 사이 등)이다. */
const STATION_MIN_AIR_DEG = 60;

/**
 * 단면 정점 그대로 마진 직선·축면 직선·필렛 R을 잰다(리샘플 없음).
 * 보정은 이 값으로 코너 근처 정점만 옮긴다.
 */
function measureFilletStation(mesh, fl, axis) {
  const radial = radialFromFinishPoint(fl, axis);
  const n = sectionNormal(radial, axis);
  if (!n) return null;
  const raw = sectionWalkAboveFl(mesh, fl, radial, axis, n);
  if (!raw || raw.length < 3) return null;
  const pts = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    const last = pts[pts.length - 1];
    if (Math.hypot(raw[i].u - last.u, raw[i].w - last.w) >= STATION_MIN_SEG_MM) pts.push(raw[i]);
  }
  const segs = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const du = pts[i + 1].u - pts[i].u;
    const dw = pts[i + 1].w - pts[i].w;
    const len = Math.hypot(du, dw);
    segs.push({
      a: pts[i],
      du: du / len,
      dw: dw / len,
      len,
      deg: (Math.atan2(dw, -du) * 180) / Math.PI,
    });
  }
  if (!segs.length || !(segs[0].deg >= -5 && segs[0].deg <= MARGIN_FIT_MAX_DEG)) return null;

  let wallStart = -1;
  for (let i = 1; i < segs.length && wallStart < 0; i += 1) {
    if (segs[i].deg < WALL_MIN_DEG) continue;
    let span = 0;
    for (let j = i; j < segs.length && segs[j].deg >= WALL_MIN_DEG; j += 1) span += segs[j].len;
    if (span >= WALL_MIN_SPAN_MM) wallStart = i;
  }
  if (wallStart < 0) return null;
  const wFl = pts[0].w;
  const wallSegs = segs
    .slice(wallStart)
    .filter((s) => s.deg >= WALL_MIN_DEG && s.a.w <= wFl + STATION_WALL_REACH_MM);
  if (!wallSegs.length) return null;
  const maxWallDeg = Math.max(...wallSegs.map((s) => s.deg));
  const straightWall = wallSegs.filter((s) => s.deg >= maxWallDeg - STATION_WALL_STRAIGHT_DEG);
  const wRef = straightWall[0];
  let wdu = 0;
  let wdw = 0;
  for (const s of straightWall) {
    wdu += s.du * s.len;
    wdw += s.dw * s.len;
  }
  const wl = Math.hypot(wdu, wdw);
  wdu /= wl;
  wdw /= wl;

  let mdu = 0;
  let mdw = 0;
  let filletStartIdx = 1;
  for (let i = 0; i < wallStart; i += 1) {
    if (segs[i].deg > segs[0].deg + STATION_MARGIN_TOL_DEG) break;
    mdu += segs[i].du * segs[i].len;
    mdw += segs[i].dw * segs[i].len;
    filletStartIdx = i + 1;
  }
  const ml = Math.hypot(mdu, mdw);
  mdu /= ml;
  mdw /= ml;

  const det = mdu * wdw - mdw * wdu;
  if (!(det < -0.05)) return null;
  const tm = ((wRef.a.u - pts[0].u) * wdw - (wRef.a.w - pts[0].w) * wdu) / det;
  const corner = { u: pts[0].u + mdu * tm, w: pts[0].w + mdw * tm };
  const rayLedge = { u: -mdu, w: -mdw };
  const rayWall = { u: wdu, w: wdw };
  const ext = Math.acos(clamp(rayLedge.u * rayWall.u + rayLedge.w * rayWall.w, -1, 1));
  if (!(ext > (STATION_MIN_AIR_DEG * Math.PI) / 180) || ext > (168 * Math.PI) / 180) return null;
  let dMin = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    dMin = Math.min(dMin, pointSegDist(corner, pts[i], pts[i + 1]));
  }
  const dist = (p) => Math.hypot(p.u - corner.u, p.w - corner.w);
  return {
    axis,
    radial,
    uFl: pts[0].u,
    wFl,
    corner,
    rayLedge,
    rayWall,
    ext,
    measuredR: dMin / (1 / Math.sin(ext / 2) - 1),
    distFl: dist(pts[0]),
    oldTrimL: dist(pts[filletStartIdx]),
    oldTrimW: dist(wRef.a),
  };
}

/**
 * 기울기 축과 정렬 z축 단면 중 R이 큰 쪽. 디자인 자오선에서 비스듬히 자른 단면은 R을 작게 잰다.
 */
function bestFilletStation(mesh, fl, axis) {
  const a = measureFilletStation(mesh, fl, axis);
  if (dot3(axis, [0, 0, 1]) >= 1 - 1e-9) return a;
  const z = measureFilletStation(mesh, fl, [0, 0, 1]);
  if (!a || !z) return a || z;
  return z.measuredR >= a.measuredR ? z : a;
}

/**
 * 리샘플 단면 프로파일에서 접선각으로 마진 점근선·축면 직선을 PCA 피팅해 재는 폴백 측정.
 * 단면 정점을 그대로 쓰는 measureFilletStation은 FL에서 바로 솟는 emergence 프로파일에서
 * 첫 변 각도 조건에 걸려 자주 실패한다. 검출과 보정이 같은 값을 보도록 여기서 함께 쓴다.
 * @returns {object|null} measureFilletStation과 같은 모양의 스테이션
 */
function measureProfileFilletStation(mesh, fl, axis, onSkip) {
  const radial = radialFromFinishPoint(fl, axis);
  const n = sectionNormal(radial, axis);
  if (!n) return null;
  const pts = extractProfileAboveFl(mesh, fl, radial, axis, n);
  if (!pts) {
    onSkip?.("no-profile");
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
  if (iw < 0) {
    onSkip?.("wall-not-found");
    return null;
  }

  // 마진 점근선: FL에서 시작해 접선각이 MARGIN_FIT_MAX_DEG를 처음 넘는 지점까지.
  let mEnd = H;
  while (mEnd < iw && phi[mEnd] != null && phi[mEnd] <= MARGIN_FIT_MAX_DEG) mEnd += 1;
  if (mEnd <= H) {
    onSkip?.("margin-not-found");
    return null;
  }

  const excl = Math.round(JUNCTION_EXCLUDE_MM * stepsPerMm);
  const marginPts = pts.slice(2, mEnd);
  const wallEnd = Math.min(pts.length, iw + Math.round(WALL_FIT_MAX_MM * stepsPerMm));
  const wallPts = pts.slice(iw + excl, wallEnd);
  if (
    // emergence가 FL에서 바로 솟으면 직선 마진 구간이 0.25mm에 못 미친다. 초기 접선 피팅은 0.12mm면 된다.
    marginPts.length < PROFILE_MARGIN_FIT_MIN_MM * stepsPerMm ||
    wallPts.length < MARGIN_FIT_MIN_MM * stepsPerMm
  ) {
    onSkip?.("fit-span-short");
    return null;
  }

  const lm = pcaLine(marginPts);
  const lw = pcaLine(wallPts);
  const det = lm.d.u * lw.d.w - lm.d.w * lw.d.u;
  // 오목(공기 쪽이 벌어진) 코너만: 마진→축면 회전이 시계 방향.
  if (!(det < -0.05)) {
    onSkip?.("not-concave");
    return null;
  }
  const du = lw.p.u - lm.p.u;
  const dw = lw.p.w - lm.p.w;
  const tm = (du * lw.d.w - dw * lw.d.u) / det;
  const corner = { u: lm.p.u + lm.d.u * tm, w: lm.p.w + lm.d.w * tm };
  const near = Math.hypot(corner.u - pts[iw].u, corner.w - pts[iw].w);
  if (!Number.isFinite(near) || near > 1.5) {
    onSkip?.("corner-far");
    return null;
  }

  const rayLedge = { u: -lm.d.u, w: -lm.d.w };
  const rayWall = { u: lw.d.u, w: lw.d.w };
  const ext = Math.acos(clamp(rayLedge.u * rayWall.u + rayLedge.w * rayWall.w, -1, 1));
  if (!(ext > (30 * Math.PI) / 180) || ext > (168 * Math.PI) / 180) {
    onSkip?.("wedge-angle");
    return null;
  }

  const k = 1 / Math.sin(ext / 2) - 1;
  const from = Math.max(0, mEnd - 10);
  const to = Math.min(pts.length - 1, iw + 10);
  let dMin = Infinity;
  for (let i = from; i < to; i += 1) {
    dMin = Math.min(dMin, pointSegDist(corner, pts[i], pts[i + 1]));
  }
  const dist = (p) => Math.hypot(p.u - corner.u, p.w - corner.w);
  const wallFitStart = pts[Math.min(pts.length - 1, iw + excl)];
  return {
    axis,
    radial,
    uFl: pts[0].u,
    wFl: pts[0].w,
    corner,
    rayLedge,
    rayWall,
    ext,
    measuredR: dMin / k,
    distFl: dist(pts[0]),
    oldTrimL: dist(pts[mEnd]),
    oldTrimW: dist(wallFitStart),
  };
}

/**
 * 피니시라인 바로 위, 마진(수평에 가까움)↔축면(수직에 가까움) 경계의 fillet R을 잰다.
 * R < 공구 R이면 공구 R 필렛 보정면 단면(reliefProfile)을 돌려준다. 메시는 바꾸지 않는다.
 */
export function analyzeMarginAtPoint(mesh, fl, toolR, axis, log, measureOptions = {}) {
  const radial = radialFromFinishPoint(fl, axis);
  const n = sectionNormal(radial, axis);
  if (!n) return null;
  const no = (why) => {
    log?.(`[tight-corner] skip: ${why}`);
    return { tight: false };
  };
  const azDeg = ((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1);
  const station = measureOptions.singleAxis
    ? measureFilletStation(mesh, fl, axis)
    : bestFilletStation(mesh, fl, axis);
  if (station) {
    const { corner, rayLedge, rayWall, ext, measuredR } = station;
    if (!isTightFillet(measuredR, ext, toolR)) {
      log?.(`[tight-corner] ok az=${azDeg}° R=${measuredR.toFixed(3)}mm`);
      return {
        tight: false,
        filletRadiusMm: Math.round(Math.max(0, measuredR) * 1000) / 1000,
      };
    }
    const reliefProfile = filletConcaveCorner2d(corner, rayLedge, rayWall, toolR, station.distFl);
    if (!reliefProfile) return no("relief-null");
    log?.(`[tight-corner] tight az=${azDeg}° R=${measuredR.toFixed(3)}mm<${toolR}`);
    return {
      tight: true,
      finishLinePoint: fl.slice(),
      cornerPoint: fromPlaneCoords(corner.u, corner.w, station.radial, station.axis).slice(),
      airAngleDeg: Math.round((ext * 1800) / Math.PI) / 10,
      filletRadiusMm: Math.round(Math.max(0, measuredR) * 1000) / 1000,
      reliefProfile,
      profileAxis: station.axis.slice(),
      profileRadial: station.radial.slice(),
    };
  }
  let skipReason = null;
  const prof = measureProfileFilletStation(mesh, fl, axis, (why) => {
    skipReason = why;
  });
  if (!prof) {
    if (skipReason === "no-profile") {
      log?.("[tight-corner] skip: no-profile");
      return null;
    }
    return no(skipReason || "no-profile");
  }
  const { corner, rayLedge, rayWall, ext, measuredR } = prof;
  if (!isTightFillet(measuredR, ext, toolR)) {
    log?.(
      `[tight-corner] ok az=${((Math.atan2(fl[1], fl[0]) * 180) / Math.PI).toFixed(1)}° R=${measuredR.toFixed(3)}mm`,
    );
    return {
      tight: false,
      filletRadiusMm: Math.round(Math.max(0, measuredR) * 1000) / 1000,
    };
  }

  const reliefProfile = filletConcaveCorner2d(corner, rayLedge, rayWall, toolR, prof.distFl);
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
    profileAxis: axis.slice(),
    profileRadial: radial.slice(),
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
function finishLinePointsValid(finishLinePoints) {
  return (Array.isArray(finishLinePoints) ? finishLinePoints : [])
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));
}

/** 닫힌 피니시라인에서 분수 위치(0~1)의 점. 인덱스 간격으로 보간한다. */
function finishLineAtFraction(points, fraction) {
  const n = points.length;
  const wrapped = ((fraction % 1) + 1) % 1;
  const t = wrapped * n;
  const i0 = Math.floor(t) % n;
  const i1 = (i0 + 1) % n;
  const f = t - Math.floor(t);
  const a = points[i0];
  const b = points[i1];
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
}

function filletRadiusOf(row) {
  const r = Number(row?.filletRadiusMm);
  return Number.isFinite(r) ? r : null;
}

/**
 * 접수 모달용. finish line 한 바퀴를 {@link PREFLIGHT_SCREEN_COUNT}곳만 잰다(추가 refine 없음).
 * 지연을 줄이기 위해 32점만 쓰고, 보정 STL·제조사 준비는 전체 검사를 따로 돌린다.
 */
function collectScreenSamples(mesh, finishLinePoints, options = {}) {
  const toolR = Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const axis = normalizeAxis(options.tiltAxisVector);
  const raw = finishLinePointsValid(finishLinePoints);
  if (raw.length < FL_SAMPLE_MIN) return { toolR, axis, raw, sampled: [], samples: [] };
  const measure = (fl) =>
    analyzeMarginAtPoint(mesh, fl, toolR, axis, options.log, { singleAxis: true });
  const sampled = [];
  const samples = [];
  for (let i = 0; i < PREFLIGHT_SCREEN_COUNT; i += 1) {
    const fl = finishLineAtFraction(raw, i / PREFLIGHT_SCREEN_COUNT);
    sampled.push(fl);
    const row = measure(fl);
    if (row?.tight) samples.push({ ...row, sampleIndex: i });
  }
  return { toolR, axis, raw, sampled, samples };
}

function collectTightSamples(mesh, finishLinePoints, options = {}) {
  const toolR = Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const axis = normalizeAxis(options.tiltAxisVector);
  const raw = finishLinePointsValid(finishLinePoints);
  if (raw.length < FL_SAMPLE_MIN) return { toolR, axis, raw, sampled: [], samples: [] };
  const sampled = resampleFinishLine(raw, FL_SAMPLE_MAX);
  const samples = [];
  sampled.forEach((fl, sampleIndex) => {
    const row = analyzeMarginAtPoint(mesh, fl, toolR, axis, options.log);
    if (row?.tight) samples.push({ ...row, sampleIndex });
  });
  return { toolR, axis, raw, sampled, samples };
}

function tightCornerMeta({ toolR, axis, raw, sampled, samples }, { solids = true, preview = false } = {}) {
  const showOverlay = solids || preview;
  const rValues = samples
    .map((s) => Number(s.filletRadiusMm))
    .filter((v) => Number.isFinite(v));
  const meta = {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: samples.length,
    /** 타이트 샘플 전체의 현재 fillet R 평균(mm). 타이트 없으면 null. */
    averageFilletRadiusMm: rValues.length
      ? Math.round((rValues.reduce((a, b) => a + b, 0) / rValues.length) * 1000) / 1000
      : null,
    samples: samples.map(({ reliefProfile, profileAxis, profileRadial, ...rest }) => rest),
    tightFinishLineSegments: buildTightFinishLineSegments(raw, samples),
    /** @deprecated v2 — 프리뷰는 reliefOverlay만 사용. */
    ballPassPolylines: [],
    reliefOverlay: showOverlay
      ? buildTightCornerReliefOverlay(samples, axis, {
          toolRadiusMm: toolR,
          sampleTotal: sampled.length,
        })
      : null,
    /**
     * 원본과 별개인 보정 솔리드(닫힌 메시). filled STL에는 넣지 않는다.
     * 뷰어 토글 ON일 때만 원본 위에 빨갛게 덧입혀 보여준다.
     * 접수 전 검사는 보정 필렛 면만 쓰므로 솔리드를 만들지 않는다.
     */
    correctionSolid: solids
      ? buildTightCornerReliefSolid(samples, axis, {
          toolRadiusMm: toolR,
          sampleTotal: sampled.length,
        })
      : null,
  };
  const solidLen = Number(meta.correctionSolid?.positions?.length);
  const overlayLen = Number(meta.reliefOverlay?.positions?.length);
  meta.needsCorrectionReview =
    meta.tightCount > 0 &&
    ((Number.isFinite(solidLen) && solidLen > 0) ||
      (Number.isFinite(overlayLen) && overlayLen > 0));
  return meta;
}

export function detectTightCorners(mesh, finishLinePoints, options = {}) {
  const screen = Boolean(options.screen);
  const collected = screen
    ? collectScreenSamples(mesh, finishLinePoints, options)
    : collectTightSamples(mesh, finishLinePoints, options);
  return tightCornerMeta(collected, {
    solids: !screen && options.solids !== false,
    preview: screen,
  });
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

/** 보정 필렛 R = 공구 R + 이 여유(mm). 기준은 공구 반경 0.5mm이고 추가 여유는 없다. */
export const CORRECTION_FILLET_MARGIN_MM = 0;
/** 이보다 벌어진 측정 구간 사이는 보간하지 않고 건드리지 않는다. */
const STATION_MAX_GAP_RAD = 0.6;
/** 비연속 스테이션 구간 양 끝에서 변위를 0으로 줄이는 각도 폭(라디안). */
const STATION_GAP_RAMP_RAD = 0.16;
/** 스테이션 접선 방향(rayLedge·rayWall) 둘레 평활 반창. */
const STATION_RAY_SMOOTH_HALF_WINDOW = 3;
const STATION_RAY_SMOOTH_MAX_GAP_RAD = 0.35;
/** 마진 끝(FL)에 남겨 둘 직선 마진 길이(mm). */
const LEDGE_KEEP_MM = 0.025;
const ON_LINE_EPS_MM = 0.005;
/** 필렛 부채꼴 내 최대 각도 비율이 이보다 작으면(긴 단일 축면·마진 삼각형) 접점까지 각도를 늘린다. */
const SPARSE_SECTOR_RATIO_MAX = 0.78;

function smoothstep01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function norm2(v) {
  const l = Math.hypot(v.u, v.w) || 1;
  return { u: v.u / l, w: v.w / l };
}

function withFilletTarget(st, targetR) {
  const bis = norm2({ u: st.rayLedge.u + st.rayWall.u, w: st.rayLedge.w + st.rayWall.w });
  const ext = Math.acos(clamp(st.rayLedge.u * st.rayWall.u + st.rayLedge.w * st.rayWall.w, -1, 1));
  const cd = targetR / Math.sin(ext / 2);
  return {
    ...st,
    bis,
    ext,
    trim: targetR / Math.tan(ext / 2),
    cd,
    center: { u: st.corner.u + bis.u * cd, w: st.corner.w + bis.w * cd },
  };
}

/**
 * 스테이션 간 단면 삼각형 대각선 분할로 생기는 rayLedge·rayWall 각도 떨림을 둘레 방향으로 평활하고,
 * 비연속 구간(gap) 경계에서 변위가 갑자기 끊기지 않게 가중치(blend)를 부여한다.
 */
function smoothStationsForCorrection(stations, halfWindow = STATION_RAY_SMOOTH_HALF_WINDOW) {
  const n = stations.length;
  if (!n) return stations;
  const gapAngles = [];
  for (let k = 0; k < n; k += 1) {
    const a = stations[k];
    const b = stations[(k + 1) % n];
    const span = k === n - 1 ? b.theta + Math.PI * 2 - a.theta : b.theta - a.theta;
    if (span > STATION_MAX_GAP_RAD) gapAngles.push(a.theta, b.theta);
  }
  return stations.map((st, i) => {
    const wAnchorU = st.corner.u + st.rayWall.u * st.oldTrimW;
    const wAnchorW = st.corner.w + st.rayWall.w * st.oldTrimW;
    let lu = 0;
    let lw = 0;
    let wu = 0;
    let ww = 0;
    for (let d = -halfWindow; d <= halfWindow; d += 1) {
      const j = (i + d + n) % n;
      let da = Math.abs(stations[j].theta - st.theta);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > STATION_RAY_SMOOTH_MAX_GAP_RAD) continue;
      const w = halfWindow + 1 - Math.abs(d);
      lu += w * stations[j].rayLedge.u;
      lw += w * stations[j].rayLedge.w;
      wu += w * stations[j].rayWall.u;
      ww += w * stations[j].rayWall.w;
    }
    const rayLedge = norm2({ u: lu, w: lw });
    const rayWall = norm2({ u: wu, w: ww });
    const mdu = -rayLedge.u;
    const mdw = -rayLedge.w;
    const wdu = rayWall.u;
    const wdw = rayWall.w;
    const det = mdu * wdw - mdw * wdu;
    let minGapD = Infinity;
    for (const g of gapAngles) {
      let d = Math.abs(st.theta - g);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < minGapD) minGapD = d;
    }
    const blend = gapAngles.length ? smoothstep01(minGapD / STATION_GAP_RAMP_RAD) : 1;
    if (!(det < -0.05)) return { ...st, blend };
    const tm = ((wAnchorU - st.uFl) * wdw - (wAnchorW - st.wFl) * wdu) / det;
    const corner = { u: st.uFl + mdu * tm, w: st.wFl + mdw * tm };
    const ext = Math.acos(clamp(rayLedge.u * rayWall.u + rayLedge.w * rayWall.w, -1, 1));
    return {
      ...st,
      corner,
      rayLedge,
      rayWall,
      ext,
      distFl: Math.hypot(st.uFl - corner.u, st.wFl - corner.w),
      oldTrimW: Math.hypot(wAnchorU - corner.u, wAnchorW - corner.w),
      blend,
    };
  });
}

function stationAtTheta(stations, theta, targetR) {
  const n = stations.length;
  for (let k = 0; k < n; k += 1) {
    const a = stations[k];
    const b = stations[(k + 1) % n];
    if (!a || !b) continue;
    const span = k === n - 1 ? b.theta + Math.PI * 2 - a.theta : b.theta - a.theta;
    let off = theta - a.theta;
    while (off < 0) off += Math.PI * 2;
    if (off > span + 1e-12) continue;
    if (span > STATION_MAX_GAP_RAD) return null;
    const t = span > 1e-9 ? off / span : 0;
    const lerp = (x, y) => x + t * (y - x);
    const lerp2 = (p, q) => ({ u: lerp(p.u, q.u), w: lerp(p.w, q.w) });
    return {
      ...withFilletTarget(
        {
          uFl: lerp(a.uFl, b.uFl),
          wFl: lerp(a.wFl, b.wFl),
          distFl: lerp(a.distFl, b.distFl),
          oldTrimL: lerp(a.oldTrimL, b.oldTrimL),
          oldTrimW: lerp(a.oldTrimW, b.oldTrimW),
          corner: lerp2(a.corner, b.corner),
          rayLedge: norm2(lerp2(a.rayLedge, b.rayLedge)),
          rayWall: norm2(lerp2(a.rayWall, b.rayWall)),
        },
        targetR,
      ),
      blend: lerp(a.blend ?? 1, b.blend ?? 1),
      measuredR: lerp(a.measuredR ?? targetR, b.measuredR ?? targetR),
    };
  }
  return null;
}

/** 보정 목표면을 만들 스테이션 필드의 균일 그리드 간격·평활 횟수. */
const CORRECTION_FIELD_GRID = 720;
const CORRECTION_FIELD_SMOOTH_RADIUS = 2;
const CORRECTION_FIELD_SMOOTH_PASSES = 2;

/**
 * 스테이션을 촘촘한 균일 각도 그리드로 옮기고 둘레 방향으로 평활한다.
 * 스테이션 사이를 곧바로 이으면 코너·원 중심 경로가 스테이션 간격마다 꺾여
 * 투영된 띠 표면에 그 꺾임이 그대로 찍힌다. 목표면 자체를 매끄럽게 만들기 위함이다.
 * 측정 공백(gap)에 걸친 그리드 칸은 비워 둔다.
 */
function resampleStationField(stations) {
  const n = stations.length;
  if (n < 3) return stations;
  const N = CORRECTION_FIELD_GRID;
  const grid = new Array(N).fill(null);
  // 스테이션 각도 프레임(첫 스테이션 각도에서 한 바퀴)에 그리드를 맞춘다.
  const t0 = stations[0].theta;
  let j = 0;
  for (let g = 0; g < N; g += 1) {
    const theta = t0 + (g / N) * Math.PI * 2;
    while (j < n - 1 && stations[j + 1].theta <= theta) j += 1;
    const a = stations[j];
    const b = stations[(j + 1) % n];
    const bTheta = j === n - 1 ? b.theta + Math.PI * 2 : b.theta;
    const span = bTheta - a.theta;
    if (span > STATION_MAX_GAP_RAD || !(span > 1e-9)) continue;
    const off = theta - a.theta;
    if (off < -1e-12 || off > span + 1e-12) continue;
    const t = Math.min(1, Math.max(0, off / span));
    const lerp = (x, y) => x + t * (y - x);
    const corner = { u: lerp(a.corner.u, b.corner.u), w: lerp(a.corner.w, b.corner.w) };
    const rayWall = norm2({ u: lerp(a.rayWall.u, b.rayWall.u), w: lerp(a.rayWall.w, b.rayWall.w) });
    const oldTrimW = lerp(a.oldTrimW, b.oldTrimW);
    grid[g] = {
      theta,
      uFl: lerp(a.uFl, b.uFl),
      wFl: lerp(a.wFl, b.wFl),
      oldTrimL: lerp(a.oldTrimL, b.oldTrimL),
      oldTrimW,
      corner,
      // 벽 직선 위 앵커. 코너는 평활 뒤 이 앵커와 광선으로 다시 계산한다.
      anchor: { u: corner.u + rayWall.u * oldTrimW, w: corner.w + rayWall.w * oldTrimW },
      rayLedge: norm2({ u: lerp(a.rayLedge.u, b.rayLedge.u), w: lerp(a.rayLedge.w, b.rayLedge.w) }),
      rayWall,
      measuredR: lerp(a.measuredR ?? 0, b.measuredR ?? 0),
      blend: lerp(a.blend ?? 1, b.blend ?? 1),
    };
  }
  const scalars = [
    (s) => s.uFl, (s) => s.wFl, (s) => s.oldTrimL,
    (s) => s.measuredR, (s) => s.blend, (s) => s.corner.u, (s) => s.corner.w,
    (s) => s.anchor.u, (s) => s.anchor.w,
    (s) => s.rayLedge.u, (s) => s.rayLedge.w, (s) => s.rayWall.u, (s) => s.rayWall.w,
  ];
  const setters = [
    (s, v) => { s.uFl = v; }, (s, v) => { s.wFl = v; }, (s, v) => { s.oldTrimL = v; },
    (s, v) => { s.measuredR = v; }, (s, v) => { s.blend = v; }, (s, v) => { s.corner.u = v; }, (s, v) => { s.corner.w = v; },
    (s, v) => { s.anchor.u = v; }, (s, v) => { s.anchor.w = v; },
    (s, v) => { s.rayLedge.u = v; }, (s, v) => { s.rayLedge.w = v; },
    (s, v) => { s.rayWall.u = v; }, (s, v) => { s.rayWall.w = v; },
  ];
  for (let pass = 0; pass < CORRECTION_FIELD_SMOOTH_PASSES; pass += 1) {
    for (let f = 0; f < scalars.length; f += 1) {
      const src = grid.map((s) => (s ? scalars[f](s) : null));
      for (let g = 0; g < N; g += 1) {
        if (!grid[g]) continue;
        let sum = 0;
        let cnt = 0;
        for (let d = -CORRECTION_FIELD_SMOOTH_RADIUS; d <= CORRECTION_FIELD_SMOOTH_RADIUS; d += 1) {
          const v = src[(g + d + N) % N];
          if (v == null) continue;
          sum += v;
          cnt += 1;
        }
        if (cnt) setters[f](grid[g], sum / cnt);
      }
    }
  }
  for (const s of grid) {
    if (!s) continue;
    s.rayLedge = norm2(s.rayLedge);
    s.rayWall = norm2(s.rayWall);
    // 코너 = 렛지 직선(FL점, -rayLedge)과 벽 직선(앵커, rayWall)의 교점. 따로 평활한 코너를 쓰면
    // 광선과 어긋나 부채꼴 판정이 깨진다.
    const mdu = -s.rayLedge.u;
    const mdw = -s.rayLedge.w;
    const det = mdu * s.rayWall.w - mdw * s.rayWall.u;
    if (det < -0.05) {
      const tm = ((s.anchor.u - s.uFl) * s.rayWall.w - (s.anchor.w - s.wFl) * s.rayWall.u) / det;
      s.corner = { u: s.uFl + mdu * tm, w: s.wFl + mdw * tm };
    }
    s.distFl = Math.hypot(s.uFl - s.corner.u, s.wFl - s.corner.w);
    s.oldTrimW = Math.hypot(s.anchor.u - s.corner.u, s.anchor.w - s.corner.w);
    delete s.anchor;
  }
  return grid;
}

/**
 * 점 (u, w)가 필렛 부채꼴(두 접선 사이) 안에 있으면 중심 기준 거리·각도 정보를 돌려준다.
 * 원호보다 안쪽(d < targetR)에 있는 점도 포함한다. 그래야 성긴 메시에서도 원호가 실제로 만들어진다.
 */
function filletSectorCoords(st, u, w, targetR) {
  if (st.oldTrimL < 0.01 && st.oldTrimW < 0.01) return null;
  if (w <= st.wFl + ON_LINE_EPS_MM || u >= st.uFl - ON_LINE_EPS_MM) return null;
  const cu = u - st.corner.u;
  const cw = w - st.corner.w;
  const cLen = Math.hypot(cu, cw);
  if (cLen < 1e-3) return null;
  const vx = u - st.center.u;
  const vw = w - st.center.w;
  const d = Math.hypot(vx, vw);
  if (d > st.cd + 0.08) return null;
  if (vx * st.rayLedge.u + vw * st.rayLedge.w >= 0) return null;
  if (vx * st.rayWall.u + vw * st.rayWall.w >= 0) return null;
  const effTrimL = Math.min(st.trim, st.distFl - LEDGE_KEEP_MM);
  if (effTrimL <= 0.02) return null;
  const binU = -st.bis.u;
  const binW = -st.bis.w;
  const bperpU = -st.bis.w;
  const bperpW = st.bis.u;
  const signW = st.rayWall.u * bperpU + st.rayWall.w * bperpW >= 0 ? 1 : -1;
  const pU = bperpU * signW;
  const pW = bperpW * signW;
  const alpha = Math.atan2(vx * pU + vw * pW, vx * binU + vw * binW);
  const alphaW = (Math.PI - st.ext) / 2;
  const alphaL = alphaW - Math.atan2(Math.max(0, st.trim - effTrimL), targetR);
  return { vx, vw, d, binU, binW, pU, pW, alpha, alphaW, alphaL };
}

/** 보정 뒤 재측정으로 다시 투영하는 추가 횟수. 깊은 코너는 재측정 코너가 원호를 따라와 여러 번에 나눠 수렴한다. */
const CORRECTION_REFIT_PASSES = 4;
/** 재투영에서 목표 R에 더하는 양. 재측정 평형점이 목표보다 낮게 잡히는 만큼만 올린다. */
const CORRECTION_REFIT_TARGET_BONUS_MM = 0.05;
/** 마무리 뒤 재투영에서 목표 R에 더하는 양. 마무리가 당긴 dip을 다시 여유 있게 올린다. */
const CORRECTION_FINAL_TARGET_BONUS_MM = 0.08;
/** 보정 트리거 헤드룸. 재검사가 낮게 읽는 편차만큼 목표보다 먼저 손댄다. */
const CORRECTION_TRIGGER_HEADROOM_MM = 0.03;
/** 보정 원호를 만들 코너 띠 세분화 기준. 이보다 긴 모서리를 가진 띠 삼각형은 나눈다. */
const CORRECTION_SUBDIVIDE_EDGE_MM = 0.06;
/** 코너를 가로지르는 바깥 간선의 세분화 기준. 원호 자체보다 성겨도 된다. */
const CORRECTION_SUBDIVIDE_HALO_EDGE_MM = 0.075;
const CORRECTION_SUBDIVIDE_ROUNDS = 2;
/** 세분화로 면이 입력의 이 배수를 넘으면 더 나누지 않는다(거친 합성 메시 등 병적 입력 방지). */
const CORRECTION_SUBDIVIDE_MAX_GROWTH = 3;

/**
 * 코너 부채꼴에 닿은 삼각형만 골라 모서리 가운데점으로 나눈 작업 메시.
 * 성긴 원본 정점만 원호에 투영하면 단면이 현(chord)으로 잘려 재측정 R이 그대로 타이트로 남는다.
 * 나눈 모서리는 이웃 면과 같은 중점을 공유한다(T-정션 금지). 그래야 단면 루프·닫힌 솔리드·
 * 뒤집힘 판정이 원본 메시와 같은 방식으로 동작한다.
 * 나눈 면이 어느 원본 면에서 왔는지(parent)도 돌려준다(뒤집힌 면 되돌리기용).
 */
function subdivideCornerBand(mesh, stations, frame, axis, targetR) {
  const verts = Array.from(mesh.verts);
  let faces = Array.from(mesh.faces);
  let parent = Array.from({ length: mesh.faceCount }, (_, fi) => fi);
  const inBand = (vi) => {
    const p = [verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]];
    const w = dot3(p, axis);
    const radialVec = sub3(p, scale3(axis, w));
    const u = Math.hypot(radialVec[0], radialVec[1], radialVec[2]);
    if (u < 0.2) return false;
    const st = stationAtTheta(stations, thetaAboutAxis(p, axis, frame), targetR);
    if (!st) return false;
    if (!(targetR - (st.measuredR ?? targetR) > 0)) return false;
    return Boolean(filletSectorCoords(st, u, w, targetR));
  };
  const edgeLen = (a, b) =>
    Math.hypot(verts[a * 3] - verts[b * 3], verts[a * 3 + 1] - verts[b * 3 + 1], verts[a * 3 + 2] - verts[b * 3 + 2]);
  const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let round = 0; round < CORRECTION_SUBDIVIDE_ROUNDS; round += 1) {
    const bandCache = new Map();
    const band = (vi) => {
      if (!bandCache.has(vi)) bandCache.set(vi, inBand(vi));
      return bandCache.get(vi);
    };
    // 띠 면의 긴 모서리를 전역으로 표시한다. 이웃 면도 같은 모서리를 나눠 물린다.
    // 정점이 모두 부채꼴 밖에 있어도 간선이 코너를 가로지르면 함께 표시한다.
    // 그런 거친 삼각형이 남으면 원호를 현으로 자르거나 투영 때 접힌다.
    const nearCorner = (a, b) => {
      const mx = (verts[a * 3] + verts[b * 3]) / 2;
      const my = (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2;
      const mz = (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2;
      const p = [mx, my, mz];
      const w = dot3(p, axis);
      const radialVec = sub3(p, scale3(axis, w));
      const u = Math.hypot(radialVec[0], radialVec[1], radialVec[2]);
      if (u < 0.2) return false;
      const st = stationAtTheta(stations, thetaAboutAxis(p, axis, frame), targetR);
      if (!st) return false;
      if (!(targetR - (st.measuredR ?? targetR) > 0)) return false;
      return Math.hypot(u - st.corner.u, w - st.corner.w) < targetR * 0.7 + 0.02;
    };
    const marked = new Set();
    for (let fi = 0; fi < faces.length / 3; fi += 1) {
      const a = faces[fi * 3];
      const b = faces[fi * 3 + 1];
      const c = faces[fi * 3 + 2];
      const inFace = band(a) || band(b) || band(c);
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const len = edgeLen(x, y);
        if (inFace) {
          if (len > CORRECTION_SUBDIVIDE_EDGE_MM) marked.add(edgeKey(x, y));
        } else if (len > CORRECTION_SUBDIVIDE_HALO_EDGE_MM && nearCorner(x, y)) {
          // 코너를 가로지르는 간선만 성기게 나눠도 현으로 잘리는 문제는 막을 수 있다.
          marked.add(edgeKey(x, y));
        }
      }
    }
    if (!marked.size) break;
    const vertsBeforeRound = verts.length;
    const midCache = new Map();
    const midpoint = (a, b) => {
      const key = edgeKey(a, b);
      let idx = midCache.get(key);
      if (idx == null) {
        idx = verts.length / 3;
        verts.push(
          (verts[a * 3] + verts[b * 3]) / 2,
          (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2,
          (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2,
        );
        midCache.set(key, idx);
      }
      return idx;
    };
    const nextFaces = [];
    const nextParent = [];
    const capFaces = mesh.faceCount * CORRECTION_SUBDIVIDE_MAX_GROWTH;
    // 표시된 모서리 개수별 맞물림 분할 패턴. 팬 분할은 공선(0-면적) 삼각형을 만들어 쓰지 않는다.
    const pushTri = (x, y, z, p) => {
      nextFaces.push(x, y, z);
      nextParent.push(p);
    };
    const totalFaces = faces.length / 3;
    for (let fi = 0; fi < totalFaces; fi += 1) {
      const v0 = faces[fi * 3];
      const v1 = faces[fi * 3 + 1];
      const v2 = faces[fi * 3 + 2];
      const p = parent[fi];
      const m0 = marked.has(edgeKey(v0, v1)) ? midpoint(v0, v1) : -1;
      const m1 = marked.has(edgeKey(v1, v2)) ? midpoint(v1, v2) : -1;
      const m2 = marked.has(edgeKey(v2, v0)) ? midpoint(v2, v0) : -1;
      if (m0 < 0 && m1 < 0 && m2 < 0) pushTri(v0, v1, v2, p);
      else if (m0 >= 0 && m1 < 0 && m2 < 0) { pushTri(v0, m0, v2, p); pushTri(m0, v1, v2, p); }
      else if (m1 >= 0 && m0 < 0 && m2 < 0) { pushTri(v1, m1, v0, p); pushTri(m1, v2, v0, p); }
      else if (m2 >= 0 && m0 < 0 && m1 < 0) { pushTri(v2, m2, v1, p); pushTri(m2, v0, v1, p); }
      else if (m0 >= 0 && m1 >= 0 && m2 < 0) { pushTri(v0, m0, v2, p); pushTri(m0, m1, v2, p); pushTri(m0, v1, m1, p); }
      else if (m1 >= 0 && m2 >= 0 && m0 < 0) { pushTri(v1, m1, v0, p); pushTri(m1, m2, v0, p); pushTri(m1, v2, m2, p); }
      else if (m2 >= 0 && m0 >= 0 && m1 < 0) { pushTri(v2, m2, v1, p); pushTri(m2, m0, v1, p); pushTri(m2, v0, m0, p); }
      else {
        pushTri(v0, m0, m2, p);
        pushTri(m0, v1, m1, p);
        pushTri(m2, m1, v2, p);
        pushTri(m0, m1, m2, p);
      }
    }
    if (nextFaces.length / 3 > capFaces) {
      // 상한을 넘는 라운드는 통째로 버린다(부분 분할은 맞물림을 깨뜨린다).
      verts.length = vertsBeforeRound;
      break;
    }
    faces = nextFaces;
    parent = nextParent;
  }
  return {
    mesh: new Mesh(Float64Array.from(verts), Int32Array.from(faces)),
    parent: Int32Array.from(parent),
  };
}

/**
 * 반경 평면 (u, w) 정점을 R 필렛 위로 옮긴 좌표. 안 옮기면 null.
 * 필렛 원 중심(st.center)에서 법선 방향으로 원호에 투영해 접선 방향 밀림·삼각형 뒤집힘을 막는다.
 * 축면·마진이 분할 없는 단일 긴 삼각형인 메시는 부채꼴 각도 비율(scaleW·scaleL)로 접점까지 자연스럽게 잇는다.
 */
/** 측정 R이 목표에 이만큼 못 미치는 지점부터 투영량을 서서히 줄인다. */
const FILLET_NEED_RAMP_MM = 0.1;

/** 부채꼴 경계(접선)에서 변위를 0으로 줄이는 각도 폭. 경계에서 이동이 갑자기 끊기면 이음매가 생긴다. */
const FILLET_EDGE_FADE_RAD = 0.18;

function filletTargetInPlane(st, u, w, targetR, scaleW = 1, scaleL = 1, ignoreNeed = false) {
  // 이미 목표 R 이상인 스테이션은 건드리지 않는다. 큰 필렛을 목표 원호로 끌어내리면 오히려 타이트해진다.
  // ignoreNeed(정착 패스)에서는 이미 보정된 띠를 평활 원호에 맞춰 펴는 것이라 이 게이트를 건너뛴다.
  const need = targetR - (st.measuredR ?? targetR);
  if (!ignoreNeed && !(need > 0)) return null;
  const sec = filletSectorCoords(st, u, w, targetR);
  if (!sec || !(sec.d > 1e-3)) return null;
  const { vx, vw, d, binU, binW, pU, pW, alpha, alphaW, alphaL } = sec;
  // 접선 경계에 가까울수록 변위를 줄인다. 부채꼴 안팎 정점이 엇갈리며 생기는 링 이음매를 막는다.
  // 폭은 부채꼴 반각에 비례시킨다(둔각 코너는 부채꼴이 좁아 고정 폭이면 원호가 사라진다).
  const edgeDist = alpha >= 0 ? alphaW - alpha : alphaW + alpha;
  const fadeSpan = Math.max(0.02, Math.min(FILLET_EDGE_FADE_RAD, 0.4 * alphaW));
  const fade = smoothstep01(edgeDist / fadeSpan);
  if (!(fade > 1e-3)) return null;
  const blend = (st.blend ?? 1) * (ignoreNeed ? 1 : Math.min(1, need / FILLET_NEED_RAMP_MM)) * fade;
  if (!(blend > 1e-3)) return null;
  let tu;
  let tw;
  if (scaleW === 1 && scaleL === 1) {
    const s = targetR / d;
    tu = st.center.u + vx * s;
    tw = st.center.w + vw * s;
  } else if (alpha >= 0) {
    const aOut = Math.min(alphaW, alpha * scaleW);
    tu = st.center.u + targetR * (Math.cos(aOut) * binU + Math.sin(aOut) * pU);
    tw = st.center.w + targetR * (Math.cos(aOut) * binW + Math.sin(aOut) * pW);
  } else {
    const aOut = Math.min(alphaL, -alpha * scaleL);
    tu = st.center.u + targetR * (Math.cos(aOut) * binU - Math.sin(aOut) * pU);
    tw = st.center.w + targetR * (Math.cos(aOut) * binW - Math.sin(aOut) * pW);
  }
  if (Math.hypot(tu - u, tw - w) * blend <= 1e-4) return null;
  return { u: u + blend * (tu - u), w: w + blend * (tw - w) };
}

/**
 * 타이트 코너 필렛만 공구 R(0.5mm)로 키운다. 코너 띠는 원호가 실제로 생기도록 나눈 뒤 투영하므로
 * 면이 늘 수 있다. 마진·축면 직선 위 정점과 FL 아래는 움직이지 않는다.
 * @returns {{ mesh: import("./meshCore.js").Mesh, movedVertices: Uint8Array, movedCount: number, filletRadiusMm: number } | null}
 */
export function correctTightCornerFillet(mesh, finishLinePoints, options = {}) {
  const toolR =
    Number(options.toolRadiusMm) > 0 ? Number(options.toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const raw = (Array.isArray(finishLinePoints) ? finishLinePoints : []).filter(
    (p) => Array.isArray(p) && p.length >= 3 && p.every((v) => Number.isFinite(Number(v))),
  );
  if (raw.length < FL_SAMPLE_MIN) return null;
  // 디자인 정점 사슬은 정렬 z축 자오선을 따른다. 기울기 축이 더 맞는 경우만 그쪽을 쓴다.
  const axes = [[0, 0, 1]];
  const tilt = normalizeAxis(options.tiltAxisVector);
  if (dot3(tilt, axes[0]) < 1 - 1e-9) axes.push(tilt);
  let best = null;
  for (const axis of axes) {
    const res = filletCorrectionAboutAxis(mesh, raw, toolR, axis);
    if (!res) continue;
    res.flipped = revertFlippedFaces(mesh, res);
    if (!best || res.flipped < best.flipped) best = res;
    if (best.flipped === 0) break;
  }
  if (!best || !best.movedCount) return null;
  const adoptPass = (cur, nxt) => {
    const merged = new Uint8Array(nxt.movedVertices.length);
    merged.set(cur.movedVertices.subarray(0, Math.min(cur.movedVertices.length, merged.length)));
    let mergedCount = 0;
    for (let i = 0; i < merged.length; i += 1) {
      if (nxt.movedVertices[i]) merged[i] = 1;
      if (merged[i]) mergedCount += 1;
    }
    nxt.movedVertices = merged;
    nxt.movedCount = mergedCount;
    return nxt;
  };
  const refitPass = (cur, bonusMm = CORRECTION_REFIT_TARGET_BONUS_MM) => {
    // 평활 창을 좁히고 목표 R을 조금 높인다. 평활 코너가 국소 dip에서 목표 원호를 안쪽으로 당겨
    // 재측정 R이 목표보다 낮게 평형되는 것을 상쇄한다.
    const again = filletCorrectionAboutAxis(cur.mesh, raw, toolR, cur.axis, {
      smoothHalfWindow: 1,
      targetBonusMm: bonusMm,
    });
    if (!again) return null;
    again.flipped = revertFlippedFaces(cur.mesh, again);
    if (!again.movedCount) return null;
    return adoptPass(cur, again);
  };
  // 재측정 코너가 만든 원호를 따라와 R이 공구 R에 조금 못 미치는 구간은,
  // 보정 메시를 다시 재고 같은 축으로 한 번 더 투영해 수렴시킨다.
  let current = best;
  for (let pass = 0; pass < CORRECTION_REFIT_PASSES; pass += 1) {
    const again = refitPass(current);
    if (!again) break;
    current = again;
  }
  // 깊은 dip은 목표를 더 높여 한 번 더 수렴시킨다.
  for (let pass = 0; pass < CORRECTION_REFIT_PASSES; pass += 1) {
    const again = refitPass(current, CORRECTION_FINAL_TARGET_BONUS_MM);
    if (!again) break;
    current = again;
  }
  // 마지막으로 띠 전체를 하나의 필드에 정착시켜 패스마다 달라진 원호가 섞인 표면을 편다.
  current = settleCorrectedBand(current, raw, toolR);
  // 정착이 경계 구간을 다시 타이트하게 만들었으면 그 구간만 가볍게 메운다.
  for (let pass = 0; pass < 2; pass += 1) {
    const again = refitPass(current, CORRECTION_FINAL_TARGET_BONUS_MM);
    if (!again) break;
    current = again;
  }
  const { flipped, parent, baseVerts, ...out } = current;
  return out;
}

function faceNormalRaw(verts, faces, fi) {
  const a = faces[fi * 3] * 3;
  const b = faces[fi * 3 + 1] * 3;
  const c = faces[fi * 3 + 2] * 3;
  const ab = [verts[b] - verts[a], verts[b + 1] - verts[a + 1], verts[b + 2] - verts[a + 2]];
  const ac = [verts[c] - verts[a], verts[c + 1] - verts[a + 1], verts[c + 2] - verts[a + 2]];
  return cross(ab, ac);
}

/**
 * 방향이 뒤집힌 면의 이동 정점을 투영 전(세분화만 한) 자리로 되돌린다. 처음 뒤집힌 면 수를 돌려준다.
 * 보정 메시는 코너 띠를 나눈 것이라, 비교 기준은 나눈 면의 부모 원본 면 법선이다.
 */
function revertFlippedFaces(original, res) {
  const { mesh, movedVertices, parent, baseVerts } = res;
  if (!parent || !baseVerts) return 0;
  const faces = mesh.faces;
  let firstFlipped = -1;
  for (let pass = 0; pass < 4; pass += 1) {
    let flipped = 0;
    for (let fi = 0; fi < mesh.faceCount; fi += 1) {
      const tri = [faces[fi * 3], faces[fi * 3 + 1], faces[fi * 3 + 2]];
      if (!tri.some((vi) => movedVertices[vi])) continue;
      const before = faceNormalRaw(original.verts, original.faces, parent[fi]);
      const after = faceNormalRaw(mesh.verts, faces, fi);
      if (dot3(before, after) >= 0) continue;
      flipped += 1;
      for (const vi of tri) {
        if (!movedVertices[vi]) continue;
        mesh.verts[vi * 3] = baseVerts[vi * 3];
        mesh.verts[vi * 3 + 1] = baseVerts[vi * 3 + 1];
        mesh.verts[vi * 3 + 2] = baseVerts[vi * 3 + 2];
        movedVertices[vi] = 0;
        res.movedCount -= 1;
      }
    }
    if (firstFlipped < 0) firstFlipped = flipped;
    if (!flipped) break;
  }
  mesh.invalidate();
  return firstFlipped;
}

/** 보정 스테이션 원시 측정(정렬된 각도 순). 검출과 같은 측정기를 쓴다. */
function measureCorrectionStations(mesh, raw, axis, frame) {
  const sampledFl = resampleFinishLine(raw, STATION_SAMPLE_MAX);
  return sampledFl
    .map((fl) => {
      // 엄격한 단면 측정이 실패하는 emergence 프로파일은 검출과 같은 프로파일 폴백으로 잰다.
      const st = measureFilletStation(mesh, fl, axis) ?? measureProfileFilletStation(mesh, fl, axis);
      return st ? { ...st, theta: thetaAboutAxis(fl, axis, frame) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.theta - b.theta);
}

/** 정착 패스 반복 횟수. 이웃 평균→원호 재투영을 이만큼 반복해 분포를 편다. */
const CORRECTION_SETTLE_PASSES = 6;
const CORRECTION_SETTLE_DAMPING = 0.7;

/**
 * 보정이 끝난 띠를 마지막 필드 하나로 정착시킨다.
 * 패스마다 다시 잰 스테이션으로 투영하면 정점이 서로 다른 원(반경·중심) 위에 섞여 표면이 운다.
 * 이웃 평균으로 원호 방향 분포를 편 뒤, 각 정점을 자기 각도 필드의 목표 원호에 정확히 다시 얹는다.
 * 원호 위에 다시 얹으므로 재측정 R은 그대로 유지된다.
 */
function settleCorrectedBand(cur, raw, toolR) {
  const { mesh, movedVertices, axis } = cur;
  const frame = axisFrame(axis);
  const rawStations = measureCorrectionStations(mesh, raw, axis, frame);
  if (rawStations.length < 3) return cur;
  const stations = resampleStationField(
    smoothStationsForCorrection(rawStations, STATION_RAY_SMOOTH_HALF_WINDOW),
  );
  const targetR = toolR + CORRECTION_FILLET_MARGIN_MM;
  const work = mesh.clone();
  const baseVerts = Float64Array.from(work.verts);
  const neighbors = Array.from({ length: work.vertexCount }, () => []);
  const seen = Array.from({ length: work.vertexCount }, () => new Set());
  const link = (a, b) => {
    if (!seen[a].has(b)) {
      seen[a].add(b);
      neighbors[a].push(b);
    }
  };
  for (let fi = 0; fi < work.faceCount; fi += 1) {
    const a = work.faces[fi * 3];
    const b = work.faces[fi * 3 + 1];
    const c = work.faces[fi * 3 + 2];
    link(a, b); link(b, a); link(b, c); link(c, b); link(c, a); link(a, c);
  }
  const v = work.verts;
  for (let pass = 0; pass < CORRECTION_SETTLE_PASSES; pass += 1) {
    const prev = Float64Array.from(v);
    for (let vi = 0; vi < work.vertexCount; vi += 1) {
      if (!movedVertices[vi]) continue;
      const nb = neighbors[vi];
      if (!nb.length) continue;
      let ax = prev[vi * 3];
      let ay = prev[vi * 3 + 1];
      let az = prev[vi * 3 + 2];
      for (const ni of nb) {
        ax += prev[ni * 3];
        ay += prev[ni * 3 + 1];
        az += prev[ni * 3 + 2];
      }
      const inv = 1 / (nb.length + 1);
      const cand = [
        prev[vi * 3] + CORRECTION_SETTLE_DAMPING * (ax * inv - prev[vi * 3]),
        prev[vi * 3 + 1] + CORRECTION_SETTLE_DAMPING * (ay * inv - prev[vi * 3 + 1]),
        prev[vi * 3 + 2] + CORRECTION_SETTLE_DAMPING * (az * inv - prev[vi * 3 + 2]),
      ];
      const w = dot3(cand, axis);
      const radialVec = sub3(cand, scale3(axis, w));
      const u = Math.hypot(...radialVec);
      if (u < 0.2) continue;
      const st = stationAtTheta(stations, thetaAboutAxis(cand, axis, frame), targetR);
      if (!st) continue;
      const to = filletTargetInPlane(st, u, w, targetR, 1, 1, true);
      if (!to) continue;
      const q = add3(scale3(radialVec, to.u / u), scale3(axis, to.w));
      v[vi * 3] = q[0];
      v[vi * 3 + 1] = q[1];
      v[vi * 3 + 2] = q[2];
    }
  }
  work.invalidate();
  const identity = Int32Array.from({ length: work.faceCount }, (_, fi) => fi);
  const res = {
    mesh: work,
    movedVertices: Uint8Array.from(movedVertices),
    movedCount: cur.movedCount,
    parent: identity,
    baseVerts,
  };
  res.flipped = revertFlippedFaces(mesh, res);
  return { ...cur, mesh: work, movedVertices: res.movedVertices, movedCount: res.movedCount };
}

function filletCorrectionAboutAxis(mesh, raw, toolR, axis, options = {}) {
  const { smoothHalfWindow, targetBonusMm = 0 } = options;
  const targetR = toolR + CORRECTION_FILLET_MARGIN_MM + targetBonusMm;
  const frame = axisFrame(axis);
  const rawStations = measureCorrectionStations(mesh, raw, axis, frame);
  if (rawStations.length < 3) return null;
  // 재검사(기울기 축·다른 샘플)가 보정 측정보다 낮게 읽는 만큼, 트리거에 헤드룸을 둔다.
  if (!rawStations.some((s) => isTightFillet(s.measuredR, s.ext, toolR + CORRECTION_TRIGGER_HEADROOM_MM))) return null;
  const stations = resampleStationField(smoothStationsForCorrection(rawStations, smoothHalfWindow));

  // 코너 띠를 잘게 나눈 뒤 투영한다. 성긴 원본 정점만 옮기면 원호가 현으로 잘려 효과가 사라진다.
  const work = subdivideCornerBand(mesh, stations, frame, axis, targetR);
  const baseVerts = Float64Array.from(work.mesh.verts);
  let maxRatioW = 0;
  let maxRatioL = 0;
  const v0 = work.mesh.verts;
  for (let vi = 0; vi < work.mesh.vertexCount; vi += 1) {
    const p = [v0[vi * 3], v0[vi * 3 + 1], v0[vi * 3 + 2]];
    const w = dot3(p, axis);
    const radialVec = sub3(p, scale3(axis, w));
    const u = Math.hypot(...radialVec);
    if (u < 0.2) continue;
    const st = stationAtTheta(stations, thetaAboutAxis(p, axis, frame), targetR);
    if (!st) continue;
    const sec = filletSectorCoords(st, u, w, targetR);
    if (!sec) continue;
    if (sec.alpha >= 0 && sec.alphaW > 1e-4) maxRatioW = Math.max(maxRatioW, sec.alpha / sec.alphaW);
    if (sec.alpha < 0 && sec.alphaL > 1e-4) maxRatioL = Math.max(maxRatioL, -sec.alpha / sec.alphaL);
  }
  const scaleW = maxRatioW > 0.05 && maxRatioW < SPARSE_SECTOR_RATIO_MAX ? 1 / maxRatioW : 1;
  const scaleL = maxRatioL > 0.05 && maxRatioL < SPARSE_SECTOR_RATIO_MAX ? 1 / maxRatioL : 1;

  const next = work.mesh;
  const v = next.verts;
  const movedVertices = new Uint8Array(next.vertexCount);
  let movedCount = 0;
  for (let vi = 0; vi < next.vertexCount; vi += 1) {
    const p = [v[vi * 3], v[vi * 3 + 1], v[vi * 3 + 2]];
    const w = dot3(p, axis);
    const radialVec = sub3(p, scale3(axis, w));
    const u = Math.hypot(...radialVec);
    if (u < 0.2) continue;
    const st = stationAtTheta(stations, thetaAboutAxis(p, axis, frame), targetR);
    if (!st) continue;
    const to = filletTargetInPlane(st, u, w, targetR, scaleW, scaleL);
    if (!to) continue;
    const q = add3(scale3(radialVec, to.u / u), scale3(axis, to.w));
    v[vi * 3] = q[0];
    v[vi * 3 + 1] = q[1];
    v[vi * 3 + 2] = q[2];
    movedVertices[vi] = 1;
    movedCount += 1;
  }
  if (!movedCount) return null;
  next.invalidate();
  const n = rawStations.length;
  const tightSamples = rawStations
    .map((st, i) => ({ st, i }))
    .filter(({ st }) => st.measuredR < toolR - FILLET_R_TOLERANCE_MM)
    .map(({ st, i }) => ({
      sampleIndex: Math.round((i * FL_SAMPLE_MAX) / n),
      filletRadiusMm: Math.round(Math.max(0, st.measuredR) * 1000) / 1000,
      cornerPoint: fromPlaneCoords(st.corner.u, st.corner.w, st.radial, st.axis).slice(),
    }));
  return {
    mesh: next,
    movedVertices,
    movedCount,
    filletRadiusMm: targetR,
    axis,
    tightSamples,
    parent: work.parent,
    baseVerts,
  };
}

/**
 * 보정 결과를 접수 검사 메타로 바꾼다. 정점을 옮긴 보정만 불완전 가공으로 본다.
 * @returns {object|null} tightCount 0이면 null
 */
export function tightCornerMetaFromCorrection(corrected, filletSurface) {
  const samples = Array.isArray(corrected?.tightSamples) ? corrected.tightSamples : [];
  if (!corrected?.movedCount || !samples.length) return null;
  const rValues = samples.map((s) => s.filletRadiusMm).filter((v) => Number.isFinite(v));
  return {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: samples.length,
    averageFilletRadiusMm: rValues.length
      ? Math.round((rValues.reduce((a, b) => a + b, 0) / rValues.length) * 1000) / 1000
      : null,
    samples,
    tightFinishLineSegments: [],
    ballPassPolylines: [],
    reliefOverlay: null,
    correctionSolid: filletSurface || null,
    needsCorrectionReview: true,
  };
}

/**
 * 보정으로 움직인 필렛 면(정점 2개 이상 이동)만 평면 배열로 뽑는다. 프리뷰 표시용.
 * @returns {{ filletRadiusMm: number, positions: number[], indices: number[] } | null}
 */
export function movedFilletSurface(corrected) {
  const { mesh, movedVertices, filletRadiusMm } = corrected || {};
  if (!mesh || !movedVertices) return null;
  const remap = new Map();
  const positions = [];
  const indices = [];
  const f = mesh.faces;
  for (let fi = 0; fi < mesh.faceCount; fi += 1) {
    const tri = [f[fi * 3], f[fi * 3 + 1], f[fi * 3 + 2]];
    if (tri.filter((vi) => movedVertices[vi]).length < 2) continue;
    for (const vi of tri) {
      let k = remap.get(vi);
      if (k == null) {
        k = remap.size;
        remap.set(vi, k);
        positions.push(
          round3(mesh.verts[vi * 3]),
          round3(mesh.verts[vi * 3 + 1]),
          round3(mesh.verts[vi * 3 + 2]),
        );
      }
      indices.push(k);
    }
  }
  return indices.length ? { filletRadiusMm, positions, indices } : null;
}

/**
 * 타이트 코너를 공구보다 넉넉한 필렛으로 바꾼 메시(정렬 좌표계). 코너 띠는 나눠서 들어간다.
 * @returns {import("./meshCore.js").Mesh | null}
 */
export function applyTightCornerCorrectionToMesh(mesh, finishLinePoints, options = {}) {
  return correctTightCornerFillet(mesh, finishLinePoints, options)?.mesh || null;
}
