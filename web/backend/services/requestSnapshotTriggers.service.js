// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/bulkShippingSnapshot.service.js
// change-log:
// - 2026-08-21: 대시보드 refresh는 스냅샷 삭제 없이 upsert 재계산(GET이 in-flight에 안 묶임).
// - 2026-08-19: 대시보드 카드 새로고침 때 출고예정 스냅샷도 같이 재계산(취소 후 stale 건수).
import { Types } from "mongoose";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { recomputePricingReferralSnapshotsForAffectedAnchorId } from "./pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "./pricingReferralOrderBucket.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "./bulkShippingSnapshot.service.js";
import {
  recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId,
} from "./requestorDashboardSummarySnapshot.service.js";
import { invalidateDashboardAndBulkCachesForBusinessAnchorId } from "./requestDashboardCache.service.js";
import { invalidateAdminReferralCachesForBusinessAnchorId } from "./adminReferralCache.service.js";

const normalizeAnchorId = (value) => String(value || "").trim();
const __dashboardSummaryRefreshInFlight = new Map();

const invalidateSalesmanAncestorTreeCachesForAnchorId = async (anchorId) => {
  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ referredByAnchorId: 1, businessType: 1 })
    .lean();
  if (String(anchor?.businessType || "") !== "requestor") return;

  const parentAnchorId = String(anchor?.referredByAnchorId || "").trim();
  if (!Types.ObjectId.isValid(parentAnchorId)) return;
  invalidateAdminReferralCachesForBusinessAnchorId(parentAnchorId);
};

const refreshPricingReferralAggregateForAnchorId = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return;

  invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);
  invalidateAdminReferralCachesForBusinessAnchorId(anchorId);
  void invalidateSalesmanAncestorTreeCachesForAnchorId(anchorId);

  void recomputePricingReferralSnapshotsForAffectedAnchorId(anchorId)
    .then((results) => {
      const affectedAnchorIds = Array.from(
        new Set(
          [
            anchorId,
            ...(results || []).map((row) =>
              String(row?.businessAnchorId || ""),
            ),
          ].filter((value) => Types.ObjectId.isValid(String(value || ""))),
        ),
      );

      for (const affectedAnchorId of affectedAnchorIds) {
        invalidateDashboardAndBulkCachesForBusinessAnchorId(affectedAnchorId);
        invalidateAdminReferralCachesForBusinessAnchorId(affectedAnchorId);
      }

      return Promise.all(
        affectedAnchorIds.map((affectedAnchorId) =>
          recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId(
            affectedAnchorId,
          ).catch((error) => {
            console.error(
              `[requestorDashboardSummarySnapshot] refreshPricingReferralAggregateForAnchorId failed${reason ? ` (${reason})` : ""}`,
              error,
            );
          }),
        ),
      );
    })
    .catch((error) => {
      console.error(
        `[pricingReferralSnapshot] triggerPricingSnapshotForBusinessAnchorId failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    });
};

export const requestReferralPricingAggregateRefresh = (
  businessAnchorId,
  reason = "",
) => {
  refreshPricingReferralAggregateForAnchorId(businessAnchorId, reason);
};

export const emitBusinessOrderAggregateChanged = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  void recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(anchorId)
    .then(() => {
      refreshPricingReferralAggregateForAnchorId(anchorId, reason);
    })
    .catch((error) => {
      console.error(
        `[pricingReferralOrderBucket] emitBusinessOrderAggregateChanged failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    });

  void recomputeBulkShippingSnapshotForBusinessAnchorId(anchorId).catch(
    (error) => {
      console.error(
        `[bulkShippingSnapshot] emitBusinessOrderAggregateChanged failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    },
  );
};

export const emitReferralMembershipChanged = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  refreshPricingReferralAggregateForAnchorId(anchorId, reason);
};

export const triggerPricingSnapshotForBusinessAnchorId = (
  businessAnchorId,
  reason = "",
) => {
  emitBusinessOrderAggregateChanged(businessAnchorId, reason);
};

export const triggerPricingSnapshotForReferrerAnchorId = (
  referrerAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(referrerAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  requestReferralPricingAggregateRefresh(anchorId, reason);
};

export const triggerPricingSnapshotForRequestDoc = (
  requestDoc,
  reason = "",
) => {
  const businessAnchorId = normalizeAnchorId(requestDoc?.businessAnchorId);
  if (!Types.ObjectId.isValid(businessAnchorId)) return;
  emitBusinessOrderAggregateChanged(businessAnchorId, reason);
};

export const triggerPricingSnapshotForUserDoc = async (
  userDoc,
  reason = "",
) => {
  const businessAnchorId = normalizeAnchorId(userDoc?.businessAnchorId);
  const referredByAnchorId = normalizeAnchorId(userDoc?.referredByAnchorId);

  if (
    Types.ObjectId.isValid(businessAnchorId) &&
    Types.ObjectId.isValid(referredByAnchorId)
  ) {
    emitReferralMembershipChanged(businessAnchorId, reason);
    return;
  }
  if (Types.ObjectId.isValid(businessAnchorId)) {
    emitBusinessOrderAggregateChanged(businessAnchorId, reason);
  }
};

export const triggerDashboardSummaryRefreshForAnchorId = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) {
    console.warn("[triggerDashboardSummaryRefresh] Invalid anchorId", {
      businessAnchorId,
      anchorId,
    });
    return Promise.resolve(null);
  }

  const previousRefresh =
    __dashboardSummaryRefreshInFlight.get(anchorId) || Promise.resolve(null);

  const nextRefresh = previousRefresh
    .catch(() => null)
    .then(async () => {
      // 메모리 캐시만 비우고 DB 스냅샷은 유지(stale-while-revalidate).
      // 예전처럼 당일 스냅샷을 먼저 지우면 GET이 in-flight를 기다리며 2s+ 걸린다.
      invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);

      const bulkRefresh = recomputeBulkShippingSnapshotForBusinessAnchorId(
        anchorId,
      ).catch((error) => {
        console.error(
          `[bulkShippingSnapshot] triggerDashboardSummaryRefreshForAnchorId failed${reason ? ` (${reason})` : ""}`,
          error,
        );
        return null;
      });

      const [results] = await Promise.all([
        recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId(
          anchorId,
        ),
        bulkRefresh,
      ]);

      invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);

      return results;
    })
    .catch((error) => {
      console.error(
        `[requestorDashboardSummarySnapshot] triggerDashboardSummaryRefreshForAnchorId failed${reason ? ` (${reason})` : ""}`,
        error,
      );
      throw error;
    })
    .finally(() => {
      if (__dashboardSummaryRefreshInFlight.get(anchorId) === nextRefresh) {
        __dashboardSummaryRefreshInFlight.delete(anchorId);
      }
    });

  __dashboardSummaryRefreshInFlight.set(anchorId, nextRefresh);
  return nextRefresh;
};

export const waitForDashboardSummaryRefreshForAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const inFlightRefresh = __dashboardSummaryRefreshInFlight.get(anchorId);
  if (!inFlightRefresh) return null;
  return inFlightRefresh;
};

export const triggerPricingSnapshotForUserId = async (userId, reason = "") => {
  const normalizedUserId = String(userId || "").trim();
  if (!Types.ObjectId.isValid(normalizedUserId)) return;

  const user = await User.findById(normalizedUserId)
    .select({ businessAnchorId: 1, referredByAnchorId: 1 })
    .lean();
  if (!user) return;

  await triggerPricingSnapshotForUserDoc(user, reason);
};
