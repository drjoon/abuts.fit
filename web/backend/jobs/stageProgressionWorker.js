// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/requests/mailbox.utils.js
// change-log:
// - 2026-08-17: 우편함 배정은 가공→세척.패킹, 포장.발송은 기존 배정 유지.
import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import {
  getTodayYmdInKst,
  addKoreanBusinessDays,
  applyStatusMapping,
} from "../controllers/requests/utils.js";
import {
  assignMailboxForCleaningPackingEnter,
  retainMailboxOnShippingEnter,
} from "../controllers/requests/mailbox.utils.js";
import { applyPracticeShippingReceiverSnapshotToRequest } from "../utils/shippingReceiver.utils.js";
import { resolveMongoUri } from "../utils/mongoUri.js";

/**
 * 공정 단계 자동 진행 워커
 *
 * 규칙:
 * 1. 의뢰 → CAM: 발송예정일 2영업일 이내 도달 시
 * 2. CAM → 생산: CAM 단계이고 caseInfos.reviewByStage.cam.status === 'APPROVED' 시
 * 3. 생산 → 발송: 발송예정일 1영업일 이내 도달 시
 * 4. 발송 → 완료: deliveryInfoRef.deliveredAt이 설정되면 (배송 완료 시)
 *
 * 신속배송: shippingMode === 'express'인 경우 우선순위 상승
 */

async function progressStages() {
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error("Mongo URI is not set");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log(
      `[${new Date().toISOString()}] Stage progression worker started`,
    );

    const todayYmd = getTodayYmdInKst();
    const twoDaysFromNow = await addKoreanBusinessDays({
      startYmd: todayYmd,
      days: 2,
    });
    const oneDayFromNow = await addKoreanBusinessDays({
      startYmd: todayYmd,
      days: 1,
    });

    let updatedCount = 0;

    // 1. 준비 → 가공: 발송예정일 2영업일 이내 도달
    // 작업 공정 변경: CAM 중간 단계는 더 이상 사용하지 않으므로 바로 가공으로 전환한다.
    const requestsToCam = await Request.find({
      manufacturerStage: "준비",
      "timeline.estimatedShipYmd": { $exists: true, $lte: twoDaysFromNow },
    });

    for (const req of requestsToCam) {
      applyStatusMapping(req, "가공");
      await req.save();
      updatedCount++;
      console.log(
        `  [준비→가공] ${req.requestId} (SHIP: ${req.timeline.estimatedShipYmd})`,
      );
    }

    // 2. 레거시 보정: 과거 데이터에 남은 "CAM" 값을 가공으로 자동 이관한다.
    const camToProduction = await Request.find({
      manufacturerStage: "CAM",
    });

    for (const req of camToProduction) {
      applyStatusMapping(req, "가공");
      await req.save();
      updatedCount++;
      console.log(`  [레거시 CAM→가공 보정] ${req.requestId}`);
    }

    // 3. 가공 → 세척.패킹: 출고 예정일 1영업일 이내 도달한 가공 완료 건
    const productionToPackaging = await Request.find({
      manufacturerStage: "가공",
      "timeline.estimatedShipYmd": { $exists: true, $lte: oneDayFromNow },
    }).populate("requestor", "businessAnchorId");

    for (const req of productionToPackaging) {
      applyStatusMapping(req, "세척.패킹");
      // 우편함 배정 SSOT: 가공→세척.패킹 진입 시 1회 배정한다.
      const requestorOrgId =
        req.businessAnchorId || req.requestor?.businessAnchorId || null;
      await assignMailboxForCleaningPackingEnter({
        request: req,
        requestorOrgId,
      });
      await req.save();
      updatedCount++;
      console.log(
        `  [가공→세척.패킹] ${req.requestId} mailbox=${req.mailboxAddress || "-"} (SHIP: ${req.timeline.estimatedShipYmd})`,
      );
    }

    // 4. 세척.패킹 → 포장.발송: 출고 예정일이 도래한 세척·패킹 완료 건
    const packagingToShipping = await Request.find({
      manufacturerStage: "세척.패킹",
      "timeline.estimatedShipYmd": { $exists: true, $lte: oneDayFromNow },
      source: { $ne: "manufacturer_sample" },
      "price.rule": { $ne: "manufacturer_sample" },
    }).populate("requestor", "businessAnchorId");

    for (const req of packagingToShipping) {
      try {
        const requestorOrgId =
          req.businessAnchorId || req.requestor?.businessAnchorId || null;
        await retainMailboxOnShippingEnter({
          request: req,
          requestorOrgId,
        });
      } catch (error) {
        console.error("[STAGE_WORKER] mailbox retain/fallback failed", {
          requestId: req.requestId,
          message: error?.message || String(error),
        });
      }
      try {
        await applyPracticeShippingReceiverSnapshotToRequest(req);
      } catch (error) {
        console.error("[STAGE_WORKER] shippingReceiver snapshot failed", {
          requestId: req.requestId,
          message: error?.message || String(error),
        });
      }
      applyStatusMapping(req, "포장.발송");
      await req.save();
      updatedCount++;
      console.log(
        `  [세척.패킹→포장.발송] ${req.requestId} (SHIP: ${req.timeline.estimatedShipYmd})`,
      );
    }

    // 4. 발송 → 완료: deliveryInfoRef가 있고 deliveredAt이 설정된 경우
    // (이 부분은 배송 완료 API에서 처리하는 것이 더 적절하므로 워커에서는 생략)

    console.log(
      `[${new Date().toISOString()}] Stage progression completed. Updated ${updatedCount} requests.`,
    );

    await mongoose.disconnect();
  } catch (error) {
    console.error("Stage progression worker failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// 5분마다 실행
const INTERVAL_MS = 5 * 60 * 1000; // 5분

async function runWorker() {
  await progressStages();
  setTimeout(runWorker, INTERVAL_MS);
}

// 즉시 실행 후 주기적 실행
if (process.env.STAGE_PROGRESSION_WORKER_ENABLED !== "false") {
  runWorker().catch((err) => {
    console.error("Worker initialization failed:", err);
    process.exit(1);
  });
} else {
  console.log("Stage progression worker is disabled");
}
