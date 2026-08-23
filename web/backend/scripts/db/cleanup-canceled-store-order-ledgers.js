// change-log:
// - 2026-08-23: 취소된 StoreOrder의 STORE_SALE(결제·역분개) 저널 삭제. 정산 잔여분 정리.
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/models/storeOrder.model.js
//
// Usage (dry-run):
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/cleanup-canceled-store-order-ledgers.js
//
// Apply:
//   ... node scripts/db/cleanup-canceled-store-order-ledgers.js --yes
import { connectDb, disconnectDb } from "./_mongo.js";
import StoreOrder from "../../models/storeOrder.model.js";
import { rollbackStoreSaleJournals } from "../../services/storeSale.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

function parseArgs() {
  const args = process.argv.slice(2);
  return { yes: args.includes("--yes") };
}

async function run() {
  const { yes } = parseArgs();
  await connectDb();
  try {
    const canceled = await StoreOrder.find({ status: "CANCELED" })
      .select({
        _id: 1,
        businessAnchorId: 1,
        depositCode: 1,
        paymentMethod: 1,
        amountTotal: 1,
        canceledAt: 1,
        canceledByRole: 1,
        cancelReason: 1,
        updatedAt: 1,
      })
      .lean();

    console.log(
      `[cleanup-canceled-store] canceledOrders=${canceled.length} willApply=${yes}`,
    );

    let touched = 0;
    let deletedJournals = 0;
    let refundedSum = 0;
    const anchorsToRefresh = new Set();

    for (const order of canceled) {
      const rolled = await rollbackStoreSaleJournals({
        orderId: order._id,
        session: null,
        dryRun: !yes,
      });
      const journalCount = yes
        ? (rolled.deletedJournalIds || []).length
        : (rolled.journalIds || []).length;
      const refund = Number(rolled.refundedCredit || 0);
      if (journalCount <= 0) continue;

      touched += 1;
      deletedJournals += journalCount;
      refundedSum += refund;
      if (order.businessAnchorId) {
        anchorsToRefresh.add(String(order.businessAnchorId));
      }

      console.log(
        `  - order=${order._id} deposit=${order.depositCode || "-"} ` +
          `method=${order.paymentMethod || "-"} journals=${journalCount} ` +
          `refundedCredit=${refund}`,
      );

      if (!yes) continue;

      if (!order.canceledAt) {
        await StoreOrder.updateOne(
          { _id: order._id },
          {
            $set: {
              canceledAt: order.updatedAt || new Date(),
              canceledByRole: order.canceledByRole || "SYSTEM",
              cancelReason:
                order.cancelReason || "legacy_cancel_ledger_cleanup",
            },
          },
        );
      }
    }

    if (!yes) {
      console.log(
        `[cleanup-canceled-store] dry-run done. ` +
          `ordersWithLedgers=${touched} journals=${deletedJournals} ` +
          `refundedCreditSum=${refundedSum}. Rerun with --yes to apply.`,
      );
      return;
    }

    for (const anchorId of anchorsToRefresh) {
      try {
        await upsertBusinessCreditBalanceFromLedger({
          businessAnchorId: anchorId,
        });
      } catch (err) {
        console.warn(
          `[cleanup-canceled-store] balance refresh failed for ${anchorId}:`,
          err?.message || err,
        );
      }
    }

    console.log(
      `[cleanup-canceled-store] applied. orders=${touched} ` +
        `deletedJournals=${deletedJournals} refundedCreditSum=${refundedSum} ` +
        `anchorsRefreshed=${anchorsToRefresh.size}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-canceled-store] failed", err);
  process.exit(1);
});
