import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";

const toBool = (v) =>
  String(v || "")
    .trim()
    .toLowerCase() === "true";

const parseDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const normalizeEvents = (events) => {
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

export async function handleHanjinTrackingWebhook(req, res) {
  try {
    const secret = String(process.env.HANJIN_WEBHOOK_SECRET || "").trim();
    const provided = String(req.headers["x-webhook-secret"] || "").trim();

    if (process.env.NODE_ENV === "production" && secret && provided !== secret) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized webhook" });
    }

    const payload = req.body || {};
    const trackingNumber = String(
      payload.trackingNumber || payload.waybillNo || payload.wblNum || "",
    ).trim();

    const requestIdRaw = String(payload.requestId || payload.request || "").trim();
    const requestObjectId =
      requestIdRaw && Types.ObjectId.isValid(requestIdRaw)
        ? new Types.ObjectId(requestIdRaw)
        : null;

    if (!trackingNumber && !requestObjectId) {
      return res.status(400).json({
        success: false,
        message: "trackingNumber 또는 requestId(ObjectId)가 필요합니다.",
      });
    }

    const carrier = String(payload.carrier || payload.courier || "hanjin").trim();

    const events = normalizeEvents(payload.events);
    const last = events.length ? events[events.length - 1] : null;

    const deliveredAt = parseDate(payload.deliveredAt || payload.deliveredTime);
    const shippedAt = parseDate(payload.shippedAt || payload.shippedTime);

    let request = null;
    if (requestObjectId) {
      request = await Request.findById(requestObjectId);
    } else {
      request = await Request.findOne({
        deliveryInfoRef: { $ne: null },
      })
        .populate("deliveryInfoRef")
        .then(async (r) => {
          if (!r) return null;
          const di = r.deliveryInfoRef;
          if (!di || typeof di === "string") return null;
          return String(di.trackingNumber || "").trim() === trackingNumber ? r : null;
        });

      if (!request) {
        const di = await DeliveryInfo.findOne({ trackingNumber });
        if (di?.request) {
          request = await Request.findById(di.request);
        }
      }
    }

    if (!request) {
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
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
      request.status2 = "완료";
      request.timeline = request.timeline || {};
      if (!request.timeline.actualCompletion) {
        request.timeline.actualCompletion = deliveryInfo.deliveredAt;
      }
    }

    if (String(request.manufacturerStage || "").trim() !== "추적관리") {
      request.manufacturerStage = "추적관리";
      request.status = "추적관리";
    }

    await request.save();

    if (debug) {
      console.log("[hanjinWebhook] synced", {
        requestId: String(request._id),
        trackingNumber: deliveryInfo.trackingNumber,
        deliveredAt: deliveryInfo.deliveredAt || null,
        events: Array.isArray(deliveryInfo.events) ? deliveryInfo.events.length : 0,
      });
    }

    return res.json({
      success: true,
      data: {
        requestId: request._id,
        deliveryInfoId: deliveryInfo._id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "hanjin webhook 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
