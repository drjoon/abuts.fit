// related files:
// - web/backend/controllers/requests/machiningDurationEstimate.utils.js
// - web/backend/controllers/requests/production.utils.js
// - web/backend/controllers/requests/common.review.machine.js
// - web/backend/controllers/requests/common.review.esprit.js
// - web/backend/controllers/requests/machiningPriorityRules.js
// - web/backend/services/reviewApprovalQueue.service.js
// - web/backend/controllers/cnc/production.js
// - web/backend/rules.md
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import Request from "../../models/request.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  EXCLUDE_UNMACHINABLE_FILTER,
  MACHINING_QUEUE_STAGE_SET,
  inferCurrentMaterialDiameter,
  inferDiameterGroupFromValue,
  isMachiningCompleted,
  isMachiningInProgress,
  machineMaterialCoversMaxDiameter,
} from "../cnc/distribution.utils.js";
import {
  compareMachiningQueueOrder,
  placeRequestAtPolicyQueuePosition,
} from "./production.utils.js";
import { resolveEffectiveShippingMode } from "./shippingPriority.utils.js";
import { getTodayYmdInKst, toKstYmd } from "./utils.js";
import {
  estimateMachiningSecondsForLength,
  estimateRemainingSecondsForRunningJob,
  resolveConservativeMachiningSecondsPerMm,
} from "./machiningDurationEstimate.utils.js";
import { enqueueApproval } from "../../services/reviewApprovalQueue.service.js";

/** 당일 신속 가공 완료 목표 (패킹 컷오프와 동일) */
export const EXPRESS_MACHINING_DEADLINE_HOUR_KST = 14;

const ALERT_SETTINGS_KEY = "global";

function createKstDateTime(ymd, hour = 0, minute = 0) {
  const ymdString = String(ymd || "").slice(0, 10);
  const parts = ymdString.split("-").map((n) => Number(n));
  if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) {
    throw new Error(`Invalid ymd: ${ymdString}`);
  }
  const [year, month, day] = parts;
  const y = String(year);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T${h}:${min}:00+09:00`);
}

function resolveShipYmd(reqItem) {
  const fromSchedule = toKstYmd(reqItem?.productionSchedule?.scheduledShipPickup);
  if (fromSchedule) return String(fromSchedule).slice(0, 10);
  const fromTimeline = String(reqItem?.timeline?.estimatedShipYmd || "").trim();
  if (fromTimeline) return fromTimeline.slice(0, 10);
  return "";
}

export function isTodayExpressShipRequest(reqItem, todayYmd = getTodayYmdInKst()) {
  if (resolveEffectiveShippingMode(reqItem) !== "express") return false;
  const shipYmd = resolveShipYmd(reqItem);
  return Boolean(shipYmd) && shipYmd === todayYmd;
}

/** 신속배송 + 출고일이 지정된 건 (14:00 마감 계산 대상) */
export function isExpressShipRequestWithYmd(reqItem) {
  if (resolveEffectiveShippingMode(reqItem) !== "express") return false;
  return Boolean(resolveShipYmd(reqItem));
}

export function resolveExpressMachiningDeadlineForRequest(reqItem) {
  const shipYmd = resolveShipYmd(reqItem);
  if (!shipYmd) return null;
  return createKstDateTime(shipYmd, EXPRESS_MACHINING_DEADLINE_HOUR_KST, 0);
}

function resolveMaxDiameter(reqItem) {
  const maxD = Number(reqItem?.caseInfos?.maxDiameter);
  if (Number.isFinite(maxD) && maxD > 0) return maxD;
  const scheduled = Number(reqItem?.productionSchedule?.diameter);
  if (Number.isFinite(scheduled) && scheduled > 0) return scheduled;
  return 8;
}

function resolveTotalLength(reqItem) {
  const len = Number(reqItem?.caseInfos?.totalLength);
  return Number.isFinite(len) && len > 0 ? len : 10;
}

function formatDurationLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}초`;
  if (r === 0) return `${m}분`;
  return `${m}분 ${r}초`;
}

function formatKstDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * 장비 큐를 시뮬레이션해 건별 예상 시작/완료 시각을 붙인다.
 */
