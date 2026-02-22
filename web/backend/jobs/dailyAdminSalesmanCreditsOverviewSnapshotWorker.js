/**
 * 매일 KST 00:00에 실행되는 관리자용 '영업자 크레딧 overview' 스냅샷 워커.
 *
 * 목적:
 * - AdminCreditPage(영업자 탭)의 상단 요약(총 영업자 수/소개 매출/수수료/기간 잔액/총 정산)을
 *   무한 스크롤 로딩 개수(초기 9개 등)에 의존하지 않고, 전체 데이터 기준으로 안정적으로 제공한다.
 *
 * 동작:
 * - KST 자정 기준 직전 30일(UTC range)로 집계하여
 *   AdminSalesmanCreditsOverviewSnapshot(ymd, periodKey=30d)에 upsert
 * - 누락 감지: 오늘 스냅샷이 없으면 즉시 재계산
 */

import "../bootstrap/env.js";
import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import SalesmanLedger from "../models/salesmanLedger.model.js";
import Request from "../models/request.model.js";
import AdminSalesmanCreditsOverviewSnapshot from "../models/adminSalesmanCreditsOverviewSnapshot.model.js";
import {
  getTodayYmdInKst,
  getTodayMidnightUtcInKst,
  getLast30DaysRangeUtc,
} from "../utils/krBusinessDays.js";

const PERIOD_KEY = "30d";

function normalizeNumber(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function kstRangeToPeriodKey(range) {
  // 현재는 30d 고정. 추후 확장 시 range 기반 key 생성 가능.
  return PERIOD_KEY;
}

function isMidnightKst() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kstNow.getUTCHours() === 0 && kstNow.getUTCMinutes() === 0;
}

async function isTodaySnapshotMissing(ymd) {
  const count = await AdminSalesmanCreditsOverviewSnapshot.countDocuments({
    ymd,
    periodKey: PERIOD_KEY,
  });
  return count === 0;
}

