import mongoose, { Types } from "mongoose";
import Request from "../../models/request.model.js";
import Machine from "../../models/machine.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Connection from "../../models/connection.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ReviewApprovalQueue from "../../models/reviewApprovalQueue.model.js";
import {
  applyStatusMapping,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPacking,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
  normalizeRequestForResponse,
} from "./utils.js";
import {
  ensureMailboxAddressForBusiness,
  isManufacturerSampleRequest,
} from "./mailbox.utils.js";
import { triggerNextAutoMachiningAfterComplete } from "../cnc/machiningBridge.js";
import s3Utils, { deleteFileFromS3 } from "../../utils/s3.utils.js";
import { resolvePrcFileNames } from "./prcMapping.utils.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  revertManufacturerStageByReviewStage,
  ensureRequestCreditSpendOnMachiningEnter,
  ensureRequestCreditRefundOnRollbackToCam,
  ensureShippingFeeSpendOnPackingApprove,
  ensureShippingFeeRefundOnShippingRollback,
  ensureDeliveryInfoShippedAtNow,
  hasRequestShippingOrCompletionHistory,
  updateCurrentEstimatedShipYmdOnPackingEnter,
} from "./common.review.helpers.js";
import {
  screenCamMachineForRequest,
  ensureMachineCompatibilityOrThrow,
  inferDiameterGroupFromDiameter,
  chooseMachineForCamMachining,
} from "./common.review.machine.js";
import { triggerEspritForNc } from "./common.review.esprit.js";
import { enqueueApproval } from "../../services/reviewApprovalQueue.service.js";
import {
  triggerPricingSnapshotForRequestDoc,
  triggerDashboardSummaryRefreshForAnchorId,
} from "../../services/requestSnapshotTriggers.service.js";

// Emit worksheet stage changed event

function emitWorksheetStageChanged(request, payload = {}) {
  const requestId = String(request?.requestId || "").trim();
  const requestMongoId = String(request?._id || "").trim();
  if (!requestId && !requestMongoId) return;

  // 의뢰자, 제조사, 관리자 모두에게 공정 변경 이벤트 전송
  emitAppEventToRoles(
    ["requestor", "manufacturer", "admin"],
    "request:stage-changed",
    {
      requestId,
      requestMongoId,
      manufacturerStage:
        String(request?.manufacturerStage || "").trim() || null,
      reviewStage: payload.reviewStage || null,
      reviewStatus: payload.reviewStatus || null,
      fromStage: payload.fromStage || null,
      toStage:
        payload.toStage ||
        String(request?.manufacturerStage || "").trim() ||
        null,
      source: payload.source || "review-status",
      request,
    },
  );
}

function emitManufacturingAsyncFailure({
  requestId,
  requestMongoId = null,
  action,
  stage = null,
  message,
}) {
  emitAppEventToRoles(
    ["manufacturer", "admin"],
    "request:async-action-failed",
    {
      requestId: requestId ? String(requestId) : null,
      requestMongoId: requestMongoId ? String(requestMongoId) : null,
      action: String(action || "").trim() || null,
      stage: String(stage || "").trim() || null,
      message: String(message || "비동기 후처리에 실패했습니다.").trim(),
    },
  );
}

// related files (screw lot tracking):
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/models/systemSettings.model.js
// - web/backend/models/request.model.js
const normalizePackingScrewType = (value) =>
  String(value || "")
    .slice(0, 30)
    .trim()
    .toUpperCase();

const normalizePackingScrewLot = (value) =>
  String(value || "")
    .slice(0, 120)
    .trim();

const normalizePackingScrewLotSettings = (raw) => {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && !Array.isArray(raw)
      ? Object.entries(raw).map(([type, lotNumber]) => ({ type, lotNumber }))
      : [];

  const items = [];
  for (const row of source) {
    const type = normalizePackingScrewType(row?.type);
    const lotNumber = normalizePackingScrewLot(row?.lotNumber);
    if (!type) continue;
    if (items.some((item) => item.type === type)) continue;
    items.push({ type, lotNumber });
  }
  return items;
};

const resolveScrewTypeByRequestCaseInfos = async (request) => {
  const caseInfos = request?.caseInfos || {};
  const manufacturer = String(caseInfos?.implantManufacturer || "").trim();
  const brand = String(caseInfos?.implantBrand || "").trim();
  const family = String(caseInfos?.implantFamily || "").trim();
  const implantType = String(caseInfos?.implantType || "").trim();

  if (!manufacturer || !brand || !family) return "";

  const candidateTypes = [];
  if (implantType === "Hex" || implantType === "Non-Hex") {
    candidateTypes.push(implantType);
  }
  if (!candidateTypes.includes("Hex")) candidateTypes.push("Hex");
  if (!candidateTypes.includes("Non-Hex")) candidateTypes.push("Non-Hex");

  let connection = null;
  for (const type of candidateTypes) {
    // eslint-disable-next-line no-await-in-loop
    connection = await Connection.findOne({
      manufacturer,
      brand,
      family,
      type,
      category: "hanhwa-connection",
    })
      .select({ screwType: 1 })
      .lean();
    if (connection) break;
  }

  const screwType = normalizePackingScrewType(connection?.screwType);
  return screwType || "";
};

const autoAssignPackingScrewLotIfPossible = async ({ request, actorUser }) => {
  const screwType = await resolveScrewTypeByRequestCaseInfos(request);
  if (!screwType) return;

  const settings = await SystemSettings.findOne({ key: "global" })
    .select({ packingScrewLotSettings: 1 })
    .lean();
  const lotMap = normalizePackingScrewLotSettings(
    settings?.packingScrewLotSettings || [],
  ).reduce((acc, row) => {
    acc[row.type] = row.lotNumber;
    return acc;
  }, {});
  const lotNumber = normalizePackingScrewLot(lotMap[screwType]);
  if (!lotNumber) return;

  request.screwTracking = {
    screwType,
    lotNumber,
    assignedAt: new Date(),
    assignedBy: actorUser?._id || null,
    assignedByName: String(actorUser?.name || "").trim(),
    source: "auto",
  };
};

function runStageFileCleanupInBackground({ requestId, stage, s3Key }) {
  Promise.resolve()
    .then(async () => {
      if (!s3Key) return;
      try {
        await deleteFileFromS3(s3Key);
      } catch (e) {
        emitManufacturingAsyncFailure({
          requestId,
          action: "stage-file-cleanup",
          stage,
          message: `공정 파일 정리 실패: ${e?.message || e}`,
        });
        console.warn("[STAGE_FILE_ASYNC_S3_DELETE_FAILED]", {
          requestId,
          stage,
          s3Key,
          error: e?.message || e,
        });
      }
    })
    .catch((e) => {
      emitManufacturingAsyncFailure({
        requestId,
        action: "stage-file-cleanup",
        stage,
        message: `공정 파일 정리 실패: ${e?.message || e}`,
      });
      console.warn("[STAGE_FILE_ASYNC_CLEANUP_FAILED]", {
        requestId,
        stage,
        s3Key,
        error: e?.message || e,
      });
    });
}

/**
 * CAM 단계 승인 후처리를 큐에 등록한다.
 * 기존 직접 실행 방식에서 reviewApprovalQueue 기반 직렬 처리로 전환.
 * 큐 워커가 chooseMachineForCamMachining + triggerNextAutoMachiningAfterComplete를 순서대로 처리한다.
 */
