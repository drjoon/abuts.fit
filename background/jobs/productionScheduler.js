import "../bootstrap/env.js";
import { dbReady } from "../db.js";
import Request from "../models/request.model.js";
import CncMachine from "../models/cncMachine.model.js";

/**
 * 생산 스케줄러 워커
 *
 * 역할:
 * 1. 생산 스케줄에 따라 공정 단계 자동 진행
 * 2. 소재 교체 예약 처리
 *
 * 공정 단계 자동 진행 규칙:
 * - 의뢰 → CAM: 수동 처리 (제조사가 직접 CAM 작업 시작)
 * - CAM → 생산: 수동 처리 (제조사가 CAM 승인 후 가공 큐에 추가)
 * - 생산 → 발송: productionSchedule.scheduledBatchProcessing <= 현재 (배치 처리 완료)
 * - 발송 → 완료: deliveryInfoRef.deliveredAt 존재 (배송 완료 API에서 처리)
 */

let lastRunAt = null;
let isRunning = false;

/**
 * 공정 단계 자동 진행 (시각 기반)
 *
 * 프로세스:
 * 1. 의뢰 → CAM: 수동 처리 (제조사가 직접 CAM 작업 시작)
 * 2. CAM → 생산: 수동 처리 (제조사가 CAM 승인 후 가공 큐에 추가)
 * 3. 생산 → 발송: scheduledBatchProcessing <= 현재 (배치 처리 완료)
 * 4. 발송 → 완료: deliveryInfoRef.deliveredAt 존재 (배송 완료 API에서 처리)
 * 5. 소재 교체 예약 처리
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

    // 1. 생산 → 발송: 배치 처리 완료 (세척/검사/포장)
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

    // 2. 발송 → 완료: 배송 완료 (배송 완료 API에서 처리)

    // 3. 소재 교체 예약 처리
    const materialChangeCount = await processScheduledMaterialChanges(now);
    updatedCount += materialChangeCount;

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
 * 소재 교체 예약 처리
 *
 * 로직:
 * 1. 예약된 소재 교체 시각이 도래한 장비 조회
 * 2. 해당 장비의 현재 큐에서 교체 시각 이전에 완료 가능한 의뢰만 유지
 * 3. 교체 시각 이후에 완료될 의뢰는 unassigned로 변경
 * 4. 소재 교체 실행 및 새 직경 그룹의 unassigned 의뢰를 재할당
 */
async function processScheduledMaterialChanges(now) {
  let changeCount = 0;

  try {
    // 소재 교체 예약이 도래한 장비 조회
    const machines = await CncMachine.find({
      "scheduledMaterialChange.targetTime": { $exists: true, $lte: now },
    });

    for (const machine of machines) {
      const { targetTime, newDiameter, newDiameterGroup } =
        machine.scheduledMaterialChange;

      console.log(
        `  [소재교체] ${machine.machineId}: ${
          machine.currentMaterial.diameterGroup
        }mm → ${newDiameterGroup}mm (target: ${targetTime.toISOString()})`
      );

      // 현재 장비에 할당된 의뢰 조회
      const assignedRequests = await Request.find({
        status: { $in: ["CAM", "생산"] },
        "productionSchedule.assignedMachine": machine.machineId,
      }).sort({ "productionSchedule.estimatedDelivery": 1 });

      // 교체 시각 이전에 완료 불가능한 의뢰는 unassigned로 변경
      let unassignedCount = 0;
      for (const req of assignedRequests) {
        const estimatedCompletion =
          req.productionSchedule.scheduledMachiningEnd;
        if (estimatedCompletion && estimatedCompletion > targetTime) {
          req.productionSchedule.assignedMachine = null;
          req.productionSchedule.queuePosition = null;
          await req.save();
          unassignedCount++;
          console.log(
            `    [unassign] ${
              req.requestId
            } (완료예정: ${estimatedCompletion.toISOString()} > 교체시각)`
          );
        }
      }

      // 소재 교체 실행
      machine.currentMaterial = {
        diameter: newDiameter,
        diameterGroup: newDiameterGroup,
        setAt: now,
        setBy: machine.scheduledMaterialChange.scheduledBy,
      };
      machine.scheduledMaterialChange = undefined;
      await machine.save();

      // 새 직경 그룹의 unassigned 의뢰를 이 장비에 재할당
      const newRequests = await Request.find({
        status: { $in: ["CAM", "생산"] },
        "productionSchedule.assignedMachine": null,
        "productionSchedule.diameterGroup": newDiameterGroup,
      }).sort({ "productionSchedule.estimatedDelivery": 1 });

      let assignedCount = 0;
      for (const req of newRequests) {
        req.productionSchedule.assignedMachine = machine.machineId;
        await req.save();
        assignedCount++;
      }

      console.log(
        `    [완료] unassigned: ${unassignedCount}, 신규할당: ${assignedCount}`
      );
      changeCount++;
    }
  } catch (error) {
    console.error("[processScheduledMaterialChanges] Error:", error);
  }

  return changeCount;
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
