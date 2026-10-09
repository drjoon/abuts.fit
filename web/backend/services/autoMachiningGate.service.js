// related files:
// - web/backend/jobs/autoMachiningGateWorker.js
// - web/backend/utils/finishLineQuality.js
// - web/backend/models/systemSettings.model.js (autoMachiningGate)
// - web/backend/models/request.model.js (autoMachiningReview)
// - web/backend/controllers/requests/common.review.controller.js (updateReviewStatusByStage)
// change-log:
// - 2026-10-09: 테스트 계정·준비 단계 문제 건은 준비에 남긴다(가공으로 안 보냄). 판정 대상은 이번 달 준비만.
// - 2026-10-09: 테스트치과·테스트기공소 의뢰는 품질과 무관하게 가공하지 않고 hold.
// - 2026-10-09: 신설. 준비 단계 의뢰를 규칙으로 판정해 이상 없는 건만 가공으로 자동 승인한다.
/**
 * 준비→가공 자동 승인 게이트.
 * - 확실히 정상인 건만 자동 승인(기존 승인과 같은 updateReviewStatusByStage 경로).
 * - 조금이라도 의심되면 hold로 남겨 아침에 작업자가 확인한다.
 * - 커프 미가공은 소프트웨어로 검출하지 않는다(육안 확인).
 */
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import { resolveHeaderMonthPeriodRange } from "../utils/dateRange.js";
import { resolveFilledStlFile } from "../utils/filledStlFile.js";
import { assessFinishLineQuality } from "../utils/finishLineQuality.js";
import {
  isTestAccountMachiningRequestSync,
  loadRequestorBusinessNames,
} from "../utils/testAccountMachining.js";
import { updateReviewStatusByStage } from "../controllers/requests/common.review.controller.js";

function anchorIdOf(request) {
  const raw = request?.businessAnchorId;
  if (raw && typeof raw === "object") return String(raw._id || "").trim();
  return String(raw || "").trim();
}

export const AUTO_GATE_DEFAULTS = Object.freeze({
  enabled: false,
  maxDiameterMm: 10,
  minFinishLineZ: 0.6,
  mode: "shadow",
});

/**
 * 준비 큐 가드(requestDashboardStats `buildIsWorksheetReadyQueueRequestExpr`와 같다).
 * PTX 연결 건은 어벗츠 디자인이 끝나기(designCompletedAt) 전에는 준비 큐에 없다.
 */
export const READY_QUEUE_GUARD = Object.freeze({
  $or: [
    { "partnerBilling.relatedPracticeTransferId": null },
    { "partnerBilling.relatedPracticeTransferId": { $exists: false } },
    { designCompletedAt: { $type: "date" } },
  ],
});

/** 워크시트 헤더 기본(이번 달)과 같은 createdAt 창. 지난달 준비 잔여를 판정하지 않는다. */
export function activePrepCreatedAtFilter(now = new Date()) {
  const range = resolveHeaderMonthPeriodRange("calendarMonth", now);
  if (!range) return null;
  return { $gte: range.start, $lte: range.end };
}

/** 이 값 초과는 측정 오류로 본다(DB에 30~114mm 사례). */
const ABSURD_DIAMETER_MM = 12;
const MAX_ATTEMPTS = 3;

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getAutoGateConfig() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select("autoMachiningGate")
    .lean();
  const g = doc?.autoMachiningGate || {};
  return {
    enabled: g.enabled === true,
    mode: g.mode === "live" ? "live" : "shadow",
    maxDiameterMm: num(g.maxDiameterMm) ?? AUTO_GATE_DEFAULTS.maxDiameterMm,
    minFinishLineZ: num(g.minFinishLineZ) ?? AUTO_GATE_DEFAULTS.minFinishLineZ,
  };
}

/**
 * 순수 판정. 하나라도 걸리면 hold.
 * @returns {{ verdict: "approved"|"hold", reasons: string[], metrics: object }}
 */
