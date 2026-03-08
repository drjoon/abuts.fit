import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
import { emitAppEventToRoles } from "../../socket.js";
import { Types } from "mongoose";
import {
  applyStatusMapping,
  bumpRollbackCount,
  normalizeRequestForResponse,
  ensureReviewByStageDefaults,
} from "./utils.js";
import { chargeShippingFeeOnPickupComplete } from "./shipping.Requestor.helpers.js";
import {
  buildMailboxChangeResponse,
  buildMailboxChangeSet,
  executeIntegratedCapturedStep,
} from "./shipping.MailboxRealtime.helpers.js";
import {
  applyTrackingRowsToRequests,
  extractTrackingRows,
  HANJIN_CLIENT_ID,
  resolveTrackingSyncTargets,
  syncHanjinTrackingPayload,
} from "./shipping.Tracking.helpers.js";
import { startHanjinTrackingPoll } from "./shipping.TrackingPoller.js";

const emitDeliveryUpdated = async (requestDoc, extra = {}) => {
  const normalized = await normalizeRequestForResponse(requestDoc);
  emitAppEventToRoles(["manufacturer", "admin"], "request:delivery-updated", {
    requestId: String(requestDoc?.requestId || "").trim() || null,
    requestMongoId: String(requestDoc?._id || "").trim() || null,
    request: normalized,
    ...extra,
  });
};

const buildPickupAndPrintResponseData = ({
  pickupData,
  labelData,
  mailboxChangeResponse,
}) => ({
  pickup: pickupData,
  label: labelData,
  ...(mailboxChangeResponse || {}),
  address_list: Array.isArray(labelData?.address_list)
    ? labelData.address_list
    : [],
  zplLabels: Array.isArray(labelData?.zplLabels) ? labelData.zplLabels : [],
});

const buildResolvedLabelData = ({ data, metaByMsgKey = {} }) => {
  const enrichedData =
    data && typeof data === "object"
      ? {
          ...data,
          address_list: enrichHanjinAddressList({
            addressList: data.address_list,
            metaByMsgKey,
          }),
        }
      : data;

  const zplLabels =
    enrichedData && typeof enrichedData === "object"
      ? buildHanjinWblZplLabels({ addressList: enrichedData.address_list })
      : [];

  return {
    ...(enrichedData || {}),
    zplLabels,
  };
};

const buildLabelPrintExecutionResult = ({ labelData, wblPrint }) => ({
  labelData,
  wblPrint,
});

const buildPrintLabelsSuccessPayload = ({ labelData, wblPrint }) => ({
  success: true,
  data: labelData,
  wblPrint,
});

const buildPickupAndPrintSuccessPayload = ({
  pickupData,
  labelData,
  mailboxChangeResponse,
  wblPrint,
}) => ({
  success: true,
  data: buildPickupAndPrintResponseData({
    pickupData,
    labelData,
    mailboxChangeResponse,
  }),
  wblPrint,
});

const buildMailboxChangeResponseWithChangedAddresses = ({
  mailboxChangeResponse,
  changedMailboxAddresses,
}) => ({
  ...(mailboxChangeResponse || {}),
  changedMailboxAddresses: Array.isArray(changedMailboxAddresses)
    ? changedMailboxAddresses
    : [],
});

const buildIntegratedMailboxChangePayload = ({
  mailboxChangeResponse,
  changedMailboxAddressesBeforePrint,
}) =>
  buildMailboxChangeResponseWithChangedAddresses({
    mailboxChangeResponse,
    changedMailboxAddresses: changedMailboxAddressesBeforePrint,
  });

const buildIntegratedPickupAndPrintSuccessResponse = ({
  pickupBody,
  printBody,
  mailboxChangeResponse,
  changedMailboxAddressesBeforePrint,
}) =>
  buildPickupAndPrintSuccessPayload({
    pickupData: pickupBody?.data,
    labelData: printBody?.data,
    mailboxChangeResponse: buildIntegratedMailboxChangePayload({
      mailboxChangeResponse,
      changedMailboxAddressesBeforePrint,
    }),
    wblPrint: printBody?.wblPrint,
  });

const buildIntegratedPrintRequest = ({
  req,
  mailboxAddresses,
  wblPrintOptions,
}) => ({
  ...req,
  body: {
    mailboxAddresses,
    payload: null,
    wblPrintOptions,
  },
});

