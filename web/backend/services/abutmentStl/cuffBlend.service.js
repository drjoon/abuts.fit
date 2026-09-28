// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js
// - web/backend/controllers/bg/bg.controller.js (2-filled 등록 직후 auto)
// - web/backend/controllers/requests/common.files.controller.js (Re 버튼 · 의뢰자 제안 수락/거절)
// - web/frontend/src/features/requests/components/CuffProposalPanel.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/cuffBlendStatus.ts
//
// filled STL을 S3에서 읽어 커프 이음부를 고치고 같은 키에 덮어쓴다.
// 결과는 caseInfos.cuffBlend에 남긴다(status: applied | manual-review | spec-pending | failed).
import { Worker } from "worker_threads";
import Request from "../../models/request.model.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import { getObjectBufferFromS3, putObjectToS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../requestSnapshotTriggers.service.js";
import { CUFF_BLEND_VERSION } from "./cuffBlend.js";
import { resolveCuffConnectionSpec } from "./cuffConnectionSpecs.js";

const WORKER_URL = new URL("./cuffBlend.worker.js", import.meta.url);
const TIMEOUT_MS = Number(process.env.CUFF_BLEND_TIMEOUT_MS || 30 * 1000);

export function isCuffBlendAutoEnabled() {
  return String(process.env.CUFF_BLEND_AUTO_DISABLED || "").trim() !== "true";
}

/** @param {"auto"|"redesign"} mode */
export function runCuffBlendInWorker(buffer, mode, options) {
  return new Promise((resolve) => {
    const input = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
    const worker = new Worker(WORKER_URL, {
      workerData: { input, mode, options },
      transferList: [input.buffer],
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ ok: false, status: "failed", reason: `커프 보정 시간 초과(${TIMEOUT_MS}ms)` });
    }, TIMEOUT_MS);
    worker.once("message", (msg) => {
      clearTimeout(timer);
      void worker.terminate();
      const result = msg?.result || { ok: false, status: "failed", reason: "커프 보정 결과가 없습니다." };
      if (msg?.output) {
        result.buffer = Buffer.from(msg.output.buffer, msg.output.byteOffset, msg.output.byteLength);
      }
      resolve(result);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, status: "failed", reason: String(error?.message || error) });
    });
  });
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
    s3Key,
    updatedAt: new Date(),
  };
}

/**
 * @param {{ s3Key: string, caseInfos: object, mode?: "auto"|"redesign" }} args
 * @returns {Promise<{ ok: boolean, status: string, reason: string|null, record: object, fileSize: number|null, detail: object }>}
 */
export async function applyCuffBlendToFilledStl({ s3Key, caseInfos, mode = "auto" }) {
  const ci = toPlain(caseInfos);
  const { key, spec } = resolveCuffConnectionSpec(ci);
  const finishLine = ci.finishLine || null;
  let result;
  if (!spec) {
    result = {
      ok: false,
      status: "spec-pending",
      reason: `커넥션 스펙이 등록되지 않은 임플란트입니다(${key}). 개발팀 확인이 필요합니다.`,
    };
  } else {
    const source = await getObjectBufferFromS3(s3Key);
    result = await runCuffBlendInWorker(source, mode, { spec, specKey: key, finishLine });
  }
  let fileSize = null;
  if (result.ok && result.buffer) {
    await putObjectToS3(s3Key, result.buffer, { contentType: "application/sla" });
    fileSize = result.buffer.length;
  }
  return {
    ok: Boolean(result.ok),
    status: result.status,
    reason: result.reason || null,
    record: buildRecord({ mode, result, specKey: key, s3Key }),
    fileSize,
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

/** register-file(2-filled) 안에서 호출한다. 실패해도 등록은 계속되도록 예외를 삼킨다. */
export async function applyAutoCuffBlendSafely({ s3Key, caseInfos, finishLine }) {
  if (!isCuffBlendAutoEnabled() || !s3Key) return null;
  const ci = { ...toPlain(caseInfos), ...(finishLine ? { finishLine } : {}) };
  try {
    const out = await applyCuffBlendToFilledStl({ s3Key, caseInfos: ci, mode: "auto" });
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
