// related files:
// - web/backend/controllers/bg/bg.controller.js (registerProcessedFile → enqueue)
// - web/backend/jobs/abutmentStlShadowWorker.js
// - web/backend/models/abutmentStlShadowRun.model.js
// - web/backend/services/abutmentStl/evaluate.js
//
// 섀도 모드: Rhino가 2-filled를 등록하면 같은 원본을 JS로 돌려 비교만 저장한다.
// 적재: ABUTMENT_STL_SHADOW_ENABLED=true (API 서버, DB insert 1회).
// 계산: 웹 EB는 하지 않는다(t4g.small 버스트 CPU 보호, ABUTMENT_STL_SHADOW_WORKER=false).
//   PC1 원격 워커(scripts/abutment-stl-js/shadow-remote-worker.js)가 /api/bg/abutment-stl-shadow/claim·complete로
//   백엔드만 거친다(Atlas·AWS 자격증명 없음). 로컬 개발은 WORKER=true로 이 프로세스에서 돌린다.
// JS 결과 STL 업로드 URL은 백엔드에 ABUTMENT_STL_SHADOW_UPLOAD=true일 때만 발급한다.
import AbutmentStlShadowRun from "../../models/abutmentStlShadowRun.model.js";
import {
  getObjectBufferFromS3,
  getPresignedGetUrl,
  getPresignedPutUrl,
  putObjectToS3,
} from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { resolveAbutmentStlInputs } from "./abutmentStlInputs.js";
import { evaluateAgainstRhinoInWorker } from "./runPipelineInWorker.js";
import { SCREWHOLE_PARAMS } from "./fillScrewholes.js";

const STALE_RUNNING_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 2;

let wake = null;

export function isAbutmentStlShadowEnabled() {
  return String(process.env.ABUTMENT_STL_SHADOW_ENABLED || "").trim() === "true";
}

export function isAbutmentStlShadowWorkerEnabled() {
  return String(process.env.ABUTMENT_STL_SHADOW_WORKER || "").trim() === "true";
}

export function setAbutmentStlShadowWake(fn) {
  wake = fn;
}

function rhinoSnapshotOf(ci) {
  return {
    finishLine: ci?.finishLine
      ? {
          points: ci.finishLine.points || null,
          pt0: ci.finishLine.pt0 || null,
          max_z: ci.finishLine.max_z ?? null,
          min_z: ci.finishLine.min_z ?? null,
          updatedAt: ci.finishLine.updatedAt || null,
        }
      : null,
    hexRotation: ci?.hexRotation || null,
    maxDiameter: ci?.maxDiameter ?? null,
    connectionDiameter: ci?.connectionDiameter ?? null,
    totalLength: ci?.totalLength ?? null,
    l1: ci?.l1 ?? null,
    taperAngle: ci?.taperAngle ?? null,
    tiltAxisVector: ci?.tiltAxisVector ?? null,
    frontPoint: ci?.frontPoint ?? null,
    lotEngravingSite: ci?.lotEngravingSite ?? null,
    stlMetadataUpdatedAt: ci?.stlMetadataUpdatedAt ?? null,
  };
}

/**
 * register-file(2-filled 성공) 직후 호출한다. 응답 경로 밖에서 fire-and-forget.
 * @param {object} request 갱신된 Request 문서(lean 또는 doc)
 */
export async function enqueueAbutmentStlShadow(request, { trigger = "register-file" } = {}) {
  if (!isAbutmentStlShadowEnabled() || !request?._id) return null;
  const ci = request.caseInfos || {};
  const originalS3Key = String(ci.file?.s3Key || "").trim();
  const filled = resolveFilledStlFile(ci);
  const rhinoFilledS3Key = String(filled?.s3Key || "").trim();
  if (!originalS3Key || !rhinoFilledS3Key) return null;
  const uploadedAt = filled?.uploadedAt ? new Date(filled.uploadedAt) : new Date();
  const dedupeKey = `${request._id}:${uploadedAt.toISOString()}`;
  const inputs = await resolveAbutmentStlInputs(ci);
  try {
    const doc = await AbutmentStlShadowRun.create({
      request: request._id,
      requestId: request.requestId,
      dedupeKey,
      trigger,
      input: {
        originalS3Key,
        rhinoFilledS3Key,
        rhinoFilledUploadedAt: uploadedAt,
        targetDiameter: inputs.targetDiameter,
        implantProfile: inputs.implantProfile,
        screwholeParams: SCREWHOLE_PARAMS,
      },
      rhino: rhinoSnapshotOf(ci),
    });
    wake?.();
    return doc;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

/** 오래 running에 머문 건을 다시 대기열로 돌린다(프로세스 재시작 등). */
export async function requeueStaleAbutmentStlShadowRuns() {
  const res = await AbutmentStlShadowRun.updateMany(
    { status: "running", startedAt: { $lt: new Date(Date.now() - STALE_RUNNING_MS) }, attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: "queued" } },
  );
  return res.modifiedCount || 0;
}

function shadowOutputKey(run) {
  const base = String(run.input.rhinoFilledS3Key).split("/").pop().replace(/\.filled\.stl$/i, "");
  const stamp = new Date(run.input.rhinoFilledUploadedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  return `requests/${run.requestId}/2-filled-js-shadow/${base}.${stamp}.js.filled.stl`;
}

function isUploadEnabled() {
  return String(process.env.ABUTMENT_STL_SHADOW_UPLOAD || "").trim() === "true";
}

/** 대기열 1건을 running으로 잡는다. 없으면 null. */
export async function claimNextAbutmentStlShadow() {
  await requeueStaleAbutmentStlShadowRuns();
  return AbutmentStlShadowRun.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "running", startedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { queuedAt: 1 }, new: true },
  ).lean();
}

