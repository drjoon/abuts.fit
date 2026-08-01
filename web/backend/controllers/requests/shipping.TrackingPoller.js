// related files:
// - web/backend/rules.md
// - web/backend/models/jobLock.model.js
// - web/backend/utils/distributedJobLock.js
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
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
import { runWithJobLock } from "../../utils/distributedJobLock.js";

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const GLOBAL_POLL_INTERVAL_MS = Number(
  process.env.HANJIN_TRACKING_AUTO_SYNC_INTERVAL_MS || 60 * 60 * 1000,
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
let globalAutoSyncBlockedReason = null;
let globalAutoSyncNextRetryAt = null;

const HANJIN_AUTOSYNC_LOCK_NAME =
  process.env.HANJIN_TRACKING_AUTO_SYNC_LOCK_NAME ||
  "worker:hanjin-tracking-auto-sync";
const HANJIN_AUTOSYNC_OWNER_ID = `hanjin-auto-sync-${process.pid}-${Date.now()}`;
const HANJIN_AUTOSYNC_LOCK_LEASE_MS = Number(
  process.env.HANJIN_TRACKING_AUTO_SYNC_LOCK_LEASE_MS || 10 * 60 * 1000,
);
const HANJIN_AUTOSYNC_LOCK_HEARTBEAT_MS = Number(
  process.env.HANJIN_TRACKING_AUTO_SYNC_LOCK_HEARTBEAT_MS || 60 * 1000,
);

const KST_TIME_ZONE = "Asia/Seoul";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_RETRY_INTERVAL_MS = Number(
  process.env.HANJIN_TRACKING_AUTO_SYNC_RETRY_WEEKDAY_MS || HOUR_MS,
);

const resolveIntervalMs = (value, fallbackMs) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60 * 1000) return fallbackMs;
  return parsed;
};

const waitMs = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });

const getKstDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: String(map.weekday || "").trim(),
  };
};

const isKstWeekend = (date = new Date()) => {
  const { weekday } = getKstDateParts(date);
  return weekday === "Sat" || weekday === "Sun";
};

const msUntilNextKstWeekdayStart = (date = new Date()) => {
  const { year, month, day, weekday } = getKstDateParts(date);
  const daysUntilMonday = weekday === "Sat" ? 2 : 1;
  const kstStartOfTodayUtcMs = Date.UTC(year, month - 1, day, -9, 0, 0, 0);
  const nextMonday08UtcMs =
    kstStartOfTodayUtcMs + daysUntilMonday * DAY_MS + 8 * HOUR_MS;
  return Math.max(HOUR_MS, nextMonday08UtcMs - date.getTime());
};

const isHanjinApiKeyDeniedError = (error) => {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.data?.message || error?.message || "").trim();
  return status === 403 && /InvalidApiKeyForGivenResource/i.test(message);
};

const resolveBlockedRetryDelayMs = () => {
  if (isKstWeekend(new Date())) {
    return msUntilNextKstWeekdayStart(new Date());
  }
  const parsed = Number(WEEKDAY_RETRY_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < HOUR_MS) return HOUR_MS;
  return parsed;
};

const clearAutoSyncBlocked = () => {
  globalAutoSyncBlockedReason = null;
  globalAutoSyncNextRetryAt = null;
};

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
    const lockRun = await runWithJobLock({
      name: HANJIN_AUTOSYNC_LOCK_NAME,
      ownerId: HANJIN_AUTOSYNC_OWNER_ID,
      leaseMs: HANJIN_AUTOSYNC_LOCK_LEASE_MS,
      heartbeatMs: HANJIN_AUTOSYNC_LOCK_HEARTBEAT_MS,
      task: async () => {
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
        clearAutoSyncBlocked();
        return {
          skipped: false,
          reason: null,
          totalTargets: targets.length,
          syncedCount: Array.isArray(synced) ? synced.length : 0,
          synced,
        };
      },
    });

    if (!lockRun?.acquired) {
      return { skipped: true, reason: "lock_not_acquired", syncedCount: 0 };
    }

    return (
      lockRun?.result || {
        skipped: false,
        reason: null,
        syncedCount: 0,
      }
    );
  } catch (error) {
    if (isHanjinApiKeyDeniedError(error)) {
      globalAutoSyncBlockedReason = "invalid_api_key_for_resource";
      return {
        skipped: true,
        reason: globalAutoSyncBlockedReason,
        syncedCount: 0,
      };
    }
    throw error;
  } finally {
    globalSyncRunning = false;
  }
};

const scheduleGlobalTrackingSync = () => {
  if (globalTimer) {
    clearTimeout(globalTimer);
    globalTimer = null;
  }

  const normalIntervalMs = resolveIntervalMs(
    GLOBAL_POLL_INTERVAL_MS,
    POLL_INTERVAL_MS,
  );
  const blockedMode = Boolean(globalAutoSyncBlockedReason);
  const delayMs = blockedMode ? resolveBlockedRetryDelayMs() : normalIntervalMs;
  globalAutoSyncNextRetryAt = Date.now() + delayMs;

  if (blockedMode) {
    console.warn("[hanjinTrackingAutoSync] blocked mode active; retry scheduled", {
      reason: globalAutoSyncBlockedReason,
      retryInMs: delayMs,
      retryAt: new Date(globalAutoSyncNextRetryAt).toISOString(),
      schedule: "weekday-hourly-weekend-skip",
    });
  }

  globalTimer = setTimeout(async () => {
    try {
      await runHanjinTrackingAutoSyncOnce();
    } catch (error) {
      console.error("[hanjinTrackingAutoSync] run failed", error);
    } finally {
      scheduleGlobalTrackingSync();
    }
  }, delayMs);
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
    blockedReason: globalAutoSyncBlockedReason,
    nextRetryAt: globalAutoSyncNextRetryAt
      ? new Date(globalAutoSyncNextRetryAt).toISOString()
      : null,
  },
});
