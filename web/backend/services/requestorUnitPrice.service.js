// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/utils/creditSettingsDefaults.js
// change-log:
// - 2026-10-08: 거래처별 딜러 설정가(BusinessAnchor.dealerUnitPrice) 또는 기본 1.5만. 스냅샷·그룹할인 폐지.
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { resolveRequestorUnitPrice } from "../utils/requestorUnitPricePolicy.js";

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

export function invalidateRequestorUnitPriceCache(anchorId) {
  if (anchorId) cache.delete(String(anchorId));
  else cache.clear();
}

/**
 * 의뢰자 사업자의 건당 의뢰비. 의뢰자 사업자가 아니면 null.
 */
export async function resolveRequestorUnitPriceForAnchorId(businessAnchorId) {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const hit = cache.get(anchorId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ businessType: 1, dealerUnitPrice: 1 })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "requestor") return null;

  const value = {
    ...resolveRequestorUnitPrice({ dealerUnitPrice: anchor.dealerUnitPrice }),
    source: anchor.dealerUnitPrice != null ? "dealer" : "base",
  };
  cache.set(anchorId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
