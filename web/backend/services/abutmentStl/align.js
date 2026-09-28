// related files:
// - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py (원본, 동작 SSOT)
// - web/backend/services/abutmentStl/meshCore.js
// - web/backend/services/abutmentStl/pipeline.js
//
// align_stl_coordinate.py의 JS 이식. 상수·순서·채점식은 원본과 같게 유지한다.
// 원본을 고치면 여기도 같이 고친다(섀도 비교가 깨진다).
import {
  meshZSection,
  rotationAxisAngle,
  rotationFromTo,
  normalize,
} from "./meshCore.js";

export const ALIGN_MODULE_VERSION = "2026-08-18.connection-z-origin-v1";
export const JS_ALIGN_PORT_VERSION = "js-1";
const DEFAULT_TARGET_DIAMETER = 3.33;
const HEX_RESIDUAL_TARGET_DEG = 0.01;

const HOLE_AXIS_BASE_SAMPLE_COUNT = 16;
const HOLE_AXIS_REFINEMENT_SAMPLE_COUNT = 8;
const HOLE_AXIS_RMSE_EARLY_ACCEPT = 0.08;
const HOLE_AXIS_THREE_SECTION_SETS = [
  [0.18, 0.42, 0.66],
  [0.22, 0.5, 0.78],
  [0.28, 0.56, 0.82],
];
const HOLE_AXIS_ORIGIN_WINDOW_MM = 1.6;
const HOLE_AXIS_ORIGIN_SECTION_OFFSETS_MM = [
  [-0.95, 0.0, 0.95],
  [-0.7, 0.0, 0.7],
  [-1.2, 0.0, 1.2],
];
const SCREW_HOLE_DIAMETER_HINT_MM = 2.0;
const DIAMETER_SAMPLING_COARSE_COUNT = 56;
const DIAMETER_SAMPLING_FINE_COUNT = 24;
const DIAMETER_SAMPLING_FINE_WINDOW_MM = 1.2;
const HEX_ROBUST_INLIER_DEG = 6.5;

const IMPLANT_CONNECTION_DIAMETERS = {
  "OSSTEM|TS3|REGULAR": 3.35,
  "OSSTEM|TS3|MINI": 2.6,
  "DENTIUM|SUPERLINE|REGULAR": 3.33,
  "NEOBIOTECH|IS ALX|REGULAR": 3.35,
  "NEOBIOTECH|IS ALX|SMALL NARROW": 2.6,
  "DIO|UF|REGULAR": 3.35,
  "DIO|UF|NARROW": 2.3,
  "MEGAGEN|ANYONE|REGULAR": 3.3,
  "MEGAGEN|ANYONE|MINI": 3.1,
  "MEGAGEN|MINI INTERNAL|": 2.3,
  "DENTIS|SQ ONE Q|REGULAR": 3.35,
  "DENTIS|SQ ONE Q|MINI": 2.8,
  "DENTIS|SQ ONE Q|NARROW": 2.3,
};
const SYSTEM_ALIASES = {
  TS: "TS3",
  TS3: "TS3",
  SUPERLINE: "SUPERLINE",
  IS: "IS ALX",
  ALX: "IS ALX",
  "IS ALX": "IS ALX",
  UF: "UF",
  ANYONE: "ANYONE",
  "MINI INTERNAL": "MINI INTERNAL",
  SQ: "SQ ONE Q",
  "ONE Q": "SQ ONE Q",
  "SQ ONE Q": "SQ ONE Q",
};
const SPEC_ALIASES = {
  REGULAR: "REGULAR",
  MINI: "MINI",
  NARROW: "NARROW",
  "SMALL NARROW": "SMALL NARROW",
  "MINI INTERNAL": "MINI INTERNAL",
};
const IGNORED_SPEC_TOKENS = new Set(["HEX", "NON HEX", "NONHEX"]);

const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

function normalizeText(value) {
  if (value == null) return "";
  let s = String(value).trim().toUpperCase();
  if (!s) return "";
  for (const ch of ["/", "-", "_", "(", ")", "[", "]", ",", "."]) {
    s = s.split(ch).join(" ");
  }
  return s.split(/\s+/).filter(Boolean).join(" ");
}

function normalizeSystem(value) {
  const s = normalizeText(value);
  return s ? SYSTEM_ALIASES[s] || s : "";
}

function normalizeSpec(value) {
  const s = normalizeText(value);
  if (!s || IGNORED_SPEC_TOKENS.has(s)) return "";
  return SPEC_ALIASES[s] || s;
}

