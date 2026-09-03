// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - 2026-08-19: getManufacturerLeadTimesUtil 60초 메모리 캐시(제출 반복 조회 생략).
import BusinessAnchor from "../../models/businessAnchor.model.js";

const DEFAULT_LEAD_TIMES = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 1, maxBusinessDays: 2 },
  d12: { minBusinessDays: 1, maxBusinessDays: 2 },
};

const LEAD_TIMES_CACHE_TTL_MS = 60 * 1000;
let leadTimesCache = { at: 0, value: null };

const mergeLeadTimes = (raw) => {
  const base = { ...DEFAULT_LEAD_TIMES };
  if (!raw || typeof raw !== "object") return base;
  ["d6", "d8", "d10", "d12"].forEach((key) => {
    const entry = raw?.[key];
    if (!entry) return;
    const min = Number.isFinite(entry.minBusinessDays)
      ? Math.max(1, Math.floor(entry.minBusinessDays))
      : base[key].minBusinessDays;
    const max = Number.isFinite(entry.maxBusinessDays)
      ? Math.max(1, Math.floor(entry.maxBusinessDays))
      : base[key].maxBusinessDays;
    base[key] = {
      minBusinessDays: Math.min(min, max),
      maxBusinessDays: Math.max(min, max),
    };
  });
  return base;
};

/**
 * GET /api/businesses/manufacturer-lead-times
 * 제조사가 설정한 배송 리드타임을 조회 (모든 역할 접근 가능)
 */
export async function getManufacturerLeadTimes(req, res) {
  try {
    res.set("x-abuts-handler", "leadTime.getManufacturerLeadTimes");
    const data = await getManufacturerLeadTimesUtil();
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[getManufacturerLeadTimes] error:", error);
    return res.status(500).json({
      success: false,
      message: "배송 리드타임 조회 중 오류가 발생했습니다.",
      error: error?.message || String(error),
    });
  }
}

/**
 * 백엔드 내부 유틸: 제조사 리드타임을 조회하여 반환
 * @returns {Promise<Object>} { d6: {min, max}, d8: {min, max}, ... }
 */
export async function getManufacturerLeadTimesUtil() {
  try {
    const now = Date.now();
    if (
      leadTimesCache.value &&
      now - leadTimesCache.at < LEAD_TIMES_CACHE_TTL_MS
    ) {
      return leadTimesCache.value;
    }

    const latestManufacturer = await BusinessAnchor.findOne({
      businessType: "manufacturer",
      "shippingPolicy.leadTimes": { $exists: true },
    })
      .sort({ "shippingPolicy.updatedAt": -1, updatedAt: -1 })
      .select({
        "shippingPolicy.leadTimes": 1,
        "shippingPolicy.weeklyBatchDays": 1,
      })
      .lean();

    const result = {
      leadTimes: mergeLeadTimes(
        latestManufacturer?.shippingPolicy?.leadTimes,
      ),
      weeklyBatchDays:
        latestManufacturer?.shippingPolicy?.weeklyBatchDays || [],
    };
    leadTimesCache = { at: now, value: result };
    return result;
  } catch (error) {
    console.error("[getManufacturerLeadTimesUtil] error:", error);
    return {
      leadTimes: DEFAULT_LEAD_TIMES,
      weeklyBatchDays: [],
    };
  }
}
