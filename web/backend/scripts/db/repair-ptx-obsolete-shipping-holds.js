// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 기공소→치과 배송 무료 정책: 레거시 PTX lab_shipping / 건당 abuts_shipping hold를 해제해
// 치과(또는 잘못 청구된) 크레딧을 복원한다. Request 박스키 배송은 건드리지 않는다.
//
// Usage:
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-obsolete-shipping-holds.js [--apply]
import { connectDb, disconnectDb } from "./_mongo.js";
import mongoose from "mongoose";
import { releasePracticeTransferObsoleteShippingHolds } from "../../services/practiceTransferBilling.service.js";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return { apply: args.includes("--apply") };
}

function transferIdFromJournal(journal) {
  const fromRef = String(journal?.refId || "").trim();
  if (/^[a-f0-9]{24}$/i.test(fromRef)) return fromRef;
  const key = String(journal?.idempotencyKey || "");
  const m = key.match(/^practice_transfer:([a-f0-9]{24}):hold:(?:lab|abuts)_shipping$/i);
  return m ? m[1] : "";
}

async function main() {
  const { apply } = parseArgs(process.argv);
  await connectDb();
  try {
    const journals = await mongoose.connection.db
      .collection("ledgerjournals")
      .find({
        eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
        $or: [
          { idempotencyKey: /:hold:lab_shipping$/ },
          { idempotencyKey: /:hold:abuts_shipping$/ },
          { "meta.holdShare": { $in: ["lab_shipping", "abuts_shipping"] } },
        ],
      })
      .project({
        idempotencyKey: 1,
        refId: 1,
        businessAnchorId: 1,
        "meta.heldTotal": 1,
        "meta.holdShare": 1,
      })
      .toArray();

    const transferIds = [
      ...new Set(
        journals.map(transferIdFromJournal).filter((id) => /^[a-f0-9]{24}$/i.test(id)),
      ),
    ];

    console.log("plan", {
      holdJournals: journals.length,
      transfers: transferIds.length,
      apply,
    });
    for (const j of journals) {
      console.log("hold", {
        key: j.idempotencyKey,
        share: j.meta?.holdShare,
        held: j.meta?.heldTotal,
        ba: String(j.businessAnchorId || ""),
        transferId: transferIdFromJournal(j),
      });
    }

    if (!apply) {
      console.log("dry-run only (pass --apply)");
      return;
    }

    let released = 0;
    for (const transferId of transferIds) {
      const result = await releasePracticeTransferObsoleteShippingHolds({
        transferId,
        emitRealtime: true,
      });
      console.log("release", transferId, {
        released: result.released,
        lab: result.lab?.released,
        abuts: result.abuts?.released,
      });
      if (result.released) released += 1;
    }
    console.log("done", { releasedTransfers: released });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