function runCamApprovePostProcessingInBackground({
  requestMongoId,
  requestId,
}) {
  // 큐에 enqueue. 워커가 직렬로 처리하므로 동시 요청 충돌 방지.
  Request.findById(requestMongoId)
    .then(async (request) => {
      if (!request) return;
      const requestObj = request.toObject
        ? request.toObject()
        : JSON.parse(JSON.stringify(request));
      await enqueueApproval({
        taskType: "CAM_STAGE_APPROVED",
        request: requestObj,
        actorUserId: null,
      });
    })
    .catch((err) => {
      emitManufacturingAsyncFailure({
        requestId,
        requestMongoId,
        action: "cam-approve-post-processing",
        stage: "cam",
        message: err?.message || "CAM 승인 큐 등록에 실패했습니다.",
      });
      console.error("[CAM-APPROVE] queue enqueue failed", {
        requestId,
        requestMongoId,
        message: err?.message || String(err || ""),
      });
    });
}

// 아래는 레거시: 큐 도입 이전의 직접 실행 방식 (더 이상 호출되지 않음)
function _legacyRunCamApprovePostProcessingInBackground_UNUSED({
  requestMongoId,
  requestId,
}) {
  Promise.resolve()
    .then(async () => {
      const request = await Request.findById(requestMongoId).catch(() => null);
      if (!request) return;
      if (String(request?.manufacturerStage || "").trim() !== "가공") return;

      const existingMachineId = String(
        request?.productionSchedule?.assignedMachine ||
          request?.assignedMachine ||
          "",
      ).trim();

      let selectedMachineId = existingMachineId;

      if (!selectedMachineId) {
        const selected = await chooseMachineForCamMachining({
          request,
          requireCeil: true,
          reserveAssignment: true,
        });

        request.productionSchedule = request.productionSchedule || {};
        request.productionSchedule.assignedMachine = selected.machineId;
        request.productionSchedule.queuePosition = selected.queuePosition;
        request.assignedMachine = selected.machineId;
        if (selected.diameterGroup) {
          request.productionSchedule.diameterGroup = selected.diameterGroup;
        }
        if (Number.isFinite(selected.diameter) && selected.diameter > 0) {
          request.productionSchedule.diameter = selected.diameter;
        }
        await request.save();
        selectedMachineId = selected.machineId;

        console.log("[CAM-APPROVE] single-request append assigned", {
          requestId,
          machineId: selected.machineId,
          queuePosition: selected.queuePosition,
          diameterGroup: selected.diameterGroup || null,
        });
      }

      if (!selectedMachineId) return;

      request.lotNumber = request.lotNumber || {};
      if (!request.lotNumber.material) {
        const cncMachine = await CncMachine.findOne({
          machineId: selectedMachineId,
        })
          .select({ currentMaterial: 1 })
          .lean()
          .catch(() => null);
        const heatNo = String(cncMachine?.currentMaterial?.heatNo || "").trim();
        if (heatNo) {
          request.lotNumber.material = heatNo;
          await request.save();
        }
      }

      const meta = await Machine.findOne({ uid: selectedMachineId })
        .select({ allowAutoMachining: 1, allowRequestAssign: 1 })
        .lean()
        .catch(() => null);

      if (meta?.allowRequestAssign === false) return;
      if (meta?.allowAutoMachining !== true) return;

      await triggerNextAutoMachiningAfterComplete({
        machineId: selectedMachineId,
        completedRequestId: null,
      });
    })
    .catch((err) => {
      emitManufacturingAsyncFailure({
        requestId,
        requestMongoId,
        action: "cam-approve-post-processing",
        stage: "cam",
        message:
          err?.message || "CAM 승인 후 재배정/자동 가공 후처리에 실패했습니다.",
      });
      console.error("[CAM-APPROVE] background post-processing failed", {
        requestId,
        requestMongoId,
        message: err?.message || String(err || ""),
      });
    });
}

