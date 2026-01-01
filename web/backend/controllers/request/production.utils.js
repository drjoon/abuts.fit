import {
  getTodayYmdInKst,
  addKoreanBusinessDays,
  getDeliveryEtaLeadDays,
} from "./utils.js";

/**
 * 생산 스케줄 계산 유틸리티 (시각 단위 관리)
 *
 * 생산 프로세스:
 * 1. 의뢰 → (대기) → CAM 시작
 * 2. CAM 시작 → CAM 완료 (5분)
 * 3. CAM 완료 → 가공 시작 → 가공 완료 (15분)
 * 4. 가공 완료 → 세척/검사/포장 대기 (50~100개 모아서 처리, 1일 소요)
 * 5. 배치 처리 완료 → 택배 수거 (다음날 14:00)
 * 6. 택배 수거 → 도착 (1영업일)
 *
 * CNC 장비별 소재 세팅:
 * - M3: 6mm 전용
 * - M4: 8mm 전용
 * - 10mm, 10+: 일주일에 1~2회 M3 또는 M4 소재 교체하여 생산
 *
 * 장비별 생산 큐:
 * - 각 장비마다 독립적인 큐 관리
 * - 우선순위: 도착 예정시각 순서만 고려 (FIFO)
 */

const CAM_DURATION_MINUTES = 5; // CAM 시작 → 완료
const MACHINING_DURATION_MINUTES = 15; // 가공 시작 → 완료
const BATCH_PROCESSING_DAYS = 1; // 세척/검사/포장 (50~100개 모아서)
const DAILY_PICKUP_HOUR = 14; // 택배 수거 시각 (14:00)

/**
 * KST 시각 생성
 */
function createKstDateTime(ymd, hour = 0, minute = 0) {
  let ymdString = ymd;
  if (ymd instanceof Date) {
    ymdString = ymd.toISOString().slice(0, 10);
  }
  ymdString =
    typeof ymdString === "string" ? ymdString : String(ymdString || "");

  const parts = ymdString.split("-").map((n) => Number(n));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [year, month, day] = parts;
    return new Date(year, month - 1, day, hour, minute, 0);
  }

  // fallback: Date 파싱 후 KST 기준으로 재생성
  const parsed = new Date(ymdString);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().slice(0, 10).split("-").map(Number);
    const [year, month, day] = iso;
    return new Date(year, month - 1, day, hour, minute, 0);
  }

  throw new Error(`Invalid ymd for createKstDateTime: ${ymdString}`);
}

/**
 * 다음 택배 수거 시각 계산 (매일 14:00)
 */
function getNextPickupTime(fromDateTime) {
  const pickupTime = new Date(fromDateTime);
  pickupTime.setHours(DAILY_PICKUP_HOUR, 0, 0, 0);

  // 이미 14:00 지났으면 다음날 14:00
  if (fromDateTime >= pickupTime) {
    pickupTime.setDate(pickupTime.getDate() + 1);
  }

  return pickupTime;
}

/**
 * 직경 그룹 분류 및 장비 할당
 */
function getDiameterGroupAndMachine(maxDiameter) {
  const d =
    typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;

  if (d <= 6) {
    return { diameter: 6, diameterGroup: "6", preferredMachine: "M3" };
  } else if (d <= 8) {
    return { diameter: 8, diameterGroup: "8", preferredMachine: "M4" };
  } else if (d <= 10) {
    return { diameter: 10, diameterGroup: "10", preferredMachine: null }; // 소재 교체 필요
  } else {
    return { diameter: d, diameterGroup: "10+", preferredMachine: null }; // 소재 교체 필요
  }
}

/**
 * 묶음배송 대기 시간 계산 (직경별)
 */
function getBulkWaitHours(diameterGroup) {
  // 6mm, 8mm: 즉시 생산 가능 (전용 장비 있음)
  if (diameterGroup === "6" || diameterGroup === "8") return 0;

  // 10mm, 10+: 일주일에 1~2회 소재 교체 (평균 3일 대기)
  return 72; // 3일(72시간) 대기
}

/**
 * 신규 의뢰의 생산 스케줄 계산 (시각 단위)
 * @param {Object} params
 * @param {string} params.shippingMode - 'normal' | 'express'
 * @param {number} params.maxDiameter - 최대 직경 (mm)
 * @param {Date} params.requestedAt - 의뢰 생성 시각
 * @returns {Object} productionSchedule
 */
