import mongoose, { Types } from "mongoose";
import Request from "../../models/request.model.js";
import Machine from "../../models/machine.model.js";
import {
  applyStatusMapping,
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPacking,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
} from "./utils.js";
import { allocateVirtualMailboxAddress } from "./mailbox.utils.js";
import { triggerNextAutoMachiningAfterComplete } from "../cnc/machiningBridge.js";
import { getAllProductionQueues } from "../cnc/shared.js";
import s3Utils, { deleteFileFromS3 } from "../../utils/s3.utils.js";
import { resolvePrcFileNames } from "./prcMapping.utils.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  revertManufacturerStageByReviewStage,
  ensureRequestCreditSpendOnMachiningEnter,
  ensureDeliveryInfoShippedAtNow,
} from "./common.review.helpers.js";
import {
  screenCamMachineForRequest,
  chooseMachineForCamMachining,
  ensureMachineCompatibilityOrThrow,
  inferDiameterGroupFromDiameter,
} from "./common.review.machine.js";
import { triggerEspritForNc } from "./common.review.esprit.js";

// Emit worksheet stage changed event

function emitWorksheetStageChanged(request, payload = {}) {
  const requestId = String(request?.requestId || "").trim();
  const requestMongoId = String(request?._id || "").trim();
  if (!requestId && !requestMongoId) return;

  emitAppEventToRoles(["manufacturer", "admin"], "request:stage-changed", {
    requestId,
    requestMongoId,
    manufacturerStage: String(request?.manufacturerStage || "").trim() || null,
    reviewStage: payload.reviewStage || null,
    reviewStatus: payload.reviewStatus || null,
    fromStage: payload.fromStage || null,
    toStage:
      payload.toStage ||
      String(request?.manufacturerStage || "").trim() ||
      null,
    source: payload.source || "review-status",
    request,
  });
}

