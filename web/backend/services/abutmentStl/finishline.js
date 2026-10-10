// related files:
// - bg/pc1/rhino-server/compute/scripts/finishline_detection.py (원본, 동작 SSOT)
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py (_sanitize_finishline_points, _extract_finishline_z_extrema)
// - web/backend/services/abutmentStl/meshCore.js
//
// finishline_detection.py의 JS 이식. 시각화·디버그 오브젝트는 옮기지 않는다.
// Rhino 메시는 STL import 때 22.5°로 용접돼 crease edge가 unwelded다. 입력은 unweldedByAngle() 메시다.
import {
  Mesh,
  chainAdjacency,
  cross,
  median,
  meshPlaneSection,
  normalize,
} from "./meshCore.js";

const SECTION_COUNT = 40;
const SECTION_STEP_DEG = 4.5;
const TILT_AXIS_BAND_LOW = 0.15;
const TILT_AXIS_BAND_HIGH = 0.95;
const TILT_AXIS_MIN_VERTS = 120;
const PT0_Z_RATIO_LOW = 0.2;
const PT0_Z_RATIO_HIGH = 0.6;
const Z_RATIO_LOW = 0.2;
const Z_RATIO_HIGH = 0.7;
const MAXR_AXIS_RATIO_LOW = 0.18;
const MAXR_AXIS_RATIO_HIGH = 0.72;
const MAXR_PT0_Z_WINDOW_LOW = 2.8;
const MAXR_PT0_Z_WINDOW_HIGH = 3.0;
const DIST_TOL = 1e-8;
const EDGE_MIN_Z_VALID_THRESHOLD_MM = 0.2;
const EDGE_MIN_RADIUS_TO_PT0_RATIO = 0.45;
const EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO = 0.55;
const EDGE_MAX_Z_ABOVE_PT0_MM = 8.0;
const EDGE_MIN_Z_SPAN_MM = 0.08;
/**
 * 스팬이 0.08mm 이하여도 전체 반경의 이 비율 이상이면 수평 어깨로 유지한다.
 * 그보다 안쪽인 평면 링만 flat_z로 버린다. (박영옥: 어깨 스팬 0.027mm)
 */
const EDGE_FLAT_OUTER_RADIUS_RATIO = 0.8;
const EDGE_MIN_AZIMUTH_COVERAGE_RAD = 4.5;
const OUTLIER_SEGMENT_RATIO = 2.8;
const OUTLIER_SEGMENT_ABS_MM = 2.0;
const OUTLIER_DZ_RATIO = 4.0;
const OUTLIER_DZ_ABS_MM = 1.5;
const EDGE_CANDIDATE_MAX_COUNT = 20;
const EDGE_CANDIDATE_MIN_VERT_RATIO = 0.03;
const EDGE_CANDIDATE_MIN_VERT_ABS = 40;
const EDGE_CLOSE_GAP_TOL_MM = 0.2;
/** Rhino 문서 절대 공차(mm 템플릿). */
const MODEL_ABSOLUTE_TOLERANCE = 0.001;

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const radiusXY = (p) => Math.hypot(p[0], p[1]);

function meshBBox(mesh) {
  return mesh.bbox();
}

function meshZKey(mesh) {
  const { min, max } = meshBBox(mesh);
  return [max[2], min[2], mesh.vertexCount, dist3(min, max)];
}

function compareTupleDesc(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

function tupleGreater(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function meshXYRadiusFromBBox(mesh) {
  const { min, max } = meshBBox(mesh);
  let best = 0;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) best = Math.max(best, Math.hypot(x, y));
  }
  return best;
}

function meshMaxRadiusInZBand(mesh, low = Z_RATIO_LOW, high = Z_RATIO_HIGH) {
  const { min, max } = meshBBox(mesh);
  const height = Math.max(1e-6, max[2] - min[2]);
  const lowZ = min[2] + low * height;
  const highZ = min[2] + high * height;
  const v = mesh.verts;
  let best = 0;
  let found = false;
  for (let i = 0; i < v.length; i += 3) {
    const z = v[i + 2];
    if (z < lowZ || z > highZ) continue;
    best = Math.max(best, Math.hypot(v[i], v[i + 1]));
    found = true;
  }
  return found && best > 0 ? best : meshXYRadiusFromBBox(mesh);
}

/**
 * ExplodeAtUnweldedEdges + SplitDisjointPieces.
 * 조각마다 { mesh(위치 용접), internalUnweldedEdges } 를 돌려준다.
 */
function explodeComponentsSortedByMaxZ(unwelded) {
  const pieces = unwelded.faceComponents();
  const out = pieces.map((faceList) => {
    const sub = unwelded.subMesh(faceList);
    return { mesh: sub, faceList };
  });
  out.sort((a, b) => compareTupleDesc(meshZKey(a.mesh), meshZKey(b.mesh)));
  return out;
}

