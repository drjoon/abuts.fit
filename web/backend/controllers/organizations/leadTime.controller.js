import RequestorOrganization from "../../models/requestorOrganization.model.js";

const DEFAULT_LEAD_TIMES = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 },
};

/**
 * GET /api/organizations/manufacturer-lead-times
 * 제조사가 설정한 배송 리드타임을 조회 (모든 역할 접근 가능)
 */
export async function getManufacturerLeadTimes(req, res) {
  try {
    res.set("x-abuts-handler", "leadTime.getManufacturerLeadTimes");

    const latestManufacturer = await RequestorOrganization.findOne({
      organizationType: "manufacturer",
      "shippingPolicy.leadTimes": { $exists: true },
    })
      .sort({ "shippingPolicy.updatedAt": -1, updatedAt: -1 })
      .select({
        "shippingPolicy.leadTimes": 1,
        "shippingPolicy.weeklyBatchDays": 1,
      })
      .lean();

    const storedLeadTimes = latestManufacturer?.shippingPolicy?.leadTimes;
    const weeklyBatchDays =
      latestManufacturer?.shippingPolicy?.weeklyBatchDays || [];

    const mergeLeadTimes = (raw) => {
      const base = { ...DEFAULT_LEAD_TIMES };
      if (!raw || typeof raw !== "object") return base;
      ["d6", "d8", "d10", "d12"].forEach((key) => {
        const entry = raw?.[key];
        if (!entry) return;
        const min = Number.isFinite(entry.minBusinessDays)
          ? Math.max(0, Math.floor(entry.minBusinessDays))
          : base[key].minBusinessDays;
        const max = Number.isFinite(entry.maxBusinessDays)
          ? Math.max(0, Math.floor(entry.maxBusinessDays))
          : base[key].maxBusinessDays;
        base[key] = {
          minBusinessDays: Math.min(min, max),
          maxBusinessDays: Math.max(min, max),
        };
      });
      return base;
    };

    const effectiveLeadTimes = mergeLeadTimes(storedLeadTimes);

    return res.json({
      success: true,
      data: {
        leadTimes: effectiveLeadTimes,
        weeklyBatchDays,
      },
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
    const latestManufacturer = await RequestorOrganization.findOne({
      organizationType: "manufacturer",
      "shippingPolicy.leadTimes": { $exists: true },
    })
      .sort({ "shippingPolicy.updatedAt": -1, updatedAt: -1 })
      .select({
        "shippingPolicy.leadTimes": 1,
        "shippingPolicy.weeklyBatchDays": 1,
      })
      .lean();

    const storedLeadTimes = latestManufacturer?.shippingPolicy?.leadTimes;
    const weeklyBatchDays =
      latestManufacturer?.shippingPolicy?.weeklyBatchDays || [];

    const mergeLeadTimes = (raw) => {
      const base = { ...DEFAULT_LEAD_TIMES };
      if (!raw || typeof raw !== "object") return base;
      ["d6", "d8", "d10", "d12"].forEach((key) => {
        const entry = raw?.[key];
        if (!entry) return;
        const min = Number.isFinite(entry.minBusinessDays)
          ? Math.max(0, Math.floor(entry.minBusinessDays))
          : base[key].minBusinessDays;
        const max = Number.isFinite(entry.maxBusinessDays)
          ? Math.max(0, Math.floor(entry.maxBusinessDays))
          : base[key].maxBusinessDays;
        base[key] = {
          minBusinessDays: Math.min(min, max),
          maxBusinessDays: Math.max(min, max),
        };
      });
      return base;
    };

    return {
      leadTimes: mergeLeadTimes(storedLeadTimes),
      weeklyBatchDays,
    };
  } catch (error) {
    console.error("[getManufacturerLeadTimesUtil] error:", error);
    return {
      leadTimes: DEFAULT_LEAD_TIMES,
      weeklyBatchDays: [],
    };
  }
}