async function computeAndUpsertSnapshot({ ymd, range }) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error(
      "[dailyAdminSalesmanCreditsOverviewSnapshot] MONGODB_URI is not set",
    );
    return;
  }

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(mongoUri);
  }

  const { start: rangeStartUtc, end: rangeEndUtc } = range;
  const periodKey = kstRangeToPeriodKey(range);

  console.log(
    `[${new Date().toISOString()}] Admin salesman credits overview snapshot started ymd=${ymd} periodKey=${periodKey}`,
  );

  const commissionRate = 0.05;

  const salesmen = await User.find({ role: "salesman", active: true })
    .select({ _id: 1 })
    .lean();
  const salesmanObjectIds = (salesmen || []).map((s) => s?._id).filter(Boolean);

  const salesmenCount = salesmanObjectIds.length;

  if (salesmenCount === 0) {
    await AdminSalesmanCreditsOverviewSnapshot.updateOne(
      { ymd, periodKey },
      {
        $set: {
          ymd,
          periodKey,
          rangeStartUtc,
          rangeEndUtc,
          salesmenCount: 0,
          referral: {
            paidRevenueAmount: 0,
            bonusRevenueAmount: 0,
            orderCount: 0,
          },
          commission: {
            totalAmount: 0,
            directAmount: 0,
            indirectAmount: 0,
          },
          walletPeriod: {
            earnedAmount: 0,
            paidOutAmount: 0,
            adjustedAmount: 0,
            balanceAmount: 0,
          },
          computedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return;
  }

  // 기간 기준 지갑 합산
  const ledgerPeriodRows = await SalesmanLedger.aggregate([
    {
      $match: {
        salesmanId: { $in: salesmanObjectIds },
        createdAt: { $gte: rangeStartUtc, $lte: rangeEndUtc },
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
      },
    },
  ]);

  let earnedAmount = 0;
  let paidOutAmount = 0;
  let adjustedAmount = 0;
  for (const r of ledgerPeriodRows || []) {
    const type = String(r?._id || "");
    const total = normalizeNumber(r?.total || 0);
    if (type === "EARN") earnedAmount += total;
    else if (type === "PAYOUT") paidOutAmount += total;
    else if (type === "ADJUST") adjustedAmount += total;
  }
  const balanceAmount = normalizeNumber(
    earnedAmount - paidOutAmount + adjustedAmount,
  );

  // 직접 소개 의뢰자: salesmen -> requestor
  const directRequestors = await User.find({
    role: "requestor",
    active: true,
    referredByUserId: { $in: salesmanObjectIds },
    organizationId: { $ne: null },
  })
    .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
    .lean();

  // 직계1 영업자
  const childSalesmen = await User.find({
    role: "salesman",
    active: true,
    referredByUserId: { $in: salesmanObjectIds },
  })
    .select({ _id: 1, referredByUserId: 1 })
    .lean();

  const childSalesmanObjectIds = (childSalesmen || [])
    .map((s) => s?._id)
    .filter(Boolean);

  // 직계1 영업자가 소개한 의뢰자
  const level1Requestors =
    childSalesmanObjectIds.length === 0
      ? []
      : await User.find({
          role: "requestor",
          active: true,
          referredByUserId: { $in: childSalesmanObjectIds },
          organizationId: { $ne: null },
        })
          .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
          .lean();

  const leaderIdByChildSalesmanId = new Map(
    (childSalesmen || [])
      .map((s) => [String(s?._id || ""), String(s?.referredByUserId || "")])
      .filter(([cid, pid]) => cid && pid),
  );

  // 수수료/매출 집계는 조직 단위
  const directOrgIdsBySalesmanId = new Map();
  for (const u of directRequestors || []) {
    const sid = String(u?.referredByUserId || "");
    const orgId = u?.organizationId ? String(u.organizationId) : "";
    if (!sid || !orgId) continue;
    const set = directOrgIdsBySalesmanId.get(sid) || new Set();
    set.add(orgId);
    directOrgIdsBySalesmanId.set(sid, set);
  }

  const level1OrgIdsBySalesmanId = new Map();
  const requestorOrgIdsByChildSalesmanId = new Map();
  for (const u of level1Requestors || []) {
    const childSid = String(u?.referredByUserId || "");
    const leaderSid = String(leaderIdByChildSalesmanId.get(childSid) || "");
    const orgId = u?.organizationId ? String(u.organizationId) : "";
    if (!orgId) continue;
    if (leaderSid) {
      const set = level1OrgIdsBySalesmanId.get(leaderSid) || new Set();
      set.add(orgId);
      level1OrgIdsBySalesmanId.set(leaderSid, set);
    }
    if (childSid) {
      const set2 = requestorOrgIdsByChildSalesmanId.get(childSid) || new Set();
      set2.add(orgId);
      requestorOrgIdsByChildSalesmanId.set(childSid, set2);
    }
  }

  const orgIdsAll = Array.from(
    new Set(
      [
        ...directOrgIdsBySalesmanId.values(),
        ...level1OrgIdsBySalesmanId.values(),
      ].flatMap((s) => Array.from(s)),
    ),
  )
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const revenueRows =
    orgIdsAll.length === 0
      ? []
      : await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: orgIdsAll },
              "caseInfos.reviewByStage.shipping.status": "APPROVED",
              createdAt: { $gte: rangeStartUtc, $lte: rangeEndUtc },
            },
          },
          {
            $group: {
              _id: "$requestorOrganizationId",
              paidRevenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusRevenueAmount: {
                $sum: { $ifNull: ["$price.bonusAmount", 0] },
              },
              orderCount: { $sum: 1 },
            },
          },
        ]);

  const revenueByOrgId = new Map(
    (revenueRows || []).map((r) => [
      String(r._id),
      {
        paid: normalizeNumber(r.paidRevenueAmount || 0),
        bonus: normalizeNumber(r.bonusRevenueAmount || 0),
        orders: normalizeNumber(r.orderCount || 0),
      },
    ]),
  );

  let totalPaidRevenue = 0;
  let totalBonusRevenue = 0;
  let totalOrders = 0;
  for (const oid of revenueByOrgId.keys()) {
    const row = revenueByOrgId.get(oid);
    if (!row) continue;
    totalPaidRevenue += row.paid;
    totalBonusRevenue += row.bonus;
    totalOrders += row.orders;
  }

  // 전체 수수료(유료 매출 기준) - 직접(5%) + 간접(2.5%)
  let directCommissionTotal = 0;
  for (const [sid, orgSet] of directOrgIdsBySalesmanId.entries()) {
    let paid = 0;
    for (const oid of orgSet) {
      paid += Number(revenueByOrgId.get(String(oid))?.paid || 0);
    }
    directCommissionTotal += paid * commissionRate;
  }

  // 간접: 자식 영업자의 direct 커미션 합 * 50%
  let indirectCommissionTotal = 0;
  for (const child of childSalesmen || []) {
    const childSid = String(child?._id || "");
    const parentSid = String(child?.referredByUserId || "");
    if (!childSid || !parentSid) continue;

    const orgSet = requestorOrgIdsByChildSalesmanId.get(childSid) || new Set();
    let paid = 0;
    for (const oid of orgSet) {
      paid += Number(revenueByOrgId.get(String(oid))?.paid || 0);
    }
    indirectCommissionTotal += paid * commissionRate * 0.5;
  }

  const totalCommissionAmount = normalizeNumber(
    directCommissionTotal + indirectCommissionTotal,
  );

  await AdminSalesmanCreditsOverviewSnapshot.updateOne(
    { ymd, periodKey },
    {
      $set: {
        ymd,
        periodKey,
        rangeStartUtc,
        rangeEndUtc,
        salesmenCount,
        referral: {
          paidRevenueAmount: normalizeNumber(totalPaidRevenue),
          bonusRevenueAmount: normalizeNumber(totalBonusRevenue),
          orderCount: normalizeNumber(totalOrders),
        },
        commission: {
          totalAmount: totalCommissionAmount,
          directAmount: normalizeNumber(directCommissionTotal),
          indirectAmount: normalizeNumber(indirectCommissionTotal),
        },
        walletPeriod: {
          earnedAmount: normalizeNumber(earnedAmount),
          paidOutAmount: normalizeNumber(paidOutAmount),
          adjustedAmount: normalizeNumber(adjustedAmount),
          balanceAmount: normalizeNumber(balanceAmount),
        },
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  console.log(
    `[${new Date().toISOString()}] Admin salesman credits overview snapshot completed ymd=${ymd} periodKey=${periodKey}`,
  );
}

const INTERVAL_MS = 60 * 1000;

async function loop() {
  try {
    const now = new Date();
    const ymd = getTodayYmdInKst(now);
    const range = getLast30DaysRangeUtc(now);
    if (ymd && range) {
      const missing = await isTodaySnapshotMissing(ymd);
      if (missing || isMidnightKst()) {
        await computeAndUpsertSnapshot({ ymd, range });
      }
    }
  } catch (err) {
    console.error("[dailyAdminSalesmanCreditsOverviewSnapshot] Error:", err);
  }
  setTimeout(loop, INTERVAL_MS);
}

if (
  process.env.DAILY_ADMIN_SALESMAN_CREDITS_OVERVIEW_SNAPSHOT_WORKER_ENABLED !==
  "false"
) {
  loop().catch((err) => {
    console.error(
      "[dailyAdminSalesmanCreditsOverviewSnapshot] Init failed:",
      err,
    );
    process.exit(1);
  });
} else {
  console.log("[dailyAdminSalesmanCreditsOverviewSnapshot] Worker is disabled");
}