/** 조각의 경계 루프(위치 기준 naked edge) → 점 목록. GetNakedEdges와 같다. */
function nakedEdgeLoops(pieceMesh) {
  const welded = Mesh.fromTriangleSoup(pieceMesh.toTriangleSoup());
  return welded.boundaryLoops().map(({ vertices, closed }) => ({
    points: vertices.map((vi) => [
      welded.verts[vi * 3],
      welded.verts[vi * 3 + 1],
      welded.verts[vi * 3 + 2],
    ]),
    closed,
  }));
}

/** 조각 안에서 양쪽 면이 정점을 공유하지 않는 edge(unwelded) 체인. */
function internalUnweldedEdgeLoops(pieceMesh) {
  const welded = Mesh.fromTriangleSoup(pieceMesh.toTriangleSoup());
  // 조각 메시의 면 순서는 soup 순서와 같다. 조각 코너 id로 unwelded 여부를 본다.
  const pf = pieceMesh.faces;
  const wf = welded.faces;
  const { map, nv } = welded.edges();
  const adj = new Map();
  const add = (a, b) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  const cornerOf = (fi, wv) => {
    for (let k = 0; k < 3; k += 1) if (wf[fi * 3 + k] === wv) return pf[fi * 3 + k];
    return -1;
  };
  for (const [key, list] of map) {
    if (list.length !== 2) continue;
    const a = Math.floor(key / nv);
    const b = key - a * nv;
    const [f0, f1] = list;
    if (cornerOf(f0, a) === cornerOf(f1, a) && cornerOf(f0, b) === cornerOf(f1, b)) continue;
    add(a, b);
    add(b, a);
  }
  if (!adj.size) return [];
  return chainAdjacency(adj).map(({ vertices, closed }) => ({
    points: vertices.map((vi) => [welded.verts[vi * 3], welded.verts[vi * 3 + 1], welded.verts[vi * 3 + 2]]),
    closed,
  }));
}

/** Curve.JoinCurves: 끝점이 tol 안에서 만나는 열린 곡선을 잇는다. */
function joinCurves(curves, tol) {
  const pool = curves.map((c) => ({ points: c.points.slice(), closed: c.closed }));
  const out = [];
  const openList = [];
  for (const c of pool) {
    if (c.closed) out.push(c);
    else openList.push(c);
  }
  while (openList.length) {
    let cur = openList.shift();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < openList.length; i += 1) {
        const o = openList[i];
        const cs = cur.points[0];
        const ce = cur.points[cur.points.length - 1];
        const os = o.points[0];
        const oe = o.points[o.points.length - 1];
        let merged = null;
        if (dist3(ce, os) <= tol) merged = cur.points.concat(o.points.slice(1));
        else if (dist3(ce, oe) <= tol) merged = cur.points.concat(o.points.slice(0, -1).reverse());
        else if (dist3(cs, oe) <= tol) merged = o.points.concat(cur.points.slice(1));
        else if (dist3(cs, os) <= tol) merged = o.points.slice().reverse().concat(cur.points.slice(1));
        if (merged) {
          cur = { points: merged, closed: false };
          openList.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    if (cur.points.length > 2 && dist3(cur.points[0], cur.points[cur.points.length - 1]) <= tol) {
      cur.closed = true;
    }
    out.push(cur);
  }
  return out;
}

function curveToClosedPoints(curve) {
  const points = curve.points.slice();
  if (points.length < 3) return null;
  const gap = dist3(points[0], points[points.length - 1]);
  if (!curve.closed && gap > EDGE_CLOSE_GAP_TOL_MM) return null;
  if (gap > 1e-6) points.push(points[0].slice());
  return points;
}

function pointsMinZ(points) {
  return points.length ? Math.min(...points.map((p) => p[2])) : null;
}

function pointsMaxZ(points) {
  return points.length ? Math.max(...points.map((p) => p[2])) : null;
}

function pointsMedianRadius(points) {
  return points.length ? median(points.map(radiusXY)) : null;
}

function loopAzimuthCoverage(points) {
  if (points.length < 3) return 0;
  const angles = points.map((p) => Math.atan2(p[1], p[0])).sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < angles.length; i += 1) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  maxGap = Math.max(maxGap, angles[0] + 2 * Math.PI - angles[angles.length - 1]);
  return Math.max(0, Math.min(2 * Math.PI, 2 * Math.PI - maxGap));
}

function curveLength(points) {
  let s = 0;
  for (let i = 1; i < points.length; i += 1) s += dist3(points[i], points[i - 1]);
  return s;
}

