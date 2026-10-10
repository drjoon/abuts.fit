// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (blendCuffJunction)
// - web/backend/scripts/abutment-stl-js/measure-cuff-connection.js
//
// auto 커프 이음 보정이 피니시라인과 그 위 메시를 한 점도 바꾸지 않는지 샘플로 검증한다.
// DB·S3는 읽기만 한다(결과를 저장하지 않는다).
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test node scripts/abutment-stl-js/verify-cuff-finishline.js --limit 40
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { parseStl } from "../../utils/screwHoleFill.js";
import { blendCuffJunction, _finishLineZByAngle, _findFinishCrease, _prepare } from "../../services/abutmentStl/cuffBlend.js";
import { resolveCuffConnectionSpec } from "../../services/abutmentStl/cuffConnectionSpecs.js";

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1]) || 40;
const KEY = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
const EPS = 2e-4;

const vertexSet = (buffer) => {
  const { positions } = parseStl(buffer);
  const set = new Set();
  const list = [];
  for (let i = 0; i < positions.length; i += 3) {
    set.add(KEY(positions[i], positions[i + 1], positions[i + 2]));
    list.push([positions[i], positions[i + 1], positions[i + 2]]);
  }
  return { set, list };
};

await mongoose.connect(getMongoUri());
console.log("db:", mongoose.connection.name);
const docs = await mongoose.connection.db
  .collection("requests")
  .find({ "caseInfos.finishLine.points.7": { $exists: true } }, { projection: { requestId: 1, caseInfos: 1 } })
  .sort({ createdAt: -1 })
  .limit(limit * 3)
  .toArray();

const tally = {};
let checked = 0;
for (const d of docs) {
  if (checked >= limit) break;
  const ci = d.caseInfos || {};
  const s3Key = resolveFilledStlFile(ci)?.s3Key;
  const { key, spec } = resolveCuffConnectionSpec(ci);
  if (!s3Key || !spec) continue;
  let buf;
  try {
    buf = await getObjectBufferFromS3(s3Key);
  } catch {
    continue;
  }
  const res = blendCuffJunction(buf, { spec, specKey: key, finishLine: ci.finishLine });
  checked += 1;
  tally[res.status] = (tally[res.status] || 0) + 1;
  if (!res.ok) {
    console.log(d.requestId, res.status, (res.reason || "").slice(0, 60));
    continue;
  }
  const before = vertexSet(buf);
  const after = vertexSet(res.buffer);
  const flZ = _finishLineZByAngle(ci.finishLine);
  // 마진 모서리에 붙인 경우 기준선은 그 모서리다.
  const crease = res.detail.seam === "crease" ? _findFinishCrease(_prepare(buf).mesh, flZ) : null;
  const seamZ = crease ? crease.zOf : flZ;
  const topOf = (x, y) => seamZ(Math.atan2(y, x)) - res.detail.finishLineOffsetMm;
  const limitZ = res.detail.followsFinishLine ? null : res.detail.zB;
  // (a) 띠 위 원본 꼭짓점이 모두 그대로 남았는가
  let lost = 0;
  let aboveCount = 0;
  for (const [x, y, z] of before.list) {
    const top = limitZ ?? topOf(x, y);
    if (z <= top + EPS) continue;
    aboveCount += 1;
    if (!after.set.has(KEY(x, y, z))) lost += 1;
  }
  // (b) 새로 생긴 꼭짓점은 피니시라인 곡선보다 항상 아래여야 한다(clearance>0). 최소 여유를 잰다.
  let minClearance = Infinity;
  let aboveFl = 0;
  for (const [x, y, z] of after.list) {
    if (before.set.has(KEY(x, y, z))) continue;
    const clearance = seamZ(Math.atan2(y, x)) - z;
    minClearance = Math.min(minClearance, clearance);
    if (clearance <= 0) aboveFl += 1;
  }
  // (c) 피니시라인 점 0.02mm 이내이면서 이음 위 끝 이상인 원본 꼭짓점은 모두 그대로여야 한다(모서리 아래 커프 쪽은 보정 대상).
  let nearLost = 0;
  const pts = ci.finishLine.points.map((p) => [Number(p[0]), Number(p[1]), Number(p[2])]);
  for (const [x, y, z] of before.list) {
    if (z < topOf(x, y) - EPS) continue;
    if (!pts.some((p) => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 0.02)) continue;
    if (!after.set.has(KEY(x, y, z))) nearLost += 1;
  }
  const over = aboveFl;
  const worst = minClearance;
  console.log(
    d.requestId.padEnd(24),
    "follow-FL",
    `zA=${res.detail.zA} zB=${res.detail.zB}`,
    `above=${aboveCount} lost=${lost} newAboveFL=${over} minClearance=${worst.toFixed(4)} flNearLost=${nearLost}`,
    lost || over || nearLost ? "FAIL" : "ok",
  );
}
console.log("\n상태 집계:", tally, "checked:", checked);
await mongoose.disconnect();