export async function calculateInitialProductionSchedule({
  shippingMode,
  maxDiameter,
  requestedAt,
}) {
  const now = requestedAt || new Date();
  const { diameter, diameterGroup, preferredMachine } =
    getDiameterGroupAndMachine(maxDiameter);

  let scheduledCamStart;

  if (shippingMode === "express") {
    // 신속배송: 즉시 CAM 시작
    scheduledCamStart = new Date(now);
  } else {
    // 묶음배송: 직경별 대기
    const waitHours = getBulkWaitHours(diameterGroup);
    scheduledCamStart = new Date(now.getTime() + waitHours * 60 * 60 * 1000);
  }

  // CAM 시작 → CAM 완료 (5분)
  const scheduledCamComplete = new Date(
    scheduledCamStart.getTime() + CAM_DURATION_MINUTES * 60 * 1000
  );

  // CAM 완료 → 가공 시작 (즉시)
  const scheduledMachiningStart = new Date(scheduledCamComplete);

  // 가공 시작 → 가공 완료 (15분)
  const scheduledMachiningComplete = new Date(
    scheduledMachiningStart.getTime() + MACHINING_DURATION_MINUTES * 60 * 1000
  );

  // 가공 완료 → 배치 처리 (세척/검사/포장, 1일 소요)
  const machiningCompleteYmd = scheduledMachiningComplete
    .toISOString()
    .slice(0, 10);
  const batchProcessingYmd = await addKoreanBusinessDays({
    startYmd: machiningCompleteYmd,
    days: BATCH_PROCESSING_DAYS,
  });
  const scheduledBatchProcessing = createKstDateTime(batchProcessingYmd, 12, 0);

  // 배치 처리 완료 → 택배 수거 (다음날 14:00)
  const scheduledShipPickup = getNextPickupTime(scheduledBatchProcessing);

  // 택배 수거 → 도착 (1영업일)
  const pickupYmd = scheduledShipPickup.toISOString().slice(0, 10);
  const deliveryYmd = await addKoreanBusinessDays({
    startYmd: pickupYmd,
    days: 1,
  });
  const estimatedDelivery = createKstDateTime(deliveryYmd, 12, 0);

  return {
    scheduledCamStart,
    scheduledCamComplete,
    scheduledMachiningStart,
    scheduledMachiningComplete,
    scheduledBatchProcessing,
    scheduledShipPickup,
    estimatedDelivery,
    assignedMachine: preferredMachine, // M3, M4, 또는 null
    diameter,
    diameterGroup,
  };
}

/**
 * 장비별 생산 큐 조회 및 정렬
 * @param {string} machineId - M3, M4 등
 * @param {Array} requests - Request 문서 배열
 * @returns {Array} 도착 예정시각 순으로 정렬된 배열
 */
export function getProductionQueueForMachine(machineId, requests) {
  return requests
    .filter((req) => {
      const schedule = req.productionSchedule;
      if (!schedule) return false;

      // 해당 장비에 할당된 의뢰만
      if (schedule.assignedMachine !== machineId) return false;

      // 의뢰, CAM, 생산 단계만 (발송 이후는 제외)
      if (!["의뢰", "CAM", "생산"].includes(req.status)) return false;

      return true;
    })
    .sort((a, b) => {
      // 도착 예정시각 순서만 고려 (FIFO)
      const aTime = a.productionSchedule?.estimatedDelivery || new Date(0);
      const bTime = b.productionSchedule?.estimatedDelivery || new Date(0);
      return aTime - bTime;
    });
}

/**
 * 모든 장비별 생산 큐 조회
 * @param {Array} requests - Request 문서 배열
 * @returns {Object} { M3: [...], M4: [...], unassigned: [...] }
 */
export function getAllProductionQueues(requests) {
  const queues = {
    M3: [],
    M4: [],
    unassigned: [],
  };

  for (const req of requests) {
    const schedule = req.productionSchedule;
    if (!schedule) continue;

    // 의뢰, CAM, 생산 단계만
    if (!["의뢰", "CAM", "생산"].includes(req.status)) continue;

    const machine = schedule.assignedMachine;
    if (machine === "M3") {
      queues.M3.push(req);
    } else if (machine === "M4") {
      queues.M4.push(req);
    } else {
      queues.unassigned.push(req);
    }
  }

  // 각 큐를 도착 예정시각 순으로 정렬
  for (const key in queues) {
    queues[key].sort((a, b) => {
      const aTime = a.productionSchedule?.estimatedDelivery || new Date(0);
      const bTime = b.productionSchedule?.estimatedDelivery || new Date(0);
      return aTime - bTime;
    });
  }

  return queues;
}