export function simulateMachineQueueEtas({
  queueRows,
  secondsPerMm,
  nowMs,
}) {
  let cursor = Number(nowMs) || Date.now();
  const items = [];

  for (const reqItem of Array.isArray(queueRows) ? queueRows : []) {
    if (isMachiningCompleted(reqItem)) continue;

    const totalLength = resolveTotalLength(reqItem);
    const running = isMachiningInProgress(reqItem);
    let estimateSeconds;
    if (running) {
      const elapsed = Number(
        reqItem?.productionSchedule?.machiningRecord?.elapsedSeconds ??
          reqItem?.productionSchedule?.machiningProgress?.elapsedSeconds ??
          0,
      );
      const startedAt = reqItem?.productionSchedule?.machiningRecord?.startedAt
        ? new Date(reqItem.productionSchedule.machiningRecord.startedAt).getTime()
        : 0;
      const liveElapsed =
        Number.isFinite(elapsed) && elapsed > 0
          ? elapsed
          : startedAt > 0
            ? Math.max(0, Math.floor((nowMs - startedAt) / 1000))
            : 0;
      estimateSeconds = estimateRemainingSecondsForRunningJob({
        totalLength,
        secondsPerMm,
        elapsedSeconds: liveElapsed,
      });
    } else {
      estimateSeconds = estimateMachiningSecondsForLength(
        totalLength,
        secondsPerMm,
      );
    }

    const qty = Number(reqItem?.productionSchedule?.machiningQty ?? 1);
    const weight = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const totalSeconds = Math.ceil(estimateSeconds * weight);
    const startMs = cursor;
    const endMs = cursor + totalSeconds * 1000;
    cursor = endMs;

    items.push({
      requestMongoId: String(reqItem?._id || ""),
      requestId: String(reqItem?.requestId || ""),
      machineId: String(reqItem?.productionSchedule?.assignedMachine || ""),
      isExpress: resolveEffectiveShippingMode(reqItem) === "express",
      isTodayExpress: false, // filled by caller
      isRunning: running,
      maxDiameter: resolveMaxDiameter(reqItem),
      totalLength,
      estimateSeconds: totalSeconds,
      estimateLabel: formatDurationLabel(totalSeconds),
      estimatedStartAt: new Date(startMs).toISOString(),
      estimatedCompleteAt: new Date(endMs).toISOString(),
      estimatedCompleteAtLabel: formatKstDateTime(new Date(endMs)),
      queuePosition: Number(reqItem?.productionSchedule?.queuePosition) || null,
      shippingMode: resolveEffectiveShippingMode(reqItem),
      clinicName: reqItem?.caseInfos?.clinicName || null,
      patientName: reqItem?.caseInfos?.patientName || null,
      tooth: reqItem?.caseInfos?.tooth || null,
      fastMachiningRebalance: reqItem?.productionSchedule?.fastMachiningRebalance || null,
    });
  }

  return {
    items,
    estimatedQueueCompleteAt: items.length
      ? items[items.length - 1].estimatedCompleteAt
      : new Date(nowMs).toISOString(),
    estimatedQueueCompleteAtLabel: items.length
      ? items[items.length - 1].estimatedCompleteAtLabel
      : formatKstDateTime(new Date(nowMs)),
  };
}

function machineCanCoverRequest(materialDia, maxDiameter) {
  return machineMaterialCoversMaxDiameter(materialDia, maxDiameter);
}

function cloneQueueMaps(queuesByMachine) {
  const next = new Map();
  for (const [mid, list] of queuesByMachine.entries()) {
    next.set(mid, [...list]);
  }
  return next;
}