function pickBestEdgeLoopPoints(curves, tolerance, refPt0, refPt0Radius, meshBandMaxRadius, strict) {
  if (!curves.length) return null;
  const joined = joinCurves(curves, tolerance);
  const source = joined.length ? joined : curves;
  const infos = [];
  for (const cv of source) {
    const pts = curveToClosedPoints(cv);
    if (!pts || pts.length < 3) continue;
    const minZ = pointsMinZ(pts);
    const medianR = pointsMedianRadius(pts);
    const az = loopAzimuthCoverage(pts);
    const length = curveLength(cv.points);
    if (strict) {
      if (minZ != null && minZ <= EDGE_MIN_Z_VALID_THRESHOLD_MM) continue;
      if (refPt0 && minZ != null && minZ >= refPt0[2] + EDGE_MAX_Z_ABOVE_PT0_MM) continue;
      if (az < EDGE_MIN_AZIMUTH_COVERAGE_RAD) continue;
      if (refPt0Radius != null && refPt0Radius > DIST_TOL && medianR != null) {
        if (medianR / refPt0Radius <= EDGE_MIN_RADIUS_TO_PT0_RATIO) continue;
      }
      if (meshBandMaxRadius != null && meshBandMaxRadius > DIST_TOL && medianR != null) {
        if (medianR / meshBandMaxRadius <= EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO) continue;
      }
    }
    const zScore = refPt0 && minZ != null ? -Math.abs(minZ - refPt0[2]) : minZ != null ? minZ : -Infinity;
    infos.push({ medianR: medianR ?? -1, zScore, length, minZ: minZ ?? Infinity, pts });
  }
  if (!infos.length) return null;
  infos.sort((a, b) => a.minZ - b.minZ || b.medianR - a.medianR || b.zScore - a.zScore || b.length - a.length);
  return infos[0].pts;
}

function estimateTiltAxis(mesh) {
  const { min, max } = meshBBox(mesh);
  const zMin = min[2];
  const height = Math.max(1e-6, max[2] - zMin);
  const low = zMin + TILT_AXIS_BAND_LOW * height;
  const high = zMin + TILT_AXIS_BAND_HIGH * height;
  const v = mesh.verts;
  const accumulate = (useBand) => {
    let sw = 0, sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, sxz = 0, syy = 0, syz = 0, szz = 0, n = 0;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i];
      const y = v[i + 1];
      const z = v[i + 2];
      if (useBand && (z < low || z > high)) continue;
      const t = Math.max(0, Math.min(1, (z - zMin) / height));
      const w = 0.2 + 0.8 * t * t;
      sw += w;
      sx += w * x;
      sy += w * y;
      sz += w * z;
      sxx += w * x * x;
      sxy += w * x * y;
      sxz += w * x * z;
      syy += w * y * y;
      syz += w * y * z;
      szz += w * z * z;
      n += 1;
    }
    return { n, sw, sx, sy, sz, sxx, sxy, sxz, syy, syz, szz };
  };
  const axisFrom = (s) => {
    if (s.sw <= DIST_TOL) return null;
    const mx = s.sx / s.sw;
    const my = s.sy / s.sw;
    const mz = s.sz / s.sw;
    const cxx = Math.max(0, s.sxx / s.sw - mx * mx);
    const cxy = s.sxy / s.sw - mx * my;
    const cxz = s.sxz / s.sw - mx * mz;
    const cyy = Math.max(0, s.syy / s.sw - my * my);
    const cyz = s.syz / s.sw - my * mz;
    const czz = Math.max(0, s.szz / s.sw - mz * mz);
    let vec = [0, 0, 1];
    for (let i = 0; i < 16; i += 1) {
      const nx = cxx * vec[0] + cxy * vec[1] + cxz * vec[2];
      const ny = cxy * vec[0] + cyy * vec[1] + cyz * vec[2];
      const nz = cxz * vec[0] + cyz * vec[1] + czz * vec[2];
      const norm = Math.hypot(nx, ny, nz);
      if (norm <= DIST_TOL) break;
      vec = [nx / norm, ny / norm, nz / norm];
    }
    let axis = normalize(vec);
    if (!axis[0] && !axis[1] && !axis[2]) return null;
    if (axis[2] < 0) axis = axis.map((c) => -c);
    return axis;
  };
  const band = accumulate(true);
  let axis = band.n >= TILT_AXIS_MIN_VERTS ? axisFrom(band) : null;
  if (!axis) axis = axisFrom(accumulate(false));
  if (!axis || Math.abs(axis[2]) < 0.2) return [0, 0, 1];
  return axis;
}

