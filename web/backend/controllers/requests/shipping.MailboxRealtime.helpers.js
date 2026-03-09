import Request from "../../models/request.model.js";
import { SHIPPING_WORKFLOW_CODES, SHIPPING_WORKFLOW_LABELS } from "./utils.js";

export const buildMailboxSnapshotFingerprint = (requests = []) => {
  const tokens = (Array.isArray(requests) ? requests : [])
    .map((requestDoc) => ({
      requestMongoId: String(requestDoc?._id || "").trim(),
      requestId: String(requestDoc?.requestId || "").trim(),
      mailboxAddress: String(requestDoc?.mailboxAddress || "").trim(),
      stage: String(requestDoc?.manufacturerStage || "").trim(),
    }))
    .filter((item) => item.requestMongoId || item.requestId)
    .sort((a, b) => {
      const aKey = `${a.mailboxAddress}|${a.requestId}|${a.requestMongoId}`;
      const bKey = `${b.mailboxAddress}|${b.requestId}|${b.requestMongoId}`;
      return aKey.localeCompare(bKey);
    });

  return JSON.stringify(tokens);
};

export const buildMailboxSnapshotByAddress = (requests = []) => {
  const byMailbox = new Map();
  for (const requestDoc of Array.isArray(requests) ? requests : []) {
    const mailboxAddress = String(requestDoc?.mailboxAddress || "").trim();
    if (!mailboxAddress) continue;
    if (!byMailbox.has(mailboxAddress)) byMailbox.set(mailboxAddress, []);
    byMailbox.get(mailboxAddress).push(requestDoc);
  }

  const snapshotByAddress = new Map();
  for (const [mailboxAddress, group] of byMailbox.entries()) {
    snapshotByAddress.set(mailboxAddress, {
      mailboxAddress,
      requestIds: group
        .map((requestDoc) => String(requestDoc?.requestId || "").trim())
        .filter(Boolean)
        .sort(),
      requestMongoIds: group
        .map((requestDoc) => String(requestDoc?._id || "").trim())
        .filter(Boolean)
        .sort(),
      fingerprint: buildMailboxSnapshotFingerprint(group),
    });
  }
  return snapshotByAddress;
};

export const getLastPrintedSnapshotForMailbox = (requests = []) => {
  const first = (Array.isArray(requests) ? requests : []).find(Boolean);
  const shippingLabelPrinted = first?.shippingLabelPrinted || {};
  const requestIds = Array.isArray(shippingLabelPrinted?.snapshotRequestIds)
    ? shippingLabelPrinted.snapshotRequestIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .sort()
    : [];

  return {
    fingerprint: String(shippingLabelPrinted?.snapshotFingerprint || "").trim(),
    requestIds,
    capturedAt: shippingLabelPrinted?.snapshotCapturedAt || null,
    printed: Boolean(shippingLabelPrinted?.printed),
  };
};

export const buildMailboxChangeSet = (requests = []) => {
  const snapshotByAddress = buildMailboxSnapshotByAddress(requests);
  const result = new Map();

  for (const [mailboxAddress, snapshot] of snapshotByAddress.entries()) {
    const group = (Array.isArray(requests) ? requests : []).filter(
      (requestDoc) =>
        String(requestDoc?.mailboxAddress || "").trim() === mailboxAddress,
    );
    const previous = getLastPrintedSnapshotForMailbox(group);
    const changed =
      !previous.printed ||
      !previous.fingerprint ||
      previous.fingerprint !== snapshot.fingerprint;

    result.set(mailboxAddress, {
      mailboxAddress,
      changed,
      currentFingerprint: snapshot.fingerprint,
      previousFingerprint: previous.fingerprint,
      requestIds: snapshot.requestIds,
      previousRequestIds: previous.requestIds,
      printed: previous.printed,
      snapshotCapturedAt: previous.capturedAt,
    });
  }

  return result;
};

export const buildMailboxChangeResponse = ({
  mailboxAddresses = [],
  changeSet = new Map(),
}) => {
  const changedMailboxAddresses = mailboxAddresses.filter((address) => {
    const change = changeSet.get(address);
    return change?.changed;
  });

  return {
    mailboxChanges: mailboxAddresses.map((address) => {
      const change = changeSet.get(address);
      return {
        mailboxAddress: address,
        changed: Boolean(change?.changed),
        printed: Boolean(change?.printed),
        currentRequestIds: Array.isArray(change?.requestIds)
          ? change.requestIds
          : [],
        previousRequestIds: Array.isArray(change?.previousRequestIds)
          ? change.previousRequestIds
          : [],
      };
    }),
    changedMailboxAddresses,
    allSelectedAlreadySynced:
      mailboxAddresses.length > 0 && changedMailboxAddresses.length === 0,
  };
};

