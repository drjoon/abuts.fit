import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import hanjinService from "../../services/hanjin.service.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  applyStatusMapping,
  applyShippingWorkflowState,
  normalizeRequestForResponse,
  ensureReviewByStageDefaults,
  SHIPPING_WORKFLOW_CODES,
  SHIPPING_WORKFLOW_LABELS,
} from "./utils.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";
import { ensureShippingPackageForPickup } from "./shipping.Requestor.helpers.js";
import {
  buildHanjinInsertOrderBody,
  buildHanjinOrderFallbackCaller,
  buildHanjinPathCandidates,
  debugHanjinPrintPayload,
  executeHanjinLabelPrint,
  findPackingStageRequestsByMailboxes,
  getHanjinPathFallbacks,
  getWblPrintSettingsPayload,
  resolveHanjinPath,
  resolveHanjinPayload,
  resolveMailboxList,
  ensureHanjinEnv,
  HANJIN_CLIENT_ID,
} from "./shipping.Hanjin.helpers.js";
import {
  buildMailboxChangeResponse,
  buildMailboxChangeSet,
  executeIntegratedCapturedStep,
  persistPrintedMailboxState,
} from "./shipping.MailboxRealtime.helpers.js";
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
  pickupUpdatedMailboxAddresses = [],
  timings,
}) => ({
  pickup: pickupData,
  label: labelData,
  ...(mailboxChangeResponse || {}),
  pickupUpdatedMailboxAddresses: Array.isArray(pickupUpdatedMailboxAddresses)
    ? pickupUpdatedMailboxAddresses
    : [],
  ...(timings ? { timings } : {}),
  address_list: Array.isArray(labelData?.address_list)
    ? labelData.address_list
    : [],
  zplLabels: Array.isArray(labelData?.zplLabels) ? labelData.zplLabels : [],
});

const buildPrintLabelsSuccessPayload = ({
  labelData,
  wblPrint,
  mailboxChangeResponse,
  pickupUpdatedMailboxAddresses = [],
}) => ({
  success: true,
  data: {
    ...(labelData || {}),
    ...(mailboxChangeResponse || {}),
    pickupUpdatedMailboxAddresses: Array.isArray(pickupUpdatedMailboxAddresses)
      ? pickupUpdatedMailboxAddresses
      : [],
  },
  wblPrint,
});