function candidateValues(values, normalizer) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const v = normalizer(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function resolveTargetDiameter(targetDiameter, implantProfile) {
  const td = Number(targetDiameter);
  if (targetDiameter != null && td > 0) return [td, "explicit"];
  const p = implantProfile || {};
  const manufacturer = normalizeText(p.manufacturer || p.implantManufacturer);
  if (manufacturer) {
    const systems = candidateValues(
      [p.system, p.implantSystem, p.brand, p.implantBrand, p.family, p.implantFamily],
      normalizeSystem,
    );
    const specs = candidateValues(
      [
        p.spec,
        p.specification,
        p.implantSpec,
        p.type,
        p.implantType,
        p.family,
        p.implantFamily,
      ],
      normalizeSpec,
    );
    for (const sys of systems) {
      for (const spec of specs) {
        const key = `${manufacturer}|${sys}|${spec}`;
        if (key in IMPLANT_CONNECTION_DIAMETERS) {
          return [IMPLANT_CONNECTION_DIAMETERS[key], `implant_profile:${manufacturer}/${sys}/${spec}`];
        }
      }
      const keyNoSpec = `${manufacturer}|${sys}|`;
      if (keyNoSpec in IMPLANT_CONNECTION_DIAMETERS) {
        return [IMPLANT_CONNECTION_DIAMETERS[keyNoSpec], `implant_profile:${manufacturer}/${sys}/`];
      }
    }
  }
  return [DEFAULT_TARGET_DIAMETER, "default"];
}

function sectionMetrics(polyline) {
  let points = polyline.map((p) => [p[0], p[1]]);
  if (points.length >= 2) {
    const [x0, y0] = points[0];
    const [x1, y1] = points[points.length - 1];
    if (Math.hypot(x1 - x0, y1 - y0) <= 1e-6) points = points.slice(0, -1);
  }
  if (points.length < 3) return null;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  const radii = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const rMax = Math.max(...radii);
  if (rMax <= 1e-8) return null;
  const rCut = rMax * 0.8;
  let outer = radii.filter((r) => r >= rCut);
  if (!outer.length) outer = radii;
  const rMean = outer.reduce((s, r) => s + r, 0) / outer.length;
  const variance = outer.reduce((s, r) => s + (r - rMean) ** 2, 0) / outer.length;
  const rStd = Math.sqrt(Math.max(variance, 0));
  const rMinOuter = Math.min(...outer);
  return {
    cx,
    cy,
    r: rMax,
    d: rMax * 2,
    circularity: rStd / Math.max(rMean, 1e-9),
    hex_ratio: rMax / Math.max(rMinOuter, 1e-9),
    r_std: rStd,
  };
}

function zKey(z) {
  return Math.round(z / 1e-5) * 1e-5;
}

function sectionsAtZ(mesh, z, cache) {
  if (!cache) return meshZSection(mesh, z);
  const key = zKey(z);
  let hit = cache.get(key);
  if (!hit) {
    hit = meshZSection(mesh, z);
    cache.set(key, hit);
  }
  return hit;
}

function outerSectionMetricsAtZ(mesh, z, cache) {
  let best = null;
  for (const pl of sectionsAtZ(mesh, z, cache)) {
    const m = sectionMetrics(pl);
    if (m && (!best || m.r > best.r)) best = m;
  }
  return best;
}

function scoreConnectionZCandidate(z, metrics, targetDiameter, zMin, zMax) {
  const diameterErr = Math.abs(Number(metrics.d || 0) - Number(targetDiameter));
  const circ = Number(metrics.circularity || 0);
  const hexRatio = Number(metrics.hex_ratio || 1);
  const span = Math.max(zMax - zMin, 1e-6);
  const t = (z - zMin) / span;
  let score = diameterErr + 2.4 * circ;
  if (hexRatio >= 1.08) score += 0.55 + 0.85 * Math.min(hexRatio - 1.08, 0.6);
  if (t >= 0.78) score += 0.85;
  if (t <= 0.03) score += 0.25;
  return score;
}

function det3(a) {
  return (
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  );
}

function solve3x3(m, b) {
  const d = det3(m);
  if (Math.abs(d) <= 1e-12) return null;
  const m0 = [[b[0], m[0][1], m[0][2]], [b[1], m[1][1], m[1][2]], [b[2], m[2][1], m[2][2]]];
  const m1 = [[m[0][0], b[0], m[0][2]], [m[1][0], b[1], m[1][2]], [m[2][0], b[2], m[2][2]]];
  const m2 = [[m[0][0], m[0][1], b[0]], [m[1][0], m[1][1], b[1]], [m[2][0], m[2][1], b[2]]];
  return [det3(m0) / d, det3(m1) / d, det3(m2) / d];
}

function fitCircleXY(points) {
  const n = points.length;
  if (n < 6) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sq = 0, sxq = 0, syq = 0;
  for (const [x, y] of points) {
    const q = -(x * x + y * y);
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sq += q;
    sxq += x * q;
    syq += y * q;
  }
  const solved = solve3x3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [sxq, syq, sq],
  );
  if (!solved) return null;
  const [a, bb, c] = solved;
  const cx = -a / 2;
  const cy = -bb / 2;
  const r2 = cx * cx + cy * cy - c;
  if (r2 <= 1e-10) return null;
  const r = Math.sqrt(r2);
  const residuals = points.map(([x, y]) => Math.hypot(x - cx, y - cy) - r);
  const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length;
  return [cx, cy, r, Math.sqrt(Math.max(variance, 0))];
}

function holeCircleCandidate(polyline) {
  const pts = polyline.map((p) => [p[0], p[1]]);
  if (pts.length < 10) return null;
  let perimeter = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    perimeter += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  const closeGap = Math.hypot(
    pts[pts.length - 1][0] - pts[0][0],
    pts[pts.length - 1][1] - pts[0][1],
  );
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const closeTol = Math.max(0.05, 0.04 * Math.max(scale, 1));
  if (closeGap > closeTol) return null;
  if (perimeter < 3.0) return null;
  const fitted = fitCircleXY(pts);
  if (fitted) {
    const [cx, cy, r, rStd] = fitted;
    if (r > 0) {
      const rel = rStd / Math.max(r, 1e-9);
      if (!(rStd > 0.18 && rel > 0.12)) {
        return { cx, cy, r, r_std: rStd, perimeter, close_gap: closeGap, method: "circle_fit" };
      }
    }
  }
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length;
  const radii = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const sorted = [...radii].sort((a, b) => a - b);
  const n = sorted.length;
  const rMed = n % 2 === 1 ? sorted[n >> 1] : 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
  if (rMed <= 1e-8) return null;
  const mean = radii.reduce((s, v) => s + v, 0) / radii.length;
  const rStd = Math.sqrt(Math.max(radii.reduce((s, v) => s + (v - mean) ** 2, 0) / radii.length, 0));
  const rel = rStd / Math.max(rMed, 1e-9);
  if (rel > 0.55) return null;
  return { cx, cy, r: rMed, r_std: rStd, perimeter, close_gap: closeGap, method: "loop_centroid", ellipse_rel: rel };
}

