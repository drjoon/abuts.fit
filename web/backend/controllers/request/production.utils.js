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
 * 2. CAM 시작 → 생산 완료 (20분 내)
 * 3. 생산 완료 → 택배 수거 (매일 14:00)
 * 4. 택배 수거 → 도착 (1영업일)
 *
 * CNC 장비별 소재:
 * - 6mm, 8mm: 여러 장비에 세팅 (자주 사용)
 * - 10mm, 10mm+: 모여서 한꺼번에 생산 (소재 교체 시간 많이 걸림)
 */

const PRODUCTION_DURATION_MINUTES = 20; // CAM 시작 → 생산 완료
const DAILY_PICKUP_HOUR = 14; // 택배 수거 시각 (14:00)

/**
 * KST 시각 생성
 */
function createKstDateTime(ymd, hour = 0, minute = 0) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0);
  return date;
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
 * 직경 그룹 분류
 */
function getDiameterGroup(maxDiameter) {
  const d =
    typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;
  if (d <= 8) return "6-8"; // 자주 사용, 여러 장비에 세팅
  return "10+"; // 모여서 한꺼번에 생산
}

/**
 * 묶음배송 대기 시간 계산 (직경별)
 */
function getBulkWaitHours(maxDiameter) {
  const group = getDiameterGroup(maxDiameter);
  if (group === "6-8") return 0; // 즉시 생산 가능
  return 72; // 10+ 그룹은 3일(72시간) 대기
}

/**
 * 신규 의뢰의 생산 스케줄 계산 (시각 단위)
 * @param {Object} params
 * @param {string} params.shippingMode - 'normal' | 'express'
 * @param {number} params.maxDiameter - 최대 직경 (mm)
 * @param {Date} params.requestedAt - 의뢰 생성 시각
 * @returns {Object} productionSchedule
 */
export function calculateInitialProductionSchedule({
  shippingMode,
  maxDiameter,
  requestedAt,
}) {
  const now = requestedAt || new Date();
  const diameterGroup = getDiameterGroup(maxDiameter);

  let scheduledCamStart;

  if (shippingMode === "express") {
    // 신속배송: 즉시 CAM 시작
    scheduledCamStart = new Date(now);
  } else {
    // 묶음배송: 직경별 대기
    const waitHours = getBulkWaitHours(maxDiameter);
    scheduledCamStart = new Date(now.getTime() + waitHours * 60 * 60 * 1000);
  }

  // CAM 시작 → 생산 완료 (20분)
  const scheduledProductionComplete = new Date(
    scheduledCamStart.getTime() + PRODUCTION_DURATION_MINUTES * 60 * 1000
  );

  // 생산 완료 → 택배 수거 (다음 14:00)
  const scheduledShipPickup = getNextPickupTime(scheduledProductionComplete);

  // 택배 수거 → 도착 (1영업일)
  const pickupYmd = scheduledShipPickup.toISOString().slice(0, 10);
  const deliveryYmd = addKoreanBusinessDays({
    startYmd: pickupYmd,
    days: 1,
  });
  const estimatedDelivery = createKstDateTime(deliveryYmd, 12, 0); // 정오 도착 가정

  // 우선순위 계산
  const priority = calculatePriority({
    shippingMode,
    scheduledCamStart,
    diameterGroup,
  });

  return {
    scheduledCamStart,
    scheduledProductionComplete,
    scheduledShipPickup,
    estimatedDelivery,
    priority,
    diameterGroup,
  };
}

/**
 * 우선순위 계산
 */
function calculatePriority({ shippingMode, scheduledCamStart, diameterGroup }) {
  const now = new Date();
  let priority = 0;

  // 1. 신속배송 최우선
  if (shippingMode === "express") {
    priority += 10000;
  }

  // 2. 예정 시각 지남 (긴급)
  if (scheduledCamStart <= now) {
    const delayHours = (now - scheduledCamStart) / (1000 * 60 * 60);
    priority += 5000 + delayHours * 100; // 지연 시간만큼 우선순위 상승
  }

  // 3. 예정 시각이 가까운 순
  const hoursUntil = (scheduledCamStart - now) / (1000 * 60 * 60);
  priority -= hoursUntil * 10;

  // 4. 직경 그룹 (6-8이 우선)
  if (diameterGroup === "6-8") {
    priority += 100;
  }

  return Math.round(priority);
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
