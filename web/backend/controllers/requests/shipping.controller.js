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
  emitDeliveryUpdated,
} from "./shipping.Tracking.helpers.js";
import { startHanjinTrackingPoll } from "./shipping.TrackingPoller.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";

/**
 * MOCK 집하 완료 시뮬레이션 (Hanjin status code 11)
 * @route POST /api/requests/shipping/hanjin/mock-pickup-complete
 */
export async function mockHanjinPickupCompleted(req, res) {
  try {
    const { mailboxAddresses = [] } = req.body || {};

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

    const targetRequests = await Request.find({
      mailboxAddress: { $in: addressList },
    })
      .populate("requestor", "name business phoneNumber address")
      .populate("businessAnchorId", "name metadata")
      .populate("deliveryInfoRef");

    if (!targetRequests.length) {
      return res.status(404).json({
        success: false,
        message: "MOCK 집하 처리할 우편함을 찾을 수 없습니다.",
      });
    }

    const now = new Date();
    const byMailbox = new Map();

    for (const requestDoc of targetRequests) {
      const mailboxAddress = String(requestDoc?.mailboxAddress || "").trim();
      if (!mailboxAddress) continue;
      if (!byMailbox.has(mailboxAddress)) {
        byMailbox.set(mailboxAddress, []);
      }
      byMailbox.get(mailboxAddress).push(requestDoc);
    }

    const results = [];

    console.log(
      `[MOCK_PICKUP] Found ${byMailbox.size} mailboxes with ${targetRequests.length} requests`,
    );

    for (const mailboxAddress of addressList) {
      const group = byMailbox.get(mailboxAddress) || [];
      if (!group.length) {
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

      let trackingNumber = "";
      for (const requestDoc of group) {
        const candidate = String(
          requestDoc?.deliveryInfoRef?.trackingNumber || "",
        ).trim();
        if (candidate) {
          trackingNumber = candidate;
          break;
        }
      }

      if (!trackingNumber) {
        const fallbackPackageId = String(
          group[0]?.shippingPackageId || mailboxAddress,
        ).trim();
        trackingNumber = `MOCK-${fallbackPackageId}-${now.getTime()}`;
      }

      const processedRequestIds = [];

      for (const requestDoc of group) {
        let deliveryInfo = requestDoc.deliveryInfoRef;

        if (!deliveryInfo || typeof deliveryInfo === "string") {
          const refId =
            typeof deliveryInfo === "string" ? deliveryInfo : deliveryInfo?._id;
          if (refId) {
            deliveryInfo = await DeliveryInfo.findById(refId);
          }
        }

        if (!deliveryInfo) {
          console.log(
            `[MOCK_PICKUP] SKIP: no deliveryInfo for mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}`,
          );
          continue;
        }

        console.log(
          `[MOCK_PICKUP] processing mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}, trackingNumber=${trackingNumber}`,
        );

        deliveryInfo.trackingNumber = trackingNumber;
        deliveryInfo.tracking = deliveryInfo.tracking || {};
        deliveryInfo.tracking.lastStatusCode = "11";
        deliveryInfo.tracking.lastStatusText = "집하완료";
        deliveryInfo.tracking.lastEventAt = now;
        deliveryInfo.tracking.lastSyncedAt = now;
        deliveryInfo.pickedUpAt = now;
        await deliveryInfo.save();

        requestDoc.manufacturerStage = "추적관리";
        requestDoc.status = "추적관리";
        applyShippingWorkflowState(requestDoc, {
          code: SHIPPING_WORKFLOW_CODES.PICKED_UP,
          label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PICKED_UP],
          pickedUpAt: now,
          trackingStatusCode: "11",
          trackingStatusText: "집하완료",
          source: "hanjin-tracking-mock-pickup",
          updatedAt: now,
        });
        await requestDoc.save();

        await emitDeliveryUpdated(requestDoc, {
          source: "hanjin-tracking-mock-pickup",
          shippingStatusLabel: "집하완료",
        });

        processedRequestIds.push(requestDoc.requestId);
      }

      results.push({
        mailboxAddress,
        success: processedRequestIds.length > 0,
        requestCount: group.length,
        processedCount: processedRequestIds.length,
        requestIds: processedRequestIds,
        trackingNumber,
        statusCode: "11",
        statusText: "집하완료",
      });
    }

    const pickedUpCount = results.filter((item) => item.success).length;

    console.log(`[MOCK_PICKUP] completed count=${pickedUpCount}`);

    return res.status(200).json({
      success: true,
      data: {
        pickedUpCount,
        synced: results,
        results,
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
