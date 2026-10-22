// related files:
// - web/backend/controllers/cnc/dummyProduct.js
// - web/backend/controllers/bg/bg.controller.js
// - web/backend/services/abutmentStl/jsPrimary.service.js
// - web/backend/controllers/rhino/rhino.controller.js
// - web/backend/controllers/requests/common.review.esprit.js
// - web/backend/rules.md
// change-log:
// - 2026-10-22: 선택 카드에서 STL·CAM을 각각 다시 만들거나 끊는다.
// - 2026-10-22: CAM은 새 filled STL이 저장된 뒤에만 시작한다. 중단은 대기 중인 CAM도 끊는다.
// - 2026-10-22: 더미 교체 시 filled STL·CAM 재생성. filled를 고르면 CAM을 이어서 더미 의뢰에만 저장.
import Request from "../../models/request.model.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 더미 교체 확인. filled STL을 고르면 CAM도 켠다.
 * @param {{ regenerateFilledStl?: boolean, regenerateCam?: boolean }} body
 */
export function resolveDummyRegenChoice(body) {
  const filledStl = body?.regenerateFilledStl === true;
  const cam = filledStl || body?.regenerateCam === true;
  return { filledStl, cam };
}

/**
 * 재생성에 필요한 원본이 있는지. 없으면 더미를 바꾸기 전에 거절한다.
 * @param {object} sourceDoc
 * @param {{ filledStl: boolean, cam: boolean }} choice
 */
export function assertDummyRegenPossible(sourceDoc, choice) {
  if (!choice?.filledStl && !choice?.cam) return;
  if (choice.filledStl) {
    const key = String(sourceDoc?.caseInfos?.file?.s3Key || "").trim();
    if (!key) {
      throw httpError(400, "원본 STL이 없어 filled STL을 다시 만들 수 없습니다.");
    }
    return;
  }
  const filled = resolveFilledStlFile(sourceDoc?.caseInfos);
  const filePath = String(filled?.filePath || "").trim();
  if (!filePath) {
    throw httpError(400, "filled STL이 없어 CAM만 다시 만들 수 없습니다.");
  }
}

function regenMeta(choice, requestedAt) {
  return {
    filledStl: Boolean(choice.filledStl),
    cam: Boolean(choice.cam),
    requestedAt,
  };
}

function originalFileName(requestLike) {
  const file = requestLike?.caseInfos?.file || {};
  return String(file.filePath || file.originalName || "").trim() || "input.stl";
}

async function markCamFailed(requestId, message) {
  const text = String(message || "CAM 재생성을 시작하지 못했습니다.").slice(0, 300);
  await Request.updateOne(
    { requestId },
    {
      $set: {
        "productionSchedule.ncPreload": {
          status: "FAILED",
          updatedAt: new Date(),
          error: text,
        },
      },
    },
  );
  return text;
}

async function triggerCam(requestId) {
  const fresh = await Request.findOne({ requestId });
  if (!fresh) {
    return { started: false, message: "더미 의뢰를 찾지 못했습니다." };
  }
  try {
    const { triggerEspritForNc } = await import(
      "../requests/common.review.esprit.js"
    );
    await triggerEspritForNc({ request: fresh, force: true });
    return { started: true, message: "" };
  } catch (error) {
    const message = await markCamFailed(requestId, error?.message);
    return { started: false, message };
  }
}

/**
 * 더미 복사본에 재생성을 건다. filled STL 결과·NC는 이 의뢰의 S3·메타에만 기록된다.
 * filled STL은 응답을 기다리지 않는다. CAM만이면 Esprit 접수까지만 기다린다.
 * @param {{ requestId?: string, caseInfos?: object }} requestLike
 * @param {{ filledStl: boolean, cam: boolean }} choice
 */
