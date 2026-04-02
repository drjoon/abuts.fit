import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Request from "../models/request.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../local.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);

// 양미연, 강미영 의뢰 조회
const requestIds = ["20260401-USUACVDY", "20260402-NXMAQXCK"];

console.log("\n=== M4/M5 파일 배정 문제 디버깅 ===\n");

for (const rid of requestIds) {
  const req = await Request.findOne({ requestId: rid })
    .select({
      requestId: 1,
      manufacturerStage: 1,
      "productionSchedule.assignedMachine": 1,
      "productionSchedule.queuePosition": 1,
      "productionSchedule.diameterGroup": 1,
      "productionSchedule.diameter": 1,
      "ncFile.fileName": 1,
      "ncFile.filePath": 1,
      "ncFile.originalName": 1,
      assignedMachine: 1,
      "caseInfos.ncFile.fileName": 1,
      "caseInfos.ncFile.filePath": 1,
    })
    .lean();

  if (!req) {
    console.log(`❌ ${rid}: 의뢰를 찾을 수 없습니다.`);
    continue;
  }

  console.log(`\n📋 ${rid}:`);
  console.log(`  - manufacturerStage: ${req.manufacturerStage}`);
  console.log(
    `  - productionSchedule.assignedMachine: ${req.productionSchedule?.assignedMachine || "null"}`,
  );
  console.log(
    `  - productionSchedule.queuePosition: ${req.productionSchedule?.queuePosition || "null"}`,
  );
  console.log(
    `  - productionSchedule.diameterGroup: ${req.productionSchedule?.diameterGroup || "null"}`,
  );
  console.log(
    `  - productionSchedule.diameter: ${req.productionSchedule?.diameter || "null"}`,
  );
  console.log(`  - assignedMachine (레거시): ${req.assignedMachine || "null"}`);
  console.log(`  - ncFile.fileName: ${req.ncFile?.fileName || "null"}`);
  console.log(`  - ncFile.filePath: ${req.ncFile?.filePath || "null"}`);
  console.log(`  - ncFile.originalName: ${req.ncFile?.originalName || "null"}`);
  console.log(
    `  - caseInfos.ncFile.fileName: ${req.caseInfos?.ncFile?.fileName || "null"}`,
  );
  console.log(
    `  - caseInfos.ncFile.filePath: ${req.caseInfos?.ncFile?.filePath || "null"}`,
  );
}

// CAM/가공 단계의 모든 의뢰 조회
console.log("\n\n=== CAM/가공 단계 의뢰 목록 ===\n");

const allMachiningRequests = await Request.find({
  manufacturerStage: { $in: ["CAM", "가공"] },
})
  .select({
    requestId: 1,
    manufacturerStage: 1,
    "productionSchedule.assignedMachine": 1,
    "productionSchedule.queuePosition": 1,
    "productionSchedule.diameterGroup": 1,
    "ncFile.fileName": 1,
  })
  .sort({ "productionSchedule.queuePosition": 1, updatedAt: 1 })
  .lean();

console.log(`총 ${allMachiningRequests.length}개 의뢰\n`);

const byMachine = {};
for (const req of allMachiningRequests) {
  const mid = req.productionSchedule?.assignedMachine || "미배정";
  if (!byMachine[mid]) byMachine[mid] = [];
  byMachine[mid].push(req);
}

for (const [mid, reqs] of Object.entries(byMachine)) {
  console.log(`\n${mid}: ${reqs.length}개`);
  for (const r of reqs) {
    console.log(
      `  - ${r.requestId} (stage: ${r.manufacturerStage}, pos: ${r.productionSchedule?.queuePosition || "null"}, group: ${r.productionSchedule?.diameterGroup || "null"}, file: ${r.ncFile?.fileName || "null"})`,
    );
  }
}

await mongoose.disconnect();
console.log("\n✅ 완료\n");
