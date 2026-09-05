// related files:
// - web/backend/scripts/db/delete-practice-charge-journals.js
// - web/backend/scripts/db/zero-practice-credits-enable-demo.js
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/creditBalance.service.js
/**
 * ⚠️ 원장 전량 삭제용. 일반적으로 쓰지 말 것.
 * 내역 유지 + 마이너스 잔고 체제만 적용할 때는
 * `restore-credit-ledgers-from-critical-backup.js` 로 복구한 뒤 demoMode/overdraft를 쓴다.
 *
 * 의뢰자(치과+기공소) 크레딧 원장 전량 리셋.
 * - 유료/무료/데모 충전·회수·소비·홀드·정산적립 저널을 통째로 삭제(에스크로·수익 상대계정 포함)
 * - FreeCreditGrant 취소, PTX billing hold/settle 필드 초기화
 * - 치과: demoMode ON + 잔고 0 / 기공소: 잔고 0 (데모 미적용)
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   NAMES='테스트치과,테스트기공소' \
 *   node scripts/db/reset-requestor-credit-ledgers.js
 *
 * Apply: APPLY=1 ...
 * Optional: KINDS=practice|lab|all (default all)
 * Optional: NAMES='이름1,이름2' (없으면 해당 KINDS 전체)
 */
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  normalizeRequestorKind,
  normalizeRequestorCapabilities,
} from "../../utils/requestorCapabilities.js";
import {
  getBusinessCreditBalanceSnapshot,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";

const REQUESTOR_CREDIT_ACCOUNTS = [
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
];

const REASON = "의뢰자 크레딧 원장 전량 리셋(데모 0원 정책)";

function classifyAnchor(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  const caps = normalizeRequestorCapabilities(anchor?.requestorCapabilities);
  if (kind === "lab" || (kind !== "practice" && caps.lab && !caps.practice)) {
    return "lab";
  }
  if (kind === "practice" || caps.practice) return "practice";
  if (caps.lab) return "lab";
  return "practice";
}

async function enableDemoModeKeepStartedAt(businessAnchorId, startedAt) {
  const now = new Date();
  await BusinessAnchor.updateOne(
    { _id: businessAnchorId, demoModeExitedAt: null },
    {
      $set: {
        demoMode: true,
        demoModeStartedAt: startedAt || now,
      },
    },
  );
}

async function clearPracticeTransferBillingHolds(anchorIds) {
  const ids = (anchorIds || []).filter(Boolean);
  if (!ids.length) return { matched: 0, modified: 0 };

  const res = await PracticeTransfer.updateMany(
    {
      $and: [
        {
          $or: [
            { practiceBusinessAnchorId: { $in: ids } },
            { targetLabAnchorId: { $in: ids } },
            { assigneeLabAnchorId: { $in: ids } },
          ],
        },
        {
          $or: [
            { "billing.heldAt": { $ne: null } },
            { "billing.settledAt": { $ne: null } },
            { "billing.labSettledAt": { $ne: null } },
            { "billing.abutmentSettledAt": { $ne: null } },
            { "billing.heldTotal": { $gt: 0 } },
            { "billing.labSettlementAmount": { $gt: 0 } },
          ],
        },
      ],
    },
    {
      $set: {
        "billing.heldAt": null,
        "billing.heldTotal": 0,
        "billing.heldLabTotal": 0,
        "billing.heldAbutmentTotal": 0,
        "billing.heldShippingLabTotal": 0,
        "billing.heldShippingAbutsTotal": 0,
        "billing.holdFromPaid": 0,
        "billing.holdFromFreeRequest": 0,
        "billing.holdFromFreeShipping": 0,
        "billing.billedAt": null,
        "billing.settledAt": null,
        "billing.labSettledAt": null,
        "billing.abutmentSettledAt": null,
        "billing.labSettlementAmount": 0,
        "billing.abutsRevenueAmount": 0,
      },
    },
  );

  return {
    matched: Number(res?.matchedCount || 0),
    modified: Number(res?.modifiedCount || 0),
  };
}

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.APPLY || "")
      .trim()
      .toLowerCase(),
  );
  const kindsRaw = String(process.env.KINDS || "all")
    .trim()
    .toLowerCase();
  const kinds =
    kindsRaw === "practice" || kindsRaw === "lab"
      ? new Set([kindsRaw])
      : new Set(["practice", "lab"]);
  const namesRaw = String(process.env.NAMES || "").trim();
  const nameFilter = namesRaw
    ? namesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("apply", apply, "kinds", [...kinds], "names", nameFilter || "all");

  await mongoose.connect(uri);

  const anchors = await BusinessAnchor.find({ businessType: "requestor" })
    .select({
      name: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
      demoModeStartedAt: 1,
    })
    .lean();

  const targets = anchors.filter((a) => {
    if (!kinds.has(classifyAnchor(a))) return false;
    if (!nameFilter) return true;
    const name = String(a?.name || "").trim();
    return nameFilter.some((n) => n === name || name.includes(n));
  });
  console.log("target anchors", targets.length);
  if (nameFilter && !targets.length) {
    console.error("NAMES matched 0 anchors — abort");
    await mongoose.disconnect();
    process.exit(1);
  }

  let deletedJournals = 0;
  let deletedLines = 0;
  let canceledGrants = 0;
  let demoEnabled = 0;
  let errors = 0;
  const perAnchor = [];

  for (const anchor of targets) {
    const id = anchor._id;
    const kind = classifyAnchor(anchor);
    const before = await getBusinessCreditBalanceSnapshot({
      businessAnchorId: id,
    });

    const creditLines = await LedgerLine.find({
      ownerRole: "requestor",
      ownerId: id,
      accountCode: { $in: REQUESTOR_CREDIT_ACCOUNTS },
    })
      .select({ journalId: 1 })
      .lean();
    const journalIds = [
      ...new Set(
        creditLines.map((l) => l.journalId).filter((jid) => Boolean(jid)),
      ),
    ];

    const activeGrants = await FreeCreditGrant.countDocuments({
      businessAnchorId: id,
      canceledAt: null,
    });

    perAnchor.push({
      name: anchor.name,
      kind,
      journalIds: journalIds.length,
      grants: activeGrants,
      before: {
        paid: Math.round(Number(before.paidCredit || 0)),
        freeReq: Math.round(Number(before.freeRequestCredit || 0)),
        freeShip: Math.round(Number(before.freeShippingCredit || 0)),
        settlement: Math.round(Number(before.settlementCredit || 0)),
        balance: Math.round(Number(before.balance || 0)),
      },
    });

    console.log("target", {
      name: anchor.name,
      kind,
      journals: journalIds.length,
      grants: activeGrants,
      before: perAnchor[perAnchor.length - 1].before,
    });

    if (!apply) continue;

    try {
      if (journalIds.length) {
        const lineRes = await LedgerLine.deleteMany({
          journalId: { $in: journalIds },
        });
        const journRes = await LedgerJournal.deleteMany({
          journalId: { $in: journalIds },
        });
        deletedLines += Number(lineRes?.deletedCount || 0);
        deletedJournals += Number(journRes?.deletedCount || 0);
      }

      const now = new Date();
      const grantRes = await FreeCreditGrant.updateMany(
        { businessAnchorId: id, canceledAt: null },
        {
          $set: {
            canceledAt: now,
            cancelReason: REASON,
          },
        },
      );
      canceledGrants += Number(grantRes?.modifiedCount || 0);

      if (kind === "practice" && !anchor.demoModeExitedAt) {
        await enableDemoModeKeepStartedAt(id, anchor.demoModeStartedAt);
        if (!anchor.demoMode) demoEnabled += 1;
      }

      await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: id });
      const after = await getBusinessCreditBalanceSnapshot({
        businessAnchorId: id,
      });
      console.log("done", {
        name: anchor.name,
        after: {
          paid: Math.round(Number(after.paidCredit || 0)),
          freeReq: Math.round(Number(after.freeRequestCredit || 0)),
          freeShip: Math.round(Number(after.freeShippingCredit || 0)),
          settlement: Math.round(Number(after.settlementCredit || 0)),
          balance: Math.round(Number(after.balance || 0)),
        },
      });
    } catch (e) {
      errors += 1;
      console.error("failed", anchor.name, e?.message || e);
    }
  }

  let ptxCleared = { matched: 0, modified: 0 };
  if (apply) {
    ptxCleared = await clearPracticeTransferBillingHolds(
      targets.map((a) => a._id),
    );
    console.log("ptx billing hold/settle cleared", ptxCleared);
  }

  console.log("\nsummary", {
    apply,
    targets: targets.length,
    deletedJournals,
    deletedLines,
    canceledGrants,
    demoEnabled,
    ptxCleared,
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
