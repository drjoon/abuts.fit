// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/controllers/admin/adminCreditBPlan.controller.js
// - web/backend/services/generalLedger.service.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const orderFlagIndex = args.findIndex((arg) => arg === "--order");

  return {
    yes: args.includes("--yes"),
    orderId:
      orderFlagIndex >= 0 ? String(args[orderFlagIndex + 1] || "").trim() : "",
  };
}

async function run() {
  const { yes, orderId } = parseCliArgs(process.argv);
  if (orderId && !mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("--order must be a valid ChargeOrder ObjectId.");
  }

  await connectDb();
  try {
    const query = {
      adminApprovalStatus: "APPROVED",
      supplyAmount: { $gt: 0 },
      ...(orderId ? { _id: orderId } : {}),
    };
    const orders = await ChargeOrder.find(query).lean();
    let posted = 0;
    let skipped = 0;
    let statusRepaired = 0;

    for (const order of orders) {
      const requiresStatusRepair = ["PENDING", "AUTO_MATCHED"].includes(
        String(order.status || ""),
      );
      if (requiresStatusRepair) {
        if (!yes) {
          console.log(
            `[backfill-approved-charge-order-ledger] dry-run status_repair order=${order._id} from=${order.status} to=MATCHED`,
          );
        } else {
          const repair = await ChargeOrder.updateOne(
            {
              _id: order._id,
              adminApprovalStatus: "APPROVED",
              status: { $in: ["PENDING", "AUTO_MATCHED"] },
            },
            {
              $set: {
                status: "MATCHED",
                matchedAt: order.adminApprovalAt || order.updatedAt || new Date(),
                matchedBy: "ADMIN",
                matchedByUserId: order.adminApprovalBy || null,
              },
            },
          );
          if (repair.modifiedCount) statusRepaired += 1;
        }
      }

      // Older bank-match postings used a bank-transaction idempotency key, so
      // refId is the cross-version duplicate guard.
      const existingJournal = await LedgerJournal.findOne({
        eventType: "CHARGE_PAID",
        refType: "CHARGE_ORDER",
        refId: order._id,
      })
        .select({ journalId: 1 })
        .lean();
      const chargeAmount = Math.max(
        0,
        Math.round(Number(order.supplyAmount || 0)),
      );

      if (existingJournal?.journalId || chargeAmount <= 0) {
        skipped += 1;
        console.log(
          `[backfill-approved-charge-order-ledger] skip order=${order._id} reason=${
            existingJournal?.journalId ? "already_posted" : "invalid_amount"
          }`,
        );
        continue;
      }

      if (!yes) {
        console.log(
          `[backfill-approved-charge-order-ledger] dry-run order=${order._id} anchor=${order.businessAnchorId} amount=${chargeAmount}`,
        );
        continue;
      }

      const result = await postGeneralLedgerJournal({
        idempotencyKey: `gl:bplan:chargeOrder:${String(order._id)}:charge`,
        eventType: "CHARGE_PAID",
        businessAnchorId: order.businessAnchorId,
        refType: "CHARGE_ORDER",
        refId: order._id,
        occurredAt: order.adminApprovalAt || order.updatedAt || new Date(),
        createdBy: order.adminApprovalBy || null,
        meta: {
          chargeOrderId: String(order._id),
          depositCode: String(order.depositCode || "").trim() || null,
          source: "backfill_admin_bplan_approval",
        },
        lines: [
          {
            accountCode: "REQ_PAID_CREDIT",
            ownerRole: "requestor",
            ownerId: order.businessAnchorId,
            amount: chargeAmount,
            amountExcludingVat: chargeAmount,
            vatAmount: 0,
            amountIncludingVat: chargeAmount,
            creditKind: "PAID",
            refType: "CHARGE_ORDER",
            refId: order._id,
          },
        ],
      });

      if (result.posted) posted += 1;
      else skipped += 1;
      console.log(
        `[backfill-approved-charge-order-ledger] ${
          result.posted ? "posted" : "skip"
        } order=${order._id} journal=${result.journalId}`,
      );
    }

    console.log(
      `[backfill-approved-charge-order-ledger] done targets=${orders.length} posted=${posted} skipped=${skipped} mode=${
        yes ? "apply" : "dry-run"
      } status_repaired=${statusRepaired}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[backfill-approved-charge-order-ledger] failed", error);
  process.exit(1);
});
