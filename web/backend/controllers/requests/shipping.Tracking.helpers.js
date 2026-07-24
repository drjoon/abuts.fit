import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";

import { emitAppEventToRoles } from "../../socket.js";
import {
  applyShippingWorkflowState,
  normalizeRequestForResponse,
  SHIPPING_WORKFLOW_CODES,
  SHIPPING_WORKFLOW_LABELS,
} from "./utils.js";
import { resetPrintedAndAcceptedWorkingState } from "./shipping.MailboxRealtime.helpers.js";

export const HANJIN_CLIENT_ID = String(
  process.env.HANJIN_CLIENT_ID || "",
).trim();

export const toBool = (v) =>
  String(v || "")
    .trim()
    .toLowerCase() === "true";

export const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  // 한진 API는 "YYYY-MM-DD HH:MM:SS" 포맷으로 KST 시각을 반환하나
  // timezone 정보가 없으므로 new Date() 파싱 시 UTC로 해석됨 (+9h 오차 발생).
  // "YYYY-MM-DD HH:MM:SS" 또는 "YYYYMMDDHHMMSS" 패턴은 KST로 강제 해석.
  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (isoLike) {
    const kst = new Date(
      `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}T${isoLike[4]}:${isoLike[5]}:${isoLike[6]}+09:00`,
    );
    return Number.isNaN(kst.getTime()) ? null : kst;
  }
  const compactLike = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compactLike) {
    const kst = new Date(
      `${compactLike[1]}-${compactLike[2]}-${compactLike[3]}T${compactLike[4]}:${compactLike[5]}:${compactLike[6]}+09:00`,
    );
    return Number.isNaN(kst.getTime()) ? null : kst;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const normalizeTrackingEvents = (events) => {
  if (!Array.isArray(events)) return [];
  return events
    .map((e) => {
      const occurredAt =
        parseDate(e?.occurredAt || e?.eventAt || e?.time || e?.date) || null;
      return {
        statusCode: e?.statusCode != null ? String(e.statusCode) : undefined,
        statusText: e?.statusText != null ? String(e.statusText) : undefined,
        occurredAt: occurredAt || undefined,
        location: e?.location != null ? String(e.location) : undefined,
        description: e?.description != null ? String(e.description) : undefined,
        raw: e?.raw ?? e ?? undefined,
      };
    })
    .filter((e) => e.statusCode || e.statusText || e.occurredAt);
};

export const isTrackingStageEligible = (deliveryInfo) => {
  const pickedUpAt = deliveryInfo?.pickedUpAt
    ? new Date(deliveryInfo.pickedUpAt)
    : null;
  if (pickedUpAt && !Number.isNaN(pickedUpAt.getTime())) return true;

  const code = String(deliveryInfo?.tracking?.lastStatusCode || "").trim();
  return code === "11";
};

export const buildTrackingStatusLabel = (deliveryInfo) => {
  const deliveredAt = deliveryInfo?.deliveredAt
    ? new Date(deliveryInfo.deliveredAt)
    : null;
  if (deliveredAt && !Number.isNaN(deliveredAt.getTime())) return "배송완료";
  const statusText = String(
    deliveryInfo?.tracking?.lastStatusText || "",
  ).trim();
  if (statusText) return statusText;
  if (deliveryInfo?.trackingNumber || deliveryInfo?.shippedAt) return "접수";
  return "-";
};

export const hasPickupCompleted = (statusCode) =>
  String(statusCode || "").trim() === "11";

export const extractTrackingRows = (data) => {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.wblList)) return data.wblList;
  if (Array.isArray(data.data?.wblList)) return data.data.wblList;
  if (Array.isArray(data.result?.wblList)) return data.result.wblList;
  return [];
};

export const normalizeTrackingWorkRows = (wrkList) => {
  const list = Array.isArray(wrkList) ? wrkList : [];
  return list
    .map((item) => ({
      statusCode:
        item?.statusCode != null ? String(item.statusCode).trim() : undefined,
      statusText:
        item?.statusName != null ? String(item.statusName).trim() : undefined,
      occurredAt:
        item?.statusDate != null
          ? parseDate(item.statusDate) || undefined
          : undefined,
      location:
        item?.agencyName != null ? String(item.agencyName).trim() : undefined,
      description:
        item?.description != null ? String(item.description).trim() : undefined,
      raw: item ?? undefined,
    }))
    .filter((item) => item.statusCode || item.statusText || item.occurredAt);
};

