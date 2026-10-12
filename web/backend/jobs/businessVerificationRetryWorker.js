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

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.BUSINESS_VERIFY_RETRY_INTERVAL_MS) || 5 * 60_000,
);

let timer = null;
let running = false;

export async function retryPendingBusinessVerificationsOnce({ limit = 50 } = {}) {
  const rows = await BusinessAnchor.find({
    status: "active",
    verificationPendingAt: { $ne: null },
  })
    .select({
      name: 1,
      businessType: 1,
      businessNumberNormalized: 1,
      primaryContactUserId: 1,
      metadata: 1,
    })
    .sort({ verificationPendingAt: 1 })
    .limit(limit)
    .lean();

  let verified = 0;
  let rejected = 0;
  for (const row of rows) {
    const result = await verifyBusinessNumber({
      businessNumber:
        row.businessNumberNormalized || row.metadata?.businessNumber || "",
      companyName: row.metadata?.companyName || row.name || "",
      representativeName: row.metadata?.representativeName || "",
      startDate: row.metadata?.startDate || "",
      deferOnOutage: true,
    }).catch(() => ({ verified: false, pending: true }));

    // 아직 장애 중이면 다음 주기에 재시도
    if (result.pending) break;

    if (result.verified) {
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
      verified += 1;
    } else {
      // 휴업·폐업 등 확정 실패: 보류 해제 후 사유 기록
      await BusinessAnchor.updateOne(
        { _id: row._id },
        {
          $set: {
            verificationPendingAt: null,
            verificationMessage: result.message || "사업자 검증에 실패했습니다.",
          },
        },
      );
      rejected += 1;
    }
  }
  return { scanned: rows.length, verified, rejected };
}

/**
 * 보류 건이 있을 때만 타이머를 돌린다. 보류가 모두 처리되면 타이머를 끈다.
 * 서버 시작 시와 보류 건이 새로 생길 때 호출한다.
 */
export async function ensureBusinessVerificationRetryScheduled() {
  if (timer) return;
  const pendingCount = await BusinessAnchor.countDocuments({
    status: "active",
    verificationPendingAt: { $ne: null },
  });
  if (pendingCount === 0 || timer) return;

  const tick = async () => {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    try {
      const r = await retryPendingBusinessVerificationsOnce();
      if (r.scanned > 0) console.log("[businessVerifyRetry]", r);
      const left = await BusinessAnchor.countDocuments({
        status: "active",
        verificationPendingAt: { $ne: null },
      });
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