export function evaluateAutoMachiningGate(request, cfg = AUTO_GATE_DEFAULTS) {
  const ci = request?.caseInfos || {};
  const reasons = [];

  // 테스트 계정은 업로드·주문 확인용이라 품질이 맞아도 가공하지 않는다.
  if (isTestAccountMachiningRequestSync(request)) reasons.push("test_account");

  // 입력 누락
  const stl = resolveFilledStlFile(ci);
  if (!String(stl?.s3Key || "").trim()) reasons.push("missing_filled_stl");

  const points = ci.finishLine?.points;
  if (!Array.isArray(points) || points.length < 4) {
    reasons.push("missing_finishline");
  }

  // 직경
  const maxD = num(ci.maxDiameter);
  if (maxD == null || maxD <= 0) {
    reasons.push("missing_diameter");
  } else if (maxD > ABSURD_DIAMETER_MM) {
    reasons.push("absurd_diameter");
  } else if (maxD > cfg.maxDiameterMm) {
    reasons.push("diameter_over_limit");
  }
  const grp = num(request?.productionSchedule?.diameterGroup);
  if (grp != null && grp > cfg.maxDiameterMm) reasons.push("diameter_group_over_limit");

  // 피니시라인 (주 불량 유형)
  const quality = assessFinishLineQuality(points);
  if (quality.defective) reasons.push(`finishline_${quality.reason}`);
  const minZ = num(ci.finishLine?.min_z);
  if (minZ != null && minZ < cfg.minFinishLineZ) reasons.push("finishline_low_z");

  // 이미 기록된 커프 상태(검출 못 하는 미가공과 별개로 모델이 남긴 신호만 사용)
  const cuff = String(ci.cuffBlend?.status || "").trim();
  if (cuff && cuff !== "applied") reasons.push(`cuff_${cuff}`);
  if (String(ci.cuffProposal?.status || "").trim() === "proposed") {
    reasons.push("cuff_proposal_pending");
  }

  // NC가 이미 있으면 좌표 범위 분석 결과 반영(용량은 사전 게이트로 보지 않는다:
  // 장비 한도가 풀렸고, 초과 실패는 auto-next가 건너뛰어 작업자에게 넘긴다)
  const ncFlags = ci.ncFile?.analysis?.flags;
  if (Array.isArray(ncFlags)) for (const f of ncFlags) reasons.push(f);

  return {
    verdict: reasons.length ? "hold" : "approved",
    reasons,
    metrics: {
      maxDiameter: maxD,
      finishLineMinZ: minZ,
      ...(quality.metrics || {}),
    },
  };
}

function isEligibleForGate(request) {
  if (String(request.manufacturerStage || "") !== "준비") return false;
  if (String(request.source || "") === "dummy_sample") return false;
  // 디자인 파트너가 핸드오프로 넘기는 건은 대상 아님
  if (String(request.caseInfos?.productMode || "") === "design_custom_abutment") {
    return false;
  }
  if (request.rnd?.unmachinableAt) return false;
  return true;
}

function needsEvaluation(request, mode) {
  const review = request.autoMachiningReview;
  if (
    isTestAccountMachiningRequestSync(request) &&
    !(review?.reasons || []).includes("test_account")
  ) {
    return true;
  }
  if (!review?.verdict) return true;
  if (review.verdict === "approved") return false;
  // 섀도에서 통과로 기록된 건은 live 전환 후 승인 대상이 된다.
  if (review.verdict === "would_approve") return mode === "live";
  if (review.verdict === "error") return (review.attempts || 0) < MAX_ATTEMPTS;
  // hold: 입력이 바뀐 경우에만 재판정
  const at = review.evaluatedAt ? new Date(review.evaluatedAt).getTime() : 0;
  const changed = Math.max(
    request.caseInfos?.finishLine?.updatedAt
      ? new Date(request.caseInfos.finishLine.updatedAt).getTime()
      : 0,
    request.caseInfos?.stlMetadataUpdatedAt
      ? new Date(request.caseInfos.stlMetadataUpdatedAt).getTime()
      : 0,
  );
  return changed > at;
}

function invokeMachiningApproval(requestId) {
  return new Promise((resolve, reject) => {
    const fakeReq = {
      params: { id: String(requestId) },
      user: { role: "admin" },
      body: {
        status: "APPROVED",
        stage: "machining",
        nextUpCamRunGuard: true,
        forceReprocess: false,
        approvalTriggerSource: "auto-machining-gate",
      },
      __designPartner: false,
    };
    const fakeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if ((this.statusCode || 200) >= 400) {
          reject(
            Object.assign(new Error(payload?.message || "가공 진입 실패"), {
              statusCode: this.statusCode,
            }),
          );
        } else resolve(payload);
        return this;
      },
    };
    Promise.resolve(updateReviewStatusByStage(fakeReq, fakeRes)).catch(reject);
  });
}

// updatedAt을 건드리지 않는다(재판정 기준을 입력 변경 시각으로만 유지).
async function recordReview(id, review) {
  await Request.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(id)) },
    { $set: { autoMachiningReview: review } },
  );
}

