// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/modules/bg/bg.routes.js
// - web/backend/scripts/abutment-stl-js/shadow-remote-worker.js (PC1)
//
// PC1 섀도 워커용: 대기열 1건을 넘기고(presigned URL 포함) 결과를 받는다.
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  buildRemoteShadowJob,
  claimNextAbutmentStlShadow,
  completeAbutmentStlShadow,
  isAbutmentStlShadowEnabled,
} from "../../services/abutmentStl/shadow.service.js";

export const claimAbutmentStlShadowJob = asyncHandler(async (req, res) => {
  if (!isAbutmentStlShadowEnabled()) {
    return res.status(200).json(new ApiResponse(200, { job: null, disabled: true }, "shadow disabled"));
  }
  const run = await claimNextAbutmentStlShadow();
  if (!run) return res.status(200).json(new ApiResponse(200, { job: null }, "no job"));
  const job = await buildRemoteShadowJob(run);
  return res.status(200).json(new ApiResponse(200, { job }, "claimed"));
});

export const completeAbutmentStlShadowJob = asyncHandler(async (req, res) => {
  const { runId } = req.params;
  const { record, jsOutputS3Key, error } = req.body || {};
  if (!runId) throw new ApiError(400, "runId required");
  if (jsOutputS3Key && !/^requests\/[^/]+\/2-filled-js-shadow\//.test(String(jsOutputS3Key))) {
    throw new ApiError(400, "invalid jsOutputS3Key");
  }
  const updated = await completeAbutmentStlShadow(runId, {
    record: record && typeof record === "object" ? record : null,
    jsOutputS3Key: jsOutputS3Key || null,
    error: error ? String(error).slice(0, 2000) : null,
  });
  return res.status(200).json(new ApiResponse(200, { updated }, updated ? "saved" : "ignored"));
});
