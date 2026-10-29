// related files:
// - web/backend/services/abutmentStl/pipeline.js
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js
// - web/backend/scripts/db/data/connections.seed.js
// - .cursor/rules/cuff-connection-spec.mdc
//
// 기공소가 11° 커넥션을 생략하고 헥스만 길게 넘기면, 제조사 준비 파이프라인이
// 헥스를 L2 길이로 남기고 그 위에 스펙 11° 원뿔을 붙인다.
// 원뿔이 짧아 브랜드 원점 직경(자체검사 diameterRef)이 메시 위에 없으면
// 11°를 PRC 면 높이(originDiameter @ Z=0 → prcConeHeightMm, Regular RH는 0.3mm)까지 연장하고,
// 그 원점 직경이 되는 높이를 Z=0으로 옮긴다. 스펙 Z_a(taperHeightMm)에서 멈추면
// 커넥션 PRC Finish 면(Regular RH는 덴티움 0.33·덴티스·메가젠 0.4·그 외 0.3)과 단이 난다.
// 연장한 11° 상단은 평평한 턱을 남기지 않고, 그 끝점에서 2°·곡률 0으로 출발해 FACE_BLEND_MM 위의 기공소 커프 둘레 모양으로 5차식 섞는다. BlendCuff(cuffBlend.js)도 이 끝점에서 시작한다. 접수 검사(preflight)·의뢰 전 보정 STL에서는 호출하지 않는다.
// 임플란트 추가·PRC 면 높이 변경: cuffConnectionSpecs.js 상단 주석.
import { Mesh, meshZSection } from "./meshCore.js";
import { CONNECTIONS_SEED } from "../../scripts/db/data/connections.seed.js";
import {
  TAPER_SLOPE,
  prcConeHeightMm,
  resolveCuffConnectionSpec,
} from "./cuffConnectionSpecs.js";

const HEX_RATIO_MIN = 1.07;
const HEX_OVERLONG_MM = 0.45;
const SAMPLE_STEP_MM = 0.05;
const CONE_ROW_MM = 0.15;
const TAPER_MATCH_MM = 0.12;
const FLAT_TOL_MM = 0.2;
const CONE_FIT_TOL_MM = 0.015;
const ORIGIN_SHIFT_TOL_MM = 0.015;
const CONE_EXTEND_TOL_MM = 0.008;
const Z_ORIGIN_MAX_MM = 2.5;
const CONE_SNAP_TOL_MM = 0.06;
const SCREW_CHANNEL_R = 1.15;
/** 커프가 11° 면에서 떠나는 기울기. cuffBlend CUFF_EMERGENCE_START_SLOPE(2°)와 같다. */
const FACE_EMERGENCE_SLOPE = Math.tan((2 * Math.PI) / 180);
/** 11° 상단(PRC 면)에서 기공소 커프 면으로 단차 없이 이어 붙이는 높이. */
const FACE_BLEND_MM = 0.2;
/** 이음 띠 둘레 칸 수(2°). 기공소 메시 둘레 모양을 따라가기 위해 원뿔 로프트(72)보다 촘촘하다. */
const BLEND_RING_POINTS = 180;
/** 이음 띠 높이 간격. */
const BLEND_ROW_MM = 0.01;

const BRAND_ALIAS = {
  OSSTEM: { TS: "TS3" },
  DENTIUM: { SUPERLINE: "SUPERLINE2" },
  DIO: { UF2: "UF" },
  NEOBIOTECH: { IS: "IS2", ISALX: "IS2" },
  MEGAGEN: { ANYONE: "ANYONEINTERNAL" },
};

const token = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lookupSeed(profile) {
  const manufacturer = token(profile?.implantManufacturer);
  if (!manufacturer) return null;
  let brand = token(profile?.implantBrand);
  brand = BRAND_ALIAS[manufacturer]?.[brand] || brand;
  let family = token(profile?.implantFamily);
  if (family === "SMALL") family = "MINI";
  if (family === "SN") family = "SMALLNARROW";
  return (
    CONNECTIONS_SEED.find(
      (row) =>
        token(row.manufacturer) === manufacturer &&
        token(row.brand) === brand &&
        token(row.family) === family &&
        token(row.type) === "HEX" &&
        num(row.hexSize) &&
        num(row.l2),
    ) || null
  );
}

function resolveGeometry(options) {
  const passed = options.connection || {};
  const { spec } = resolveCuffConnectionSpec(options.implantProfile);
  const seed = lookupSeed(options.implantProfile);
  return {
    originDiameter: num(passed.originDiameter) || num(spec?.originDiameter),
    taperHeightMm: num(passed.taperHeightMm) || num(spec?.taperHeightMm),
    prcConeTopMm: num(passed.prcConeTopMm) || num(spec?.prcConeTopMm),
    hexSize: num(passed.hexSize) || num(seed?.hexSize),
    l2: num(passed.l2) || num(seed?.l2),
    specKey: spec?.key || null,
  };
}

