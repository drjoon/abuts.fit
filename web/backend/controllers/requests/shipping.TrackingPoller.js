import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import hanjinService from "../../services/hanjin.service.js";
import {
  applyTrackingRowsToRequests,
  extractTrackingRows,
  hasPickupCompleted,
  resolveTrackingSyncTargets,
  HANJIN_CLIENT_ID,
} from "./shipping.Tracking.helpers.js";

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const activeTimers = new Map();

const buildKey = ({ requestIds = [], trackingNumbers = [] }) => {
  const ids = Array.isArray(requestIds)
    ? requestIds.map((v) => String(v || "").trim()).filter(Boolean).sort()
    : [];
  const numbers = Array.isArray(trackingNumbers)
    ? trackingNumbers.map((v) => String(v || "").trim()).filter(Boolean).sort()
    : [];
  return JSON.stringify({ requestIds: ids, trackingNumbers: numbers });
};

const stopTrackingPoll = (key) => {
  const timer = activeTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(key);
  }
};

const pollOnce = async ({ requestIds = [], trackingNumbers = [], actorUserId = null, source = "hanjin-tracking-poll" }) => {
  const targets = await resolveTrackingSyncTargets({ requestIds, trackingNumbers });
  if (!targets.length) {
    return { synced: [], shouldContinue: false };
  }

  const wblNoList = targets.map((requestDoc) => ({
    wblNo: String(requestDoc.deliveryInfoRef?.trackingNumber || "").trim(),
  }));

  const data = await hanjinService.requestOrderApi({
    path: "/parcel-delivery/v1/tracking/tracking-wbls",
    method: "POST",
    data: {
      custEdiCd: HANJIN_CLIENT_ID,
      wblNoList,
    },
  });

  const rows = extractTrackingRows(data);
  const rowMap = new Map(
    rows.map((row) => [String(row?.wblNo || row?.wbNo || "").trim(), row]),
  );

  const synced = await applyTrackingRowsToRequests({
    requestDocs: targets,
    rowMap,
    actorUserId,
    source,
  });

  const shouldContinue = synced.some((item) => !hasPickupCompleted(item?.statusCode));
  return { synced, shouldContinue };
};

const scheduleNextPoll = ({ key, requestIds, trackingNumbers, actorUserId, source }) => {
  stopTrackingPoll(key);
  const timer = setTimeout(async () => {
    try {
      const result = await pollOnce({
        requestIds,
        trackingNumbers,
        actorUserId,
        source,
      });
      if (result.shouldContinue) {
        scheduleNextPoll({ key, requestIds, trackingNumbers, actorUserId, source });
      } else {
        stopTrackingPoll(key);
      }
    } catch (error) {
      console.error("[hanjinTrackingPoller] poll failed", error);
      scheduleNextPoll({ key, requestIds, trackingNumbers, actorUserId, source });
    }
  }, POLL_INTERVAL_MS);
  activeTimers.set(key, timer);
};

export const startHanjinTrackingPoll = async ({
  requestIds = [],
  trackingNumbers = [],
  actorUserId = null,
  source = "hanjin-tracking-poll",
  runImmediate = false,
}) => {
  const key = buildKey({ requestIds, trackingNumbers });
  if (!key || key === JSON.stringify({ requestIds: [], trackingNumbers: [] })) {
    return { scheduled: false, synced: [] };
  }

  let synced = [];
  let shouldContinue = true;
  if (runImmediate) {
    const result = await pollOnce({ requestIds, trackingNumbers, actorUserId, source });
    synced = result.synced;
    shouldContinue = result.shouldContinue;
  }

  if (shouldContinue) {
    scheduleNextPoll({ key, requestIds, trackingNumbers, actorUserId, source });
    return { scheduled: true, synced };
  }

  stopTrackingPoll(key);
  return { scheduled: false, synced };
};

export const stopHanjinTrackingPoll = ({ requestIds = [], trackingNumbers = [] }) => {
  const key = buildKey({ requestIds, trackingNumbers });
  stopTrackingPoll(key);
};

export const getHanjinTrackingPollStatus = () => ({
  activeCount: activeTimers.size,
  keys: Array.from(activeTimers.keys()),
});