async function assertAndClaimManufacturerRequestAccess({ req, request }) {
  if (req?.user?.role !== "manufacturer") return;
  if (!request) {
    const err = new Error("의뢰를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  const currentManufacturerId = request?.caManufacturer
    ? String(request.caManufacturer)
    : "";
  const actorManufacturerId = req?.user?._id ? String(req.user._id) : "";
  const actorBusinessAnchorId = req?.user?.businessAnchorId
    ? String(req.user.businessAnchorId)
    : "";

  // 같은 사용자면 OK
  if (currentManufacturerId === actorManufacturerId) {
    return;
  }

  // 다른 사용자지만 같은 BusinessAnchor 소속이면 OK
  if (currentManufacturerId && actorBusinessAnchorId) {
    const User = mongoose.model("User");
    const currentManufacturer = await User.findById(
      currentManufacturerId,
    ).select("businessAnchorId");
    const currentBusinessAnchorId = currentManufacturer?.businessAnchorId
      ? String(currentManufacturer.businessAnchorId)
      : "";

    if (
      currentBusinessAnchorId &&
      currentBusinessAnchorId === actorBusinessAnchorId
    ) {
      console.log(
        "[MANUFACTURER_ACCESS_CHECK] Same BusinessAnchor - Access granted",
        {
          requestId: request.requestId,
          currentManufacturerId,
          actorManufacturerId,
          businessAnchorId: actorBusinessAnchorId,
        },
      );
      return;
    }
  }

  // 다른 회사면 거부
  if (
    currentManufacturerId &&
    actorManufacturerId &&
    currentManufacturerId !== actorManufacturerId
  ) {
    const err = new Error("다른 제조사에 배정된 의뢰입니다.");
    err.statusCode = 403;
    throw err;
  }

  // caManufacturer가 없으면 현재 사용자로 설정
  if (!currentManufacturerId && req?.user?._id) {
    request.caManufacturer = req.user._id;
  }
}

export async function deleteStageFile(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "")
      .trim()
      .toLowerCase();
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    const allowed = ["machining", "packing", "shipping", "tracking"];

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    try {
      await assertAndClaimManufacturerRequestAccess({ req, request });
    } catch (accessError) {
      return res.status(accessError?.statusCode || 403).json({
        success: false,
        message: accessError?.message || "접근 권한이 없습니다.",
      });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    const meta = request.caseInfos.stageFiles?.[stage] || null;
    const s3Key = meta?.s3Key;

    if (rollbackOnly) {
      request.caseInfos.reviewByStage[stage] = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      bumpRollbackCount(request, stage);
      if (stage === "machining") {
        bumpRollbackCount(request, "cam");
      }
      if (stage === "packing") {
        bumpRollbackCount(request, "machining");
      }

      const prevStageMap = {
        machining: "CAM",
        packing: "가공",
        shipping: "세척.패킹",
        tracking: "포장.발송",
      };
      const prevStage = prevStageMap[stage];
      if (prevStage) {
        applyStatusMapping(request, prevStage);
      }
      request.productionSchedule = request.productionSchedule || {};
      if (stage === "machining") {
        request.productionSchedule.actualMachiningStart = null;
        request.productionSchedule.actualMachiningComplete = null;
        request.productionSchedule.assignedMachine = null;
        request.productionSchedule.queuePosition = null;
        request.assignedMachine = null;
        // machining 롤백 시 PRC 파일명 클리어 - 재가공 시 최신 PRC로 재결정되도록 한다.
        request.caseInfos.faceHolePrcFileName = null;
        request.caseInfos.connectionPrcFileName = null;
      }
      if (stage === "packing") {
        request.productionSchedule.actualMachiningStart = null;
        request.productionSchedule.actualMachiningComplete = null;
        request.productionSchedule.assignedMachine = null;
        request.productionSchedule.queuePosition = null;
        request.assignedMachine = null;
        // packing 롤백 시 PRC 파일명 클리어 - 재가공 시 최신 PRC로 재결정되도록 한다.
        // PRC 매핑이 변경된 경우 구버전 PRC가 재사용되는 버그 방지.
        request.caseInfos.faceHolePrcFileName = null;
        request.caseInfos.connectionPrcFileName = null;
        try {
          if (!global.__rollbackPackingReservedMachineLoadMap) {
            global.__rollbackPackingReservedMachineLoadMap = new Map();
          }
          if (!global.__rollbackPackingReservedQueuePositionMap) {
            global.__rollbackPackingReservedQueuePositionMap = new Map();
          }
          const selected = await chooseMachineForCamMachining({
            request,
            requireCeil: true,
            reservedMachineLoadMap:
              global.__rollbackPackingReservedMachineLoadMap,
            reservedQueuePositionMap:
              global.__rollbackPackingReservedQueuePositionMap,
            session,
          });
          global.__rollbackPackingReservedMachineLoadMap.set(
            selected.machineId,
            (global.__rollbackPackingReservedMachineLoadMap.get(
              selected.machineId,
            ) || 0) + 1,
          );
          global.__rollbackPackingReservedQueuePositionMap.set(
            selected.machineId,
            selected.queuePosition,
          );
          request.productionSchedule.assignedMachine = selected.machineId;
          request.productionSchedule.queuePosition = selected.queuePosition;
          if (selected.diameterGroup) {
            request.productionSchedule.diameterGroup = selected.diameterGroup;
          }
          if (Number.isFinite(selected.diameter)) {
            request.productionSchedule.diameter = selected.diameter;
          }
          request.assignedMachine = selected.machineId;
          console.log("[ROLLBACK-PACKING] reassigned machine", {
            requestId: request?.requestId,
            machineId: selected.machineId,
            queuePosition: selected.queuePosition,
            diameter: selected.diameter,
          });
        } catch (error) {
          console.warn("[ROLLBACK-PACKING] machine reassignment failed", {
            requestId: request?.requestId,
            message: error?.message || String(error || ""),
          });
        }
      }
      await request.save();

      // 롤백 시 캐시 무효화 (rules.md 섹션 6.1)
      const businessAnchorId = String(
        request?.businessAnchorId || request?.requestor?.businessAnchorId || "",
      ).trim();
      if (businessAnchorId) {
        triggerDashboardSummaryRefreshForAnchorId(
          businessAnchorId,
          `rollback:${stage}`,
        ).catch((err) =>
          console.error(
            "[ROLLBACK] triggerDashboardSummaryRefreshForAnchorId failed",
            err,
          ),
        );
      }

      return res.status(200).json({
        success: true,
        data: {
          _id: String(request._id),
          requestId: String(request.requestId || ""),
          manufacturerStage:
            String(request.manufacturerStage || "").trim() || null,
        },
      });
    }

    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "삭제할 파일이 없습니다.",
      });
    }

    delete request.caseInfos.stageFiles[stage];
    bumpRollbackCount(request, stage);
    if (stage === "machining") {
      bumpRollbackCount(request, "cam");
    }
    if (stage === "packing") {
      bumpRollbackCount(request, "machining");
    }

    // machining/packing 롤백 시 PRC 파일명 클리어 - 재가공 시 최신 PRC로 재결정되도록 한다.
    // PRC 매핑이 변경된 경우 구버전 PRC가 재사용되는 버그 방지.
    if (stage === "machining" || stage === "packing") {
      request.caseInfos.faceHolePrcFileName = null;
      request.caseInfos.connectionPrcFileName = null;
    }

    request.caseInfos.reviewByStage[stage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    // stageFiles의 stage는 reviewByStage 키와 동일한 문자열을 사용
    revertManufacturerStageByReviewStage(request, stage);

    await request.save();

    // 롤백 시 캐시 무효화 (rules.md 섹션 6.1)
    const businessAnchorId = String(
      request?.businessAnchorId || request?.requestor?.businessAnchorId || "",
    ).trim();
    if (businessAnchorId) {
      triggerDashboardSummaryRefreshForAnchorId(
        businessAnchorId,
        `rollback-with-file-delete:${stage}`,
      ).catch((err) =>
        console.error(
          "[ROLLBACK] triggerDashboardSummaryRefreshForAnchorId failed",
          err,
        ),
      );
    }

    runStageFileCleanupInBackground({
      requestId: request.requestId || request._id,
      stage,
      s3Key,
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: String(request._id),
        requestId: String(request.requestId || ""),
        manufacturerStage:
          String(request.manufacturerStage || "").trim() || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// related files (manufacturer hex rotation mode validation):
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/bg/bg.controller.js
const normalizeFinalHexRotation = (value) => {
  const v = String(value || "").trim();
  if (v === "STL모델대로" || v === "0") return "STL모델대로";
  if (v === "헥스30도회전" || v === "30") return "헥스30도회전";
  throw new Error(
    `유효하지 않은 헥스 회전 모드입니다. 'STL모델대로' | '헥스30도회전'만 허용됩니다. 입력값='${v}'`,
  );
};

const normalizeRequestorDefaultManufacturerHexRotationOrNull = (value) => {
  const v = String(value || "").trim();
  if (!v) return null;
  // Rhino align 정책: 제조사 default 모드는 STL모델대로/헥스30도회전(및 헥스X도회전) 허용.
  if (v === "STL모델대로") return "STL모델대로";
  if (v === "헥스30도회전") return "헥스30도회전";

  // "헥스X도회전" 전달 SSOT: X는 totalDeg(=30+minorDeg)
  // 하위호환: legacy minor(예: 헥스10도회전)는 X<30일 때 +30 보정
  const matched = v.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (matched) {
    const parsedX = Number(matched[1]);
    if (Number.isFinite(parsedX)) {
      const totalDeg = parsedX < 30 ? 30 + parsedX : parsedX;
      if (totalDeg === 30) return "헥스30도회전";
      return `헥스${String(totalDeg)}도회전`;
    }
  }
  // legacy "헥스회전각" 호환: 0=STL모델대로, 30=헥스30도회전
  if (v === "0") return "STL모델대로";
  if (v === "30") return "헥스30도회전";
  return null;
};

const normalizeLegacyManufacturerHexRotationOnRequest = (requestDoc) => {
  if (!requestDoc) return false;

  const caseRaw = String(requestDoc?.caseInfos?.manufacturerHexRotation || "").trim();
  const rndRaw = String(requestDoc?.rnd?.manufacturerHexRotation || "").trim();
  const caseParsed = normalizeRequestorDefaultManufacturerHexRotationOrNull(caseRaw);
  const rndParsed = normalizeRequestorDefaultManufacturerHexRotationOrNull(rndRaw);

  if ((!caseRaw || caseParsed) && (!rndRaw || rndParsed)) {
    return false;
  }

  const fallback = caseParsed || rndParsed || "STL모델대로";

  requestDoc.caseInfos = requestDoc.caseInfos || {};
  requestDoc.rnd = requestDoc.rnd || {};

  if (caseRaw && !caseParsed) {
    requestDoc.caseInfos.manufacturerHexRotation = fallback;
  }
  if (rndRaw && !rndParsed) {
    requestDoc.rnd.manufacturerHexRotation = fallback;
  }

  return true;
};

const resolveOppositeFinalHexRotation = (value) => {
  const mode = normalizeFinalHexRotation(value);
  switch (mode) {
    case "STL모델대로":
      return "헥스30도회전";
    case "헥스30도회전":
      return "STL모델대로";
    default:
      throw new Error(`지원하지 않는 헥스 회전 모드입니다. mode='${String(mode)}'`);
  }
};

const buildCaseInfosForDualHexClone = ({ sourceCaseInfos, now, oppositeHex }) => {
  const caseInfos = {
    ...(sourceCaseInfos || {}),
    reviewByStage: {
      request: {
        status: "APPROVED",
        updatedAt: now,
        updatedBy: null,
        reason: "",
      },
      cam: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      machining: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      packing: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      shipping: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      tracking: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
    },
    rollbackCounts: {
      request: 0,
      cam: 0,
      machining: 0,
      packing: 0,
      shipping: 0,
      tracking: 0,
    },
    stageFiles: {
      machining: null,
      packing: null,
      shipping: null,
      tracking: null,
    },
    // 원본 의뢰의 CAM 파일을 그대로 사용해 복사본도 즉시 NC 생성 가능해야 한다.
    camFile: sourceCaseInfos?.camFile || null,
    ncFile: null,
    finalHexRotation: oppositeHex,
  };

  return caseInfos;
};

export async function updateReviewStatusByStage(req, res) {
  const session = await mongoose.startSession();
  const { id } = req.params;
  try {
    const {
      stage,
      status,
      reason,
      stageOverride,
      forceReprocess,
      processBothHexVariants,
      approvalTriggerSource,
    } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "변경 권한이 없습니다." });
    }

    const allowedStages = [
      "request",
      "cam",
      "machining",
      "packing",
      "shipping",
      "tracking",
    ];
    // stageOverride가 있으면 이를 사용, 없으면 stage 사용
    const effectiveStage = String(stageOverride || stage || "").trim();
    if (!allowedStages.includes(effectiveStage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }

    const allowedStatuses = ["PENDING", "APPROVED", "REJECTED"];
    if (!allowedStatuses.includes(String(status || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 status 입니다.",
      });
    }

    const forceReprocessFlag =
      forceReprocess === true ||
      String(forceReprocess || "")
        .trim()
        .toLowerCase() === "true";

    const processBothHexVariantsFlag =
      processBothHexVariants === true ||
      String(processBothHexVariants || "")
        .trim()
        .toLowerCase() === "true";

    let resultRequest = null;
    let acceptedMessage = "";
    let previousManufacturerStage = null;
    let pendingEspritTriggerRequest = null;
    const pendingAdditionalEspritTriggerRequests = [];
    let requestStageMachineSelection = null;
    let isDuplicateRequestApprovalNoop = false;

    await session.withTransaction(async () => {
      const request = await Request.findById(id)
        .populate("requestor", "businessAnchorId")
        .session(session);
      if (!request) {
        const err = new Error("의뢰를 찾을 수 없습니다.");
        err.statusCode = 404;
        throw err;
      }

      await assertAndClaimManufacturerRequestAccess({ req, request });

      previousManufacturerStage =
        String(request.manufacturerStage || "").trim() || null;

      const currentRequestReviewStatus = String(
        request?.caseInfos?.reviewByStage?.request?.status || "",
      )
        .trim()
        .toUpperCase();

      // idempotency: 의뢰 단계 승인(APPROVED)이 이미 접수된 건은
      // 동일 승인 재호출을 no-op으로 처리하여 큐 재등록/재실행을 막는다.
      // 단, forceReprocess=true 이면 no-op을 우회하고 재처리를 허용한다.
      if (
        !forceReprocessFlag &&
        status === "APPROVED" &&
        effectiveStage === "request" &&
        currentRequestReviewStatus === "APPROVED" &&
        previousManufacturerStage === "의뢰"
      ) {
        isDuplicateRequestApprovalNoop = true;
        acceptedMessage =
          "이미 의뢰 승인 접수된 건입니다. 중복 승인 요청은 무시되었습니다.";
        resultRequest = request;
        console.log("[REVIEW] duplicate request approval noop", {
          requestId: request.requestId,
          requestMongoId: String(request._id || ""),
          effectiveStage,
          status,
          previousManufacturerStage,
          currentRequestReviewStatus,
        });
        return;
      }

      // 재제작/R&D 플로우 안전장치:
      // 배송/추적 이력이 있는 normal 원본은 request 단계 재승인으로 CAM에 되돌아가면 안 된다.
      // 재제작 작업은 반드시 source=manufacturer_sample 복사본에서만 진행한다.
      if (status === "APPROVED" && effectiveStage === "request") {
        const isNormalSource =
          String(request.source || "normal").trim() !== "manufacturer_sample";
        const hasShippingOrCompletionHistory =
          await hasRequestShippingOrCompletionHistory({
            request,
            session,
          });
        const isActuallyRequestStage = previousManufacturerStage === "의뢰";
        if (
          isNormalSource &&
          (!isActuallyRequestStage || hasShippingOrCompletionHistory)
        ) {
          console.error("[REVIEW_GUARD_BLOCK_NORMAL_SOURCE_REAPPROVAL]", {
            requestId: request.requestId,
            requestMongoId: String(request._id || ""),
            source: request.source || "normal",
            previousManufacturerStage,
            effectiveStage,
            status,
            hasShippingOrCompletionHistory,
            hasShippingPackageId: Boolean(request.shippingPackageId),
            hasDeliveryInfoRef: Boolean(request.deliveryInfoRef),
          });
          const err = new Error(
            "완료/배송 이력이 있는 원본 의뢰는 재제작 공정으로 직접 이동할 수 없습니다. R&D/재제작 복사본에서 작업해주세요.",
          );
          err.statusCode = 400;
          throw err;
        }

        requestStageMachineSelection = await ensureMachineCompatibilityOrThrow({
          request,
          stageKey: "request",
        });
      }

      ensureReviewByStageDefaults(request);

      request.caseInfos.reviewByStage[effectiveStage] = {
        status,
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: String(reason || ""),
      };

      // 승인 시 다음 공정으로 전환, 미승인(PENDING) 시 현재 단계로 되돌림
      if (status === "APPROVED") {
        const resolvedBusinessAnchorId = (() => {
          const directBusinessAnchorId = request.businessAnchorId;
          const directBusinessAnchorIdStr = String(
            directBusinessAnchorId || "",
          ).trim();
          if (directBusinessAnchorIdStr) {
            if (Types.ObjectId.isValid(directBusinessAnchorIdStr)) {
              return new Types.ObjectId(directBusinessAnchorIdStr);
            }
            return null;
          }

          const requestorBusinessAnchorId = request.requestor?.businessAnchorId;
          const requestorBusinessAnchorIdStr = String(
            requestorBusinessAnchorId || "",
          ).trim();
          if (!requestorBusinessAnchorIdStr) return null;
          if (!Types.ObjectId.isValid(requestorBusinessAnchorIdStr))
            return null;
          return new Types.ObjectId(requestorBusinessAnchorIdStr);
        })();

        const isNewSystemFree =
          request?.caseInfos?.newSystemRequest?.requested &&
          request?.caseInfos?.newSystemRequest?.free;

        // businessAnchorId 보정: 값이 비어 있을 때만 requestor anchor로 채운다.
        if (!request.businessAnchorId && resolvedBusinessAnchorId) {
          request.businessAnchorId = resolvedBusinessAnchorId;
          console.log("[REVIEW] Set missing businessAnchorId:", {
            requestId: request.requestId,
            to: String(resolvedBusinessAnchorId || "").trim() || null,
          });
        }

        {
          const requestAnchorIdStr = request.businessAnchorId
            ? String(request.businessAnchorId)
            : "";
          const requestorUserAnchorIdStr = request.requestor?.businessAnchorId
            ? String(request.requestor.businessAnchorId)
            : "";
          if (
            requestAnchorIdStr &&
            requestorUserAnchorIdStr &&
            requestAnchorIdStr !== requestorUserAnchorIdStr
          ) {
            console.error("[REQUEST_BUSINESS_MISMATCH_ON_REVIEW]", {
              requestId: request.requestId,
              requestMongoId: String(request._id),
              effectiveStage,
              status,
              businessAnchorId: requestAnchorIdStr,
              requestorUserBusinessAnchorId: requestorUserAnchorIdStr,
              requestorUserId: request.requestor?._id
                ? String(request.requestor._id)
                : null,
            });
          }
        }

        if (effectiveStage === "request") {
          const requestRollbackCount = Number(
            request?.caseInfos?.rollbackCounts?.request || 0,
          );
          const requestCamRollbackCount = Number(
            request?.caseInfos?.rollbackCounts?.machining || 0,
          );
          const canSkipCamRegeneration =
            !forceReprocessFlag &&
            (requestRollbackCount > 0 || requestCamRollbackCount > 0);

          // 비동기 처리: 의뢰 승인 시점에 manufacturerStage/status 를 CAM으로 바꾸지 않는다.
          // Esprit(NC 생성) 완료 콜백(/api/bg/register-file, sourceStep=3-nc)에서 상태를 CAM으로 전환한다.
          // 여기서는 '명령 접수'만 처리하고, BG 트리거만 시도한다.
          const screening =
            requestStageMachineSelection ||
            (await screenCamMachineForRequest({ request }));
          request.caseInfos.reviewByStage.request.reason = "";

          await ensureLotNumberForMachining(request);

          request.productionSchedule = request.productionSchedule || {};

          // 실제 소재가 적재된 장비 직경을 선호한다. (예: M4/M5 8mm 적재 시 8mm 설정)
          const preselectedDia = Number.isFinite(
            requestStageMachineSelection?.diameter,
          )
            ? requestStageMachineSelection.diameter
            : null;
          const preselectedGroup =
            requestStageMachineSelection?.diameterGroup || null;

          // 1차: 장비 실제 소재 직경(preselect), 2차: screening 결과
          let resolvedDia =
            preselectedDia ??
            (Number.isFinite(screening?.diameter) ? screening.diameter : null);
          let resolvedGroup =
            preselectedGroup || screening?.diameterGroup || screening?.reqGroup;
          // 3차: 여전히 미결정이거나 STL 최대직경보다 낮은 그룹으로 선택된 경우, 그룹 천장값으로 보정
          try {
            const maxD = Number(request?.caseInfos?.maxDiameter);
            if (Number.isFinite(maxD) && maxD > 0) {
              const ceilGroup = inferDiameterGroupFromDiameter(maxD) || "8";
              const groupToNumber = (g) =>
                g === "6" ? 6 : g === "8" ? 8 : g === "10" ? 10 : 12;
              const ceilNumber = groupToNumber(ceilGroup);
              const hasDia = Number.isFinite(resolvedDia) && resolvedDia > 0;
              if (!hasDia || (hasDia && resolvedDia < ceilNumber)) {
                resolvedDia = ceilNumber;
                resolvedGroup = ceilGroup;
              }
            }
          } catch {
            // ignore
          }

          if (Number.isFinite(resolvedDia)) {
            request.productionSchedule.diameter = resolvedDia;
          }
          if (resolvedGroup) {
            request.productionSchedule.diameterGroup =
              resolvedGroup || request.productionSchedule.diameterGroup;
          }

          // PRC 파일명은 의뢰자가 아니라, 관리자(의뢰 승인) 시점에 확정한다.
          // 누락 시 esprit-addin에서 OpenProcess("")로 크래시/불량 가공 위험이 있으므로 승인 자체를 막는다.
          const prcFiles = await resolvePrcFileNames(request.caseInfos || {});
          request.caseInfos.faceHolePrcFileName = prcFiles.faceHolePrcFileName;
          request.caseInfos.connectionPrcFileName =
            prcFiles.connectionPrcFileName;
          if (
            !request.caseInfos.faceHolePrcFileName ||
            !request.caseInfos.connectionPrcFileName
          ) {
            const impl = request.caseInfos || {};
            const detail = `${String(impl.implantManufacturer || "").trim()}/${String(
              impl.implantBrand || "",
            ).trim()}/${String(impl.implantFamily || "").trim()}/${String(impl.implantType || "").trim()}`;
            const err = new Error(
              `PRC 매핑을 찾을 수 없습니다. Implant=${detail}. PRC 파일명은 의뢰 승인 시점에 필수로 확정되어야 합니다.`,
            );
            err.statusCode = 400;
            throw err;
          }

          if (canSkipCamRegeneration) {
            applyStatusMapping(request, "CAM");
            acceptedMessage =
              "롤백 이력이 확인되어 CAM 재생성 없이 CAM 단계로 이동했습니다.";
          } else {
            request.productionSchedule.actualCamStart = new Date();
            pendingEspritTriggerRequest = request.toObject
              ? request.toObject()
              : JSON.parse(JSON.stringify(request));
            acceptedMessage = forceReprocessFlag
              ? "강제 재실행으로 CAM 작업을 다시 시작했습니다. 처리 완료 후 상태가 자동으로 업데이트됩니다."
              : "CAM 작업 명령이 접수되었습니다. 처리 완료 후 상태가 자동으로 업데이트됩니다.";
          }

          // related files (dual hex machining flow):
          // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
          // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
          // - web/backend/controllers/requests/common.requests.controller.js
          // 정책: 의뢰 단계 승인 시 헥스 회전값이 아직 미확정(null)이고
          // 작업자가 "STL모델대로/헥스30도회전 둘 다 가공"을 선택하면 반대 헥스 모드의 내부 복사본을 추가 생성한다.
          // 복사본은 제조사 전용(sample)으로 처리되어 크레딧 소모 없이 별도 lot/NC를 생성한다.
          const requestorBusinessAnchorIdRaw =
            request.businessAnchorId || request?.requestor?.businessAnchorId || null;
          const requestorBusinessAnchorId = String(
            requestorBusinessAnchorIdRaw || "",
          ).trim();
          let requestorDefaultManufacturerHexRotation = null;

          if (requestorBusinessAnchorId && Types.ObjectId.isValid(requestorBusinessAnchorId)) {
            const requestorBusinessAnchor = await BusinessAnchor.findById(
              requestorBusinessAnchorId,
            )
              .select({
                "requestSettings.defaultManufacturerHexRotation": 1,
                metadata: 1,
              })
              .session(session)
              .lean();

            const legacyHexRotationAngle =
              requestorBusinessAnchor?.metadata?.hexRotationAngle ||
              requestorBusinessAnchor?.metadata?.defaultManufacturerHexRotation ||
              requestorBusinessAnchor?.metadata?.manufacturerHexRotation ||
              null;

            requestorDefaultManufacturerHexRotation =
              normalizeRequestorDefaultManufacturerHexRotationOrNull(
                requestorBusinessAnchor?.requestSettings
                  ?.defaultManufacturerHexRotation || legacyHexRotationAngle,
              );
          }

          const shouldCreateDualHexVariant =
            processBothHexVariantsFlag &&
            requestorDefaultManufacturerHexRotation === null;

          if (shouldCreateDualHexVariant) {
            const originalHexSource =
              request?.caseInfos?.finalHexRotation ||
              request?.caseInfos?.requestorHexRotation;
            if (!String(originalHexSource || "").trim()) {
              return res.status(409).json({
                success: false,
                message:
                  "헥스 회전 모드가 비어 있어 STL모델대로/헥스30도회전 동시 가공 복사본을 생성할 수 없습니다.",
              });
            }

            let originalHex;
            try {
              originalHex = normalizeFinalHexRotation(originalHexSource);
            } catch (hexModeError) {
              return res.status(409).json({
                success: false,
                message:
                  hexModeError?.message ||
                  "헥스 회전 모드가 유효하지 않아 STL모델대로/헥스30도회전 동시 가공 복사본을 생성할 수 없습니다.",
              });
            }
            const oppositeHex = resolveOppositeFinalHexRotation(originalHex);
            const now = new Date();

            const cloneCaseInfos = buildCaseInfosForDualHexClone({
              sourceCaseInfos: request.caseInfos || {},
              now,
              oppositeHex,
            });
            cloneCaseInfos.reviewByStage.request.updatedBy = req.user?._id || null;

            const requestorId = request?.requestor?._id || request?.requestor || null;
            const cloneBusinessAnchorId =
              request.businessAnchorId || request?.requestor?.businessAnchorId || null;

            const clonedRequest = new Request({
              title: request.title || "",
              description: request.description || "",
              referenceIds: Array.isArray(request.referenceIds)
                ? request.referenceIds
                : [],
              caseInfos: cloneCaseInfos,
              requestor: requestorId,
              businessAnchorId: cloneBusinessAnchorId,
              caManufacturer: req.user?._id || request.caManufacturer || null,
              manufacturerStage: "의뢰",
              source: "manufacturer_sample",
              requestCategory: "copied_sample",
              lotNumber: {
                material: String(request?.lotNumber?.material || "").trim() || null,
                value: null,
              },
              assignedMachine: null,
              productionSchedule: {
                assignedMachine: null,
                queuePosition: null,
                machiningQty: 1,
                diameter: request?.productionSchedule?.diameter || null,
                diameterGroup: request?.productionSchedule?.diameterGroup || null,
                actualCamStart: now,
              },
              rnd: {
                doneAt: null,
                doneBy: null,
                doneFromStage: null,
                memo: "",
                memoUpdatedAt: null,
                memoUpdatedBy: null,
                manufacturerHexRotation: oppositeHex,
                manufacturerHexRotationUpdatedAt: now,
                manufacturerHexRotationUpdatedBy: req.user?._id || null,
              },
              price: {
                amount: 0,
                baseAmount: 0,
                discountAmount: 0,
                currency: "KRW",
                rule: "manufacturer_sample",
                paidAmount: 0,
                bonusAmount: 0,
              },
              statusHistory: [
                {
                  status: "헥스 이중 가공 자동 복사",
                  note: `원본 의뢰 ${request.requestId || "-"} 승인 시 반대 헥스(${oppositeHex}) 가공용으로 자동 생성`,
                  updatedBy: req.user?._id || null,
                  updatedAt: now,
                },
              ],
            });

            ensureReviewByStageDefaults(clonedRequest);
            await ensureLotNumberForMachining(clonedRequest);
            await clonedRequest.save({ session });

            pendingAdditionalEspritTriggerRequests.push(
              clonedRequest.toObject
                ? clonedRequest.toObject()
                : JSON.parse(JSON.stringify(clonedRequest)),
            );

            emitAppEventToRoles(
              ["manufacturer", "admin"],
              "worksheet:count-update",
              {
                stage: "request",
                delta: 1,
                requestId: clonedRequest.requestId,
                source: "manufacturer_sample",
                requestCategory: "copied_sample",
                originalRequestId: request.requestId,
              },
            );

            acceptedMessage = `${acceptedMessage} (헥스 STL모델대로/헥스30도회전 2건 가공용 복사본이 함께 생성되었습니다.)`;
          }
        } else {
          // CAM, machining 등 이후 단계는 필요 시 단계별로 비동기 처리 여부를 나눠서 관리한다.
          // CAM 승인 시에는 제조사 공정을 '가공' 단계로 즉시 전환하되,
          // 실제 CNC 가공 시작은 Bridge(CNC) 쪽 상태(allowAutoMachining, 자동 트리거 등)에 의해 제어된다.
          if (effectiveStage === "cam") {
            applyStatusMapping(request, "가공");
          } else if (effectiveStage === "machining") {
            // machining 단계 승인: 이미 가공이 완료된 의뢰(machiningRecord 있음)는 재가공 없이 바로 세척.패킹으로
            const hasMachiningRecord = !!request.machiningRecord;
            if (hasMachiningRecord) {
              console.log(
                "[MACHINING_APPROVAL] machiningRecord exists, skip machining and go to packing",
                {
                  requestId: request.requestId,
                  machiningRecord: String(request.machiningRecord),
                },
              );
            }
            applyStatusMapping(request, "세척.패킹");
            if (isManufacturerSampleRequest(request)) {
              request.mailboxAddress = null;
            } else {
              try {
                const requestorBusinessAnchorId = resolvedBusinessAnchorId;
                const nextMailboxAddress =
                  await ensureMailboxAddressForBusiness({
                    requestMongoId: request._id,
                    requestorOrgId: requestorBusinessAnchorId,
                    currentMailboxAddress: request.mailboxAddress,
                  });
                if (nextMailboxAddress) {
                  request.mailboxAddress = nextMailboxAddress;
                }
              } catch (err) {
                console.error("[MAILBOX_ALLOCATION_ERROR]", err);
              }
            }
          } else if (effectiveStage === "packing") {
            // 샘플 의뢰도 일반 의뢰와 동일하게 포장.발송 단계로 진행한다.
            // (차이는 크레딧 미차감 정책뿐)
            applyStatusMapping(request, "포장.발송");
          } else if (effectiveStage === "shipping") {
            // 샘플 의뢰도 일반 의뢰와 동일하게 추적관리 단계로 진행한다.
            applyStatusMapping(request, "추적관리");
          }
        }

        const shouldEnsureRequestSpend =
          ["cam", "machining", "packing", "shipping"].includes(
            String(effectiveStage || ""),
          ) &&
          resolvedBusinessAnchorId &&
          !isNewSystemFree &&
          !isManufacturerSampleRequest(request);

        if (shouldEnsureRequestSpend) {
          await ensureRequestCreditSpendOnMachiningEnter({
            request,
            businessAnchorId: resolvedBusinessAnchorId,
            actorUserId: req.user?._id || null,
            session,
          });
        }

        if (effectiveStage === "packing") {
          await ensureFinishedLotNumberForPacking(request);
          updateCurrentEstimatedShipYmdOnPackingEnter(request);
          try {
            const requestorBusinessAnchorId = resolvedBusinessAnchorId;
            console.log(
              `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 점검/할당 시작 - 사업자 anchor ID: ${requestorBusinessAnchorId}`,
            );
            const nextMailboxAddress = await ensureMailboxAddressForBusiness({
              requestMongoId: request._id,
              requestorOrgId: requestorBusinessAnchorId,
              currentMailboxAddress: request.mailboxAddress,
            });
            if (nextMailboxAddress) {
              request.mailboxAddress = nextMailboxAddress;
            }
            console.log(
              `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 점검/할당 완료: ${request.mailboxAddress}`,
            );
          } catch (err) {
            console.error("[MAILBOX_ALLOCATION_ERROR]", err);
          }

          // 스크류 로트 추적 스냅샷 자동 귀속
          // - 현재 전역 설정(A~E) 기준으로 의뢰에 고정 저장
          // - 이후 전역 로트가 변경되어도 기존 의뢰 스냅샷은 유지
          try {
            await autoAssignPackingScrewLotIfPossible({
              request,
              actorUser: req.user,
            });
          } catch (err) {
            console.error("[SCREW_LOT_AUTO_ASSIGN_ERROR]", err);
          }

          // 샘플 의뢰는 전체 공정 진행은 동일하게 허용하되, 배송비 크레딧은 차감하지 않는다.
          if (resolvedBusinessAnchorId && !isManufacturerSampleRequest(request)) {
            await ensureShippingFeeSpendOnPackingApprove({
              request,
              businessAnchorId: resolvedBusinessAnchorId,
              actorUserId: req.user?._id || null,
              session,
            });
          }
        }

        if (
          effectiveStage === "shipping" &&
          resolvedBusinessAnchorId &&
          !isManufacturerSampleRequest(request)
        ) {
          // 운영 중 과거 누락이 있더라도 shipping 승인 시점에 배송비 소비를 보강한다.
          await ensureShippingFeeSpendOnPackingApprove({
            request,
            businessAnchorId: resolvedBusinessAnchorId,
            actorUserId: req.user?._id || null,
            session,
          });
        }

        if (effectiveStage === "cam") {
          await ensureMachineCompatibilityOrThrow({
            request,
            stageKey: "cam",
            session,
          });
          request.productionSchedule = request.productionSchedule || {};
          request.productionSchedule.assignedMachine = null;
          request.productionSchedule.queuePosition = null;
          request.assignedMachine = null;
          acceptedMessage = "가공 단계로 이동했습니다.";
        }
      } else if (status === "PENDING") {
        if (effectiveStage === "machining" && resolvedBusinessAnchorId) {
          await ensureRequestCreditRefundOnRollbackToCam({
            request,
            businessAnchorId: resolvedBusinessAnchorId,
            actorUserId: req.user?._id || null,
            session,
          });
          bumpRollbackCount(request, "cam");
        }
        if (effectiveStage === "shipping") {
          await ensureShippingFeeRefundOnShippingRollback({
            request,
            actorUserId: req.user?._id || null,
            session,
          });
          bumpRollbackCount(request, "shipping");
        }
        revertManufacturerStageByReviewStage(request, effectiveStage);
      }

      await request.save({ session });
      resultRequest = request;
    });

    if (isDuplicateRequestApprovalNoop) {
      let responseData = {
        _id: String(resultRequest?._id || ""),
        requestId: String(resultRequest?.requestId || ""),
        manufacturerStage:
          String(resultRequest?.manufacturerStage || "").trim() || null,
        caseInfos: {
          reviewByStage: resultRequest?.caseInfos?.reviewByStage || {},
        },
        mailboxAddress: resultRequest?.mailboxAddress || null,
        assignedMachine: resultRequest?.assignedMachine || null,
        productionSchedule: resultRequest?.productionSchedule || null,
      };

      let retryEnqueued = false;
      let retryQueueId = null;
      let retryErrorMessage = null;
      let lastQueueErrorMessage = null;
      let lastQueueErrorCode = null;
      let lastQueueErrorStatus = null;
      let reusedExistingNc = false;

      try {
        const requestMongoId = String(resultRequest?._id || "").trim();
        const requestId = String(resultRequest?.requestId || "").trim();
        const hasNcFile = Boolean(resultRequest?.caseInfos?.ncFile?.s3Key);
        const hasCamCompletionHistory = Boolean(
          resultRequest?.productionSchedule?.actualCamComplete,
        );

        const triggerSource = String(approvalTriggerSource || "").trim();

        if (
          (hasNcFile || hasCamCompletionHistory) &&
          requestMongoId &&
          triggerSource === "worksheet-tab"
        ) {
          const requestForReuse = await Request.findById(requestMongoId);
          if (
            requestForReuse &&
            String(requestForReuse?.manufacturerStage || "").trim() === "의뢰" &&
            String(requestForReuse?.caseInfos?.reviewByStage?.request?.status || "")
              .trim()
              .toUpperCase() === "APPROVED"
          ) {
            applyStatusMapping(requestForReuse, "CAM");
            requestForReuse.productionSchedule = requestForReuse.productionSchedule || {};
            if (!requestForReuse.productionSchedule.actualCamComplete) {
              requestForReuse.productionSchedule.actualCamComplete = new Date();
            }
            await requestForReuse.save();
            resultRequest = requestForReuse;
            reusedExistingNc = true;
            acceptedMessage =
              "기존 NC 작업 이력을 재사용하여 CAM 단계로 이동했습니다. BG 재생성은 실행하지 않았습니다.";
          }
        }

        if (!(hasNcFile || hasCamCompletionHistory) && requestMongoId) {
          const uniqueKey = `REQUEST_STAGE_APPROVED:${requestMongoId}`;
          const latestQueueItem = await ReviewApprovalQueue.findOne({ uniqueKey })
            .sort({ createdAt: -1 })
            .lean();

          const queueStatus = String(latestQueueItem?.status || "").trim();
          const queueAttemptCount = Number(latestQueueItem?.attemptCount || 0);
          const queueErrorMessage = String(
            latestQueueItem?.error?.message || "",
          ).trim();
          const queueErrorCode = String(latestQueueItem?.error?.code || "").trim();
          const queueErrorStatusFromCode = Number.parseInt(queueErrorCode, 10);
          const queueErrorStatusFromMessage =
            /(^|\s|\()403(\)|\s|$)/.test(queueErrorMessage) ? 403 : null;
          const resolvedQueueErrorStatus = Number.isFinite(queueErrorStatusFromCode)
            ? queueErrorStatusFromCode
            : queueErrorStatusFromMessage;
          const isLocked =
            !!latestQueueItem?.lockedBy &&
            latestQueueItem?.lockedUntil &&
            new Date(latestQueueItem.lockedUntil).getTime() > Date.now();

          lastQueueErrorMessage = queueErrorMessage || null;
          lastQueueErrorCode = queueErrorCode || null;
          lastQueueErrorStatus = resolvedQueueErrorStatus || null;

          const isRecentQueueFailure =
            (queueStatus === "FAILED" && !!queueErrorMessage) ||
            (queueStatus === "PENDING" &&
              queueAttemptCount > 0 &&
              !!queueErrorMessage &&
              !isLocked);

          if (isRecentQueueFailure) {
            if (latestQueueItem?._id && queueStatus === "PENDING") {
              await ReviewApprovalQueue.updateOne(
                { _id: latestQueueItem._id, status: "PENDING" },
                {
                  $set: {
                    status: "FAILED",
                    failedAt: new Date(),
                    lockedBy: null,
                    lockedUntil: null,
                  },
                },
              );
            }

            const enqueueResult = await enqueueApproval({
              taskType: "REQUEST_STAGE_APPROVED",
              request: resultRequest.toObject
                ? resultRequest.toObject()
                : JSON.parse(JSON.stringify(resultRequest)),
              actorUserId: req?.user?._id ? String(req.user._id) : null,
              forceReprocess: true,
            });
            retryEnqueued = !enqueueResult?.alreadyQueued;
            retryQueueId = String(enqueueResult?.queueId || "").trim() || null;

            if (retryEnqueued) {
              acceptedMessage =
                "이전 CAM 생성 실패가 감지되어 Esprit 재시도 큐에 다시 등록했습니다.";
              console.log("[REVIEW] duplicate noop -> re-enqueued request stage", {
                requestId,
                requestMongoId,
                retryQueueId,
                queueStatus,
                queueAttemptCount,
                queueErrorCode,
                queueErrorMessage,
              });
            }
          }
        }
      } catch (requeueError) {
        retryErrorMessage =
          requeueError?.message || "중복 승인 재시도 큐 등록 처리 중 오류";
        console.error("[REVIEW] duplicate noop re-enqueue failed", {
          requestId: resultRequest?.requestId,
          requestMongoId: String(resultRequest?._id || ""),
          message: retryErrorMessage,
        });
      }

      if (reusedExistingNc && resultRequest) {
        responseData = {
          _id: String(resultRequest?._id || ""),
          requestId: String(resultRequest?.requestId || ""),
          manufacturerStage:
            String(resultRequest?.manufacturerStage || "").trim() || null,
          caseInfos: {
            reviewByStage: resultRequest?.caseInfos?.reviewByStage || {},
          },
          mailboxAddress: resultRequest?.mailboxAddress || null,
          assignedMachine: resultRequest?.assignedMachine || null,
          productionSchedule: resultRequest?.productionSchedule || null,
        };

        emitWorksheetStageChanged(resultRequest, {
          reviewStage: "request",
          reviewStatus: "APPROVED",
          fromStage: "의뢰",
          toStage: "CAM",
          source: "review-status-noop-nc-reuse",
        });
      }

      return res.status(200).json({
        success: true,
        data: responseData,
        message: acceptedMessage,
        meta: {
          noop: true,
          reason: "already-approved-request-stage",
          retryEnqueued,
          retryQueueId,
          retryErrorMessage,
          lastQueueErrorMessage,
          lastQueueErrorCode,
          lastQueueErrorStatus,
          reusedExistingNc,
        },
      });
    }

    // 공정 변경 시 스냅샷 재계산 트리거 (rules.md 섹션 6.1)
    // - 승인(APPROVED): 모든 공정 단계 진행 시
    // - 롤백(PENDING): 모든 공정 되돌림 시
    // - 거부(REJECTED): 현재 미사용이지만 향후 대비
    const businessAnchorId = String(
      resultRequest?.businessAnchorId || "",
    ).trim();
    const shouldTriggerSnapshot = status === "APPROVED" || status === "PENDING";

    console.log("[REVIEW] Cache invalidation check:", {
      requestId: resultRequest?.requestId,
      businessAnchorId,
      status,
      effectiveStage,
      shouldTriggerSnapshot,
      hasBusinessAnchorId: !!businessAnchorId,
    });

    if (businessAnchorId && shouldTriggerSnapshot) {
      console.log(
        "[REVIEW] Triggering dashboard summary refresh for:",
        businessAnchorId,
      );
      // 의뢰자 대시보드 캐시 무효화 + 스냅샷 재계산
      triggerDashboardSummaryRefreshForAnchorId(
        businessAnchorId,
        `review-status:${String(status || "").trim()}:${String(
          effectiveStage || "",
        ).trim()}`,
      ).catch((err) =>
        console.error(
          "[REVIEW] triggerDashboardSummaryRefreshForAnchorId failed",
          err,
        ),
      );
    } else {
      console.warn("[REVIEW] Skipping dashboard refresh:", {
        reason: !businessAnchorId
          ? "No businessAnchorId"
          : "Not APPROVED or PENDING",
        businessAnchorId,
        status,
      });
    }

    // 배송 관련 공정은 소개 가격 정책 스냅샷도 갱신
    if (String(effectiveStage || "").trim() === "shipping") {
      triggerPricingSnapshotForRequestDoc(
        resultRequest,
        `review-status:${String(status || "").trim()}:${String(
          effectiveStage || "",
        ).trim()}`,
      );
    }

    const responseData = {
      _id: String(resultRequest?._id || ""),
      requestId: String(resultRequest?.requestId || ""),
      manufacturerStage:
        String(resultRequest?.manufacturerStage || "").trim() || null,
      caseInfos: {
        reviewByStage: resultRequest?.caseInfos?.reviewByStage || {},
      },
      mailboxAddress: resultRequest?.mailboxAddress || null,
      assignedMachine: resultRequest?.assignedMachine || null,
      productionSchedule: resultRequest?.productionSchedule || null,
    };

    if (status === "APPROVED" && effectiveStage === "cam") {
      runCamApprovePostProcessingInBackground({
        requestMongoId: resultRequest?._id || null,
        requestId: resultRequest?.requestId || null,
      });
    }

    emitWorksheetStageChanged(responseData, {
      reviewStage: String(stageOverride || stage || "").trim() || null,
      reviewStatus: String(status || "").trim() || null,
      fromStage:
        typeof previousManufacturerStage === "string"
          ? previousManufacturerStage
          : null,
      toStage: String(responseData?.manufacturerStage || "").trim() || null,
      source: "review-status",
    });

    if (pendingEspritTriggerRequest) {
      // Esprit NC 생성 트리거를 직접 실행하지 않고 큐에 등록한다.
      // 큐 워커가 직렬로 처리하므로 연속 승인 시 동시 요청 충돌을 방지한다.
      // BG 앱(rhino, esprit, bridge, lot, pack, wbls) 모두 이 큐를 통해 보호된다.
      enqueueApproval({
        taskType: "REQUEST_STAGE_APPROVED",
        request: pendingEspritTriggerRequest,
        actorUserId: req?.user?._id ? String(req.user._id) : null,
        forceReprocess: forceReprocessFlag,
      }).catch((error) => {
        emitManufacturingAsyncFailure({
          requestId: pendingEspritTriggerRequest?.requestId || null,
          requestMongoId: pendingEspritTriggerRequest?._id || null,
          action: "esprit-trigger",
          stage: "request",
          message: error?.message || "Esprit 트리거 큐 등록에 실패했습니다.",
        });
        console.error("[REVIEW] enqueueApproval (esprit) failed", {
          requestId: pendingEspritTriggerRequest?.requestId || null,
          message: error?.message || String(error || ""),
        });
      });
    }

    for (const extraRequest of pendingAdditionalEspritTriggerRequests) {
      enqueueApproval({
        taskType: "REQUEST_STAGE_APPROVED",
        request: extraRequest,
        actorUserId: req?.user?._id ? String(req.user._id) : null,
        forceReprocess: forceReprocessFlag,
      }).catch((error) => {
        emitManufacturingAsyncFailure({
          requestId: extraRequest?.requestId || null,
          requestMongoId: extraRequest?._id || null,
          action: "esprit-trigger-dual-hex-clone",
          stage: "request",
          message:
            error?.message ||
            "헥스 이중 가공 복사본의 Esprit 트리거 큐 등록에 실패했습니다.",
        });
        console.error("[REVIEW] enqueueApproval (dual-hex clone) failed", {
          requestId: extraRequest?.requestId || null,
          message: error?.message || String(error || ""),
        });
      });
    }

    return res.status(200).json({
      success: true,
      data: responseData,
      message: acceptedMessage,
    });
  } catch (error) {
    if (error?.machineCompatibilityMeta && Types.ObjectId.isValid(id)) {
      try {
        await Request.findByIdAndUpdate(
          id,
          {
            $set: {
              "caseInfos.machineCompatibility": error.machineCompatibilityMeta,
            },
          },
          { timestamps: false },
        ).catch(() => null);
      } catch (compatErr) {
        console.error(
          "[REVIEW] machineCompatibility meta persist failed",
          compatErr,
        );
      }
    }
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "검토 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
      payload: error?.payload || null,
    });
  } finally {
    session.endSession();
  }
}

