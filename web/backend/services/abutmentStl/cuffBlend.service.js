// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js
// - web/backend/services/abutmentStl/cuffBlendLambda.service.js (ABUTMENT_STL_CUFF_LAMBDA가 있으면 람다에서 계산)
// - web/backend/controllers/bg/bg.controller.js (2-filled 등록 직후 auto)
// - web/backend/controllers/requests/common.files.controller.js (Re 버튼 · 의뢰자 제안 수락/거절)
// - web/frontend/src/features/requests/components/CuffProposalPanel.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/cuffBlendStatus.ts
//
// filled STL을 S3에서 읽어 커프 이음부를 고치고 같은 키에 덮어쓴다.
// 결과는 caseInfos.cuffBlend에 남긴다(status: applied | manual-review | spec-pending | failed).
import Request from "../../models/request.model.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import { getObjectBufferFromS3, putObjectToS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../requestSnapshotTriggers.service.js";
import { CUFF_BLEND_VERSION } from "./cuffBlend.js";
import { resolveCuffConnectionSpec } from "./cuffConnectionSpecs.js";
import { MeshWorkerQueueTimeoutError, MeshWorkerTimeoutError, runMeshWorker } from "./workerSlots.js";
import { CuffLambdaTimeoutError, cuffBlendLambdaName, runCuffBlendOnLambda } from "./cuffBlendLambda.service.js";

const WORKER_URL = new URL("./cuffBlend.worker.js", import.meta.url);
const TIMEOUT_MS = Number(process.env.CUFF_BLEND_TIMEOUT_MS || 30 * 1000);

export function isCuffBlendAutoEnabled() {
  return String(process.env.CUFF_BLEND_AUTO_DISABLED || "").trim() !== "true";
}

/** register-file 안 auto 보정이 메시 worker 슬롯을 기다리는 한도. 넘으면 보정을 건너뛰고 등록은 계속한다. */
const AUTO_QUEUE_TIMEOUT_MS = Number(process.env.CUFF_BLEND_AUTO_QUEUE_TIMEOUT_MS || 15 * 1000);
/** Re·제안 수락처럼 버튼이 기다리는 경로의 슬롯 대기 한도. */
const INTERACTIVE_QUEUE_TIMEOUT_MS = Number(process.env.CUFF_BLEND_QUEUE_TIMEOUT_MS || 30 * 1000);

/**
 * ABUTMENT_STL_CUFF_LAMBDA가 있으면 람다, 없거나 람다 호출 자체가 실패하면 로컬 워커.
 * 로컬 워커 timeout은 메시 worker 슬롯을 얻은 뒤부터 센다(workerSlots.js).
 * @param {"auto"|"redesign"|"propose"|"post"|"measure"} mode
 * @param {{ queueTimeoutMs?: number }} [run]
 */
export async function runCuffBlendInWorker(buffer, mode, options, run = {}) {
  if (cuffBlendLambdaName()) {
    try {
      return await runCuffBlendOnLambda(buffer, mode, options, { timeoutMs: TIMEOUT_MS });
    } catch (error) {
      if (error instanceof CuffLambdaTimeoutError) return { ok: false, status: "failed", reason: error.message };
      console.warn(`[cuff-blend] 람다 호출 실패, 로컬 워커로 돌립니다: ${error?.message || error}`);
    }
  }
  return runCuffBlendOnLocalWorker(buffer, mode, options, run);
}

async function runCuffBlendOnLocalWorker(buffer, mode, options, { queueTimeoutMs = 0 } = {}) {
  try {
    const msg = await runMeshWorker(WORKER_URL, {
      label: `cuff-blend:${mode}`,
      timeoutMs: TIMEOUT_MS,
      queueTimeoutMs,
      buildWorkerData: () => {
        const input = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
        return { workerData: { input, mode, options }, transferList: [input.buffer] };
      },
    });
    const result = msg?.result || { ok: false, status: "failed", reason: "커프 보정 결과가 없습니다." };
    if (msg?.output) {
      result.buffer = Buffer.from(msg.output.buffer, msg.output.byteOffset, msg.output.byteLength);
    }
    return result;
  } catch (error) {
    if (error instanceof MeshWorkerTimeoutError) {
      return { ok: false, status: "failed", reason: `커프 보정 시간 초과(${TIMEOUT_MS}ms)` };
    }
    if (error instanceof MeshWorkerQueueTimeoutError) {
      return {
        ok: false,
        status: "failed",
        reason: `커프 보정 대기 초과(${queueTimeoutMs}ms) — 다른 메시 작업이 진행 중이라 건너뜀`,
      };
    }
    return { ok: false, status: "failed", reason: String(error?.message || error) };
  }
}