const executeIntegratedPickupAndPrintFlow = async ({
  req,
  res,
  mailboxAddresses,
  wblPrintOptions,
}) => {
  const {
    changedMailboxAddressesBeforePrint,
    mailboxChangeResponse,
    selectedRequestsBeforePrint,
  } = await preparePickupAndPrintChangeContext(mailboxAddresses);
  const printTargetMailboxAddresses = changedMailboxAddressesBeforePrint.length
    ? changedMailboxAddressesBeforePrint
    : mailboxAddresses;

  const pickupStep = await executeIntegratedCapturedStep({
    res,
    controllerFn: requestHanjinPickup,
    reqLike: req,
    fallbackMessage: "한진 택배 접수에 실패했습니다.",
  });
  if (!pickupStep.ok) {
    return pickupStep;
  }

  const printReq = buildIntegratedPrintRequest({
    req,
    mailboxAddresses: printTargetMailboxAddresses,
    wblPrintOptions,
  });
  printReq.__resolvedHanjinPayload = {
    mailboxAddresses: printTargetMailboxAddresses,
    requests: Array.isArray(selectedRequestsBeforePrint)
      ? selectedRequestsBeforePrint.filter((requestDoc) =>
          printTargetMailboxAddresses.includes(
            String(requestDoc?.mailboxAddress || "").trim(),
          ),
        )
      : [],
  };

  const printStep = await executeIntegratedCapturedStep({
    res,
    controllerFn: printHanjinLabels,
    reqLike: printReq,
    fallbackMessage: "운송장 출력에 실패했습니다.",
  });
  if (!printStep.ok) {
    return printStep;
  }

  return {
    ok: true,
    payload: buildIntegratedPickupAndPrintSuccessResponse({
      pickupBody: pickupStep.body,
      printBody: printStep.body,
      mailboxChangeResponse,
      changedMailboxAddressesBeforePrint,
    }),
    printTargetMailboxAddresses,
    pickupStep,
    printStep,
  };
};

const preparePickupAndPrintChangeContext = async (mailboxAddresses = []) => {
  const selectedRequestsBeforePrint =
    await findPrePrintSnapshotRequests(mailboxAddresses);
  const mailboxChangesBeforePrint = buildMailboxChangeSet(
    selectedRequestsBeforePrint,
  );
  const changedMailboxAddressesBeforePrint = mailboxAddresses.filter(
    (address) => mailboxChangesBeforePrint.get(address)?.changed,
  );

  return {
    selectedRequestsBeforePrint,
    mailboxChangesBeforePrint,
    changedMailboxAddressesBeforePrint,
    mailboxChangeResponse: buildMailboxChangeResponse({
      mailboxAddresses,
      changeSet: mailboxChangesBeforePrint,
    }),
  };
};

const resolveMailboxList = (mailboxAddresses) =>
  Array.isArray(mailboxAddresses)
    ? mailboxAddresses.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

