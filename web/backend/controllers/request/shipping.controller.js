import Request from "../../models/request.model.js";
import {
  buildRequestorOrgScopeFilter,
  calculateExpressShipYmd,
  normalizeKoreanBusinessDay,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
  applyStatusMapping,
  normalizeRequestStage,
  normalizeRequestStageLabel,
} from "./utils.js";
import cache, { CacheKeys, CacheTTL } from "../../utils/cache.utils.js";

const __cache = new Map();
const memo = async ({ key, ttlMs, fn }) => {
  const now = Date.now();
  const hit = __cache.get(key);
  if (hit && typeof hit.expiresAt === "number" && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fn();
  __cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

/**
 * 배송 방식 변경 (의뢰자용)
 * @route PATCH /api/requests/my/shipping-mode
 */
export async function updateMyShippingMode(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds, shippingMode } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!["normal", "express"].includes(shippingMode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 배송 방식입니다.",
      });
    }

    // Fire & Forget: 즉시 응답 반환, 백그라운드에서 처리
    setImmediate(async () => {
      try {
        const { recalculateProductionSchedule, calculatePriority } =
          await import("./production.utils.js");

        const requests = await Request.find({
          ...requestFilter,
          requestId: { $in: requestIds },
          status: "의뢰", // 의뢰 단계만 변경 가능
        });

        for (const req of requests) {
          const maxDiameter = req.caseInfos?.maxDiameter;
          const requestedAt = req.createdAt || new Date();

          // 생산 스케줄 재계산
          const newSchedule = recalculateProductionSchedule({
            currentStage: req.status,
            newShippingMode: shippingMode,
            maxDiameter,
            requestedAt,
          });

          if (!newSchedule) continue;

          // finalShipping 업데이트 (원본 originalShipping은 보존)
          req.finalShipping = {
            mode: shippingMode,
            updatedAt: new Date(),
          };

          // 생산 스케줄 업데이트
          req.productionSchedule = newSchedule;

          // 하위 호환성을 위해 timeline.estimatedCompletion도 업데이트
          req.timeline = req.timeline || {};
          req.timeline.estimatedCompletion = newSchedule.estimatedDelivery
            .toISOString()
            .slice(0, 10);

          await req.save();
        }

        console.log(`[Fire&Forget] Updated ${requests.length} shipping modes`);
      } catch (err) {
        console.error("[Fire&Forget] Error in shipping mode update:", err);
      }
    });

    // 즉시 응답 (UI 대기 없음)
    return res.status(200).json({
      success: true,
      message: `배송 방식 변경이 처리 중입니다.`,
      data: {
        requestedCount: requestIds.length,
        shippingMode,
      },
    });
  } catch (error) {
    console.error("Error in updateMyShippingMode:", error);
    return res.status(500).json({
      success: false,
      message: "배송 방식 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 배송 도착일/출고일 계산 (공용)
 * @route GET /api/requests/shipping-estimate
 */
export async function getShippingEstimate(req, res) {
  try {
    const mode = req.query.mode;
    const shipYmd =
      typeof req.query.shipYmd === "string" && req.query.shipYmd.trim()
        ? req.query.shipYmd.trim()
        : null;
    const maxDiameterRaw = req.query.maxDiameter;
    const maxDiameter =
      typeof maxDiameterRaw === "string" && maxDiameterRaw.trim()
        ? Number(maxDiameterRaw)
        : typeof maxDiameterRaw === "number"
        ? maxDiameterRaw
        : null;

    if (!mode || !["express", "normal"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 mode 입니다.",
      });
    }

    // 출고일: express는 정책 기반, normal은 기본값(today)
    const todayYmd = getTodayYmdInKst();
    const rawShipDateYmd = shipYmd
      ? shipYmd
      : mode === "express"
      ? await calculateExpressShipYmd({ maxDiameter })
      : todayYmd;

    const shipDateYmd = await normalizeKoreanBusinessDay({
      ymd: rawShipDateYmd,
    });

    // 도착일: express는 ship+1 영업일, normal은 직경별 리드타임(영업일) 적용
    const resolveNormalLeadDays = () => {
      const d =
        typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
          ? maxDiameter
          : null;
      if (d == null) return DEFAULT_DELIVERY_ETA_LEAD_DAYS.d10;
      if (d <= 6) return DEFAULT_DELIVERY_ETA_LEAD_DAYS.d6;
      if (d <= 8) return DEFAULT_DELIVERY_ETA_LEAD_DAYS.d8;
      if (d <= 10) return DEFAULT_DELIVERY_ETA_LEAD_DAYS.d10;
      return DEFAULT_DELIVERY_ETA_LEAD_DAYS.d10plus;
    };

    const arrivalDateYmd =
      mode === "express"
        ? await addKoreanBusinessDays({ startYmd: shipDateYmd, days: 1 })
        : await addKoreanBusinessDays({
            startYmd: shipDateYmd,
            days: resolveNormalLeadDays(),
          });

    return res.status(200).json({
      success: true,
      data: {
        shipDateYmd,
        arrivalDateYmd,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "배송 도착일 계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 후보 조회 (의뢰자용)
 * @route GET /api/requests/my/bulk-shipping
 */
export async function getMyBulkShipping(req, res) {
  try {
    const userId = req.user?._id?.toString();
    const cacheKey = `bulk-shipping:${userId}`;

    // 캐시 확인 (1분)
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const leadDays = await getDeliveryEtaLeadDays();
    const effectiveLeadDays = {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(leadDays || {}),
    };

    const resolveNormalLeadDays = (maxDiameter) => {
      const d =
        typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
          ? maxDiameter
          : maxDiameter != null && String(maxDiameter).trim()
          ? Number(maxDiameter)
          : null;
      if (d == null || Number.isNaN(d)) return effectiveLeadDays.d10;
      if (d <= 6) return effectiveLeadDays.d6;
      if (d <= 8) return effectiveLeadDays.d8;
      if (d <= 10) return effectiveLeadDays.d10;
      return effectiveLeadDays.d10plus;
    };

    const toYmd = (d) => {
      if (!d) return null;
      const date = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(date.getTime())) return null;
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    };

    // 배치 최적화: 같은 diameter는 1회만 계산
    const todayYmd = getTodayYmdInKst();
    const diameterCache = new Map();

    const getExpressShipYmd = async (maxDiameter) => {
      const key = String(maxDiameter ?? "-");
      if (!diameterCache.has(key)) {
        const raw = await memo({
          key: `expressShip:${todayYmd}:${key}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => calculateExpressShipYmd({ maxDiameter, baseYmd: todayYmd }),
        });
        const normalized = await memo({
          key: `krbiz:normalize:${raw}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd: raw }),
        });
        diameterCache.set(key, normalized);
      }
      return diameterCache.get(key);
    };

    const resolveShippingYmds = async (r) => {
      const ci = r.caseInfos || {};
      const maxDiameter = ci.maxDiameter;
      const mode = r.shippingMode || "normal";

      const createdYmd = toYmd(r.createdAt);
      const baseYmd = createdYmd || todayYmd;
      const requestedShipYmd = toYmd(r.requestedShipDate);

      // ETA가 이미 있으면 계산 생략
      const existing = r.timeline?.estimatedCompletion;
      const existingEtaYmd =
        existing instanceof Date
          ? existing.toISOString().slice(0, 10)
          : typeof existing === "string" && existing.trim()
          ? existing.trim()
          : null;

      let shipDateYmd;
      if (mode === "express") {
        shipDateYmd =
          requestedShipYmd || (await getExpressShipYmd(maxDiameter));
      } else {
        const raw = requestedShipYmd || baseYmd;
        shipDateYmd = await memo({
          key: `krbiz:normalize:${raw}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd: raw }),
        });
      }

      if (existingEtaYmd) {
        return { shipDateYmd, arrivalDateYmd: existingEtaYmd };
      }

      // ETA 없는 경우만 계산
      const days = mode === "express" ? 1 : resolveNormalLeadDays(maxDiameter);
      const arrivalDateYmd = await memo({
        key: `krbiz:add:${shipDateYmd}:${days}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => addKoreanBusinessDays({ startYmd: shipDateYmd, days }),
      });

      return { shipDateYmd, arrivalDateYmd };
    };

    const requests = await Request.find({
      ...requestFilter,
      status: {
        $in: [
          "의뢰",
          "의뢰접수",
          "CAM",
          "가공전",
          "생산",
          "가공후",
          "발송",
          "배송대기",
          "배송중",
        ],
      },
    })
      .select(
        "requestId title status manufacturerStage caseInfos shippingMode requestedShipDate createdAt timeline.estimatedCompletion requestor"
      )
      .populate("requestor", "name organization")
      .lean();

    const mapItem = async (r) => {
      const ci = r.caseInfos || {};
      const clinic =
        r.requestor?.organization || r.requestor?.name || req.user?.name || "";
      const maxDiameter =
        typeof ci.maxDiameter === "number"
          ? `${ci.maxDiameter}mm`
          : ci.maxDiameter != null
          ? `${Number(ci.maxDiameter)}mm`
          : "";

      const ymds = await resolveShippingYmds(r);
      const eta = ymds?.arrivalDateYmd;
      const shipDateYmd = ymds?.shipDateYmd;

      const stageKey = normalizeRequestStage(r);
      const stageLabel = normalizeRequestStageLabel(r);

      return {
        id: r.requestId,
        mongoId: r._id,
        title: r.title,
        clinic,
        patient: ci.patientName || "",
        tooth: ci.tooth || "",
        diameter: maxDiameter,
        status: r.status,
        stageKey,
        stageLabel,
        shippingMode: r.shippingMode || "normal",
        requestedShipDate: r.requestedShipDate,
        shipDateYmd,
        estimatedArrivalDate: eta,
      };
    };

    const [pre, post, waiting] = await Promise.all([
      Promise.all(
        requests
          .filter((r) =>
            ["의뢰", "의뢰접수", "CAM", "가공전"].includes(r.status)
          )
          .map(mapItem)
      ),
      Promise.all(
        requests
          .filter((r) => ["생산", "가공후"].includes(r.status))
          .map(mapItem)
      ),
      Promise.all(
        requests
          .filter((r) => ["발송", "배송대기", "배송중"].includes(r.status))
          .map(mapItem)
      ),
    ]);

    const responseData = { pre, post, waiting };

    // 캐시 저장 (1분)
    cache.set(cacheKey, responseData, CacheTTL.MEDIUM);

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 생성/신청 (의뢰자용)
 * @route POST /api/requests/my/bulk-shipping
 */
export async function createMyBulkShipping(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    const requests = await Request.find({
      ...requestFilter,
      requestId: { $in: requestIds },
      status: { $in: ["CAM", "생산", "발송"] },
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    for (const r of requests) {
      applyStatusMapping(r, "발송");
      await r.save();
    }

    return res.status(200).json({
      success: true,
      message: `${requests.length}건의 의뢰가 발송 상태로 변경되었습니다.`,
      data: {
        updatedIds: requests.map((r) => r.requestId),
      },
    });
  } catch (error) {
    console.error("Error in createMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
