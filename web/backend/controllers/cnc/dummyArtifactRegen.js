// related files:
// - web/backend/controllers/cnc/dummyProduct.js
// - web/backend/controllers/bg/bg.controller.js
// - web/backend/services/abutmentStl/jsPrimary.service.js
// - web/backend/controllers/rhino/rhino.controller.js
// - web/backend/controllers/requests/common.review.esprit.js
// - web/backend/rules.md
// change-log:
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
    await Request.updateOne(
      { requestId },
      {
        $set: {
          ...baseSet,
          ...(choice.cam
            ? {
                "productionSchedule.ncPreload": {
                  status: "GENERATING",
                  updatedAt: requestedAt,
                },
              }
            : {}),
        },
        ...(choice.cam
          ? { $unset: { "caseInfos.ncFile": 1, "caseInfos.espFile": 1 } }
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
  const result = await triggerCam(requestId);
  if (!result.started) {
    console.warn(
      `[dummy-artifact] CAM after filled STL failed requestId=${requestId}: ${result.message}`,
    );
  }
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