function selectPt0(mesh) {
  let axis = estimateTiltAxis(mesh);
  if (axis[2] < 0) axis = axis.map((c) => -c);
  const v = mesh.verts;
  let aMin = Infinity;
  let aMax = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const a = v[i] * axis[0] + v[i + 1] * axis[1] + v[i + 2] * axis[2];
    if (a < aMin) aMin = a;
    if (a > aMax) aMax = a;
  }
  if (!Number.isFinite(aMin)) throw new Error("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)");
  const span = Math.max(1e-6, aMax - aMin);
  const low = aMin + PT0_Z_RATIO_LOW * span;
  const high = aMin + PT0_Z_RATIO_HIGH * span;
  const radiusToAxis = (p) => {
    const c = cross(p, axis);
    return Math.hypot(c[0], c[1], c[2]);
  };
  let best = null;
  let bestR = -1;
  for (let pass = 0; pass < 2 && !best; pass += 1) {
    for (let i = 0; i < v.length; i += 3) {
      const p = [v[i], v[i + 1], v[i + 2]];
      if (pass === 0) {
        const a = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
        if (a < low || a > high) continue;
      }
      const r = radiusToAxis(p);
      if (r > bestR) {
        bestR = r;
        best = p;
      }
    }
  }
  if (!best) throw new Error("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)");
  return best;
}

function detectFinishlinePointsEdge(mesh, log) {
  let candidates = explodeComponentsSortedByMaxZ(mesh);
  const maxVerts = Math.max(0, ...candidates.map((c) => c.mesh.vertexCount));
  const minKeep = Math.max(EDGE_CANDIDATE_MIN_VERT_ABS, Math.floor(maxVerts * EDGE_CANDIDATE_MIN_VERT_RATIO));
  let filtered = candidates.filter((c) => c.mesh.vertexCount >= minKeep);
  if (!filtered.length) filtered = candidates.slice();
  candidates = filtered.slice(0, EDGE_CANDIDATE_MAX_COUNT);
  log(`[detect-edge] candidates total=${filtered.length} kept=${candidates.length} min_keep_verts=${minKeep}`);

  let refPt0 = null;
  let refPt0Radius = null;
  try {
    refPt0 = selectPt0(mesh);
    refPt0Radius = radiusXY(refPt0);
  } catch {
    refPt0 = null;
  }

  const runPass = (passName, zRefPt0, zRefPt0Radius) => {
    const counters = {
      rejected_low_z: 0,
      rejected_high_z: 0,
      rejected_small_radius: 0,
      rejected_flat_z: 0,
    };
    let bestScore = null;
    let bestPoints = null;
    let bestStrategy = null;
    candidates.forEach((cand, idx) => {
      const target = cand.mesh;
      // Rhino ExtractMeshEdges(Unwelded)는 조각 경계(naked)까지 돌려준다(골든 137건 edge 전략 일치).
      let curves = [...internalUnweldedEdgeLoops(target), ...nakedEdgeLoops(target)];
      let strategy = "C_EXTRACT_MESH_EDGES_UNWELDED";
      if (!curves.length) {
        curves = nakedEdgeLoops(target);
        strategy = "C_FALLBACK_NAKED_EDGES";
      }
      const bandR = meshMaxRadiusInZBand(target);
      let traced = pickBestEdgeLoopPoints(curves, MODEL_ABSOLUTE_TOLERANCE, zRefPt0, zRefPt0Radius, bandR, true);
      if (!traced || traced.length < 3) {
        traced = pickBestEdgeLoopPoints(curves, MODEL_ABSOLUTE_TOLERANCE, zRefPt0, zRefPt0Radius, bandR, false);
      }
      if (!traced || traced.length < 3) return;
      const minZ = pointsMinZ(traced);
      const maxZ = pointsMaxZ(traced);
      const span = minZ != null && maxZ != null ? maxZ - minZ : null;
      if (minZ != null && minZ <= EDGE_MIN_Z_VALID_THRESHOLD_MM) {
        counters.rejected_low_z += 1;
        return;
      }
      const medR = pointsMedianRadius(traced);
      const outerRef = Math.max(
        zRefPt0Radius != null && zRefPt0Radius > DIST_TOL ? zRefPt0Radius : 0,
        fullBandR > DIST_TOL ? fullBandR : 0,
      );
      const isOuterShoulder =
        medR != null && outerRef > DIST_TOL && medR / outerRef >= EDGE_FLAT_OUTER_RADIUS_RATIO;
      if (span != null && span <= EDGE_MIN_Z_SPAN_MM && !isOuterShoulder) {
        counters.rejected_flat_z += 1;
        return;
      }
      if (zRefPt0 && minZ != null && minZ >= zRefPt0[2] + EDGE_MAX_Z_ABOVE_PT0_MM) {
        counters.rejected_high_z += 1;
        return;
      }
      if (zRefPt0Radius != null && zRefPt0Radius > DIST_TOL && medR != null) {
        if (medR / zRefPt0Radius <= EDGE_MIN_RADIUS_TO_PT0_RATIO) {
          counters.rejected_small_radius += 1;
          return;
        }
      }
      if (medR != null && bandR > DIST_TOL && medR / bandR <= EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO) {
        counters.rejected_small_radius += 1;
        return;
      }
      const score = [
        minZ != null ? -minZ : -Infinity,
        medR != null ? medR : -1,
        zRefPt0 && minZ != null ? -Math.abs(minZ - zRefPt0[2]) : 0,
        traced.length,
      ];
      if (!bestScore || tupleGreater(score, bestScore)) {
        bestScore = score;
        bestPoints = traced;
        bestStrategy = `${strategy}#candidate${idx}`;
      }
    });
    log(`[detect-edge:${passName}] best=${Boolean(bestPoints)} strategy=${bestStrategy} counters=${JSON.stringify(counters)}`);
    return { bestPoints, bestStrategy, counters };
  };

  const fullBandR = meshMaxRadiusInZBand(mesh);

  const reason = (c) =>
    c.rejected_low_z > 0
      ? "C_EDGE_REJECTED_LOW_Z"
      : c.rejected_flat_z > 0
        ? "C_EDGE_REJECTED_FLAT_Z"
        : c.rejected_high_z > 0
          ? "C_EDGE_REJECTED_HIGH_Z"
          : c.rejected_small_radius > 0
            ? "C_EDGE_REJECTED_SMALL_RADIUS"
            : "C_EDGE_FAILED";

  const first = runPass("strict_pt0", refPt0, refPt0Radius);
  if (first.bestPoints && first.bestPoints.length >= 3) {
    return [first.bestPoints, first.bestStrategy || "C_EXTRACT_MESH_EDGES_UNWELDED"];
  }
  if (refPt0) {
    const second = runPass("relaxed_no_pt0", null, null);
    if (second.bestPoints && second.bestPoints.length >= 3) {
      return [second.bestPoints, `${second.bestStrategy || "C_EXTRACT_MESH_EDGES_UNWELDED"}#relaxed`];
    }
    return [null, `${reason(first.counters)}+RELAXED_FAIL:${reason(second.counters)}`];
  }
  return [null, reason(first.counters)];
}

