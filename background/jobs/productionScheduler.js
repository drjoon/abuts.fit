import "../bootstrap/env.js";
import { dbReady } from "../db.js";
import Request from "../models/request.model.js";

/**
 * 생산 스케줄러 워커
 *
 * 역할:
 * 1. 생산 스케줄에 따라 공정 단계 자동 진행
 * 2. 생산 우선순위에 따라 작업 큐 관리
 *
 * 공정 단계 자동 진행 규칙:
 * - 의뢰 → CAM: productionSchedule.scheduledCamStart <= 오늘
 * - CAM → 생산: CAM 승인 완료 (reviewByStage.cam.status === 'APPROVED')
 * - 생산 → 발송: productionSchedule.scheduledShipDate <= 오늘
 * - 발송 → 완료: deliveryInfoRef.deliveredAt 존재
 */

let lastRunAt = null;
let isRunning = false;

/**
 * 공정 단계 자동 진행 (시각 기반)
 *
 * 프로세스:
 * 1. 의뢰 → CAM: scheduledCamStart <= 현재
 * 2. CAM → 생산: CAM 승인 완료 + scheduledMachiningStart <= 현재
 * 3. 생산 → 발송: scheduledBatchProcessing <= 현재 (배치 처리 완료)
 * 4. 발송 → 완료: deliveryInfoRef.deliveredAt 존재
 */
async function progressProductionStages() {
  if (isRunning) {
    console.log("[productionScheduler] Already running, skipping...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  const now = new Date();

  try {
    console.log(`[${now.toISOString()}] Production scheduler started`);

    let updatedCount = 0;

    // 1. 의뢰 → CAM: 예정된 CAM 시작 시각 도달
    const requestsToCam = await Request.find({
      status: "의뢰",
      "productionSchedule.scheduledCamStart": { $exists: true, $lte: now },
    });

    for (const req of requestsToCam) {
      updateStage(req, "CAM");
      if (!req.productionSchedule.actualCamStart) {
        req.productionSchedule.actualCamStart = now;
      }
      await req.save();
      updatedCount++;
      console.log(
        `  [의뢰→CAM] ${req.requestId} machine:${
          req.productionSchedule.assignedMachine || "unassigned"
        }`
      );
    }

    // 2. CAM → 생산: CAM 승인 완료 + 가공 시작 시각 도달
    const camToProduction = await Request.find({
      status: "CAM",
      "caseInfos.reviewByStage.cam.status": "APPROVED",
      "productionSchedule.scheduledMachiningStart": {
        $exists: true,
        $lte: now,
      },
    });

    for (const req of camToProduction) {
      updateStage(req, "생산");
      if (!req.productionSchedule.actualMachiningStart) {
        req.productionSchedule.actualMachiningStart = now;
      }
      await req.save();
      updatedCount++;
      console.log(
        `  [CAM→생산] ${req.requestId} machine:${
          req.productionSchedule.assignedMachine || "unassigned"
        }`
      );
    }

    // 3. 생산 → 발송: 배치 처리 완료 (세척/검사/포장)
    const productionToShipping = await Request.find({
      status: "생산",
      "productionSchedule.scheduledBatchProcessing": {
        $exists: true,
        $lte: now,
      },
    });

    for (const req of productionToShipping) {
      updateStage(req, "발송");
      if (!req.productionSchedule.actualBatchProcessing) {
        req.productionSchedule.actualBatchProcessing = now;
      }
      await req.save();
      updatedCount++;
      console.log(`  [생산→발송] ${req.requestId} (batch processing complete)`);
    }

    // 4. 발송 → 완료: 배송 완료 (배송 완료 API에서 처리)

    const elapsed = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] Production scheduler completed. Updated ${updatedCount} requests in ${elapsed}ms.`
    );

    lastRunAt = new Date();
  } catch (error) {
    console.error("[productionScheduler] Error:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * 공정 단계 업데이트 (applyStatusMapping 대체)
 */
function updateStage(request, newStage) {
  request.status = newStage;
  request.manufacturerStage = newStage;

  // statusHistory 기록
  if (!request.statusHistory) {
    request.statusHistory = [];
  }
  request.statusHistory.push({
    status: newStage,
    note: "자동 진행",
    updatedAt: new Date(),
  });
}

/**
 * 오늘 날짜 (KST 기준 YYYY-MM-DD)
 */
function getTodayYmdInKst() {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  return kstTime.toISOString().slice(0, 10);
}

/**
 * 워커 상태 조회
 */
export function getProductionSchedulerStatus() {
  return {
    name: "productionScheduler",
    lastRunAt: lastRunAt?.toISOString() || null,
    isRunning,
  };
}

/**
 * 워커 시작
 */
export function startProductionScheduler() {
  const INTERVAL_MS = 5 * 60 * 1000; // 5분

  // 즉시 실행
  progressProductionStages();

  // 주기적 실행
  setInterval(progressProductionStages, INTERVAL_MS);

  console.log("[productionScheduler] Started (interval: 5min)");
}

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    await dbReady;
    console.log("[productionScheduler] DB ready");
    await progressProductionStages();
    process.exit(0);
  })();
}
