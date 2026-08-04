// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
import {
  getTodayYmdInKst,
  addKoreanBusinessDays,
  getDeliveryEtaLeadDays,
  toKstYmd,
} from "./utils.js";
import { normalizeRequestStage } from "./utils.js";
import { isKoreanBusinessDay } from "../../utils/krBusinessDays.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import {
  MACHINING_ASSIGN_STAGE_SET,
  MACHINING_QUEUE_STAGE_SET,
  EXCLUDE_UNMACHINABLE_FILTER,
  buildMachineQueueLoadMap,
  getMachiningLoadWeight,
  normalizeDiameterGroupValue,
  isMachiningQueueStageValue,
  isMachiningInProgress,
} from "../cnc/distribution.utils.js";
import { resolveEffectiveShippingMode } from "./shippingPriority.utils.js";

/**
 * 생산 스케줄 계산 유틸리티 (시각 단위 관리)
 *
 * 생산 프로세스:
 * 1. 의뢰 → (대기) → CAM 시작
 * 2. CAM 시작 → CAM 완료 (5분)
 * 3. CAM 완료 → 가공 시작 → 가공 완료 (15분)
 * 4. 가공 완료 → 세척/검사/포장 대기 (50~100개 모아서 처리, 1일 소요)
 * 5. 배치 처리 완료 → 택배 수거 신청 (15:00)
 * 6. 택배 수거 (16:00) → 도착 (1영업일)
 *
 * CNC 장비별 소재 세팅:
 * - M3: 6mm 전용
 * - M4: 8mm 전용
 * - 10mm, 12mm: 일주일에 1~2회 M3 또는 M4 소재 교체하여 생산
 *
 * 장비별 생산 큐:
 * - 각 장비마다 독립적인 큐 관리
 * - 우선순위: 가공중 → 아노다이징 ON → 신속배송 → queuePosition → 발송예정
 */

const CAM_DURATION_MINUTES = 5; // CAM 시작 → 완료
const MACHINING_DURATION_MINUTES = 15; // 가공 시작 → 완료
const BATCH_PROCESSING_DAYS = 1; // 세척/검사/포장 (50~100개 모아서)
const PACKING_CUTOFF_HOUR = 14; // 포장 마감 시각 (14:00)
const PICKUP_REQUEST_HOUR = 15; // 택배 수거 신청 시각 (15:00)
const DAILY_PICKUP_HOUR = 16; // 택배 수거 시각 (16:00)
const EXPRESS_CUTOFF_HOUR_KST = 12; // 신속: 낮 12시 이전 당일 발송 목표

function getKstHour(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hour12: false,
    }).format(date instanceof Date ? date : new Date(date)),
  );
  return Number.isFinite(hour) ? hour : 0;
}

/**
 * KST 시각 생성
 * new Date() 생성자는 로컬 시간대를 사용하므로 ISO 8601 형식으로 +09:00 명시
 */
function createKstDateTime(ymd, hour = 0, minute = 0) {
  let ymdString = ymd;
  if (ymd instanceof Date) {
    ymdString = toKstYmd(ymd);
  }
  ymdString =
    typeof ymdString === "string" ? ymdString : String(ymdString || "");

  const parts = ymdString.split("-").map((n) => Number(n));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [year, month, day] = parts;
    const y = String(year);
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const h = String(hour).padStart(2, "0");
    const min = String(minute).padStart(2, "0");
    // KST 시간대 명시 (+09:00)
    return new Date(`${y}-${m}-${d}T${h}:${min}:00+09:00`);
  }

  // fallback: Date 파싱 후 KST 기준으로 재생성
  const parsed = new Date(ymdString);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = String(toKstYmd(parsed) || "")
      .slice(0, 10)
      .split("-")
      .map(Number);
    const [year, month, day] = iso;
    const y = String(year);
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const h = String(hour).padStart(2, "0");
    const min = String(minute).padStart(2, "0");
    return new Date(`${y}-${m}-${d}T${h}:${min}:00+09:00`);
  }

  throw new Error(`Invalid ymd for createKstDateTime: ${ymdString}`);
}