function toPlain(caseInfos) {
  return typeof caseInfos?.toObject === "function" ? caseInfos.toObject() : caseInfos || {};
}

function buildRecord({ mode, result, specKey, s3Key }) {
  const d = result.detail || {};
  return {
    version: CUFF_BLEND_VERSION,
    mode,
    status: result.status,
    reason: result.reason || null,
    specKey,
    matchedSpecKey: d.matchedSpecKey || null,
    zA: d.zA ?? null,
    zB: d.zB ?? null,
    maxAngleDeg: d.maxAngleDeg ?? null,
    postSmooth: d.postSmooth || null,
    s3Key,
    updatedAt: new Date(),
  };
}

/**
 * @param {{ s3Key: string, caseInfos: object, mode?: "auto"|"redesign", queueTimeoutMs?: number }} args
 * @returns {Promise<{ ok: boolean, status: string, reason: string|null, record: object, fileSize: number|null, detail: object }>}
 */
export async function applyCuffBlendToFilledStl({
  s3Key,
  caseInfos,
  mode = "auto",
  queueTimeoutMs = INTERACTIVE_QUEUE_TIMEOUT_MS,
  blendOptions = {},
  /** 있으면 S3에서 다시 받지 않는다. JS 파이프라인이 방금 만든 filled 버퍼. */
  sourceBuffer = null,
  /** false면 호출부가 버퍼를 직접 업로드한다. */
  writeBack = true,
}) {
  const ci = toPlain(caseInfos);
  const { key, spec } = resolveCuffConnectionSpec(ci);
  // Mongoose 배열/서브문서가 worker structuredClone에서 "could not be cloned"로 터지므로 순수 JSON으로 만든다.
  const rawFinishLine = ci.finishLine || null;
  const finishLine = rawFinishLine ? JSON.parse(JSON.stringify(rawFinishLine)) : null;
  let result;
  if (!spec) {
    // 커프는 못 고쳐도 auto면 포스트 계단 결은 다듬는다.
    const post =
      mode === "auto"
        ? await runCuffBlendInWorker(
            sourceBuffer?.length ? sourceBuffer : await getObjectBufferFromS3(s3Key),
            "post",
            { finishLine },
            { queueTimeoutMs },
          )
        : null;
    result = {
      ok: false,
      status: "spec-pending",
      reason: `커넥션 스펙이 등록되지 않은 임플란트입니다(${key}). 개발팀 확인이 필요합니다.`,
      buffer: post?.buffer || null,
      detail: post?.detail || {},
    };
  } else {
    const source = sourceBuffer?.length ? sourceBuffer : await getObjectBufferFromS3(s3Key);
    result = await runCuffBlendInWorker(source, mode, { ...blendOptions, spec, specKey: key, finishLine }, { queueTimeoutMs });
  }
  // 스펙 미등록 샘플이 들어왔다. 미등록 스펙 전체를 다시 분석한다(결과는 호출부가 record를 저장한 뒤 읽히도록 워커가 지연한다).
  if (!spec && result.status === "spec-pending") {
    void import("../../jobs/cuffSpecSuggestWorker.js")
      .then((m) => m.triggerCuffSpecSuggest())
      .catch((error) => console.warn("[cuffSpecSuggest] trigger failed", error?.message || error));
  }
  let fileSize = null;
  // 커프 보정이 안 돼도(manual-review·spec-pending) 포스트를 다듬었으면 버퍼가 있다.
  const blended = result.buffer?.length ? result.buffer : null;
  if (blended && writeBack) {
    await putObjectToS3(s3Key, blended, { contentType: "application/sla" });
  }
  if (blended) fileSize = blended.length;
  return {
    ok: Boolean(result.ok),
    status: result.status,
    reason: result.reason || null,
    record: buildRecord({ mode, result, specKey: key, s3Key }),
    fileSize,
    buffer: blended,
    detail: result.detail || {},
  };
}

const PROPOSAL_EXCLUDED_CATEGORIES = new Set(["rnd_sample", "copied_sample"]);

/** 의뢰자에게 커프 재디자인을 제안할 수 있는 의뢰인가(의뢰자가 직접 올린 커스텀어벗, 준비 단계). */
export function isCuffProposalEligible(request) {
  const ci = request?.caseInfos || {};
  if (String(request?.manufacturerStage || "").trim() !== "준비") return false;
  if (String(request?.source || "").trim() === "manufacturer_sample") return false;
  if (PROPOSAL_EXCLUDED_CATEGORIES.has(String(request?.requestCategory || "").trim())) return false;
  if (ci.hexVerificationSample === true) return false;
  if (String(ci.productMode || "").trim() === "design_custom_abutment") return false;
  return true;
}