function sectionMetrics(polyline) {
  let points = polyline.map((p) => [p[0], p[1]]);
  if (points.length >= 2) {
    const a = points[0];
    const b = points[points.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6) points = points.slice(0, -1);
  }
  if (points.length < 6) return null;
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
  if (rMax <= 1e-6) return null;
  const outer = radii.filter((r) => r >= rMax * 0.8);
  const pool = outer.length ? outer : radii;
  const rMin = Math.min(...pool);
  const rMean = pool.reduce((s, r) => s + r, 0) / pool.length;
  return { rMax, rMin, rMean, hexRatio: rMax / Math.max(rMin, 1e-9) };
}

function metricsAt(mesh, z) {
  let best = null;
  for (const pl of meshZSection(mesh, z)) {
    const m = sectionMetrics(pl);
    if (m && (!best || m.rMax > best.rMax)) best = m;
  }
  return best;
}

function median(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function hexRun(mesh, hexSize) {
  const { min, max } = mesh.bbox();
  const z0 = min[2];
  const zLimit = Math.min(max[2] - 0.2, z0 + 8);
  const samples = [];
  for (let z = z0 + 0.03; z <= zLimit; z += SAMPLE_STEP_MM) {
    const m = metricsAt(mesh, z);
    if (!m) continue;
    const acrossFlats = m.rMin * 2;
    const hex =
      m.hexRatio >= HEX_RATIO_MIN && Math.abs(acrossFlats - hexSize) <= FLAT_TOL_MM;
    samples.push({ z, m, hex });
  }
  let start = -1;
  let gaps = 0;
  let best = null;
  const close = (end) => {
    if (start < 0 || end < start) return;
    const run = samples.slice(start, end + 1).filter((s) => s.hex);
    if (run.length < 6) return;
    const last = samples.indexOf(run[run.length - 1]);
    const row = { run, next: samples[last + 1] || null };
    if (!best || row.run[0].z < best.run[0].z) best = row;
  };
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i].hex) {
      if (start < 0) start = i;
      gaps = 0;
      continue;
    }
    if (start < 0) continue;
    gaps += 1;
    if (gaps > 2) {
      close(i - gaps);
      start = -1;
      gaps = 0;
    }
  }
  if (start >= 0) close(samples.length - 1);
  if (!best || best.run[0].z - z0 > 1) return null;
  return best;
}

/** 헥스 바로 위가 모서리 반경에서 시작하는 11° 원뿔인지. 반경이 그대로인 원기둥은 아니다. */
function taperAlreadyAbove(mesh, hexTop, cornerR) {
  const pts = [];
  for (let z = hexTop + SAMPLE_STEP_MM; z <= hexTop + 0.8; z += SAMPLE_STEP_MM) {
    const m = metricsAt(mesh, z);
    if (!m || m.hexRatio >= 1.05) continue;
    pts.push([z, m.rMean]);
  }
  if (pts.length < 5) return false;
  const n = pts.length;
  const mz = pts.reduce((s, p) => s + p[0], 0) / n;
  const mr = pts.reduce((s, p) => s + p[1], 0) / n;
  const num = pts.reduce((s, p) => s + (p[0] - mz) * (p[1] - mr), 0);
  const den = pts.reduce((s, p) => s + (p[0] - mz) ** 2, 0);
  if (!(den > 1e-6)) return false;
  const slope = num / den;
  const deg = (Math.atan(slope) * 180) / Math.PI;
  if (deg < 8 || deg > 15) return false;
  const atTop = mr + slope * (hexTop - mz);
  return Math.abs(atTop - cornerR) <= TAPER_MATCH_MM + 0.05;
}

function channelRadius(mesh, z0, z1) {
  const radii = [];
  for (let z = z0; z <= z1; z += 0.2) {
    let inner = null;
    for (const pl of meshZSection(mesh, z)) {
      const m = sectionMetrics(pl);
      if (!m) continue;
      if (!inner || m.rMax < inner) inner = m.rMax;
    }
    if (inner) radii.push(inner);
  }
  return median(radii);
}

function radiusOf(p) {
  return Math.hypot(p[0], p[1]);
}

function intersectZ(a, b, z) {
  const dz = b[2] - a[2];
  const t = Math.abs(dz) < 1e-12 ? 0 : (z - a[2]) / dz;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z];
}

function clipHalf(poly, planeZ, keepBelow) {
  const inside = (p) => (keepBelow ? p[2] <= planeZ + 1e-8 : p[2] >= planeZ - 1e-8);
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = inside(a);
    const bin = inside(b);
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(intersectZ(a, b, planeZ));
    else if (!ain && bin) {
      out.push(intersectZ(a, b, planeZ));
      out.push(b);
    }
  }
  return out;
}

function pushTri(out, a, b, c) {
  if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6) return;
  if (Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]) < 1e-6) return;
  if (Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) < 1e-6) return;
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function fan(poly, out) {
  for (let i = 1; i < poly.length - 1; i += 1) pushTri(out, poly[0], poly[i], poly[i + 1]);
}