/**
 * 배송 모드 변경 시 생산 스케줄 재계산
 * 의뢰 단계에서만 변경 가능
 */
export function recalculateProductionSchedule({
  currentStage,
  newShippingMode,
  maxDiameter,
  requestedAt,
}) {
  // 의뢰 단계가 아니면 스케줄 변경 불가
  if (currentStage !== "의뢰") {
    return null;
  }

  // 새로운 스케줄 계산
  return calculateInitialProductionSchedule({
    shippingMode: newShippingMode,
    maxDiameter,
    requestedAt,
  });
}

/**
 * 장비 소재 세팅 변경 시 해당 장비의 큐 재계산
 * @param {string} machineId - M3, M4 등
 * @param {string} newDiameterGroup - "6" | "8" | "10" | "10+"
 */
export async function recalculateQueueOnMaterialChange(
  machineId,
  newDiameterGroup
) {
  const Request = (await import("../../models/request.model.js")).default;

  // 해당 직경 그룹의 unassigned 의뢰 조회
  const unassignedRequests = await Request.find({
    status: { $in: ["의뢰", "CAM", "생산"] },
    "productionSchedule.assignedMachine": null,
    "productionSchedule.diameterGroup": newDiameterGroup,
  });

  // 도착 예정시각 순으로 정렬하여 장비에 할당
  const sortedRequests = unassignedRequests.sort((a, b) => {
    const aTime = a.productionSchedule?.estimatedDelivery || new Date(0);
    const bTime = b.productionSchedule?.estimatedDelivery || new Date(0);
    return aTime - bTime;
  });

  // 장비 할당 업데이트
  for (let i = 0; i < sortedRequests.length; i++) {
    const req = sortedRequests[i];
    req.productionSchedule.assignedMachine = machineId;
    req.productionSchedule.queuePosition = i + 1;
    await req.save();
  }

  return sortedRequests.length;
}

/**
 * 생산 큐에서 다음 작업 선택 우선순위 계산 (시각 기반)
 * @param {Array} requests - Request 문서 배열
 * @returns {Array} 우선순위 정렬된 배열
 */
export function sortByProductionPriority(requests) {
  const now = new Date();

  return requests
    .map((req) => {
      const schedule = req.productionSchedule || {};
      const finalMode = req.finalShipping?.mode || req.originalShipping?.mode;

      // 우선순위가 이미 계산되어 있으면 사용
      if (typeof schedule.priority === "number") {
        return { ...req.toObject(), _priority: schedule.priority };
      }

      // 없으면 즉시 계산
      const priority = calculatePriority({
        shippingMode: finalMode,
        scheduledCamStart: schedule.scheduledCamStart || now,
        diameterGroup: schedule.diameterGroup || "6-8",
      });

      return { ...req.toObject(), _priority: priority };
    })
    .sort((a, b) => b._priority - a._priority);
}

/**
 * 지연 위험 요약 계산
 * @param {Array} requests - Request 문서 배열
 * @returns {Object} { delayedCount, warningCount, onTimeRate, items }
 */
export function calculateRiskSummary(requests) {
  const now = new Date();
  const warningThresholdHours = 4; // 4시간 이내 시작 예정이면 경고

  let delayedCount = 0;
  let warningCount = 0;
  const riskItems = [];

  for (const req of requests) {
    const schedule = req.productionSchedule;
    if (!schedule || !schedule.scheduledCamStart) continue;

    const hoursUntil = (schedule.scheduledCamStart - now) / (1000 * 60 * 60);

    if (hoursUntil < 0) {
      // 이미 지연
      delayedCount++;
      riskItems.push({
        requestId: req.requestId,
        type: "delayed",
        delayHours: Math.abs(hoursUntil),
        scheduledCamStart: schedule.scheduledCamStart,
      });
    } else if (hoursUntil <= warningThresholdHours) {
      // 경고 (곧 시작 예정)
      warningCount++;
      riskItems.push({
        requestId: req.requestId,
        type: "warning",
        hoursUntil,
        scheduledCamStart: schedule.scheduledCamStart,
      });
    }
  }

  const totalActive = requests.length;
  const onTimeCount = totalActive - delayedCount - warningCount;
  const onTimeRate = totalActive > 0 ? (onTimeCount / totalActive) * 100 : 100;

  return {
    delayedCount,
    warningCount,
    onTimeRate: Math.round(onTimeRate),
    items: riskItems.sort((a, b) => {
      if (a.type === "delayed" && b.type !== "delayed") return -1;
      if (a.type !== "delayed" && b.type === "delayed") return 1;
      return 0;
    }),
  };
}
