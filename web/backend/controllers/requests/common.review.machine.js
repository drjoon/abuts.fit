import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import BridgeSetting from "../../models/bridgeSetting.model.js";
import {
  buildMachineQueueLoadMap,
  inferCurrentMaterialDiameter,
  inferDiameterGroupFromValue,
} from "../cnc/distribution.utils.js";

function isMachineOnlineStatus(status) {
  const s = String(status || "")
    .trim()
    .toUpperCase();
  return ["OK", "ONLINE", "RUN", "RUNNING", "IDLE", "STOP"].includes(s);
}

function isAssignableMachine({
  machineMeta,
  ignoreAllowAssign,
  mockCncMachiningEnabled,
}) {
  const online = isMachineOnlineStatus(machineMeta?.lastStatus?.status);
  const assignAllowed = ignoreAllowAssign
    ? true
    : machineMeta?.allowRequestAssign !== false;
  return assignAllowed && (online || mockCncMachiningEnabled === true);
}

// Machine compatibility metadata builder
export function buildMachineCompatibilityMeta({
  stageKey,
  ok,
  reason,
  targetDiameter,
  targetDiameterGroup,
  matchedMachineId,
  matchedDiameter,
  matchedDiameterGroup,
}) {
  const meta = {
    stage: stageKey,
    ok,
    checkedAt: new Date(),
  };
  if (reason) meta.reason = reason;
  if (Number.isFinite(targetDiameter))
    meta.targetDiameter = Number(targetDiameter);
  if (targetDiameterGroup) meta.targetDiameterGroup = targetDiameterGroup;
  if (matchedMachineId) meta.matchedMachineId = matchedMachineId;
  if (Number.isFinite(matchedDiameter))
    meta.matchedDiameter = Number(matchedDiameter);
  if (matchedDiameterGroup) meta.matchedDiameterGroup = matchedDiameterGroup;
  return meta;
}

// Attach machine compatibility metadata to request
export function attachMachineCompatibilityMeta({ request, meta }) {
  if (!request || !meta) return;
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.machineCompatibility = meta;
  if (typeof request.markModified === "function") {
    request.markModified("caseInfos");
  }
}

// Infer diameter group from diameter value
export function inferDiameterGroupFromDiameter(diameter) {
  const group = inferDiameterGroupFromValue(diameter);
  return group || null;
}