function buildEtaSnapshot({
  queuesByMachine,
  machineMetaMap,
  secondsPerMm,
  nowMs,
  todayYmd,
  deadlineMs: _deadlineMs,
}) {
  void _deadlineMs;
  const machines = [];
  for (const [machineId, rows] of queuesByMachine.entries()) {
    const ordered = [...rows].sort(compareMachiningQueueOrder);
    const sim = simulateMachineQueueEtas({
      queueRows: ordered,
      secondsPerMm,
      nowMs,
    });
    for (const item of sim.items) {
      const row = ordered.find(
        (r) => String(r?._id || "") === item.requestMongoId,
      );
      item.isTodayExpress = row
        ? isTodayExpressShipRequest(row, todayYmd)
        : false;
    }

    const expressItems = sim.items.filter((it) => {
      const row = ordered.find(
        (r) => String(r?._id || "") === it.requestMongoId,
      );
      return row ? isExpressShipRequestWithYmd(row) : false;
    });
    const lastExpressCompleteMs = expressItems.length
      ? Math.max(
          ...expressItems.map((it) => new Date(it.estimatedCompleteAt).getTime()),
        )
      : null;

    let missesDeadline = false;
    for (const item of expressItems) {
      const row = ordered.find(
        (r) => String(r?._id || "") === item.requestMongoId,
      );
      if (!row) continue;
      const dl = resolveExpressMachiningDeadlineForRequest(row);
      if (!dl) continue;
      const completeMs = new Date(item.estimatedCompleteAt).getTime();
      if (completeMs > dl.getTime()) {
        missesDeadline = true;
        break;
      }
    }

    const meta = machineMetaMap.get(machineId) || {};

    machines.push({
      machineId,
      materialDiameter: meta.materialDiameter ?? null,
      materialDiameterGroup: meta.materialDiameterGroup ?? null,
      items: sim.items,
      estimatedQueueCompleteAt: sim.estimatedQueueCompleteAt,
      estimatedQueueCompleteAtLabel: sim.estimatedQueueCompleteAtLabel,
      todayExpressCount: expressItems.length,
      todayExpressCompleteAt: lastExpressCompleteMs
        ? new Date(lastExpressCompleteMs).toISOString()
        : null,
      todayExpressCompleteAtLabel: lastExpressCompleteMs
        ? formatKstDateTime(new Date(lastExpressCompleteMs))
        : null,
      missesDeadline,
      hasSlack: !missesDeadline,
    });
  }

  machines.sort((a, b) => String(a.machineId).localeCompare(String(b.machineId)));
  return machines;
}

async function persistExpressRebalanceMove({
  candidate,
  fromMachineId,
  toMachineId,
  toDia,
  fromDia,
  nowMs,
  actorUserId,
  workingQueues,
  moved,
  secondsPerMm,
}) {
  const toGroup = inferDiameterGroupFromValue(toDia);
  const diameterChanged =
    Number.isFinite(fromDia) && Math.abs(fromDia - toDia) > 1e-6;

  workingQueues.set(
    fromMachineId,
    (workingQueues.get(fromMachineId) || []).filter(
      (r) => String(r?._id) !== String(candidate._id),
    ),
  );
  const updatedRow = {
    ...candidate,
    productionSchedule: {
      ...(candidate.productionSchedule || {}),
      assignedMachine: toMachineId,
      diameter: toDia,
      diameterGroup: toGroup,
      fastMachiningRebalance: {
        at: new Date(nowMs),
        fromMachineId,
        toMachineId,
        fromDiameter: Number.isFinite(fromDia) ? fromDia : null,
        toDiameter: toDia,
        reason: "express_deadline_14",
      },
    },
    assignedMachine: toMachineId,
  };
  workingQueues.set(toMachineId, [
    ...(workingQueues.get(toMachineId) || []),
    updatedRow,
  ]);

  const rebalanceMeta = {
    at: new Date(nowMs),
    fromMachineId,
    toMachineId,
    fromDiameter: Number.isFinite(fromDia) ? fromDia : null,
    toDiameter: toDia,
    reason: "express_deadline_14",
  };

  await Request.updateOne(
    { _id: candidate._id },
    {
      $set: {
        "productionSchedule.assignedMachine": toMachineId,
        "productionSchedule.diameter": toDia,
        "productionSchedule.diameterGroup": toGroup,
        "productionSchedule.fastMachiningRebalance": rebalanceMeta,
        "productionSchedule.ncPreload": { status: "NONE" },
        assignedMachine: toMachineId,
      },
    },
  );

  await placeRequestAtPolicyQueuePosition({
    machineId: toMachineId,
    requestMongoId: candidate._id,
    anodizingEnabled: candidate?.caseInfos?.anodizingEnabled,
    shippingMode: resolveEffectiveShippingMode(candidate),
    RequestModel: Request,
  });

  const remaining = workingQueues.get(fromMachineId) || [];
  const ordered = [...remaining].sort(compareMachiningQueueOrder);
  await Promise.all(
    ordered.map((item, idx) =>
      Request.updateOne(
        { _id: item._id },
        { $set: { "productionSchedule.queuePosition": idx + 1 } },
      ),
    ),
  );

  if (diameterChanged) {
    const fresh = await Request.findById(candidate._id).lean();
    if (fresh) {
      await enqueueApproval({
        taskType: "REQUEST_STAGE_APPROVED",
        request: fresh,
        actorUserId,
        forceReprocess: true,
      });
    }
  }

  moved.push({
    requestId: String(candidate.requestId || ""),
    requestMongoId: String(candidate._id || ""),
    fromMachineId,
    toMachineId,
    fromDiameter: Number.isFinite(fromDia) ? fromDia : null,
    toDiameter: toDia,
    diameterChanged,
    espritRetriggered: diameterChanged,
    estimateSeconds: estimateMachiningSecondsForLength(
      resolveTotalLength(candidate),
      secondsPerMm,
    ),
  });
}

