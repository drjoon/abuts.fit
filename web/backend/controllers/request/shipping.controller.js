import Request from "../../models/request.model.js";
import {
  buildRequestorOrgScopeFilter,
  calculateExpressShipYmd,
  normalizeKoreanBusinessDay,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  applyStatusMapping,
} from "./utils.js";

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

    const result = await Request.updateMany(
      {
        ...requestFilter,
        requestId: { $in: requestIds },
        status: { $nin: ["취소", "추적관리", "완료"] },
      },
      {
        $set: { shippingMode },
      }
    );

    const modified = result?.modifiedCount ?? result?.nModified ?? 0;

    return res.status(200).json({
      success: true,
      message: `${modified}건의 배송 방식이 변경되었습니다.`,
      data: {
        updatedIds: requestIds,
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
    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const requests = await Request.find({
      ...requestFilter,
      status: { $in: ["CAM", "생산", "발송", "가공전", "가공후", "배송대기"] },
    })
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    const mapItem = (r) => {
      const ci = r.caseInfos || {};
      const clinic =
        r.requestor?.organization || r.requestor?.name || req.user?.name || "";
      const maxDiameter =
        typeof ci.maxDiameter === "number"
          ? `${ci.maxDiameter}mm`
          : ci.maxDiameter != null
          ? `${Number(ci.maxDiameter)}mm`
          : "";

      return {
        id: r.requestId,
        mongoId: r._id,
        title: r.title,
        clinic,
        patient: ci.patientName || "",
        tooth: ci.tooth || "",
        diameter: maxDiameter,
        status: r.status,
        status1: r.status1,
        status2: r.status2,
        shippingMode: r.shippingMode || "normal",
        requestedShipDate: r.requestedShipDate,
      };
    };

    const pre = requests
      .filter((r) => r.status === "CAM" || r.status === "가공전")
      .map(mapItem);
    const post = requests
      .filter((r) => r.status === "생산" || r.status === "가공후")
      .map(mapItem);
    const waiting = requests
      .filter((r) => r.status === "발송" || r.status === "배송대기")
      .map(mapItem);

    return res.status(200).json({
      success: true,
      data: { pre, post, waiting },
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
      status: { $in: ["CAM", "생산", "발송", "가공전", "가공후", "배송대기"] },
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
      message: `${requests.length}건의 의뢰가 배송대기 상태로 변경되었습니다.`,
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