// Infer diameter group from request
export function inferDiameterGroupFromRequest(request) {
  const schedule = request?.productionSchedule || {};
  const explicitGroup = String(schedule.diameterGroup || "").trim();
  if (explicitGroup) return explicitGroup;

  const diameterCandidates = [
    schedule.diameter,
    request?.caseInfos?.maxDiameter,
    request?.caseInfos?.camDiameter,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  const diameter = diameterCandidates.length ? diameterCandidates[0] : null;
  return inferDiameterGroupFromDiameter(diameter) || "8";
}

// Resolve target diameter from request
export function resolveTargetDiameter(request) {
  const schedule = request?.productionSchedule || {};
  const maxD = Number(request?.caseInfos?.maxDiameter);
  if (Number.isFinite(maxD) && maxD > 0) return maxD;
  const scheduled = Number(schedule?.diameter);
  if (Number.isFinite(scheduled) && scheduled > 0) return scheduled;
  return 8;
}

// Screen CAM machine for request
export async function screenCamMachineForRequest({ request }) {
  if (!request) {
    return { ok: false, reason: "요청 정보가 없습니다.", reqGroup: "8" };
  }

  const schedule = request.productionSchedule || {};
  const diameterCandidates = [
    schedule.diameter,
    request?.caseInfos?.maxDiameter,
    request?.caseInfos?.camDiameter,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (!diameterCandidates.length) {
    return {
      ok: false,
      reason: "소재 직경 정보를 찾을 수 없습니다.",
      reqGroup: "8",
    };
  }

  const diameter = diameterCandidates[0];
  const diameterGroup = inferDiameterGroupFromDiameter(diameter) || "8";

  return {
    ok: true,
    diameter,
    diameterGroup,
    preferredMachine:
      diameterGroup === "6" ? "M3" : diameterGroup === "8" ? "M4" : null,
    reqGroup: diameterGroup,
  };
}

// Choose machine for CAM machining
export async function chooseMachineForCamMachining({
  request,
  ignoreAllowAssign = false,
  requireCeil = false,
  reservedMachineLoadMap = null,
  reservedQueuePositionMap = null,
  reservedLastAssignmentMap = null,
  reserveAssignment = true,
  session = null,
}) {
  if (!request) throw new Error("request is required");
  const schedule = request.productionSchedule || {};
  const targetDiameter = resolveTargetDiameter(request);
  const toDiameterGroup = (d) => {
    if (!Number.isFinite(d) || d <= 0) return null;
    if (d <= 6) return "6";
    if (d <= 8) return "8";
    if (d <= 10) return "10";
    return "12";
  };

  console.log("[CAM-CHOOSE] input", {
    requestId: request?.requestId,
    maxDiameter: request?.caseInfos?.maxDiameter,
    scheduleDiameter: schedule?.diameter,
    targetDiameter,
    ignoreAllowAssign,
  });

  const bridgeSetting = await BridgeSetting.findById("default")
    .select({ mockCncMachiningEnabled: 1 })
    .lean();
  const mockCncMachiningEnabled =
    bridgeSetting?.mockCncMachiningEnabled === true;

  const cncMachines = await CncMachine.find({ status: "active" })
    .select({
      machineId: 1,
      maxModelDiameterGroups: 1,
      currentMaterial: 1,
    })
    .lean();
  const machineIds = cncMachines
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);

  // 동시 요청 경쟁 상태 방지를 위해 최신 lastAssignmentAt 조회
  // session을 전달하여 같은 트랜잭션 내 업데이트를 반영
  const machineQuery = Machine.find({ uid: { $in: machineIds } })
    .select({
      uid: 1,
      allowRequestAssign: 1,
      lastAssignmentAt: 1,
      lastStatus: 1,
    })
    .lean();
  const machineFlags = session
    ? await machineQuery.session(session)
    : await machineQuery;
  const machineFlagMap = new Map(
    machineFlags
      .map((m) => [String(m?.uid || "").trim(), m])
      .filter(([uid]) => Boolean(uid)),
  );
  const candidatesWithDia = cncMachines
    .map((m) => {
      const machineId = String(m?.machineId || "").trim();
      if (!machineId) return null;
      const machineMeta = machineFlagMap.get(machineId) || null;
      if (
        !isAssignableMachine({
          machineMeta,
          ignoreAllowAssign,
          mockCncMachiningEnabled,
        })
      ) {
        return null;
      }
      const materialDia = inferCurrentMaterialDiameter(m);
      if (!Number.isFinite(materialDia) || materialDia <= 0) {
        console.warn(
          "[chooseMachineForCamMachining] skip machine without material",
          {
            machineId,
          },
        );
        return null;
      }
      const availableDia = materialDia;
      // reservedLastAssignmentMap에 값이 있으면 우선 사용 (같은 배치 작업 내 배정 추적)
      const lastAssignmentAt = reservedLastAssignmentMap?.has(machineId)
        ? reservedLastAssignmentMap.get(machineId)
        : machineMeta?.lastAssignmentAt || null;
      return {
        machineId,
        availableDia,
        lastAssignmentAt,
      };
    })
    .filter(Boolean);
  console.log("[CAM-CHOOSE] candidates", {
    requestId: request?.requestId,
    count: candidatesWithDia.length,
    list: candidatesWithDia.map((c) => ({
      m: c.machineId,
      d: c.availableDia,
      lastAssignmentAt: c.lastAssignmentAt,
    })),
  });

  if (!candidatesWithDia.length) {
    throw new Error(
      "배정 가능한 online 장비(allowRequestAssign) 또는 소재 직경 정보를 찾을 수 없습니다.",
    );
  }

  // session을 전달하여 같은 트랜잭션 내 변경사항(방금 배정한 요청들)을 큐 계산에 포함
  const queueCountMap = await buildMachineQueueLoadMap(
    candidatesWithDia.map((c) => c.machineId),
    session,
  );

  const ceilCandidates = candidatesWithDia.filter(
    (c) => c.availableDia >= targetDiameter,
  );
  console.log("[CAM-CHOOSE] ceilCandidates", {
    requestId: request?.requestId,
    count: ceilCandidates.length,
    list: ceilCandidates.map((c) => ({ m: c.machineId, d: c.availableDia })),
  });
  const hasCeil = ceilCandidates.length > 0;
  const pool = hasCeil
    ? ceilCandidates
    : requireCeil
      ? []
      : ignoreAllowAssign
        ? []
        : candidatesWithDia;

  if (!pool.length) {
    if (!candidatesWithDia.length) {
      const err = new Error(
        "배정 가능한 online 장비(allowRequestAssign) 또는 소재 직경 정보를 찾을 수 없습니다.",
      );
      err.statusCode = 409;
      err.code = "NO_ASSIGNABLE_MACHINE";
      throw err;
    }

    const err = new Error(
      `소재 직경 ${targetDiameter}mm 이상을 처리할 수 있는 장비를 찾을 수 없습니다. 현재 소재 직경: ${candidatesWithDia
        .map((c) => `${c.machineId}=${c.availableDia}`)
        .join(", ")}`,
    );
    err.statusCode = 409;
    err.code = "NO_COMPAT_MACHINE";
    throw err;
  }

  const ranked = (pool || [])
    .map((c) => {
      const queue =
        reservedMachineLoadMap?.get(c.machineId) ??
        queueCountMap.get(c.machineId) ??
        0;
      return { ...c, queue };
    })
    .sort((a, b) => {
      // 1. 큐 길이 우선 (적은 것 우선)
      if (a.queue !== b.queue) return a.queue - b.queue;

      // 2. 소재 직경 우선 (작은 것 우선, 낭비 최소화)
      if (a.availableDia !== b.availableDia)
        return a.availableDia - b.availableDia;

      // 3. 최근 배정 시간 우선 (오래된 것 우선, 균등 분산)
      // null인 경우 가장 우선 선택되도록 -Infinity 사용
      const aAssignedAt = a.lastAssignmentAt
        ? new Date(a.lastAssignmentAt).getTime()
        : -Infinity;
      const bAssignedAt = b.lastAssignmentAt
        ? new Date(b.lastAssignmentAt).getTime()
        : -Infinity;
      if (aAssignedAt !== bAssignedAt) return aAssignedAt - bAssignedAt;

      // 4. 장비 ID 사전순 (최후 기준)
      return a.machineId.localeCompare(b.machineId);
    });

  const chosen = ranked[0];
  const queuePosition =
    (reservedQueuePositionMap?.get(chosen.machineId) ??
      queueCountMap.get(chosen.machineId) ??
      0) + 1;
  console.log("[CAM-CHOOSE] ranked", {
    requestId: request?.requestId,
    targetDiameter,
    ranked: ranked.map((item) => ({
      m: item.machineId,
      q: item.queue,
      d: item.availableDia,
      lastAssignmentAt: item.lastAssignmentAt,
    })),
  });
  console.log("[CAM-CHOOSE] chosen", {
    requestId: request?.requestId,
    chosen: chosen && {
      m: chosen.machineId,
      d: chosen.availableDia,
      lastAssignmentAt: chosen.lastAssignmentAt,
    },
    queuePosition,
  });

  if (reserveAssignment) {
    // 동시 요청 경쟁 상태 방지: 실제 배정 경로에서만 lastAssignmentAt 업데이트
    const now = new Date();
    const updateQuery = Machine.updateOne(
      { uid: chosen.machineId },
      { $set: { lastAssignmentAt: now } },
    );
    if (session) {
      await updateQuery.session(session);
    } else {
      await updateQuery;
    }
  }

  return {
    machineId: chosen.machineId,
    queuePosition,
    diameterGroup: toDiameterGroup(chosen.availableDia),
    diameter: chosen.availableDia,
  };
}

// Ensure machine compatibility or throw error
export async function ensureMachineCompatibilityOrThrow({
  request,
  stageKey,
  session = null,
}) {
  const targetDiameterRaw = resolveTargetDiameter(request);
  const targetDiameter = Number(targetDiameterRaw);
  const targetDiameterGroup = inferDiameterGroupFromDiameter(targetDiameter);

  if (!Number.isFinite(targetDiameter) || targetDiameter <= 0) {
    const reason = "소재 직경 정보를 찾을 수 없습니다.";
    const meta = buildMachineCompatibilityMeta({
      stageKey,
      ok: false,
      reason,
      targetDiameter: null,
      targetDiameterGroup: null,
    });
    const err = new Error(reason);
    err.statusCode = 400;
    err.machineCompatibilityMeta = meta;
    throw err;
  }

  try {
    const selection = await screenCamMachineForRequest({ request });
    if (!selection?.ok) {
      const err = new Error(
        selection?.reason ||
          `소재 직경 ${targetDiameter}mm 이상을 처리할 수 있는 장비를 찾을 수 없습니다.`,
      );
      err.statusCode = 409;
      throw err;
    }
    const meta = buildMachineCompatibilityMeta({
      stageKey,
      ok: true,
      reason: "",
      targetDiameter,
      targetDiameterGroup,
      matchedMachineId: selection?.machineId,
      matchedDiameter: selection?.diameter,
      matchedDiameterGroup: selection?.diameterGroup,
    });
    attachMachineCompatibilityMeta({ request, meta });
    return selection;
  } catch (error) {
    const reason =
      error?.message ||
      `소재 직경 ${targetDiameter}mm 이상을 처리할 수 있는 장비를 찾을 수 없습니다.`;
    const meta = buildMachineCompatibilityMeta({
      stageKey,
      ok: false,
      reason,
      targetDiameter,
      targetDiameterGroup,
    });
    const err = new Error(reason);
    err.statusCode = error?.statusCode || 409;
    err.machineCompatibilityMeta = meta;
    throw err;
  }
}