function validateFinishlinePoints(points) {
  if (!points || points.length < 4) return [false, "too_few_points"];
  const segLens = [];
  const segDz = [];
  for (let i = 1; i < points.length; i += 1) {
    segLens.push(dist3(points[i - 1], points[i]));
    segDz.push(Math.abs(points[i][2] - points[i - 1][2]));
  }
  if (segLens.length < 3) return [false, "too_few_segments"];
  const metricOutlier = (values, ratioTh, absTh) => {
    const med = median(values);
    if (med == null || med <= DIST_TOL) return [false, null];
    const maxV = Math.max(...values);
    const limit = Math.max(absTh, med * ratioTh);
    if (maxV < limit) return [false, { max: maxV, med }];
    const idx = values.indexOf(maxV);
    const count = values.filter((x) => x >= limit).length;
    if (count === 1 && idx >= 0 && values.length >= 4) {
      const trimmed = values.filter((_, i) => i !== idx);
      const med2 = median(trimmed);
      if (med2 != null && med2 > DIST_TOL) {
        const max2 = Math.max(...trimmed);
        if (max2 < Math.max(absTh, med2 * ratioTh)) {
          return [false, { max: maxV, med, accepted_single_outlier: true }];
        }
      }
    }
    return [true, { max: maxV, med }];
  };
  const [segBad, segInfo] = metricOutlier(segLens, OUTLIER_SEGMENT_RATIO, OUTLIER_SEGMENT_ABS_MM);
  if (segBad) return [false, `outlier_segment max_len=${segInfo.max.toFixed(4)} med_len=${segInfo.med.toFixed(4)}`];
  const [dzBad, dzInfo] = metricOutlier(segDz, OUTLIER_DZ_RATIO, OUTLIER_DZ_ABS_MM);
  if (dzBad) return [false, `outlier_dz max_dz=${dzInfo.max.toFixed(4)} med_dz=${dzInfo.med.toFixed(4)}`];
  if (segInfo?.accepted_single_outlier) return [true, "ok_with_single_segment_outlier"];
  if (dzInfo?.accepted_single_outlier) return [true, "ok_with_single_dz_outlier"];
  return [true, "ok"];
}

function orderByAzimuth(points) {
  return points.slice().sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
}

function normalizeLoopPoints(points) {
  if (!points || points.length < 4) return [];
  let core = points.map((p) => p.slice());
  if (dist3(core[0], core[core.length - 1]) <= 1e-4) core = core.slice(0, -1);
  if (core.length < 3) return [];
  const ordered = orderByAzimuth(core);
  ordered.push(ordered[0].slice());
  return ordered;
}

