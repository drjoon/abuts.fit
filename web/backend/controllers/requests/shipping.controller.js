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

import { emitDeliveryUpdated } from "./shipping.Tracking.helpers.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
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
    } = req.body || {};

    const manualTrackingNumber = String(manualTrackingNumberRaw || "").trim();
    const manualCarrier = "hanjin";
    const manualStatusCode = String(manualStatusCodeRaw || "11").trim() || "11";
    const manualStatusText =
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

    // 수동 집하 시각 SSOT: "당일 16:00 KST"
    // 사용자 입력 시각을 받지 않고 서버에서 고정 계산해 기록한다.
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const kstYmd = kstNow.toISOString().slice(0, 10);
    const manualPickedUpAt = new Date(`${kstYmd}T16:00:00+09:00`);

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
    if (!isLegacyMockRoute) {
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
      const mailboxTrackingNumber =
        String(trackingNumberByMailbox?.[mailboxAddress] || "").trim() ||
        manualTrackingNumber ||
        resolveMailboxTrackingNumber(effectiveMailboxRequests, "MOCK", now);

      for (const group of groups) {
        const trackingNumber = mailboxTrackingNumber;
        const processedRequestIds = [];
        const deliverySaveJobs = [];
        const requestSaveJobs = [];
        const emitJobs = [];
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
            console.log(
              `[MANUAL_PICKUP] SKIP: no deliveryInfo for mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}`,
            );
            continue;
          }

          console.log(
            `[MANUAL_PICKUP] processing mailbox=${mailboxAddress}, requestId=${requestDoc.requestId}, trackingNumber=${trackingNumber}`,
          );

          deliveryInfo.trackingNumber = trackingNumber;
          deliveryInfo.carrier = manualCarrier;
          deliveryInfo.tracking = deliveryInfo.tracking || {};
          deliveryInfo.tracking.lastStatusCode = manualStatusCode;
          deliveryInfo.tracking.lastStatusText = manualStatusText;
          deliveryInfo.tracking.lastEventAt = manualPickedUpAt;
          deliveryInfo.tracking.lastSyncedAt = now;
          if (!deliveryInfo.shippedAt) {
            deliveryInfo.shippedAt = manualPickedUpAt;
          }
          deliveryInfo.pickedUpAt = manualPickedUpAt;
          deliverySaveJobs.push(deliveryInfo.save());

          requestDoc.manufacturerStage = "추적관리";
          requestDoc.status = "추적관리";
          applyShippingWorkflowState(requestDoc, {
            code: SHIPPING_WORKFLOW_CODES.PICKED_UP,
            label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PICKED_UP],
            pickedUpAt: manualPickedUpAt,
            trackingStatusCode: manualStatusCode,
            trackingStatusText: manualStatusText,
            source: "hanjin-tracking-manual-pickup",
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
