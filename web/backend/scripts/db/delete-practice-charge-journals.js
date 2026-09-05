// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/generalLedger.service.js
/**
 * @deprecated 충전만 지우면 소비가 남아 잔액 수식이 깨짐.
 * 대신 `reset-requestor-credit-ledgers.js` 사용(충전+소비+기공소 포함 전량 리셋).
 *
 * 치과 유료/무료 충전 저널(+충전 회수 ADJUST)을 물리 삭제.
 * 기간 요약 카드의 충전 합계가 0이 되도록 함. 소비 저널은 유지(마이너스 잔고).
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   NAMES='테스트치과,향기로운치과' APPLY=1 \
 *   node scripts/db/delete-practice-charge-journals.js
 */
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  getBusinessCreditBalanceSnapshot,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";
import {
  normalizeRequestorKind,
  normalizeRequestorCapabilities,
} from "../../utils/requestorCapabilities.js";

const CHARGE_EVENT_TYPES = [
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
];

function isPracticeAnchor(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  const caps = normalizeRequestorCapabilities(anchor?.requestorCapabilities);
  if (kind === "lab") return false;
  if (kind === "practice") return true;
  return Boolean(caps.practice);
}

function isChargeClawbackAdjust(journal) {
  if (String(journal?.eventType || "") !== "ADJUST") return false;
  const refType = String(journal?.refType || "");
  const source = String(journal?.meta?.source || "");
  const key = String(journal?.idempotencyKey || "");
  if (refType === "PRACTICE_BALANCE_ZERO") return true;
  if (refType === "DEMO_CREDIT_EXIT") return true;
  if (refType === "FREE_CREDIT_CANCEL") return true;
  if (refType === "DEMO_DEBT_RESET") return true;
  if (source === "practice_balance_zero") return true;
  if (source === "demo_credit_exit") return true;
  if (source === "demo_debt_reset") return true;
  if (key.startsWith("gl:practice_zero_")) return true;
  if (key.startsWith("gl:demo_credit_exit:")) return true;
  if (key.startsWith("gl:demo_debt_reset:")) return true;
  if (key.startsWith("gl:free_credit_grant_cancel:")) return true;
  return false;
}

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.APPLY || "")
      .trim()
      .toLowerCase(),
  );
  const namesRaw = String(process.env.NAMES || "").trim();
  const nameFilter = namesRaw
    ? namesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("apply", apply, "names", nameFilter || "(all practices)");

  await mongoose.connect(uri);

  let anchors = await BusinessAnchor.find({ businessType: "requestor" })
    .select({
      name: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
    })
    .lean();
  anchors = anchors.filter(isPracticeAnchor);
  if (nameFilter) {
    anchors = anchors.filter((a) => nameFilter.includes(String(a.name || "")));
  }

  let deletedJournals = 0;
  let deletedLines = 0;
  let errors = 0;

  for (const anchor of anchors) {
    const id = anchor._id;
    const journals = await LedgerJournal.find({
      businessAnchorId: id,
      $or: [
        { eventType: { $in: CHARGE_EVENT_TYPES } },
        { eventType: "ADJUST" },
      ],
    })
      .select({
        _id: 1,
        journalId: 1,
        eventType: 1,
        refType: 1,
        idempotencyKey: 1,
        meta: 1,
        occurredAt: 1,
      })
      .lean();

    const toDelete = journals.filter(
      (j) =>
        CHARGE_EVENT_TYPES.includes(String(j.eventType || "")) ||
        isChargeClawbackAdjust(j),
    );

    console.log("\n===", anchor.name, String(id), "delete", toDelete.length);
    for (const j of toDelete) {
      console.log(
        " ",
        j.occurredAt?.toISOString?.()?.slice(0, 10),
        j.eventType,
        j.refType,
        j.idempotencyKey,
      );
    }

    if (!apply || !toDelete.length) continue;

    try {
      const journalIds = toDelete.map((j) => j.journalId).filter(Boolean);
      const oids = toDelete.map((j) => j._id);
      const lineRes = await LedgerLine.deleteMany({
        journalId: { $in: journalIds },
      });
      const journRes = await LedgerJournal.deleteMany({ _id: { $in: oids } });
      deletedJournals += Number(journRes?.deletedCount || 0);
      deletedLines += Number(lineRes?.deletedCount || 0);

      await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: id });
      const after = await getBusinessCreditBalanceSnapshot({
        businessAnchorId: id,
      });
      console.log(" after balance", {
        paid: after.paidCredit,
        freeReq: after.freeRequestCredit,
        freeShip: after.freeShippingCredit,
        balance: after.balance,
      });
    } catch (e) {
      errors += 1;
      console.error("failed", anchor.name, e?.message || e);
    }
  }

  console.log("\nsummary", {
    apply,
    anchors: anchors.length,
    deletedJournals,
    deletedLines,
    errors,
  });
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
