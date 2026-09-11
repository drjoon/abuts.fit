// Restore 김은정-13 (20260909-TVWLWVPB) to original tracking bundle after
// erroneous Complete-slot remachine / re-ship.
//
// Usage:
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/restore-kim-eunjeong-13-tracking.mjs
//   ... --yes
import mongoose from "mongoose";
import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";
import { deleteShippingSpendAtomicOnRollback } from "../../services/creditBalance.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const yes = process.argv.includes("--yes");

const REQUEST_ID = "20260909-TVWLWVPB";
const REQUEST_OID = new mongoose.Types.ObjectId("6aa122830169024077003839");
const ORIG_PKG_OID = new mongoose.Types.ObjectId("6aa2426692186405021dcfee");
const NEW_PKG_OID = new mongoose.Types.ObjectId("6aa3681992186405021ec90b");
const SIBLING_MAILBOX = "A1B1";

async function run() {
  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  const db = mongoose.connection.db;
  console.log(
    `[restore-kim13] db=${dbName} mode=${yes ? "APPLY" : "DRY-RUN"}`,
  );

  const requests = db.collection("requests");
  const packages = db.collection("shippingpackages");

  const [req, sib11, origPkg, newPkg] = await Promise.all([
    requests.findOne({ _id: REQUEST_OID }),
    requests.findOne({ requestId: "20260909-RBKXFLVY" }),
    packages.findOne({ _id: ORIG_PKG_OID }),
    packages.findOne({ _id: NEW_PKG_OID }),
  ]);

  if (!req) {
    throw new Error(`request not found: ${REQUEST_ID}`);
  }
  if (!origPkg) {
    throw new Error(`original package not found: ${String(ORIG_PKG_OID)}`);
  }
  if (String(req.requestId || "") !== REQUEST_ID) {
    throw new Error(`requestId mismatch: ${req.requestId}`);
  }

  const businessAnchorId = String(
    req.businessAnchorId || req.requestor?.businessAnchorId || "",
  ).trim();

  const plan = {
    requestId: REQUEST_ID,
    fromStage: req.manufacturerStage,
    toStage: "추적관리",
    fromMailbox: req.mailboxAddress || null,
    toMailbox: SIBLING_MAILBOX,
    fromPackageId: req.shippingPackageId
      ? String(req.shippingPackageId)
      : null,
    toPackageId: String(ORIG_PKG_OID),
    clearAssignedMachine:
      req.productionSchedule?.assignedMachine || req.assignedMachine || null,
    clearQueuePosition: req.productionSchedule?.queuePosition ?? null,
    siblingShippingWorkflow: sib11?.shippingWorkflow || null,
    deleteNewPackage: Boolean(newPkg),
    refundNewPackageShippingSpend: Boolean(newPkg) && Boolean(businessAnchorId),
  };

  console.log("[restore-kim13] plan", JSON.stringify(plan, null, 2));

  if (!yes) {
    console.log("[restore-kim13] dry-run only. Re-run with --yes to apply.");
    await disconnectDb();
    return;
  }

  let shippingRefund = null;
  if (plan.refundNewPackageShippingSpend) {
    shippingRefund = await deleteShippingSpendAtomicOnRollback({
      businessAnchorId,
      shippingPackageId: NEW_PKG_OID,
    });
    console.log(
      "[restore-kim13] shipping spend rollback",
      JSON.stringify(shippingRefund, null, 2),
    );
    if (shippingRefund?.reconciledSnapshot && businessAnchorId) {
      try {
        emitCreditBalanceUpdatedToBusiness({
          businessAnchorId,
          snapshot: shippingRefund.reconciledSnapshot,
          reason: "restore-kim13-duplicate-shipping-refund",
        });
      } catch (err) {
        console.warn(
          "[restore-kim13] credit realtime emit failed",
          err?.message || err,
        );
      }
    }
  }

  // Move request back onto the original Sep-10 bundle with 11/15.
  await packages.updateOne(
    { _id: ORIG_PKG_OID },
    {
      $addToSet: { requestIds: REQUEST_OID },
      $set: { updatedAt: new Date() },
    },
  );

  if (newPkg) {
    await packages.deleteOne({ _id: NEW_PKG_OID });
  }

  const shippingWorkflow = {
    ...(sib11?.shippingWorkflow || req.shippingWorkflow || {}),
    code: "picked_up",
    label: "집하",
    pickedUpAt:
      sib11?.shippingWorkflow?.pickedUpAt ||
      req.shippingWorkflow?.pickedUpAt ||
      null,
    trackingStatusCode:
      sib11?.shippingWorkflow?.trackingStatusCode ||
      req.shippingWorkflow?.trackingStatusCode ||
      "31",
    trackingStatusText:
      sib11?.shippingWorkflow?.trackingStatusText ||
      req.shippingWorkflow?.trackingStatusText ||
      "상품출발",
    source:
      sib11?.shippingWorkflow?.source ||
      req.shippingWorkflow?.source ||
      "hanjin-tracking-auto-sync",
    updatedAt:
      sib11?.shippingWorkflow?.updatedAt ||
      req.shippingWorkflow?.updatedAt ||
      new Date(),
  };

  const now = new Date();
  await requests.updateOne(
    { _id: REQUEST_OID },
    {
      $set: {
        manufacturerStage: "추적관리",
        mailboxAddress: SIBLING_MAILBOX,
        shippingPackageId: ORIG_PKG_OID,
        shippingWorkflow,
        "caseInfos.reviewByStage.request.status": "APPROVED",
        "caseInfos.reviewByStage.cam.status": "APPROVED",
        "caseInfos.reviewByStage.machining.status": "APPROVED",
        "caseInfos.reviewByStage.packing.status": "APPROVED",
        "caseInfos.reviewByStage.shipping.status": "APPROVED",
        "caseInfos.reviewByStage.tracking.status": "PENDING",
        assignedMachine: null,
        "productionSchedule.assignedMachine": null,
        "productionSchedule.queuePosition": null,
        "productionSchedule.actualMachiningStart": null,
        "productionSchedule.machiningProgress": null,
        updatedAt: now,
        __restoredKim13TrackingAt: now,
        __restoredKim13Tracking: {
          fromPackageId: plan.fromPackageId,
          toPackageId: plan.toPackageId,
          fromMailbox: plan.fromMailbox,
          toMailbox: plan.toMailbox,
          shippingRefundDidRollback: Boolean(shippingRefund?.didRollback),
          shippingRefundAmount: shippingRefund?.rollbackAmount ?? null,
        },
      },
      $unset: {
        "productionSchedule.ncPreload": "",
      },
    },
  );

  const [afterReq, afterOrig, afterNew] = await Promise.all([
    requests.findOne(
      { _id: REQUEST_OID },
      {
        projection: {
          requestId: 1,
          manufacturerStage: 1,
          mailboxAddress: 1,
          shippingPackageId: 1,
          shippingWorkflow: 1,
          assignedMachine: 1,
          "productionSchedule.assignedMachine": 1,
          "productionSchedule.queuePosition": 1,
        },
      },
    ),
    packages.findOne({ _id: ORIG_PKG_OID }),
    packages.findOne({ _id: NEW_PKG_OID }),
  ]);

  console.log(
    "[restore-kim13] after",
    JSON.stringify(
      {
        request: {
          requestId: afterReq?.requestId,
          stage: afterReq?.manufacturerStage,
          mailbox: afterReq?.mailboxAddress,
          packageId: afterReq?.shippingPackageId
            ? String(afterReq.shippingPackageId)
            : null,
          machine:
            afterReq?.productionSchedule?.assignedMachine ||
            afterReq?.assignedMachine ||
            null,
          qp: afterReq?.productionSchedule?.queuePosition ?? null,
          shippingWorkflow: afterReq?.shippingWorkflow,
        },
        origPackageRequestIds: (afterOrig?.requestIds || []).map(String),
        newPackageExists: Boolean(afterNew),
        shippingRefund,
      },
      null,
      2,
    ),
  );

  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[restore-kim13] failed", err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
