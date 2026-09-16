// related files:
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/distribution.utils.js
// - web/backend/jobs/stageProgressionWorker.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/mailbox.utils.js
// change-log:
// - 2026-09-16: CNC 완료인데 manufacturerStage가 가공에 남은 stuck 건 → 세척.패킹 힐.
import Request from "../models/request.model.js";
import {
  applyStatusMapping,
  normalizeRequestForResponse,
} from "../controllers/requests/utils.js";
import {
  assignMailboxForCleaningPackingEnter,
  normalizeBusinessAnchorId,
} from "../controllers/requests/mailbox.utils.js";
import { emitAppEventToRoles } from "../socket.js";

/**
 * CNC/브리지 기준 가공 작업이 끝난 의뢰인지.
 * (manufacturerStage와 무관 — stuck 탐지용)
 */
export function isRequestMachiningWorkCompleted(requestLike) {
  const ps =
    requestLike?.productionSchedule &&
    typeof requestLike.productionSchedule === "object"
      ? requestLike.productionSchedule
      : null;
  if (!ps) return false;

  if (ps.actualMachiningComplete) return true;

  const phase = String(ps?.machiningProgress?.phase || "")
    .trim()
    .toUpperCase();
  if (phase === "COMPLETED") return true;

  const record = ps.machiningRecord;
  if (record && typeof record === "object") {
    const status = String(record?.status || "")
      .trim()
      .toUpperCase();
    if (status === "COMPLETED" || status === "SUCCESS" || status === "DONE") {
      return true;
    }
    if (record?.completedAt) return true;
  }

  return false;
}

/** Mongo 필터: 가공 stage + CNC 완료 증거 */
export function buildStuckCompletedMachiningFilter() {
  return {
    manufacturerStage: "가공",
    $or: [
      { "productionSchedule.actualMachiningComplete": { $type: "date" } },
      {
        "productionSchedule.machiningProgress.phase": {
          $regex: /^completed$/i,
        },
      },
    ],
  };
}

/**
 * CNC 완료인데 stage가 가공에 남은 건을 세척.패킹으로 승격.
 * @returns {{ healed: boolean, reason?: string, fromStage?: string, toStage?: string }}
 */
export async function healStuckCompletedMachiningToPacking(
  request,
  { actorUserId = null, source = "heal-stuck-completed-machining", save = true } = {},
) {
  if (!request) return { healed: false, reason: "missing_request" };

  const fromStage = String(request.manufacturerStage || "").trim();
  if (fromStage !== "가공") {
    return { healed: false, reason: "not_machining_stage", fromStage };
  }
  if (!isRequestMachiningWorkCompleted(request)) {
    return { healed: false, reason: "not_completed", fromStage };
  }

  applyStatusMapping(request, "세척.패킹");

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  const prevMachining = request.caseInfos.reviewByStage.machining || {};
  if (String(prevMachining.status || "").trim().toUpperCase() !== "APPROVED") {
    request.caseInfos.reviewByStage.machining = {
      ...prevMachining,
      status: "APPROVED",
      updatedAt: new Date(),
      updatedBy: actorUserId || prevMachining.updatedBy || null,
      reason:
        String(prevMachining.reason || "").trim() ||
        "heal_stuck_completed_machining",
    };
  }

  const requestAnchorIdStr = normalizeBusinessAnchorId(request.businessAnchorId);
  const requestorAnchorIdStr = normalizeBusinessAnchorId(
    request.requestor?.businessAnchorId,
  );
  if (!requestAnchorIdStr && requestorAnchorIdStr) {
    request.businessAnchorId = request.requestor.businessAnchorId;
  }
  const effectiveAnchorId = requestAnchorIdStr || requestorAnchorIdStr || null;
  try {
    await assignMailboxForCleaningPackingEnter({
      request,
      requestorOrgId: effectiveAnchorId,
    });
  } catch (err) {
    console.warn("[heal-stuck-completed-machining] mailbox assign failed", {
      requestId: request?.requestId || null,
      message: err?.message || String(err),
    });
  }

  if (save) {
    await request.save();
  }

  const toStage = String(request.manufacturerStage || "").trim();
  try {
    if (fromStage !== toStage && toStage) {
      const normalizedRequest = await normalizeRequestForResponse(request);
      emitAppEventToRoles(["manufacturer", "admin"], "request:stage-changed", {
        source,
        requestId: request?.requestId || null,
        requestMongoId: String(request?._id || "").trim() || null,
        fromStage,
        toStage,
        reviewStage: "machining",
        reviewStatus: "APPROVED",
        request: normalizedRequest,
      });
    }
  } catch (err) {
    console.warn("[heal-stuck-completed-machining] emit failed", {
      requestId: request?.requestId || null,
      message: err?.message || String(err),
    });
  }

  return { healed: true, fromStage, toStage, reason: "healed" };
}

/**
 * stuck 건 일괄 힐. 관리자 모니터링/워커에서 호출.
 * @returns {{ scanned: number, healed: number, requestIds: string[] }}
 */
export async function healAllStuckCompletedMachiningRequests({
  limit = 50,
  source = "heal-all-stuck-completed-machining",
} = {}) {
  const rows = await Request.find(buildStuckCompletedMachiningFilter())
    .populate("requestor", "businessAnchorId")
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));

  const healedIds = [];
  for (const row of rows) {
    try {
      const result = await healStuckCompletedMachiningToPacking(row, {
        source,
        save: true,
      });
      if (result.healed) {
        healedIds.push(String(row.requestId || row._id));
      }
    } catch (err) {
      console.error("[heal-all-stuck-completed-machining] failed", {
        requestId: row?.requestId || null,
        message: err?.message || String(err),
      });
    }
  }

  return {
    scanned: rows.length,
    healed: healedIds.length,
    requestIds: healedIds,
  };
}
