// related files:
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
// - web/backend/models/settlementBatch.model.js
// - web/backend/server.js
//
// 매월 정산일에 지난달 원장 잔액을 기준으로 DRAFT 배치를 자동 생성한다.
// 실제 확정/송금/GL 지급 포스팅은 관리자 API에서만 가능하다.
import BusinessAnchor from "../models/businessAnchor.model.js";
import SettlementBatch from "../models/settlementBatch.model.js";
import SettlementBatchItem from "../models/settlementBatchItem.model.js";
import {
  AFFILIATE_SETTLEMENT_ACCOUNTS,
  computeSettlementPayoutBreakdown,
} from "../services/settlement.service.js";
import { resolvePreviousKstMonthRange } from "../services/practiceLabInvoice.service.js";

// change-log:
// - 2026-08-17: DRAFT 배치 금액을 지급 분해(공급가·VAT·입금합계)로 생성.

let timerHandle = null;
let running = false;
let lastRunKey = "";

function getKstParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

const definitions = [
  {
    role: "lab",
    accountCode: "LAB_SETTLEMENT_CREDIT",
    filter: { businessType: "requestor", requestorKind: "lab" },
  },
  ...Object.entries(AFFILIATE_SETTLEMENT_ACCOUNTS).map(([role, accountCode]) => ({
    role,
    accountCode,
    filter: { businessType: role },
  })),
];

async function createDraftForPreviousMonth() {
  const range = resolvePreviousKstMonthRange();
  const existing = await SettlementBatch.findOne({
    periodStart: range.periodStart,
    periodEnd: range.periodEnd,
  }).lean();
  if (existing) return { skipped: true, reason: "already_exists" };

  const batch = await SettlementBatch.create({ ...range, status: "DRAFT" });
  const items = [];
  for (const definition of definitions) {
    const anchors = await BusinessAnchor.find(definition.filter)
      .select({ payoutAccount: 1 })
      .lean();
    for (const anchor of anchors) {
      const breakdown = await computeSettlementPayoutBreakdown({
        role: definition.role,
        businessAnchorId: anchor._id,
      });
      if (breakdown.amount <= 0) continue;
      items.push({
        batchId: batch._id,
        role: definition.role,
        businessAnchorId: anchor._id,
        accountCode: definition.accountCode,
        amount: breakdown.amount,
        supplyAmount: breakdown.supplyAmount,
        vatAmount: breakdown.vatAmount,
        payoutAccount: anchor.payoutAccount || {},
      });
    }
  }
  if (items.length) await SettlementBatchItem.insertMany(items);
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  await SettlementBatch.updateOne(
    { _id: batch._id },
    { $set: { totalAmount, itemCount: items.length } },
  );
  return { skipped: false, batchId: String(batch._id), totalAmount, itemCount: items.length };
}

async function tick() {
  const { year, month, day } = getKstParts();
  const runDay = Math.max(
    1,
    Math.min(28, Number(process.env.SETTLEMENT_BATCH_DAY_OF_MONTH || 1)),
  );
  const key = `${year}-${month}`;
  if (Number(day) !== runDay || lastRunKey === key) return;
  const result = await createDraftForPreviousMonth();
  lastRunKey = key;
  console.log("[monthlySettlementBatch] completed", { key, ...result });
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[monthlySettlementBatch] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, 60 * 60 * 1000);
    timerHandle.unref?.();
  }
}

export function startMonthlySettlementBatchWorker() {
  if (process.env.SETTLEMENT_BATCH_WORKER_ENABLED === "false" || timerHandle) return;
  loop();
}
