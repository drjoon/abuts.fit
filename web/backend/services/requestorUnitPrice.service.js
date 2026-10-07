// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/services/pricingReferralSnapshot.service.js
// - web/backend/utils/creditSettingsDefaults.js
// change-log:
// - 2026-10-08: 오늘 건당 의뢰비 = 자정 스냅샷 단가. 스냅샷 전이면 직전 단가, 신규 가입은 가입 이벤트가.
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PricingReferralRolling30dAggregate from "../models/pricingReferralRolling30dAggregate.model.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import {
  REQUESTOR_UNIT_PRICE_BASE,
  resolveRequestorUnitPrice,
} from "../utils/requestorUnitPricePolicy.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export function invalidateRequestorUnitPriceCache() {
  cache.clear();
}

const fromSnapshot = (row, source) => ({
  unitPrice: Math.round(Number(row.unitPrice)),
  discountAmount: Math.max(0, Math.round(Number(row.discountAmount) || 0)),
  rule: row.priceRule || "base_price",
  introEndsYmd: row.introEndsYmd || null,
  source,
});

/**
 * 의뢰자 사업자의 오늘(KST) 건당 의뢰비.
 * 1) 오늘 자정 스냅샷 단가
 * 2) 스냅샷 전: 가입 이벤트 기간이면 이벤트가, 아니면 가장 최근 스냅샷 단가
 * 3) 이력 없음: 기본가
 * 의뢰자 사업자가 아니면 null.
 */
export async function resolveRequestorUnitPriceForAnchorId(
  businessAnchorId,
  ymd = getTodayYmdInKst(),
) {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId) || !ymd) return null;

  const cacheKey = `${anchorId}:${ymd}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const anchorObjectId = new Types.ObjectId(anchorId);
  const [today, anchor] = await Promise.all([
    PricingReferralRolling30dAggregate.findOne({
      businessAnchorId: anchorObjectId,
      ymd,
      unitPrice: { $ne: null },
    })
      .select({ unitPrice: 1, discountAmount: 1, priceRule: 1, introEndsYmd: 1 })
      .lean(),
    BusinessAnchor.findById(anchorId)
      .select({ businessType: 1, createdAt: 1 })
      .lean(),
  ]);
  if (!anchor || String(anchor.businessType || "") !== "requestor") return null;

  let value;
  if (today) {
    value = fromSnapshot(today, "snapshot");
  } else {
    const intro = resolveRequestorUnitPrice({
      groupOrders30d: 0,
      startedAt: anchor.createdAt,
      ymd,
    });
    if (intro.rule === "intro_fixed") {
      value = { ...intro, source: "intro" };
    } else {
      const prev = await PricingReferralRolling30dAggregate.findOne({
        businessAnchorId: anchorObjectId,
        ymd: { $lt: ymd },
        unitPrice: { $ne: null },
      })
        .sort({ ymd: -1 })
        .select({ unitPrice: 1, discountAmount: 1, priceRule: 1, introEndsYmd: 1 })
        .lean();
      value = prev
        ? fromSnapshot(prev, "previous_snapshot")
        : {
            unitPrice: REQUESTOR_UNIT_PRICE_BASE,
            discountAmount: 0,
            rule: "base_price",
            introEndsYmd: intro.introEndsYmd,
            source: "fallback",
          };
    }
  }

  // 오늘 스냅샷이 없을 때는 짧게만 캐시해 자정 직후 갱신을 놓치지 않는다.
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + (today ? CACHE_TTL_MS : 30 * 1000),
  });
  return value;
}