export async function getStageFileUrl(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "")
      .trim()
      .toLowerCase();
    const allowed = ["machining", "packing", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const meta = request?.caseInfos?.stageFiles?.[stage];
    const s3Key = meta?.s3Key;
    const fileName = meta?.fileName || `${stage}-file`;
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveStageFile(req, res) {
  try {
    const { id } = req.params;
    const {
      stage,
      fileName,
      fileType,
      fileSize,
      s3Key,
      s3Url,
      filePath,
      source,
    } = req.body || {};

    const allowed = ["machining", "packing", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(String(stage || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    const resolvedFileName = String(fileName || filePath || "").trim();
    const resolvedFilePath = String(filePath || resolvedFileName || "").trim();
    if (!resolvedFileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const normalizedStage = String(stage || "").trim();
    const normalizedSource =
      String(source || "manual").trim() === "worker" ? "worker" : "manual";

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    request.caseInfos.stageFiles[normalizedStage] = {
      fileName: resolvedFileName,
      fileType,
      fileSize,
      filePath: resolvedFilePath,
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      source: normalizedSource,
      uploadedBy: req.user?._id,
      uploadedAt: new Date(),
    };

    request.caseInfos.reviewByStage[normalizedStage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    const legacyHexRotationNormalized =
      normalizeLegacyManufacturerHexRotationOnRequest(request);
    if (legacyHexRotationNormalized) {
      console.warn("[saveStageFile] normalized legacy manufacturerHexRotation", {
        requestId: request.requestId,
        requestMongoId: String(request._id || ""),
        caseInfosManufacturerHexRotation:
          String(request?.caseInfos?.manufacturerHexRotation || "").trim() || null,
        rndManufacturerHexRotation:
          String(request?.rnd?.manufacturerHexRotation || "").trim() || null,
      });
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: "파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