/**
 * 대형 소재 장비(M5 등)에 놓인 신속건을, 출고일 14:00 내 완료 가능한 최소 소재 장비로 합친다.
 */
async function consolidateExpressJobsToSmallestCoveringMachine({
  workingQueues,
  machineMetaMap,
  secondsPerMm,
  nowMs,
  todayYmd,
  deadlineMs,
  actorUserId,
  moved,
}) {
  const machineIdsAsc = [...machineMetaMap.keys()].sort((a, b) => {
    const da = Number(machineMetaMap.get(a)?.materialDiameter) || 999;
    const db = Number(machineMetaMap.get(b)?.materialDiameter) || 999;
    if (da !== db) return da - db;
    return String(a).localeCompare(String(b));
  });

  for (const targetId of machineIdsAsc) {
    const targetMeta = machineMetaMap.get(targetId);
    const toDia = Number(targetMeta?.materialDiameter);
    if (!Number.isFinite(toDia) || toDia <= 0) continue;

    for (const sourceId of machineIdsAsc) {
      const fromDia = Number(machineMetaMap.get(sourceId)?.materialDiameter);
      if (sourceId === targetId || !Number.isFinite(fromDia) || fromDia <= toDia) {
        continue;
      }

      let safety = 0;
      while (safety++ < 20) {
        const sourceRows = workingQueues.get(sourceId) || [];
        const candidates = sourceRows
          .filter((row) => !isMachiningInProgress(row))
          .filter((row) => isExpressShipRequestWithYmd(row))
          .filter((row) => {
            const dl = resolveExpressMachiningDeadlineForRequest(row);
            return dl && nowMs < dl.getTime();
          })
          .filter((row) => {
            const maxD = resolveMaxDiameter(row);
            return machineCanCoverRequest(toDia, maxD);
          })
          .sort(compareMachiningQueueOrder);

        if (!candidates.length) break;

        const candidate = candidates[0];
        const maxDiameter = resolveMaxDiameter(candidate);

        const simQueues = cloneQueueMaps(workingQueues);
        simQueues.set(
          sourceId,
          (simQueues.get(sourceId) || []).filter(
            (r) => String(r?._id) !== String(candidate._id),
          ),
        );
        const movedRow = {
          ...candidate,
          productionSchedule: {
            ...(candidate.productionSchedule || {}),
            assignedMachine: targetId,
            diameter: toDia,
            diameterGroup: inferDiameterGroupFromValue(toDia),
          },
          assignedMachine: targetId,
        };
        simQueues.set(targetId, [...(simQueues.get(targetId) || []), movedRow]);

        const afterSnap = buildEtaSnapshot({
          queuesByMachine: simQueues,
          machineMetaMap,
          secondsPerMm,
          nowMs,
          todayYmd,
          deadlineMs,
        });
        const afterSource = afterSnap.find((m) => m.machineId === sourceId);
        const afterTarget = afterSnap.find((m) => m.machineId === targetId);
        if (afterTarget?.missesDeadline || afterSource?.missesDeadline) break;

        await persistExpressRebalanceMove({
          candidate,
          fromMachineId: sourceId,
          toMachineId: targetId,
          toDia,
          fromDia,
          nowMs,
          actorUserId,
          workingQueues,
          moved,
          secondsPerMm,
        });
      }
    }
  }
}

async function persistAndEmitAlert(alert) {
  try {
    await SystemSettings.findOneAndUpdate(
      { key: ALERT_SETTINGS_KEY },
      { $set: { lastExpressDeadlineRebalance: alert } },
      { upsert: true },
    );
  } catch (err) {
    console.warn("[EXPRESS-REBALANCE] persist alert failed", {
      message: err?.message || String(err || ""),
    });
  }

  try {
    emitAppEventToRoles(["manufacturer", "admin"], "machining:express-rebalance", alert);
  } catch (err) {
    console.warn("[EXPRESS-REBALANCE] emit alert failed", {
      message: err?.message || String(err || ""),
    });
  }
}

