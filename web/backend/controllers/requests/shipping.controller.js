import Request from "../../models/request.model.js";
import { Types } from "mongoose";

import {
  applyStatusMapping,
  applyShippingWorkflowState,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
  SHIPPING_WORKFLOW_CODES,
  SHIPPING_WORKFLOW_LABELS,
} from "./utils.js";

import {
  applyTrackingRowsToRequests,
  extractTrackingRows,
  HANJIN_CLIENT_ID,
  hasPickupCompleted,
  resolveTrackingSyncTargets,
} from "./shipping.Tracking.helpers.js";
import { startHanjinTrackingPoll } from "./shipping.TrackingPoller.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";

/**
 * MOCK 집하 완료 시뮬레이션 (Hanjin status code 11)
 * @route POST /api/requests/shipping/hanjin/mock-pickup-complete
 */
export async function mockHanjinPickupCompleted(req, res) {
  try {
    const { requestIds, trackingNumbers, mailboxAddresses } = req.body || {};
    let targetRequests = await resolveTrackingSyncTargets({
      requestIds,
      trackingNumbers,
    });

    const mailboxList = Array.isArray(mailboxAddresses)
      ? mailboxAddresses
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];

    if (mailboxList.length) {
      const mailboxRequests = await Request.find({
        mailboxAddress: { $in: mailboxList },
        manufacturerStage: "포장.발송",
      })
        .populate("requestor", "name business phoneNumber address")
        .populate("requestorBusinessId", "name extracted")
        .populate("deliveryInfoRef");

      const merged = new Map();
      [...targetRequests, ...mailboxRequests].forEach((requestDoc) => {
        const key = String(
          requestDoc?.requestId || requestDoc?._id || "",
        ).trim();
        if (key) merged.set(key, requestDoc);
      });
      targetRequests = Array.from(merged.values());
    }

    if (!targetRequests.length) {
      return res.status(404).json({
        success: false,
        message: "MOCK 집하 처리할 배송건을 찾을 수 없습니다.",
      });
    }

    const now = new Date();
    const rowMap = new Map();

    for (const requestDoc of targetRequests) {
      let deliveryInfo = requestDoc.deliveryInfoRef;
      if (!deliveryInfo && requestDoc.deliveryInfoRef) {
        deliveryInfo = await DeliveryInfo.findById(requestDoc.deliveryInfoRef);
      }
      const trackingNumber = String(deliveryInfo?.trackingNumber || "").trim();
      if (!trackingNumber) continue;

      rowMap.set(trackingNumber, {
        wblNo: trackingNumber,
        wrkList: [
          {
            statusCode: "11",
            statusName: "집하완료",
            statusDate: now.toISOString(),
            agencyName: "MOCK",
            description: "수동 MOCK 집하",
          },
        ],
      });
    }

    const synced = await applyTrackingRowsToRequests({
      requestDocs: targetRequests,
      rowMap,
      actorUserId: req.user?._id || null,
      source: "hanjin-tracking-mock-pickup",
    });

    return res.status(200).json({
      success: true,
      data: {
        synced,
        pickedUpCount: synced.filter((item) =>
          hasPickupCompleted(item?.statusCode),
        ).length,
      },
    });
  } catch (error) {
    console.error("Error in mockHanjinPickupCompleted:", error);
    return res.status(500).json({
      success: false,
      message: "MOCK 집하 처리 중 오류가 발생했습니다.",
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

/**
 * 한진 배송정보 복수건 동기화
 * @route POST /api/requests/shipping/hanjin/tracking-sync
 */
export async function syncHanjinTracking(req, res) {
  try {
    const { requestIds, trackingNumbers } = req.body || {};

    const targetRequests = await resolveTrackingSyncTargets({
      requestIds,
      trackingNumbers,
    });

    if (!targetRequests.length) {
      return res.status(404).json({
        success: false,
        message: "동기화할 배송정보를 찾을 수 없습니다.",
      });
    }

    const path = "/parcel-delivery/v1/tracking/tracking-wbls";
    const wblNoList = targetRequests.map((requestDoc) => ({
      wblNo: String(requestDoc.deliveryInfoRef?.trackingNumber || "").trim(),
    }));

    const data = await hanjinService.requestOrderApi({
      path,
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
      requestDocs: targetRequests,
      rowMap,
      actorUserId: req.user?._id || null,
      source: "hanjin-tracking-sync",
    });

    await startHanjinTrackingPoll({
      requestIds: targetRequests.map((requestDoc) =>
        String(requestDoc.requestId || "").trim(),
      ),
      actorUserId: req.user?._id || null,
      source: "hanjin-tracking-sync-poll",
      runImmediate: false,
    });

    return res.status(200).json({
      success: true,
      data: {
        synced,
      },
    });
  } catch (error) {
    console.error("Error in syncHanjinTracking:", error);
    return res.status(error?.status || 500).json({
      success: false,
      message: "한진 배송조회 동기화 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}