const buildPickupAndPrintSuccessPayload = ({
  pickupData,
  labelData,
  mailboxChangeResponse,
  pickupUpdatedMailboxAddresses,
  wblPrint,
  timings,
}) => ({
  success: true,
  data: buildPickupAndPrintResponseData({
    pickupData,
    labelData,
    mailboxChangeResponse,
    pickupUpdatedMailboxAddresses,
    timings,
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

const buildIntegratedPickupAndPrintSuccessResponse = ({
  pickupBody,
  printBody,
  mailboxChangeResponse,
  changedMailboxAddressesBeforePrint,
  pickupUpdatedMailboxAddresses,
  timings,
}) =>
  buildPickupAndPrintSuccessPayload({
    pickupData: pickupBody?.data,
    labelData: printBody?.data,
    mailboxChangeResponse: buildMailboxChangeResponseWithChangedAddresses({
      mailboxChangeResponse,
      changedMailboxAddresses: changedMailboxAddressesBeforePrint,
    }),
    pickupUpdatedMailboxAddresses,
    wblPrint: printBody?.wblPrint,
    timings,
  });

const nowIso = () => new Date().toISOString();

const buildStepTiming = ({
  startedAtMs,
  finishedAtMs,
  startedAt,
  finishedAt,
}) => ({
  startedAt,
  finishedAt,
  elapsedMs: Math.max(0, finishedAtMs - startedAtMs),
});

const isDuplicateOrderError = (data) => {
  const code = String(data?.resultCode || data?.result_code || "").trim();
  const message = String(
    data?.resultMessage || data?.result_message || "",
  ).trim();
  return code === "ERROR-03" || message.includes("주문번호(custOrdNo) 중복");
};

const buildCancelCaller = () => {
  const cancelPath = resolveHanjinPath(
    "HANJIN_PICKUP_CANCEL_PATH",
    getHanjinPathFallbacks().HANJIN_PICKUP_CANCEL_PATH,
  );
  if (!cancelPath) {
    throw Object.assign(
      new Error("HANJIN_PICKUP_CANCEL_PATH가 설정되지 않았습니다."),
      { statusCode: 400 },
    );
  }
  return buildHanjinOrderFallbackCaller({
    pathCandidates: buildHanjinPathCandidates(cancelPath),
    logPrefix: "[hanjin][pickup-cancel-auto]",
  });
};

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

const findPrePrintSnapshotRequests = async (mailboxAddresses = []) =>
  findPackingStageRequestsByMailboxes(mailboxAddresses, {
    populateRequestor: false,
    select: {
      _id: 1,
      requestId: 1,
      mailboxAddress: 1,
      manufacturerStage: 1,
      shippingLabelPrinted: 1,
    },
  });

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

const findIntegratedPrintRequests = async (mailboxAddresses = []) =>
  findPackingStageRequestsByMailboxes(mailboxAddresses, {
    lean: true,
  });

const buildTrackingStatusLabel = (deliveryInfo) => {
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
    applyShippingWorkflowState(request, {
      code: SHIPPING_WORKFLOW_CODES.ACCEPTED,
      label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.ACCEPTED],
      acceptedAt: actualShipPickup,
      erroredAt: null,
      canceledAt: null,
      source: "hanjin-pickup",
      updatedAt: actualShipPickup,
    });
    request.productionSchedule = request.productionSchedule || {};
    request.productionSchedule.actualShipPickup = actualShipPickup;
    request.shippingPackageId = pkg._id;

    await request.save();
    updatedIds.push(String(request.requestId || "").trim());
  }

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
  const orderBody = buildHanjinInsertOrderBody({ mailbox, requests: group });

  console.log("[hanjin][pickup] mailbox order body", {
    mailbox,
    requestCount: group.length,
    path,
    pathCandidates,
    orderBody,
  });

  let data = await callHanjinWithFallback({ data: orderBody });
  if (isDuplicateOrderError(data)) {
    console.warn(
      "[hanjin][pickup] duplicate order detected, cancel then retry",
      {
        mailbox,
        resultCode: data?.resultCode,
        resultMessage: data?.resultMessage,
        wblNo: data?.wblNo,
        custOrdNo: data?.custOrdNo || orderBody.custOrdNo,
      },
    );
    const cancelHanjinWithFallback = buildCancelCaller();
    const cancelBody = {
      custEdiCd: orderBody.custEdiCd,
      custOrdNo: String(data?.custOrdNo || orderBody.custOrdNo || "").trim(),
    };
    const cancelData = await cancelHanjinWithFallback({ data: cancelBody });
    console.log("[hanjin][pickup] duplicate cancel completed", {
      mailbox,
      cancelBody,
      cancelData,
    });
    data = await callHanjinWithFallback({ data: orderBody });
  }
  return finalizeMailboxPickupResult({
    mailbox,
    group,
    pickupData: data,
    actorUserId,
  });
}

async function markMailboxWorkflowError({
  mailboxAddresses = [],
  actorSource = "hanjin-error",
}) {
  const list = resolveMailboxList(mailboxAddresses);
  if (!list.length) return;

  const requestDocs = await Request.find({
    mailboxAddress: { $in: list },
    manufacturerStage: "포장.발송",
  })
    .populate("requestor", "name organization phoneNumber address")
    .populate("requestorOrganizationId", "name extracted")
    .populate("deliveryInfoRef");

  for (const requestDoc of requestDocs) {
    applyShippingWorkflowState(requestDoc, {
      code: SHIPPING_WORKFLOW_CODES.ERROR,
      label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.ERROR],
      erroredAt: new Date(),
      source: actorSource,
      updatedAt: new Date(),
    });
    await requestDoc.save();
    await emitDeliveryUpdated(requestDoc, {
      source: actorSource,
      shippingStatusLabel:
        SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.ERROR],
    });
  }
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

export async function getWblPrintSettings(req, res) {
  return res.status(200).json({
    success: true,
    data: getWblPrintSettingsPayload(),
  });
}

export async function validateHanjinCustomerCheck(req, res) {
  try {
    ensureHanjinEnv();

    const cntractNo = String(
      req.query?.cntractNo || process.env.HANJIN_CSR_NUM || "",
    ).trim();
    const custBizNo = String(req.query?.custBizNo || "").trim();

    if (!cntractNo) {
      return res.status(400).json({
        success: false,
        message: "cntractNo가 필요합니다.",
      });
    }

    const path = resolveHanjinPath(
      "HANJIN_CUSTOMER_CHECK_PATH",
      getHanjinPathFallbacks().HANJIN_CUSTOMER_CHECK_PATH,
    );
    const params = {
      cntractNo,
      ...(custBizNo ? { custBizNo } : {}),
    };

    const data = await hanjinService.requestCustomerApi({
      path,
      method: "GET",
      params,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in validateHanjinCustomerCheck:", error);
    return res.status(error?.status || 500).json({
      success: false,
      message: "한진 계약번호 검증 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

export async function printHanjinLabels(req, res) {
  try {
    const { mailboxAddresses, payload, wblPrintOptions } = req.body || {};
    const preResolved = req?.__resolvedHanjinPayload || null;
    const normalizedMailboxAddresses = resolveMailboxList(mailboxAddresses);
    const path = resolveHanjinPath(
      "HANJIN_PRINT_WBL_PATH",
      getHanjinPathFallbacks().HANJIN_PRINT_WBL_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PRINT_WBL_PATH가 설정되지 않았습니다.",
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload.call(preResolved, {
        mailboxAddresses,
        payload,
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    debugHanjinPrintPayload(resolved.payload);

    const printRequests = Array.isArray(preResolved?.requests)
      ? preResolved.requests
      : await findPrePrintSnapshotRequests(normalizedMailboxAddresses);
    const mailboxChangeSet = buildMailboxChangeSet(printRequests);
    const mailboxChangeResponse = buildMailboxChangeResponse({
      mailboxAddresses: normalizedMailboxAddresses,
      changeSet: mailboxChangeSet,
    });
    const pickupUpdatedMailboxAddresses = normalizedMailboxAddresses.filter(
      (address) => {
        const group = printRequests.filter(
          (requestDoc) =>
            String(requestDoc?.mailboxAddress || "").trim() === address,
        );
        return group.some(
          (requestDoc) =>
            String(requestDoc?.shippingWorkflow?.code || "").trim() ===
            SHIPPING_WORKFLOW_CODES.ACCEPTED,
        );
      },
    );

    const { labelData, wblPrint } = await executeHanjinLabelPrint({
      path,
      payload: resolved.payload,
      metaByMsgKey: resolved.metaByMsgKey,
      wblPrintOptions,
    });

    await persistPrintedMailboxState({
      mailboxAddresses: normalizedMailboxAddresses,
      requests: printRequests,
    });

    const updatedDocs = await Request.find({
      mailboxAddress: { $in: normalizedMailboxAddresses },
      manufacturerStage: "포장.발송",
    })
      .populate("requestor", "name organization phoneNumber address")
      .populate("requestorOrganizationId", "name extracted")
      .populate("deliveryInfoRef");

    for (const doc of updatedDocs) {
      await emitDeliveryUpdated(doc, {
        source: "hanjin-print",
        shippingStatusLabel:
          SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PRINTED],
      });
    }

    return res.status(200).json(
      buildPrintLabelsSuccessPayload({
        labelData,
        wblPrint,
        mailboxChangeResponse,
        pickupUpdatedMailboxAddresses,
      }),
    );
  } catch (error) {
    console.error("Error in printHanjinLabels:", error);
    await markMailboxWorkflowError({
      mailboxAddresses: req.body?.mailboxAddresses,
      actorSource: "hanjin-print-error",
    });
    return res.status(error?.statusCode || error?.status || 500).json({
      success: false,
      message:
        error?.message || "한진 운송장 출력 요청 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

export async function requestHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath(
      "HANJIN_PICKUP_REQUEST_PATH",
      getHanjinPathFallbacks().HANJIN_PICKUP_REQUEST_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_REQUEST_PATH가 설정되지 않았습니다.",
      });
    }

    if (payload && !Array.isArray(mailboxAddresses)) {
      return res.status(200).json({
        success: true,
        data: {
          mocked: true,
          path,
          payload,
        },
      });
    }

    const list = resolveMailboxList(mailboxAddresses);
    if (!list.length && !(payload && typeof payload === "object")) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const pathCandidates = buildHanjinPathCandidates(path);
    const callHanjinWithFallback = buildHanjinOrderFallbackCaller({
      pathCandidates,
      logPrefix: "[hanjin][pickup]",
    });

    if (payload && typeof payload === "object") {
      const data = await callHanjinWithFallback({ data: payload });
      return res.status(200).json({ success: true, data });
    }

    const requests = await findPackingStageRequestsByMailboxes(list, {
      lean: true,
    });
    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const byMailbox = groupRequestsByMailbox(requests);
    const results = [];
    for (const mailbox of list) {
      const group = byMailbox.get(mailbox) || [];
      if (!group.length) {
        results.push({
          mailbox,
          success: false,
          skipped: true,
          reason: "no_requests",
        });
        continue;
      }
      results.push(
        await executeSingleMailboxPickup({
          mailbox,
          group,
          path,
          pathCandidates,
          callHanjinWithFallback,
          actorUserId: req.user?._id || null,
        }),
      );
    }

    return res.status(200).json({ success: true, data: { results } });
  } catch (error) {
    console.error("Error in requestHanjinPickup:", error);
    await markMailboxWorkflowError({
      mailboxAddresses: req.body?.mailboxAddresses,
      actorSource: "hanjin-pickup-error",
    });
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 접수 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function cancelHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};
    const path = resolveHanjinPath(
      "HANJIN_PICKUP_CANCEL_PATH",
      getHanjinPathFallbacks().HANJIN_PICKUP_CANCEL_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_CANCEL_PATH가 설정되지 않았습니다.",
      });
    }

    if (payload && !Array.isArray(mailboxAddresses)) {
      return res.status(200).json({
        success: true,
        data: { mocked: true, path, payload },
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }
    void resolved;

    const list = resolveMailboxList(mailboxAddresses);
    if (!list.length && !(payload && typeof payload === "object")) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const pathCandidates = buildHanjinPathCandidates(path);
    const callHanjinWithFallback = buildHanjinOrderFallbackCaller({
      pathCandidates,
      logPrefix: "[hanjin][pickup-cancel]",
    });

    if (payload && typeof payload === "object") {
      const data = await callHanjinWithFallback({ data: payload });
      return res.status(200).json({ success: true, data });
    }

    const ymd = getTodayYmdInKst().replace(/-/g, "");
    const results = [];
    for (const mailbox of list) {
      const custOrdNo = `ABUTS_${ymd}_${String(mailbox || "-")}`.slice(0, 30);
      const cancelBody = {
        custEdiCd: HANJIN_CLIENT_ID,
        custOrdNo,
      };
      const data = await callHanjinWithFallback({ data: cancelBody });

      const requestDocs = await Request.find({ mailboxAddress: mailbox })
        .populate("requestor", "name organization phoneNumber address")
        .populate("requestorOrganizationId", "name extracted")
        .populate("deliveryInfoRef");

      for (const requestDoc of requestDocs) {
        if (
          requestDoc.deliveryInfoRef &&
          typeof requestDoc.deliveryInfoRef === "object"
        ) {
          requestDoc.deliveryInfoRef.tracking =
            requestDoc.deliveryInfoRef.tracking || {};
          requestDoc.deliveryInfoRef.tracking.lastStatusCode = "03";
          requestDoc.deliveryInfoRef.tracking.lastStatusText = "예약취소";
          requestDoc.deliveryInfoRef.tracking.lastEventAt = new Date();
          requestDoc.deliveryInfoRef.tracking.lastSyncedAt = new Date();
          await requestDoc.deliveryInfoRef.save();
        }
        requestDoc.manufacturerStage = "포장.발송";
        applyShippingWorkflowState(requestDoc, {
          code: SHIPPING_WORKFLOW_CODES.CANCELED,
          label: SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.CANCELED],
          canceledAt: new Date(),
          trackingStatusCode: "03",
          trackingStatusText: "예약취소",
          source: "hanjin-pickup-cancel",
          updatedAt: new Date(),
        });
        await requestDoc.save();
        updatedIds.push(String(requestDoc.requestId || "").trim());
      }

      const updatedSummary = requestDocs.map((doc) => ({
        requestId: String(doc.requestId || "").trim(),
        shippingWorkflowCode: doc.shippingWorkflow?.code || null,
        manufacturerStage: doc.manufacturerStage,
      }));
      console.log("[hanjin][pickup-cancel] mailbox processed", {
        mailbox,
        updatedCount: requestDocs.length,
        updatedSummary,
        resultCode: data?.resultCode,
      });

      const updatedDocs = await Request.find({
        _id: { $in: requestDocs.map((request) => request._id) },
      });

      results.push({ mailbox, success: true, data });
    }

    return res.status(200).json({ success: true, data: { results } });
  } catch (error) {
    console.error("Error in cancelHanjinPickup:", error);
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 접수 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function requestHanjinPickupAndPrint(req, res) {
  try {
    const body = req.body || {};
    const mailboxAddresses = resolveMailboxList(body.mailboxAddresses);
    if (!mailboxAddresses.length) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const {
      changedMailboxAddressesBeforePrint,
      mailboxChangeResponse,
      selectedRequestsBeforePrint,
    } = await preparePickupAndPrintChangeContext(mailboxAddresses);
    const printTargetMailboxAddresses =
      changedMailboxAddressesBeforePrint.length
        ? changedMailboxAddressesBeforePrint
        : mailboxAddresses;

    const flowStartedAtMs = Date.now();
    const flowStartedAt = nowIso();

    const printStartedAtMs = Date.now();
    const printStartedAt = nowIso();

    const printReq = buildIntegratedPrintRequest({
      req,
      mailboxAddresses: printTargetMailboxAddresses,
      wblPrintOptions: body.wblPrintOptions,
    });
    const selectedRequestsForPrint = await findIntegratedPrintRequests(
      printTargetMailboxAddresses,
    );
    printReq.__resolvedHanjinPayload = {
      mailboxAddresses: printTargetMailboxAddresses,
      requests: Array.isArray(selectedRequestsForPrint)
        ? selectedRequestsForPrint.filter((requestDoc) =>
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
      return printStep.response;
    }

    const printFinishedAtMs = Date.now();
    const printFinishedAt = nowIso();

    const pickupStartedAtMs = Date.now();
    const pickupStartedAt = nowIso();

    const pickupStep = await executeIntegratedCapturedStep({
      res,
      controllerFn: requestHanjinPickup,
      reqLike: req,
      fallbackMessage: "한진 택배 접수에 실패했습니다.",
    });
    if (!pickupStep.ok) {
      return pickupStep.response;
    }

    const pickupFinishedAtMs = Date.now();
    const pickupFinishedAt = nowIso();

    const flowFinishedAtMs = Date.now();
    const flowFinishedAt = nowIso();

    const timings = {
      flow: buildStepTiming({
        startedAtMs: flowStartedAtMs,
        finishedAtMs: flowFinishedAtMs,
        startedAt: flowStartedAt,
        finishedAt: flowFinishedAt,
      }),
      print: buildStepTiming({
        startedAtMs: printStartedAtMs,
        finishedAtMs: printFinishedAtMs,
        startedAt: printStartedAt,
        finishedAt: printFinishedAt,
      }),
      pickup: buildStepTiming({
        startedAtMs: pickupStartedAtMs,
        finishedAtMs: pickupFinishedAtMs,
        startedAt: pickupStartedAt,
        finishedAt: pickupFinishedAt,
      }),
    };

    console.log("[hanjin][pickup-and-print] timings", {
      mailboxAddresses,
      printTargetMailboxAddresses,
      timings,
    });

    const responseBody = buildIntegratedPickupAndPrintSuccessResponse({
      pickupBody: pickupStep.body,
      printBody: printStep.body,
      mailboxChangeResponse,
      changedMailboxAddressesBeforePrint,
      pickupUpdatedMailboxAddresses:
        printStep.body?.data?.pickupUpdatedMailboxAddresses || [],
      timings,
    });

    const requestIdsForPoll = Array.isArray(selectedRequestsBeforePrint)
      ? selectedRequestsBeforePrint
          .map((requestDoc) => String(requestDoc?.requestId || "").trim())
          .filter(Boolean)
      : [];
    if (requestIdsForPoll.length) {
      await startHanjinTrackingPoll({
        requestIds: requestIdsForPoll,
        actorUserId: req.user?._id || null,
        source: "hanjin-pickup-after-print",
        runImmediate: true,
      });
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    console.error("Error in requestHanjinPickupAndPrint:", error);
    await markMailboxWorkflowError({
      mailboxAddresses: req.body?.mailboxAddresses,
      actorSource: "hanjin-pickup-print-error",
    });
    return res.status(500).json({
      success: false,
      message: "한진 택배 접수 및 운송장 출력 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
