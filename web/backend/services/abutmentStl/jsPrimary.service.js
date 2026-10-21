// related files:
// - web/backend/controllers/rhino/rhino.controller.js (triggerRhinoProcessFileForRequest: JS 우선, 실패 시 Rhino)
// - web/backend/controllers/bg/bg.controller.js (registerProcessedFile · registerStlMetadata 재사용)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx (JS 실패 뱃지)
// change-log:
// - 2026-10-21: JS 계산은 람다(60초). 넘기거나 실패하면 준비 카드에 사유를 남긴다.
// - 2026-10-10: JS 실패는 카드 뱃지만 남기고 원격 Rhino로 넘기지 않는다.
// - 2026-10-10: 반자동으로 저장한 피니시라인(source=frontend-manual)은 재검출하지 않는다.
// - 2026-10-09: 신설. 백엔드 JS 파이프라인이 1-stl → 2-filled를 먼저 처리한다.
//
// JS가 정상이면 Rhino는 호출하지 않는다. 문제가 나면 productionSchedule.stlJsFallback에
// 사유를 남기고 stlPreload를 FAILED로 둔다. 준비 카드는 «JS 실패»와 사유 문구를 보여 준다.
// 계산 실행 위치는 execution.js가 정한다(람다 60초. 로컬만 워커, 테스트·프로덕션은 람다).
import path from "path";
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3, uploadFileToS3 } from "../../utils/s3.utils.js";
import { assessFinishLineQuality, isUserCapturedFinishLine } from "../../utils/finishLineQuality.js";
import { emitBgRuntimeStatus } from "../../controllers/bg/bgRuntimeEvents.js";
import { resolveAbutmentStlInputs } from "./abutmentStlInputs.js";
import { applyAutoCuffBlendSafely, isCuffBlendAutoEnabled } from "./cuffBlend.service.js";
import { isPersistedCorrectedDesignKey } from "./correctLambda.service.js";
import { runFilledStlOffRequest } from "./filledLambda.service.js";
import { describeJsPipelineFailure } from "./runPipelineInWorker.js";

/** 끄기: ABUTMENT_STL_JS_PRIMARY=false (Rhino만 사용) */
export function isAbutmentStlJsPrimaryEnabled() {
  return String(process.env.ABUTMENT_STL_JS_PRIMARY || "").trim().toLowerCase() !== "false";
}

/** rhino-server settings.sanitize_filename과 같다. */
function sanitizeStlName(name) {
  const base = path.basename(String(name || "input.stl").replace(/\\/g, "/"));
  const cleaned = base.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
  return cleaned.toLowerCase().endsWith(".stl") ? cleaned : `${cleaned}.stl`;
}

function filledNameOf(inputName) {
  const safe = sanitizeStlName(inputName);
  return sanitizeStlName(`${safe.replace(/\.[^.]+$/, "")}.filled.stl`);
}

/** 컨트롤러(req,res,next)를 서버 내부에서 호출한다. */
function invokeController(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) {
          reject(Object.assign(new Error(payload?.message || "controller failed"), { statusCode: this.statusCode }));
        } else resolve(payload);
        return this;
      },
    };
    handler({ body, params: {}, query: {}, headers: {} }, res, reject);
  });
}

class JsPipelineProblem extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.reason = reason;
  }
}

/** 결과가 쓸 만한지. 하나라도 걸리면 JS 실패로 남긴다. */
function assertJsResultUsable(js) {
  if (!js?.outputBuffer?.length) throw new JsPipelineProblem("empty_output", "JS 출력 STL이 비어 있습니다.");
  if (js.align && js.align.ok === false) {
    throw new JsPipelineProblem("align_failed", `정렬 실패: ${js.align.message || ""}`.trim());
  }
  const points = js.finishLine?.points;
  if (!Array.isArray(points) || points.length < 4) {
    throw new JsPipelineProblem("finishline_missing", "피니시라인을 찾지 못했습니다.");
  }
  const quality = assessFinishLineQuality(points);
  if (quality.defective) {
    throw new JsPipelineProblem(`finishline_${quality.reason}`, `피니시라인 불량(${quality.reason})`);
  }
  if (!js.stlMetadata) throw new JsPipelineProblem("metadata_missing", "STL 메타데이터를 계산하지 못했습니다.");
  const maxD = Number(js.diameter?.max);
  if (!(maxD > 0)) throw new JsPipelineProblem("diameter_missing", "직경을 계산하지 못했습니다.");
}

