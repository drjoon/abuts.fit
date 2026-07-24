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

import { emitDeliveryUpdated } from "./shipping.Tracking.helpers.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { cancelHanjinPickupForReset } from "./shipping.Hanjin.controller.js";
import { triggerPricingSnapshotForBusinessAnchorId } from "../../services/requestSnapshotTriggers.service.js";

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

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
}) {
  if (forceTodayShipment) {
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
  try {
    const role = String(req.user?.role || "").trim();
    const orgScope =
      role === "manufacturer" ? await buildManufacturerOrgScopeFilter(req) : {};

    const mailboxAddress = String(req.query?.mailboxAddress || "")
      .trim()
      .toUpperCase();
    if (!mailboxAddress) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const docs = await Request.find({
      ...orgScope,
      mailboxAddress: {
        $regex: `^${escapeRegex(mailboxAddress)}$`,
        $options: "i",
      },
      manufacturerStage: { $in: ["포장.발송", "추적관리"] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select({
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
        timeline: 1,
        requestor: 1,
        deliveryInfoRef: 1,
      })
      .populate(
        "requestor",
        "name business businessAnchorId address addressText zipCode",
      )
      .populate("businessAnchorId", "name metadata shippingPolicy")
      .populate(
        "deliveryInfoRef",
        "shippedAt pickedUpAt deliveredAt carrier trackingNumber updatedAt tracking",
      );

    const normalized = await Promise.all(
      docs.map((doc) => normalizeWorksheetRequestForResponse(doc)),
    );

    const requests = normalized.filter((requestDoc) => {
      const stage = String(requestDoc?.manufacturerStage || "").trim();
      return stage === "포장.발송" || isPrePickupTrackingRequest(requestDoc);
    });

    return res.status(200).json({
      success: true,
      data: {
        mailboxAddress,
        requests,
      },
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

    const manualTrackingNumber = String(manualTrackingNumberRaw || "").trim();
    const requestedManualStatusCode =
      String(manualStatusCodeRaw || "11").trim() || "11";
    const requestedManualStatusText =
      String(manualStatusTextRaw || "집하완료").trim() || "집하완료";

    const trackingNumberByMailbox =
      trackingNumberByMailboxRaw &&
      typeof trackingNumberByMailboxRaw === "object"
        ? Object.fromEntries(
            Object.entries(trackingNumberByMailboxRaw)
              .map(([mailbox, trackingNumber]) => [
                String(mailbox || "").trim(),
                String(trackingNumber || "").trim(),
              ])
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

    const manualCarrier = useNonHanjinShippingMethods
      ? nonHanjinShippingMethods.join(", ")
      : "hanjin";
    const manualStatusCode = useNonHanjinShippingMethods
      ? "91"
      : requestedManualStatusCode;
    const manualStatusText = useNonHanjinShippingMethods
      ? "배송완료"
      : requestedManualStatusText;

    // 수동 집하 시각 SSOT: "당일 16:00 KST"
    // 사용자 입력 시각을 받지 않고 서버에서 고정 계산해 기록한다.
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const kstYmd = kstNow.toISOString().slice(0, 10);
    const manualPickedUpAt = new Date(`${kstYmd}T16:00:00+09:00`);
    const manualDeliveredAt = manualPickedUpAt;

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
      const mailboxTrackingNumber = useNonHanjinShippingMethods
        ? String(
            trackingNumberByMailbox?.[mailboxAddress] || manualTrackingNumber || "",
          ).trim()
        : String(trackingNumberByMailbox?.[mailboxAddress] || "").trim() ||
          manualTrackingNumber ||
          resolveMailboxTrackingNumber(effectiveMailboxRequests, "MOCK", now);

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
    }).select({ _id: 1, requestId: 1, businessAnchorId: 1, timeline: 1 });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const affectedBusinessAnchorIdSet = new Set();
    for (const requestDoc of requests) {
      requestDoc.timeline = requestDoc.timeline || {};
      requestDoc.timeline.forceTodayShipment = forceTodayShipment;
      await requestDoc.save();
      const businessAnchorId = String(
        requestDoc?.businessAnchorId || "",
      ).trim();
      if (businessAnchorId) affectedBusinessAnchorIdSet.add(businessAnchorId);
    }

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
