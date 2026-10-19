// related files:
// - web/backend/services/abutmentStl/postFair.js
//
// 피니시라인 위 포스트 축면을 매끈하게 하고, 전후 요철을 출력한다.
// 위상(삼각형 수·연결)은 유지하고, 반경이 커지는 이동은 2µm 이하다.
//
//   node scripts/abutment-stl-js/fair-post.js --file in.stl --out out.stl
//   ENV_FILE=local.env NODE_ENV=test node scripts/abutment-stl-js/fair-post.js --request CA261019-BQM --out /tmp/post.stl
//   --request 는 의뢰번호 또는 로트번호. --write 는 그 의뢰만 새 S3 키로 바꾼다.
//   원본 키는 다른 의뢰와 공유될 수 있어 덮어쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { Mesh } from "../../services/abutmentStl/meshCore.js";
import { detectFinishLine, sanitizeFinishlinePoints } from "../../services/abutmentStl/finishline.js";
import { fairPostAboveFinishLine, POST_FAIR_VERSION } from "../../services/abutmentStl/postFair.js";
import { parseStl } from "../../utils/screwHoleFill.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const file = flag("--file");
const requestId = flag("--request");
const outPath = flag("--out");
const writeBack = args.includes("--write");

const TWO_PI = Math.PI * 2;
const wrap = (a) => {
  let t = a % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
};

function finishLineZ(points) {
  const bins = 360;
  const z = new Float64Array(bins).fill(NaN);
  for (const p of points) {
    const b = Math.min(bins - 1, Math.floor((wrap(Math.atan2(p[1], p[0])) / TWO_PI) * bins));
    z[b] = Number.isFinite(z[b]) ? Math.max(z[b], p[2]) : p[2];
  }
  for (let i = 0; i < bins; i += 1) {
    if (Number.isFinite(z[i])) continue;
    let l = 1;
    while (!Number.isFinite(z[(i - l + bins) % bins])) l += 1;
    let r = 1;
    while (!Number.isFinite(z[(i + r) % bins])) r += 1;
    z[i] = z[(i - l + bins) % bins] + ((z[(i + r) % bins] - z[(i - l + bins) % bins]) * l) / (l + r);
  }
  return (th) => {
    const p = (wrap(th) / TWO_PI) * bins;
    const i0 = Math.floor(p) % bins;
    const w = p - Math.floor(p);
    return z[i0] * (1 - w) + z[(i0 + 1) % bins] * w;
  };
}

/** 축면 바깥 봉우리가 낮은주파수 반경에서 얼마나 튀는지(µm). 밀링이 따라가는 겉면이다. */
function envelopeUm(buffer, points) {
  const { positions } = parseStl(buffer);
  const tri = Math.floor(positions.length / 9);
  const flZ = finishLineZ(points);
  let zMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i + 2]);
  const zMin = Math.min(...points.map((p) => p[2]));
  const ANG = 180;
  const positives = [];
  const abs = [];
  for (let z = zMin + 0.35; z < zMax - 0.2; z += 0.08) {
    const rs = new Float64Array(ANG).fill(NaN);
    for (let t = 0; t < tri; t += 1) {
      const o = t * 9;
      const zs = [positions[o + 2], positions[o + 5], positions[o + 8]];
      if (Math.min(...zs) > z || Math.max(...zs) < z) continue;
      const hit = [];
      for (let k = 0; k < 3; k += 1) {
        const z1 = zs[k];
        const z2 = zs[(k + 1) % 3];
        if (z1 === z2 || (z1 - z) * (z2 - z) > 0) continue;
        const u = (z - z1) / (z2 - z1);
        const a = o + k * 3;
        const b = o + ((k + 1) % 3) * 3;
        hit.push(positions[a] + u * (positions[b] - positions[a]), positions[a + 1] + u * (positions[b + 1] - positions[a + 1]));
      }
      if (hit.length < 4) continue;
      for (let s = 0; s <= 4; s += 1) {
        const w = s / 4;
        const x = hit[0] + w * (hit[2] - hit[0]);
        const y = hit[1] + w * (hit[3] - hit[1]);
        const r = Math.hypot(x, y);
        const th = Math.atan2(y, x);
        if (z < flZ(th) + 0.3 || r < 0.6) continue;
        const b = Math.min(ANG - 1, Math.floor((wrap(th) / TWO_PI) * ANG));
        if (!(rs[b] >= r)) rs[b] = r;
      }
    }
    const sm = new Float64Array(ANG);
    const W = 4;
    for (let i = 0; i < ANG; i += 1) {
      let s = 0;
      let n = 0;
      for (let k = -W; k <= W; k += 1) {
        const v = rs[(i + k + ANG) % ANG];
        if (!Number.isFinite(v)) continue;
        s += v;
        n += 1;
      }
      sm[i] = n ? s / n : NaN;
    }
    for (let i = 0; i < ANG; i += 1) {
      if (!Number.isFinite(rs[i]) || !Number.isFinite(sm[i])) continue;
      const d = (rs[i] - sm[i]) * 1000;
      abs.push(Math.abs(d));
      if (d > 0) positives.push(d);
    }
  }
  const q = (arr, p) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  return {
    outwardP95Um: +q(positives, 0.95).toFixed(1),
    absP95Um: +q(abs, 0.95).toFixed(1),
  };
}

