/**
 * PTX CA 의뢰비 hold가 옛 버그(design_custom_abutment + 기본 디자인비 5천)
 * 로 2만 잡힌 건을 생산 견적(1.5만)에 맞춘다.
 *
 * Usage:
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *     node scripts/db/repair-ptx-machining-hold-to-quote.js [--apply] [requestId=...]
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import mongoose from "mongoose";
import Request from "../../models/request.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { resolveMachiningHoldAmountFromPrice } from "../../controllers/requests/designPrice.utils.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  let requestId = "";
  for (const a of args) {
    if (a.startsWith("requestId=")) requestId = a.slice("requestId=".length).trim();
  }
  return {
    apply: args.includes("--apply"),
    requestId: requestId || "20260822-NTHVZQPC",
  };
}

async function main() {
  const { apply, requestId } = parseArgs(process.argv);
  await connectDb();
  try {
    const req = await Request.findOne({ requestId }).lean();
    if (!req) throw new Error(`request not found: ${requestId}`);

    const expected = resolveMachiningHoldAmountFromPrice(req.price);
    const idempotencyKey = `request:${String(req._id)}:hold:machining_spend`;
    const journal = await LedgerJournal.findOne({ idempotencyKey }).lean();
    if (!journal?.journalId) throw new Error(`hold journal missing: ${idempotencyKey}`);

    const held = Math.round(Number(journal.meta?.heldTotal || 0));
    console.log("plan", {
      requestId,
      priceAmount: req.price?.amount,
      productMode: req.caseInfos?.productMode,
      rule: req.price?.rule,
      held,
      expected,
      apply,
    });
    if (held === expected) {
      console.log("already matched — nothing to do");
      return;
    }
    if (!apply) {
      console.log("dry-run only (pass --apply to mutate)");
      return;
    }

    const lines = await LedgerLine.find({ journalId: journal.journalId });
    for (const line of lines) {
      const abs = Math.abs(Number(line.amount || 0));
      if (abs !== held) continue;
      const sign = Number(line.amount) < 0 ? -1 : 1;
      line.amount = sign * expected;
      line.amountExcludingVat = sign * expected;
      if (line.meta && typeof line.meta === "object") {
        line.meta.heldTotal = expected;
        line.meta.fromPaid = expected;
        line.markModified("meta");
      }
      await line.save();
    }

    await LedgerJournal.updateOne(
      { journalId: journal.journalId },
      {
        $set: {
          "meta.heldTotal": expected,
          "meta.fromPaid": expected,
        },
      },
    );

    const ba = String(journal.businessAnchorId || req.businessAnchorId || "").trim();
    if (ba && mongoose.Types.ObjectId.isValid(ba)) {
      await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: ba });
    }
    console.log("repaired", { requestId, held, expected, businessAnchorId: ba });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