function acceptOrNormalize(points, allowRawOutlier, log, label) {
  if (!points || points.length < 3) return [null, false];
  const [ok, why] = validateFinishlinePoints(points);
  if (ok) return [points, true];
  const normalized = normalizeLoopPoints(points);
  if (normalized.length >= 4 && validateFinishlinePoints(normalized)[0]) {
    log(`[detect] ${label} normalized by azimuth (prev_reason=${why})`);
    return [normalized, true];
  }
  if (allowRawOutlier) {
    log(`[detect] ${label} outlier warning (kept): ${why}`);
    return [points, true];
  }
  log(`[detect] ${label} rejected by outlier check: ${why}`);
  return [null, false];
}

function buildSectionPlanes(axisDir) {
  let axis = normalize(axisDir || [0, 0, 1]);
  if (!axis[0] && !axis[1] && !axis[2]) axis = [0, 0, 1];
  let helper = [0, 0, 1];
  if (Math.abs(axis[2]) > 0.95) helper = [1, 0, 0];
  let u = cross(axis, helper);
  if (Math.hypot(...u) < 1e-12) u = cross(axis, [0, 1, 0]);
  if (Math.hypot(...u) < 1e-12) u = [1, 0, 0];
  u = normalize(u);
  let v = cross(axis, u);
  if (Math.hypot(...v) < 1e-12) v = [0, 1, 0];
  v = normalize(v);
  const step = Math.min(SECTION_STEP_DEG, 180 / SECTION_COUNT);
  const planes = [];
  const seen = new Set();
  for (let i = 0; i < SECTION_COUNT; i += 1) {
    const ang = (step * i * Math.PI) / 180;
    const radial = [
      u[0] * Math.cos(ang) + v[0] * Math.sin(ang),
      u[1] * Math.cos(ang) + v[1] * Math.sin(ang),
      u[2] * Math.cos(ang) + v[2] * Math.sin(ang),
    ];
    // rg.Plane(origin, xAxis=radial, yAxis=axis) → 법선 = radial × axis
    const n = normalize(cross(radial, axis));
    let [x, y, z] = n;
    if (x < 0 || (Math.abs(x) <= 1e-12 && y < 0) || (Math.abs(x) <= 1e-12 && Math.abs(y) <= 1e-12 && z < 0)) {
      x = -x;
      y = -y;
      z = -z;
    }
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planes.push(n);
  }
  return planes;
}

function dedupQuantized(points) {
  const out = [];
  const seen = new Set();
  for (const p of points) {
    const key = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.slice());
  }
  return out;
}