/**
 * 원격 워커(PC1)용 작업 명세. Mongo·AWS 자격증명 없이 presigned URL로만 파일을 주고받는다.
 */
export async function buildRemoteShadowJob(run) {
  const [original, rhinoFilled] = await Promise.all([
    getPresignedGetUrl(run.input.originalS3Key, 3600),
    getPresignedGetUrl(run.input.rhinoFilledS3Key, 3600),
  ]);
  const upload = isUploadEnabled() ? await getPresignedPutUrl(shadowOutputKey(run), "application/octet-stream", 3600) : null;
  return {
    runId: String(run._id),
    requestId: run.requestId,
    rhino: run.rhino,
    inputs: { targetDiameter: run.input.targetDiameter, implantProfile: run.input.implantProfile },
    screwholeParams: run.input.screwholeParams,
    downloads: { original: original.url, rhinoFilled: rhinoFilled.url },
    upload: upload ? { url: upload.url, key: upload.key } : null,
  };
}

/**
 * 결과 저장. record는 evaluateAgainstRhino 결과(outputBuffer 제외).
 * error가 있으면 재시도 여유가 있을 때 다시 queued로 돌린다.
 */
export async function completeAbutmentStlShadow(runId, { record = null, jsOutputS3Key = null, error = null } = {}) {
  const run = await AbutmentStlShadowRun.findById(runId).select({ status: 1, attempts: 1, requestId: 1 }).lean();
  if (!run || run.status !== "running") return false;
  if (error || !record) {
    await AbutmentStlShadowRun.updateOne(
      { _id: runId },
      {
        $set: {
          status: run.attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          error: String(error || "empty result"),
          finishedAt: new Date(),
        },
      },
    );
    console.error("[abutmentStlShadow] run failed", run.requestId, error);
    return true;
  }
  const ok = record.status === "ok";
  await AbutmentStlShadowRun.updateOne(
    { _id: runId },
    {
      $set: {
        status: ok ? "done" : "failed",
        finishedAt: new Date(),
        jsVersion: record.jsVersion,
        result: record,
        error: ok ? undefined : record.error,
        ...(jsOutputS3Key ? { jsOutputS3Key } : {}),
      },
    },
  );
  return true;
}

/** 이 프로세스에서 대기열 1건 처리(로컬·스크립트용). 처리했으면 true. */
export async function runNextAbutmentStlShadow() {
  const run = await claimNextAbutmentStlShadow();
  if (!run) return false;
  try {
    const [inputBuffer, rhinoFilledBuffer] = await Promise.all([
      getObjectBufferFromS3(run.input.originalS3Key),
      getObjectBufferFromS3(run.input.rhinoFilledS3Key),
    ]);
    const record = await evaluateAgainstRhinoInWorker({
      inputBuffer,
      rhinoFilledBuffer,
      rhino: run.rhino,
      inputs: { targetDiameter: run.input.targetDiameter, implantProfile: run.input.implantProfile },
      screwholeParams: run.input.screwholeParams,
    });
    let jsOutputS3Key = null;
    if (record.outputBuffer && isUploadEnabled()) {
      jsOutputS3Key = shadowOutputKey(run);
      await putObjectToS3(jsOutputS3Key, record.outputBuffer, { contentType: "application/octet-stream" });
    }
    delete record.outputBuffer;
    await completeAbutmentStlShadow(run._id, { record, jsOutputS3Key });
  } catch (error) {
    await completeAbutmentStlShadow(run._id, { error: String(error?.message || error) });
  }
  return true;
}