async function clearPrepReviewsOutsideWindow(now = new Date()) {
  const range = resolveHeaderMonthPeriodRange("calendarMonth", now);
  if (!range) return;
  await Request.collection.updateMany(
    {
      manufacturerStage: "준비",
      "autoMachiningReview.verdict": { $exists: true },
      $or: [
        { createdAt: { $lt: range.start } },
        { createdAt: { $gt: range.end } },
        // 디자인 대기 PTX 건: 준비 큐에 없으므로 판정을 남기지 않는다.
        {
          "partnerBilling.relatedPracticeTransferId": { $ne: null },
          designCompletedAt: { $not: { $type: "date" } },
        },
      ],
    },
    { $unset: { autoMachiningReview: "" } },
  );
}

/**
 * 준비 단계 의뢰를 한 번 훑어 판정하고, 통과 건을 직렬로 승인한다.
 * shadow 모드는 판정만 기록하고 승인하지 않는다.
 * @returns {Promise<{ enabled: boolean, evaluated: number, approved: number, held: number, failed: number }>}
 */
function annotateRequestorBusiness(request, nameById) {
  request.requestorBusinessName =
    nameById.get(anchorIdOf(request)) || request.requestorBusinessName || "";
  return request;
}

export async function runAutoMachiningGatePass({ limit = 10 } = {}) {
  const cfg = await getAutoGateConfig();
  const out = { enabled: cfg.enabled, evaluated: 0, approved: 0, held: 0, failed: 0 };
  const createdAt = activePrepCreatedAtFilter();
  await clearPrepReviewsOutsideWindow();

  const candidates = await Request.find({
    manufacturerStage: "준비",
    source: { $ne: "dummy_sample" },
    ...(createdAt ? { createdAt } : {}),
    $and: [READY_QUEUE_GUARD],
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  const nameById = await loadRequestorBusinessNames(candidates);

  // 스위치가 꺼져 있어도 테스트 계정은 가공 보류로 남긴다.
  if (!cfg.enabled) {
    for (const request of candidates) {
      annotateRequestorBusiness(request, nameById);
      if (!isEligibleForGate(request)) continue;
      if (!isTestAccountMachiningRequestSync(request)) continue;
      const prev = request.autoMachiningReview?.reasons || [];
      if (request.autoMachiningReview?.verdict === "hold" && prev.includes("test_account")) {
        continue;
      }
      const reasons = prev.includes("test_account") ? prev : [...prev, "test_account"];
      await recordReview(request._id, {
        verdict: "hold",
        reasons,
        metrics: request.autoMachiningReview?.metrics || {},
        mode: cfg.mode,
        evaluatedAt: new Date(),
        attempts: 0,
      });
      out.held += 1;
    }
    return out;
  }

  let approvedThisPass = 0;
  for (const request of candidates) {
    annotateRequestorBusiness(request, nameById);
    if (!isEligibleForGate(request)) continue;
    const testAccount = isTestAccountMachiningRequestSync(request);
    if (!needsEvaluation(request, cfg.mode)) continue;
    if (!testAccount && approvedThisPass >= limit) continue;

    const now = new Date();
    const prevAttempts = request.autoMachiningReview?.attempts || 0;
    const result = evaluateAutoMachiningGate(request, cfg);
    out.evaluated += 1;

    if (result.verdict === "hold") {
      await recordReview(request._id, {
        verdict: "hold",
        reasons: result.reasons,
        metrics: result.metrics,
        mode: cfg.mode,
        evaluatedAt: now,
        attempts: 0,
      });
      out.held += 1;
      continue;
    }

    if (cfg.mode !== "live") {
      await recordReview(request._id, {
        verdict: "would_approve",
        reasons: [],
        metrics: result.metrics,
        mode: "shadow",
        evaluatedAt: now,
        attempts: 0,
      });
      continue;
    }

    try {
      await invokeMachiningApproval(request._id);
      await recordReview(request._id, {
        verdict: "approved",
        reasons: [],
        metrics: result.metrics,
        evaluatedAt: now,
        mode: "live",
        approvedAt: new Date(),
        attempts: prevAttempts + 1,
      });
      out.approved += 1;
      approvedThisPass += 1;
    } catch (error) {
      await recordReview(request._id, {
        verdict: "error",
        reasons: ["approve_failed"],
        metrics: result.metrics,
        evaluatedAt: now,
        attempts: prevAttempts + 1,
        error: String(error?.message || error).slice(0, 300),
      });
      out.failed += 1;
      console.error("[autoMachiningGate] approve failed", {
        requestId: request.requestId,
        message: error?.message,
      });
    }
  }
  return out;
}
