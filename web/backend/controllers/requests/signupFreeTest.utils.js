// related files:
// - web/backend/controllers/requests/utils.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/services/requestCreditHold.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - rules.md
//
// 가입 CA 무료 테스트(첫 2건) — **폐지**.
// 신규 가격 배정은 하지 않는다. 기존 `price.rule=signup_free_test_2` 의뢰의
// hold skip·0원 commit·장부 라벨만 레거시 호환으로 유지.
// 대체: 치과·기공소 데모 모드(마이너스 허용) + 관리자 수동 무료크레딧.
import { Types } from "mongoose";
import Request from "../../models/request.model.js";

/** @deprecated 신규 배정 폐지. 레거시 상수·라벨 동기용. */
export const SIGNUP_FREE_TEST_LIMIT = 0;
export const SIGNUP_FREE_TEST_PRICE_RULE = "signup_free_test_2";
export const SIGNUP_FREE_TEST_LEDGER_LABEL = "가입 테스트";

export function isSignupFreeTestPriceRule(rule) {
  return String(rule || "").trim() === SIGNUP_FREE_TEST_PRICE_RULE;
}

export function isSignupFreeTestRequest(request) {
  return isSignupFreeTestPriceRule(request?.price?.rule);
}

/** @deprecated Prefer resolveIsSignupFreeTestEligibleAnchor — kept for call-site compat. */
export async function resolveIsLabRequestorAnchor(requestorOrgId) {
  return resolveIsSignupFreeTestEligibleAnchor(requestorOrgId);
}

/**
 * @deprecated 신규 무료 테스트 폐지. 항상 false.
 */
export function isSignupFreeTestEligibleBusinessType(_businessType) {
  void _businessType;
  return false;
}

/** @deprecated 신규 무료 테스트 폐지. 항상 false. */
export async function resolveIsSignupFreeTestEligibleAnchor(_requestorOrgId) {
  void _requestorOrgId;
  return false;
}

/**
 * @deprecated 신규 배정 없음. 레거시 카운트용으로만 유지.
 */
export async function countSignupFreeTestUsed({
  requestorOrgId,
  excludeRequestId = null,
} = {}) {
  const raw = String(requestorOrgId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return 0;

  const filter = {
    businessAnchorId: new Types.ObjectId(raw),
    manufacturerStage: { $ne: "취소" },
    "price.rule": SIGNUP_FREE_TEST_PRICE_RULE,
  };
  if (excludeRequestId && Types.ObjectId.isValid(String(excludeRequestId))) {
    filter._id = { $ne: new Types.ObjectId(String(excludeRequestId)) };
  }

  return Request.countDocuments(filter);
}

/** 신규 가입 무료 테스트 폐지 — 항상 remaining 0. */
export async function getSignupFreeTestQuota({
  requestorOrgId = null,
  requestorKind = null,
  requestorCapabilities = null,
  excludeRequestId = null,
  isLab = null,
} = {}) {
  void requestorOrgId;
  void requestorKind;
  void requestorCapabilities;
  void excludeRequestId;
  void isLab;
  return {
    eligible: false,
    limit: SIGNUP_FREE_TEST_LIMIT,
    used: 0,
    remaining: 0,
  };
}

/** @deprecated 신규 배정 폐지. */
export function buildSignupFreeTestPrice({
  baseUnitPrice,
  used = 0,
  remaining = 0,
  quotedAt = new Date(),
} = {}) {
  const base = Math.max(0, Math.round(Number(baseUnitPrice) || 0));
  return {
    baseAmount: base,
    discountAmount: base,
    amount: 0,
    currency: "KRW",
    rule: SIGNUP_FREE_TEST_PRICE_RULE,
    discountMeta: {
      signupFreeTestLimit: SIGNUP_FREE_TEST_LIMIT,
      signupFreeTestUsed: Math.max(0, Math.round(Number(used) || 0)),
      signupFreeTestRemaining: Math.max(
        0,
        Math.round(Number(remaining) || 0) - 1,
      ),
      abolished: true,
    },
    quotedAt,
  };
}

/**
 * @deprecated 신규 배정 폐지 — no-op.
 */
export function applySignupFreeTestPricingToBatch(items, _opts = {}) {
  void _opts;
  void items;
  return { applied: 0, remaining: 0 };
}