export function resolveLeadDaysWithSameDayCutoff({ leadDays, requestedAt }) {
  const rawDays = Number.isFinite(leadDays) ? Number(leadDays) : 1;
  const baseDays = Math.max(1, Math.floor(rawDays));

  // ETA 리드타임은 "오늘 자정 전 접수 = 최소 1일" 정책을 따른다.
  // 생성 시각 cutoff로 (N-1) 보정하지 않고, 설정값(N일)을 그대로 사용하되
  // 잘못된 설정값(0 이하)이 들어와도 최소 1일을 강제한다.
  void requestedAt;
  return baseDays;
}

export function addKstCalendarDays({ startYmd, days }) {
  const base = new Date(`${startYmd}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid startYmd: ${startYmd}`);
  }

  const targetDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  base.setDate(base.getDate() + targetDays);
  return toKstYmd(base);
}

/**
 * 다음 택배 수거 시각 계산 (매일 16:00 KST)
 */
function getNextPickupTime(fromDateTime, hour) {
  // KST 기준 날짜 추출
  const fromYmd = toKstYmd(fromDateTime);
  const h = String(hour).padStart(2, "0");

  // 해당 날짜의 지정 시각 (KST)
  let pickupTime = new Date(`${fromYmd}T${h}:00:00+09:00`);

  // 이미 해당 시각이 지났으면 다음날 같은 시각
  if (fromDateTime >= pickupTime) {
    const nextDay = new Date(pickupTime);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextYmd = toKstYmd(nextDay);
    pickupTime = new Date(`${nextYmd}T${h}:00:00+09:00`);
  }

  return pickupTime;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const getWeekdayKey = (ymd) => {
  const date = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return WEEKDAY_KEYS[date.getDay()] || null;
};

export const resolveNextWeeklyBatchYmd = async ({
  baseYmd,
  weeklyBatchDays,
}) => {
  if (!baseYmd) return baseYmd;
  if (!Array.isArray(weeklyBatchDays) || weeklyBatchDays.length === 0)
    return baseYmd;

  // 규칙: 여러 요일을 선택한 경우에도 baseYmd(생산/포장 완료 기준일) 이후
  // 가장 먼저 도래하는 선택 요일 하루만 실제 발송일로 사용한다.
  // 그 전까지 먼저 완성된 제품도 조기 발송하지 않고 같은 박스에 계속 누적한다.
  const allowed = new Set(
    weeklyBatchDays
      .map((day) => String(day).trim())
      .filter((day) => ["mon", "tue", "wed", "thu", "fri"].includes(day)),
  );
  if (allowed.size === 0) return baseYmd;

  let cursor = new Date(`${baseYmd}T00:00:00+09:00`);
  if (Number.isNaN(cursor.getTime())) return baseYmd;

  for (let i = 0; i < 20; i += 1) {
    const candidateYmd = toKstYmd(cursor);
    const weekdayKey = candidateYmd ? getWeekdayKey(candidateYmd) : null;
    if (candidateYmd && weekdayKey && allowed.has(weekdayKey)) {
      const ok = await isKoreanBusinessDay(candidateYmd);
      if (ok) return candidateYmd;
    }
    // KST 기준 다음날
    const nextYmd = toKstYmd(cursor);
    const nextKst = new Date(`${nextYmd}T00:00:00+09:00`);
    nextKst.setDate(nextKst.getDate() + 1);
    cursor = nextKst;
  }

  return baseYmd;
};

/**
 * 직경 그룹 분류
 * 실제 장비 배정은 가공 진입 시 chooseMachineForCamMachining이 담당한다.
 * (과거 M3/M4 하드코딩은 존재하지 않는 장비에 배정해 가공 큐에서 누락시키는 원인이었다.)
 */
function getDiameterGroupAndMachine(maxDiameter) {
  const d =
    typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;

  if (d <= 6) {
    return { diameter: 6, diameterGroup: "6", preferredMachine: null };
  } else if (d <= 8) {
    return { diameter: 8, diameterGroup: "8", preferredMachine: null };
  } else if (d <= 10) {
    return { diameter: 10, diameterGroup: "10", preferredMachine: null };
  } else {
    return { diameter: d, diameterGroup: "12", preferredMachine: null };
  }
}

/**
 * 묶음배송 대기 시간 계산 (직경별)
 */
function getBulkWaitHours(diameterGroup) {
  // 6mm, 8mm: 즉시 생산 가능 (전용 장비 있음)
  if (diameterGroup === "6" || diameterGroup === "8") return 0;

  // 10mm, 12mm: 일주일에 1~2회 소재 교체 (평균 3일 대기)
  return 72; // 3일(72시간) 대기
}

/**
 * 신규 의뢰의 생산 스케줄 계산 (시각 단위)
 * @param {Object} params
 * @param {number} params.maxDiameter - 최대 직경 (mm)
 * @param {Date} params.requestedAt - 의뢰 생성 시각
 * @param {Array} params.weeklyBatchDays - 주간 배치일 (e.g. ["mon", "wed"])
 * @param {"normal"|"express"} [params.shippingMode="normal"]
 * @returns {Object} productionSchedule
 */
export async function calculateInitialProductionSchedule({
  maxDiameter,
  requestedAt,
  weeklyBatchDays,
  shippingMode = "normal",
}) {
  const mode = shippingMode === "express" ? "express" : "normal";
  const now = requestedAt || new Date();
  const { diameter, diameterGroup, preferredMachine } =
    getDiameterGroupAndMachine(maxDiameter);

  // Fetch manufacturer settings for lead times
  let manufacturerLeadTimes = null;

  try {
    const { getManufacturerLeadTimesUtil } =
      await import("../businesses/leadTime.controller.js");
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    manufacturerLeadTimes = manufacturerSettings?.leadTimes || null;
  } catch (error) {
    console.error(
      "[calculateInitialProductionSchedule] failed to fetch manufacturer settings:",
      error,
    );
  }

  // 신속: 소재 대기/주간 배치 없이 당일(12시 전) 또는 다음 영업일 발송
  if (mode === "express") {
    const MIN_LEAD_MINUTES = 30;
    const scheduledCamStart = new Date(
      now.getTime() + MIN_LEAD_MINUTES * 60 * 1000,
    );
    const scheduledCamComplete = new Date(
      scheduledCamStart.getTime() + CAM_DURATION_MINUTES * 60 * 1000,
    );
    const scheduledMachiningStart = new Date(scheduledCamComplete);
    const scheduledMachiningComplete = new Date(
      scheduledMachiningStart.getTime() + MACHINING_DURATION_MINUTES * 60 * 1000,
    );

    const todayYmd = toKstYmd(now) || getTodayYmdInKst();
    let shipYmd = todayYmd;
    const hour = getKstHour(now);
    const todayIsBiz =
      todayYmd && (await isKoreanBusinessDay(todayYmd));

    if (hour < EXPRESS_CUTOFF_HOUR_KST && todayIsBiz) {
      shipYmd = todayYmd;
    } else {
      shipYmd = await addKoreanBusinessDays({
        startYmd: todayYmd,
        days: 1,
      });
    }

    const scheduledBatchProcessing = createKstDateTime(
      shipYmd,
      PACKING_CUTOFF_HOUR,
      0,
    );
    const scheduledPickupBase = createKstDateTime(
      shipYmd,
      PACKING_CUTOFF_HOUR,
      0,
    );
    const scheduledPickupRequest = getNextPickupTime(
      scheduledPickupBase,
      PICKUP_REQUEST_HOUR,
    );
    const scheduledShipPickup = getNextPickupTime(
      scheduledPickupBase,
      DAILY_PICKUP_HOUR,
    );

    void weeklyBatchDays;
    void manufacturerLeadTimes;

    return {
      scheduledCamStart,
      scheduledCamComplete,
      scheduledMachiningStart,
      scheduledMachiningComplete,
      scheduledBatchProcessing,
      scheduledPickupRequest,
      scheduledShipPickup,
      assignedMachine: preferredMachine,
      diameter,
      diameterGroup,
      shippingMode: "express",
    };
  }

  const waitHours = getBulkWaitHours(diameterGroup);
  let scheduledCamStart = new Date(now.getTime() + waitHours * 60 * 60 * 1000);

  // 최소 리드타임 보정: 방금 생성된 의뢰가 즉시 '지연'으로 잡히는 것을 방지
  const MIN_LEAD_MINUTES = 30;
  const minStart = new Date(now.getTime() + MIN_LEAD_MINUTES * 60 * 1000);
  if (scheduledCamStart < minStart) {
    scheduledCamStart = minStart;
  }

  // CAM 시작 → CAM 완료 (5분)
  const scheduledCamComplete = new Date(
    scheduledCamStart.getTime() + CAM_DURATION_MINUTES * 60 * 1000,
  );

  // CAM 완료 → 가공 시작 (즉시)
  const scheduledMachiningStart = new Date(scheduledCamComplete);

  // 가공 시작 → 가공 완료 (15분)
  const scheduledMachiningComplete = new Date(
    scheduledMachiningStart.getTime() + MACHINING_DURATION_MINUTES * 60 * 1000,
  );

  // 가공 완료 → 배치 처리 (세척/검사/포장)
  // Use manufacturer lead times based on diameter
  const d =
    typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;
  let diameterKey = "d8";
  if (d <= 6) diameterKey = "d6";
  else if (d <= 8) diameterKey = "d8";
  else if (d <= 10) diameterKey = "d10";
  else diameterKey = "d12";

  const leadDays = manufacturerLeadTimes?.[diameterKey]?.minBusinessDays ?? 1;
  const resolvedLeadDays = resolveLeadDaysWithSameDayCutoff({
    leadDays,
    requestedAt: now,
  });

  const machiningCompleteYmd = toKstYmd(scheduledMachiningComplete);
  const baseBatchStartYmd = getTodayYmdInKst(now) || machiningCompleteYmd;
  const batchProcessingYmd = await addKoreanBusinessDays({
    startYmd: baseBatchStartYmd,
    days: resolvedLeadDays,
  });
  const scheduledBatchProcessing = createKstDateTime(
    batchProcessingYmd,
    PACKING_CUTOFF_HOUR,
    0,
  );

  // 묶음 배송: 리드타임(생산 가능일) 이후, requestor 주간 발송 요일에 맞춰 발송일을 정렬한다.
  // 프론트 신규의뢰 ETA(useLeadTimeForecast)와 동일하게, 가장 가까운 선택 요일로 맞춘다.
  const resolvedShipPickupYmd = await resolveNextWeeklyBatchYmd({
    baseYmd: batchProcessingYmd,
    weeklyBatchDays,
  });
  const scheduledPickupBase = createKstDateTime(
    resolvedShipPickupYmd,
    PACKING_CUTOFF_HOUR,
    0,
  );

  // 배치 처리 완료 → 택배 수거 신청 (15:00)
  const scheduledPickupRequest = getNextPickupTime(
    scheduledPickupBase,
    PICKUP_REQUEST_HOUR,
  );

  // 택배 수거 시각 (16:00)
  const scheduledShipPickup = getNextPickupTime(
    scheduledPickupBase,
    DAILY_PICKUP_HOUR,
  );

  return {
    scheduledCamStart,
    scheduledCamComplete,
    scheduledMachiningStart,
    scheduledMachiningComplete,
    scheduledBatchProcessing,
    scheduledPickupRequest,
    scheduledShipPickup,
    // 초기 스케줄에서는 장비를 미리 고정하지 않는다. 가공 진입 시 실장비로 배정한다.
    assignedMachine: preferredMachine,
    diameter,
    diameterGroup,
    shippingMode: "normal",
  };
}

/**
 * 가공 큐 정책 순위 (낮을수록 앞).
 * 1) 아노다이징 ON + 신속
 * 2) 아노다이징 ON + 묶음
 * 3) 아노다이징 OFF + 신속
 * 4) 아노다이징 OFF + 묶음
 */
export function getMachiningQueuePolicyRank(requestLike) {
  const isOff = requestLike?.caseInfos?.anodizingEnabled === false;
  const isExpress = resolveEffectiveShippingMode(requestLike) === "express";
  if (!isOff && isExpress) return 0;
  if (!isOff && !isExpress) return 1;
  if (isOff && isExpress) return 2;
  return 3;
}

/**
 * 가공 큐 정렬 SSOT.
 * 가공중 → 정책 순위(아노/신속) → queuePosition → 발송예정 → requestId
 */
export function compareMachiningQueueOrder(a, b) {
  const aRunning = isMachiningInProgress(a);
  const bRunning = isMachiningInProgress(b);
  if (aRunning !== bRunning) return aRunning ? -1 : 1;

  const aRank = getMachiningQueuePolicyRank(a);
  const bRank = getMachiningQueuePolicyRank(b);
  if (aRank !== bRank) return aRank - bRank;

  const ap = Number(a?.productionSchedule?.queuePosition ?? 0);
  const bp = Number(b?.productionSchedule?.queuePosition ?? 0);
  const apOk = Number.isFinite(ap) && ap > 0;
  const bpOk = Number.isFinite(bp) && bp > 0;
  if (apOk && bpOk && ap !== bp) return ap - bp;
  if (apOk !== bpOk) return apOk ? -1 : 1;

  const aTime = a?.productionSchedule?.scheduledShipPickup
    ? new Date(a.productionSchedule.scheduledShipPickup).getTime()
    : 0;
  const bTime = b?.productionSchedule?.scheduledShipPickup
    ? new Date(b.productionSchedule.scheduledShipPickup).getTime()
    : 0;
  const aTimeOk = Number.isFinite(aTime) ? aTime : 0;
  const bTimeOk = Number.isFinite(bTime) ? bTime : 0;
  if (aTimeOk !== bTimeOk) return aTimeOk - bTimeOk;

  return String(a?.requestId || "").localeCompare(String(b?.requestId || ""));
}

/**
 * 장비 큐에 정책 순위로 배치할 queuePosition을 계산하고, 해당 장비 대기열을 1..n으로 재번호 매긴다.
 */
export async function placeRequestAtPolicyQueuePosition({
  machineId,
  requestMongoId,
  anodizingEnabled,
  shippingMode,
  RequestModel,
  session = null,
}) {
  const mid = String(machineId || "").trim();
  if (!mid || !requestMongoId || !RequestModel) return null;

  let findQuery = RequestModel.find({
    manufacturerStage: "가공",
    "productionSchedule.assignedMachine": mid,
  }).select(
    "_id requestId productionSchedule.queuePosition productionSchedule.machiningRecord caseInfos.anodizingEnabled shippingMode finalShipping.mode originalShipping.mode",
  );
  if (session) findQuery = findQuery.session(session);
  const queueRows = await findQuery.lean();

  const selfId = String(requestMongoId);
  const others = (Array.isArray(queueRows) ? queueRows : []).filter(
    (row) => String(row?._id || "") !== selfId,
  );
  const existingSelf = (Array.isArray(queueRows) ? queueRows : []).find(
    (row) => String(row?._id || "") === selfId,
  );

  const selfRow = {
    ...(existingSelf || {}),
    _id: requestMongoId,
    caseInfos: {
      ...(existingSelf?.caseInfos || {}),
      anodizingEnabled,
    },
    shippingMode,
    finalShipping: {
      ...(existingSelf?.finalShipping || {}),
      mode: shippingMode,
    },
    originalShipping: {
      ...(existingSelf?.originalShipping || {}),
      mode: shippingMode,
    },
    productionSchedule: {
      ...(existingSelf?.productionSchedule || {}),
      // 재번호 전 임시: 같은 정책 그룹 끝에 붙이도록 큰 값
      queuePosition: Number.MAX_SAFE_INTEGER,
    },
  };

  const ordered = [...others, selfRow].sort(compareMachiningQueueOrder);

  await Promise.all(
    ordered.map((item, idx) => {
      let updateQuery = RequestModel.updateOne(
        { _id: item._id },
        { $set: { "productionSchedule.queuePosition": idx + 1 } },
      );
      if (session) updateQuery = updateQuery.session(session);
      return updateQuery;
    }),
  );

  const selfIndex = ordered.findIndex(
    (item) => String(item?._id || "") === selfId,
  );
  return selfIndex >= 0 ? selfIndex + 1 : Math.max(1, ordered.length);
}

/**
 * 장비별 생산 큐 조회 및 정렬
 * @param {string} machineId - M3, M4 등
 * @param {Array} requests - Request 문서 배열
 * @returns {Array} 정책 순위 순으로 정렬된 배열
 */
export function getProductionQueueForMachine(machineId, requests) {
  return requests
    .filter((req) => {
      const schedule = req.productionSchedule;
      if (!schedule) return false;

      // 해당 장비에 할당된 의뢰만
      if (schedule.assignedMachine !== machineId) return false;

      // 가공 단계만
      if (!isMachiningQueueStageValue(req.manufacturerStage)) return false;

      // 불완전가공(R&D unmachinable) 판정 건은 작업 큐에 노출되면 안 된다.
      if (req?.rnd?.unmachinableAt) return false;

      return true;
    })
    .sort(compareMachiningQueueOrder);
}

/**
 * 모든 장비별 생산 큐 조회
 * @param {Array} requests - Request 문서 배열
 * @returns {Object} { M3: [...], M4: [...], unassigned: [...] }
 */
export function getAllProductionQueues(requests) {
  const queues = { unassigned: [] };

  for (const req of requests) {
    const schedule = req.productionSchedule;
    if (!schedule) continue;

    // 가공 단계만
    if (!isMachiningQueueStageValue(req.manufacturerStage)) continue;

    // 불완전가공(R&D unmachinable) 판정 건은 작업 큐에 노출되면 안 된다.
    if (req?.rnd?.unmachinableAt) continue;

    const machine = schedule.assignedMachine;
    if (machine && typeof machine === "string") {
      if (!queues[machine]) queues[machine] = [];
      queues[machine].push(req);
    } else {
      queues.unassigned.push(req);
    }
  }

  // 각 큐: 가공중 → 아노/신속 정책 → queuePosition → 발송예정
  for (const key in queues) {
    queues[key].sort(compareMachiningQueueOrder);
  }

  return queues;
}

/**
 * 생산 스케줄 재계산
 * 의뢰 단계에서만 변경 가능
 */
export async function recalculateProductionSchedule({
  currentStage,
  maxDiameter,
  requestedAt,
  weeklyBatchDays,
  shippingMode = "normal",
}) {
  // 준비 단계가 아니면 스케줄 변경 불가
  if (currentStage !== "준비") {
    return null;
  }

  // 새로운 스케줄 계산
  return calculateInitialProductionSchedule({
    maxDiameter,
    requestedAt,
    weeklyBatchDays,
    shippingMode,
  });
}

/**
 * 장비 소재 세팅 변경 시 해당 장비의 큐 재계산
 * @param {string} machineId - M3, M4 등
 * @param {string} newDiameterGroup - "6" | "8" | "10" | "12"
 */
export async function recalculateQueueOnMaterialChange(
  machineId,
  newDiameterGroup,
) {
  const normalizedGroup = normalizeDiameterGroupValue(newDiameterGroup);
  if (!normalizedGroup) return 0;

  const Request = (await import("../../models/request.model.js")).default;

  const activeMachines = await CncMachine.find({ status: "active" })
    .select({ machineId: 1, currentMaterial: 1 })
    .lean();
  const machineIds = activeMachines
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);

  if (!machineIds.length) return 0;

  const machineFlags = await Machine.find({ uid: { $in: machineIds } })
    .select({ uid: 1, allowRequestAssign: 1 })
    .lean();
  const allowAssignSet = new Set(
    machineFlags
      .filter((m) => m?.allowRequestAssign !== false)
      .map((m) => String(m?.uid || "").trim())
      .filter(Boolean),
  );

  const candidateMachineIds = activeMachines
    .map((m) => {
      const uid = String(m?.machineId || "").trim();
      if (!uid || !allowAssignSet.has(uid)) return null;
      const group = normalizeDiameterGroupValue(
        m?.currentMaterial?.diameterGroup || m?.currentMaterial?.diameter,
      );
      return group === normalizedGroup ? uid : null;
    })
    .filter((uid) => Boolean(uid));

  if (!candidateMachineIds.length) return 0;

  const queueLoadMap = await buildMachineQueueLoadMap(candidateMachineIds);

  const assignedCounts = await Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    "productionSchedule.assignedMachine": { $in: candidateMachineIds },
  })
    .select("productionSchedule.assignedMachine")
    .lean();

  const queueLengthMap = new Map(candidateMachineIds.map((id) => [id, 0]));
  for (const doc of assignedCounts) {
    const uid = String(doc?.productionSchedule?.assignedMachine || "").trim();
    if (!uid || !queueLengthMap.has(uid)) continue;
    queueLengthMap.set(uid, (queueLengthMap.get(uid) || 0) + 1);
  }

  const unassignedRequests = await Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    $or: [
      { "productionSchedule.assignedMachine": { $exists: false } },
      { "productionSchedule.assignedMachine": null },
      { "productionSchedule.assignedMachine": "" },
    ],
    "productionSchedule.diameterGroup": normalizedGroup,
  })
    .sort({
      "productionSchedule.scheduledShipPickup": 1,
      requestId: 1,
    })
    .lean();

  if (!unassignedRequests.length) return 0;

  const roundRobinIndexByKey = new Map();
  const ops = [];

  for (const req of unassignedRequests) {
    let selected = null;
    let minLoad = Infinity;
    const tied = [];

    for (const uid of candidateMachineIds) {
      const load = queueLoadMap.get(uid) || 0;
      if (load < minLoad) {
        minLoad = load;
        tied.length = 0;
        tied.push(uid);
      } else if (load === minLoad) {
        tied.push(uid);
      }
    }

    if (!tied.length) break;

    if (tied.length === 1) {
      selected = tied[0];
    } else {
      const key = tied.slice().sort().join("|");
      const idx = roundRobinIndexByKey.get(key) || 0;
      selected = tied[idx % tied.length];
      roundRobinIndexByKey.set(key, (idx + 1) % tied.length);
    }

    if (!selected) break;

    const loadWeight = getMachiningLoadWeight(req);
    queueLoadMap.set(selected, (queueLoadMap.get(selected) || 0) + loadWeight);
    const nextQueuePos = (queueLengthMap.get(selected) || 0) + 1;
    queueLengthMap.set(selected, nextQueuePos);

    ops.push({
      updateOne: {
        filter: { _id: req._id },
        update: {
          $set: {
            "productionSchedule.assignedMachine": selected,
            "productionSchedule.queuePosition": nextQueuePos,
            assignedMachine: selected,
          },
        },
      },
    });
  }

  if (ops.length) {
    await Request.bulkWrite(ops);
  }

  return ops.length;
}