export const resolveTrackingSyncTargets = async ({
  requestIds = [],
  trackingNumbers = [],
}) => {
  const requestIdList = Array.isArray(requestIds)
    ? requestIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const trackingNumberList = Array.isArray(trackingNumbers)
    ? trackingNumbers.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  const query = { deliveryInfoRef: { $ne: null } };
  if (requestIdList.length) {
    query.requestId = { $in: requestIdList };
  }

  const requests = await Request.find(query)
    .populate("requestor", "name business phoneNumber address")
    .populate("businessAnchorId", "name metadata")
    .populate("deliveryInfoRef");

  return requests.filter((requestDoc) => {
    const di = requestDoc.deliveryInfoRef;
    const trackingNumber = String(di?.trackingNumber || "").trim();
    if (!trackingNumber) return false;
    if (!trackingNumberList.length) return true;
    return trackingNumberList.includes(trackingNumber);
  });
};

export const applyTrackingRowsToRequests = async ({
  requestDocs = [],
  rowMap,
  actorUserId = null,
  source = "hanjin-tracking-sync",
}) => {
  const synced = [];
  for (const requestDoc of requestDocs) {
    const deliveryInfo = requestDoc.deliveryInfoRef;
    const trackingNumber = String(deliveryInfo?.trackingNumber || "").trim();
    const row = rowMap instanceof Map ? rowMap.get(trackingNumber) : null;
    if (!row || !deliveryInfo) {
      continue;
    }

    const events = normalizeTrackingWorkRows(row?.wrkList);
    const last = events.length ? events[events.length - 1] : null;
    deliveryInfo.tracking = deliveryInfo.tracking || {};
    if (last?.statusCode)
      deliveryInfo.tracking.lastStatusCode = last.statusCode;
    if (last?.statusText)
      deliveryInfo.tracking.lastStatusText = last.statusText;
    if (last?.occurredAt) deliveryInfo.tracking.lastEventAt = last.occurredAt;
    deliveryInfo.tracking.lastSyncedAt = new Date();
    if (events.length) {
      deliveryInfo.events = events;
    }
    if (String(last?.statusCode || "") === "66" && last?.occurredAt) {
      deliveryInfo.deliveredAt = last.occurredAt;
    }
    if (hasPickupCompleted(last?.statusCode) && last?.occurredAt) {
      deliveryInfo.pickedUpAt = last.occurredAt;
    }
    if (isTrackingStageEligible(deliveryInfo)) {
      requestDoc.manufacturerStage = "추적관리";
      requestDoc.status = "추적관리";
    } else {
      requestDoc.manufacturerStage = "포장.발송";
      requestDoc.status = "포장.발송";
    }

    const trackingCode = String(last?.statusCode || "").trim();
    const trackingText = String(last?.statusText || "").trim();
    if (deliveryInfo?.deliveredAt) {
      applyShippingWorkflowState(requestDoc, {
        code: SHIPPING_WORKFLOW_CODES.COMPLETED,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.COMPLETED],
        completedAt: deliveryInfo.deliveredAt,
        trackingStatusCode: trackingCode || null,
        trackingStatusText: trackingText || null,
        source,
        updatedAt: deliveryInfo.deliveredAt,
      });
    } else if (trackingCode === "03" || trackingText === "예약취소") {
      applyShippingWorkflowState(requestDoc, {
        code: SHIPPING_WORKFLOW_CODES.CANCELED,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.CANCELED],
        canceledAt: last?.occurredAt || new Date(),
        trackingStatusCode: trackingCode || null,
        trackingStatusText: trackingText || null,
        source,
        updatedAt: last?.occurredAt || new Date(),
      });
    } else if (hasPickupCompleted(trackingCode)) {
      resetPrintedAndAcceptedWorkingState(
        requestDoc,
        deliveryInfo.pickedUpAt || last?.occurredAt || new Date(),
      );
      applyShippingWorkflowState(requestDoc, {
        code: SHIPPING_WORKFLOW_CODES.PICKED_UP,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PICKED_UP],
        pickedUpAt: deliveryInfo.pickedUpAt || last?.occurredAt || new Date(),
        trackingStatusCode: trackingCode || null,
        trackingStatusText: trackingText || null,
        source,
        updatedAt: deliveryInfo.pickedUpAt || last?.occurredAt || new Date(),
      });
    } else if (deliveryInfo?.trackingNumber || deliveryInfo?.shippedAt) {
      applyShippingWorkflowState(requestDoc, {
        code: SHIPPING_WORKFLOW_CODES.ACCEPTED,
        label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.ACCEPTED],
        acceptedAt:
          requestDoc?.shippingWorkflow?.acceptedAt ||
          deliveryInfo?.shippedAt ||
          new Date(),
        trackingStatusCode: trackingCode || null,
        trackingStatusText: trackingText || null,
        source,
        updatedAt: last?.occurredAt || deliveryInfo?.shippedAt || new Date(),
      });
    }

    await deliveryInfo.save();
    await requestDoc.save();
    await emitDeliveryUpdated(requestDoc, {
      source,
      shippingStatusLabel: buildTrackingStatusLabel(deliveryInfo),
    });
    synced.push({
      requestId: requestDoc.requestId,
      trackingNumber,
      statusCode: deliveryInfo.tracking?.lastStatusCode || null,
      statusText: deliveryInfo.tracking?.lastStatusText || null,
    });
  }
  return synced;
};

