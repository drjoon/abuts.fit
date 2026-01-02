import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import {
  buildRequestorOrgScopeFilter,
  buildRequestorOrgFilter,
  getDeliveryEtaLeadDays,
  computeDiameterStats,
  normalizeCaseInfosImplantFields,
  addKoreanBusinessDays,
  getTodayYmdInKst,
} from "./utils.js";

const toKstYmd = (d) => {
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

const ymdToKstMidnight = (ymd) => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * 최대 직경별 통계 (공용)
 * @route GET /api/requests/diameter-stats
 */
export async function getDiameterStats(req, res) {
  try {
    const leadDays = await getDeliveryEtaLeadDays();
    const baseFilter = {
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const filter =
      req.user?.role === "requestor"
        ? { ...baseFilter, ...(await buildRequestorOrgScopeFilter(req)) }
        : baseFilter;

    const requests = await Request.find(filter).select({ caseInfos: 1 }).lean();

    const diameterStats = await computeDiameterStats(requests, leadDays);

    return res.status(200).json({
      success: true,
      data: {
        diameterStats,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직경별 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 대시보드 요약 (의뢰자용)
 * @route GET /api/requests/my/dashboard-summary
 */
export async function getMyDashboardSummary(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { period = "30d" } = req.query;

    let dateFilter = {};
    if (period && period !== "all") {
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      const from = new Date();
      from.setDate(from.getDate() - days);
      dateFilter = { createdAt: { $gte: from } };
    }

    const requestFilterWithPeriod = { ...requestFilter, ...dateFilter };

    const requests = await Request.find({
      ...requestFilter,
      $or: [
        { status: { $nin: ["완료", "취소"] } }, // 진행 중인 건은 전체 기간 대상
        dateFilter, // 완료/취소 건은 기간 내 대상
      ],
    })
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    // 커스텀 어벗(Request.caseInfos.implantSystem 존재)만 대시보드 통계 대상
    const abutmentRequests = requests.filter((r) => {
      const ci = r.caseInfos || {};
      return typeof ci.implantSystem === "string" && ci.implantSystem.trim();
    });

    const normalizeStage = (r) => {
      // stage 분류는 manufacturerStage가 authoritative (status 기반 로직은 레거시)
      const status = String(r.status || "");
      const stage = String(r.manufacturerStage || "");
      const status2 = String(r.status2 || "");

      if (status === "취소") return "cancel";
      if (status2 === "완료") return "completed";

      if (["shipping", "tracking", "발송", "추적관리"].includes(stage)) {
        return "shipping";
      }

      if (["machining", "packaging", "production", "생산"].includes(stage)) {
        return "production";
      }

      if (["cam", "CAM", "가공전"].includes(stage)) {
        return "cam";
      }

      if (["request", "receive", "의뢰", "의뢰접수"].includes(stage)) {
        return "request";
      }

      return "request";
    };

    const stages = abutmentRequests.map((r) => ({
      stage: normalizeStage(r),
      request: r,
    }));

    const total = abutmentRequests.length;
    const canceledCount = abutmentRequests.filter(
      (r) => r.status === "취소"
    ).length;
    const inProduction = stages.filter((s) => s.stage === "production").length;
    const inCam = stages.filter((s) => s.stage === "cam").length;
    const completed = stages.filter((s) => s.stage === "completed").length;
    const inShipping = stages.filter((s) => s.stage === "shipping").length;
    const doneOrCanceled = completed + canceledCount;

    const active = stages
      .filter((s) => !["completed", "cancel"].includes(s.stage))
      .map((s) => s.request);

    const stageCounts = {
      design: 0,
      cam: 0,
      production: 0,
      shipping: 0,
    };

    active.forEach((r) => {
      const stage = normalizeStage(r);
      if (stage === "request") {
        stageCounts.design += 1;
      } else if (stage === "cam") {
        stageCounts.cam += 1;
      } else if (stage === "production") {
        stageCounts.production += 1;
      } else if (stage === "shipping") {
        stageCounts.shipping += 1;
      }
    });

    const totalActive = active.length || 1;
    const manufacturingSummary = {
      totalActive: active.length,
      stages: [
        { key: "design", label: "의뢰 접수", count: stageCounts.design },
        { key: "cam", label: "CAM", count: stageCounts.cam },
        { key: "production", label: "생산", count: stageCounts.production },
        {
          key: "shipping",
          label: "발송",
          count: stageCounts.shipping,
        },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    const nowYmd = getTodayYmdInKst();
    const nowMidnight = ymdToKstMidnight(nowYmd) || new Date();
    const delayedItems = [];
    const warningItems = [];

    abutmentRequests.forEach((r) => {
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status === "완료" || Boolean(deliveredAt || shippedAt);

      const estYmd = toKstYmd(est);
      const estMidnight = ymdToKstMidnight(estYmd);
      if (!estMidnight) return;

      const diffDays = Math.floor(
        (nowMidnight.getTime() - estMidnight.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysOverdue = diffDays > 0 ? diffDays : 0;
      const daysUntilDue = diffDays < 0 ? Math.abs(diffDays) : 0;

      if (!isDone) {
        if (diffDays > 0) {
          delayedItems.push({ r, est, daysOverdue, daysUntilDue });
        } else if (diffDays === 0 || diffDays === -1) {
          warningItems.push({ r, est, daysOverdue, daysUntilDue });
        }
      }
    });

    const totalWithEta = abutmentRequests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const est = entry?.est
        ? entry.est
        : r?.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      const daysOverdue = entry?.daysOverdue || 0;
      const daysUntilDue = entry?.daysUntilDue || 0;

      const ci = r?.caseInfos || {};
      const manufacturerText =
        r?.manufacturer?.organization || r?.manufacturer?.name || "";
      const title =
        (r?.title || "").trim() ||
        [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
        r?.requestId ||
        "";

      const mm = est ? String(est.getMonth() + 1).padStart(2, "0") : "";
      const dd = est ? String(est.getDate()).padStart(2, "0") : "";
      const dueLabel = est ? `${mm}/${dd}` : "";

      let message = "";
      if (level === "danger") {
        message = `예상 도착일(${dueLabel}) 기준 ${daysOverdue}일 지연 중입니다.`;
      } else {
        message = `예상 도착일(${dueLabel})이 임박했습니다. (D-${daysUntilDue})`;
      }

      return {
        id: r?.requestId,
        title,
        manufacturer: manufacturerText,
        riskLevel: level,
        status: r?.status,
        status2: r?.status2,
        dueDate: est ? est.toISOString().slice(0, 10) : null,
        daysOverdue,
        daysUntilDue,
        message,
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort((a, b) => (b?.daysOverdue || 0) - (a?.daysOverdue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort((a, b) => (a?.daysUntilDue || 0) - (b?.daysUntilDue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "warning")),
    ];

    const riskSummary = {
      delayedCount,
      warningCount,
      onTimeRate,
      items: riskItems,
    };

    const leadDays = await getDeliveryEtaLeadDays();
    const diameterStats = await computeDiameterStats(
      abutmentRequests,
      leadDays
    );

    const resolveEstimatedCompletionYmd = (r, ci) => {
      // ETA가 이미 있으면 즉시 반환(async 제거)
      if (r?.timeline?.estimatedCompletion) {
        return new Date(r.timeline.estimatedCompletion)
          .toISOString()
          .slice(0, 10);
      }
      // ETA 없으면 null 반환(fallback 계산 제거로 속도 확보)
      return null;
    };

    const recentRequests = abutmentRequests
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bDate = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 5)
      .map((r) => {
        const ci = r.caseInfos || {};
        const etaYmd = resolveEstimatedCompletionYmd(r, ci);
        return {
          // 기본 식별자
          _id: r._id,
          requestId: r.requestId,
          // 표시용 필드
          title: r.title,
          status: r.status,
          manufacturerStage: r.manufacturerStage,
          date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
          estimatedCompletion: etaYmd || null,
          // 편집 다이얼로그에서 사용할 세부 정보
          patientName: ci.patientName || "",
          tooth: ci.tooth || "",
          caseInfos: ci,
          requestor: r.requestor || null,
          deliveryInfoRef: r.deliveryInfoRef || null,
          createdAt: r.createdAt,
        };
      });

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          // '의뢰' 카드에는 접수 단계(의뢰)만 표시
          totalRequests: stageCounts.design,
          inCam,
          inProduction,
          inShipping,
          completed,
          doneOrCanceled,
        },
        manufacturingSummary,
        riskSummary,
        diameterStats,
        recentRequests,
      },
    });
  } catch (error) {
    console.error("Error in getMyDashboardSummary:", error);
    return res.status(500).json({
      success: false,
      message: "대시보드 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getDashboardRiskSummary(req, res) {
  try {
    const { period = "30d" } = req.query;

    let dateFilter = {};
    if (period && period !== "all") {
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      const from = new Date();
      from.setDate(from.getDate() - days);
      dateFilter = { createdAt: { $gte: from } };
    }

    const baseFilter = {
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const filter =
      req.user?.role === "manufacturer"
        ? {
            $and: [
              baseFilter,
              {
                $or: [
                  { manufacturer: req.user._id },
                  { manufacturer: null },
                  { manufacturer: { $exists: false } },
                ],
              },
              {
                $or: [
                  { status: { $ne: "완료" } }, // 미완료 건 전체 (기간 필터 무시)
                  { $and: [{ status: "완료" }, dateFilter] }, // 완료된 건은 기간 내만
                ],
              },
            ],
          }
        : {
            $and: [
              baseFilter,
              await buildRequestorOrgScopeFilter(req),
              {
                $or: [
                  { status: { $ne: "완료" } }, // 미완료 건 전체 (기간 필터 무시)
                  { $and: [{ status: "완료" }, dateFilter] }, // 완료된 건은 기간 내만
                ],
              },
            ],
          };

    const requests = await Request.find(filter)
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    const nowYmd = getTodayYmdInKst();
    const nowMidnight = ymdToKstMidnight(nowYmd) || new Date();
    const delayedItems = [];
    const warningItems = [];

    requests.forEach((r) => {
      if (!r) return;
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status === "완료" || Boolean(deliveredAt || shippedAt);

      const estYmd = toKstYmd(est);
      const estMidnight = ymdToKstMidnight(estYmd);
      if (!estMidnight) return;

      const diffDays = Math.floor(
        (nowMidnight.getTime() - estMidnight.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysOverdue = diffDays > 0 ? diffDays : 0;
      const daysUntilDue = diffDays < 0 ? Math.abs(diffDays) : 0;

      if (!isDone) {
        if (diffDays > 0) {
          delayedItems.push({ r, est, daysOverdue, daysUntilDue });
        } else if (diffDays === 0 || diffDays === -1) {
          warningItems.push({ r, est, daysOverdue, daysUntilDue });
        }
      }
    });

    const totalWithEta = requests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const est = entry?.est
        ? entry.est
        : r?.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      const daysOverdue = entry?.daysOverdue || 0;
      const daysUntilDue = entry?.daysUntilDue || 0;

      const ci = r?.caseInfos || {};

      const requestorText =
        r?.requestor?.organization || r?.requestor?.name || "";
      const manufacturerText =
        r?.manufacturer?.organization || r?.manufacturer?.name || "";

      const secondaryText =
        req.user?.role === "manufacturer"
          ? requestorText
          : [requestorText, manufacturerText].filter(Boolean).join(" → ");

      const title =
        (r?.title || "").trim() ||
        [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
        r?.requestId ||
        "";

      const mm = est ? String(est.getMonth() + 1).padStart(2, "0") : "";
      const dd = est ? String(est.getDate()).padStart(2, "0") : "";
      const dueLabel = est ? `${mm}/${dd}` : "";

      let message = "";
      if (level === "danger") {
        message = `예상 도착일(${dueLabel}) 기준 ${daysOverdue}일 지연 중입니다.`;
      } else {
        message = `예상 도착일(${dueLabel})이 임박했습니다. (D-${daysUntilDue})`;
      }

      return {
        id: r?.requestId,
        title,
        manufacturer: secondaryText,
        riskLevel: level,
        status: r?.status,
        status2: r?.status2,
        dueDate: est ? est.toISOString().slice(0, 10) : null,
        daysOverdue,
        daysUntilDue,
        message,
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort((a, b) => (b?.daysOverdue || 0) - (a?.daysOverdue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort((a, b) => (a?.daysUntilDue || 0) - (b?.daysUntilDue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "warning")),
    ];

    return res.status(200).json({
      success: true,
      data: {
        riskSummary: {
          delayedCount,
          warningCount,
          onTimeRate,
          items: riskItems,
        },
      },
    });
  } catch (error) {
    console.error("Error in getDashboardRiskSummary:", error);
    return res.status(500).json({
      success: false,
      message: "지연 위험 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 가격/리퍼럴 통계 (의뢰자용)
 * @route GET /api/requests/my/pricing-referral-stats
 */
export async function getMyPricingReferralStats(req, res) {
  try {
    const requestorId = req.user._id;

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    const myLast30DaysOrders = await Request.countDocuments({
      requestor: requestorId,
      status: "완료",
      createdAt: { $gte: last30Cutoff },
    });

    const referredUsers = await User.find({
      referredByUserId: requestorId,
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

    const referralLast30DaysOrders = referredUserIds.length
      ? await Request.countDocuments({
          requestor: { $in: referredUserIds },
          status: "완료",
          createdAt: { $gte: last30Cutoff },
        })
      : 0;

    const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 10;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit
    );

    const user = await User.findById(requestorId)
      .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
      .lean();

    let rule = "volume_discount_last30days";
    let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);

    const dateSource = user || req.user;

    const baseDate =
      dateSource?.approvedAt ||
      (dateSource?.active ? dateSource?.updatedAt : null) ||
      dateSource?.createdAt;

    let fixedUntil = null;

    if (baseDate) {
      fixedUntil = new Date(baseDate);
      fixedUntil.setDate(fixedUntil.getDate() + 90);
      if (now < fixedUntil) {
        rule = "new_user_90days_fixed_10000";
        effectiveUnitPrice = 10000;
      }
    }

    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (process.env.NODE_ENV !== "production") {
      console.log("[pricing-referral-stats]", {
        requestorId: String(requestorId),
        isMockDevToken,
        now,
        baseDate,
        fixedUntil,
        userDates: user
          ? {
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              approvedAt: user.approvedAt,
              active: user.active,
            }
          : null,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        last30Cutoff,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        baseUnitPrice,
        discountPerOrder,
        maxDiscountPerUnit,
        discountAmount,
        effectiveUnitPrice,
        rule,
        ...(process.env.NODE_ENV !== "production"
          ? {
              debug: {
                requestorId,
                isMockDevToken,
                now,
                baseDate,
                fixedUntil,
                userDates: user
                  ? {
                      createdAt: user.createdAt,
                      updatedAt: user.updatedAt,
                      approvedAt: user.approvedAt,
                      active: user.active,
                    }
                  : null,
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("Error in getMyPricingReferralStats:", error);
    return res.status(500).json({
      success: false,
      message: "가격/리퍼럴 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
