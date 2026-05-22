import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import { emitCreditBalanceSnapshotToBusiness } from "../../utils/creditRealtime.js";

// Usage:
// node recompute-business-credit-snapshots.js
// This computes current credit balances from CreditLedger for each BusinessAnchor
// and emits a realtime snapshot event "credit:balance-snapshot" to the business users.

async function computeBusinessBalance(businessAnchorId) {
  const rows = await CreditLedger.find({ businessAnchorId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1, refType: 1 })
    .lean();

  let paid = 0;
  let bonus = 0;
  let freeShippingCredit = 0;

  for (const row of rows || []) {
    const type = String(row?.type || "");
    const amount = Number(row?.amount || 0);
    const refType = String(row?.refType || "");
    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);
    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      bonus += absAmount;
      if (refType === "FREE_SHIPPING_CREDIT") {
        freeShippingCredit += absAmount;
      }
      continue;
    }
    if (type === "REFUND") {
      paid += absAmount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = absAmount;
      if (refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE") {
        const fromFreeShippingCredit = Math.min(freeShippingCredit, spend);
        freeShippingCredit -= fromFreeShippingCredit;
        spend -= fromFreeShippingCredit;
      }
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonus));
  const bonusShippingCredit = Math.max(0, Math.round(freeShippingCredit));
  return {
    balance: paidCredit + bonusRequestCredit,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
  };
}

async function run() {
  await connectDb();
  try {
    const anchors = await BusinessAnchor.find({}).select({ _id: 1, name: 1 }).lean();
    console.log(`[recompute-credit] anchors: ${anchors.length}`);

    for (const anchor of anchors) {
      const anchorId = anchor._id;
      const name = anchor.name || String(anchorId);
      const result = await computeBusinessBalance(anchorId);
      console.log(`[recompute-credit] ${name} (${anchorId}) -> balance:${result.balance} paid:${result.paidCredit} bonus:${result.bonusRequestCredit} freeShip:${result.bonusShippingCredit}`);

      // Emit realtime snapshot event so connected clients can refresh their UI.
      try {
        await emitCreditBalanceSnapshotToBusiness({ businessAnchorId: anchorId, balance: result.balance, reason: 'recompute_after_seed_cleanup' });
      } catch (err) {
        console.warn(`[recompute-credit] emit failed for ${anchorId}:`, err.message || err);
      }
    }

    console.log('[recompute-credit] done');
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error('[recompute-credit] failed', err);
  process.exit(1);
});