function holeCandidatesAtZ(mesh, z, cache) {
  const out = [];
  for (const pl of sectionsAtZ(mesh, z, cache)) {
    const c = holeCircleCandidate(pl);
    if (c) out.push(c);
  }
  return out;
}

function findCircleAtZ(mesh, z, cache) {
  let best = null;
  for (const pl of sectionsAtZ(mesh, z, cache)) {
    const m = sectionMetrics(pl);
    if (m && (!best || m.r > best[2])) best = [m.cx, m.cy, m.r];
  }
  return best;
}

function wrapAngleDeg(value, period = 360) {
  const half = period * 0.5;
  return ((((value + half) % period) + period) % period) - half;
}

function angleDistanceDeg(a, b) {
  return Math.abs(wrapAngleDeg(a - b, 360));
}

function percentile(values, q) {
  if (!values.length) return null;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const arr = [...values].sort((a, b) => a - b);
  const pos = (arr.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return arr[lo];
  const t = pos - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

function hexPhaseFromObservations(observations) {
  if (!observations.length) return null;
  let sumW = 0;
  let sx = 0;
  let cx6 = 0;
  for (const [ang, w] of observations) {
    const ww = Math.max(w, 1e-9);
    const a6 = rad(6 * ang);
    sx += ww * Math.sin(a6);
    cx6 += ww * Math.cos(a6);
    sumW += ww;
  }
  if (sumW <= 1e-12 || (Math.abs(sx) <= 1e-9 && Math.abs(cx6) <= 1e-9)) return null;
  return {
    phase_deg: deg(Math.atan2(sx, cx6)) / 6,
    coherence: Math.hypot(sx, cx6) / Math.max(sumW, 1e-12),
    sum_w: sumW,
  };
}

function nearestHexLatticeErrorDeg(angle, phase) {
  let best = 999;
  for (let k = 0; k < 6; k += 1) best = Math.min(best, angleDistanceDeg(angle, phase + 60 * k));
  return best;
}

function hexPhaseRobust(observations) {
  const base = hexPhaseFromObservations(observations);
  if (!base) return null;
  const phase0 = base.phase_deg;
  const inliers = [];
  for (const [ang, w] of observations) {
    const err = nearestHexLatticeErrorDeg(ang, phase0);
    if (err > HEX_ROBUST_INLIER_DEG) continue;
    const closeness = Math.max(0.05, 1 - err / Math.max(HEX_ROBUST_INLIER_DEG, 1e-6));
    inliers.push([ang, Math.max(w, 1e-9) * closeness]);
  }
  const raw = { ...base, inlier_count: 0, method: "face_normals_raw" };
  if (inliers.length < 12) return raw;
  const refined = hexPhaseFromObservations(inliers);
  if (!refined) return raw;
  return { ...refined, inlier_count: inliers.length, method: "face_normals_robust" };
}

function filterHexObservationsToOuterFlats(rawEntries, targetR) {
  if (!rawEntries.length) return [];
  const seedObs = rawEntries.map(([a, w]) => [a, w]);
  const seed = hexPhaseRobust(seedObs);
  if (!seed) return seedObs;
  const phase = seed.phase_deg;
  const angleInlier = 7.5;
  const clusters = Array.from({ length: 6 }, () => []);
  for (const [angle, weight, radial] of rawEntries) {
    let bestK = 0;
    let bestErr = 999;
    for (let k = 0; k < 6; k += 1) {
      const err = angleDistanceDeg(angle, phase + 60 * k);
      if (err < bestErr) {
        bestErr = err;
        bestK = k;
      }
    }
    if (bestErr <= angleInlier) clusters[bestK].push([angle, weight, radial, bestErr]);
  }
  if (clusters.filter((c) => c.length >= 3).length < 4) return seedObs;
  let radialTol = 0.12;
  if (targetR != null && targetR > 1e-6) radialTol = Math.max(0.06, Math.min(0.24, targetR * 0.1));
  const filtered = [];
  for (const entries of clusters) {
    if (entries.length < 2) continue;
    const rHi = percentile(entries.map((e) => e[2]), 0.9);
    if (rHi == null) continue;
    for (const [angle, weight, radial, err] of entries) {
      if (radial < rHi - radialTol) continue;
      const angleCloseness = Math.max(0.2, 1 - err / Math.max(angleInlier, 1e-6));
      const outerness = Math.max(0.25, 1 - Math.max(0, rHi - radial) / Math.max(radialTol, 1e-6));
      filtered.push([angle, Math.max(weight * angleCloseness * outerness, 1e-9)]);
    }
  }
  return filtered.length >= 12 ? filtered : seedObs;
}

function collectHexFaceNormalObservations(mesh, explicitTargetDiameter) {
  const { min, max } = mesh.bbox();
  const zSpan = Math.max(0, max[2] - min[2]);
  const dynMin = 0.5;
  const dynMax = Math.min(4.5, Math.max(1.8, zSpan * 0.36));
  const zBands = [
    [-2.8, -1.2],
    [1.2, 2.8],
    [-dynMax, -dynMin],
    [dynMin, dynMax],
  ];
  const { normals, areas } = mesh.faceNormals();
  const faceCount = mesh.faceCount;
  const stride = faceCount > 90000 ? 3 : faceCount > 60000 ? 2 : 1;
  let radialMin = 0.45;
  let radialMax = 4.2;
  let targetR = null;
  const td = Number(explicitTargetDiameter);
  if (explicitTargetDiameter != null && td > 0) {
    targetR = td * 0.5;
    radialMin = Math.max(0.45, targetR * 0.5);
    radialMax = Math.min(4.0, targetR * 1.95);
  }
  const v = mesh.verts;
  const f = mesh.faces;
  const raw = [];
  for (let fi = 0; fi < faceCount; fi += stride) {
    const nz = normals[fi * 3 + 2];
    if (Math.abs(nz) > 0.12) continue;
    const a = f[fi * 3] * 3;
    const b = f[fi * 3 + 1] * 3;
    const c = f[fi * 3 + 2] * 3;
    const cz = (v[a + 2] + v[b + 2] + v[c + 2]) / 3;
    const cx = (v[a] + v[b] + v[c]) / 3;
    const cy = (v[a + 1] + v[b + 1] + v[c + 1]) / 3;
    let inBand = false;
    for (const [z0, z1] of zBands) {
      const zFrom = Math.max(Math.min(z0, z1), min[2]);
      const zTo = Math.min(Math.max(z0, z1), max[2]);
      if (zTo - zFrom < 0.05) continue;
      if (zFrom <= cz && cz <= zTo) {
        inBand = true;
        break;
      }
    }
    if (!inBand) continue;
    const radial = Math.hypot(cx, cy);
    if (radial < radialMin || radial > radialMax) continue;
    const angle = deg(Math.atan2(normals[fi * 3 + 1], normals[fi * 3]));
    const sideWeight = Math.max(0, 1 - Math.abs(nz));
    raw.push([angle, Math.max(areas[fi] * sideWeight, 1e-6), radial]);
  }
  if (!raw.length) return [];
  let filteredRaw = raw;
  if (targetR != null) {
    const tMin = Math.max(0.55, targetR * 0.62);
    const tMax = Math.min(2.9, targetR * 1.45);
    const tight = raw.filter((t) => tMin <= t[2] && t[2] <= tMax);
    if (tight.length >= Math.max(18, Math.floor(raw.length * 0.18))) filteredRaw = tight;
  }
  const weighted = filteredRaw.map(([angle, weight, radial]) => {
    if (targetR != null && targetR > 1e-6) {
      const dr = Math.abs(radial - targetR);
      const band = Math.max(0.35, targetR * 0.55);
      const rw = Math.max(0.2, 1 - dr / band);
      return [angle, Math.max(weight * rw, 1e-9), radial];
    }
    return [angle, weight, radial];
  });
  return filterHexObservationsToOuterFlats(weighted, targetR);
}

function measureHexResidual(observations) {
  if (!observations.length) return null;
  const solved = hexPhaseRobust(observations);
  if (!solved) return null;
  const phaseMod = wrapAngleDeg(solved.phase_deg, 60);
  return {
    residual_deg: Math.abs(-phaseMod),
    phase_mod_deg: phaseMod,
    method: `hex6face_phase_postcheck_${solved.method || "raw"}`,
    samples: observations.length,
    coherence: solved.coherence,
    inlier_count: solved.inlier_count || 0,
  };
}

function measureHexTelemetry(mesh, explicitTargetDiameter, log) {
  const observations = collectHexFaceNormalObservations(mesh, explicitTargetDiameter);
  const residual = measureHexResidual(observations);
  if (!residual) {
    return [false, "Could not estimate hex angle from 6 faces", { error: "initial_residual_unavailable" }];
  }
  const phaseMod = residual.phase_mod_deg;
  const virtualApplied = -phaseMod;
  const initialResidual = residual.residual_deg;
  let virtualResidual = null;
  try {
    const probe = mesh.clone();
    if (Math.abs(virtualApplied) >= 1e-9) {
      probe.transform(rotationAxisAngle([0, 0, 1], rad(virtualApplied)));
    }
    virtualResidual = measureHexResidual(
      collectHexFaceNormalObservations(probe, explicitTargetDiameter),
    );
  } catch {
    virtualResidual = null;
  }
  log(
    `Hex telemetry-only: before_to_X=${phaseMod.toFixed(6)}deg virtual_applied=${virtualApplied.toFixed(6)}deg residual_to_X=${initialResidual.toFixed(6)}deg method=${residual.method} samples=${residual.samples}`,
  );
  const telemetry = {
    initial_phase_mod_deg: phaseMod,
    initial_residual_deg: initialResidual,
    applied_rotation_deg: virtualApplied,
    final_residual_deg: initialResidual,
    final_phase_mod_deg: phaseMod,
    method: residual.method,
    samples: residual.samples,
  };
  if (virtualResidual) {
    telemetry.virtual_residual_deg = virtualResidual.residual_deg;
    telemetry.virtual_method = virtualResidual.method;
  }
  return [true, "Hex angle measured (telemetry-only, no mesh rotation)", telemetry];
}

function estimatePrincipalAxis(mesh, maxIters = 24) {
  const v = mesh.verts;
  const n = mesh.vertexCount;
  if (n < 3) return null;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i += 1) {
    mx += v[i * 3];
    my += v[i * 3 + 1];
    mz += v[i * 3 + 2];
  }
  mx /= n;
  my /= n;
  mz /= n;
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = v[i * 3] - mx;
    const dy = v[i * 3 + 1] - my;
    const dz = v[i * 3 + 2] - mz;
    cxx += dx * dx;
    cxy += dx * dy;
    cxz += dx * dz;
    cyy += dy * dy;
    cyz += dy * dz;
    czz += dz * dz;
  }
  const { min, max } = mesh.bbox();
  const lx = max[0] - min[0];
  const ly = max[1] - min[1];
  const lz = max[2] - min[2];
  let vec = lx >= ly && lx >= lz ? [1, 0, 0] : ly >= lx && ly >= lz ? [0, 1, 0] : [0, 0, 1];
  for (let i = 0; i < Math.max(4, maxIters); i += 1) {
    const nx = cxx * vec[0] + cxy * vec[1] + cxz * vec[2];
    const ny = cxy * vec[0] + cyy * vec[1] + cyz * vec[2];
    const nz = cxz * vec[0] + cyz * vec[1] + czz * vec[2];
    const norm = Math.hypot(nx, ny, nz);
    if (norm <= 1e-12) return null;
    vec = [nx / norm, ny / norm, nz / norm];
  }
  return normalize(vec);
}

