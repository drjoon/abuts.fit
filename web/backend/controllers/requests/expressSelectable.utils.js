// change-log:
// - 2026-08-09: 디자인+가공 productMode를 스케줄 비교에 전달 (출고 +1영업일).
// - 2026-08-08: 신속 선택 가능 = 신속 ETA < 묶음 ETA (조기 출고 이점 있을 때만).
// related files:
// - web/backend/controllers/requests/production.utils.js
// - web/backend/controllers/requests/shipping.Requestor.controller.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/frontend/src/shared/shipping/estimateShipDate.ts
import { toKstYmd } from "./utils.js";
import { calculateInitialProductionSchedule } from "./production.utils.js";

export const EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE =
  "지금은 신속 출고를 선택할 수 없습니다. 예상 출고일이 묶음 출고와 같아 조기 출고 이점이 없습니다.";

/**
 * 신속 출고 선택 가능 여부.
 * 신속 scheduledShipPickup YMD가 묶음보다  Strictly earlier 일 때만 true.
 * 묶음 스케줄을 못 구하면(요일 미설정 등) 비교 불가로 true.
 */
export async function isExpressShippingSelectable({
  requestedAt = new Date(),
  weeklyBatchDays = [],
  maxDiameter = null,
  productMode = null,
} = {}) {
  const now = requestedAt instanceof Date ? requestedAt : new Date(requestedAt);
  const batchDays = Array.isArray(weeklyBatchDays) ? weeklyBatchDays : [];

  const expressSchedule = await calculateInitialProductionSchedule({
    shippingMode: "express",
    requestedAt: now,
    weeklyBatchDays: batchDays,
    maxDiameter,
    productMode,
  });
  const expressYmd = expressSchedule?.scheduledShipPickup
    ? toKstYmd(expressSchedule.scheduledShipPickup)
    : null;
  if (!expressYmd) return false;

  if (batchDays.length === 0) return true;

  const normalSchedule = await calculateInitialProductionSchedule({
    shippingMode: "normal",
    requestedAt: now,
    weeklyBatchDays: batchDays,
    maxDiameter,
    productMode,
  });
  const normalYmd = normalSchedule?.scheduledShipPickup
    ? toKstYmd(normalSchedule.scheduledShipPickup)
    : null;
  if (!normalYmd) return true;

  return expressYmd < normalYmd;
}

/**
 * express 요청을 선택 가능 여부에 따라 normal로 강등한다.
 * @returns {"express"|"normal"}
 */
export async function resolveSelectableShippingMode({
  shippingMode,
  requestedAt = new Date(),
  weeklyBatchDays = [],
  maxDiameter = null,
  productMode = null,
} = {}) {
  const mode = shippingMode === "express" ? "express" : "normal";
  if (mode !== "express") return "normal";

  const ok = await isExpressShippingSelectable({
    requestedAt,
    weeklyBatchDays,
    maxDiameter,
    productMode,
  });
  return ok ? "express" : "normal";
}
