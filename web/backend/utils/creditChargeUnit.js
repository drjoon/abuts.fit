// change-log:
// - 2026-08-11: 의뢰자 크레딧 충전 단위 — 기공소 50만원, 치과(practice) 100만원. 2회차 추천은 월사용량/3 반올림.
// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/controllers/credits/creditBPlan.controller.js
// - web/backend/controllers/credits/credit.controller.js
// - web/frontend/src/features/settings/tabs/CreditPaymentTab.tsx
import { normalizeRequestorKind } from "./requestorCapabilities.js";

export const CHARGE_UNIT_LAB = 500_000;
export const CHARGE_UNIT_PRACTICE = 1_000_000;
/** 절대 상한(공급가). 기공소 50만×100 / 치과 100만×50 */
export const MAX_CHARGE_SUPPLY = 50_000_000;

export function resolveCreditChargeUnit(requestorKind) {
  const kind = normalizeRequestorKind(requestorKind);
  return kind === "practice" ? CHARGE_UNIT_PRACTICE : CHARGE_UNIT_LAB;
}

export function maxChargeUnitsFor(unit) {
  const u = Number(unit);
  if (!Number.isFinite(u) || u <= 0) return 1;
  return Math.max(1, Math.floor(MAX_CHARGE_SUPPLY / u));
}

export function formatChargeUnitLabel(unit) {
  const man = Math.round(Number(unit || 0) / 10_000);
  return `${man.toLocaleString()}만원`;
}

export function validateCreditSupplyAmount(raw, requestorKind) {
  const supplyAmount = Number(raw);
  if (!Number.isFinite(supplyAmount) || supplyAmount <= 0) {
    return { ok: false, message: "유효하지 않은 금액입니다." };
  }

  const unit = resolveCreditChargeUnit(requestorKind);
  const min = unit;
  const max = MAX_CHARGE_SUPPLY;
  const unitLabel = formatChargeUnitLabel(unit);

  if (supplyAmount < min || supplyAmount > max) {
    return {
      ok: false,
      message: `크레딧 충전 금액은 ${unitLabel} ~ 5,000만원 범위여야 합니다.`,
    };
  }

  if (supplyAmount % unit !== 0) {
    return {
      ok: false,
      message: `크레딧 충전 금액은 ${unitLabel} 단위로만 충전할 수 있습니다.`,
    };
  }

  return { ok: true, supplyAmount, unit };
}