/**
 * 생산 큐에서 다음 작업 선택 우선순위 계산 (시각 기반)
 * @param {Array} requests - Request 문서 배열
 * @returns {Array} 우선순위 정렬된 배열
 */
export function sortByProductionPriority(requests) {
  const now = Date.now();

  return requests
    .map((req) => {
      const obj =
        typeof req?.toObject === "function" ? req.toObject() : { ...req };
      const schedule = req.productionSchedule || {};

      if (typeof schedule.priority === "number") {
        return { ...obj, _priority: schedule.priority };
      }

      const mode =
        req?.finalShipping?.mode === "express" ||
        req?.originalShipping?.mode === "express" ||
        req?.shippingMode === "express"
          ? "express"
          : "normal";

      const camStartRaw = schedule.scheduledCamStart
        ? new Date(schedule.scheduledCamStart).getTime()
        : now;
      const camStart = Number.isFinite(camStartRaw) ? camStartRaw : now;
      // 신속 건을 앞에 두고, 같은 모드에서는 CAM 시작이 빠를수록 우선
      const expressBoost = mode === "express" ? 1e15 : 0;
      const priority = expressBoost - camStart;

      return { ...obj, _priority: priority };
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
  const warningThresholdDays = 1; // 발송예정일 -1일부터 경고

  let delayedCount = 0;
  let warningCount = 0;
  const riskItems = [];

  for (const req of requests) {
    const schedule = req.productionSchedule;
    const originalYmd =
      req?.timeline?.originalEstimatedShipYmd ||
      req?.timeline?.estimatedShipYmd;
    const nextYmd = req?.timeline?.nextEstimatedShipYmd || originalYmd;
    if (!schedule || typeof originalYmd !== "string" || !originalYmd.trim())
      continue;

    const status = String(req.manufacturerStage || "");
    const normalizedStage = normalizeRequestStage(req);
    const baseYmd = originalYmd.trim();
    const startOfDayShip = new Date(`${nextYmd}T00:00:00+09:00`);
    if (Number.isNaN(startOfDayShip.getTime())) continue;

    // KST 기준 경고 시작일
    const shipKst = new Date(`${nextYmd}T00:00:00+09:00`);
    shipKst.setDate(shipKst.getDate() - warningThresholdDays);
    const warningStart = shipKst;

    const isShippedOrLater = ["shipping", "tracking", "cancel"].includes(
      normalizedStage,
    );

    // 지연 확정: 발송예정일 당일까지 발송되지 않음
    if (!isShippedOrLater && now >= startOfDayShip) {
      delayedCount++;
      riskItems.push({
        id: req._id,
        requestId: req.requestId,
        title: req.title || req.requestId,
        type: "delayed",
        riskLevel: "danger",
        status: status,
        manufacturerStage: req.manufacturerStage,
        dueDate: baseYmd,
        nextEstimatedShipYmd: nextYmd || null,
        originalEstimatedShipYmd: baseYmd,
        caseInfos: req.caseInfos || null,
        scheduledCamStart: schedule.scheduledCamStart,
        estimatedShipYmd: baseYmd,
        shippingMode: req.shippingMode || null,
        finalShipping: req.finalShipping || null,
        originalShipping: req.originalShipping || null,
      });
      continue;
    }

    // 지연 위험: 발송예정일 - 1일까지 CAM 완료가 안 된 경우 (status가 의뢰/CAM)
    // 생산(Machining) 단계로 들어갔다면 지연 가능 목록에서 제외
    const isPreProduction = ["request", "cam"].includes(normalizedStage);
    if (isPreProduction && now >= warningStart && now < startOfDayShip) {
      warningCount++;
      riskItems.push({
        id: req._id,
        requestId: req.requestId,
        title: req.title || req.requestId,
        type: "warning",
        riskLevel: "warning",
        status: status,
        manufacturerStage: req.manufacturerStage,
        dueDate: baseYmd,
        nextEstimatedShipYmd: nextYmd || null,
        originalEstimatedShipYmd: baseYmd,
        caseInfos: req.caseInfos || null,
        scheduledCamStart: schedule.scheduledCamStart,
        estimatedShipYmd: baseYmd,
        shippingMode: req.shippingMode || null,
        finalShipping: req.finalShipping || null,
        originalShipping: req.originalShipping || null,
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