export const persistPrintedMailboxState = async ({
  mailboxAddresses = [],
  requests = [],
}) => {
  const addresses = Array.isArray(mailboxAddresses)
    ? mailboxAddresses.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (!addresses.length) return;

  const requestDocs =
    Array.isArray(requests) && requests.length
      ? requests
      : await Request.find({ mailboxAddress: { $in: addresses } }).select({
          _id: 1,
          requestId: 1,
          mailboxAddress: 1,
          manufacturerStage: 1,
        });

  const snapshotByAddress = buildMailboxSnapshotByAddress(requestDocs);
  const printedAt = new Date();

  const bulkOps = [];
  for (const address of addresses) {
    const snapshot = snapshotByAddress.get(address);
    if (!snapshot) continue;
    bulkOps.push({
      updateMany: {
        filter: { mailboxAddress: address },
        update: [
          {
            $set: {
              "shippingLabelPrinted.printed": true,
              "shippingLabelPrinted.printedAt": printedAt,
              "shippingLabelPrinted.mailboxAddress": address,
              "shippingLabelPrinted.snapshotFingerprint": snapshot.fingerprint,
              "shippingLabelPrinted.snapshotCapturedAt": printedAt,
              "shippingLabelPrinted.snapshotRequestIds": snapshot.requestIds,
              "shippingWorkflow.printedAt": printedAt,
              "shippingWorkflow.canceledAt": null,
              "shippingWorkflow.source": "hanjin-print",
              "shippingWorkflow.updatedAt": printedAt,
              "shippingWorkflow.code": {
                $cond: [
                  {
                    $in: [
                      {
                        $ifNull: [
                          "$shippingWorkflow.code",
                          SHIPPING_WORKFLOW_CODES.NONE,
                        ],
                      },
                      [
                        SHIPPING_WORKFLOW_CODES.NONE,
                        SHIPPING_WORKFLOW_CODES.PRINTED,
                      ],
                    ],
                  },
                  SHIPPING_WORKFLOW_CODES.PRINTED,
                  "$shippingWorkflow.code",
                ],
              },
              "shippingWorkflow.label": {
                $cond: [
                  {
                    $in: [
                      {
                        $ifNull: [
                          "$shippingWorkflow.code",
                          SHIPPING_WORKFLOW_CODES.NONE,
                        ],
                      },
                      [
                        SHIPPING_WORKFLOW_CODES.NONE,
                        SHIPPING_WORKFLOW_CODES.PRINTED,
                      ],
                    ],
                  },
                  SHIPPING_WORKFLOW_LABELS[SHIPPING_WORKFLOW_CODES.PRINTED],
                  "$shippingWorkflow.label",
                ],
              },
            },
          },
        ],
      },
    });
  }

  if (bulkOps.length) {
    await Request.bulkWrite(bulkOps);
  }
};

export const createCapturedJsonResponder = () => {
  let captured = null;
  return {
    get captured() {
      return captured;
    },
    responder: {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        captured = {
          statusCode: this.statusCode || 200,
          body: payload,
        };
        return payload;
      },
    },
  };
};

export const resolveCapturedSuccessBody = (
  capturedPayload,
  fallbackMessage,
) => {
  if (capturedPayload?.body?.success) {
    return capturedPayload.body;
  }
  return {
    success: false,
    message: fallbackMessage,
  };
};

export const executeCapturedController = async (controllerFn, reqLike) => {
  const capture = createCapturedJsonResponder();
  await controllerFn(reqLike, capture.responder);
  return capture.captured;
};

export const executeCapturedControllerSuccessBody = async ({
  controllerFn,
  reqLike,
  fallbackMessage,
}) => {
  const captured = await executeCapturedController(controllerFn, reqLike);
  return {
    captured,
    body: resolveCapturedSuccessBody(captured, fallbackMessage),
  };
};

export const respondCapturedControllerFailure = ({
  res,
  captured,
  fallbackMessage,
}) =>
  res.status(captured?.statusCode || 500).json(
    captured?.body || {
      success: false,
      message: fallbackMessage,
    },
  );

export const executeIntegratedCapturedStep = async ({
  res,
  controllerFn,
  reqLike,
  fallbackMessage,
}) => {
  const { captured, body } = await executeCapturedControllerSuccessBody({
    controllerFn,
    reqLike,
    fallbackMessage,
  });

  if (!body?.success) {
    return {
      ok: false,
      response: respondCapturedControllerFailure({
        res,
        captured,
        fallbackMessage,
      }),
      captured,
      body,
    };
  }

  return {
    ok: true,
    captured,
    body,
  };
};
