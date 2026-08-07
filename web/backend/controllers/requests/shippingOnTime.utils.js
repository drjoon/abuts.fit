// change-log:
// - 2026-08-07: 출고일 약속 고정 + 자정 이후 정시/실패 판정 + 묶음/신속 성공률 SSOT.
// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/jobs/shippingOnTimeEvalWorker.js
// - web/backend/services/dashboardRiskSummary.service.js
import { toKstYmd, getTodayYmdInKst } from "../../utils/krBusinessDays.js";
import { resolveEffectiveShippingMode } from "./shippingPriority.utils.js";

/**
 * 의뢰 시점 약속 출고일(YYYY-MM-DD KST). 변동 없는 SSOT.
 */
export function resolvePromisedShipYmd(request) {
  const timeline = request?.timeline || {};
  const original = String(timeline.originalEstimatedShipYmd || "").trim();
  if (original) return original;
  const estimated = String(timeline.estimatedShipYmd || "").trim();
  if (estimated) return estimated;
  const next = String(timeline.nextEstimatedShipYmd || "").trim();
  return next || null;
}

function toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 당일 집하로 인정하는 시각들 (KST 일자).
 * - pickedUpAt: 택배 집하/수동 집하
 * - actualShipPickup: 우편함 집하 확정(한진 접수 포함)
 */
export function resolveShipPickupYmds(request, deliveryInfo = null) {
  const di = deliveryInfo || request?.deliveryInfoRef || {};
  const candidates = [
    toValidDate(di?.pickedUpAt),
    toValidDate(request?.productionSchedule?.actualShipPickup),
  ].filter(Boolean);

  const ymds = [];
  for (const at of candidates) {
    const ymd = toKstYmd(at);
    if (ymd) ymds.push(ymd);
  }
  return ymds;
}

/**
 * 약속 출고일 당일(KST) 집하면 정시.
 * 16시 이후 수동 집하도 같은 KST 일자면 정시.
 */
export function isShipOnTime({ request, deliveryInfo = null, promisedYmd }) {
  const shipYmd =
    String(promisedYmd || resolvePromisedShipYmd(request) || "").trim();
  if (!shipYmd) return false;
  const pickupYmds = resolveShipPickupYmds(request, deliveryInfo);
  return pickupYmds.some((ymd) => ymd <= shipYmd);
}

/**
 * 자정 이후 평가 가능 여부: 약속 출고일 < 오늘(KST).
 */
export function isShipOutcomeEvaluable({
  promisedYmd,
  todayYmd = getTodayYmdInKst(),
}) {
  const shipYmd = String(promisedYmd || "").trim();
  const today = String(todayYmd || "").trim();
  return Boolean(shipYmd && today && shipYmd < today);
}

/**
 * @returns {{
 *   promisedYmd: string|null,
 *   status: 'pending'|'on_time'|'late',
 *   pickedUpYmd: string|null,
 *   mode: 'express'|'normal',
 * }}
 */
export function evaluateShipOnTimeOutcome({
  request,
  deliveryInfo = null,
  todayYmd = getTodayYmdInKst(),
}) {
  const promisedYmd = resolvePromisedShipYmd(request);
  const mode = resolveEffectiveShippingMode(request);
  const pickupYmds = resolveShipPickupYmds(request, deliveryInfo);
  const pickedUpYmd = pickupYmds.length
    ? pickupYmds.slice().sort()[0]
    : null;

  if (!isShipOutcomeEvaluable({ promisedYmd, todayYmd })) {
    return {
      promisedYmd,
      status: "pending",
      pickedUpYmd,
      mode,
    };
  }

  const onTime = isShipOnTime({
    request,
    deliveryInfo,
    promisedYmd,
  });

  return {
    promisedYmd,
    status: onTime ? "on_time" : "late",
    pickedUpYmd,
    mode,
  };
}

/**
 * 묶음/신속 정시 출고 성공률.
 * @param {Array} rows - { mode, status } 평가 완료 건 (pending 제외)
 */
export function summarizeShippingOnTimeRates(rows) {
  const summary = {
    expressOnTimeRate: 100,
    expressOnTimeCount: 0,
    expressEvaluatedCount: 0,
    normalOnTimeRate: 100,
    normalOnTimeCount: 0,
    normalEvaluatedCount: 0,
    onTimeRate: 100,
    onTimeCount: 0,
    evaluatedCount: 0,
  };

  for (const row of rows || []) {
    const status = String(row?.status || "").trim();
    if (status !== "on_time" && status !== "late") continue;
    const mode = row?.mode === "express" ? "express" : "normal";
    const onTime = status === "on_time";

    summary.evaluatedCount += 1;
    if (onTime) summary.onTimeCount += 1;

    if (mode === "express") {
      summary.expressEvaluatedCount += 1;
      if (onTime) summary.expressOnTimeCount += 1;
    } else {
      summary.normalEvaluatedCount += 1;
      if (onTime) summary.normalOnTimeCount += 1;
    }
  }

  const pct = (ok, total) =>
    total > 0 ? Math.round((ok / total) * 100) : 100;

  summary.expressOnTimeRate = pct(
    summary.expressOnTimeCount,
    summary.expressEvaluatedCount,
  );
  summary.normalOnTimeRate = pct(
    summary.normalOnTimeCount,
    summary.normalEvaluatedCount,
  );
  summary.onTimeRate = pct(summary.onTimeCount, summary.evaluatedCount);

  return summary;
}