function replaceMesh(mesh, positions) {
  const next = Mesh.fromTriangleSoup(positions);
  mesh.verts = next.verts;
  mesh.faces = next.faces;
  mesh.invalidate();
}

function boundaryLoops(mesh) {
  const f = mesh.faces;
  const count = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < mesh.faceCount; i += 1) {
    const a = f[i * 3];
    const b = f[i * 3 + 1];
    const c = f[i * 3 + 2];
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = key(u, v);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const adj = new Map();
  const link = (u, v) => {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push(v);
  };
  for (const [k, n] of count) {
    if (n !== 1) continue;
    const [u, v] = k.split("_").map(Number);
    link(u, v);
    link(v, u);
  }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < adj.size + 2; guard += 1) {
      const nxt = (adj.get(cur) || []).find((w) => w !== prev);
      if (nxt === undefined || nxt === start) break;
      if (seen.has(nxt)) break;
      seen.add(nxt);
      loop.push(nxt);
      prev = cur;
      cur = nxt;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

function loopPoints(mesh, indices) {
  const v = mesh.verts;
  const pts = indices.map((i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]);
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-5) continue;
    out.push(p);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-5) out.pop();
  }
  return out;
}

function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function asCcw(pts) {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts.slice();
}

function circleRing(z, r, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI + ((i + 0.5) * 2 * Math.PI) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return pts;
}

function rotateToMinAngle(pts) {
  let k = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const a = Math.atan2(pts[i][1], pts[i][0]);
    if (a < best) {
      best = a;
      k = i;
    }
  }
  return pts.slice(k).concat(pts.slice(0, k));
}

/** 고리 순서대로 각도를 증가시킨다. ±180°를 그대로 쓰면 그 자리에서 삼각형이 엇갈린다. */
function monotonicAngles(pts) {
  const out = [Math.atan2(pts[0][1], pts[0][0])];
  for (let i = 1; i < pts.length; i += 1) {
    let a = Math.atan2(pts[i][1], pts[i][0]);
    while (a < out[i - 1] - 1e-8) a += Math.PI * 2;
    out.push(a);
  }
  let close = out[0] + Math.PI * 2;
  while (close < out[out.length - 1] - 1e-6) close += Math.PI * 2;
  return { ang: out, close };
}

/** 두 폐곡선을 각도로 잇는다. 링은 +Z에서 반시계. 옆면 법선은 바깥. */
function stitch(src, dst) {
  const A = rotateToMinAngle(asCcw(src));
  const B = rotateToMinAngle(asCcw(dst));
  const n = A.length;
  const m = B.length;
  const aTurn = monotonicAngles(A);
  const bTurn = monotonicAngles(B);
  const aAng = aTurn.ang;
  const bAng = bTurn.ang;
  const tris = [];
  let i = 0;
  let j = 0;
  for (let step = 0; step < n + m + 2 && (i < n || j < m); step += 1) {
    const a = A[i % n];
    const b = B[j % m];
    const a2 = A[(i + 1) % n];
    const b2 = B[(j + 1) % m];
    const aNext = i + 1 < n ? aAng[i + 1] : aTurn.close;
    const bNext = j + 1 < m ? bAng[j + 1] : bTurn.close;
    if (i >= n) {
      tris.push([a, b2, b]);
      j += 1;
      continue;
    }
    if (j >= m) {
      tris.push([a, a2, b]);
      i += 1;
      continue;
    }
    // 다음 꼭짓점의 절대 각도를 비교한다. 간격 길이로 비교하면 성긴 헥스가 원 전체를 한 점에 모아 이음이 찢어진다.
    if (Math.abs(aNext - bNext) <= 1e-4) {
      tris.push([a, a2, b2], [a, b2, b]);
      i += 1;
      j += 1;
    } else if (aNext < bNext) {
      tris.push([a, a2, b]);
      i += 1;
    } else {
      tris.push([a, b2, b]);
      j += 1;
    }
  }
  return tris;
}

function meanZ(pts) {
  return pts.reduce((s, p) => s + p[2], 0) / pts.length;
}

function meanR(pts) {
  return pts.reduce((s, p) => s + radiusOf(p), 0) / pts.length;
}

function ensureOutward(tris) {
  if (!tris.length) return tris;
  const [a, b, c] = tris[0];
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const wx = c[0] - a[0];
  const wy = c[1] - a[1];
  const wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const mx = (a[0] + b[0] + c[0]) / 3;
  const my = (a[1] + b[1] + c[1]) / 3;
  if (nx * mx + ny * my >= 0) return tris;
  return tris.map(([p, q, r]) => [p, r, q]);
}

/**
 * @param {import("./meshCore.js").Mesh} mesh 정렬된 메시. 적용 시 제자리에서 바뀐다.
 * @returns {{ applied: boolean, reason: string, zShift?: number }}
 */