const buildDeliveryMeta = (deliveryInfo) => {
  if (!deliveryInfo || typeof deliveryInfo !== "object") {
    return {
      wasPickedUp: false,
      pickupStatusCode: null,
      pickupStatusText: null,
      pickupCanceled: false,
      delivered: false,
    };
  }

  const statusCodeRaw = deliveryInfo?.tracking?.lastStatusCode;
  const statusTextRaw = deliveryInfo?.tracking?.lastStatusText;
  const pickupStatusCode = statusCodeRaw
    ? String(statusCodeRaw).trim() || null
    : null;
  const pickupStatusText = statusTextRaw
    ? String(statusTextRaw).trim() || null
    : null;
  const wasPickedUp = Boolean(
    deliveryInfo?.trackingNumber || deliveryInfo?.shippedAt,
  );
  const pickupCanceled =
    pickupStatusText === "예약취소" || pickupStatusCode === "03";
  const delivered = Boolean(deliveryInfo?.deliveredAt);
  const pickedUp = Boolean(
    deliveryInfo?.pickedUpAt || pickupStatusCode === "11",
  );

  return {
    wasPickedUp,
    pickupStatusCode,
    pickupStatusText,
    pickupCanceled,
    delivered,
    pickedUp,
  };
};

export const emitDeliveryUpdated = async (requestDoc, extra = {}) => {
  const deliveryInfoRef = requestDoc?.deliveryInfoRef;
  let deliveryInfo =
    deliveryInfoRef && typeof deliveryInfoRef === "object"
      ? deliveryInfoRef
      : null;

  if (!deliveryInfo) {
    const deliveryInfoId = String(
      deliveryInfoRef?._id || deliveryInfoRef || "",
    ).trim();
    if (deliveryInfoId && Types.ObjectId.isValid(deliveryInfoId)) {
      deliveryInfo = await DeliveryInfo.findById(deliveryInfoId)
        .lean()
        .catch(() => null);
    }
  }

  const requestForEvent = deliveryInfo
    ? {
        ...(typeof requestDoc?.toObject === "function"
          ? requestDoc.toObject()
          : requestDoc),
        deliveryInfoRef: deliveryInfo,
      }
    : requestDoc;

  const normalized = await normalizeRequestForResponse(requestForEvent);
  const deliveryMeta = buildDeliveryMeta(deliveryInfo);
  if (normalized && typeof normalized === "object") {
    normalized.wasPickedUp = deliveryMeta.wasPickedUp;
    normalized.pickupStatusCode = deliveryMeta.pickupStatusCode;
    normalized.pickupStatusText = deliveryMeta.pickupStatusText;
  }
  emitAppEventToRoles(["manufacturer", "admin"], "request:delivery-updated", {
    requestId: String(requestDoc?.requestId || "").trim() || null,
    requestMongoId: String(requestDoc?._id || "").trim() || null,
    request: normalized,
    deliveryMeta,
    ...extra,
  });
};