export async function startDummyArtifactRegen(requestLike, choice) {
  const requestId = String(requestLike?.requestId || "").trim();
  if (!requestId || (!choice?.filledStl && !choice?.cam)) {
    return { started: false, message: "" };
  }
  const requestedAt = new Date();
  const baseSet = {
    "productionSchedule.dummyArtifactRegen": regenMeta(choice, requestedAt),
    "productionSchedule.dummyCamAfterFilled": Boolean(
      choice.filledStl && choice.cam,
    ),
  };
  if (choice.filledStl) {
    // CAM은 새 filled STL이 더미 의뢰에 저장된 뒤에만 시작한다.
    await Request.updateOne(
      { requestId },
      {
        $set: baseSet,
        ...(choice.cam
          ? {
              $unset: {
                "caseInfos.ncFile": 1,
                "caseInfos.espFile": 1,
                "productionSchedule.ncPreload": 1,
              },
            }
          : {}),
      },
    );
    const fileName = originalFileName(requestLike);
    const { triggerRhinoProcessFileForRequest } = await import(
      "../rhino/rhino.controller.js"
    );
    triggerRhinoProcessFileForRequest({
      requestId,
      filePath: fileName,
      fileName,
    });
    return { started: true, message: "" };
  }

  await Request.updateOne(
    { requestId },
    {
      $set: {
        ...baseSet,
        "productionSchedule.ncPreload": {
          status: "GENERATING",
          updatedAt: requestedAt,
        },
      },
      $unset: { "caseInfos.ncFile": 1, "caseInfos.espFile": 1 },
    },
  );
  return triggerCam(requestId);
}

/** filled STL 등록이 끝나면 예약된 CAM을 더미 의뢰에 건다. */
export async function continueDummyCamAfterFilled(request) {
  const requestId = String(request?.requestId || "").trim();
  if (!requestId || !request?.productionSchedule?.dummyCamAfterFilled) return;
  const claimed = await Request.updateOne(
    { requestId, "productionSchedule.dummyCamAfterFilled": true },
    {
      $set: {
        "productionSchedule.dummyCamAfterFilled": false,
        "productionSchedule.ncPreload": {
          status: "GENERATING",
          updatedAt: new Date(),
        },
      },
      $unset: { "caseInfos.ncFile": 1, "caseInfos.espFile": 1 },
    },
  );
  const modified = Number(claimed?.modifiedCount ?? claimed?.nModified ?? 0);
  if (!modified) return;
  const fresh = await Request.findOne({ requestId })
    .select({
      caseInfos: 1,
      "productionSchedule.stlPreload.status": 1,
      "productionSchedule.ncPreload.status": 1,
    })
    .lean();
  const stlStatus = String(
    fresh?.productionSchedule?.stlPreload?.status || "",
  ).toUpperCase();
  const ncStatus = String(
    fresh?.productionSchedule?.ncPreload?.status || "",
  ).toUpperCase();
  if (
    stlStatus === "CANCELLED" ||
    stlStatus === "FAILED" ||
    ncStatus === "CANCELLED"
  ) {
    return;
  }
  const filledKey = String(resolveFilledStlFile(fresh?.caseInfos)?.s3Key || "");
  const ownsFilled = filledKey.includes(`requests/${requestId}/`);
  if (!ownsFilled) {
    const message = await markCamFailed(
      requestId,
      "새 filled STL이 없어 CAM을 시작하지 못했습니다.",
    );
    console.warn(
      `[dummy-artifact] skip CAM until dummy filled STL exists requestId=${requestId} s3Key=${filledKey} ${message}`,
    );
    return;
  }
  const result = await triggerCam(requestId);
  if (!result.started) {
    console.warn(
      `[dummy-artifact] CAM after filled STL failed requestId=${requestId}: ${result.message}`,
    );
  }
}

/**
 * 이미 고른 더미 의뢰에서 STL·CAM을 다시 만든다. 복사본은 새로 만들지 않는다.
 * @param {string} requestId
 * @param {{ filledStl: boolean, cam: boolean }} choice
 */
