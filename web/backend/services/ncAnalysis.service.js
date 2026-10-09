// related files:
// - web/backend/utils/ncProgramCheck.js
// - web/backend/controllers/bg/bg.controller.js
// - web/backend/controllers/cnc/machiningBridge.js
// change-log:
// - 2026-10-09: 신설. 3-nc 등록 직후 NC 좌표 범위를 분석해 caseInfos.ncFile.analysis에 저장한다.
import Request from "../models/request.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import { getObjectBufferFromS3 } from "../utils/s3.utils.js";
import { buildNcAnalysis, DEFAULT_NC_LIMITS } from "../utils/ncProgramCheck.js";

async function getNcLimits() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select("autoMachiningGate.ncLimits")
    .lean();
  return { ...DEFAULT_NC_LIMITS, ...(doc?.autoMachiningGate?.ncLimits || {}) };
}

/**
 * 응답 후 fire-and-forget로 호출한다(mutation-ux-latency).
 * 분석에 실패해도 가공 흐름은 막지 않는다(분석 없음=건너뛰지 않음).
 */
export async function analyzeAndStoreNc(request) {
  const s3Key = String(request?.caseInfos?.ncFile?.s3Key || "").trim();
  if (!s3Key) return null;
  const buf = await getObjectBufferFromS3(s3Key);
  const analysis = buildNcAnalysis(buf.toString("latin1"), await getNcLimits());
  // ncFile.uploadedAt이 같은 NC에만 기록(그 사이 재생성되면 덮지 않는다)
  await Request.updateOne(
    { _id: request._id, "caseInfos.ncFile.s3Key": s3Key },
    { $set: { "caseInfos.ncFile.analysis": analysis } },
    { timestamps: false },
  );
  if (analysis.flags.length) {
    console.warn("[ncAnalysis] flagged", {
      requestId: request.requestId,
      flags: analysis.flags,
      bbox: analysis.bbox,
    });
  }
  return analysis;
}
