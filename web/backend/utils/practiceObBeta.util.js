// related files:
// - web/backend/utils/practiceObPostpaid.util.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/guideTour.util.js
// - web/backend/services/requestCreditHold.service.js
//
// 런칭 전 베타: OB 자동정산·PTX 잠금은 테스트치과·테스트기공소만. 그 외는 무제한(마이너스 허용).
// 베타 종료: 치과 PTX는 OB 후불(`isPracticeObPostpaidActive`). 기공소 Request CA는 선충전·무료만(`resolveLabCustomAbutmentCreditHoldPolicy`).
import BusinessAnchor from "../models/businessAnchor.model.js";
import { isGuideTourAlwaysOnBusiness } from "./guideTour.util.js";

/**
 * 런칭 전 베타 과금 완화 ON/OFF.
 * - true(기본): 테스트 계정만 OB·PTX 잠금, 그 외 치과 무제한 후불·일반 기공소 CA 무료크레딧
 * - false: 치과 PTX OB 후불 overdraft. 기공소 CA는 항상 선충전·무료만
 */
export function isPracticeObLaunchBetaActive() {
  const raw = String(process.env.PRACTICE_OB_LAUNCH_BETA ?? "true")
    .trim()
    .toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

/** OB 자동정산(장기동의·월 정산·Hold)을 적용할 사업자명 SSOT */
export function isObAutopayEnforcedBusinessName(name) {
  return isGuideTourAlwaysOnBusiness(name);
}

export function resolveBusinessAnchorDisplayName(anchor) {
  if (!anchor || typeof anchor !== "object") return "";
  return String(
    anchor.name || anchor.profile?.companyName || "",
  ).trim();
}

export async function loadBusinessAnchorBillingGateContext(anchorId) {
  const id = String(anchorId || "").trim();
  if (!id) return null;
  const anchor = await BusinessAnchor.findById(id)
    .select({ name: 1, profile: 1, requestorKind: 1 })
    .lean();
  if (!anchor) return null;
  const displayName = resolveBusinessAnchorDisplayName(anchor);
  const kind = String(anchor.requestorKind || "").trim();
  return {
    anchor,
    displayName,
    obAutopayEnforced: isObAutopayEnforcedBusinessName(displayName),
    isLab: kind === "lab",
    isPractice: kind === "practice",
  };
}

/** 베타: 테스트치과만 OB 후불·PTX 잠금 대상. 그 외 치과는 OB 없이 후불(overdraft) */
export async function isPracticeBetaUnlimitedPostpaid(practiceAnchorId) {
  if (!isPracticeObLaunchBetaActive()) return false;
  const ctx = await loadBusinessAnchorBillingGateContext(practiceAnchorId);
  if (!ctx || ctx.isLab) return false;
  return !ctx.obAutopayEnforced;
}

/** 베타: 테스트기공소만 기공소 CA 선불(자동정산 테스트). 그 외 기공소는 무료크레딧만 사용 */
export async function isLabObAutopayPrepaidTestAnchor(labAnchorId) {
  if (!isPracticeObLaunchBetaActive()) return false;
  const ctx = await loadBusinessAnchorBillingGateContext(labAnchorId);
  if (!ctx?.isLab) return false;
  return ctx.obAutopayEnforced;
}

/** 일반 기공소 커스텀어벗(Request): 유료·기공크레딧 없이 무료크레딧 버킷만 차감 */
export async function isLabCustomAbutmentFreeCreditOnly(labAnchorId) {
  if (!isPracticeObLaunchBetaActive()) return false;
  const ctx = await loadBusinessAnchorBillingGateContext(labAnchorId);
  if (!ctx?.isLab) return false;
  return !ctx.obAutopayEnforced;
}

/**
 * 기공소 어벗(Request·배송 hold) 크레딧 버킷 SSOT.
 * - 치과 PTX 적립(settlement) 사용 금지 — 치과 직수납·플랫폼 후납 리스크.
 * - OB 후불 마이너스(overdraft) 금지 — 선충전·무료만.
 * - 런칭 베타: 테스트기공소 제외 일반 기공소는 무료크레딧만(`freeCreditOnly`).
 */
export async function resolveLabCustomAbutmentCreditHoldPolicy(anchorId) {
  const ctx = await loadBusinessAnchorBillingGateContext(anchorId);
  if (!ctx?.isLab) {
    return {
      applies: false,
      freeCreditOnly: false,
      excludeSettlementCredit: false,
      allowPostpaidOverdraft: true,
    };
  }
  return {
    applies: true,
    freeCreditOnly: await isLabCustomAbutmentFreeCreditOnly(anchorId),
    excludeSettlementCredit: true,
    allowPostpaidOverdraft: false,
  };
}

/** hold·402 사전검사용 — policy에 맞게 settlement·paid 버킷 조정 */
export function buildCustomAbutmentSpendBuckets(balances, policy) {
  const paidCredit = Math.round(Number(balances?.paidCredit || 0));
  const freeRequestCredit = Math.round(
    Number(balances?.freeRequestCredit || 0),
  );
  const freeShippingCredit = Math.round(
    Number(balances?.freeShippingCredit || 0),
  );
  const settlementCredit = Math.round(Number(balances?.settlementCredit || 0));
  if (!policy?.applies) {
    return {
      paidCredit,
      freeRequestCredit,
      freeShippingCredit,
      settlementCredit,
    };
  }
  if (policy.freeCreditOnly) {
    return {
      paidCredit: 0,
      freeRequestCredit,
      freeShippingCredit,
      settlementCredit: 0,
    };
  }
  return {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    settlementCredit: policy.excludeSettlementCredit ? 0 : settlementCredit,
  };
}
