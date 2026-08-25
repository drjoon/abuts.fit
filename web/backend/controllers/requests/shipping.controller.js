// - 2026-08-17: 배송비는 우편함 집하(비우기) 시 1회 차감 → 2026-08-26: 포장.발송 진입 시 commit(집하는 패키지 연결만).
// - 2026-08-17: PTX 직납 수취인(shippingReceiver) 주소 스냅샷 수정 API.
// - 2026-08-11: mailbox-requests 성능 — exact mailboxAddress, lean+batch hydrate, 15s 캐시, requestIds 단축 경로
// - 2026-08-04: 수동 집하 pickedUpAt/deliveredAt을 당일 16:00 고정 → 실제 처리 시각(now)으로 기록
// - 2026-08-04: 오늘 발송 체크 해제 시 originalEstimatedShipYmd로 발송일 복원 + mailbox-summary 캐시 무효화
// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/shipping.Tracking.helpers.js
// - web/backend/controllers/requests/shipping.TrackingPoller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxManagement.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
import Request from "../../models/request.model.js";
import { Types } from "mongoose";
import { createHash } from "crypto";

import {
  applyStatusMapping,
  applyShippingWorkflowState,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
  SHIPPING_WORKFLOW_CODES,
  SHIPPING_WORKFLOW_LABELS,
  buildManufacturerOrgScopeFilter,
  normalizeWorksheetRequestForResponse,
} from "./utils.js";

import { emitDeliveryUpdated, canonicalizeHanjinWblNo } from "./shipping.Tracking.helpers.js";
import { startHanjinTrackingPoll } from "./shipping.TrackingPoller.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { cancelHanjinPickupForReset } from "./shipping.Hanjin.controller.js";
import { triggerPricingSnapshotForBusinessAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { ensureShippingFeeSpendOnMailboxPickup } from "./common.review.helpers.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";

function resolveShippingBoxKey(requestDoc) {
  const shippingPackageId = String(requestDoc?.shippingPackageId || "").trim();
  if (shippingPackageId) return `pkg:${shippingPackageId}`;
  const mailboxAddress = String(requestDoc?.mailboxAddress || "").trim();
  if (mailboxAddress) return `mailbox:${mailboxAddress}`;
  return "";
}

function buildRequestsByShippingBox(requests = []) {
  const byBox = new Map();
  for (const requestDoc of requests) {
    const boxKey = resolveShippingBoxKey(requestDoc);
    if (!boxKey) continue;
    if (!byBox.has(boxKey)) {
      byBox.set(boxKey, []);
    }
    byBox.get(boxKey).push(requestDoc);
  }
  return byBox;
}

function buildShippingBoxesByMailbox(requests = []) {
  const byMailbox = new Map();
  const byBox = buildRequestsByShippingBox(requests);
  for (const group of byBox.values()) {
    const mailboxAddress = String(group?.[0]?.mailboxAddress || "").trim();
    if (!mailboxAddress) continue;
    if (!byMailbox.has(mailboxAddress)) {
      byMailbox.set(mailboxAddress, []);
    }
    byMailbox.get(mailboxAddress).push(group);
  }
  return byMailbox;
}

function resolveMailboxTrackingNumber(group = [], prefix, now) {
  for (const requestDoc of group) {
    const candidate = String(
      requestDoc?.deliveryInfoRef?.trackingNumber || "",
    ).trim();
    if (candidate) return candidate;
  }

  const fallbackPackageId = String(
    group?.[0]?.shippingPackageId || group?.[0]?.mailboxAddress || "BOX",
  ).trim();
  return `${prefix}-${fallbackPackageId}-${now.getTime()}`;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = {
  sun: "일",
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
};

const MAILBOX_SUMMARY_CACHE_TTL_MS = Number(
  process.env.MAILBOX_SUMMARY_CACHE_TTL_MS || 3600000,
);
const MAILBOX_SUMMARY_CACHE_MAX_ENTRIES = Number(
  process.env.MAILBOX_SUMMARY_CACHE_MAX_ENTRIES || 200,
);
const mailboxSummaryCache = new Map();

const MAILBOX_REQUESTS_CACHE_TTL_MS = Number(
  process.env.MAILBOX_REQUESTS_CACHE_TTL_MS || 15000,
);
const MAILBOX_REQUESTS_CACHE_MAX_ENTRIES = Number(
  process.env.MAILBOX_REQUESTS_CACHE_MAX_ENTRIES || 300,
);
const mailboxRequestsCache = new Map();

const MAILBOX_REQUESTS_SELECT = {
  requestId: 1,
  manufacturerStage: 1,
  createdAt: 1,
  lotNumber: 1,
  mailboxAddress: 1,
  shippingPackageId: 1,
  shippingWorkflow: 1,
  shippingLabelPrinted: 1,
  businessAnchorId: 1,
  referenceIds: 1,
  source: 1,
  "rnd.doneAt": 1,
  "rnd.doneFromStage": 1,
  "rnd.memo": 1,
  "rnd.memoUpdatedAt": 1,
  "rnd.memoUpdatedBy": 1,
  description: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  "caseInfos.anodizingEnabled": 1,
  "caseInfos.connectionDiameter": 1,
  "caseInfos.implantManufacturer": 1,
  "caseInfos.implantBrand": 1,
  "caseInfos.implantFamily": 1,
  "caseInfos.implantType": 1,
  "caseInfos.rollbackCounts": 1,
  "timeline.forceTodayShipment": 1,
  "timeline.estimatedShipYmd": 1,
  "timeline.nextEstimatedShipYmd": 1,
  shippingReceiver: 1,
  "partnerBilling.relatedPracticeTransferId": 1,
  "partnerBilling.practiceBusinessAnchorId": 1,
  "timeline.originalEstimatedShipYmd": 1,
  requestor: 1,
  deliveryInfoRef: 1,
};

function resolveMailboxSummaryCacheTtlMs() {
  const ttl = Number(MAILBOX_SUMMARY_CACHE_TTL_MS);
  if (!Number.isFinite(ttl) || ttl < 0) return 3600000;
  return ttl;
}

function pruneMailboxSummaryCache() {
  const now = Date.now();
  for (const [key, entry] of mailboxSummaryCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      mailboxSummaryCache.delete(key);
    }
  }

  const maxEntries = Number.isFinite(MAILBOX_SUMMARY_CACHE_MAX_ENTRIES)
    ? Math.max(10, Math.floor(MAILBOX_SUMMARY_CACHE_MAX_ENTRIES))
    : 200;

  if (mailboxSummaryCache.size <= maxEntries) return;

  const overflow = mailboxSummaryCache.size - maxEntries;
  const keys = Array.from(mailboxSummaryCache.keys());
  for (let i = 0; i < overflow; i += 1) {
    mailboxSummaryCache.delete(keys[i]);
  }
}

function resolveMailboxRequestsCacheTtlMs() {
  const ttl = Number(MAILBOX_REQUESTS_CACHE_TTL_MS);
  if (!Number.isFinite(ttl) || ttl < 0) return 15000;
  return ttl;
}

function pruneMailboxRequestsCache() {
  const now = Date.now();
  for (const [key, entry] of mailboxRequestsCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      mailboxRequestsCache.delete(key);
    }
  }

  const maxEntries = Number.isFinite(MAILBOX_REQUESTS_CACHE_MAX_ENTRIES)
    ? Math.max(20, Math.floor(MAILBOX_REQUESTS_CACHE_MAX_ENTRIES))
    : 300;

  if (mailboxRequestsCache.size <= maxEntries) return;

  const overflow = mailboxRequestsCache.size - maxEntries;
  const keys = Array.from(mailboxRequestsCache.keys());
  for (let i = 0; i < overflow; i += 1) {
    mailboxRequestsCache.delete(keys[i]);
  }
}