function assertAndClaimManufacturerRequestAccess({ req, request }) {
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
  if (
    currentManufacturerId &&
    actorManufacturerId &&
    currentManufacturerId !== actorManufacturerId
  ) {
    const err = new Error("다른 제조사에 배정된 의뢰입니다.");
    err.statusCode = 403;
    throw err;
  }
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
      assertAndClaimManufacturerRequestAccess({ req, request });
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
      }
      if (stage === "packing") {
        request.productionSchedule.actualMachiningStart = null;
        request.productionSchedule.actualMachiningComplete = null;
        request.productionSchedule.assignedMachine = null;
        request.productionSchedule.queuePosition = null;
        request.assignedMachine = null;
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
          await Machine.updateOne(
            { uid: selected.machineId },
            { $set: { lastAssignmentAt: new Date() } },
          );
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
  const { id } = req.params;
  try {
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
    let previousManufacturerStage = null;

    await session.withTransaction(async () => {
      const request = await Request.findById(id)
        .populate("requestor", "businessAnchorId")
        .session(session);
      if (!request) {
        const err = new Error("의뢰를 찾을 수 없습니다.");
        err.statusCode = 404;
        throw err;
      }

      assertAndClaimManufacturerRequestAccess({ req, request });

      if (status === "APPROVED" && effectiveStage === "request") {
        await ensureMachineCompatibilityOrThrow({
          request,
          stageKey: "request",
        });
      }

      ensureReviewByStageDefaults(request);
      previousManufacturerStage =
        String(request.manufacturerStage || "").trim() || null;

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
          if (directBusinessAnchorId) return directBusinessAnchorId;
          const requestorBusinessAnchorId = request.requestor?.businessAnchorId;
          if (!requestorBusinessAnchorId) return null;
          const requestorBusinessAnchorIdStr = String(
            requestorBusinessAnchorId,
          );
          if (!Types.ObjectId.isValid(requestorBusinessAnchorIdStr))
            return null;
          return typeof requestorBusinessAnchorId === "string"
            ? new Types.ObjectId(requestorBusinessAnchorIdStr)
            : requestorBusinessAnchorId;
        })();

        const isNewSystemFree =
          request?.caseInfos?.newSystemRequest?.requested &&
          request?.caseInfos?.newSystemRequest?.free;

        if (!request.businessAnchorId && resolvedBusinessAnchorId) {
          request.businessAnchorId = resolvedBusinessAnchorId;
        }

        {
          const requestBusinessIdStr = request.businessAnchorId
            ? String(request.businessAnchorId)
            : "";
          const requestorUserBusinessIdStr = request.requestor?.businessAnchorId
            ? String(request.requestor.businessAnchorId)
            : "";
          if (
            requestBusinessIdStr &&
            requestorUserBusinessIdStr &&
            requestBusinessIdStr !== requestorUserBusinessIdStr
          ) {
            console.error("[REQUEST_BUSINESS_MISMATCH_ON_REVIEW]", {
              requestId: request.requestId,
              requestMongoId: String(request._id),
              effectiveStage,
              status,
              businessAnchorId: requestBusinessIdStr,
              requestorUserBusinessAnchorId: requestorUserBusinessIdStr,
              requestorUserId: request.requestor?._id
                ? String(request.requestor._id)
                : null,
            });
          }
        }

        if (effectiveStage === "request") {
          // 비동기 처리: 의뢰 승인 시점에 manufacturerStage/status 를 CAM으로 바꾸지 않는다.
          // Esprit(NC 생성) 완료 콜백(/api/bg/register-file, sourceStep=3-nc)에서 상태를 CAM으로 전환한다.
          // 여기서는 '명령 접수'만 처리하고, BG 트리거만 시도한다.
          const screening = await screenCamMachineForRequest({ request });
          request.caseInfos.reviewByStage.request.reason = "";

          await ensureLotNumberForMachining(request);

          request.productionSchedule = request.productionSchedule || {};

          // 실제 소재가 적재된 장비 직경을 선호한다. (예: M4/M5 8mm 적재 시 8mm 설정)
          let preselectedDia = null;
          let preselectedGroup = null;
          try {
            const preselect = await chooseMachineForCamMachining({
              request,
              ignoreAllowAssign: true,
            });
            if (Number.isFinite(preselect?.diameter)) {
              preselectedDia = preselect.diameter;
              preselectedGroup = preselect.diameterGroup || preselect.reqGroup;
            }
          } catch (err) {
            console.warn(
              "[CAM_PRESELECT] chooseMachine failed (fallback to screening)",
              err,
            );
          }

          // 1차: 장비 실제 소재 직경(preselect), 2차: screening 결과
          let resolvedDia =
            preselectedDia ??
            (Number.isFinite(screening?.diameter) ? screening.diameter : null);
          let resolvedGroup =
            preselectedGroup || screening?.diameterGroup || screening?.reqGroup;
          console.log("[CAM-PRESELECT] before adjust", {
            requestId: request?.requestId,
            preselectedDia,
            preselectedGroup,
            screening,
            resolvedDia,
            resolvedGroup,
          });

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
          console.log("[CAM-PRESELECT] after adjust", {
            requestId: request?.requestId,
            finalDiameter: request.productionSchedule.diameter,
            finalGroup: request.productionSchedule.diameterGroup,
          });

          // PRC 파일명은 의뢰자가 아니라, 관리자(의뢰 승인) 시점에 확정한다.
          // 누락 시 esprit-addin에서 OpenProcess("")로 크래시/불량 가공 위험이 있으므로 승인 자체를 막는다.
          const prcFiles = resolvePrcFileNames(request.caseInfos || {});
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
            if (!request.mailboxAddress) {
              try {
                const requestorBusinessAnchorId = resolvedBusinessAnchorId;
                request.mailboxAddress = await allocateVirtualMailboxAddress(
                  requestorBusinessAnchorId,
                );
              } catch (err) {
                console.error("[MAILBOX_ALLOCATION_ERROR]", err);
              }
            }
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
              const requestorBusinessAnchorId = resolvedBusinessAnchorId;
              console.log(
                `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 할당 시작 - 사업자 anchor ID: ${requestorBusinessAnchorId}`,
              );
              request.mailboxAddress = await allocateVirtualMailboxAddress(
                requestorBusinessAnchorId,
              );
              console.log(
                `[PACKING_APPROVAL] 의뢰 ${request.requestId} 우편함 할당 완료: ${request.mailboxAddress}`,
              );
            } catch (err) {
              console.error("[MAILBOX_ALLOCATION_ERROR]", err);
            }
          }
        }

        if (effectiveStage === "cam") {
          if (resolvedBusinessAnchorId && !isNewSystemFree) {
            await ensureRequestCreditSpendOnMachiningEnter({
              request,
              businessAnchorId: resolvedBusinessAnchorId,
              actorUserId: req.user?._id || null,
              session,
            });
          }

          const selected = await ensureMachineCompatibilityOrThrow({
            request,
            stageKey: "cam",
            session,
          });
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
          await Machine.updateOne(
            { uid: selected.machineId },
            { $set: { lastAssignmentAt: new Date() } },
            { session },
          );
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

    const normalizedResult = await normalizeRequestForResponse(resultRequest);
    emitWorksheetStageChanged(normalizedResult, {
      reviewStage: String(stageOverride || stage || "").trim() || null,
      reviewStatus: String(status || "").trim() || null,
      fromStage:
        typeof previousManufacturerStage === "string"
          ? previousManufacturerStage
          : null,
      toStage: String(normalizedResult?.manufacturerStage || "").trim() || null,
      source: "review-status",
    });

    return res.status(200).json({
      success: true,
      data: normalizedResult,
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