export async function restartDummyArtifactRegen(requestId, choice) {
  const rid = String(requestId || "").trim();
  if (!rid) throw httpError(400, "requestId가 필요합니다.");
  if (!choice?.filledStl && !choice?.cam) {
    throw httpError(400, "다시 만들 항목을 선택해 주세요.");
  }
  const doc = await Request.findOne({ requestId: rid });
  if (!doc) throw httpError(404, "더미 의뢰를 찾지 못했습니다.");
  const source = String(doc.source || "").trim();
  const category = String(doc.requestCategory || "").trim();
  if (source !== "dummy_sample" && category !== "dummy_sample") {
    throw httpError(409, "더미 의뢰만 다시 만들 수 있습니다.");
  }
  const stlStatus = String(
    doc?.productionSchedule?.stlPreload?.status || "",
  ).toUpperCase();
  if (!choice.filledStl && choice.cam && stlStatus === "GENERATING") {
    throw httpError(409, "STL이 끝난 뒤에 CAM을 다시 만듭니다.");
  }
  assertDummyRegenPossible(doc, choice);
  const ncStatus = String(
    doc?.productionSchedule?.ncPreload?.status || "",
  ).toUpperCase();
  if (ncStatus === "GENERATING" || ncStatus === "UPLOADING") {
    const { abortEspritForNc } = await import(
      "../requests/common.review.esprit.js"
    );
    await abortEspritForNc({ requestId: rid });
  }
  return startDummyArtifactRegen(doc, choice);
}

/** 진행 중인 filled STL·대기 CAM·CAM 생성을 끊는다. target은 stl·cam. */
export async function cancelDummyArtifactRegen(requestId, target = "all") {
  const rid = String(requestId || "").trim();
  const which = target === "stl" || target === "cam" ? target : "all";
  if (!rid) throw httpError(400, "requestId가 필요합니다.");
  const doc = await Request.findOne({ requestId: rid })
    .select({
      source: 1,
      requestCategory: 1,
      "productionSchedule.stlPreload.status": 1,
      "productionSchedule.ncPreload.status": 1,
      "productionSchedule.dummyCamAfterFilled": 1,
    })
    .lean();
  if (!doc) throw httpError(404, "더미 의뢰를 찾지 못했습니다.");
  const source = String(doc.source || "").trim();
  const category = String(doc.requestCategory || "").trim();
  if (source !== "dummy_sample" && category !== "dummy_sample") {
    throw httpError(409, "더미 의뢰만 중단할 수 있습니다.");
  }
  const stlStatus = String(doc?.productionSchedule?.stlPreload?.status || "").toUpperCase();
  const ncStatus = String(doc?.productionSchedule?.ncPreload?.status || "").toUpperCase();
  const camWaiting = Boolean(doc?.productionSchedule?.dummyCamAfterFilled);
  const stlRunning = stlStatus === "GENERATING";
  const camRunning = ncStatus === "GENERATING" || ncStatus === "UPLOADING";
  const cancelStl = (which === "all" || which === "stl") && stlRunning;
  const cancelCam =
    (which === "all" || which === "cam" || (which === "stl" && camWaiting)) &&
    (camWaiting || camRunning);
  const now = new Date();
  const cancelled = {
    status: "CANCELLED",
    updatedAt: now,
    error: "dummy_regen_cancelled",
  };
  const patch = {
    ...(cancelCam ? { "productionSchedule.dummyCamAfterFilled": false } : {}),
    ...(cancelStl ? { "productionSchedule.stlPreload": cancelled } : {}),
    ...(cancelCam ? { "productionSchedule.ncPreload": cancelled } : {}),
  };
  if (Object.keys(patch).length > 0) {
    await Request.updateOne({ requestId: rid }, { $set: patch });
  }
  if (cancelCam && camRunning) {
    const { abortEspritForNc } = await import(
      "../requests/common.review.esprit.js"
    );
    await abortEspritForNc({ requestId: rid });
  }
  return { cancelled: true };
}

/** filled STL이 실패하면 이어서 CAM을 만들지 않는다. */
export async function abortDummyCamAfterFilled(requestId, reason) {
  const rid = String(requestId || "").trim();
  if (!rid) return;
  const message = String(reason || "filled STL 재생성 실패").slice(0, 300);
  await Request.updateOne(
    { requestId: rid, "productionSchedule.dummyCamAfterFilled": true },
    {
      $set: {
        "productionSchedule.dummyCamAfterFilled": false,
        "productionSchedule.ncPreload": {
          status: "FAILED",
          updatedAt: new Date(),
          error: message,
        },
      },
    },
  );
}