export function addMissingConnectionTaper(mesh, options = {}) {
  const log = options.log || (() => {});
  const geo = resolveGeometry(options);
  if (!geo.originDiameter || !geo.taperHeightMm || !geo.hexSize || !geo.l2) {
    log("[connection-taper] 스펙 없음. 11° 커넥션은 추가하지 않습니다.");
    return { applied: false, reason: "no-spec" };
  }
  const found = hexRun(mesh, geo.hexSize);
  if (!found) {
    log("[connection-taper] 하단 헥스 없음. 11° 커넥션은 추가하지 않습니다.");
    return { applied: false, reason: "no-hex" };
  }
  const zMin = mesh.bbox().min[2];
  let hexBottom = found.run[0].z;
  if (hexBottom - zMin <= 0.5) hexBottom = zMin;
  const hexTop = found.run[found.run.length - 1].z;
  const hexLen = hexTop - hexBottom;
  const cornerR = median(found.run.map((s) => s.m.rMax));
  const originR = geo.originDiameter / 2;
  const coneBelow = (originR - cornerR) / TAPER_SLOPE;
  const canonicalHexLen = geo.l2 - coneBelow;
  if (!(coneBelow > 0.05) || !(canonicalHexLen > 0.3)) {
    log(
      `[connection-taper] 헥스·원점 직경이 11° 원뿔로 안 맞습니다. cornerR=${cornerR?.toFixed(3)} originR=${originR.toFixed(3)}`,
    );
    return { applied: false, reason: "spec-mismatch" };
  }
  if (hexLen < canonicalHexLen + HEX_OVERLONG_MM) {
    log(
      `[connection-taper] 헥스 ${hexLen.toFixed(2)}mm. 기준 ${canonicalHexLen.toFixed(2)}mm. 11° 커넥션은 이미 있는 것으로 둡니다.`,
    );
    return { applied: false, reason: "hex-length-ok" };
  }
  if (taperAlreadyAbove(mesh, hexTop, cornerR)) {
    log("[connection-taper] 헥스 위에 11° 원뿔이 있습니다. 추가하지 않습니다.");
    return { applied: false, reason: "taper-present" };
  }
  const mid = metricsAt(mesh, (hexBottom + canonicalHexLen + hexTop) / 2);
  if (!mid || mid.hexRatio < HEX_RATIO_MIN) {
    log("[connection-taper] 긴 구간이 헥스가 아닙니다. 추가하지 않습니다.");
    return { applied: false, reason: "extra-not-hex" };
  }

  const zCut = hexBottom + canonicalHexLen;
  const originZ = hexBottom + geo.l2;
  const zTop = originZ + (prcConeHeightMm(geo) ?? geo.taperHeightMm);
  const zLab = found.next ? found.next.z : hexTop;
  const zShift = -originZ;
  const outerMin = Math.min(...found.run.map((s) => s.m.rMin));
  const channel = channelRadius(mesh, hexBottom, hexTop);
  const rSplit =
    channel && channel < outerMin - 0.05 ? (channel + outerMin) / 2 : outerMin * 0.9;
  const snapshot = mesh.toTriangleSoup();
  mesh.translate(0, 0, zShift);
  const cut = zCut + zShift;
  const top = zTop + zShift;
  const lab = zLab + zShift;
  const keep = Math.max(lab, top);

  try {
    const kept = [];
    const v = mesh.verts;
    const f = mesh.faces;
    for (let i = 0; i < mesh.faceCount; i += 1) {
      const tri = [0, 1, 2].map((k) => {
        const o = f[i * 3 + k] * 3;
        return [v[o], v[o + 1], v[o + 2]];
      });
      const outer = tri.every((p) => radiusOf(p) > rSplit);
      if (!outer) {
        pushTri(kept, tri[0], tri[1], tri[2]);
        continue;
      }
      fan(clipHalf(tri, cut, true), kept);
      fan(clipHalf(tri, keep, false), kept);
    }
    replaceMesh(mesh, Float64Array.from(kept));
    const loops = boundaryLoops(mesh)
      .map((idx) => loopPoints(mesh, idx))
      .filter((pts) => pts.length >= 6 && meanR(pts) > rSplit);
    const bottom = loops
      .filter((pts) => Math.abs(meanZ(pts) - cut) < 0.08)
      .sort((a, b) => meanR(b) - meanR(a))[0];
    const upper = loops
      .filter((pts) => Math.abs(meanZ(pts) - keep) < 0.08)
      .sort((a, b) => meanR(b) - meanR(a))[0];
    if (!bottom || !upper) {
      throw new Error("cut-boundary");
    }
    const radiusAt = (z) => cornerR + TAPER_SLOPE * (z - cut);
    const rings = [asCcw(bottom)];
    for (let z = cut + CONE_ROW_MM; z < top - 1e-4; z += CONE_ROW_MM) {
      rings.push(circleRing(z, radiusAt(z), 72));
    }
    rings.push(circleRing(top, radiusAt(top), 72));
    if (keep > top + 0.03) rings.push(asCcw(upper));
    else rings[rings.length - 1] = asCcw(upper);
    let loft = [];
    for (let i = 0; i < rings.length - 1; i += 1) loft.push(...stitch(rings[i], rings[i + 1]));
    loft = ensureOutward(loft);
    const soup = Array.from(mesh.toTriangleSoup());
    for (const [a, b, c] of loft) pushTri(soup, a, b, c);
    replaceMesh(mesh, Float64Array.from(soup));
  } catch (error) {
    replaceMesh(mesh, snapshot);
    log(`[connection-taper] 실패(${error?.message || error}). 원본 형상을 유지합니다.`);
    return { applied: false, reason: "build-failed" };
  }

  log(
    `[connection-taper] 긴 헥스 ${hexLen.toFixed(2)}mm → 헥스 ${canonicalHexLen.toFixed(2)}mm + 11° 원뿔 ${(prcConeHeightMm(geo) ?? geo.taperHeightMm).toFixed(2)}mm`,
  );
  return {
    applied: true,
    reason: "added",
    zShift,
    hexLengthMm: hexLen,
    canonicalHexLengthMm: canonicalHexLen,
    taperHeightMm: geo.taperHeightMm,
    specKey: geo.specKey,
  };
}

