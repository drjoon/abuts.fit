// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
/**
 * 모든 치과(practice): 유료·무료 양수 잔고 회수 + 데모 모드 ON(마이너스 PTX 허용).
 * 이미 음수인 freeRequest는 그대로 둔다.
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/zero-practice-credits-enable-demo.js
 *
 * Apply: APPLY=1 ...
 */
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  normalizeRequestorKind,
  normalizeRequestorCapabilities,
} from "../../utils/requestorCapabilities.js";
import {
  getBusinessCreditBalanceSnapshot,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const REASON = "치과 잔고 전량 회수(0원+데모 마이너스 정책)";

function isPracticeAnchor(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  const caps = normalizeRequestorCapabilities(anchor?.requestorCapabilities);
  if (kind === "lab") return false;
  if (kind === "practice") return true;
  return Boolean(caps.practice);
}

async function clawBucket({
  businessAnchorId,
  accountCode,
  creditKind,
  amountPositive,
  bucketKey,
}) {
  const amount = Math.max(0, Math.round(Number(amountPositive || 0)));
  if (!(amount > 0)) return { clawed: 0, journalId: null };

  const glResult = await postGeneralLedgerJournal({
    idempotencyKey: `gl:practice_zero_${bucketKey}:${String(businessAnchorId)}`,
    eventType: "ADJUST",
    businessAnchorId,
    refType: "PRACTICE_BALANCE_ZERO",
    refId: businessAnchorId,
    createdBy: null,
    meta: {
      memo: `${REASON} — ${bucketKey}`,
      source: "practice_balance_zero",
      bucket: bucketKey,
      clawBack: amount,
    },
    lines: [
      {
        accountCode,
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: -amount,
        amountExcludingVat: -amount,
        vatAmount: 0,
        amountIncludingVat: -amount,
        creditKind,
        refType: "PRACTICE_BALANCE_ZERO",
        refId: businessAnchorId,
        meta: { source: "practice_balance_zero", bucket: bucketKey },
      },
    ],
  });

  if (glResult?.posted) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: -amount,
      reason: "practice_balance_zero",
      refId: glResult.journalId || businessAnchorId,
    });
  }

  return { clawed: amount, journalId: glResult?.journalId || null };
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

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.APPLY || "")
      .trim()
      .toLowerCase(),
  );
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("apply", apply);

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

  const practices = anchors.filter(isPracticeAnchor);
  console.log("practice count", practices.length);

  let touched = 0;
  let clawedPaidTotal = 0;
  let clawedFreeReqTotal = 0;
  let clawedFreeShipTotal = 0;
  let demoEnabled = 0;
  let skippedExited = 0;
  let errors = 0;

  for (const anchor of practices) {
    const id = anchor._id;
    const snap = await getBusinessCreditBalanceSnapshot({
      businessAnchorId: id,
    });
    const paid = Math.round(Number(snap.paidCredit || 0));
    const freeReq = Math.round(Number(snap.freeRequestCredit || 0));
    const freeShip = Math.round(Number(snap.freeShippingCredit || 0));
    const paidPos = Math.max(0, paid);
    const freeReqPos = Math.max(0, freeReq);
    const freeShipPos = Math.max(0, freeShip);
    const needClaw = paidPos > 0 || freeReqPos > 0 || freeShipPos > 0;
    const exited = Boolean(anchor.demoModeExitedAt);
    const needDemo = !exited && !anchor.demoMode;

    console.log("target", {
      id: String(id),
      name: anchor.name,
      paid,
      freeReq,
      freeShip,
      demoMode: Boolean(anchor.demoMode),
      exited,
      needClaw,
      needDemo,
    });

    if (!apply) continue;
    if (exited) {
      skippedExited += 1;
      // 실사용 전환된 치과도 잔고 회수는 수행
    }

    try {
      if (needClaw || needDemo || (exited && needClaw)) {
        touched += 1;
      }

      const paidRes = await clawBucket({
        businessAnchorId: id,
        accountCode: "REQ_PAID_CREDIT",
        creditKind: "PAID",
        amountPositive: paidPos,
        bucketKey: "paid",
      });
      const freeReqRes = await clawBucket({
        businessAnchorId: id,
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        creditKind: "FREE_REQUEST",
        amountPositive: freeReqPos,
        bucketKey: "free_request",
      });
      const freeShipRes = await clawBucket({
        businessAnchorId: id,
        accountCode: "REQ_FREE_SHIPPING_CREDIT",
        creditKind: "FREE_SHIPPING",
        amountPositive: freeShipPos,
        bucketKey: "free_shipping",
      });

      clawedPaidTotal += paidRes.clawed;
      clawedFreeReqTotal += freeReqRes.clawed;
      clawedFreeShipTotal += freeShipRes.clawed;

      if (!exited) {
        await enableDemoModeKeepStartedAt(id, anchor.demoModeStartedAt);
        if (needDemo) demoEnabled += 1;
      }

      await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: id });
      const after = await getBusinessCreditBalanceSnapshot({
        businessAnchorId: id,
      });
      const afterAnchor = await BusinessAnchor.findById(id)
        .select({ demoMode: 1, demoModeExitedAt: 1 })
        .lean();
      console.log("done", {
        name: anchor.name,
        clawedPaid: paidRes.clawed,
        clawedFreeReq: freeReqRes.clawed,
        clawedFreeShip: freeShipRes.clawed,
        after: {
          paid: after.paidCredit,
          freeReq: after.freeRequestCredit,
          freeShip: after.freeShippingCredit,
          balance: after.balance,
        },
        demoMode: afterAnchor?.demoMode,
      });
    } catch (e) {
      errors += 1;
      console.error("failed", String(id), anchor.name, e?.message || e);
    }
  }

  console.log("summary", {
    apply,
    practiceCount: practices.length,
    touched,
    clawedPaidTotal,
    clawedFreeReqTotal,
    clawedFreeShipTotal,
    demoEnabled,
    skippedExited,
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