function rotateLongestAxisToZ(mesh, log) {
  const { min, max } = mesh.bbox();
  const lx = max[0] - min[0];
  const ly = max[1] - min[1];
  const lz = max[2] - min[2];
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  log(`BBox lengths: X=${lx.toFixed(3)} Y=${ly.toFixed(3)} Z=${lz.toFixed(3)}`);
  if (lz >= lx && lz >= ly) {
    log("BBox longest axis already Z; skip principal-axis rotation");
    return false;
  }
  let principal = estimatePrincipalAxis(mesh);
  if (!principal) {
    const from = lx >= ly && lx >= lz ? [1, 0, 0] : ly >= lx && ly >= lz ? [0, 1, 0] : null;
    if (!from) return false;
    mesh.transform(rotationFromTo(from, [0, 0, 1], center));
    return true;
  }
  if (principal[2] < 0) principal = principal.map((c) => -c);
  const angleDeg = deg(Math.acos(Math.max(-1, Math.min(1, principal[2]))));
  log(`Principal axis: (${principal.map((c) => c.toFixed(5)).join(", ")}), angle_to_Z=${angleDeg.toFixed(4)}deg`);
  if (angleDeg <= 1e-3) return false;
  mesh.transform(rotationFromTo(principal, [0, 0, 1], center));
  return true;
}

