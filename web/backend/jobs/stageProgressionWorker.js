import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import {
  getTodayYmdInKst,
  addKoreanBusinessDays,
  applyStatusMapping,
} from "../controllers/requests/utils.js";

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
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
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

    // 1. 의뢰 → CAM: 발송예정일 2영업일 이내 도달
    const requestsToCam = await Request.find({
      manufacturerStage: "의뢰",
      "timeline.estimatedShipYmd": { $exists: true, $lte: twoDaysFromNow },
    });

    for (const req of requestsToCam) {
      applyStatusMapping(req, "CAM");
      await req.save();
      updatedCount++;
      console.log(
        `  [의뢰→CAM] ${req.requestId} (SHIP: ${req.timeline.estimatedShipYmd})`,
      );
    }

    // 2. CAM → 가공: CAM 승인 완료된 건
    const camToProduction = await Request.find({
      manufacturerStage: "CAM",
      "caseInfos.reviewByStage.cam.status": "APPROVED",
    });

    for (const req of camToProduction) {
      applyStatusMapping(req, "가공");
      await req.save();
      updatedCount++;
      console.log(`  [CAM→가공] ${req.requestId} (CAM 승인 완료)`);
    }

    // 3. 가공 → 세척.패킹: 출고 예정일 1영업일 이내 도달한 가공 완료 건
    const productionToPackaging = await Request.find({
      manufacturerStage: "가공",
      "timeline.estimatedShipYmd": { $exists: true, $lte: oneDayFromNow },
    });

    for (const req of productionToPackaging) {
      applyStatusMapping(req, "세척.패킹");
      await req.save();
      updatedCount++;
      console.log(
        `  [가공→세척.패킹] ${req.requestId} (SHIP: ${req.timeline.estimatedShipYmd})`,
      );
    }

    // 4. 세척.패킹 → 포장.발송: 출고 예정일이 도래한 세척·패킹 완료 건
    const packagingToShipping = await Request.find({
      manufacturerStage: "세척.패킹",
      "timeline.estimatedShipYmd": { $exists: true, $lte: oneDayFromNow },
    });

    for (const req of packagingToShipping) {
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