async function recordJsFailure(requestId, reason, detail) {
  const now = new Date();
  const message = String(detail || reason).slice(0, 300);
  await Request.updateOne(
    { requestId, manufacturerStage: { $ne: "취소" } },
    {
      $set: {
        "productionSchedule.stlJsFallback": { reason: message, at: now },
        "productionSchedule.stlPreload": {
          status: "FAILED",
          updatedAt: now,
          error: message,
        },
      },
    },
  );
  emitBgRuntimeStatus({
    requestId,
    source: "backend-js",
    stage: "request",
    status: "failed",
    label: "JS 실패",
    tone: "rose",
    clear: true,
    metadata: { reason, detail: message },
  });
}

/**
 * 백엔드 JS 파이프라인으로 Filled STL을 만들어 Rhino 콜백과 같은 경로로 등록한다.
 * 예외는 던진다(호출부가 카드에 JS 실패를 남긴다).
 */
export async function processRequestWithJsPipeline({ requestId, fileName }) {
  const stages = {};
  let mark = Date.now();
  const lap = (name) => {
    const now = Date.now();
    stages[name] = now - mark;
    mark = now;
  };
  const request = await Request.findOne({ requestId }).select({ caseInfos: 1, manufacturerStage: 1 }).lean();
  if (!request) throw new JsPipelineProblem("request_not_found", "의뢰를 찾지 못했습니다.");
  if (String(request.manufacturerStage || "").trim() === "취소") return { skipped: "cancelled" };

  const ci = request.caseInfos || {};
  const originalS3Key = String(ci.file?.s3Key || "").trim();
  if (!originalS3Key) throw new JsPipelineProblem("original_missing", "원본 STL(S3)이 없습니다.");
  const designAlreadyCorrected = isPersistedCorrectedDesignKey(originalS3Key);

  const [inputBuffer, inputs] = await Promise.all([
    getObjectBufferFromS3(originalS3Key),
    resolveAbutmentStlInputs(ci),
  ]);
  lap("load");
  const storedFinishLine = isUserCapturedFinishLine(ci.finishLine) ? ci.finishLine : null;
  // 의뢰 STL은 원본이다. 마진 코너는 옮기지 않는다.
  // 예전에 보정본 키로 저장된 파일만 커프·포스트가 이미 들어 있어 다시 다듬지 않는다.
  const surfacePrepared = designAlreadyCorrected;
  const js = await runFilledStlOffRequest(inputBuffer, {
    targetDiameter: inputs.targetDiameter,
    implantProfile: inputs.implantProfile,
    ...(inputs.connection ? { connection: inputs.connection } : {}),
    ...(storedFinishLine ? { finishLinePoints: storedFinishLine.points } : {}),
    ...(designAlreadyCorrected ? { designAlreadyCorrected: true } : {}),
    ...(surfacePrepared ? { surfacePrepared: true } : {}),
  });
  // 공구 R 필렛 보정의 동의 SSOT는 의뢰 파일이다. 보정본 키로 들어왔으면 의뢰자가 업로드 때 동의해
  // 이미 적용된 것이고, 아니면 미적용으로 기록한다. 제조사 준비에서는 보정을 새로 적용하지 않는다.
  if (js?.tightCorner) {
    js.tightCorner = designAlreadyCorrected
      ? {
          ...js.tightCorner,
          needsCorrectionReview: false,
          correctionSolid: null,
          filletCorrectionApplied: true,
          filletCorrectionConsented: true,
        }
      : { ...js.tightCorner, filletCorrectionApplied: false, filletCorrectionConsented: false };
  }
  assertJsResultUsable(js);
  lap("pipeline");

  const originalName = sanitizeStlName(fileName || ci.file?.filePath || ci.file?.originalName || "input.stl");
  const outName = filledNameOf(originalName);
  const s3Key = `requests/${requestId}/2-filled/${outName}`;
  // 마진 코너는 그대로 두고, 커프·커넥션·포스트 다듬기는 제조사 준비에서만 한다.
  let output = js.outputBuffer;
  let cuffBlendResult = js.cuffBlendResult?.record
    ? {
        record: { ...js.cuffBlendResult.record, s3Key },
        fileSize: js.cuffBlendResult.fileSize || null,
      }
    : null;
  if (!cuffBlendResult && isCuffBlendAutoEnabled() && !surfacePrepared) {
    const blended = await applyAutoCuffBlendSafely({
      s3Key,
      sourceBuffer: output,
      caseInfos: { ...ci, finishLine: js.finishLine },
      writeBack: false,
    });
    if (blended?.record) {
      cuffBlendResult = { record: blended.record, fileSize: blended.fileSize || null };
    }
    if (blended?.buffer?.length) output = blended.buffer;
  }
  lap("cuff");
  const uploaded = await uploadFileToS3(
    output,
    s3Key,
    cuffBlendResult?.record?.status === "applied" ? "application/sla" : "application/octet-stream",
  );
  lap("upload");

  const { registerProcessedFile } = await import("../../controllers/bg/bg.controller.js");

  // 메타데이터와 2-filled를 한 번에 저장한다. 문서를 두 번 읽고 쓰지 않는다.
  const meta = js.stlMetadata;
  await invokeController(registerProcessedFile, {
    sourceStep: "2-filled",
    fileName: outName,
    originalFileName: originalName,
    requestId,
    status: "success",
    s3Key: uploaded.key,
    s3Url: uploaded.location,
    fileSize: output.length,
    ...(cuffBlendResult ? { cuffBlendResult } : {}),
    ...(surfacePrepared ? { skipCuffBlend: true } : {}),
    stlMetadata: {
      maxDiameter: meta.maxDiameter,
      connectionDiameter: meta.connectionDiameter,
      totalLength: meta.totalLength,
      l1: meta.l1,
      taperAngle: meta.taperAngle,
      tiltAxisVector: meta.tiltAxisVector,
      frontPoint: meta.frontPoint,
      taperGuide: meta.taperGuide,
      lotEngravingSite: meta.lotEngravingSite,
      tightCorner: js.tightCorner || null,
      coordinateError:
        meta.coordinateValidation?.valid === false
          ? meta.coordinateValidation?.error || "coordinate error"
          : null,
    },
    metadata: {
      diameter: js.diameter,
      finishLine: js.finishLine,
      ...(js.hexRotation ? { hexRotation: js.hexRotation } : {}),
    },
  });
  lap("register");
  await Request.updateOne({ requestId }, { $unset: { "productionSchedule.stlJsFallback": "" } }).catch(() => null);
  return { ok: true, outName, perf: js.perf, stages, outBytes: output.length };
}