/** 이어진 11° 구간. 원점 직경이 그 구간 근처에 있는 쪽을 고른다. */
function pickConeRun(samples, originR) {
  const runs = [];
  for (let i = 0; i < samples.length; i += 1) {
    const run = [samples[i]];
    for (let j = i + 1; j < samples.length; j += 1) {
      if (samples[j].z - run[run.length - 1].z > SAMPLE_STEP_MM + 0.02) break;
      const trial = run.concat(samples[j]);
      const trialR0 = median(trial.map((s) => s.r - TAPER_SLOPE * s.z));
      const ok = trial.every((s) => Math.abs(s.r - (trialR0 + TAPER_SLOPE * s.z)) <= CONE_FIT_TOL_MM);
      if (!ok) break;
      run.push(samples[j]);
    }
    if (run.length < 5) continue;
    const r0 = median(run.map((s) => s.r - TAPER_SLOPE * s.z));
    const bottomZ = run[0].z;
    const measuredTopZ = run[run.length - 1].z;
    const zOrigin = (originR - r0) / TAPER_SLOPE;
    runs.push({
      r0,
      bottomZ,
      measuredTopZ,
      zOrigin,
      length: run.length,
      originNear: zOrigin >= bottomZ - 0.05 && zOrigin <= measuredTopZ + 1,
    });
  }
  runs.sort((a, b) => {
    if (a.originNear !== b.originNear) return a.originNear ? -1 : 1;
    if (a.length !== b.length) return b.length - a.length;
    return b.measuredTopZ - a.measuredTopZ;
  });
  return runs[0] || null;
}

/** 정렬된 메시에서 11° 원뿔(절편 r0, 실측 상단)을 잰다. */
function measureExistingCone(mesh, originR) {
  const { min, max } = mesh.bbox();
  const samples = [];
  const z0 = Math.max(min[2], -3);
  const z1 = Math.min(max[2], 2.2);
  for (let z = z0; z <= z1; z += SAMPLE_STEP_MM) {
    const m = metricsAt(mesh, z);
    if (!m || m.hexRatio >= 1.06) continue;
    samples.push({ z, r: m.rMean });
  }
  const found = samples.length >= 5 && originR > 0 ? pickConeRun(samples, originR) : null;
  if (!found) return null;
  if (!(found.r0 > 0.8)) return null;
  const onCone = (z, r) => Math.abs(r - (found.r0 + TAPER_SLOPE * z)) <= CONE_FIT_TOL_MM;
  let top = found.measuredTopZ;
  let miss = 0;
  for (let z = top + 0.01; z <= top + 1.2; z += 0.01) {
    const m = metricsAt(mesh, z);
    if (m && m.hexRatio < 1.06 && onCone(z, m.rMean)) {
      top = z;
      miss = 0;
    } else if (++miss > 2) break;
  }
  return { r0: found.r0, slope: TAPER_SLOPE, measuredTopZ: top, bottomZ: found.bottomZ };
}

/** 단면이 살짝 찌그러져 hexRatio에 걸려도, 평균 반경이 11°에 있으면 그 끝까지 본다. */
function looseConeTop(mesh, r0, fromZ) {
  let top = fromZ;
  let miss = 0;
  for (let z = fromZ; z <= fromZ + 1.5; z += 0.01) {
    const m = metricsAt(mesh, z);
    if (!m) break;
    const on = Math.abs(m.rMean - (r0 + TAPER_SLOPE * z)) <= CONE_FIT_TOL_MM && m.hexRatio < 1.2;
    if (on) {
      top = z;
      miss = 0;
    } else if (++miss > 3) break;
  }
  return top;
}