function detectMaxRadiusTrack(mesh, planes, axisDir, refPt0) {
  let axis = normalize(axisDir);
  if (axis[2] < 0) axis = axis.map((c) => -c);
  const axial = (p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
  const radius = (p) => {
    const c = cross(p, axis);
    return Math.hypot(c[0], c[1], c[2]);
  };
  const v = mesh.verts;
  let aMin = Infinity;
  let aMax = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const a = v[i] * axis[0] + v[i + 1] * axis[1] + v[i + 2] * axis[2];
    aMin = Math.min(aMin, a);
    aMax = Math.max(aMax, a);
  }
  let aLow = -1e9;
  let aHigh = 1e9;
  if (Number.isFinite(aMin) && Number.isFinite(aMax)) {
    const span = Math.max(1e-6, aMax - aMin);
    aLow = aMin + MAXR_AXIS_RATIO_LOW * span;
    aHigh = aMin + MAXR_AXIS_RATIO_HIGH * span;
  }
  let helper = [0, 0, 1];
  if (Math.abs(axis[2]) > 0.95) helper = [1, 0, 0];
  let au = cross(axis, helper);
  if (Math.hypot(...au) < 1e-12) au = cross(axis, [0, 1, 0]);
  au = normalize(au);
  const av = normalize(cross(axis, au));
  const azimuth = (p) => Math.atan2(p[0] * av[0] + p[1] * av[1] + p[2] * av[2], p[0] * au[0] + p[1] * au[1] + p[2] * au[2]);
  const wrapPi = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const coverage = (pts) => {
    if (pts.length < 3) return 0;
    const angs = pts.map(azimuth).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < angs.length; i += 1) gap = Math.max(gap, angs[i] - angs[i - 1]);
    gap = Math.max(gap, angs[0] + 2 * Math.PI - angs[angs.length - 1]);
    return Math.max(0, Math.min(2 * Math.PI, 2 * Math.PI - gap));
  };
  const orderByAxisAzimuth = (pts) => {
    if (pts.length < 3) return [];
    const core = pts.map((p) => p.slice()).sort((a, b) => azimuth(a) - azimuth(b));
    core.push(core[0].slice());
    return core;
  };
  const maxRadiusBand = (pts) => {
    if (!pts.length) return [];
    const maxR = Math.max(...pts.map(radius));
    const band = pts.filter((p) => radius(p) >= maxR * 0.985).map((p) => p.slice());
    return band.length ? band : [pts.reduce((a, p) => (radius(p) > radius(a) ? p : a), pts[0]).slice()];
  };
  const pickDual = (band, fallback) => {
    const pool = dedupQuantized([...band, ...fallback]).map((p) => [radius(p), azimuth(p), p]);
    if (!pool.length) return [];
    pool.sort((a, b) => b[0] - a[0]);
    const [, a0, p0] = pool[0];
    let best2 = null;
    let best2Key = null;
    for (const [r, ang, pt] of pool) {
      const sep = Math.abs(wrapPi(ang - a0));
      const key = [-Math.abs(sep - Math.PI), r];
      if (!best2Key || tupleGreater(key, best2Key)) {
        best2Key = key;
        best2 = pt;
      }
    }
    const out = [p0.slice()];
    if (best2 && Math.abs(wrapPi(azimuth(best2) - a0)) >= (120 * Math.PI) / 180) out.push(best2.slice());
    return out;
  };

  const pt0Z = refPt0 ? refPt0[2] : null;
  const bands = [];
  const duals = [];
  const reps = [];
  planes.forEach((normal, idx) => {
    const all = meshPlaneSection(mesh, [0, 0, 0], normal).flat();
    const byAxis = all.filter((p) => aLow <= axial(p) && axial(p) <= aHigh);
    const byZ =
      pt0Z != null
        ? all.filter((p) => pt0Z - MAXR_PT0_Z_WINDOW_LOW <= p[2] && p[2] <= pt0Z + MAXR_PT0_Z_WINDOW_HIGH)
        : [];
    const pts = byAxis.length >= 8 ? byAxis : byZ.length >= 8 ? byZ : all;
    const band = maxRadiusBand(pts);
    bands.push(band);
    duals.push(pickDual(band, pts));
    if (band.length) {
      const rep = band.reduce((a, p) => (radius(p) > radius(a) ? p : a), band[0]);
      reps.push([idx, rep.slice(), radius(rep), axial(rep)]);
    }
  });
  if (!bands.length || !reps.length) return [];
  const zHint = median(reps.map((r) => r[1][2])) ?? reps[0][1][2];
  const aHint = median(reps.map((r) => r[3])) ?? reps[0][3];
  const sortedReps = reps.slice().sort((a, b) => b[2] - a[2]);
  const topN = Math.max(1, Math.round(sortedReps.length * 0.25));
  let startIdx = -1;
  let startPt = null;
  let bestKey = null;
  for (const [idx, p, r, a] of sortedReps.slice(0, topN)) {
    const key = [-Math.abs(a - aHint), r];
    if (!bestKey || tupleGreater(key, bestKey)) {
      bestKey = key;
      startIdx = idx;
      startPt = p;
    }
  }
  if (startIdx < 0) return [];
  const single = [startPt.slice()];
  let last = startPt;
  const total = bands.length;
  for (let step = 1; step < total; step += 1) {
    const band = bands[(startIdx + step) % total];
    if (!band.length) continue;
    const bestR = Math.max(...band.map(radius));
    const near = band.filter((p) => radius(p) >= bestR * 0.985);
    const pool = near.length ? near : band;
    let best = pool[0];
    let bestK = null;
    for (const p of pool) {
      const k = [dist3(p, last), Math.abs(p[2] - last[2]), Math.abs(p[2] - zHint), Math.abs(axial(p) - aHint), -radius(p)];
      if (!bestK || tupleGreater(bestK, k)) {
        bestK = k;
        best = p;
      }
    }
    single.push(best.slice());
    last = best;
  }
  if (single.length > 2) single.push(single[0].slice());
  const tracedDual = orderByAxisAzimuth(dedupQuantized(duals.flat()));
  const tracedBand = orderByAxisAzimuth(dedupQuantized(bands.flat()));
  const covSingle = coverage(single.length > 1 ? single.slice(0, -1) : single);
  const covDual = coverage(tracedDual.length > 1 ? tracedDual.slice(0, -1) : tracedDual);
  const covBand = coverage(tracedBand.length > 1 ? tracedBand.slice(0, -1) : tracedBand);
  const candidates = [
    ["single_trace", single, covSingle],
    ["dual_reconstructed", tracedDual, covDual],
    ["band_reconstructed", tracedBand, covBand],
  ];
  const keyOf = ([, pts, cov]) => [pts && pts.length >= 8 ? 1 : 0, cov, pts ? pts.length : 0];
  const maxBy = (list) => list.reduce((a, c) => (tupleGreater(keyOf(c), keyOf(a)) ? c : a), list[0]);
  const sparse = single.length < Math.max(10, Math.floor(planes.length / 3));
  if (sparse || covSingle < 4.8) {
    const recon = maxBy(candidates.slice(1));
    if (recon && keyOf(recon)[0] === 1) return recon[1];
  }
  const best = maxBy(candidates);
  return best[1].length ? best[1] : single;
}

