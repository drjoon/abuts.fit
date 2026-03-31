import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  applyStatusMapping,
  applyShippingWorkflowState,
  REQUEST_STAGE_GROUPS,
  getRequestorOrgId,
  ensureReviewByStageDefaults,
  SHIPPING_WORKFLOW_CODES,
  SHIPPING_WORKFLOW_LABELS,
} from "./utils.js";
import {
  buildBulkShippingCandidates,
  buildShippingEstimate,
  buildShippingPackagesSummary,
  ensureShippingPackageForPickup,
} from "./shipping.Requestor.helpers.js";
import { triggerPricingSnapshotForBusinessAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import {
  getBulkShippingSnapshotForBusinessAnchorId,
  recomputeBulkShippingSnapshotForBusinessAnchorId,
} from "../../services/bulkShippingSnapshot.service.js";
import {
  getBulkShippingCacheValue,
  setBulkShippingCacheValue,
  withBulkShippingInFlight,
} from "../../services/requestDashboardCache.service.js";

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

    if (shippingMode !== "normal") {
      return res.status(400).json({
        success: false,
        message: "묶음 배송만 지원됩니다.",
      });
    }

    setImmediate(async () => {
      try {
        const { recalculateProductionSchedule } =
          await import("./production.utils.js");

        const requests = await Request.find({
          ...requestFilter,
          requestId: { $in: requestIds },
          status: "의뢰",
        });

        for (const req of requests) {
          const maxDiameter = req.caseInfos?.maxDiameter;
          const requestedAt = req.createdAt || new Date();

          let weeklyBatchDaysForSchedule = [];
          try {
            const orgId = getRequestorOrgId({ user: req.requestor });
            if (orgId && Types.ObjectId.isValid(orgId)) {
              const org = await BusinessAnchor.findById(orgId)
                .select({ "shippingPolicy.weeklyBatchDays": 1 })
                .lean();
              weeklyBatchDaysForSchedule = Array.isArray(
                org?.shippingPolicy?.weeklyBatchDays,
              )
                ? org.shippingPolicy.weeklyBatchDays
                : [];
            }
          } catch {}

          const newSchedule = recalculateProductionSchedule({
            currentStage: req.manufacturerStage,
            newShippingMode: shippingMode,
            maxDiameter,
            requestedAt,
            weeklyBatchDays: weeklyBatchDaysForSchedule,
          });

          if (!newSchedule) continue;

          req.finalShipping = {
            mode: shippingMode,
            updatedAt: new Date(),
          };
          req.shippingMode = shippingMode;
          req.productionSchedule = newSchedule;
          req.timeline = req.timeline || {};

          const pickupYmd = newSchedule?.scheduledShipPickup
            ? toKstYmd(newSchedule.scheduledShipPickup)
            : null;

          if (pickupYmd) {
            req.timeline.estimatedShipYmd = pickupYmd;
          } else {
            req.timeline.estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: toKstYmd(req.createdAt) || getTodayYmdInKst(),
              days: 1,
            });
          }

          await req.save();
        }

        console.log(`[Fire&Forget] Updated ${requests.length} shipping modes`);
      } catch (err) {
        console.error("[Fire&Forget] Error in shipping mode update:", err);
      }
    });

    return res.status(200).json({
      success: true,
      message: "배송 방식 변경이 처리 중입니다.",
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

export async function getMyShippingPackagesSummary(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: await buildShippingPackagesSummary(req),
    });
  } catch (error) {
    console.error("Error in getMyShippingPackagesSummary:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "발송 패키지 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getShippingEstimate(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: {
        estimatedShipYmd: await buildShippingEstimate(req),
      },
    });
  } catch (error) {
    console.error("[getShippingEstimate] error", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "발송 예정일 계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMyBulkShipping(req, res) {
  try {
    // JWT 토큰이 아닌 DB에서 최신 businessAnchorId 조회 (온보딩 완료 직후 대응)
    const User = (await import("../../models/user.model.js")).default;
    const freshUser = await User.findById(req.user?._id)
      .select({ businessAnchorId: 1 })
      .lean();
    const businessAnchorId = String(freshUser?.businessAnchorId || "").trim();
    const cacheKey = `bulk-shipping:${String(req.user?._id || "")}:${String(
      businessAnchorId,
    )}`;
    const hasBulkShippingItems = (value) => {
      const pre = Array.isArray(value?.pre) ? value.pre : [];
      const post = Array.isArray(value?.post) ? value.post : [];
      const waiting = Array.isArray(value?.waiting) ? value.waiting : [];
      return pre.length > 0 || post.length > 0 || waiting.length > 0;
    };

    const cached = getBulkShippingCacheValue(cacheKey);
    if (cached && hasBulkShippingItems(cached)) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const data = await withBulkShippingInFlight(cacheKey, async () => {
      const snapshot = businessAnchorId
        ? await getBulkShippingSnapshotForBusinessAnchorId(businessAnchorId)
        : null;

      if (snapshot) {
        const snapshotted = {
          pre: Array.isArray(snapshot.pre) ? snapshot.pre : [],
          post: Array.isArray(snapshot.post) ? snapshot.post : [],
          waiting: Array.isArray(snapshot.waiting) ? snapshot.waiting : [],
        };
        setBulkShippingCacheValue(cacheKey, snapshotted, 15 * 1000);
        return snapshotted;
      }

      const recomputed = businessAnchorId
        ? await recomputeBulkShippingSnapshotForBusinessAnchorId(
            businessAnchorId,
          )
        : await buildBulkShippingCandidates(req);
      const built = {
        pre: Array.isArray(recomputed?.pre) ? recomputed.pre : [],
        post: Array.isArray(recomputed?.post) ? recomputed.post : [],
        waiting: Array.isArray(recomputed?.waiting) ? recomputed.waiting : [],
      };
      setBulkShippingCacheValue(cacheKey, built, 15 * 1000);
      return built;
    });

    return res.status(200).json({
      success: true,
      data,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function registerShipment(req, res) {
  try {
    const { requestIds, trackingNumber, carrier = "hanjin" } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "운송장 번호가 필요합니다.",
      });
    }

    const requests = await Request.find({
      requestId: { $in: requestIds },
      manufacturerStage: "포장.발송",
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const pkg = await ensureShippingPackageForPickup({
      requests,
      actorUserId: req.user?._id || null,
    });
    const affectedBusinessAnchorId = String(pkg?.businessAnchorId || "").trim();

    const updatedIds = [];

    for (const r of requests) {
      const scheduledPickup = r.productionSchedule?.scheduledShipPickup
        ? new Date(r.productionSchedule.scheduledShipPickup)
        : null;
      const now = new Date();
      const actualShipPickup =
        scheduledPickup && !Number.isNaN(scheduledPickup.getTime())
          ? scheduledPickup
          : now;
      let deliveryInfo = null;
      if (r.deliveryInfoRef) {
        deliveryInfo = await DeliveryInfo.findById(r.deliveryInfoRef);
      }

      if (!deliveryInfo) {
        deliveryInfo = await DeliveryInfo.create({
          request: r._id,
          trackingNumber,
          carrier,
          shippedAt: actualShipPickup,
        });
        r.deliveryInfoRef = deliveryInfo._id;
      } else {
        deliveryInfo.trackingNumber = trackingNumber;
        deliveryInfo.carrier = carrier;
        if (!deliveryInfo.shippedAt) {
          deliveryInfo.shippedAt = actualShipPickup;
        }
        await deliveryInfo.save();
      }

      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "APPROVED",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      applyStatusMapping(r, "포장.발송");
      applyShippingWorkflowState(r, {
        code: SHIPPING_WORKFLOW_CODES.ACCEPTED,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.ACCEPTED],
        acceptedAt: actualShipPickup,
        canceledAt: null,
        source: "manual-shipment-register",
        updatedAt: actualShipPickup,
      });
      r.productionSchedule = r.productionSchedule || {};
      r.productionSchedule.actualShipPickup = actualShipPickup;
      r.shippingPackageId = pkg._id;

      await r.save();
      updatedIds.push(r.requestId);
    }

    if (affectedBusinessAnchorId) {
      triggerPricingSnapshotForBusinessAnchorId(
        affectedBusinessAnchorId,
        "register-shipment",
      );
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건의 의뢰가 발송 처리되었습니다.`,
      data: {
        updatedIds,
      },
    });
  } catch (error) {
    console.error("Error in registerShipment:", error);
    return res.status(500).json({
      success: false,
      message: "발송 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

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
      manufacturerStage: { $in: REQUEST_STAGE_GROUPS.bulkCreateEligible },
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