/**
 * PRC 면(zLo) 반경에서 2°·곡률 0으로 출발해 위 끝 반경까지 잇는다.
 * 비중은 양 끝 기울기·곡률이 0인 5차식. 11°로 곧장 이어 가면 길었던 원뿔이 그대로 남는다.
 */
function faceContinuationRadius(z, zLo, zHi, ra, rTop) {
  const h = zHi - zLo;
  if (!(h > 1e-6)) return ra;
  const x = Math.max(0, Math.min(1, (z - zLo) / h));
  const s0 = Math.min(FACE_EMERGENCE_SLOPE, TAPER_SLOPE);
  const base = ra + s0 * (z - zLo);
  const orig = ra + (rTop - ra) * x;
  const w = x * x * x * (10 - 15 * x + 6 * x * x);
  return base + w * (orig - base);
}

/** 닫힌 고리의 각도별 반경. 각도 사이는 선형 보간한다. */
function polarRadiusOf(loop) {
  const pts = loop
    .map((p) => [Math.atan2(p[1], p[0]), radiusOf(p)])
    .sort((p, q) => p[0] - q[0]);
  const n = pts.length;
  return (theta) => {
    let t = theta;
    while (t < pts[0][0]) t += Math.PI * 2;
    while (t >= pts[0][0] + Math.PI * 2) t -= Math.PI * 2;
    let lo = n - 1;
    for (let i = 0; i < n; i += 1) {
      if (pts[i][0] <= t) lo = i;
      else break;
    }
    const hi = (lo + 1) % n;
    const a0 = pts[lo][0];
    let a1 = pts[hi][0];
    if (a1 <= a0) a1 += Math.PI * 2;
    let tt = t;
    if (tt < a0) tt += Math.PI * 2;
    const u = a1 - a0 < 1e-9 ? 0 : (tt - a0) / (a1 - a0);
    return pts[lo][1] + u * (pts[hi][1] - pts[lo][1]);
  };
}

function polarRing(z, radiusOfTheta, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI + ((i + 0.5) * 2 * Math.PI) / n;
    const r = radiusOfTheta(a);
    pts.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return pts;
}

/**
 * zLo~zHi 바깥 띠를 지우고 새 면으로 잇는다.
 * emerge가 아니면 radiusAt 원뿔로만 채운다.
 * emerge면 zFace까지는 원뿔, 그 위는 원뿔 끝점(zFace)에서 2°·곡률 0으로 출발해 zHi의 기공소 커프 반경(각도별)으로 5차식으로 섞는다.
 * 위 끝은 기공소 메시를 각도별로 그대로 따라가므로 평평한 턱이 남지 않는다.
 */
function replaceOuterBandWithCone(mesh, zLo, zHi, radiusAt, rSplit, emerge = false, zFace = zLo) {
  const snapshot = mesh.toTriangleSoup();
  try {
    const kept = [];
    const v = mesh.verts;
    const f = mesh.faces;
    for (let i = 0; i < mesh.faceCount; i += 1) {
      const tri = [0, 1, 2].map((k) => {
        const o = f[i * 3 + k] * 3;
        return [v[o], v[o + 1], v[o + 2]];
      });
      const outer = tri.every((p) => radiusOf(p) > rSplit);
      if (!outer) {
        pushTri(kept, tri[0], tri[1], tri[2]);
        continue;
      }
      fan(clipHalf(tri, zLo, true), kept);
      fan(clipHalf(tri, zHi, false), kept);
    }
    replaceMesh(mesh, Float64Array.from(kept));
    const loops = boundaryLoops(mesh)
      .map((idx) => loopPoints(mesh, idx))
      .filter((pts) => pts.length >= 6 && meanR(pts) > rSplit);
    const near = (z) =>
      loops
        .filter((pts) => Math.abs(meanZ(pts) - z) < 0.15)
        .sort((a, b) => Math.abs(meanZ(a) - z) - Math.abs(meanZ(b) - z) || meanR(b) - meanR(a))[0];
    const bottom = near(zLo);
    const upper = near(zHi);
    if (!bottom || !upper) {
      throw new Error(`extend-boundary zLo=${zLo.toFixed(3)} zHi=${zHi.toFixed(3)}`);
    }
    const rings = [asCcw(bottom)];
    if (emerge) {
      const ra = radiusAt(zFace);
      const rTopAt = polarRadiusOf(upper);
      const radiusOfTheta = (z) => {
        if (z <= zFace + 1e-9) return () => radiusAt(z);
        return (theta) => faceContinuationRadius(z, zFace, zHi, ra, rTopAt(theta));
      };
      const zs = [];
      if (zFace > zLo + 1e-4) {
        for (let z = zLo + CONE_ROW_MM; z < zFace - 1e-4; z += CONE_ROW_MM) zs.push(z);
        zs.push(zFace);
      }
      for (let z = zFace + BLEND_ROW_MM; z < zHi - BLEND_ROW_MM * 0.5; z += BLEND_ROW_MM) zs.push(z);
      for (const z of zs) rings.push(polarRing(z, radiusOfTheta(z), BLEND_RING_POINTS));
      rings.push(asCcw(upper));
    } else {
      for (let z = zLo + CONE_ROW_MM; z < zHi - 1e-4; z += CONE_ROW_MM) {
        rings.push(circleRing(z, radiusAt(z), 72));
      }
      rings.push(circleRing(zHi, radiusAt(zHi), 72));
      rings.push(asCcw(upper));
    }
    let loft = [];
    for (let i = 0; i < rings.length - 1; i += 1) loft.push(...stitch(rings[i], rings[i + 1]));
    loft = ensureOutward(loft);
    const soup = Array.from(mesh.toTriangleSoup());
    for (const [a, b, c] of loft) pushTri(soup, a, b, c);
    replaceMesh(mesh, Float64Array.from(soup));
    return true;
  } catch (error) {
    replaceMesh(mesh, snapshot);
    throw error;
  }
}

