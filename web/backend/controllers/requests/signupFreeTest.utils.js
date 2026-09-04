// related files:
// - web/backend/controllers/requests/utils.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/services/requestCreditHold.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - rules.md
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  normalizeRequestorCapabilities,
  normalizeRequestorKind,
} from "../../utils/requestorCapabilities.js";

/** 기공소 가입 후 첫 N건 무료 테스트(크레딧·제조사·배송 0원). */
export const SIGNUP_FREE_TEST_LIMIT = 2;
export const SIGNUP_FREE_TEST_PRICE_RULE = "signup_free_test_2";
export const SIGNUP_FREE_TEST_LEDGER_LABEL = "가입 테스트";

export function isSignupFreeTestPriceRule(rule) {
  return String(rule || "").trim() === SIGNUP_FREE_TEST_PRICE_RULE;
}

export function isSignupFreeTestRequest(request) {
  return isSignupFreeTestPriceRule(request?.price?.rule);
}

function isLabRequestorKind(kind, caps) {
  const normalized = normalizeRequestorKind(kind);
  if (normalized === "lab") return true;
  if (normalized === "practice") return false;
  const c = normalizeRequestorCapabilities(caps);
  return Boolean(c.lab && !c.practice);
}

export async function resolveIsLabRequestorAnchor(requestorOrgId) {
  const raw = String(requestorOrgId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return false;
  const anchor = await BusinessAnchor.findById(raw)
    .select({ businessType: 1, requestorKind: 1, requestorCapabilities: 1 })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "requestor") return false;
  return isLabRequestorKind(
    anchor.requestorKind,
    anchor.requestorCapabilities,
  );
}

/**
 * 가입 후 비취소 의뢰 건수(무료 테스트 쿼터 SSOT).
 * 준비 단계 취소(`manufacturerStage=취소`)는 현행과 동일하게 가능하며, 취소 건은 카운트에서 제외되어 슬롯이 환원된다.
 * 샘플·신규임플란트 무상 태그는 별도 제외하지 않음 — "첫 2건"은 실제 비취소 의뢰 문서 기준.
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
  };
  if (excludeRequestId && Types.ObjectId.isValid(String(excludeRequestId))) {
    filter._id = { $ne: new Types.ObjectId(String(excludeRequestId)) };
  }

  return Request.countDocuments(filter);
}

export async function getSignupFreeTestQuota({
  requestorOrgId,
  requestorKind = null,
  requestorCapabilities = null,
  excludeRequestId = null,
  isLab = null,
} = {}) {
  const lab =
    typeof isLab === "boolean"
      ? isLab
      : requestorKind != null || requestorCapabilities != null
        ? isLabRequestorKind(requestorKind, requestorCapabilities)
        : await resolveIsLabRequestorAnchor(requestorOrgId);

  if (!lab) {
    return {
      eligible: false,
      limit: SIGNUP_FREE_TEST_LIMIT,
      used: 0,
      remaining: 0,
    };
  }

  const used = await countSignupFreeTestUsed({
    requestorOrgId,
    excludeRequestId,
  });
  return {
    eligible: true,
    limit: SIGNUP_FREE_TEST_LIMIT,
    used,
    remaining: Math.max(0, SIGNUP_FREE_TEST_LIMIT - used),
  };
}

export function buildSignupFreeTestPrice({
  baseUnitPrice,
  used = 0,
  remaining = SIGNUP_FREE_TEST_LIMIT,
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
    },
    quotedAt,
  };
}

function isBatchItemLockedFree(item) {
  if (item?.computedPrice?.discountType === "free") return true;
  if (item?.computedPrice?.free === true) return true;
  const rule = String(item?.computedPrice?.rule || "").trim();
  if (rule === "manufacturer_sample") return true;
  return false;
}

/**
 * 배치 제출 시 형제 의뢰가 아직 DB에 없어 쿼터를 직렬로 배정한다.
 * @param {{ computedPrice?: object }[]} items
 * @param {{ remaining: number, used: number, baseUnitPrice: number }} opts
 */
export function applySignupFreeTestPricingToBatch(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  let remaining = Math.max(0, Math.round(Number(opts.remaining) || 0));
  let used = Math.max(0, Math.round(Number(opts.used) || 0));
  const baseUnitPrice = Math.max(
    0,
    Math.round(Number(opts.baseUnitPrice) || 0),
  );
  if (!(remaining > 0) || !list.length) return { applied: 0, remaining };

  let applied = 0;
  for (const item of list) {
    if (!(remaining > 0)) break;
    if (isBatchItemLockedFree(item)) continue;
    if (isSignupFreeTestPriceRule(item?.computedPrice?.rule)) {
      remaining -= 1;
      used += 1;
      applied += 1;
      continue;
    }
    item.computedPrice = buildSignupFreeTestPrice({
      baseUnitPrice:
        Number(item?.computedPrice?.baseAmount) > 0
          ? item.computedPrice.baseAmount
          : baseUnitPrice,
      used,
      remaining,
    });
    remaining -= 1;
    used += 1;
    applied += 1;
  }
  return { applied, remaining };
}