export const syncHanjinTrackingPayload = async ({
  payload = {},
  headers = {},
  enforceSecret = false,
}) => {
  const secret = String(process.env.HANJIN_WEBHOOK_SECRET || "").trim();
  const provided = String(headers["x-webhook-secret"] || "").trim();

  if (
    enforceSecret &&
    process.env.NODE_ENV === "production" &&
    secret &&
    provided !== secret
  ) {
    return {
      ok: false,
      statusCode: 401,
      body: { success: false, message: "Unauthorized webhook" },
    };
  }

  const trackingNumber = String(
    payload.trackingNumber || payload.waybillNo || payload.wblNum || "",
  ).trim();

  const requestIdRaw = String(
    payload.requestId || payload.request || "",
  ).trim();
  const requestObjectId =
    requestIdRaw && Types.ObjectId.isValid(requestIdRaw)
      ? new Types.ObjectId(requestIdRaw)
      : null;

  if (!trackingNumber && !requestObjectId) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        success: false,
        message: "trackingNumber 또는 requestId(ObjectId)가 필요합니다.",
      },
    };
  }

  const carrier = String(payload.carrier || payload.courier || "hanjin").trim();
  const events = normalizeTrackingEvents(payload.events);
  const last = events.length ? events[events.length - 1] : null;
  const deliveredAt = parseDate(payload.deliveredAt || payload.deliveredTime);
  const shippedAt = parseDate(payload.shippedAt || payload.shippedTime);

  let request = null;
  if (requestObjectId) {
    request = await Request.findById(requestObjectId);
  } else {
    request = await Request.findOne({ deliveryInfoRef: { $ne: null } })
      .populate("deliveryInfoRef")
      .then(async (r) => {
        if (!r) return null;
        const di = r.deliveryInfoRef;
        if (!di || typeof di === "string") return null;
        return String(di.trackingNumber || "").trim() === trackingNumber
          ? r
          : null;
      });

    if (!request) {
      const di = await DeliveryInfo.findOne({ trackingNumber });
      if (di?.request) {
        request = await Request.findById(di.request);
      }
    }
  }

  if (!request) {
    return {
      ok: false,
      statusCode: 404,
      body: { success: false, message: "의뢰를 찾을 수 없습니다." },
    };
  }

  let deliveryInfo = null;
  if (request.deliveryInfoRef) {
    deliveryInfo = await DeliveryInfo.findById(request.deliveryInfoRef);
  }

  if (!deliveryInfo) {
    deliveryInfo = await DeliveryInfo.create({
      request: request._id,
      trackingNumber: trackingNumber || undefined,
      carrier: carrier || undefined,
    });
    request.deliveryInfoRef = deliveryInfo._id;
  }

  if (trackingNumber) deliveryInfo.trackingNumber = trackingNumber;
  if (carrier) deliveryInfo.carrier = carrier;
  if (shippedAt && !deliveryInfo.shippedAt) deliveryInfo.shippedAt = shippedAt;
  if (deliveredAt) deliveryInfo.deliveredAt = deliveredAt;

  if (last) {
    deliveryInfo.tracking = deliveryInfo.tracking || {};
    if (last.statusCode) deliveryInfo.tracking.lastStatusCode = last.statusCode;
    if (last.statusText) deliveryInfo.tracking.lastStatusText = last.statusText;
    if (last.occurredAt) deliveryInfo.tracking.lastEventAt = last.occurredAt;
    deliveryInfo.tracking.lastSyncedAt = new Date();
  } else {
    deliveryInfo.tracking = deliveryInfo.tracking || {};
    deliveryInfo.tracking.lastSyncedAt = new Date();
  }

  if (events.length) {
    const existingKey = new Set(
      (deliveryInfo.events || []).map((e) =>
        [
          String(e?.statusCode || ""),
          String(e?.statusText || ""),
          e?.occurredAt ? new Date(e.occurredAt).toISOString() : "",
        ].join("|"),
      ),
    );

    deliveryInfo.events = Array.isArray(deliveryInfo.events)
      ? deliveryInfo.events
      : [];
    for (const ev of events) {
      const key = [
        String(ev.statusCode || ""),
        String(ev.statusText || ""),
        ev.occurredAt ? new Date(ev.occurredAt).toISOString() : "",
      ].join("|");
      if (existingKey.has(key)) continue;
      existingKey.add(key);
      deliveryInfo.events.push(ev);
    }
  }

  await deliveryInfo.save();

  const debug = toBool(process.env.DEBUG_HANJIN_WEBHOOK);

  if (deliveryInfo.deliveredAt) {
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.shipping = request.caseInfos.reviewByStage
      .shipping || {
      status: "PENDING",
    };
    request.caseInfos.reviewByStage.shipping = {
      ...request.caseInfos.reviewByStage.shipping,
      status: "APPROVED",
      updatedAt: new Date(),
      updatedBy: null,
      reason: "",
    };

    request.timeline = request.timeline || {};
    if (!request.timeline.actualCompletion) {
      request.timeline.actualCompletion = deliveryInfo.deliveredAt;
    }

    // 수익 분배 SSOT는 CAM 승인(의뢰비 확정) 시점의
    // distributeCommissionOnRequestSpend에서만 처리합니다.
    // 추적 동기화 경로에서는 정산/수수료 원장에 쓰지 않습니다.
  }

  if (isTrackingStageEligible(deliveryInfo)) {
    request.manufacturerStage = "추적관리";
    request.status = "추적관리";
  } else {
    request.manufacturerStage = "포장.발송";
    request.status = "포장.발송";
  }

  await request.save();
  await emitDeliveryUpdated(request, {
    source: enforceSecret ? "hanjin-webhook" : "hanjin-tracking-event",
  });

  if (debug) {
    console.log("[hanjinTracking] synced", {
      requestId: String(request._id),
      trackingNumber: deliveryInfo.trackingNumber,
      deliveredAt: deliveryInfo.deliveredAt || null,
      events: Array.isArray(deliveryInfo.events)
        ? deliveryInfo.events.length
        : 0,
    });
  }

  return {
    ok: true,
    statusCode: 200,
    body: {
      success: true,
      data: {
        requestId: request._id,
        deliveryInfoId: deliveryInfo._id,
      },
    },
    request,
    deliveryInfo,
  };
};