function snapConeVertices(mesh, originR, zLo, zHi) {
  const v = mesh.verts;
  let moved = 0;
  for (let i = 0; i < v.length; i += 3) {
    const z = v[i + 2];
    if (z < zLo - 1e-4 || z > zHi + 1e-4) continue;
    const r = Math.hypot(v[i], v[i + 1]);
    if (r < SCREW_CHANNEL_R) continue;
    const target = originR + TAPER_SLOPE * z;
    if (Math.abs(r - target) > CONE_SNAP_TOL_MM) continue;
    const s = target / r;
    v[i] *= s;
    v[i + 1] *= s;
    moved += 1;
  }
  if (moved) mesh.invalidate();
  return moved;
}

/**
 * 짧은 11° 원뿔을 PRC 면 높이까지 연장하고, 브랜드 원점 직경이 되는 높이를 Z=0으로 둔다.
 * 그보다 긴 11°는 PRC 면에서 잘라 내고, 그 위는 2°로 이어 붙인다.
 */
export function ensureConnectionTaperSpec(mesh, options = {}) {
  const log = options.log || (() => {});
  const geo = resolveGeometry(options);
  if (!geo.originDiameter || !geo.taperHeightMm) {
    log("[connection-taper] 원점 스펙 없음. 짧은 원뿔은 연장하지 않습니다.");
    return { applied: false, reason: "no-spec" };
  }
  const originR = geo.originDiameter / 2;
  const targetHeight = prcConeHeightMm(geo) ?? geo.taperHeightMm;
  const cone = measureExistingCone(mesh, originR);
  if (!cone) {
    log("[connection-taper] 11° 원뿔을 찾지 못해 원점 재정렬을 건너뜁니다.");
    return { applied: false, reason: "no-cone" };
  }
  const zOrigin = (originR - cone.r0) / TAPER_SLOPE;
  if (!Number.isFinite(zOrigin) || Math.abs(zOrigin) > Z_ORIGIN_MAX_MM) {
    log(`[connection-taper] 원점 높이 ${zOrigin} 가 범위를 넘습니다.`);
    return { applied: false, reason: "origin-out-of-range" };
  }
  const topAfter = Math.max(cone.measuredTopZ, looseConeTop(mesh, cone.r0, cone.measuredTopZ)) - zOrigin;
  const needsShift = Math.abs(zOrigin) > ORIGIN_SHIFT_TOL_MM;
  const needsExtend = topAfter < targetHeight - CONE_EXTEND_TOL_MM;
  const needsTrim = topAfter > targetHeight + CONE_EXTEND_TOL_MM;
  if (!needsShift && !needsExtend && !needsTrim) {
    log("[connection-taper] 원점·11° 길이가 PRC 면과 같습니다.");
    return { applied: false, reason: "already-spec" };
  }

  const snapshot = mesh.toTriangleSoup();
  let extended = false;
  let trimmed = false;
  let trimHi = null;
  try {
    if (needsShift) mesh.translate(0, 0, -zOrigin);
    if (needsTrim) {
      const zLo = targetHeight;
      // 11°가 끝나는 점이 아니라, 반경이 원뿔을 벗어나 커프가 시작되는 높이까지 지운다.
      // 원뿔 끝 반경에 다시 붙이면 길었던 11°가 그대로 남는다.
      let zCuff = null;
      let lastOn = zLo;
      const zLimit = topAfter + 0.4;
      for (let z = zLo + 0.02; z <= zLimit; z += 0.01) {
        const m = metricsAt(mesh, z);
        if (!m) break;
        const coneR = originR + TAPER_SLOPE * z;
        const onCone = Math.abs(m.rMean - coneR) <= CONE_FIT_TOL_MM && m.hexRatio < 1.2;
        if (onCone) {
          lastOn = z;
          continue;
        }
        zCuff = z;
        break;
      }
      const zHi = zCuff ?? (lastOn > zLo + CONE_EXTEND_TOL_MM ? lastOn : null);
      try {
        if (!(zHi > zLo + CONE_EXTEND_TOL_MM)) throw new Error("trim-span");
        const channel = channelRadius(mesh, Math.min(-0.4, zLo), Math.max(0.6, zHi));
        const rSplit =
          channel && channel < originR - 0.2 ? (channel + originR) / 2 : Math.max(SCREW_CHANNEL_R, originR * 0.72);
        const ok = replaceOuterBandWithCone(
          mesh,
          zLo,
          zHi,
          (z) => originR + TAPER_SLOPE * z,
          rSplit,
          true,
        );
        if (!ok) throw new Error("trim-failed");
        trimmed = true;
        trimHi = zHi;
      } catch (error) {
        replaceMesh(mesh, snapshot);
        if (needsShift) mesh.translate(0, 0, -zOrigin);
        log(`[connection-taper] 긴 원뿔은 자르지 못했습니다(${error?.message || error}).`);
        if (!needsShift) throw error;
      }
    } else if (needsExtend) {
      const shifted = mesh.toTriangleSoup();
      try {
        // 원뿔이 원점 직경 전에 끊겨도, 헥스 아래로는 내려가지 않고 PRC 면까지만 잇는다.
        const coneBottomAfter = cone.bottomZ - (needsShift ? zOrigin : 0);
        const zLo = Math.max(
          coneBottomAfter + 0.02,
          Math.min(topAfter - 0.01, targetHeight - 0.02),
        );
        const zHi = targetHeight;
        const channel = channelRadius(mesh, Math.min(-0.4, zLo), Math.max(0.6, zHi));
        const rSplit =
          channel && channel < originR - 0.2 ? (channel + originR) / 2 : Math.max(SCREW_CHANNEL_R, originR * 0.72);
        const radiusAt = (z) => originR + TAPER_SLOPE * z;
        try {
          // 11° 상단(PRC 면)에서 2°로 출발해 기공소 커프로 단차 없이 이어 붙인다. BlendCuff도 이 끝점에서 시작한다.
          replaceOuterBandWithCone(mesh, zLo, zHi + FACE_BLEND_MM, radiusAt, rSplit, true, zHi);
        } catch (error) {
          replaceMesh(mesh, shifted);
          log(`[connection-taper] 상단 이음 띠 없이 11°만 연장합니다(${error?.message || error}).`);
          replaceOuterBandWithCone(mesh, zLo, zHi, radiusAt, rSplit);
        }
        extended = true;
      } catch (error) {
        replaceMesh(mesh, shifted);
        if (!needsShift) throw error;
        log(`[connection-taper] 11° 연장은 건너뛰고 원점만 맞춥니다(${error?.message || error}).`);
      }
    }
    snapConeVertices(mesh, originR, cone.bottomZ - zOrigin, targetHeight);
    const atOrigin = metricsAt(mesh, 0);
    if (!atOrigin || Math.abs(atOrigin.rMean * 2 - geo.originDiameter) > 0.05) {
      throw new Error("origin-diameter");
    }
  } catch (error) {
    replaceMesh(mesh, snapshot);
    log(`[connection-taper] 원점 재정렬 실패(${error?.message || error}). 원본 형상을 유지합니다.`);
    return { applied: false, reason: "build-failed" };
  }

  log(
    `[connection-taper] 원점 직경 ${geo.originDiameter.toFixed(3)}mm` +
      `${needsShift ? ` Z${(-zOrigin).toFixed(3)}` : ""}` +
      `${extended ? ` · 11°를 z=${targetHeight.toFixed(2)}(Ø${(2 * (originR + TAPER_SLOPE * targetHeight)).toFixed(3)})까지 연장` : ""}` +
      `${trimmed ? ` · z=${targetHeight.toFixed(2)}~${trimHi.toFixed(2)} 11°를 지우고 2°로 이음` : ""}`,
  );
  return {
    applied: true,
    reason: trimmed ? "trimmed" : extended ? "extended" : "origin-shifted",
    zShift: needsShift ? -zOrigin : 0,
    originDiameter: geo.originDiameter,
    taperHeightMm: geo.taperHeightMm,
    prcConeHeightMm: targetHeight,
    measuredOriginDiameter: 2 * cone.r0,
    specKey: geo.specKey,
  };
}

/** 긴 헥스에 원뿔을 붙인 뒤, 짧은 원뿔은 스펙 원점·끝까지 맞춘다. */
export function applyConnectionTaper(mesh, options = {}) {
  const added = addMissingConnectionTaper(mesh, options);
  const ensured = ensureConnectionTaperSpec(mesh, options);
  const zShift = (added.zShift || 0) + (ensured.zShift || 0);
  return {
    applied: Boolean(added.applied || ensured.applied),
    reason: ensured.applied ? ensured.reason : added.reason,
    zShift: zShift || undefined,
    added,
    ensured,
    specKey: ensured.specKey || added.specKey || null,
  };
}