function pickInnerHoleCircle(candidates, bcx, bcy, prev, targetDiameter, holeDiameterHint) {
  if (!candidates.length) return null;
  const outer = candidates.reduce((a, c) => (c.r > a.r ? c : a), candidates[0]);
  const outerR = outer.r;
  let targetR = null;
  if (targetDiameter != null && Number(targetDiameter) > 0) targetR = Number(targetDiameter) * 0.5;
  let minR = 0.15;
  let maxR = 2.4;
  let expectedR = 0.75;
  let holeR = null;
  if (holeDiameterHint != null && Number(holeDiameterHint) > 0) holeR = Number(holeDiameterHint) * 0.5;
  if (holeR != null) {
    expectedR = Math.max(0.35, Math.min(1.8, holeR));
    minR = Math.max(0.12, expectedR * 0.35);
    maxR = Math.min(2.8, Math.max(1.4, expectedR * 2.0));
  } else if (targetR != null) {
    expectedR = Math.max(0.45, Math.min(1.6, targetR * 0.35));
    maxR = Math.max(1.8, Math.min(2.6, targetR * 0.95));
  }
  const scored = [];
  for (const c of candidates) {
    if (c.r < minR || c.r > maxR) continue;
    if (candidates.length >= 2 && c === outer && outerR >= 3.8) continue;
    if (candidates.length >= 2 && outerR >= 3.8 && c.r >= outerR * 0.95) continue;
    const distBbox = Math.hypot(c.cx - bcx, c.cy - bcy);
    const drExp = Math.abs(c.r - expectedR);
    let score;
    let distPrev = 0;
    let dr = 0;
    if (!prev) {
      score = 0.85 * distBbox + 0.95 * drExp + 0.65 * c.r_std;
    } else {
      distPrev = Math.hypot(c.cx - prev[0], c.cy - prev[1]);
      dr = Math.abs(c.r - prev[2]);
      score = 2.25 * distPrev + 1.45 * dr + 0.55 * distBbox + 0.85 * drExp + 0.55 * c.r_std;
    }
    scored.push([score, distPrev, dr, c]);
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a[0] - b[0]);
  const [, bestDistPrev, bestDr, best] = scored[0];
  if (prev && (bestDistPrev > 1.2 || bestDr > 0.8)) return null;
  return [best.cx, best.cy, best.r];
}

