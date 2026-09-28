// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/scripts/abutment-stl-js/compare-golden.js
//
// Rhino 결과와 JS 결과의 차이를 숫자로 만든다. 합격 판정은 하지 않는다(리포트를 보고 사람이 판단).

/** 삼각형 균일 격자. 점→표면 최근접 거리용. */
class TriangleGrid {
  constructor(mesh, cell = 0.5) {
    this.mesh = mesh;
    this.cell = cell;
    this.map = new Map();
    const v = mesh.verts;
    const f = mesh.faces;
    for (let i = 0; i < mesh.faceCount; i += 1) {
      const a = f[i * 3] * 3;
      const b = f[i * 3 + 1] * 3;
      const c = f[i * 3 + 2] * 3;
      const lo = [0, 1, 2].map((k) => Math.floor(Math.min(v[a + k], v[b + k], v[c + k]) / cell));
      const hi = [0, 1, 2].map((k) => Math.floor(Math.max(v[a + k], v[b + k], v[c + k]) / cell));
      for (let x = lo[0]; x <= hi[0]; x += 1) {
        for (let y = lo[1]; y <= hi[1]; y += 1) {
          for (let z = lo[2]; z <= hi[2]; z += 1) {
            const key = `${x},${y},${z}`;
            const list = this.map.get(key);
            if (list) list.push(i);
            else this.map.set(key, [i]);
          }
        }
      }
    }
  }

  distance(p, maxRing = 6) {
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    const cz = Math.floor(p[2] / this.cell);
    let best = Infinity;
    const seen = new Set();
    for (let ring = 0; ring <= maxRing; ring += 1) {
      for (let x = cx - ring; x <= cx + ring; x += 1) {
        for (let y = cy - ring; y <= cy + ring; y += 1) {
          for (let z = cz - ring; z <= cz + ring; z += 1) {
            if (
              Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== ring
            ) {
              continue;
            }
            const list = this.map.get(`${x},${y},${z}`);
            if (!list) continue;
            for (const fi of list) {
              if (seen.has(fi)) continue;
              seen.add(fi);
              const d = pointTriangleDistance(p, this.mesh, fi);
              if (d < best) best = d;
            }
          }
        }
      }
      // 이 링 바깥 셀은 적어도 ring*cell 떨어져 있다.
      if (best <= ring * this.cell) break;
    }
    return best;
  }
}

function pointTriangleDistance(p, mesh, fi) {
  const v = mesh.verts;
  const f = mesh.faces;
  const a = [v[f[fi * 3] * 3], v[f[fi * 3] * 3 + 1], v[f[fi * 3] * 3 + 2]];
  const b = [v[f[fi * 3 + 1] * 3], v[f[fi * 3 + 1] * 3 + 1], v[f[fi * 3 + 1] * 3 + 2]];
  const c = [v[f[fi * 3 + 2] * 3], v[f[fi * 3 + 2] * 3 + 1], v[f[fi * 3 + 2] * 3 + 2]];
  const q = closestPointOnTriangle(p, a, b, c);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dotv(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Ericson, Real-Time Collision Detection 5.1.5
function closestPointOnTriangle(p, a, b, c) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dotv(ab, ap);
  const d2 = dotv(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dotv(ab, bp);
  const d4 = dotv(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
  }
  const cp = sub(p, c);
  const d5 = dotv(ab, cp);
  const d6 = dotv(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return [a[0] + t * ac[0], a[1] + t * ac[1], a[2] + t * ac[2]];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + t * (c[0] - b[0]), b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2])];
  }
  const denom = 1 / (va + vb + vc);
  const v2 = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v2 + ac[0] * w, a[1] + ab[1] * v2 + ac[1] * w, a[2] + ab[2] * v2 + ac[2] * w];
}

function quantiles(values) {
  if (!values.length) return { p50: null, p95: null, p99: null, max: null, mean: null };
  const s = Float64Array.from(values).sort();
  const at = (q) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))];
  let sum = 0;
  for (const x of s) sum += x;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1], mean: sum / s.length };
}

/** 면 중심 표본 → 상대 표면 거리. 양방향. */
export function surfaceDeviation(meshA, meshB, { maxSamples = 20000 } = {}) {
  const sample = (mesh) => {
    const pts = [];
    const step = Math.max(1, Math.floor(mesh.faceCount / maxSamples));
    const v = mesh.verts;
    const f = mesh.faces;
    for (let i = 0; i < mesh.faceCount; i += step) {
      const a = f[i * 3] * 3;
      const b = f[i * 3 + 1] * 3;
      const c = f[i * 3 + 2] * 3;
      pts.push([(v[a] + v[b] + v[c]) / 3, (v[a + 1] + v[b + 1] + v[c + 1]) / 3, (v[a + 2] + v[b + 2] + v[c + 2]) / 3]);
    }
    return pts;
  };
  const gridB = new TriangleGrid(meshB);
  const gridA = new TriangleGrid(meshA);
  const ab = sample(meshA).map((p) => gridB.distance(p));
  const ba = sample(meshB).map((p) => gridA.distance(p));
  const qa = quantiles(ab);
  const qb = quantiles(ba);
  return {
    jsToRhino: qa,
    rhinoToJs: qb,
    hausdorff: Math.max(qa.max ?? 0, qb.max ?? 0),
  };
}