/** 포스트 축면 이웃 면의 접힘각(도). 작을수록 매끈하다. */
function dihedralDeg(buffer, points) {
  const { positions } = parseStl(buffer);
  const inv = 1e5;
  const keyTo = new Map();
  const verts = [];
  const faces = [];
  const tri = Math.floor(positions.length / 9);
  for (let t = 0; t < tri; t += 1) {
    const idx = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      const key = `${Math.round(positions[o] * inv)},${Math.round(positions[o + 1] * inv)},${Math.round(positions[o + 2] * inv)}`;
      let v = keyTo.get(key);
      if (v === undefined) {
        v = verts.length / 3;
        verts.push(positions[o], positions[o + 1], positions[o + 2]);
        keyTo.set(key, v);
      }
      idx[k] = v;
    }
    if (idx[0] !== idx[1] && idx[1] !== idx[2] && idx[0] !== idx[2]) faces.push(idx[0], idx[1], idx[2]);
  }
  const flZ = finishLineZ(points);
  const nf = faces.length / 3;
  const fn = new Float64Array(nf * 3);
  const outer = new Uint8Array(nf);
  for (let i = 0; i < nf; i += 1) {
    const a = faces[i * 3] * 3;
    const b = faces[i * 3 + 1] * 3;
    const c = faces[i * 3 + 2] * 3;
    const ux = verts[b] - verts[a];
    const uy = verts[b + 1] - verts[a + 1];
    const uz = verts[b + 2] - verts[a + 2];
    const wx = verts[c] - verts[a];
    const wy = verts[c + 1] - verts[a + 1];
    const wz = verts[c + 2] - verts[a + 2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    fn[i * 3] = nx / len;
    fn[i * 3 + 1] = ny / len;
    fn[i * 3 + 2] = nz / len;
    const cx = (verts[a] + verts[b] + verts[c]) / 3;
    const cy = (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3;
    const cz = (verts[a + 2] + verts[b + 2] + verts[c + 2]) / 3;
    const r = Math.hypot(cx, cy);
    const th = Math.atan2(cy, cx);
    const radial = r > 1e-6 ? (fn[i * 3] * cx + fn[i * 3 + 1] * cy) / r : 0;
    if (cz > flZ(th) + 0.3 && radial > 0.4 && r > 0.6) outer[i] = 1;
  }
  const edge = new Map();
  for (let i = 0; i < nf; i += 1) {
    if (!outer[i]) continue;
    const vs = [faces[i * 3], faces[i * 3 + 1], faces[i * 3 + 2]];
    for (let k = 0; k < 3; k += 1) {
      const a = vs[k];
      const b = vs[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = edge.get(key);
      if (list) list.push(i);
      else edge.set(key, [i]);
    }
  }
  const ang = [];
  for (const list of edge.values()) {
    if (list.length !== 2) continue;
    const a = list[0];
    const b = list[1];
    const d = fn[a * 3] * fn[b * 3] + fn[a * 3 + 1] * fn[b * 3 + 1] + fn[a * 3 + 2] * fn[b * 3 + 2];
    ang.push((Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
  }
  ang.sort((a, b) => a - b);
  const q = (p) => ang[Math.min(ang.length - 1, Math.floor(p * (ang.length - 1)))];
  return { n: ang.length, p50: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), p99: +q(0.99).toFixed(2) };
}

function sameTopology(before, after) {
  const a = parseStl(before);
  const b = parseStl(after);
  if (a.positions.length !== b.positions.length) return false;
  if ((a.attributes?.length || 0) !== (b.attributes?.length || 0)) return false;
  for (let i = 0; i < (a.attributes?.length || 0); i += 1) {
    if (a.attributes[i] !== b.attributes[i]) return false;
  }
  return true;
}

async function loadInput() {
  if (file) {
    const buf = fs.readFileSync(file);
    const mesh = Mesh.fromStlBuffer(buf);
    const raw = detectFinishLine(mesh.unweldedByAngle(), { log: () => {} });
    const points = sanitizeFinishlinePoints(raw.points, () => {});
    return { buf, points, label: path.basename(file), strategy: raw.strategyUsed };
  }
  const [{ default: mongoose }, { getMongoUri }, { getObjectBufferFromS3 }, { resolveFilledStlFile }] = await Promise.all([
    import("mongoose"),
    import("../db/_mongo.js"),
    import("../../utils/s3.utils.js"),
    import("../../utils/filledStlFile.js"),
  ]);
  await import("../../bootstrap/env.js");
  await mongoose.connect(getMongoUri());
  console.log("db:", mongoose.connection.name);
  const col = mongoose.connection.db.collection("requests");
  const projection = { requestId: 1, manufacturerStage: 1, lotNumber: 1, caseInfos: 1 };
  let doc = await col.findOne({ requestId }, { projection });
  if (!doc) doc = await col.findOne({ "lotNumber.value": requestId }, { projection });
  if (!doc) throw new Error(`의뢰 없음: ${requestId}`);
  const filled = resolveFilledStlFile(doc.caseInfos);
  const points = doc.caseInfos?.finishLine?.points;
  if (!filled?.s3Key || !points?.length) throw new Error("filled STL 또는 피니시라인이 없습니다.");
  const buf = await getObjectBufferFromS3(filled.s3Key);
  return {
    buf,
    points: points.map((p) => [Number(p[0]), Number(p[1]), Number(p[2])]),
    label: `${doc.requestId} lot=${doc.lotNumber?.value || "-"}`,
    strategy: doc.caseInfos.finishLine.strategyUsed,
    s3Key: filled.s3Key,
    requestId: doc.requestId,
    mongoose,
    stage: doc.manufacturerStage,
  };
}

if (!file && !requestId) {
  console.error("usage: fair-post.js --file in.stl [--out out.stl] | --request ID [--out out.stl] [--write]");
  process.exit(1);
}

const input = await loadInput();
console.log(input.label, "stage", input.stage || "-", "finishline", input.points.length, input.strategy || "");
const before = envelopeUm(input.buf, input.points);
const beforeDih = dihedralDeg(input.buf, input.points);
const result = fairPostAboveFinishLine(input.buf, { finishLinePoints: input.points });
const after = envelopeUm(result.buffer, input.points);
const afterDih = dihedralDeg(result.buffer, input.points);
const topology = sameTopology(input.buf, result.buffer);
console.log(JSON.stringify({
  version: POST_FAIR_VERSION,
  topology,
  movedCount: result.movedCount,
  maxInwardUm: +(result.maxInwardMm * 1000).toFixed(1),
  maxOutwardUm: +(result.maxOutwardMm * 1000).toFixed(1),
  revertedVertices: result.revertedVertices,
  desiredInwardUm: result.desiredInwardUm,
  envelopeOutwardP95Um: { before: before.outwardP95Um, after: after.outwardP95Um },
  envelopeAbsP95Um: { before: before.absP95Um, after: after.absP95Um },
  dihedralDeg: { before: beforeDih, after: afterDih },
}, null, 2));

if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, result.buffer);
  console.log("wrote", outPath);
}

if (writeBack) {
  if (!input.s3Key || !input.requestId) throw new Error("--write 는 --request 와 함께 씁니다.");
  const { uploadFileToS3 } = await import("../../utils/s3.utils.js");
  const key = `requests/${input.requestId}/2-filled/${input.requestId}.post-fair.filled.stl`;
  const up = await uploadFileToS3(result.buffer, key, "application/sla");
  const now = new Date();
  const fileMeta = {
    fileName: `${input.requestId}.post-fair.filled.stl`,
    fileType: "application/sla",
    fileSize: result.buffer.length,
    filePath: `${input.requestId}.post-fair.filled.stl`,
    s3Key: up.key,
    s3Url: up.location,
    uploadedAt: now,
  };
  await input.mongoose.connection.db.collection("requests").updateOne(
    { requestId: input.requestId },
    {
      $set: {
        "caseInfos.stlFile": fileMeta,
        "caseInfos.camFile": fileMeta,
        "caseInfos.postFair": {
          version: POST_FAIR_VERSION,
          movedCount: result.movedCount,
          maxInwardMm: Math.round(result.maxInwardMm * 1e6) / 1e6,
          maxOutwardMm: Math.round(result.maxOutwardMm * 1e6) / 1e6,
          sourceS3Key: input.s3Key,
          updatedAt: now,
        },
      },
    },
  );
  console.log("wrote s3", up.key);
}

if (input.mongoose) await input.mongoose.disconnect();
