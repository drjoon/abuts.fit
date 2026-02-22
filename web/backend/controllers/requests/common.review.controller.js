import mongoose, { Types } from "mongoose";
import path from "path";
import Request from "../../models/request.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import User from "../../models/user.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPacking,
  buildRequestorOrgScopeFilter,
  computePriceForRequest,
  normalizeCaseInfosImplantFields,
  getTodayYmdInKst,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
} from "./utils.js";
import { allocateVirtualMailboxAddress } from "./mailbox.utils.js";
import { triggerNextAutoMachiningAfterComplete } from "../cnc/machiningBridge.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";
import { getAllProductionQueues } from "../cnc/shared.js";
import { getOrganizationCreditBalanceBreakdown } from "./creation.helpers.controller.js";
import s3Utils, {
  deleteFileFromS3,
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

const BRIDGE_PROCESS_BASE =
  process.env.BRIDGE_NODE_URL ||
  process.env.BRIDGE_PROCESS_BASE ||
  process.env.CNC_BRIDGE_BASE ||
  process.env.BRIDGE_BASE ||
  "http://localhost:8002";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

function inferDiameterGroupFromDiameter(diameter) {
  if (!Number.isFinite(diameter) || diameter <= 0) return null;
  if (diameter <= 6) return "6";
  if (diameter <= 8) return "8";
  if (diameter <= 10) return "10";
  return "12";
}

function inferDiameterGroupFromRequest(request) {
  const schedule = request?.productionSchedule || {};
  const explicitGroup = String(schedule.diameterGroup || "").trim();
  if (explicitGroup) return explicitGroup;

  const diameterCandidates = [
    schedule.diameter,
    request?.caseInfos?.maxDiameter,
    request?.caseInfos?.camDiameter,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  const diameter = diameterCandidates.length ? diameterCandidates[0] : null;
  return inferDiameterGroupFromDiameter(diameter) || "8";
}

const revertManufacturerStageByReviewStage = (request, stage) => {
  const prevMap = {
    request: "의뢰",
    cam: "의뢰",
    machining: "CAM",
    packing: "가공",
    shipping: "세척.패킹",
    tracking: "포장.발송",
  };
  const prevStage = prevMap[stage];
  if (prevStage) {
    applyStatusMapping(request, prevStage);
  }
  // 포장.발송 단계에서 롤백할 때 우편함 주소 해제
  if (stage === "shipping") {
    request.mailboxAddress = null;
  }
};

async function screenCamMachineForRequest({ request }) {
  if (!request) {
    return { ok: false, reason: "요청 정보가 없습니다.", reqGroup: "8" };
  }

  const schedule = request.productionSchedule || {};
  const diameterCandidates = [
    schedule.diameter,
    request?.caseInfos?.maxDiameter,
    request?.caseInfos?.camDiameter,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (!diameterCandidates.length) {
    return {
      ok: false,
      reason: "소재 직경 정보를 찾을 수 없습니다.",
      reqGroup: "8",
    };
  }

  const diameter = diameterCandidates[0];
  const diameterGroup = inferDiameterGroupFromDiameter(diameter) || "8";

  return {
    ok: true,
    diameter,
    diameterGroup,
    preferredMachine:
      diameterGroup === "6" ? "M3" : diameterGroup === "8" ? "M4" : null,
    reqGroup: diameterGroup,
  };
}

async function chooseMachineForCamMachining({ request }) {
  if (!request) throw new Error("request is required");
  const schedule = request.productionSchedule || {};

  const existingMachineId = String(
    schedule.assignedMachine || request.assignedMachine || "",
  ).trim();
  const existingQueuePos = Number(schedule.queuePosition);
  if (existingMachineId) {
    return {
      machineId: existingMachineId,
      queuePosition: Number.isFinite(existingQueuePos)
        ? existingQueuePos
        : null,
      diameterGroup:
        schedule.diameterGroup || inferDiameterGroupFromRequest(request),
      diameter:
        schedule.diameter || Number(request?.caseInfos?.maxDiameter) || null,
    };
  }

  const diameterGroup = inferDiameterGroupFromRequest(request);
  let targetMachineId = null;

  const cncMachines = await CncMachine.find({ status: "active" })
    .select({ machineId: 1, maxModelDiameterGroups: 1 })
    .lean();
  const machineIds = cncMachines
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);

  const machineFlags = await Machine.find({ uid: { $in: machineIds } })
    .select({ uid: 1, allowRequestAssign: 1 })
    .lean();
  const allowAssignSet = new Set(
    machineFlags
      .filter((m) => m?.allowRequestAssign !== false)
      .map((m) => String(m?.uid || "").trim())
      .filter(Boolean),
  );

  const candidates = cncMachines
    .filter((m) => {
      const uid = String(m?.machineId || "").trim();
      if (!uid || !allowAssignSet.has(uid)) return false;
      const groups = Array.isArray(m?.maxModelDiameterGroups)
        ? m.maxModelDiameterGroups
        : [];
      return groups.includes(diameterGroup);
    })
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);

  if (candidates.length) {
    const queueCounts = await Promise.all(
      candidates.map(async (uid) => {
        const count = await Request.countDocuments({
          "productionSchedule.assignedMachine": uid,
          manufacturerStage: { $in: ["CAM", "가공"] },
        });
        return { uid, count };
      }),
    );
    const sorted = queueCounts.filter(Boolean).sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      return String(a.uid).localeCompare(String(b.uid));
    });
    targetMachineId = sorted[0]?.uid || null;
  }

  if (!targetMachineId) {
    const activeMachines = await Machine.find({ status: "active" })
      .select({ uid: 1 })
      .sort({ uid: 1 })
      .lean();
    if (!activeMachines?.length) {
      throw new Error("활성화된 장비가 없습니다.");
    }
    targetMachineId = String(activeMachines[0].uid || "").trim();
  }

  const queueCount = await Request.countDocuments({
    "productionSchedule.assignedMachine": targetMachineId,
    manufacturerStage: { $in: ["CAM", "가공"] },
  });

  return {
    machineId: targetMachineId,
    queuePosition: queueCount + 1,
    diameterGroup,
    diameter:
      schedule.diameter || Number(request?.caseInfos?.maxDiameter) || null,
  };
}