const extractTrackingNumberFromPickupData = (data) => {
  const candidates = [
    data?.trackingNumber,
    data?.waybillNumber,
    data?.wbl_num,
    data?.wblNum,
    data?.invoiceNo,
    data?.invoiceNumber,
    data?.orderNo,
    data?.orderNumber,
    data?.data?.trackingNumber,
    data?.data?.waybillNumber,
    data?.data?.wbl_num,
    data?.data?.wblNum,
    data?.result?.trackingNumber,
    data?.result?.waybillNumber,
    data?.result?.wbl_num,
    data?.result?.wblNum,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "";
};

async function finalizeMailboxPickupShipment({
  requests,
  pickupData,
  actorUserId,
}) {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  if (!list.length) return [];

  const pkg = await ensureShippingPackageForPickup({
    requests: list,
    actorUserId,
  });
  const trackingNumber = extractTrackingNumberFromPickupData(pickupData);
  const actualShipPickup = new Date();
  const updatedIds = [];

  for (const request of list) {
    let deliveryInfo = null;
    if (request.deliveryInfoRef) {
      deliveryInfo = await DeliveryInfo.findById(request.deliveryInfoRef);
    }

    if (!deliveryInfo) {
      deliveryInfo = await DeliveryInfo.create({
        request: request._id,
        trackingNumber: trackingNumber || undefined,
        carrier: "hanjin",
        shippedAt: actualShipPickup,
      });
      request.deliveryInfoRef = deliveryInfo._id;
    } else {
      if (trackingNumber) {
        deliveryInfo.trackingNumber = trackingNumber;
      }
      deliveryInfo.carrier = "hanjin";
      if (!deliveryInfo.shippedAt) {
        deliveryInfo.shippedAt = actualShipPickup;
      }
      await deliveryInfo.save();
    }

    ensureReviewByStageDefaults(request);
    request.caseInfos.reviewByStage.shipping = {
      ...request.caseInfos.reviewByStage.shipping,
      status: "APPROVED",
      updatedAt: actualShipPickup,
      updatedBy: actorUserId || null,
      reason: "",
    };

    applyStatusMapping(request, "포장.발송");
    request.productionSchedule = request.productionSchedule || {};
    request.productionSchedule.actualShipPickup = actualShipPickup;
    request.shippingPackageId = pkg._id;

    await request.save();
    updatedIds.push(String(request.requestId || "").trim());
  }

  console.log("[HANJIN_PICKUP_FINALIZED] finalized shipment", {
    shippingPackageId: String(pkg._id),
    trackingNumber: trackingNumber || null,
    requestIds: updatedIds,
  });

  return updatedIds;
}

async function finalizeMailboxPickupResult({
  mailbox,
  group,
  pickupData,
  actorUserId,
}) {
  const requestDocs = await Request.find({
    _id: { $in: group.map((request) => request._id) },
    manufacturerStage: "포장.발송",
  });

  const updatedIds = await finalizeMailboxPickupShipment({
    requests: requestDocs,
    pickupData,
    actorUserId,
  });

  const updatedDocs = await Request.find({
    _id: { $in: requestDocs.map((request) => request._id) },
  })
    .populate("requestor", "name organization phoneNumber address")
    .populate("requestorOrganizationId", "name extracted")
    .populate("deliveryInfoRef");

  for (const doc of updatedDocs) {
    await emitDeliveryUpdated(doc, {
      source: "hanjin-pickup",
      shippingStatusLabel: buildTrackingStatusLabel(doc.deliveryInfoRef),
    });
  }

  return {
    mailbox,
    success: true,
    data: pickupData,
    updatedIds,
  };
}

async function executeSingleMailboxPickup({
  mailbox,
  group,
  path,
  pathCandidates,
  callHanjinWithFallback,
  actorUserId,
}) {
  const orderBody = buildHanjinInsertOrderBody({
    mailbox,
    requests: group,
  });

  console.log("[hanjin][pickup] mailbox organization debug", {
    mailbox,
    organizations: group.map((request) => ({
      requestId: String(request?.requestId || "").trim(),
      requestorOrganizationId:
        request?.requestorOrganizationId &&
        typeof request.requestorOrganizationId === "object"
          ? String(request.requestorOrganizationId?._id || "").trim()
          : String(request?.requestorOrganizationId || "").trim(),
      requestorOrganizationName:
        request?.requestorOrganizationId &&
        typeof request.requestorOrganizationId === "object"
          ? String(request.requestorOrganizationId?.name || "").trim()
          : "",
      extractedCompanyName: String(
        request?.requestorOrganizationId?.extracted?.companyName || "",
      ).trim(),
      requestorOrganization: String(
        request?.requestor?.organization || "",
      ).trim(),
      clinicName: String(request?.caseInfos?.clinicName || "").trim(),
      resolvedOrganizationName: resolveRequestOrganizationName(request),
      receiverZipSource: String(resolveReceiverZipSource(request) || "").trim(),
      requestorAddress: request?.requestor?.address || null,
      requestorAddressText: String(
        request?.requestor?.addressText || "",
      ).trim(),
      extractedAddress: String(
        request?.requestorOrganizationId?.extracted?.address || "",
      ).trim(),
    })),
  });

  console.log("[hanjin][pickup] mailbox order body", {
    mailbox,
    requestCount: group.length,
    path,
    pathCandidates,
    orderBody,
  });

  const data = await callHanjinWithFallback({ data: orderBody });
  return finalizeMailboxPickupResult({
    mailbox,
    group,
    pickupData: data,
    actorUserId,
  });
}

async function resolveHanjinPayload({ mailboxAddresses, payload }) {
  const preResolvedRequests = Array.isArray(this?.requests)
    ? this.requests
    : null;
  if (payload && typeof payload === "object") {
    return {
      payload,
      metaByMsgKey: {},
      usedDbRequests: false,
      requestIds: [],
    };
  }

  const list = resolveMailboxList(mailboxAddresses);
  if (!list.length) {
    const error = new Error("mailboxAddresses가 필요합니다.");
    error.statusCode = 400;
    throw error;
  }

  const requests = preResolvedRequests?.length
    ? preResolvedRequests
    : await findPackingStageRequestsByMailboxes(list, {
        lean: true,
      });

  if (!requests.length) {
    const error = new Error("조건에 맞는 의뢰를 찾을 수 없습니다.");
    error.statusCode = 404;
    throw error;
  }

  const built = buildHanjinDraftPayload(requests, list);

  return {
    payload: built.payload,
    metaByMsgKey: built.metaByMsgKey || {},
    usedDbRequests: true,
    requestIds: requests
      .map((req) => String(req?.requestId || "").trim())
      .filter(Boolean),
  };
}

const groupRequestsByMailbox = (requests = []) => {
  const byMailbox = new Map();
  for (const request of Array.isArray(requests) ? requests : []) {
    const mailbox = String(request?.mailboxAddress || "").trim();
    if (!mailbox) continue;
    if (!byMailbox.has(mailbox)) byMailbox.set(mailbox, []);
    byMailbox.get(mailbox).push(request);
  }
  return byMailbox;
};

const resolveHanjinPath = (envKey, fallbackPath) => {
  const raw = String(process.env[envKey] || "").trim();
  if (raw) return raw;
  return fallbackPath || "";
};

const buildHanjinPathCandidates = (rawPath) => {
  const path = String(rawPath || "").trim();
  if (!path) return [];

  const candidates = [path];
  if (path.startsWith("/api/")) {
    candidates.push(path.replace(/^\/api\//, "/"));
  }

  return [...new Set(candidates)];
};

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
