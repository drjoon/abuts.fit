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
import { chargeShippingFeeOnPickupComplete } from "./shipping.Requestor.helpers.js";

/**
 * MOCK 집하 완료 시뮬레이션 (Hanjin status code 11)
 * @route POST /api/requests/shipping/hanjin/mock-pickup-complete
 */
export async function mockHanjinPickupCompleted(req, res) {
  try {
    const { requestIds = [] } = req.body || {};

    const idList = Array.isArray(requestIds)
      ? requestIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!idList.length) {
      return res.status(400).json({
        success: false,
        message: "requestIds가 필요합니다.",
      });
    }

    const targetRequests = await Request.find({
      requestId: { $in: idList },
    })
      .populate("requestor", "name business phoneNumber address")
      .populate("businessAnchorId", "name metadata")
      .populate("deliveryInfoRef");

    if (!targetRequests.length) {
      return res.status(404).json({
        success: false,
        message: "MOCK 집하 처리할 배송건을 찾을 수 없습니다.",
      });
    }

    const now = new Date();
    const pickedUpCount = [];

    // 같은 박스의 의뢰건들을 그룹핑 (shippingPackageId 기준)
    const boxMap = new Map();
    for (const requestDoc of targetRequests) {
      const packageId = String(requestDoc.shippingPackageId || "");
      if (!boxMap.has(packageId)) {
        boxMap.set(packageId, []);
      }
      boxMap.get(packageId).push(requestDoc);
    }

    console.log(
      `[MOCK_PICKUP] Found ${boxMap.size} boxes with ${targetRequests.length} requests`,
    );

    // 취소 처리와 동일한 방식으로 직접 처리
    for (const requestDoc of targetRequests) {
      let deliveryInfo = requestDoc.deliveryInfoRef;

      // deliveryInfo 로드
      if (!deliveryInfo || typeof deliveryInfo === "string") {
        const refId =
          typeof deliveryInfo === "string" ? deliveryInfo : deliveryInfo?._id;
        if (refId) {
          deliveryInfo = await DeliveryInfo.findById(refId);
        }
      }

      if (!deliveryInfo) {
        console.log(
          `[MOCK_PICKUP] SKIP: no deliveryInfo for ${requestDoc.requestId}`,
        );
        continue;
      }

      let trackingNumber = String(deliveryInfo?.trackingNumber || "").trim();

      // trackingNumber가 없으면 shippingPackageId 기반으로 생성
      if (!trackingNumber) {
        const packageId = String(requestDoc.shippingPackageId || "");
        trackingNumber = `MOCK-${packageId}-${now.getTime()}`;
        console.log(
          `[MOCK_PICKUP] Generated trackingNumber for ${requestDoc.requestId}: ${trackingNumber}`,
        );
      }

      console.log(
        `[MOCK_PICKUP] processing requestId=${requestDoc.requestId}, trackingNumber=${trackingNumber}`,
      );

      // deliveryInfo 업데이트 (code 11 = 집하완료)
      deliveryInfo.trackingNumber = trackingNumber;
      deliveryInfo.tracking = deliveryInfo.tracking || {};
      deliveryInfo.tracking.lastStatusCode = "11";
      deliveryInfo.tracking.lastStatusText = "집하완료";
      deliveryInfo.tracking.lastEventAt = now;
      deliveryInfo.tracking.lastSyncedAt = now;
      deliveryInfo.pickedUpAt = now;
      await deliveryInfo.save();

      // 배송비 차감
      await chargeShippingFeeOnPickupComplete({
        shippingPackageId: requestDoc.shippingPackageId,
        actorUserId: req.user?._id || null,
      });

      // request 업데이트
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

      // 소켓 이벤트 발송
      await emitDeliveryUpdated(requestDoc, {
        source: "hanjin-tracking-mock-pickup",
        shippingStatusLabel: "집하완료",
      });

      pickedUpCount.push({
        requestId: requestDoc.requestId,
        trackingNumber,
        statusCode: "11",
        statusText: "집하완료",
      });

      console.log(`[MOCK_PICKUP] saved requestId=${requestDoc.requestId}`);
    }

    console.log(`[MOCK_PICKUP] completed count=${pickedUpCount.length}`);

    return res.status(200).json({
      success: true,
      data: {
        pickedUpCount: pickedUpCount.length,
        synced: pickedUpCount,
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