function extractLowestBoundaryLoopPoints(mesh, refPt0, refPt0Radius) {
  const loops = nakedEdgeLoops(mesh);
  if (!loops.length) return null;
  const pts = pickBestEdgeLoopPoints(loops, 1e-6, refPt0, refPt0Radius, meshMaxRadiusInZBand(mesh), true);
  if (!pts || pts.length < 3) return null;
  return validateFinishlinePoints(pts)[0] ? pts : null;
}

/**
 * detect_finish_line 이식.
 * @param {Mesh} mesh unweldedByAngle() 메시(정렬 완료)
 */
export function detectFinishLine(mesh, { log = () => {} } = {}) {
  const pt0 = selectPt0(mesh);
  const pt0Radius = radiusXY(pt0);
  let [traced, strategy] = detectFinishlinePointsEdge(mesh, log);
  if (traced && traced.length >= 3) {
    const minZ = pointsMinZ(traced);
    if (minZ != null && minZ <= EDGE_MIN_Z_VALID_THRESHOLD_MM) traced = null;
    else [traced] = acceptOrNormalize(traced, false, log, "edge result");
  } else traced = null;

  if (!traced) {
    const axis = estimateTiltAxis(mesh);
    const planes = buildSectionPlanes(axis);
    let sectionPts = null;
    try {
      sectionPts = detectMaxRadiusTrack(mesh, planes, axis, pt0);
    } catch (error) {
      log(`[detect] section tracking raised exception: ${error?.message || error}`);
    }
    if (!sectionPts || sectionPts.length < 3) {
      const legacy = extractLowestBoundaryLoopPoints(mesh, pt0, pt0Radius);
      if (legacy) {
        traced = legacy;
        strategy = "LEGACY_LOWEST_BOUNDARY";
      } else strategy = "SECTION_FAILED";
    } else {
      const [accepted, ok] = acceptOrNormalize(sectionPts, true, log, "section result");
      if (ok) {
        traced = accepted;
        strategy = `SECTION_MAX_RADIUS_TRACK_${SECTION_COUNT}x${SECTION_STEP_DEG.toFixed(1)}_FALLBACK`;
      } else strategy = "SECTION_FAILED";
    }
  }
  if (!traced || traced.length < 3) {
    throw new Error(`edge/단면추적 모두 피니시라인 점을 찾지 못했습니다 | strategy=${strategy}`);
  }
  return { pt0, points: traced, strategyUsed: strategy };
}

/** process_abutment_stl._sanitize_finishline_points */
export function sanitizeFinishlinePoints(points, log = () => {}) {
  let pts = (points || []).map((p) => p.slice());
  if (pts.length < 3) return pts;
  if (dist3(pts[0], pts[pts.length - 1]) <= 1e-4) pts = pts.slice(0, -1);
  if (pts.length < 3) return pts;
  const n = pts.length;
  const segLens = pts.map((p, i) => dist3(p, pts[(i + 1) % n]));
  const ordered = segLens.slice().sort((a, b) => a - b);
  const med = ordered[ordered.length >> 1] || 0;
  const maxLen = Math.max(...segLens);
  const maxIdx = segLens.indexOf(maxLen);
  if (maxIdx >= 0 && maxLen >= 2.0 && maxLen >= (med > 1e-9 ? med * 2.8 : 2.0)) {
    const start = (maxIdx + 1) % n;
    pts = pts.slice(start).concat(pts.slice(0, start));
    log(`[finishline-clean] rotated seam at edge=${maxIdx} max_len=${maxLen.toFixed(4)}`);
  }
  return pts;
}

/** process_abutment_stl._extract_finishline_z_extrema */
export function finishlineZExtrema(points) {
  let minPt = null;
  let maxPt = null;
  for (const p of points || []) {
    if (!minPt || p[2] < minPt[2]) minPt = p;
    if (!maxPt || p[2] > maxPt[2]) maxPt = p;
  }
  if (!minPt) return { min_z: null, max_z: null, min_z_point: null, max_z_point: null };
  return { min_z: minPt[2], max_z: maxPt[2], min_z_point: minPt.slice(), max_z_point: maxPt.slice() };
}
