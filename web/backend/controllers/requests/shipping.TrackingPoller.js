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
const GLOBAL_POLL_INTERVAL_MS = Number(
  process.env.HANJIN_TRACKING_AUTO_SYNC_INTERVAL_MS || 10 * 60 * 1000,
);
const TRACKING_BATCH_SIZE = Number(
  process.env.HANJIN_TRACKING_SYNC_BATCH_SIZE || 100,
);
const TRACKING_BATCH_DELAY_MS = Number(
  process.env.HANJIN_TRACKING_SYNC_BATCH_DELAY_MS || 120,
);
const activeTimers = new Map();
let globalTimer = null;
let globalSyncRunning = false;

const resolveIntervalMs = (value, fallbackMs) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60 * 1000) return fallbackMs;
  return parsed;
};

const waitMs = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });

const buildKey = ({ requestIds = [], trackingNumbers = [] }) => {
  const ids = Array.isArray(requestIds)
    ? requestIds
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .sort()
    : [];
  const numbers = Array.isArray(trackingNumbers)
    ? trackingNumbers
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .sort()
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

const syncTrackingForTargets = async ({
  targets = [],
  actorUserId = null,
  source = "hanjin-tracking-sync",
}) => {
  if (!Array.isArray(targets) || !targets.length) return [];

  const requestDocs = targets.filter((requestDoc) => {
    const trackingNumber = String(
      requestDoc?.deliveryInfoRef?.trackingNumber || "",
    ).trim();
    return Boolean(trackingNumber);
  });
  if (!requestDocs.length) return [];

  const batchSize = Number.isFinite(TRACKING_BATCH_SIZE)
    ? Math.max(1, Math.min(100, Math.floor(TRACKING_BATCH_SIZE)))
    : 100;
  const allSynced = [];

  for (let i = 0; i < requestDocs.length; i += batchSize) {
    const batch = requestDocs.slice(i, i + batchSize);
    const wblNoList = batch.map((requestDoc) => ({
      wblNo: String(requestDoc?.deliveryInfoRef?.trackingNumber || "").trim(),
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
      requestDocs: batch,
      rowMap,
      actorUserId,
      source,
    });
    allSynced.push(...(Array.isArray(synced) ? synced : []));

    if (i + batchSize < requestDocs.length) {
      await waitMs(TRACKING_BATCH_DELAY_MS);
    }
  }

  return allSynced;
};

const pollOnce = async ({
  requestIds = [],
  trackingNumbers = [],
  actorUserId = null,
  source = "hanjin-tracking-poll",
}) => {
  const targets = await resolveTrackingSyncTargets({
    requestIds,
    trackingNumbers,
  });
  if (!targets.length) {
    return { synced: [], shouldContinue: false };
  }

  const synced = await syncTrackingForTargets({
    targets,
    actorUserId,
    source,
  });

  const shouldContinue = synced.some(
    (item) => !hasPickupCompleted(item?.statusCode),
  );
  return { synced, shouldContinue };
};

const isAutoSyncTarget = (requestDoc) => {
  if (!requestDoc || typeof requestDoc !== "object") return false;
  const stage = String(requestDoc?.manufacturerStage || "").trim();
  if (stage !== "포장.발송" && stage !== "추적관리") return false;

  const workflowCode = String(requestDoc?.shippingWorkflow?.code || "").trim();
  if (workflowCode === "completed" || workflowCode === "canceled") return false;

  const deliveryInfo = requestDoc?.deliveryInfoRef;
  if (!deliveryInfo || typeof deliveryInfo !== "object") return false;
  if (deliveryInfo?.deliveredAt) return false;

  const trackingNumber = String(deliveryInfo?.trackingNumber || "").trim();
  if (!trackingNumber) return false;

  const trackingCode = String(
    deliveryInfo?.tracking?.lastStatusCode || "",
  ).trim();
  if (trackingCode === "66" || trackingCode === "03") return false;
  return true;
};

export const runHanjinTrackingAutoSyncOnce = async ({
  source = "hanjin-tracking-auto-sync",
} = {}) => {
  if (globalSyncRunning) {
    return { skipped: true, reason: "already_running", syncedCount: 0 };
  }
  if (!hanjinService.isConfigured()) {
    return { skipped: true, reason: "hanjin_not_configured", syncedCount: 0 };
  }

  globalSyncRunning = true;
  try {
    const allTargets = await resolveTrackingSyncTargets({});
    const targets = allTargets.filter(isAutoSyncTarget);
    if (!targets.length) {
      return { skipped: false, reason: "no_targets", syncedCount: 0 };
    }

    const synced = await syncTrackingForTargets({
      targets,
      actorUserId: null,
      source,
    });
    return {
      skipped: false,
      reason: null,
      totalTargets: targets.length,
      syncedCount: Array.isArray(synced) ? synced.length : 0,
      synced,
    };
  } finally {
    globalSyncRunning = false;
  }
};

const scheduleGlobalTrackingSync = () => {
  if (globalTimer) {
    clearTimeout(globalTimer);
    globalTimer = null;
  }
  const intervalMs = resolveIntervalMs(
    GLOBAL_POLL_INTERVAL_MS,
    POLL_INTERVAL_MS,
  );
  globalTimer = setTimeout(async () => {
    try {
      await runHanjinTrackingAutoSyncOnce();
    } catch (error) {
      console.error("[hanjinTrackingAutoSync] run failed", error);
    } finally {
      scheduleGlobalTrackingSync();
    }
  }, intervalMs);
  if (typeof globalTimer?.unref === "function") {
    globalTimer.unref();
  }
};

export const startHanjinTrackingAutoSyncWorker = ({
  runImmediate = true,
} = {}) => {
  const enabled =
    String(process.env.HANJIN_TRACKING_AUTO_SYNC_ENABLED || "true")
      .trim()
      .toLowerCase() !== "false";

  if (!enabled) {
    console.log(
      "[hanjinTrackingAutoSync] disabled by HANJIN_TRACKING_AUTO_SYNC_ENABLED",
    );
    return false;
  }

  scheduleGlobalTrackingSync();

  if (runImmediate) {
    void runHanjinTrackingAutoSyncOnce()
      .then(() => {})
      .catch((error) => {
        console.error("[hanjinTrackingAutoSync] immediate run failed", error);
      });
  }

  return true;
};

export const stopHanjinTrackingAutoSyncWorker = () => {
  if (!globalTimer) return;
  clearTimeout(globalTimer);
  globalTimer = null;
};

const scheduleNextPoll = ({
  key,
  requestIds,
  trackingNumbers,
  actorUserId,
  source,
}) => {
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
        scheduleNextPoll({
          key,
          requestIds,
          trackingNumbers,
          actorUserId,
          source,
        });
      } else {
        stopTrackingPoll(key);
      }
    } catch (error) {
      console.error("[hanjinTrackingPoller] poll failed", error);
      scheduleNextPoll({
        key,
        requestIds,
        trackingNumbers,
        actorUserId,
        source,
      });
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
    const result = await pollOnce({
      requestIds,
      trackingNumbers,
      actorUserId,
      source,
    });
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

export const stopHanjinTrackingPoll = ({
  requestIds = [],
  trackingNumbers = [],
}) => {
  const key = buildKey({ requestIds, trackingNumbers });
  stopTrackingPoll(key);
};

export const getHanjinTrackingPollStatus = () => ({
  activeCount: activeTimers.size,
  keys: Array.from(activeTimers.keys()),
  autoSync: {
    enabled:
      String(process.env.HANJIN_TRACKING_AUTO_SYNC_ENABLED || "true")
        .trim()
        .toLowerCase() !== "false",
    intervalMs: resolveIntervalMs(GLOBAL_POLL_INTERVAL_MS, POLL_INTERVAL_MS),
    running: globalSyncRunning,
    scheduled: Boolean(globalTimer),
  },
});
