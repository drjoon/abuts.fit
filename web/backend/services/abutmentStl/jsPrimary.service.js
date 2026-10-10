// related files:
// - web/backend/controllers/rhino/rhino.controller.js (triggerRhinoProcessFileForRequest: JS 우선, 실패 시 Rhino)
// - web/backend/controllers/bg/bg.controller.js (registerProcessedFile · registerStlMetadata 재사용)
// - web/backend/services/abutmentStl/pipeline.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx (JS 실패 뱃지)
// change-log:
// - 2026-10-10: JS 실패는 카드 뱃지만 남기고 원격 Rhino로 넘기지 않는다.
// - 2026-10-10: 반자동으로 저장한 피니시라인(source=frontend-manual)은 재검출하지 않는다.
// - 2026-10-09: 신설. 백엔드 JS 파이프라인이 1-stl → 2-filled를 먼저 처리한다.
//
// JS가 정상이면 Rhino는 호출하지 않는다. 문제가 나면 productionSchedule.stlJsFallback에
// 사유를 남기고 stlPreload를 FAILED로 둔다. 준비 카드는 «JS 실패» 뱃지를 보여 준다.
import path from "path";
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3, uploadFileToS3 } from "../../utils/s3.utils.js";
import { assessFinishLineQuality, isUserCapturedFinishLine } from "../../utils/finishLineQuality.js";
import { emitBgRuntimeStatus } from "../../controllers/bg/bgRuntimeEvents.js";
import { resolveAbutmentStlInputs } from "./abutmentStlInputs.js";
import { runAbutmentStlPipelineInWorker } from "./runPipelineInWorker.js";

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
  const request = await Request.findOne({ requestId }).select({ caseInfos: 1, manufacturerStage: 1 }).lean();
  if (!request) throw new JsPipelineProblem("request_not_found", "의뢰를 찾지 못했습니다.");
  if (String(request.manufacturerStage || "").trim() === "취소") return { skipped: "cancelled" };

  const ci = request.caseInfos || {};
  const originalS3Key = String(ci.file?.s3Key || "").trim();
  if (!originalS3Key) throw new JsPipelineProblem("original_missing", "원본 STL(S3)이 없습니다.");

  const [inputBuffer, inputs] = await Promise.all([
    getObjectBufferFromS3(originalS3Key),
    resolveAbutmentStlInputs(ci),
  ]);
  const storedFinishLine = isUserCapturedFinishLine(ci.finishLine) ? ci.finishLine : null;
  const js = await runAbutmentStlPipelineInWorker(inputBuffer, {
    targetDiameter: inputs.targetDiameter,
    implantProfile: inputs.implantProfile,
    ...(storedFinishLine ? { finishLinePoints: storedFinishLine.points } : {}),
  });
  assertJsResultUsable(js);

  const originalName = sanitizeStlName(fileName || ci.file?.filePath || ci.file?.originalName || "input.stl");
  const outName = filledNameOf(originalName);
  const s3Key = `requests/${requestId}/2-filled/${outName}`;
  const uploaded = await uploadFileToS3(js.outputBuffer, s3Key, "application/octet-stream");

  const { registerProcessedFile, registerStlMetadata } = await import("../../controllers/bg/bg.controller.js");

  // Rhino와 같은 순서: STL 메타데이터 → 파일 등록(2-filled)
  const meta = js.stlMetadata;
  await invokeController(registerStlMetadata, {
    requestId,
    maxDiameter: meta.maxDiameter,
    connectionDiameter: meta.connectionDiameter,
    totalLength: meta.totalLength,
    l1: meta.l1,
    taperAngle: meta.taperAngle,
    tiltAxisVector: meta.tiltAxisVector,
    frontPoint: meta.frontPoint,
    taperGuide: meta.taperGuide,
    lotEngravingSite: meta.lotEngravingSite,
    hexRotation: js.hexRotation || undefined,
    coordinateError: meta.coordinateValidation?.valid === false ? meta.coordinateValidation?.error || "coordinate error" : null,
  });
  await invokeController(registerProcessedFile, {
    sourceStep: "2-filled",
    fileName: outName,
    originalFileName: originalName,
    requestId,
    status: "success",
    s3Key: uploaded.key,
    s3Url: uploaded.location,
    fileSize: js.outputBuffer.length,
    metadata: {
      diameter: js.diameter,
      finishLine: js.finishLine,
      ...(js.hexRotation ? { hexRotation: js.hexRotation } : {}),
    },
  });
  await Request.updateOne({ requestId }, { $unset: { "productionSchedule.stlJsFallback": "" } }).catch(() => null);
  return { ok: true, outName, perf: js.perf };
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
    console.log(`[abutment-stl-js] requestId=${requestId} ${result.skipped ? `skipped=${result.skipped}` : `ok ${Date.now() - started}ms`}`);
  } catch (error) {
    const reason = error?.reason || "js_error";
    const detail = String(error?.message || error);
    console.warn(`[abutment-stl-js] failed requestId=${requestId} reason=${reason}: ${detail}`);
    await recordJsFailure(requestId, reason, detail).catch((e) =>
      console.warn("[abutment-stl-js] recordJsFailure failed", e?.message || e),
    );
  }
}