function fitLine(points) {
  const zs = points.map((p) => p[0]);
  const xs = points.map((p) => p[1]);
  const ys = points.map((p) => p[2]);
  const mz = zs.reduce((s, v) => s + v, 0) / zs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const szz = zs.reduce((s, z) => s + (z - mz) ** 2, 0);
  if (szz <= 1e-12) return null;
  let sxz = 0;
  let syz = 0;
  for (let i = 0; i < zs.length; i += 1) {
    sxz += (zs[i] - mz) * (xs[i] - mx);
    syz += (zs[i] - mz) * (ys[i] - my);
  }
  const ax = sxz / szz;
  const ay = syz / szz;
  const dir = normalize([ax, ay, 1]);
  let err2 = 0;
  for (const [z, x, y] of points) {
    err2 += (x - (mx + ax * (z - mz))) ** 2 + (y - (my + ay * (z - mz))) ** 2;
  }
  return {
    axis_point: [mx, my, mz],
    axis_dir: dir,
    avg_radius: points.reduce((s, p) => s + p[3], 0) / points.length,
    samples: points.length,
    rmse: Math.sqrt(Math.max(err2 / points.length, 0)),
  };
}

function fitHoleAxisThreeSections(mesh, targetDiameter, cache, hint) {
  const { min, max } = mesh.bbox();
  const zMin = min[2];
  const zSpan = max[2] - min[2];
  if (zSpan <= 0.01) return null;
  const bcx = (min[0] + max[0]) / 2;
  const bcy = (min[1] + max[1]) / 2;
  let best = null;
  for (const fracs of HOLE_AXIS_THREE_SECTION_SETS) {
    const points = [];
    let prev = null;
    for (const frac of fracs) {
      const z = zMin + zSpan * frac;
      const hole = pickInnerHoleCircle(holeCandidatesAtZ(mesh, z, cache), bcx, bcy, prev, targetDiameter, hint);
      if (!hole) {
        points.length = 0;
        break;
      }
      points.push([z, hole[0], hole[1], hole[2]]);
      prev = hole;
    }
    if (points.length < 3) continue;
    const cand = fitLine(points);
    if (!cand) continue;
    cand.method = "three_sections";
    if (!best || cand.rmse < best.rmse) best = cand;
  }
  return best;
}

function fitHoleAxisNearOrigin(mesh, targetDiameter, cache, hint) {
  const { min, max } = mesh.bbox();
  const zMin = min[2];
  const zMax = max[2];
  const zSpan = zMax - zMin;
  if (zSpan <= 0.01) return null;
  const bcx = (min[0] + max[0]) / 2;
  const bcy = (min[1] + max[1]) / 2;
  const half = Math.max(0.7, Math.min(HOLE_AXIS_ORIGIN_WINDOW_MM, Math.max(0.8, zSpan * 0.25)));
  let best = null;
  for (const offsets of HOLE_AXIS_ORIGIN_SECTION_OFFSETS_MM) {
    const points = [];
    let prev = null;
    for (const dz of offsets) {
      const z = Math.max(zMin, Math.min(zMax, dz));
      if (Math.abs(z) > half + 1e-9) {
        points.length = 0;
        break;
      }
      const hole = pickInnerHoleCircle(holeCandidatesAtZ(mesh, z, cache), bcx, bcy, prev, targetDiameter, hint);
      if (!hole) {
        points.length = 0;
        break;
      }
      points.push([z, hole[0], hole[1], hole[2]]);
      prev = hole;
    }
    if (points.length < 3) continue;
    const cand = fitLine(points);
    if (!cand) continue;
    cand.method = "three_sections_origin";
    if (!best || cand.rmse < best.rmse) best = cand;
  }
  return best;
}

function fitHoleAxisBands(mesh, sampleCount, targetDiameter, cache, hint, log) {
  const { min, max } = mesh.bbox();
  const zMin = min[2];
  const zSpan = max[2] - min[2];
  if (zSpan <= 0.01) return null;
  const bcx = (min[0] + max[0]) / 2;
  const bcy = (min[1] + max[1]) / 2;
  const bands = [
    [0.08, 0.66, Math.max(8, sampleCount)],
    [0.08, 0.78, Math.max(8, Math.round(sampleCount * 0.72))],
    [0.1, 0.9, Math.max(8, Math.round(sampleCount * 0.55))],
  ];
  let best = null;
  for (const [r0, r1, n] of bands) {
    const points = [];
    let prev = null;
    const zStart = zMin + zSpan * r0;
    const zEnd = zMin + zSpan * r1;
    if (zEnd - zStart <= 0.02) continue;
    for (let i = 0; i < Math.max(6, n); i += 1) {
      const t = (i + 0.5) / Math.max(1, n);
      const z = zStart + (zEnd - zStart) * t;
      const hole = pickInnerHoleCircle(holeCandidatesAtZ(mesh, z, cache), bcx, bcy, prev, targetDiameter, hint);
      if (!hole) continue;
      points.push([z, hole[0], hole[1], hole[2]]);
      prev = hole;
    }
    if (points.length < 5) continue;
    const cand = fitLine(points);
    if (!cand) continue;
    cand.band = [r0, r1];
    if (!best) best = cand;
    else {
      const key = (c) => [c.samples >= 8 ? 1 : 0, -c.rmse, c.samples];
      const kb = key(best);
      const kc = key(cand);
      if (kc[0] > kb[0] || (kc[0] === kb[0] && (kc[1] > kb[1] || (kc[1] === kb[1] && kc[2] > kb[2])))) {
        best = cand;
      }
    }
    if (cand.samples >= 8 && cand.rmse <= HOLE_AXIS_RMSE_EARLY_ACCEPT) break;
  }
  if (!best) log("Hole-axis fit skipped: no valid candidate in all bands");
  return best;
}

