#!/usr/bin/env node
/**
 * 동일 PracticeTransfer에 치과도착일 누적(쉐이드 등). 신규/과금 없음.
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/append-practice-transfer-arrival.js PTX-MSZR6TVN-ZQEK6G
 *
 * Optional:
 *   ARRIVAL_YMD=2026-09-03
 *   OFFSET_CIVIL_DAYS=7
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { appendPracticeArrivalDate } from "../../utils/practiceTransferArrivalDates.js";

async function main() {
  const transferId = String(process.argv[2] || "").trim();
  if (!transferId) {
    console.error(
      "Usage: node scripts/db/append-practice-transfer-arrival.js <transferId>",
    );
    process.exit(1);
  }

  await connectDb();

  const doc = await PracticeTransfer.findOne({ transferId });
  if (!doc) {
    console.error(`Not found: ${transferId}`);
    process.exit(1);
  }

  const rawYmd = String(process.env.ARRIVAL_YMD || "").trim();
  const offsetRaw = process.env.OFFSET_CIVIL_DAYS;
  const offsetCivilDays =
    offsetRaw == null || offsetRaw === "" ? undefined : Number(offsetRaw);

  const result = appendPracticeArrivalDate({
    transferMemo: doc.transferMemo,
    arrivalDates: doc.arrivalDates,
    nextYmd: rawYmd || undefined,
    offsetCivilDays,
  });
  if (!result.ok) {
    console.error(result.message, result.reason);
    process.exit(1);
  }

  if (result.unchanged) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          unchanged: true,
          transferId,
          arrivalDates: result.arrivalDates,
          arrivalDate: result.nextYmd,
        },
        null,
        2,
      ),
    );
    await disconnectDb();
    process.exit(0);
  }

  doc.transferMemo = result.transferMemo;
  doc.arrivalDates = result.arrivalDates;
  await doc.save();

  console.log(
    JSON.stringify(
      {
        ok: true,
        transferId,
        previousArrivalDate: result.previousYmd,
        arrivalDate: result.nextYmd,
        arrivalDates: result.arrivalDates,
        billingUnchanged: true,
      },
      null,
      2,
    ),
  );
  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