export async function getLastExpressDeadlineRebalanceAlert() {
  try {
    const doc = await SystemSettings.findOne({ key: ALERT_SETTINGS_KEY })
      .select({ lastExpressDeadlineRebalance: 1 })
      .lean();
    return doc?.lastExpressDeadlineRebalance || null;
  } catch {
    return null;
  }
}

/**
 * 당일 신속배송 14:00 가공 완료를 위해 여유 장비로 재배치한다.
 * 소재 직경이 바뀌면 Esprit force 재생성 큐를 등록한다.
 */
export async function rebalanceExpressJobsForFourteenOClockDeadline({
  machineIds = null,
  now = new Date(),
  actorUserId = null,
} = {}) {
  const todayYmd = toKstYmd(now) || getTodayYmdInKst();
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const deadline = createKstDateTime(
    todayYmd,
    EXPRESS_MACHINING_DEADLINE_HOUR_KST,
    0,
  );
  const deadlineMs = deadline.getTime();

  const estimateMeta = await resolveConservativeMachiningSecondsPerMm();
  const secondsPerMm = estimateMeta.secondsPerMm;

  const machineFilter =
    Array.isArray(machineIds) && machineIds.length
      ? { machineId: { $in: machineIds.map((id) => String(id).trim()).filter(Boolean) } }
      : {};

  const cncMachines = await CncMachine.find({ status: "active", ...machineFilter })
    .select({ machineId: 1, currentMaterial: 1, maxModelDiameterGroups: 1 })
    .lean();

  const uids = cncMachines
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);
  if (uids.length < 2) {
    return {
      moved: [],
      skipped: true,
      reason: "not_enough_machines",
      deadlineAt: deadline.toISOString(),
      estimate: estimateMeta,
    };
  }

  const machineFlags = await Machine.find({ uid: { $in: uids } })
    .select({ uid: 1, allowRequestAssign: 1 })
    .lean();
  const allowMap = new Map(
    machineFlags.map((m) => [String(m?.uid || "").trim(), m?.allowRequestAssign !== false]),
  );

  const machineMetaMap = new Map();
  for (const m of cncMachines) {
    const mid = String(m?.machineId || "").trim();
    if (!mid || allowMap.get(mid) === false) continue;
    const materialDiameter = inferCurrentMaterialDiameter(m);
    if (!Number.isFinite(materialDiameter) || materialDiameter <= 0) continue;
    machineMetaMap.set(mid, {
      materialDiameter,
      materialDiameterGroup: inferDiameterGroupFromValue(materialDiameter),
      allowedDiameterGroups: Array.isArray(m.maxModelDiameterGroups)
        ? m.maxModelDiameterGroups
        : [],
    });
  }

  const eligibleIds = [...machineMetaMap.keys()];
  if (eligibleIds.length < 2) {
    return {
      moved: [],
      skipped: true,
      reason: "not_enough_eligible_machines",
      deadlineAt: deadline.toISOString(),
      estimate: estimateMeta,
    };
  }

  const requests = await Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    "productionSchedule.assignedMachine": { $in: eligibleIds },
  })
    .select(
      "_id requestId manufacturerStage shippingMode finalShipping originalShipping timeline productionSchedule caseInfos assignedMachine",
    )
    .populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt elapsedSeconds durationSeconds machineId",
    })
    .lean();

  const queuesByMachine = new Map(eligibleIds.map((id) => [id, []]));
  for (const reqItem of requests) {
    if (isMachiningCompleted(reqItem)) continue;
    const mid = String(reqItem?.productionSchedule?.assignedMachine || "").trim();
    if (!queuesByMachine.has(mid)) continue;
    queuesByMachine.get(mid).push(reqItem);
  }

  const workingQueues = cloneQueueMaps(queuesByMachine);
  const moved = [];

  // 1) 대형 소재 장비에 잘못 배정된 신속건을 최소 소재 장비로 먼저 합친다.
  await consolidateExpressJobsToSmallestCoveringMachine({
    workingQueues,
    machineMetaMap,
    secondsPerMm,
    nowMs,
    todayYmd,
    deadlineMs,
    actorUserId,
    moved,
  });

  const initialSnapshot = buildEtaSnapshot({
    queuesByMachine: workingQueues,
    machineMetaMap,
    secondsPerMm,
    nowMs,
    todayYmd,
    deadlineMs,
  });

  const busyMachines = initialSnapshot.filter((m) => m.missesDeadline);
  const spareMachines = initialSnapshot.filter((m) => !m.missesDeadline);
  if (!busyMachines.length || !spareMachines.length) {
    if (moved.length) {
      const finalMachines = buildEtaSnapshot({
        queuesByMachine: workingQueues,
        machineMetaMap,
        secondsPerMm,
        nowMs,
        todayYmd,
        deadlineMs,
      });
      const summary = `신속배송 ${moved.length}건을 최소 소재 장비로 재배치했습니다.`;
      const alert = {
        id: `express-rebalance-${nowMs}`,
        type: "express_deadline_rebalance",
        createdAt: new Date(nowMs).toISOString(),
        summary,
        deadlineAt: deadline.toISOString(),
        deadlineAtLabel: formatKstDateTime(deadline),
        moved,
        estimate: estimateMeta,
        machines: finalMachines,
      };
      await persistAndEmitAlert(alert);
      return alert;
    }
    return {
      moved: [],
      skipped: true,
      reason: busyMachines.length ? "no_spare_machine" : "no_busy_machine",
      deadlineAt: deadline.toISOString(),
      estimate: estimateMeta,
      machines: initialSnapshot,
    };
  }

  // 2) 출고일 14:00을 넘기는 장비가 있으면 여유 장비로 분산
  for (const busy of busyMachines) {
    const sourceId = busy.machineId;
    let safety = 0;
    while (safety++ < 30) {
      const sourceRows = workingQueues.get(sourceId) || [];
      const sourceSnap = buildEtaSnapshot({
        queuesByMachine: new Map([[sourceId, sourceRows]]),
        machineMetaMap,
        secondsPerMm,
        nowMs,
        todayYmd,
        deadlineMs,
      })[0];
      if (!sourceSnap?.missesDeadline) break;

      const candidates = [...sourceRows]
        .filter((row) => !isMachiningInProgress(row))
        .filter((row) => isExpressShipRequestWithYmd(row))
        .filter((row) => {
          const dl = resolveExpressMachiningDeadlineForRequest(row);
          return dl && nowMs < dl.getTime();
        })
        .sort(compareMachiningQueueOrder)
        .reverse();

      let didMove = false;
      for (const candidate of candidates) {
        const maxDiameter = resolveMaxDiameter(candidate);
        const fromDia = Number(
          machineMetaMap.get(sourceId)?.materialDiameter ||
            candidate?.productionSchedule?.diameter,
        );

        // 여유 장비 중 커버 가능 + 이동 후에도 마감 준수하는 곳
        const targetOptions = [];
        for (const spare of spareMachines) {
          const targetId = spare.machineId;
          if (targetId === sourceId) continue;
          const targetMeta = machineMetaMap.get(targetId);
          const toDia = Number(targetMeta?.materialDiameter);
          if (!machineCanCoverRequest(toDia, maxDiameter)) continue;

          // 시뮬레이션: source에서 제거, target에 추가
          const simQueues = cloneQueueMaps(workingQueues);
          simQueues.set(
            sourceId,
            (simQueues.get(sourceId) || []).filter(
              (r) => String(r?._id) !== String(candidate._id),
            ),
          );
          const movedRow = {
            ...candidate,
            productionSchedule: {
              ...(candidate.productionSchedule || {}),
              assignedMachine: targetId,
              diameter: toDia,
              diameterGroup: inferDiameterGroupFromValue(toDia),
            },
            assignedMachine: targetId,
          };
          simQueues.set(targetId, [...(simQueues.get(targetId) || []), movedRow]);

          const afterSnap = buildEtaSnapshot({
            queuesByMachine: simQueues,
            machineMetaMap,
            secondsPerMm,
            nowMs,
            todayYmd,
            deadlineMs,
          });
          const afterSource = afterSnap.find((m) => m.machineId === sourceId);
          const afterTarget = afterSnap.find((m) => m.machineId === targetId);
          if (afterTarget?.missesDeadline) continue;

          const beforeSourceComplete = sourceSnap.todayExpressCompleteAt
            ? new Date(sourceSnap.todayExpressCompleteAt).getTime()
            : Infinity;
          const afterSourceComplete = afterSource?.todayExpressCompleteAt
            ? new Date(afterSource.todayExpressCompleteAt).getTime()
            : 0;
          // 소스 신속 완료가 개선되거나, 최소한 마감 내로 들어와야 함
          const sourceImproved =
            afterSourceComplete < beforeSourceComplete ||
            !afterSource?.missesDeadline;
          if (!sourceImproved) continue;

          const candidateDeadlineMs =
            resolveExpressMachiningDeadlineForRequest(candidate)?.getTime() ??
            deadlineMs;
          const targetSlackMs =
            candidateDeadlineMs -
            (afterTarget?.todayExpressCompleteAt
              ? new Date(afterTarget.todayExpressCompleteAt).getTime()
              : afterTarget?.estimatedQueueCompleteAt
                ? new Date(afterTarget.estimatedQueueCompleteAt).getTime()
                : nowMs);

          targetOptions.push({
            targetId,
            toDia,
            targetSlackMs,
            // 소재 업사이즈 선호 (동일 직경 이동도 허용하되 후순위)
            diameterDelta: toDia - (Number.isFinite(fromDia) ? fromDia : toDia),
          });
        }

        if (!targetOptions.length) continue;
        targetOptions.sort((a, b) => {
          // 1) 더 작은 소재 직경 장비 우선 (M4 before M5)
          if (a.toDia !== b.toDia) return a.toDia - b.toDia;
          // 2) 여유가 큰 장비
          if (b.targetSlackMs !== a.targetSlackMs) return b.targetSlackMs - a.targetSlackMs;
          return String(a.targetId).localeCompare(String(b.targetId));
        });

        const chosen = targetOptions[0];
        const toDia = chosen.toDia;
        const fromMachineId = sourceId;
        const toMachineId = chosen.targetId;

        await persistExpressRebalanceMove({
          candidate,
          fromMachineId,
          toMachineId,
          toDia,
          fromDia,
          nowMs,
          actorUserId,
          workingQueues,
          moved,
          secondsPerMm,
        });
        didMove = true;
        break;
      }

      if (!didMove) break;
    }
  }

  if (!moved.length) {
    return {
      moved: [],
      skipped: true,
      reason: "no_movable_candidate",
      deadlineAt: deadline.toISOString(),
      estimate: estimateMeta,
      machines: initialSnapshot,
      summary: "14시 완료가 어려운 신속건이 있으나 옮길 여유 장비를 찾지 못했습니다.",
    };
  }

  // 최종 스냅샷 (DB 재조회)
  const refreshed = await Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    "productionSchedule.assignedMachine": { $in: eligibleIds },
  })
    .select(
      "_id requestId manufacturerStage shippingMode finalShipping originalShipping timeline productionSchedule caseInfos assignedMachine",
    )
    .populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt elapsedSeconds durationSeconds machineId",
    })
    .lean();

  const finalQueues = new Map(eligibleIds.map((id) => [id, []]));
  for (const reqItem of refreshed) {
    if (isMachiningCompleted(reqItem)) continue;
    const mid = String(reqItem?.productionSchedule?.assignedMachine || "").trim();
    if (!finalQueues.has(mid)) continue;
    finalQueues.get(mid).push(reqItem);
  }

  const finalMachines = buildEtaSnapshot({
    queuesByMachine: finalQueues,
    machineMetaMap,
    secondsPerMm,
    nowMs,
    todayYmd,
    deadlineMs,
  });

  const summary = `신속배송 ${moved.length}건을 14시 가공 완료를 위해 여유 장비로 재배치했습니다.`;
  const alert = {
    id: `express-rebalance-${nowMs}`,
    type: "express_deadline_rebalance",
    createdAt: new Date(nowMs).toISOString(),
    summary,
    deadlineAt: deadline.toISOString(),
    deadlineAtLabel: formatKstDateTime(deadline),
    moved,
    estimate: estimateMeta,
    machines: finalMachines,
  };

  await persistAndEmitAlert(alert);

  console.log("[EXPRESS-REBALANCE] completed", {
    movedCount: moved.length,
    moved: moved.map((m) => ({
      requestId: m.requestId,
      from: m.fromMachineId,
      to: m.toMachineId,
      dia: `${m.fromDiameter}->${m.toDiameter}`,
    })),
  });

  return alert;
}
