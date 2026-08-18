// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/requestSnapshotTriggers.service.js
// - web/backend/controllers/requests/shipping.Requestor.controller.js
// change-log:
// - 2026-08-19: 취소 직후 stale 출고예정 건수 — in-flight 재계산 대기 + 당일 스냅샷 삭제 후 재기록.
import { Types } from "mongoose";
import BulkShippingSnapshot from "../models/bulkShippingSnapshot.model.js";
import { buildBulkShippingCandidatesForBusinessAnchorId } from "../controllers/requests/shipping.Requestor.helpers.js";
import { getTodayYmdInKst } from "../controllers/requests/utils.js";
import { invalidateDashboardAndBulkCachesForBusinessAnchorId } from "./requestDashboardCache.service.js";

const __bulkShippingRefreshInFlight = new Map();

const normalizeAnchorId = (value) => String(value || "").trim();

const toSnapshotPayload = (data, anchorId, ymd) => ({
  businessAnchorId: anchorId,
  ymd,
  pre: Array.isArray(data?.pre) ? data.pre : [],
  post: Array.isArray(data?.post) ? data.post : [],
  waiting: Array.isArray(data?.waiting) ? data.waiting : [],
});

const recomputeBulkShippingSnapshotOnce = async (anchorId) => {
  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  // bulk shipping은 DB snapshot과 in-memory cache를 같이 쓰므로,
  // 재계산 전 당일 스냅샷을 지우고 캐시도 비워야 GET이 예전 건수를 재삽입하지 않는다.
  invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);

  const snapshotBusinessAnchorId = new Types.ObjectId(anchorId);
  await BulkShippingSnapshot.deleteMany({
    businessAnchorId: snapshotBusinessAnchorId,
    ymd,
  });

  const data = await buildBulkShippingCandidatesForBusinessAnchorId(anchorId);
  const payload = toSnapshotPayload(data, snapshotBusinessAnchorId, ymd);

  await BulkShippingSnapshot.findOneAndUpdate(
    { businessAnchorId: snapshotBusinessAnchorId, ymd },
    {
      $set: {
        ...payload,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);

  return toSnapshotPayload(data, anchorId, ymd);
};

export const recomputeBulkShippingSnapshotForBusinessAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const previousRefresh =
    __bulkShippingRefreshInFlight.get(anchorId) || Promise.resolve(null);

  const nextRefresh = previousRefresh
    .catch(() => null)
    .then(() => recomputeBulkShippingSnapshotOnce(anchorId))
    .finally(() => {
      if (__bulkShippingRefreshInFlight.get(anchorId) === nextRefresh) {
        __bulkShippingRefreshInFlight.delete(anchorId);
      }
    });

  __bulkShippingRefreshInFlight.set(anchorId, nextRefresh);
  return nextRefresh;
};

export const waitForBulkShippingSnapshotRefreshForAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const inFlightRefresh = __bulkShippingRefreshInFlight.get(anchorId);
  if (!inFlightRefresh) return null;
  return inFlightRefresh;
};

export const getBulkShippingSnapshotForBusinessAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  return BulkShippingSnapshot.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    ymd,
  })
    .select({
      businessAnchorId: 1,
      ymd: 1,
      pre: 1,
      post: 1,
      waiting: 1,
      computedAt: 1,
    })
    .lean();
};