/**
 * 백엔드 JS 파이프라인. 실패하면 카드용 stlJsFallback만 남긴다.
 * @param {{ requestId: string, fileName: string }} args
 */
export async function runJsPrimaryThenFallback({ requestId, fileName }) {
  const started = Date.now();
  emitBgRuntimeStatus({
    requestId,
    source: "backend-js",
    stage: "request",
    status: "processing",
    label: "JS 작업중",
    tone: "blue",
    startedAt: new Date().toISOString(),
    elapsedSeconds: 0,
  });
  try {
    const result = await processRequestWithJsPipeline({ requestId, fileName });
    emitBgRuntimeStatus({
      requestId,
      source: "backend-js",
      stage: "request",
      status: "completed",
      label: "JS 작업 완료",
      tone: "blue",
      clear: true,
    });
    const perf = result.perf ? ` perf=${JSON.stringify(result.perf)}` : "";
    const stages = result.stages ? ` stagesMs=${JSON.stringify(result.stages)} outBytes=${result.outBytes}` : "";
    console.log(
      `[abutment-stl-js] requestId=${requestId} ${result.skipped ? `skipped=${result.skipped}` : `ok ${Date.now() - started}ms${stages}${perf}`}`,
    );
  } catch (error) {
    const described = describeJsPipelineFailure(error);
    const reason = described.reason;
    const detail = described.detail;
    console.warn(`[abutment-stl-js] failed requestId=${requestId} reason=${reason}: ${detail}`);
    await recordJsFailure(requestId, reason, detail).catch((e) =>
      console.warn("[abutment-stl-js] recordJsFailure failed", e?.message || e),
    );
  }
}