function fitHoleAxisPreferred(mesh, sampleCount, targetDiameter, preferOrigin, hint, log) {
  const cache = new Map();
  if (preferOrigin) {
    const o = fitHoleAxisNearOrigin(mesh, targetDiameter, cache, hint);
    if (o) return o;
  }
  const p = fitHoleAxisThreeSections(mesh, targetDiameter, cache, hint);
  if (p) return p;
  return fitHoleAxisBands(mesh, sampleCount, targetDiameter, cache, hint, log);
}

function tiltToZDeg(dir) {
  const u = normalize(dir);
  if (!u[0] && !u[1] && !u[2]) return null;
  return deg(Math.acos(Math.max(-1, Math.min(1, Math.abs(u[2])))));
}

function alignScrewHoleAxisToZ(mesh, targetDiameter, preferOrigin, hint, log) {
  const refit = (refine) =>
    fitHoleAxisPreferred(
      mesh,
      refine ? HOLE_AXIS_REFINEMENT_SAMPLE_COUNT : HOLE_AXIS_BASE_SAMPLE_COUNT,
      targetDiameter,
      preferOrigin,
      hint,
      log,
    );
  let info = refit(false);
  if (!info) return [false, "Could not detect screw hole axis"];
  let totalDx = 0;
  let totalDy = 0;
  for (let it = 0; it < 3; it += 1) {
    const p0 = info.axis_point;
    if (Math.abs(p0[0]) > 1e-4 || Math.abs(p0[1]) > 1e-4) {
      const dx = -p0[0];
      const dy = -p0[1];
      mesh.translate(dx, dy, 0);
      totalDx += dx;
      totalDy += dy;
      const info2 = refit(true);
      if (info2) info = info2;
    }
    const tilt = tiltToZDeg(info.axis_dir);
    log(
      `Screw hole axis(iter=${it + 1}): method=${info.method || "unknown"} dir=(${info.axis_dir.map((c) => c.toFixed(5)).join(", ")}) tilt_to_Z=${tilt == null ? "nan" : tilt.toFixed(4)}deg samples=${info.samples}`,
    );
    if (tilt != null && tilt <= 0.2) break;
    mesh.transform(rotationFromTo(info.axis_dir, [0, 0, 1], info.axis_point));
    const info2 = refit(true);
    if (!info2) break;
    info = info2;
  }
  const finalTilt = tiltToZDeg(info.axis_dir);
  return [
    true,
    `Screw hole aligned to Z; method=${info.method || "unknown"}; final_tilt_to_Z_deg=${finalTilt == null ? "nan" : finalTilt.toFixed(4)}; total_xy_shift=(${totalDx.toFixed(5)},${totalDy.toFixed(5)})`,
  ];
}

function enforceLongerSideToPlusZ(mesh, log, eps = 0.03) {
  const { min, max } = mesh.bbox();
  const upper = Math.max(0, max[2]);
  const lower = Math.max(0, -min[2]);
  log(`Length-probe orientation: upper_len(+Z)=${upper.toFixed(4)} lower_len(-Z)=${lower.toFixed(4)}`);
  if (upper + eps < lower) {
    mesh.transform(rotationAxisAngle([1, 0, 0], Math.PI));
    log("Flipped mesh 180° around X: enforced longer side to +Z");
    return true;
  }
  return false;
}

