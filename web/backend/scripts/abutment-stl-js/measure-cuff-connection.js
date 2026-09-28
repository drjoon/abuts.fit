// related files:
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js (결과를 여기 추가)
// - web/backend/services/abutmentStl/cuffBlend.js (measureCuffConnection)
// - .cursor/rules/cuff-connection-spec.mdc
//
// 커프 이음부 보정이 spec-pending으로 멈춘 의뢰의 filled STL에서 11° 커넥션 테이퍼 끝 높이를 잰다.
// DB·S3는 읽기만 한다.
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test node scripts/abutment-stl-js/measure-cuff-connection.js --pending
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test node scripts/abutment-stl-js/measure-cuff-connection.js --request 20260928-ABCDEFGH
//
// 제안값 채택 기준: 같은 specKey에서 stepAboveTopMm>0.015(턱 있는 샘플)의 taperTopZ가 ±0.03mm 안에 모일 것.
// 원점 직경은 자체검사 diameterRef(SelfInspectionReportModal.tsx)를 쓴다(측정값은 정렬 확인용).
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { measureCuffConnection } from "../../services/abutmentStl/cuffBlend.js";
import { cuffConnectionSpecKey } from "../../services/abutmentStl/cuffConnectionSpecs.js";

const args = process.argv.slice(2);
const requestIds = args.flatMap((a, i) => (a === "--request" && args[i + 1] ? [args[i + 1]] : []));
const pending = args.includes("--pending");
const limit = Number(args[args.indexOf("--limit") + 1]) || 30;

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : null;
};

await mongoose.connect(getMongoUri());
const filter = requestIds.length
  ? { requestId: { $in: requestIds } }
  : pending
    ? { "caseInfos.cuffBlend.status": "spec-pending" }
    : null;
if (!filter) {
  console.log("--pending 또는 --request <requestId> 를 지정하세요.");
  process.exit(1);
}
const docs = await mongoose.connection.db
  .collection("requests")
  .find(filter, { projection: { requestId: 1, caseInfos: 1 } })
  .sort({ createdAt: -1 })
  .limit(requestIds.length || limit)
  .toArray();

const bySpec = new Map();
for (const d of docs) {
  const key = cuffConnectionSpecKey(d.caseInfos);
  const s3Key = resolveFilledStlFile(d.caseInfos)?.s3Key;
  if (!s3Key) continue;
  try {
    const m = measureCuffConnection(await getObjectBufferFromS3(s3Key));
    console.log(key.padEnd(34), d.requestId, m ? JSON.stringify(m) : "11° 원뿔 없음");
    if (!m) continue;
    if (!bySpec.has(key)) bySpec.set(key, []);
    bySpec.get(key).push(m);
  } catch (error) {
    console.log(key.padEnd(34), d.requestId, "읽기 실패", error?.message || error);
  }
}

console.log("\n=== 제안 (턱 있는 샘플 기준)");
for (const [key, rows] of bySpec) {
  const stepped = rows.filter((r) => r.stepAboveTopMm > 0.015);
  const zs = stepped.map((r) => r.taperTopZ);
  const spread = zs.length ? Math.max(...zs) - Math.min(...zs) : null;
  console.log(
    `${key}  samples=${rows.length} stepped=${stepped.length}`,
    `taperTopZ median=${median(zs)} spread=${spread?.toFixed(3) ?? "-"}`,
    `measuredOrigin=${median(rows.map((r) => r.originDiameter))}`,
    spread != null && spread <= 0.06 && stepped.length >= 3
      ? `→ { key: "${key}", originDiameter: <diameterRef>, taperHeightMm: ${median(zs)}, samples: ${stepped.length} }`
      : "→ 샘플 부족/혼재: 더 모아서 다시 측정",
  );
}
await mongoose.disconnect();
