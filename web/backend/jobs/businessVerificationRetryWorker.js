// related files:
// - web/backend/server.js
// - web/backend/services/hometax.service.js
// - web/backend/controllers/businesses/business.update.controller.js
// 홈택스 장애로 보류(verificationPendingAt)된 사업자를 주기적으로 재검증한다.
// 복구되어 통과하면 verified로 승격하고, 사용자에게 별도 조치를 요구하지 않는다.
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import { verifyBusinessNumber } from "../services/hometax.service.js";
import { activatePendingLabTradingPartnersForPractice } from "../utils/labTradingPartner.util.js";
import { grantWelcomeFreeCreditIfEligible } from "../controllers/businesses/business.freeCredit.util.js";
import { emitAppEventToRoles } from "../socket.js";

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.BUSINESS_VERIFY_RETRY_INTERVAL_MS) || 5 * 60_000,
);

// 자동 재검증은 보류 시각부터 하루만 한다. 이후는 관리자 대시보드에서 처리한다.
export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

const retryableFilter = () => ({
  status: "active",
  verificationPendingAt: { $gte: new Date(Date.now() - RETRY_WINDOW_MS) },
});

/** 관리자 대시보드 카드 실시간 갱신(웹소켓). */
export function emitBusinessVerificationChanged(reason, anchorId) {
  try {
    emitAppEventToRoles(["admin"], "business-verification:changed", {
      reason: String(reason || ""),
      businessAnchorId: anchorId ? String(anchorId) : null,
      emittedAt: new Date().toISOString(),
    });
  } catch {
    /* 실시간 실패는 무시 */
  }
}

let timer = null;
let running = false;

const PENDING_SELECT = {
  name: 1,
  businessType: 1,
  businessNumberNormalized: 1,
  primaryContactUserId: 1,
  metadata: 1,
  verificationRetryCount: 1,
};

/** 보류 건을 verified로 올린다(워커 통과·관리자 수동 승인 공용). */
export async function promotePendingBusinessToVerified(row) {
  const patch = {
    status: "verified",
    verificationPendingAt: null,
    verificationMessage: "",
  };
  if (row.businessType === "requestor") {
    patch.requestorServices = { free: false, paid: true };
  }
  await BusinessAnchor.updateOne(
    { _id: row._id, status: "active" },
    { $set: patch },
  );
  if (patch.requestorServices && row.primaryContactUserId) {
    await User.updateOne(
      { _id: row.primaryContactUserId },
      { $set: { requestorServices: patch.requestorServices } },
    );
  }
  await activatePendingLabTradingPartnersForPractice({
    practiceAnchorId: row._id,
  }).catch(() => null);
  if (String(row.businessType || "") === "requestor") {
    try {
      await grantWelcomeFreeCreditIfEligible({
        businessAnchorId: row._id,
        userId: row.primaryContactUserId || null,
        userRole: "requestor",
      });
    } catch (err) {
      console.error("[welcomeFreeCredit] pending promote", err);
    }
  }
  emitBusinessVerificationChanged("verified", row._id);
}

/** 보류를 해제하고 사유를 남긴다(확정 실패·관리자 반려 공용). 승인 없이 active로 남는다. */
export async function releasePendingBusiness(rowId, message) {
  await BusinessAnchor.updateOne(
    { _id: rowId },
    {
      $set: {
        verificationPendingAt: null,
        verificationMessage: message || "사업자 검증에 실패했습니다.",
      },
    },
  );
  emitBusinessVerificationChanged("released", rowId);
}

/** 보류 1건을 홈택스로 재검증한다. 'pending' | 'verified' | 'rejected' */
export async function retryOnePendingBusinessVerification(row) {
  const result = await verifyBusinessNumber({
    businessNumber:
      row.businessNumberNormalized || row.metadata?.businessNumber || "",
    companyName: row.metadata?.companyName || row.name || "",
    representativeName: row.metadata?.representativeName || "",
    startDate: row.metadata?.startDate || "",
    deferOnOutage: true,
  }).catch(() => ({ verified: false, pending: true }));

  // 시도 횟수·시각은 결과와 상관없이 남겨 관리자가 무한 반복을 알아챌 수 있게 한다.
  await BusinessAnchor.updateOne(
    { _id: row._id },
    {
      $inc: { verificationRetryCount: 1 },
      $set: { verificationLastCheckedAt: new Date() },
    },
  );

  if (result.pending) {
    emitBusinessVerificationChanged("retried", row._id);
    return "pending";
  }
  if (result.verified) {
    await promotePendingBusinessToVerified(row);
    return "verified";
  }
  await releasePendingBusiness(row._id, result.message);
  return "rejected";
}

export async function retryPendingBusinessVerificationsOnce({ limit = 50 } = {}) {
  const rows = await BusinessAnchor.find(retryableFilter())
    .select(PENDING_SELECT)
    .sort({ verificationPendingAt: 1 })
    .limit(limit)
    .lean();

  let verified = 0;
  let rejected = 0;
  for (const row of rows) {
    const state = await retryOnePendingBusinessVerification(row);
    // 아직 장애 중이면 다음 주기에 재시도
    if (state === "pending") break;
    if (state === "verified") verified += 1;
    else rejected += 1;
  }
  return { scanned: rows.length, verified, rejected };
}

/**
 * 보류 건이 있을 때만 타이머를 돌린다. 보류가 모두 처리되면 타이머를 끈다.
 * 서버 시작 시와 보류 건이 새로 생길 때 호출한다.
 */
export async function ensureBusinessVerificationRetryScheduled() {
  if (timer) return;
  const pendingCount = await BusinessAnchor.countDocuments(retryableFilter());
  if (pendingCount === 0 || timer) return;

  const tick = async () => {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    try {
      const r = await retryPendingBusinessVerificationsOnce();
      if (r.scanned > 0) console.log("[businessVerifyRetry]", r);
      const left = await BusinessAnchor.countDocuments(retryableFilter());
      if (left === 0 && timer) {
        clearInterval(timer);
        timer = null;
        console.log("[businessVerifyRetry] no pending, worker stopped");
      }
    } catch (e) {
      console.error("[businessVerifyRetry] failed:", e?.message || e);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[businessVerifyRetry] worker started (${INTERVAL_MS}ms, pending=${pendingCount})`,
  );
}

export const startBusinessVerificationRetryWorker = () =>
  ensureBusinessVerificationRetryScheduled().catch((e) =>
    console.error("[businessVerifyRetry] start failed:", e?.message || e),
  );