function buildMailboxRequestsCacheKey(req, mailboxAddress) {
  const role = String(req?.user?.role || "").trim();
  const businessAnchorId = String(req?.user?.businessAnchorId || "").trim();
  const userId = String(req?.user?._id || "").trim();
  const scope =
    role === "manufacturer"
      ? `manufacturer:${businessAnchorId || userId}`
      : `${role || "unknown"}:${businessAnchorId || userId || "global"}`;
  return `${scope}:${mailboxAddress}`;
}

function buildMailboxSummaryCacheKey(req) {
  const role = String(req?.user?.role || "").trim();
  const businessAnchorId = String(req?.user?.businessAnchorId || "").trim();
  const userId = String(req?.user?._id || "").trim();
  if (role === "manufacturer") {
    return `manufacturer:${businessAnchorId || userId}`;
  }
  return `${role || "unknown"}:${businessAnchorId || userId || "global"}`;
}

function buildEtagFromPayload(payload) {
  const raw = JSON.stringify(payload || {});
  const hash = createHash("sha1").update(raw).digest("hex");
  return `W/"mailbox-summary-${hash}"`;
}

function applyMailboxSummaryCacheHeaders(res, etag, ttlMs) {
  const maxAge = Math.max(0, Math.floor(ttlMs / 1000));
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}, must-revalidate`);
  res.setHeader("Vary", "Authorization");
}

function isNotModified(req, etag) {
  const candidate = String(req?.headers?.["if-none-match"] || "").trim();
  return Boolean(candidate && etag && candidate === etag);
}

function getKstDayKey(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return DAY_KEYS[kst.getUTCDay()] || "";
}

function normalizeDays(raw) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((v) =>
          String(v || "")
            .trim()
            .toLowerCase(),
        )
        .filter((v) => DAY_KEYS.includes(v)),
    ),
  );
}

function getNextShippingDayKey(days = [], todayKey = getKstDayKey()) {
  const valid = normalizeDays(days);
  if (!valid.length) return null;
  if (valid.includes(todayKey)) return null;
  const todayIdx = DAY_KEYS.indexOf(todayKey);
  if (todayIdx < 0) return valid[0] || null;

  let best = null;
  let bestDiff = 8;
  for (const d of valid) {
    const idx = DAY_KEYS.indexOf(d);
    if (idx < 0) continue;
    const diff = (idx - todayIdx + 7) % 7 || 7;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

function getTrackingStatusCode(requestDoc) {
  const fromWorkflow = String(
    requestDoc?.shippingWorkflow?.trackingStatusCode || "",
  ).trim();
  if (fromWorkflow) return fromWorkflow;
  return String(
    requestDoc?.deliveryInfoRef?.tracking?.lastStatusCode || "",
  ).trim();
}

function isPrePickupTrackingRequest(requestDoc) {
  const stage = String(requestDoc?.manufacturerStage || "").trim();
  if (stage !== "추적관리") return false;

  const di =
    requestDoc?.deliveryInfoRef &&
    typeof requestDoc.deliveryInfoRef === "object"
      ? requestDoc.deliveryInfoRef
      : null;
  if (!di) return false;

  const statusCode = Number(getTrackingStatusCode(requestDoc));
  const isCanceled =
    String(di?.tracking?.lastStatusText || "").trim() === "예약취소";
  const hasPickupReservation = Boolean(
    di?.trackingNumber || di?.shippedAt || di?.tracking?.lastStatusText,
  );

  return (
    hasPickupReservation &&
    !di?.deliveredAt &&
    !isCanceled &&
    (!Number.isFinite(statusCode) || statusCode < 11)
  );
}

function resolveMailboxShippingDayInfo({
  weeklyBatchDays = [],
  forceTodayShipment = false,
  hasExpress = false,
}) {
  if (forceTodayShipment || hasExpress) {
    return { notToday: false, nextDayLabel: null };
  }

  const days = normalizeDays(weeklyBatchDays);
  if (!days.length) return { notToday: false, nextDayLabel: null };

  const todayKey = getKstDayKey();
  if (days.includes(todayKey)) {
    return { notToday: false, nextDayLabel: null };
  }

  const next = getNextShippingDayKey(days, todayKey);
  return {
    notToday: true,
    nextDayLabel: (next && DAY_LABELS[next]) || null,
  };
}

export async function getShippingMailboxSummary(req, res) {
  const perfStartedAt = Date.now();
  try {
    pruneMailboxSummaryCache();

    const cacheKey = buildMailboxSummaryCacheKey(req);
    const forceRefresh =
      String(req?.query?.refresh || "").trim() === "1" ||
      String(req?.query?.refresh || "")
        .trim()
        .toLowerCase() === "true";
    const now = Date.now();
    const cacheHit = mailboxSummaryCache.get(cacheKey);
    if (!forceRefresh && cacheHit && Number(cacheHit.expiresAt || 0) > now) {
      applyMailboxSummaryCacheHeaders(
        res,
        String(cacheHit.etag || ""),
        resolveMailboxSummaryCacheTtlMs(),
      );
      if (!forceRefresh && isNotModified(req, String(cacheHit.etag || ""))) {
        console.info("[shipping][mailbox-summary][perf]", {
          cache: "memory-hit-304",
          status: 304,
          totalMs: Date.now() - perfStartedAt,
          mailboxCount: Number(cacheHit?.payload?.mailboxes?.length || 0),
          totalRequests: Number(cacheHit?.payload?.totalRequests || 0),
        });
        return res.status(304).end();
      }
      console.info("[shipping][mailbox-summary][perf]", {
        cache: "memory-hit",
        status: 200,
        totalMs: Date.now() - perfStartedAt,
        mailboxCount: Number(cacheHit?.payload?.mailboxes?.length || 0),
        totalRequests: Number(cacheHit?.payload?.totalRequests || 0),
      });
      return res.status(200).json({
        success: true,
        data: cacheHit.payload,
        cached: true,
      });
    }

    const role = String(req.user?.role || "").trim();
    const orgScope =
      role === "manufacturer" ? await buildManufacturerOrgScopeFilter(req) : {};

    const baseFilter = {
      ...orgScope,
      mailboxAddress: { $exists: true, $type: "string", $ne: "" },
      manufacturerStage: { $in: ["포장.발송", "추적관리"] },
    };

    const requestsFetchStartedAt = Date.now();
    const [packingDocs, trackingDocs] = await Promise.all([
      Request.find({ ...baseFilter, manufacturerStage: "포장.발송" })
        .select({
          requestId: 1,
          manufacturerStage: 1,
          mailboxAddress: 1,
          shippingPackageId: 1,
          "shippingWorkflow.code": 1,
          "shippingLabelPrinted.printed": 1,
          "timeline.forceTodayShipment": 1,
          "timeline.estimatedShipYmd": 1,
          shippingMode: 1,
          "finalShipping.mode": 1,
          "originalShipping.mode": 1,
          businessAnchorId: 1,
        })
        .lean(),
      Request.find({
        ...baseFilter,
        manufacturerStage: "추적관리",
        deliveryInfoRef: { $exists: true, $ne: null },
        "shippingWorkflow.code": {
          $nin: ["picked_up", "completed", "canceled"],
        },
      })
        .select({
          requestId: 1,
          manufacturerStage: 1,
          mailboxAddress: 1,
          shippingPackageId: 1,
          "shippingWorkflow.code": 1,
          "shippingWorkflow.trackingStatusCode": 1,
          "shippingLabelPrinted.printed": 1,
          "timeline.forceTodayShipment": 1,
          "timeline.estimatedShipYmd": 1,
          shippingMode: 1,
          "finalShipping.mode": 1,
          "originalShipping.mode": 1,
          deliveryInfoRef: 1,
          businessAnchorId: 1,
        })
        .lean(),
    ]);
    const requestsQueryMs = Date.now() - requestsFetchStartedAt;

    const prePickupTrackingCandidates = trackingDocs.filter((doc) => {
      const workflowCode = String(doc?.shippingWorkflow?.code || "").trim();
      // 집하 이후/완료/취소 상태는 delivery 조회 없이 제외 가능
      if (
        workflowCode === "picked_up" ||
        workflowCode === "completed" ||
        workflowCode === "canceled"
      ) {
        return false;
      }

      const statusCode = Number(doc?.shippingWorkflow?.trackingStatusCode);
      if (Number.isFinite(statusCode) && statusCode >= 11) {
        return false;
      }

      return true;
    });

    const deliveryFetchStartedAt = Date.now();
    const trackingDeliveryIds = Array.from(
      new Set(
        prePickupTrackingCandidates
          .map((doc) => String(doc?.deliveryInfoRef || "").trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const deliveryDocs = trackingDeliveryIds.length
      ? await DeliveryInfo.find({ _id: { $in: trackingDeliveryIds } })
          .select(
            "shippedAt deliveredAt trackingNumber tracking.lastStatusCode tracking.lastStatusText",
          )
          .lean()
      : [];
    const deliveryQueryMs = Date.now() - deliveryFetchStartedAt;

    const deliveryById = new Map(
      deliveryDocs.map((item) => [String(item?._id || "").trim(), item]),
    );

    const processStartedAt = Date.now();
    const byMailbox = new Map();

    const upsertSummary = (requestDoc) => {
      const mailboxAddress = String(requestDoc?.mailboxAddress || "")
        .trim()
        .toUpperCase();
      if (!mailboxAddress) return;

      if (!byMailbox.has(mailboxAddress)) {
        byMailbox.set(mailboxAddress, {
          mailboxAddress,
          requestCount: 0,
          requestIds: [],
          shippingPackageIds: new Set(),
          workflowCodes: new Set(),
          printed: false,
          forceTodayShipment: false,
          hasExpress: false,
          earliestEstimatedShipYmd: null,
          weeklyBatchDays: [],
          anchorIds: new Set(),
        });
      }

      const summary = byMailbox.get(mailboxAddress);
      summary.requestCount += 1;

      const requestId = String(requestDoc?.requestId || "").trim();
      if (requestId) summary.requestIds.push(requestId);

      const shippingPackageId = String(
        requestDoc?.shippingPackageId || "",
      ).trim();
      if (shippingPackageId) summary.shippingPackageIds.add(shippingPackageId);

      const workflowCode = String(
        requestDoc?.shippingWorkflow?.code || "",
      ).trim();
      if (workflowCode) summary.workflowCodes.add(workflowCode);

      if (Boolean(requestDoc?.shippingLabelPrinted?.printed)) {
        summary.printed = true;
      }

      if (Boolean(requestDoc?.timeline?.forceTodayShipment)) {
        summary.forceTodayShipment = true;
      }

      const shippingMode =
        requestDoc?.finalShipping?.mode === "express" ||
        requestDoc?.originalShipping?.mode === "express" ||
        requestDoc?.shippingMode === "express"
          ? "express"
          : "normal";
      if (shippingMode === "express") {
        summary.hasExpress = true;
      }

      const ymd = String(requestDoc?.timeline?.estimatedShipYmd || "").trim();
      if (ymd) {
        if (
          !summary.earliestEstimatedShipYmd ||
          ymd < summary.earliestEstimatedShipYmd
        ) {
          summary.earliestEstimatedShipYmd = ymd;
        }
      }

      const anchorId = String(requestDoc?.businessAnchorId || "").trim();
      if (Types.ObjectId.isValid(anchorId)) {
        summary.anchorIds.add(anchorId);
      }
    };

    for (const requestDoc of packingDocs) {
      upsertSummary(requestDoc);
    }

    for (const requestDoc of prePickupTrackingCandidates) {
      const deliveryId = String(requestDoc?.deliveryInfoRef || "").trim();
      const deliveryInfo = deliveryId ? deliveryById.get(deliveryId) : null;
      const mergedTrackingDoc = {
        ...requestDoc,
        deliveryInfoRef: deliveryInfo || null,
      };
      if (!isPrePickupTrackingRequest(mergedTrackingDoc)) continue;
      upsertSummary(mergedTrackingDoc);
    }

    const anchorFetchStartedAt = Date.now();
    const neededAnchorIds = Array.from(
      new Set(
        Array.from(byMailbox.values()).flatMap((item) =>
          Array.from(item.anchorIds || []),
        ),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const anchors = neededAnchorIds.length
      ? await BusinessAnchor.find({ _id: { $in: neededAnchorIds } })
          .select("shippingPolicy.weeklyBatchDays")
          .lean()
      : [];
    const anchorQueryMs = Date.now() - anchorFetchStartedAt;

    const anchorById = new Map(
      anchors.map((item) => [String(item?._id || "").trim(), item]),
    );

    for (const item of byMailbox.values()) {
      if (item.weeklyBatchDays?.length) continue;
      for (const anchorId of item.anchorIds || []) {
        const anchor = anchorById.get(String(anchorId || "").trim());
        const days = normalizeDays(anchor?.shippingPolicy?.weeklyBatchDays);
        if (!days.length) continue;
        item.weeklyBatchDays = days;
        break;
      }
    }

    const mailboxes = Array.from(byMailbox.values())
      .map((item) => ({
        mailboxAddress: item.mailboxAddress,
        requestCount: item.requestCount,
        requestIds: item.requestIds,
        shippingPackageIds: Array.from(item.shippingPackageIds),
        workflowCodes: Array.from(item.workflowCodes),
        printed: item.printed,
        forceTodayShipment: item.forceTodayShipment,
        earliestEstimatedShipYmd: item.earliestEstimatedShipYmd,
        shippingDayInfo: resolveMailboxShippingDayInfo({
          weeklyBatchDays: item.weeklyBatchDays,
          forceTodayShipment: item.forceTodayShipment,
          hasExpress: item.hasExpress,
        }),
      }))
      .sort((a, b) => a.mailboxAddress.localeCompare(b.mailboxAddress));

    const payload = {
      mailboxes,
      totalRequests: mailboxes.reduce(
        (acc, item) => acc + Number(item.requestCount || 0),
        0,
      ),
    };
    const processMs = Date.now() - processStartedAt;

    const etag = buildEtagFromPayload(payload);
    const ttlMs = resolveMailboxSummaryCacheTtlMs();
    mailboxSummaryCache.set(cacheKey, {
      payload,
      etag,
      expiresAt: Date.now() + ttlMs,
    });

    applyMailboxSummaryCacheHeaders(res, etag, ttlMs);
    if (!forceRefresh && isNotModified(req, etag)) {
      console.info("[shipping][mailbox-summary][perf]", {
        cache: "miss-built-304",
        status: 304,
        requestsQueryMs,
        deliveryQueryMs,
        anchorQueryMs,
        processMs,
        totalMs: Date.now() - perfStartedAt,
        packingCount: packingDocs.length,
        trackingCount: trackingDocs.length,
        mailboxCount: payload.mailboxes.length,
        totalRequests: payload.totalRequests,
      });
      return res.status(304).end();
    }

    console.info("[shipping][mailbox-summary][perf]", {
      cache: forceRefresh ? "force-refresh" : "miss",
      status: 200,
      requestsQueryMs,
      deliveryQueryMs,
      anchorQueryMs,
      processMs,
      totalMs: Date.now() - perfStartedAt,
      packingCount: packingDocs.length,
      trackingCount: trackingDocs.length,
      mailboxCount: payload.mailboxes.length,
      totalRequests: payload.totalRequests,
    });

    return res.status(200).json({
      success: true,
      data: payload,
      cached: false,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "우편함 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getShippingMailboxRequests(req, res) {
  const perfStartedAt = Date.now();
  try {
    pruneMailboxRequestsCache();

    const mailboxAddress = String(req.query?.mailboxAddress || "")
      .trim()
      .toUpperCase();
    if (!mailboxAddress) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const forceRefresh =
      String(req?.query?.refresh || "").trim() === "1" ||
      String(req?.query?.refresh || "")
        .trim()
        .toLowerCase() === "true";

    const cacheKey = buildMailboxRequestsCacheKey(req, mailboxAddress);
    const now = Date.now();
    const cacheHit = mailboxRequestsCache.get(cacheKey);
    if (!forceRefresh && cacheHit && Number(cacheHit.expiresAt || 0) > now) {
      console.info("[shipping][mailbox-requests][perf]", {
        cache: "memory-hit",
        status: 200,
        totalMs: Date.now() - perfStartedAt,
        mailboxAddress,
        requestCount: Array.isArray(cacheHit?.payload?.requests)
          ? cacheHit.payload.requests.length
          : 0,
      });
      return res.status(200).json({
        success: true,
        data: cacheHit.payload,
        cached: true,
      });
    }

    const role = String(req.user?.role || "").trim();
    const orgScopeStartedAt = Date.now();
    const orgScope =
      role === "manufacturer" ? await buildManufacturerOrgScopeFilter(req) : {};
    const orgScopeMs = Date.now() - orgScopeStartedAt;

    const requestIds = Array.from(
      new Set(
        String(req.query?.requestIds || "")
          .split(",")
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 200);

    const mailboxFilter = {
      ...orgScope,
      mailboxAddress,
      manufacturerStage: { $in: ["포장.발송", "추적관리"] },
    };

    const requestsFetchStartedAt = Date.now();
    let packingDocs = [];
    let trackingDocs = [];

    if (requestIds.length > 0) {
      const byIds = await Request.find({
        ...orgScope,
        requestId: { $in: requestIds },
        mailboxAddress,
        manufacturerStage: { $in: ["포장.발송", "추적관리"] },
      })
        .sort({ createdAt: -1, _id: -1 })
        .select(MAILBOX_REQUESTS_SELECT)
        .lean();
      packingDocs = byIds.filter(
        (doc) => String(doc?.manufacturerStage || "").trim() === "포장.발송",
      );
      trackingDocs = byIds.filter(
        (doc) => String(doc?.manufacturerStage || "").trim() === "추적관리",
      );
    } else {
      [packingDocs, trackingDocs] = await Promise.all([
        Request.find({ ...mailboxFilter, manufacturerStage: "포장.발송" })
          .sort({ createdAt: -1, _id: -1 })
          .select(MAILBOX_REQUESTS_SELECT)
          .lean(),
        Request.find({
          ...mailboxFilter,
          manufacturerStage: "추적관리",
          deliveryInfoRef: { $exists: true, $ne: null },
          "shippingWorkflow.code": {
            $nin: ["picked_up", "completed", "canceled"],
          },
        })
          .sort({ createdAt: -1, _id: -1 })
          .select(MAILBOX_REQUESTS_SELECT)
          .lean(),
      ]);
    }
    const requestsQueryMs = Date.now() - requestsFetchStartedAt;

    const prePickupTrackingCandidates = trackingDocs.filter((doc) => {
      const workflowCode = String(doc?.shippingWorkflow?.code || "").trim();
      if (
        workflowCode === "picked_up" ||
        workflowCode === "completed" ||
        workflowCode === "canceled"
      ) {
        return false;
      }
      const statusCode = Number(doc?.shippingWorkflow?.trackingStatusCode);
      if (Number.isFinite(statusCode) && statusCode >= 11) {
        return false;
      }
      return true;
    });

    const relatedFetchStartedAt = Date.now();
    const requestorIds = Array.from(
      new Set(
        [...packingDocs, ...prePickupTrackingCandidates]
          .map((doc) => String(doc?.requestor || "").trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const anchorIds = Array.from(
      new Set(
        [...packingDocs, ...prePickupTrackingCandidates]
          .map((doc) => String(doc?.businessAnchorId || "").trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const deliveryIds = Array.from(
      new Set(
        prePickupTrackingCandidates
          .map((doc) => String(doc?.deliveryInfoRef || "").trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const [requestors, anchors, deliveries] = await Promise.all([
      requestorIds.length
        ? User.find({ _id: { $in: requestorIds } })
            .select("name business businessAnchorId address addressText zipCode")
            .lean()
        : Promise.resolve([]),
      anchorIds.length
        ? BusinessAnchor.find({ _id: { $in: anchorIds } })
            .select("name metadata shippingPolicy")
            .lean()
        : Promise.resolve([]),
      deliveryIds.length
        ? DeliveryInfo.find({ _id: { $in: deliveryIds } })
            .select(
              "shippedAt pickedUpAt deliveredAt carrier trackingNumber updatedAt tracking",
            )
            .lean()
        : Promise.resolve([]),
    ]);
    const relatedQueryMs = Date.now() - relatedFetchStartedAt;

    const requestorById = new Map(
      requestors.map((item) => [String(item?._id || "").trim(), item]),
    );
    const anchorById = new Map(
      anchors.map((item) => [String(item?._id || "").trim(), item]),
    );
    const deliveryById = new Map(
      deliveries.map((item) => [String(item?._id || "").trim(), item]),
    );

    const hydrateDoc = (doc) => {
      const requestorId = String(doc?.requestor || "").trim();
      const anchorId = String(doc?.businessAnchorId || "").trim();
      const deliveryId = String(doc?.deliveryInfoRef || "").trim();
      return {
        ...doc,
        requestor: requestorById.get(requestorId) || doc.requestor || null,
        businessAnchorId: anchorById.get(anchorId) || doc.businessAnchorId || null,
        deliveryInfoRef: deliveryById.get(deliveryId) || null,
      };
    };

    const processStartedAt = Date.now();
    const hydratedPacking = packingDocs.map(hydrateDoc);
    const hydratedTracking = [];
    for (const doc of prePickupTrackingCandidates) {
      const hydrated = hydrateDoc(doc);
      if (!isPrePickupTrackingRequest(hydrated)) continue;
      hydratedTracking.push(hydrated);
    }

    const normalized = await Promise.all(
      [...hydratedPacking, ...hydratedTracking].map((doc) =>
        normalizeWorksheetRequestForResponse(doc),
      ),
    );

    const requests = normalized.filter((requestDoc) => {
      const stage = String(requestDoc?.manufacturerStage || "").trim();
      return stage === "포장.발송" || isPrePickupTrackingRequest(requestDoc);
    });
    const processMs = Date.now() - processStartedAt;

    const payload = {
      mailboxAddress,
      requests,
    };

    mailboxRequestsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + resolveMailboxRequestsCacheTtlMs(),
    });

    console.info("[shipping][mailbox-requests][perf]", {
      cache: "miss-built",
      status: 200,
      orgScopeMs,
      requestsQueryMs,
      relatedQueryMs,
      processMs,
      totalMs: Date.now() - perfStartedAt,
      mailboxAddress,
      packingCount: packingDocs.length,
      trackingCount: trackingDocs.length,
      requestCount: requests.length,
      byRequestIds: requestIds.length > 0,
    });

    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "우편함 상세 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 수동 집하 완료 반영 (실제 택배사 수동 접수 이후)
 * @route POST /api/requests/shipping/hanjin/manual-pickup-complete
 *
 * 참고:
 * - 과거 mock-pickup-complete 경로와 호환되도록 동일 로직을 재사용한다.
 * - trackingNumber를 명시하면 해당 번호를 우편함 집하 SSOT로 강제 반영한다.
 */
export async function manualHanjinPickupCompleted(req, res) {
  try {
    const {
      mailboxAddresses = [],
      shippingPackageIds = [],
      trackingNumber: manualTrackingNumberRaw = "",
      trackingNumberByMailbox: trackingNumberByMailboxRaw = {},
      trackingStatusCode: manualStatusCodeRaw = "11",
      trackingStatusText: manualStatusTextRaw = "집하완료",
      useNonHanjinShippingMethods: useNonHanjinShippingMethodsRaw = false,
      nonHanjinShippingMethods: nonHanjinShippingMethodsRaw = [],
    } = req.body || {};

    const manualTrackingNumber = canonicalizeHanjinWblNo(
      String(manualTrackingNumberRaw || "").trim(),
    );
    const requestedManualStatusCode =
      String(manualStatusCodeRaw || "11").trim() || "11";
    const requestedManualStatusText =
      String(manualStatusTextRaw || "집하완료").trim() || "집하완료";

    const trackingNumberByMailbox =
      trackingNumberByMailboxRaw &&
      typeof trackingNumberByMailboxRaw === "object"
        ? Object.fromEntries(
            Object.entries(trackingNumberByMailboxRaw)
              .map(([mailbox, trackingNumber]) => {
                const raw = String(trackingNumber || "").trim();
                return [
                  String(mailbox || "").trim(),
                  canonicalizeHanjinWblNo(raw),
                ];
              })
              .filter(([mailbox, trackingNumber]) => mailbox && trackingNumber),
          )
        : {};

    // related files:
    // - web/backend/models/request.model.js
    // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
    // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
    const useNonHanjinShippingMethods = Boolean(
      useNonHanjinShippingMethodsRaw,
    );
    const nonHanjinShippingMethods = Array.from(
      new Set(
        (Array.isArray(nonHanjinShippingMethodsRaw)
          ? nonHanjinShippingMethodsRaw
          : []
        )
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    if (useNonHanjinShippingMethods && nonHanjinShippingMethods.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "한진택배 외 발송 방식을 선택한 경우 nonHanjinShippingMethods를 최소 1개 이상 입력해야 합니다.",
      });
    }

    const manualCarrier = useNonHanjinShippingMethods ? "한진 외" : "hanjin";
    const manualStatusCode = useNonHanjinShippingMethods
      ? "91"
      : requestedManualStatusCode;
    const manualStatusText = useNonHanjinShippingMethods
      ? "배송완료"
      : requestedManualStatusText;

    // 수동 집하 시각 SSOT: 실제 처리 시각(now)
    // - 한진 수동 집하 → pickedUpAt
    // - 한진 외 배송완료 → deliveredAt(및 shippedAt 보정)
    // 예정 수거 시각(scheduledShipPickup=16:00)과 혼동하지 않는다.
    const now = new Date();
    const manualPickedUpAt = now;
    const manualDeliveredAt = now;

    const addressList = Array.isArray(mailboxAddresses)
      ? mailboxAddresses
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];

    if (!addressList.length) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const routePath = String(req?.originalUrl || req?.path || "").trim();
    const isLegacyMockRoute = routePath.includes("mock-pickup-complete");
    if (!isLegacyMockRoute && !useNonHanjinShippingMethods) {
      const missingTrackingMailboxes = addressList.filter((mailboxAddress) => {
        const perMailbox = String(
          trackingNumberByMailbox?.[mailboxAddress] || "",
        ).trim();
        const resolved = perMailbox || manualTrackingNumber;
        return !resolved;
      });
      if (missingTrackingMailboxes.length > 0) {
        return res.status(400).json({
          success: false,
          message: `운송장번호가 없는 우편함이 있습니다: ${missingTrackingMailboxes.join(", ")}`,
        });
      }
    }

    // shippingPackageId는 string/ObjectId/object 모두 허용하되, 유효한 ObjectId만 사용한다.
    // 프론트에서 object가 그대로 넘어온 경우 "[object Object]" 같은 값이 들어올 수 있어
    // 여기서 강하게 정규화한다.
    const packageIdList = Array.isArray(shippingPackageIds)
      ? shippingPackageIds
          .map((value) => {
            if (value && typeof value === "object") {
              return String(value?._id || value?.id || "").trim();
            }
            return String(value || "").trim();
          })
          .filter((value) => Types.ObjectId.isValid(value))
      : [];
    const packageIdSet = new Set(packageIdList);

    // 1차: 우편함+포장.발송 기준으로 모두 가져온 뒤,
    // 2차: 각 우편함 내부에서 shippingPackageId 조건을 적용한다.
    // 이유: print 직후(아직 pickup 전) 의뢰는 shippingPackageId가 비어 있을 수 있는데,
    // 이때 전역 쿼리에 shippingPackageId $in을 넣으면 정상 대상까지 통째로 누락된다.
    const targetRequests = await Request.find({
      mailboxAddress: { $in: addressList },
      manufacturerStage: "포장.발송",
    })
      .populate("requestor", "name business phoneNumber address")
      .populate("businessAnchorId", "name metadata")
      .populate("deliveryInfoRef");

    if (!targetRequests.length) {
      return res.status(404).json({
        success: false,
        message: "수동 집하 처리할 우편함을 찾을 수 없습니다.",
      });
    }

    const requestsByMailbox = new Map();
    for (const requestDoc of targetRequests) {
      const mailboxAddress = String(requestDoc?.mailboxAddress || "").trim();
      if (!mailboxAddress) continue;
      if (!requestsByMailbox.has(mailboxAddress)) {
        requestsByMailbox.set(mailboxAddress, []);
      }
      requestsByMailbox.get(mailboxAddress).push(requestDoc);
    }

    const results = [];

    console.log("[MANUAL_PICKUP] base candidates", {
      mailboxCount: requestsByMailbox.size,
      requestCount: targetRequests.length,
      packageIdCount: packageIdList.length,
    });

    for (const mailboxAddress of addressList) {
      const mailboxRequestsAll = requestsByMailbox.get(mailboxAddress) || [];
      if (!mailboxRequestsAll.length) {
        results.push({
          mailboxAddress,
          success: false,
          skipped: true,
          reason: "no_requests",
          requestCount: 0,
          processedCount: 0,
        });
        continue;
      }

      // [SSOT] 수동 집하 대상은 '우편함 단위'로 확정한다.
      // - 프론트는 편의상 shippingPackageIds를 보낼 수 있지만,
      //   우편함 내부의 미할당(shippingPackageId 없음) 건은 pickup 직전 정상 상태다.
      // - 따라서 packageId 필터는 "배제"가 아니라 "우선 매칭 + 미할당 포함" 규칙으로 해석한다.
      // - 목표: 같은 우편함에서 2건/4건처럼 분할 집하되는 현상 방지.
      let effectiveMailboxRequests = mailboxRequestsAll;
      if (packageIdSet.size > 0) {
        const matchedByPackage = mailboxRequestsAll.filter((requestDoc) => {
          const packageId = String(requestDoc?.shippingPackageId || "").trim();
          return packageIdSet.has(packageId);
        });

        // packageId가 없는(미할당) 의뢰는 pickup 전 정상 상태일 수 있으므로,
        // package 매칭 건과 함께 항상 포함한다.
        // (기존에는 매칭 건이 1개라도 있으면 미할당 건이 누락되어
        // 같은 우편함에서 일부만 집하 처리되는 문제가 있었다.)
        const withoutPackage = mailboxRequestsAll.filter(
          (requestDoc) => !requestDoc?.shippingPackageId,
        );

        if (matchedByPackage.length > 0 || withoutPackage.length > 0) {
          const mergedById = new Map();
          for (const requestDoc of matchedByPackage) {
            const key = String(
              requestDoc?._id || requestDoc?.requestId || "",
            ).trim();
            if (!key) continue;
            mergedById.set(key, requestDoc);
          }
          for (const requestDoc of withoutPackage) {
            const key = String(
              requestDoc?._id || requestDoc?.requestId || "",
            ).trim();
            if (!key) continue;
            mergedById.set(key, requestDoc);
          }
          effectiveMailboxRequests = Array.from(mergedById.values());

          if (withoutPackage.length > 0) {
            console.warn(
              "[MANUAL_PICKUP] include unassigned package requests",
              {
                mailboxAddress,
                requestedPackageIds: packageIdList,
                matchedByPackageCount: matchedByPackage.length,
                unassignedCount: withoutPackage.length,
              },
            );
          }
        } else {
          console.warn(
            "[MANUAL_PICKUP] skip mailbox by package filter mismatch",
            {
              mailboxAddress,
              requestedPackageIds: packageIdList,
              mailboxRequestCount: mailboxRequestsAll.length,
            },
          );
          results.push({
            mailboxAddress,
            success: false,
            skipped: true,
            reason: "package_filter_mismatch",
            requestCount: mailboxRequestsAll.length,
            processedCount: 0,
          });
          continue;
        }
      }

      const groups = Array.from(
        buildRequestsByShippingBox(effectiveMailboxRequests).values(),
      );
      if (!groups.length) {
        results.push({
          mailboxAddress,
          success: false,
          skipped: true,
          reason: "no_groups",
          requestCount: effectiveMailboxRequests.length,
          processedCount: 0,
        });
        continue;
      }

      // [SSOT] trackingNumber는 '우편함의 이번 집하 1회'를 대표한다.
      // 그룹 키(pkg/mailbox)는 내부 처리 순서용이며, 사용자/추적 화면의 집하 단위를 쪼개면 안 된다.
      // 수동 집하는 사용자가 입력한 운송장번호를 우편함 전체에 강제 적용한다.
      // (레거시 mock 경로와 호환을 위해 trackingNumber가 비어 있으면 fallback 생성값을 사용)
      const mailboxTrackingNumberRaw = useNonHanjinShippingMethods
        ? String(
            trackingNumberByMailbox?.[mailboxAddress] ||
              manualTrackingNumber ||
              "",
          ).trim()
        : String(trackingNumberByMailbox?.[mailboxAddress] || "").trim() ||
          manualTrackingNumber ||
          resolveMailboxTrackingNumber(effectiveMailboxRequests, "MOCK", now);
      const mailboxTrackingNumber = canonicalizeHanjinWblNo(
        mailboxTrackingNumberRaw,
      );

      await ensureShippingFeeSpendOnMailboxPickup({
        mailboxAddress,
        requests: effectiveMailboxRequests,
        actorUserId: req.user?._id || null,
      });

      for (const group of groups) {
        const trackingNumber = mailboxTrackingNumber;
        const processedRequestIds = [];
        const deliverySaveJobs = [];
        const requestSaveJobs = [];
        const emitJobs = [];
        let deliveryInfoCreateFailedCount = 0;
        const shippingPackageId = String(
          group?.[0]?.shippingPackageId || "",
        ).trim();

        for (const requestDoc of group) {
          let deliveryInfo = requestDoc.deliveryInfoRef;

          if (!deliveryInfo || typeof deliveryInfo === "string") {
            const refId =
              typeof deliveryInfo === "string"
                ? deliveryInfo
                : deliveryInfo?._id;
            if (refId) {
              deliveryInfo = await DeliveryInfo.findById(refId);
            }
          }

          if (!deliveryInfo) {
            try {
              deliveryInfo = await DeliveryInfo.create({
                request: requestDoc._id,
                trackingNumber: trackingNumber || undefined,
                carrier: manualCarrier,
                manualDeliveryMethods: useNonHanjinShippingMethods
                  ? nonHanjinShippingMethods
                  : [],
                shippedAt: useNonHanjinShippingMethods
                  ? manualDeliveredAt
                  : manualPickedUpAt,
                pickedUpAt: useNonHanjinShippingMethods
                  ? undefined
                  : manualPickedUpAt,
                deliveredAt: useNonHanjinShippingMethods
                  ? manualDeliveredAt
                  : undefined,
                tracking: {
                  lastStatusCode: manualStatusCode,
                  lastStatusText: manualStatusText,
                  lastEventAt: useNonHanjinShippingMethods
                    ? manualDeliveredAt
                    : manualPickedUpAt,
                  lastSyncedAt: now,
                },
              });
              requestDoc.deliveryInfoRef = deliveryInfo._id;
            } catch (createError) {
              deliveryInfoCreateFailedCount += 1;
              console.log(
                `[MANUAL_PICKUP] SKIP: failed to create deliveryInfo for mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}`,
                createError,
              );
              continue;
            }
          }

          console.log(
            `[MANUAL_PICKUP] processing mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}, trackingNumber=${trackingNumber}`,
          );

          deliveryInfo.trackingNumber = trackingNumber || null;
          deliveryInfo.carrier = manualCarrier;
          deliveryInfo.manualDeliveryMethods = useNonHanjinShippingMethods
            ? nonHanjinShippingMethods
            : [];
          deliveryInfo.tracking = deliveryInfo.tracking || {};
          deliveryInfo.tracking.lastStatusCode = manualStatusCode;
          deliveryInfo.tracking.lastStatusText = manualStatusText;
          deliveryInfo.tracking.lastEventAt = useNonHanjinShippingMethods
            ? manualDeliveredAt
            : manualPickedUpAt;
          deliveryInfo.tracking.lastSyncedAt = now;

          if (useNonHanjinShippingMethods) {
            deliveryInfo.shippedAt = deliveryInfo.shippedAt || manualDeliveredAt;
            deliveryInfo.pickedUpAt = null;
            deliveryInfo.deliveredAt = manualDeliveredAt;
          } else {
            if (!deliveryInfo.shippedAt) {
              deliveryInfo.shippedAt = manualPickedUpAt;
            }
            deliveryInfo.pickedUpAt = manualPickedUpAt;
          }
          deliverySaveJobs.push(deliveryInfo.save());

          requestDoc.manufacturerStage = "추적관리";
          requestDoc.status = "추적관리";
          applyShippingWorkflowState(requestDoc, {
            code: useNonHanjinShippingMethods
              ? SHIPPING_WORKFLOW_CODES.COMPLETED
              : SHIPPING_WORKFLOW_CODES.PICKED_UP,
            label: useNonHanjinShippingMethods
              ? SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.COMPLETED]
              : SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PICKED_UP],
            pickedUpAt: useNonHanjinShippingMethods ? null : manualPickedUpAt,
            completedAt: useNonHanjinShippingMethods ? manualDeliveredAt : null,
            trackingStatusCode: manualStatusCode,
            trackingStatusText: manualStatusText,
            source: "hanjin-tracking-manual-pickup",
            manualDeliveryMethods: useNonHanjinShippingMethods
              ? nonHanjinShippingMethods
              : [],
            manualDeliveryMethodsUpdatedAt: now,
            updatedAt: now,
          });
          requestSaveJobs.push(requestDoc.save());

          emitJobs.push(
            emitDeliveryUpdated(requestDoc, {
              source: "hanjin-tracking-manual-pickup",
              shippingStatusLabel: manualStatusText,
            }),
          );

          processedRequestIds.push(requestDoc.requestId);
        }

        await Promise.all(deliverySaveJobs);
        await Promise.all(requestSaveJobs);
        await Promise.allSettled(emitJobs);

        results.push({
          mailboxAddress,
          shippingPackageId: shippingPackageId || null,
          success: processedRequestIds.length > 0,
          reason:
            processedRequestIds.length > 0
              ? null
              : deliveryInfoCreateFailedCount > 0
                ? "delivery_info_create_failed"
                : "unknown",
          requestCount: group.length,
          processedCount: processedRequestIds.length,
          requestIds: processedRequestIds,
          trackingNumber,
          statusCode: manualStatusCode,
          statusText: manualStatusText,
        });
      }
    }

    const pickedUpCount = results.filter((item) => item.success).length;

    console.log(`[MANUAL_PICKUP] completed count=${pickedUpCount}`);

    if (pickedUpCount === 0) {
      const failedMailboxes = results
        .filter((item) => item.success === false)
        .map((item) => ({
          mailboxAddress: item.mailboxAddress,
          reason: item.reason || "unknown",
        }));
      const creditFailed = results.find(
        (item) => item.reason === "insufficient_credit_for_shipping",
      );
      if (creditFailed) {
        return res.status(402).json({
          success: false,
          message:
            creditFailed.message ||
            "의뢰자 잔액 부족으로 집하할 수 없습니다.",
          payload:
            creditFailed.payload || {
              reason: "insufficient_credit_for_shipping",
            },
          data: {
            pickedUpCount,
            results,
            failedMailboxes,
          },
        });
      }
      return res.status(404).json({
        success: false,
        message:
          "수동 집하 처리 가능한 우편함을 찾지 못했습니다. (package 필터 또는 대상 상태를 확인하세요)",
        data: {
          pickedUpCount,
          results,
          failedMailboxes,
        },
      });
    }

    const pickedUpRequestIds = [
      ...new Set(
        results.flatMap((item) =>
          Array.isArray(item?.requestIds) ? item.requestIds : [],
        ),
      ),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!useNonHanjinShippingMethods && pickedUpRequestIds.length) {
      try {
        await startHanjinTrackingPoll({
          requestIds: pickedUpRequestIds,
          actorUserId: req.user?._id || null,
          source: "hanjin-tracking-manual-pickup",
          runImmediate: true,
        });
      } catch (pollError) {
        console.error(
          "[MANUAL_PICKUP] hanjin tracking poll failed",
          pollError,
        );
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        pickedUpCount,
        synced: results,
        results,
      },
    });
  } catch (error) {
    console.error("Error in manualHanjinPickupCompleted:", error);
    return res.status(500).json({
      success: false,
      message: "수동 집하 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 하위 호환: 기존 mock 경로는 manual 로직을 그대로 사용한다.
export async function mockHanjinPickupCompleted(req, res) {
  return manualHanjinPickupCompleted(req, res);
}

function clearMailboxSummaryCache() {
  mailboxSummaryCache.clear();
  mailboxRequestsCache.clear();
}

export async function setMailboxForceTodayShipment(req, res) {
  try {
    const mailbox = String(req.body?.mailboxAddress || "").trim();
    const forceTodayShipment = Boolean(req.body?.forceTodayShipment);

    if (!mailbox) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const requests = await Request.find({
      mailboxAddress: mailbox,
      manufacturerStage: "포장.발송",
    }).select({
      _id: 1,
      requestId: 1,
      businessAnchorId: 1,
      timeline: 1,
      productionSchedule: 1,
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const todayYmd = getTodayYmdInKst();
    const todayPickupAt = todayYmd
      ? new Date(`${todayYmd}T16:00:00+09:00`)
      : null;

    const affectedBusinessAnchorIdSet = new Set();
    for (const requestDoc of requests) {
      requestDoc.timeline = requestDoc.timeline || {};
      requestDoc.productionSchedule = requestDoc.productionSchedule || {};
      requestDoc.timeline.forceTodayShipment = forceTodayShipment;

      if (forceTodayShipment) {
        if (todayYmd) {
          requestDoc.timeline.nextEstimatedShipYmd = todayYmd;
          requestDoc.timeline.estimatedShipYmd = todayYmd;
        }
        if (todayPickupAt && !Number.isNaN(todayPickupAt.getTime())) {
          requestDoc.productionSchedule.scheduledShipPickup = todayPickupAt;
        }
      } else {
        const originalYmd = String(
          requestDoc.timeline.originalEstimatedShipYmd || "",
        ).trim();
        if (originalYmd) {
          requestDoc.timeline.nextEstimatedShipYmd = originalYmd;
          requestDoc.timeline.estimatedShipYmd = originalYmd;
          const restoredPickupAt = new Date(`${originalYmd}T16:00:00+09:00`);
          if (!Number.isNaN(restoredPickupAt.getTime())) {
            requestDoc.productionSchedule.scheduledShipPickup =
              restoredPickupAt;
          }
        }
      }

      await requestDoc.save();
      const businessAnchorId = String(
        requestDoc?.businessAnchorId || "",
      ).trim();
      if (businessAnchorId) affectedBusinessAnchorIdSet.add(businessAnchorId);
    }

    clearMailboxSummaryCache();

    for (const businessAnchorId of affectedBusinessAnchorIdSet) {
      triggerPricingSnapshotForBusinessAnchorId(
        businessAnchorId,
        forceTodayShipment
          ? "mailbox-force-today-on"
          : "mailbox-force-today-off",
      );
    }

    return res.status(200).json({
      success: true,
      message: forceTodayShipment
        ? "강제 오늘 발송이 설정되었습니다."
        : "강제 오늘 발송이 해제되었습니다.",
      data: {
        mailboxAddress: mailbox,
        forceTodayShipment,
        requestIds: requests
          .map((requestDoc) => String(requestDoc?.requestId || "").trim())
          .filter(Boolean),
      },
    });
  } catch (error) {
    console.error("Error in setMailboxForceTodayShipment:", error);
    return res.status(500).json({
      success: false,
      message: "강제 오늘 발송 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 우편함 전체 롤백 (포장.발송 → 세척.패킹)
 * @route POST /api/requests/shipping/mailbox-rollback
 */
export async function rollbackMailboxShipping(req, res) {
  try {
    const { mailboxAddress, requestIds } = req.body || {};

    const mailbox = String(mailboxAddress || "").trim();
    if (!mailbox) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const ids = Array.isArray(requestIds)
      ? requestIds
          .map((v) => String(v || "").trim())
          .filter((v) => Types.ObjectId.isValid(v))
      : [];

    const filter = {
      mailboxAddress: mailbox,
      manufacturerStage: "포장.발송",
    };

    if (ids.length) {
      filter._id = { $in: ids };
    }

    const requests = await Request.find(filter);
    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const updatedIds = [];
    for (const r of requests) {
      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      bumpRollbackCount(r, "shipping");
      applyStatusMapping(r, "세척.패킹");
      r.timeline = r.timeline || {};
      r.timeline.forceTodayShipment = false;
      r.shippingLabelPrinted = {
        ...(r.shippingLabelPrinted || {}),
        printed: false,
        printedAt: null,
        mailboxAddress: String(r.mailboxAddress || "").trim() || null,
        snapshotFingerprint: null,
        snapshotCapturedAt: null,
        snapshotRequestIds: [],
      };
      applyShippingWorkflowState(r, {
        code: SHIPPING_WORKFLOW_CODES.NONE,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.NONE],
        printedAt: null,
        acceptedAt: null,
        pickedUpAt: null,
        completedAt: null,
        canceledAt: null,
        trackingStatusCode: null,
        trackingStatusText: null,
        source: "mailbox-rollback",
        updatedAt: new Date(),
      });
      await r.save();
      updatedIds.push(r.requestId);
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건이 롤백되었습니다.`,
      data: { updatedIds },
    });
  } catch (error) {
    console.error("Error in rollbackMailboxShipping:", error);
    return res.status(500).json({
      success: false,
      message: "우편함 롤백 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function resetMailboxShippingWorkingState(req, res) {
  try {
    const mailboxAddressesRaw = Array.isArray(req.body?.mailboxAddresses)
      ? req.body.mailboxAddresses
      : [];
    const mailboxAddresses = mailboxAddressesRaw
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!mailboxAddresses.length) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const requests = await Request.find({
      mailboxAddress: { $in: mailboxAddresses },
      manufacturerStage: "포장.발송",
    })
      .populate("requestor", "name business phoneNumber address")
      .populate("businessAnchorId", "name metadata")
      .populate("deliveryInfoRef");

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    // accepted/picked_up 상태 우편함에 대해 한진 취소 API 호출 (best-effort)
    await cancelHanjinPickupForReset(mailboxAddresses);

    const now = new Date();
    const updatedIds = [];

    for (const requestDoc of requests) {
      requestDoc.shippingLabelPrinted = {
        ...(requestDoc.shippingLabelPrinted || {}),
        printed: false,
        printedAt: null,
        mailboxAddress: String(requestDoc.mailboxAddress || "").trim() || null,
        snapshotFingerprint: null,
        snapshotCapturedAt: null,
        snapshotRequestIds: [],
      };

      applyShippingWorkflowState(requestDoc, {
        code: SHIPPING_WORKFLOW_CODES.NONE,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.NONE],
        printedAt: null,
        acceptedAt: null,
        pickedUpAt: null,
        completedAt: null,
        canceledAt: null,
        erroredAt: null,
        trackingStatusCode: null,
        trackingStatusText: null,
        source: "shipping-test-reset",
        updatedAt: now,
      });

      if (
        requestDoc.deliveryInfoRef &&
        typeof requestDoc.deliveryInfoRef === "object"
      ) {
        requestDoc.deliveryInfoRef.tracking = {
          ...(requestDoc.deliveryInfoRef.tracking || {}),
          lastStatusCode: null,
          lastStatusText: null,
          lastEventAt: null,
          lastSyncedAt: now,
        };
        requestDoc.deliveryInfoRef.shippedAt = null;
        requestDoc.deliveryInfoRef.pickedUpAt = null;
        requestDoc.deliveryInfoRef.deliveredAt = null;
        requestDoc.deliveryInfoRef.trackingNumber = undefined;
        await requestDoc.deliveryInfoRef.save();
      }

      await requestDoc.save();
      updatedIds.push(String(requestDoc.requestId || "").trim());
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건의 포장.발송 작업 상태를 초기화했습니다.`,
      data: {
        updatedIds,
        mailboxAddresses,
      },
    });
  } catch (error) {
    console.error("Error in resetMailboxShippingWorkingState:", error);
    return res.status(500).json({
      success: false,
      message: "포장.발송 테스트 리셋 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * PTX 직납 우편함: Request.shippingReceiver 스냅샷 주소만 갱신.
 * (기공소 BA metadata는 건드리지 않음)
 */
export async function updateShippingReceiverAddress(req, res) {
  try {
    const actorRole = String(req.user?.role || "").trim();
    if (!["manufacturer", "admin"].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const mailboxAddress = String(req.body?.mailboxAddress || "")
      .trim()
      .toUpperCase();
    const requestIds = Array.isArray(req.body?.requestIds)
      ? req.body.requestIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const contactName = String(req.body?.contactName || "").trim();
    const name = String(req.body?.name || "").trim();

    if (!address || !addressDetail || !zipCode) {
      return res.status(400).json({
        success: false,
        message: "address, addressDetail, zipCode가 필요합니다.",
      });
    }
    if (!mailboxAddress && requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress 또는 requestIds가 필요합니다.",
      });
    }

    const filter = {
      $or: [
        { "shippingReceiver.sourceAnchorId": { $ne: null } },
        { "partnerBilling.relatedPracticeTransferId": { $ne: null } },
        { "partnerBilling.practiceBusinessAnchorId": { $ne: null } },
      ],
    };
    if (mailboxAddress) {
      filter.mailboxAddress = mailboxAddress;
    }
    if (requestIds.length) {
      filter.requestId = { $in: requestIds };
    }

    const docs = await Request.find(filter).select({
      _id: 1,
      requestId: 1,
      shippingReceiver: 1,
    });
    if (!docs.length) {
      return res.status(404).json({
        success: false,
        message: "갱신할 직납 수취인 스냅샷을 찾지 못했습니다.",
      });
    }

    const updatedIds = [];
    for (const doc of docs) {
      if (!doc.shippingReceiver || typeof doc.shippingReceiver !== "object") {
        doc.shippingReceiver = {};
      }
      doc.shippingReceiver.address = address;
      doc.shippingReceiver.addressDetail = addressDetail;
      doc.shippingReceiver.zipCode = zipCode;
      if (phone) doc.shippingReceiver.phone = phone;
      if (contactName) doc.shippingReceiver.contactName = contactName;
      if (name) doc.shippingReceiver.name = name;
      doc.markModified("shippingReceiver");
      await doc.save();
      updatedIds.push(String(doc.requestId || "").trim());
    }

    return res.status(200).json({
      success: true,
      data: {
        updatedIds,
        address,
        addressDetail,
        zipCode,
        phone: phone || null,
        contactName: contactName || null,
        name: name || null,
      },
    });
  } catch (error) {
    console.error("Error in updateShippingReceiverAddress:", error);
    return res.status(500).json({
      success: false,
      message: "직납 수취인 주소 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