function resampleClosed(points, count) {
  const pts = points.slice();
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-9) pts.push(a);
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i += 1) {
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  }
  const total = lens[lens.length - 1];
  if (!(total > 0)) return points.slice(0, count);
  const out = [];
  let j = 1;
  for (let k = 0; k < count; k += 1) {
    const s = (total * k) / count;
    while (j < lens.length - 1 && lens[j] < s) j += 1;
    const t = (s - lens[j - 1]) / Math.max(1e-12, lens[j] - lens[j - 1]);
    const p = pts[j - 1];
    const q = pts[j];
    out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]);
  }
  return out;
}

function pointToPolylineDistance(p, pl) {
  let best = Infinity;
  for (let i = 1; i < pl.length; i += 1) {
    const a = pl[i - 1];
    const b = pl[i];
    const ab = sub(b, a);
    const len2 = dotv(ab, ab);
    const t = len2 > 0 ? Math.max(0, Math.min(1, dotv(sub(p, a), ab) / len2)) : 0;
    const q = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
    best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  return best;
}

/** 두 피니시라인 폴리라인 간 대칭 거리(재표본 256점). */
export function finishLineDeviation(jsPoints, rhinoPoints) {
  if (!jsPoints?.length || !rhinoPoints?.length) return null;
  const close = (pts) => {
    const out = pts.slice();
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-9) out.push(a);
    return out;
  };
  const js = close(jsPoints);
  const rh = close(rhinoPoints);
  const d1 = resampleClosed(js, 256).map((p) => pointToPolylineDistance(p, rh));
  const d2 = resampleClosed(rh, 256).map((p) => pointToPolylineDistance(p, js));
  const q1 = quantiles(d1);
  const q2 = quantiles(d2);
  return {
    mean: (q1.mean + q2.mean) / 2,
    p95: Math.max(q1.p95, q2.p95),
    max: Math.max(q1.max, q2.max),
  };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const diff = (a, b) => (num(a) == null || num(b) == null ? null : num(a) - num(b));

function angleDiffDeg(a, b, period) {
  if (num(a) == null || num(b) == null) return null;
  const d = (((num(a) - num(b)) % period) + period * 1.5) % period - period / 2;
  return d;
}

/**
 * JS 결과 vs Rhino 기준값.
 * @param {object} js  runAbutmentStlPipeline 결과
 * @param {object} rhino { finishLine, hexRotation, maxDiameter, connectionDiameter, totalLength, l1, taperAngle, frontPoint, lotEngravingSite }
 * @param {{ jsMesh?: Mesh, rhinoMesh?: Mesh }} meshes
 */
export function compareWithRhino(js, rhino, meshes = {}) {
  const out = {};
  const jf = js?.finishLine;
  const rf = rhino?.finishLine;
  out.finishLine = {
    jsFound: Boolean(jf?.points?.length),
    rhinoFound: Boolean(rf?.points?.length),
    jsStrategy: jf?.strategyUsed || null,
    jsPointCount: jf?.points?.length || 0,
    rhinoPointCount: rf?.points?.length || 0,
    maxZDelta: diff(jf?.max_z, rf?.max_z),
    minZDelta: diff(jf?.min_z, rf?.min_z),
    deviation: jf?.points?.length && rf?.points?.length ? finishLineDeviation(jf.points, rf.points) : null,
  };
  const jh = js?.hexRotation;
  const rh = rhino?.hexRotation;
  out.hexRotation = {
    appliedDegDelta: angleDiffDeg(jh?.appliedDeg, rh?.appliedDeg, 60),
    residualDelta: diff(jh?.residualToXDeg, rh?.residualToXDeg),
    jsMethod: jh?.method || null,
    rhinoMethod: rh?.method || null,
  };
  const jm = js?.stlMetadata || {};
  out.metadata = {
    // DB maxDiameter는 register-file의 DIAMETER_RESULT(소수 2자리)로 덮어쓴 값이다.
    maxDiameterDelta: diff(js?.diameter?.max ?? jm.maxDiameter, rhino?.maxDiameter),
    connectionDiameterDelta: diff(jm.connectionDiameter, rhino?.connectionDiameter),
    totalLengthDelta: diff(jm.totalLength, rhino?.totalLength),
    l1Delta: diff(jm.l1, rhino?.l1),
    taperAngleDelta: diff(jm.taperAngle, rhino?.taperAngle),
    frontPointDistance:
      jm.frontPoint && rhino?.frontPoint
        ? Math.hypot(
            (jm.frontPoint.x ?? 0) - (rhino.frontPoint.x ?? 0),
            (jm.frontPoint.y ?? 0) - (rhino.frontPoint.y ?? 0),
            (jm.frontPoint.z ?? 0) - (rhino.frontPoint.z ?? 0),
          )
        : null,
    lotEngravingAngleDelta: angleDiffDeg(jm.lotEngravingSite?.angleDeg, rhino?.lotEngravingSite?.angleDeg, 360),
    lotEngravingZDelta: diff(jm.lotEngravingSite?.engraveZ, rhino?.lotEngravingSite?.engraveZ),
  };
  if (meshes.jsMesh && meshes.rhinoMesh) {
    out.surface = surfaceDeviation(meshes.jsMesh, meshes.rhinoMesh);
    out.surface.jsFaceCount = meshes.jsMesh.faceCount;
    out.surface.rhinoFaceCount = meshes.rhinoMesh.faceCount;
  }
  return out;
}