function findZForDiameterBinary(mesh, targetDiameter, zMin, zMax, cache, tol = 0.01) {
  const targetR = targetDiameter / 2;
  let lo = zMin;
  let hi = zMax;
  for (let it = 0; it < 50 && hi - lo > 0.001; it += 1) {
    const mid = (lo + hi) / 2;
    const res = findCircleAtZ(mesh, mid, cache);
    if (!res) {
      hi = mid;
      continue;
    }
    if (Math.abs(res[2] - targetR) < tol) return mid;
    if (res[2] > targetR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function findBestZForDiameterBySampling(mesh, targetDiameter, zMin, zMax, sampleCount, cache, log) {
  if (zMax - zMin <= 1e-6) return [null, null, null];
  const budget = Math.max(16, sampleCount);
  const coarseN = Math.max(24, Math.min(DIAMETER_SAMPLING_COARSE_COUNT, budget));
  const fineN = Math.max(8, Math.min(DIAMETER_SAMPLING_FINE_COUNT, budget - coarseN));
  let best = null;
  const consider = (z) => {
    const m = outerSectionMetricsAtZ(mesh, z, cache);
    if (!m) return;
    const err = Math.abs(m.d - targetDiameter);
    const score = scoreConnectionZCandidate(z, m, targetDiameter, zMin, zMax);
    if (!best || score < best[0]) best = [score, err, z, m];
  };
  for (let i = 0; i < coarseN; i += 1) consider(zMin + (zMax - zMin) * ((i + 0.5) / coarseN));
  if (!best) return [null, null, null];
  const zBest = best[2];
  const win = Math.min(Math.max(0.25, DIAMETER_SAMPLING_FINE_WINDOW_MM), Math.max(0.3, (zMax - zMin) * 0.35));
  const fMin = Math.max(zMin, zBest - win);
  const fMax = Math.min(zMax, zBest + win);
  if (fMax - fMin > 1e-6 && fineN > 0) {
    for (let i = 0; i < fineN; i += 1) consider(fMin + (fMax - fMin) * ((i + 0.5) / fineN));
  }
  const [score, err, z, m] = best;
  log(
    `Diameter sample pick: z=${z.toFixed(3)} d=${m.d.toFixed(3)} err=${err.toFixed(4)} score=${score.toFixed(4)} circ=${m.circularity.toFixed(4)} hexR=${m.hex_ratio.toFixed(3)}`,
  );
  return [z, err, [m.cx, m.cy, m.r]];
}

function translateZToTargetDiameterZero(mesh, targetDiameter, stage, preferNegative, log) {
  const { min, max } = mesh.bbox();
  const zMin = min[2];
  const zMax = max[2];
  const zSpan = zMax - zMin;
  const cache = new Map();
  let zTarget = null;
  const [zFull] = findBestZForDiameterBySampling(mesh, targetDiameter, zMin, zMax, 120, cache, log);
  if (zFull != null) zTarget = zFull;
  if (preferNegative && zSpan > 1e-6) {
    const bandMin = zMin + zSpan * 0.05;
    const bandMax = zMin + zSpan * 0.72;
    const [zBand] = findBestZForDiameterBySampling(mesh, targetDiameter, bandMin, bandMax, 84, cache, log);
    if (zBand != null) {
      const mBand = outerSectionMetricsAtZ(mesh, zBand, cache);
      const mFull = zTarget != null ? outerSectionMetricsAtZ(mesh, zTarget, cache) : null;
      const sBand = mBand ? scoreConnectionZCandidate(zBand, mBand, targetDiameter, zMin, zMax) : 1e9;
      const sFull = mFull ? scoreConnectionZCandidate(zTarget, mFull, targetDiameter, zMin, zMax) : 1e9;
      if (zTarget == null || sBand <= sFull + 0.02) {
        zTarget = zBand;
        log(`${stage} Prefer lower-band Z: z=${zTarget.toFixed(3)}mm`);
      }
    }
  }
  if (zTarget == null) {
    zTarget = findZForDiameterBinary(mesh, targetDiameter, zMin, zMax, cache);
  }
  if (!findCircleAtZ(mesh, zTarget, cache)) {
    return [false, "Could not find circle at target Z height", null];
  }
  mesh.translate(0, 0, -zTarget);
  log(`${stage} Applied Z translation: ${(-zTarget).toFixed(3)}`);
  return [true, "ok", [0, 0, -zTarget]];
}

/**
 * align_mesh_to_origin 이식. mesh를 제자리에서 변환한다.
 * @returns {{ ok: boolean, message: string, translation: number[]|null, telemetry: object }}
 */
export function alignMeshToOrigin(mesh, { targetDiameter = null, implantProfile = null, log = () => {} } = {}) {
  if (!mesh || mesh.vertexCount === 0) {
    return { ok: false, message: "Invalid mesh", translation: null, telemetry: {} };
  }
  log(`align module version=${ALIGN_MODULE_VERSION} port=${JS_ALIGN_PORT_VERSION}`);
  rotateLongestAxisToZ(mesh, log);
  const [resolved, source] = resolveTargetDiameter(targetDiameter, implantProfile);
  log(`Target connection diameter: ${resolved.toFixed(4)}mm (source=${source})`);
  const explicit = Number(targetDiameter) > 0 ? Number(targetDiameter) : null;

  const z1 = translateZToTargetDiameterZero(mesh, resolved, "[Z-1]", false, log);
  if (!z1[0]) return { ok: false, message: z1[1] || "Z-1 alignment failed", translation: null, telemetry: {} };
  const z2 = translateZToTargetDiameterZero(mesh, resolved, "[Z-2]", true, log);
  if (!z2[0]) return { ok: false, message: z2[1] || "Z-2 alignment failed", translation: null, telemetry: {} };
  if (enforceLongerSideToPlusZ(mesh, log)) {
    const z2b = translateZToTargetDiameterZero(mesh, resolved, "[Z-2b]", true, log);
    if (!z2b[0]) return { ok: false, message: z2b[1] || "Z-2b alignment failed", translation: null, telemetry: {} };
  }
  const [okHole, holeMsg] = alignScrewHoleAxisToZ(mesh, resolved, true, SCREW_HOLE_DIAMETER_HINT_MM, log);
  log(okHole ? holeMsg : `${holeMsg} (continue with diameter-first alignment)`);
  const z3 = translateZToTargetDiameterZero(mesh, resolved, "[Z-3]", true, log);
  if (!z3[0]) return { ok: false, message: z3[1] || "Z-3 alignment failed", translation: null, telemetry: {} };

  const [okHex, hexMsg, hex] = measureHexTelemetry(mesh, explicit, log);
  const residual = measureHexResidual(collectHexFaceNormalObservations(mesh, explicit));
  const telemetry = {
    version: 1,
    moduleVersion: ALIGN_MODULE_VERSION,
    hexRotation: {
      beforeToXDeg: okHex ? hex.initial_phase_mod_deg : null,
      appliedDeg: okHex ? hex.applied_rotation_deg : null,
      residualToXDeg: residual ? residual.residual_deg : null,
      method: okHex ? hex.method : "unknown",
      samples: okHex ? hex.samples : 0,
      aligned: Boolean(okHex),
      message: hexMsg,
    },
  };
  const holeStage = okHole ? holeMsg : "hole-axis:failed";
  let message;
  if (!residual) message = "Aligned with warning; residual_to_X_deg=unavailable";
  else {
    const prefix =
      residual.residual_deg > HEX_RESIDUAL_TARGET_DEG ? "Aligned with warning" : "Successfully aligned";
    message = `${prefix}; hole_stage=${holeStage}; residual_to_X_deg=${residual.residual_deg.toFixed(6)}; residual_method=${residual.method}`;
  }
  return { ok: true, message, translation: z3[2], telemetry };
}
