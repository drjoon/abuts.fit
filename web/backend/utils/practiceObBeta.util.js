// related files:
// - web/backend/utils/practiceObPostpaid.util.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/guideTour.util.js
// - web/backend/services/requestCreditHold.service.js
//
// 런칭 전 베타: 미납이어도 신규 기공의뢰를 막지 않는다. 일반 기공소 CA는 무료크레딧만.
// 실사용: 관리자 대시보드 전환(`practiceLaunch.status=live`) 또는 PRACTICE_OB_LAUNCH_BETA=false.
// 베타 종료: 미납 정지는 `checkPracticeSettlementLock`. 기공소 Request CA는 선충전·무료(`resolveLabCustomAbutmentCreditHoldPolicy`).
import BusinessAnchor from "../models/businessAnchor.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import { isGuideTourAlwaysOnBusiness } from "./guideTour.util.js";

const PRACTICE_LAUNCH_MODE_TTL_MS = 5000;
let practiceLaunchCache = { loaded: false, live: false, at: 0 };

/** `PRACTICE_OB_LAUNCH_BETA=false|0|off` 이면 DB와 무관하게 실사용. 테스트·긴급 종료용. */
export function envForcesPracticeLaunchLive() {
  const raw = String(process.env.PRACTICE_OB_LAUNCH_BETA ?? "")
    .trim()
    .toLowerCase();
  return raw === "false" || raw === "0" || raw === "off";
}

export function notePracticeLaunchLive(live) {
  practiceLaunchCache = {
    loaded: true,
    live: Boolean(live),
    at: Date.now(),
  };
}

export function resetPracticeLaunchModeCache() {
  practiceLaunchCache = { loaded: false, live: false, at: 0 };
}

/** SystemSettings.practiceLaunch.status === live 이면 실사용. 짧은 캐시. */
export async function refreshPracticeLaunchMode({ force = false } = {}) {
  if (
    !force &&
    practiceLaunchCache.loaded &&
    Date.now() - practiceLaunchCache.at < PRACTICE_LAUNCH_MODE_TTL_MS
  ) {
    return { live: practiceLaunchCache.live };
  }
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ practiceLaunch: 1 })
    .lean();
  const live = String(doc?.practiceLaunch?.status || "") === "live";
  notePracticeLaunchLive(live);
  return { live };
}

/**
 * 런칭 전 베타 과금 완화 ON/OFF.
 * - true(기본): 미납으로 신규 기공의뢰를 막지 않음. 일반 기공소 CA는 무료크레딧만
 * - false: 미납 정지 적용. 기공소 CA는 선충전·무료
 * 환경변수가 실사용을 강제하면 그 값이 우선. 아니면 관리자 전환 기록.
 */
export function isPracticeObLaunchBetaActive() {
  if (envForcesPracticeLaunchLive()) return false;
  if (practiceLaunchCache.loaded && practiceLaunchCache.live) return false;
  return true;
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
  await refreshPracticeLaunchMode();
  if (!isPracticeObLaunchBetaActive()) return false;
  const ctx = await loadBusinessAnchorBillingGateContext(practiceAnchorId);
  if (!ctx || ctx.isLab) return false;
  return !ctx.obAutopayEnforced;
}

/** 베타: 테스트기공소만 기공소 CA 선불(자동정산 테스트). 그 외 기공소는 무료크레딧만 사용 */
export async function isLabObAutopayPrepaidTestAnchor(labAnchorId) {
  await refreshPracticeLaunchMode();
  if (!isPracticeObLaunchBetaActive()) return false;
  const ctx = await loadBusinessAnchorBillingGateContext(labAnchorId);
  if (!ctx?.isLab) return false;
  return ctx.obAutopayEnforced;
}

/** 일반 기공소 커스텀어벗(Request): 유료·기공크레딧 없이 무료크레딧 버킷만 차감 */
export async function isLabCustomAbutmentFreeCreditOnly(labAnchorId) {
  await refreshPracticeLaunchMode();
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
export function resolveLabCustomAbutmentCreditHoldPolicyFromAnchor(anchor) {
  const kind = String(anchor?.requestorKind || "").trim();
  if (kind !== "lab") {
    return {
      applies: false,
      freeCreditOnly: false,
      excludeSettlementCredit: false,
      allowPostpaidOverdraft: true,
    };
  }
  const freeCreditOnly =
    isPracticeObLaunchBetaActive() &&
    !isObAutopayEnforcedBusinessName(resolveBusinessAnchorDisplayName(anchor));
  return {
    applies: true,
    freeCreditOnly,
    excludeSettlementCredit: true,
    allowPostpaidOverdraft: false,
  };
}

export async function resolveLabCustomAbutmentCreditHoldPolicy(anchorId) {
  await refreshPracticeLaunchMode({ force: true });
  const ctx = await loadBusinessAnchorBillingGateContext(anchorId);
  return resolveLabCustomAbutmentCreditHoldPolicyFromAnchor(ctx?.anchor || null);
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