export function emitCuffProposalUpdated(request, extra = {}) {
  const payload = {
    requestId: request?.requestId || null,
    requestMongoId: String(request?._id || "").trim() || null,
    requestorBusinessAnchorId: String(request?.businessAnchorId || "").trim() || null,
    cuffProposal: request?.caseInfos?.cuffProposal || null,
    ...extra,
  };
  const requestorId = String(request?.requestor?._id || request?.requestor || "").trim();
  if (requestorId) emitAppEventToUser(requestorId, "request:cuff-proposal-updated", payload);
  emitAppEventToRoles(["manufacturer", "admin"], "request:cuff-proposal-updated", payload);
}

/**
 * 2-filled 등록 직후(응답 뒤) 부른다. 70°보다 누운 커프가 있으면 바꿀 옆모습 곡선을 caseInfos.cuffProposal에 남기고
 * 의뢰자에게 알린다. 메시는 바꾸지 않는다(의뢰자가 수락하면 redesign 적용).
 */
export async function proposeCuffRedesignForRequest(requestMongoId) {
  const request = await Request.findById(requestMongoId)
    .select({
      requestId: 1,
      requestor: 1,
      businessAnchorId: 1,
      manufacturerStage: 1,
      source: 1,
      requestCategory: 1,
      caseInfos: 1,
    })
    .lean();
  if (!request || !isCuffProposalEligible(request)) return null;
  const s3Key = String(resolveFilledStlFile(request.caseInfos)?.s3Key || "").trim();
  if (!s3Key) return null;
  const { key, spec } = resolveCuffConnectionSpec(request.caseInfos);
  if (!spec) return null;

  const source = await getObjectBufferFromS3(s3Key);
  const result = await runCuffBlendInWorker(source, "propose", {
    spec,
    specKey: key,
    finishLine: request.caseInfos?.finishLine || null,
  });
  if (!result.ok) {
    console.log("[cuff-proposal] none", { requestId: request.requestId, status: result.status, reason: result.reason });
    return null;
  }
  const cuffProposal = {
    status: "proposed",
    reason: result.reason || null,
    s3Key,
    createdAt: new Date(),
    maxCuffAngleDegBefore: result.detail?.maxCuffAngleDegBefore ?? null,
    maxAngleDegAfter: result.detail?.maxAngleDeg ?? null,
    curve: result.curve,
  };
  const updated = await Request.findOneAndUpdate(
    { _id: request._id, manufacturerStage: "준비" },
    { $set: { "caseInfos.cuffProposal": cuffProposal } },
    { new: true, projection: { requestId: 1, requestor: 1, businessAnchorId: 1, caseInfos: 1 } },
  ).lean();
  if (!updated) return null;
  console.log("[cuff-proposal] proposed", { requestId: request.requestId, ...result.detail });
  emitCuffProposalUpdated(updated);
  if (updated.businessAnchorId) {
    triggerDashboardSummaryRefreshForAnchorId(updated.businessAnchorId, "cuff-proposal");
  }
  return cuffProposal;
}

/**
 * register-file(2-filled) 안에서 호출한다. 실패해도 등록은 계속되도록 예외를 삼킨다.
 * 메시 worker 슬롯을 AUTO_QUEUE_TIMEOUT_MS 안에 못 얻으면 보정을 건너뛰고 failed(「커프 확인」)로 남긴다.
 */
export async function applyAutoCuffBlendSafely({
  s3Key,
  caseInfos,
  finishLine,
  sourceBuffer = null,
  writeBack = true,
}) {
  if (!isCuffBlendAutoEnabled() || (!s3Key && !sourceBuffer?.length)) return null;
  const ci = { ...toPlain(caseInfos), ...(finishLine ? { finishLine } : {}) };
  try {
    const out = await applyCuffBlendToFilledStl({
      s3Key,
      sourceBuffer,
      writeBack,
      caseInfos: ci,
      mode: "auto",
      queueTimeoutMs: AUTO_QUEUE_TIMEOUT_MS,
    });
    console.log("[cuff-blend] auto", { s3Key, status: out.status, reason: out.reason, ...out.detail });
    return out;
  } catch (error) {
    console.warn("[cuff-blend] auto failed", s3Key, error?.message || error);
    return {
      ok: false,
      status: "failed",
      reason: String(error?.message || error),
      record: buildRecord({
        mode: "auto",
        result: { status: "failed", reason: String(error?.message || error) },
        specKey: resolveCuffConnectionSpec(ci).key,
        s3Key,
      }),
      fileSize: null,
      detail: {},
    };
  }
}
