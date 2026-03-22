// @ts-nocheck
/**
 * @deprecated dailyReferralSnapshotWorker.js로 대체됨 (2026-02).
 * 이 파일은 더 이상 사용하지 않습니다.
 * 새 워커: jobs/dailyReferralSnapshotWorker.js
 * - 매일 KST 00:00 실행
 * - 오늘 자정 기준 직전 30일 완료 의뢰 집계
 * - 누락 감지: 오늘 스냅샷 없으면 자동 재계산
 * 환경변수: DAILY_REFERRAL_SNAPSHOT_WORKER_ENABLED (기존: MONTHLY_REFERRAL_SNAPSHOT_WORKER_ENABLED)
 */

import "../bootstrap/env.js";
import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import { getThisMonthStartYmdInKst } from "../controllers/requests/utils.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId } from "../services/pricingReferralSnapshot.service.js";

/**
 * KST 기준 지난달(전월) 1일 00:00:00 ~ 말일 23:59:59 UTC 범위를 반환한다.
 */
function getLastMonthRangeUtc() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstYear = kstNow.getUTCFullYear();
  const kstMonth = kstNow.getUTCMonth(); // 0-indexed
  const lastMonthYear = kstMonth === 0 ? kstYear - 1 : kstYear;
  const lastMonth = kstMonth === 0 ? 12 : kstMonth; // 1-indexed
  const startKst = new Date(
    Date.UTC(lastMonthYear, lastMonth - 1, 1, -9, 0, 0, 0),
  );
  const endKst = new Date(
    Date.UTC(lastMonthYear, lastMonth, 0, 14, 59, 59, 999),
  );
  return { start: startKst, end: endKst };
}

/**
 * 현재 KST 시각이 매달 1일 00:00 ~ 00:01 사이인지 확인한다.
 */
function isFirstDayOfMonthKst() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return (
    kstNow.getUTCDate() === 1 &&
    kstNow.getUTCHours() === 0 &&
    kstNow.getUTCMinutes() === 0
  );
}

async function runMonthlySnapshot() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[monthlyReferralSnapshot] MONGODB_URI is not set");
    return;
  }

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(mongoUri);
  }

  console.log(
    `[${new Date().toISOString()}] Monthly referral snapshot started`,
  );

  const ymd = getThisMonthStartYmdInKst();

  // 모든 그룹 리더(영업자 + 의뢰자 owner) 조회
  const leaders = await User.find({
    $or: [
      { role: "salesman" },
      { role: "devops" },
      { role: "requestor", requestorRole: "owner" },
    ],
    active: true,
    businessAnchorId: { $ne: null },
  })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();

  if (!leaders.length) {
    console.log("[monthlyReferralSnapshot] No leaders found, skipping.");
    return;
  }

  let upsertCount = 0;
  for (const leader of leaders) {
    const leaderAnchorId = String(leader?.businessAnchorId || "");
    if (!Types.ObjectId.isValid(leaderAnchorId)) continue;

    const result =
      await recomputePricingReferralSnapshotForLeaderAnchorId(leaderAnchorId);
    if (result) upsertCount++;
  }

  console.log(
    `[${new Date().toISOString()}] Monthly referral snapshot completed. Upserted ${upsertCount} snapshots for ymd=${ymd}.`,
  );
}

// 1분마다 KST 1일 00:00 여부 확인 후 실행 (중복 실행 방지: 분당 1회)
const INTERVAL_MS = 60 * 1000;
let lastRunYmd = null;

async function loop() {
  try {
    if (isFirstDayOfMonthKst()) {
      const ymd = getThisMonthStartYmdInKst();
      if (lastRunYmd !== ymd) {
        lastRunYmd = ymd;
        await runMonthlySnapshot();
      }
    }
  } catch (err) {
    console.error("[monthlyReferralSnapshot] Error:", err);
  }
  setTimeout(loop, INTERVAL_MS);
}

if (process.env.MONTHLY_REFERRAL_SNAPSHOT_WORKER_ENABLED !== "false") {
  loop().catch((err) => {
    console.error("[monthlyReferralSnapshot] Init failed:", err);
    process.exit(1);
  });
} else {
  console.log("[monthlyReferralSnapshot] Worker is disabled");
}