async function ensureDeliveryInfoShippedAtNow({ request, session }) {
  if (!request) return;

  const existingRef = request.deliveryInfoRef;
  const now = new Date();

  if (existingRef) {
    const di = await DeliveryInfo.findById(existingRef)
      .session(session || null)
      .catch(() => null);
    if (di && !di.shippedAt) {
      di.shippedAt = now;
      await di.save({ session });
    }
    return;
  }

  const created = await DeliveryInfo.create(
    [
      {
        request: request._id,
        shippedAt: now,
      },
    ],
    { session },
  ).catch(() => null);

  const doc = Array.isArray(created) ? created[0] : null;
  if (doc?._id) {
    request.deliveryInfoRef = doc._id;
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

      const prevStageMap = {
        machining: "CAM",
        packing: "가공",
        shipping: "세척.포장",
        tracking: "발송",
      };
      const prevStage = prevStageMap[stage];
      if (prevStage) {
        request.manufacturerStage = prevStage;
      }

      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "삭제할 파일이 없습니다.",
      });
    }

    try {
      await deleteFileFromS3(s3Key);
    } catch {
      // ignore S3 delete errors
    }

    delete request.caseInfos.stageFiles[stage];
    bumpRollbackCount(request, stage);
    if (stage === "machining") {
      bumpRollbackCount(request, "cam");
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

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateReviewStatusByStage(req, res) {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { stage, status, reason, stageOverride } = req.body || {};

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

    let resultRequest = null;
    let acceptedMessage = "";

    await session.withTransaction(async () => {
      const request = await Request.findById(id).session(session);
      if (!request) {
        const err = new Error("의뢰를 찾을 수 없습니다.");
        err.statusCode = 404;
        throw err;
      }

      // b3: 의뢰 승인 시, 조건에 맞는 장비가 없으면 승인 자체를 막는다(상태 변경 없음)
      if (String(stage || "").trim() === "request" && status === "APPROVED") {
        const screening = await screenCamMachineForRequest({ request });
        if (!screening.ok) {
          // 브리지/장비 상태와 무관하게 의뢰 승인은 진행한다.
          // (장비 배정/자동 가공은 이후 단계에서 best-effort로 처리)
        }
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
        if (effectiveStage === "request") {
          // 비동기 처리: 의뢰 승인 시점에 manufacturerStage/status 를 CAM으로 바꾸지 않는다.
          // Esprit(NC 생성) 완료 콜백(/api/bg/register-file, sourceStep=3-nc)에서 상태를 CAM으로 전환한다.
          // 여기서는 '명령 접수'만 처리하고, BG 트리거만 시도한다.
          const screening = await screenCamMachineForRequest({ request });
          request.caseInfos.reviewByStage.request.reason = "";

          await ensureLotNumberForMachining(request);
          request.productionSchedule = request.productionSchedule || {};
          if (screening.ok) {
            request.productionSchedule.diameter = screening.diameter;
            request.productionSchedule.diameterGroup = screening.diameterGroup;
          } else {
            request.productionSchedule.diameterGroup = screening.reqGroup;
          }

          request.productionSchedule.actualCamStart = new Date();
          await triggerEspritForNc({ request, session });
          acceptedMessage =
            "CAM 작업 명령이 접수되었습니다. 처리 완료 후 상태가 자동으로 업데이트됩니다.";
        } else {
          // CAM, machining 등 이후 단계는 필요 시 단계별로 비동기 처리 여부를 나눠서 관리한다.
          // CAM 승인 시에는 제조사 공정을 '가공' 단계로 즉시 전환하되,
          // 실제 CNC 가공 시작은 Bridge(CNC) 쪽 상태(allowAutoMachining, 자동 트리거 등)에 의해 제어된다.
          if (effectiveStage === "cam") {
            applyStatusMapping(request, "가공");
          } else if (effectiveStage === "machining") {
            applyStatusMapping(request, "세척.패킹");
          } else if (effectiveStage === "packing") {
            applyStatusMapping(request, "포장.발송");
          } else if (effectiveStage === "shipping") {
            applyStatusMapping(request, "추적관리");
          }
        }

        if (effectiveStage === "packing") {
          await ensureFinishedLotNumberForPacking(request);
          if (!request.mailboxAddress) {
            try {
              // 의뢰자 organization ID를 전달하여 같은 의뢰자의 요청들을 같은 우편함으로 그룹화
              const requestorOrgId =
                request.requestorOrganizationId ||
                request.requestor?.organization?._id ||
                request.requestor?.organization;
              console.log(
                `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 할당 시작 - 조직 ID: ${requestorOrgId}`,
              );
              request.mailboxAddress =
                await allocateVirtualMailboxAddress(requestorOrgId);
              console.log(
                `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 할당 완료: ${request.mailboxAddress}`,
              );
            } catch (err) {
              console.error("[MAILBOX_ALLOCATION_ERROR]", err);
            }
          }
        }

        if (effectiveStage === "cam") {
          const selected = await chooseMachineForCamMachining({ request });
          request.productionSchedule = request.productionSchedule || {};
          request.productionSchedule.assignedMachine = selected.machineId;
          request.productionSchedule.queuePosition = selected.queuePosition;
          if (selected.diameterGroup) {
            request.productionSchedule.diameterGroup = selected.diameterGroup;
          }
          if (Number.isFinite(selected.diameter)) {
            request.productionSchedule.diameter = selected.diameter;
          }
          request.assignedMachine = selected.machineId;
          // CAM 승인 시점 디버깅: 현재 요청의 productionSchedule 과 장비별 생산 큐 일부를 로깅
          try {
            // 1) 현재 요청 스케줄
            console.log("[CAM-APPROVE] request productionSchedule", {
              id: String(request._id),
              requestId: request.requestId,
              manufacturerStage: request.manufacturerStage,
              productionSchedule: request.productionSchedule,
            });

            // 2) 장비별 생산 큐 스냅샷 (M3/M4/M5 중심)
            const related = await Request.find({
              manufacturerStage: { $in: ["의뢰", "CAM", "가공"] },
            })
              .select(
                "requestId manufacturerStage productionSchedule lotNumber timeline",
              )
              .lean();
            const queues = getAllProductionQueues(related || []);
            console.log("[CAM-APPROVE] production queues snapshot", {
              M3: (queues.M3 || []).map((q) => ({
                requestId: q.requestId,
                manufacturerStage: q.manufacturerStage,
                assignedMachine: q.productionSchedule?.assignedMachine,
                queuePosition: q.productionSchedule?.queuePosition,
                diameter: q.productionSchedule?.diameter,
              })),
              M4: (queues.M4 || []).map((q) => ({
                requestId: q.requestId,
                manufacturerStage: q.manufacturerStage,
                assignedMachine: q.productionSchedule?.assignedMachine,
                queuePosition: q.productionSchedule?.queuePosition,
                diameter: q.productionSchedule?.diameter,
              })),
              M5: (queues.M5 || []).map((q) => ({
                requestId: q.requestId,
                manufacturerStage: q.manufacturerStage,
                assignedMachine: q.productionSchedule?.assignedMachine,
                queuePosition: q.productionSchedule?.queuePosition,
                diameter: q.productionSchedule?.diameter,
              })),
              unassigned: (queues.unassigned || []).map((q) => ({
                requestId: q.requestId,
                manufacturerStage: q.manufacturerStage,
                assignedMachine: q.productionSchedule?.assignedMachine,
                queuePosition: q.productionSchedule?.queuePosition,
                diameter: q.productionSchedule?.diameter,
              })),
            });
          } catch (e) {
            console.error("[CAM-APPROVE] debug logging failed", e);
          }
          const meta = await Machine.findOne({ uid: selected.machineId })
            .select({ allowAutoMachining: 1, allowRequestAssign: 1 })
            .lean()
            .session(session)
            .catch(() => null);

          console.log("[CAM-APPROVE] auto-machining check", {
            requestId: request.requestId,
            machineId: selected.machineId,
            allowRequestAssign: meta?.allowRequestAssign,
            allowAutoMachining: meta?.allowAutoMachining,
          });

          if (
            meta?.allowRequestAssign !== false &&
            meta?.allowAutoMachining === true
          ) {
            // 트리거 성공 시 응답 메시지 변경
            triggerNextAutoMachiningAfterComplete({
              machineId: selected.machineId,
              completedRequestId: null,
            }).catch((err) => {
              console.error(
                "[CAM-APPROVE] triggerNextAutoMachiningAfterComplete failed",
                {
                  requestId: request.requestId,
                  machineId: selected.machineId,
                  message: err?.message,
                },
              );
            });
            acceptedMessage = "자동 가공 명령이 전송되었습니다.";
          } else {
            acceptedMessage = "가공 단계로 이동했습니다.";
          }
        }
      } else if (status === "PENDING") {
        revertManufacturerStageByReviewStage(request, effectiveStage);
      }

      await request.save({ session });
      resultRequest = request;
    });

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(resultRequest),
      message: acceptedMessage,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "검토 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
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
