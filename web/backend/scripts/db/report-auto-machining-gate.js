// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/scripts/db/_mongo.js
// 자동 가공 게이트 섀도 리포트(읽기 전용). 게이트 판정을 사람의 실제 결과와 비교한다.
//   불량 = 불완전가공 판정 | 알람 실패 | CNC_PROGRAM_TOO_LARGE
//   기본: 섀도 기록(autoMachiningReview)이 있는 의뢰 비교
//   --backtest: 기록이 없어도 최근 180일 의뢰를 현재 규칙으로 즉석 판정(DB 쓰기 없음)
// 사용: ENV_FILE=local.env NODE_ENV=test node scripts/db/report-auto-machining-gate.js [--backtest]
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri, getDbNameFromMongoUri } from "./_mongo.js";
import { evaluateAutoMachiningGate } from "../../services/autoMachiningGate.service.js";

const backtest = process.argv.includes("--backtest");
const uri = getMongoUri();
console.log("dbName", getDbNameFromMongoUri(uri));
await mongoose.connect(uri);
const db = mongoose.connection.db;
const R = db.collection("requests");

const failed = await db
  .collection("machiningrecords")
  .find({ status: "FAILED", $or: [{ "alarms.0": { $exists: true } }, { errorCode: "CNC_PROGRAM_TOO_LARGE" }] })
  .project({ requestId: 1 })
  .toArray();
const failedIds = new Set(failed.map((x) => x.requestId));

const since = new Date(Date.now() - 180 * 864e5);
const filter = backtest
  ? { manufacturerStage: { $ne: "취소" }, source: { $in: ["normal", null] }, createdAt: { $gte: since } }
  : { "autoMachiningReview.verdict": { $exists: true } };
const docs = await R.find(filter).toArray();

const t = { tp: 0, fp: 0, fn: 0, tn: 0 }; // 양성=보류
const missed = [];
const falseHold = [];
for (const d of docs) {
  const bad = Boolean(d.rnd?.unmachinableAt) || failedIds.has(d.requestId);
  let hold;
  let reasons;
  if (backtest) {
    const r = evaluateAutoMachiningGate(d);
    hold = r.verdict === "hold";
    reasons = r.reasons;
  } else {
    hold = d.autoMachiningReview.verdict === "hold";
    reasons = d.autoMachiningReview.reasons || [];
  }
  if (hold && bad) t.tp += 1;
  else if (hold && !bad) { t.fp += 1; falseHold.push([d.requestId, reasons.join(",")]); }
  else if (!hold && bad) { t.fn += 1; missed.push([d.requestId, d.manufacturerStage]); }
  else t.tn += 1;
}
const n = docs.length;
console.log(`mode=${backtest ? "backtest" : "records"} total=${n}`);
console.log("보류(양성) 기준 혼동행렬", JSON.stringify(t));
console.log(`보류율 ${(((t.tp + t.fp) / Math.max(1, n)) * 100).toFixed(1)}%  재현율 ${(t.tp / Math.max(1, t.tp + t.fn) * 100).toFixed(0)}%`);
console.log("누락(불량인데 통과):", JSON.stringify(missed));
console.log("보류했지만 불량 기록 없음(검토 필요):", JSON.stringify(falseHold));
await mongoose.disconnect();
