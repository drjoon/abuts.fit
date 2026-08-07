// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/production.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// change-log:
// - 2026-08-07: 재배정용 커버 장비 랭킹 헬퍼 추가 (최소 소재 우선, exact-group 금지).
// - 2026-08-07: 소재≥maxDiameter 커버 헬퍼 추가 (auto-next/재배정 SSOT).
import Request from "../../models/request.model.js";

// 가공 단계는 `가공` 단일값만 허용한다.
export const MACHINING_STAGE_ALIASES = ["가공"];

export const MACHINING_ASSIGN_STAGE_SET = [...MACHINING_STAGE_ALIASES];
export const MACHINING_QUEUE_STAGE_SET = [...MACHINING_STAGE_ALIASES];

// 불완전가공(R&D unmachinable) 판정 건은 가공 큐/Now Playing/Next Up 등
// 일반 작업 큐에 절대 노출되면 안 된다. Request.find 조건에 이 필터를 반드시 함께 사용한다.
export const EXCLUDE_UNMACHINABLE_FILTER = { "rnd.unmachinableAt": null };

export function normalizeMachiningStageValue(value) {
  const raw = String(value || "").trim();
  return raw === "가공" ? "가공" : "";
}

export function isMachiningQueueStageValue(value) {
  return normalizeMachiningStageValue(value) === "가공";
}

export function normalizeDiameterGroupValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("+")) return "12";
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric) && numeric > 10) return "12";
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(Math.round(numeric));
  }
  return raw;
}

export function inferDiameterGroupFromValue(diameter) {
  if (!Number.isFinite(diameter) || diameter <= 0) return "";
  if (diameter <= 6) return "6";
  if (diameter <= 8) return "8";
  if (diameter <= 10) return "10";
  return "12";
}

export function inferMaterialDiameterGroup(machine) {
  const currentGroup = normalizeDiameterGroupValue(
    machine?.currentMaterial?.diameterGroup,
  );
  if (currentGroup) return currentGroup;

  const diameter = Number(machine?.currentMaterial?.diameter);
  return inferDiameterGroupFromValue(diameter);
}

export function inferCurrentMaterialDiameter(machine) {
  const materialDia = Number(machine?.currentMaterial?.diameter);
  if (Number.isFinite(materialDia) && materialDia > 0) return materialDia;

  const materialGroup = normalizeDiameterGroupValue(
    machine?.currentMaterial?.diameterGroup,
  );
  if (materialGroup === "6") return 6;
  if (materialGroup === "8") return 8;
  if (materialGroup === "10") return 10;
  if (materialGroup === "12") return 12;

  return null;
}

export function inferRequestDiameterGroup(reqItem) {
  // 배정된 장비 소재(diameterGroup)보다 실제 maxDiameter SSOT를 우선한다.
  // (M5 배정 후 diameterGroup=10으로 고정되면 redistribute가 M5 전용 풀로 잘못 묶는 회귀 방지)
  const maxD = Number(reqItem?.caseInfos?.maxDiameter);
  if (Number.isFinite(maxD) && maxD > 0) {
    return inferDiameterGroupFromValue(maxD);
  }

  const groupRaw = String(
    reqItem?.productionSchedule?.diameterGroup || "",
  ).trim();
  if (groupRaw) return normalizeDiameterGroupValue(groupRaw);
  const diameter = Number(reqItem?.productionSchedule?.diameter);
  return inferDiameterGroupFromValue(diameter);
}

/**
 * 소재 직경이 요청 maxDiameter를 커버하는지 판정.
 * 정책(rules.md §B): 소재 직경 ≥ 요청 maxDiameter
 * 예) D6 의뢰 → D8/D10 장착 장비에서 가공 가능 (CAM은 해당 장착 직경 NC 필요)
 */
export function machineMaterialCoversMaxDiameter(materialDia, maxDiameter) {
  return (
    Number.isFinite(materialDia) &&
    materialDia > 0 &&
    Number.isFinite(maxDiameter) &&
    maxDiameter > 0 &&
    materialDia + 1e-9 >= maxDiameter
  );
}

/**
 * 자동가공/재배정용 런타임 호환 판정.
 * - SSOT: caseInfos.maxDiameter vs 현재 장착 소재 직경
 * - maxModelDiameterGroups가 있으면 요청 그룹 또는 장착 소재 그룹 중 하나라도 허용해야 함
 *   (chooseMachineForCamMachining ceil 후보와 동일)
 */
export function isRequestDiameterCompatibleWithMachineMaterial({
  requestDoc,
  machineMeta,
}) {
  const maxD = Number(requestDoc?.caseInfos?.maxDiameter);
  const materialDia = inferCurrentMaterialDiameter(machineMeta);
  const reqGroup = normalizeDiameterGroupValue(
    inferRequestDiameterGroup(requestDoc),
  );
  const materialGroup = normalizeDiameterGroupValue(
    inferMaterialDiameterGroup(machineMeta),
  );

  const allowedGroups = (
    Array.isArray(machineMeta?.maxModelDiameterGroups)
      ? machineMeta.maxModelDiameterGroups
      : []
  )
    .map((g) => normalizeDiameterGroupValue(g))
    .filter(Boolean);

  if (allowedGroups.length > 0) {
    const allowsTarget = Boolean(reqGroup && allowedGroups.includes(reqGroup));
    const allowsMaterial = Boolean(
      materialGroup && allowedGroups.includes(materialGroup),
    );
    if (!allowsTarget && !allowsMaterial) return false;
  }

  // maxDiameter SSOT가 있으면 장착 소재 ≥ maxDiameter
  if (Number.isFinite(maxD) && maxD > 0) {
    if (!Number.isFinite(materialDia) || materialDia <= 0) {
      // 소재 미설정이면 그룹 허용만으로 통과시키지 않고, 그룹 셋이 비어있을 때만 허용
      return allowedGroups.length === 0;
    }
    return machineMaterialCoversMaxDiameter(materialDia, maxD);
  }

  // maxDiameter 없으면 요청 그룹을 장착 소재(또는 그룹 수치)로 커버 가능한지 본다.
  if (!reqGroup) return true;
  if (Number.isFinite(materialDia) && materialDia > 0) {
    const reqDiaApprox = Number(reqGroup);
    if (Number.isFinite(reqDiaApprox) && reqDiaApprox > 0) {
      return machineMaterialCoversMaxDiameter(materialDia, reqDiaApprox);
    }
  }
  if (!materialGroup) return allowedGroups.length === 0;
  const materialNum = Number(materialGroup);
  const reqNum = Number(reqGroup);
  if (Number.isFinite(materialNum) && Number.isFinite(reqNum)) {
    return materialNum + 1e-9 >= reqNum;
  }
  return materialGroup === reqGroup;
}

/**
 * 커버 가능 장비를 정책 순으로 정렬한다.
 * 1) 커버 가능한 최소 소재 직경 (8mm 이하 → M4(8) 우선, M5(10) 후순위)
 * 2) 큐 부하(적은 쪽)
 * 3) machineId
 *
 * 14:00 마감 분산은 expressDeadlineRebalance가 별도로 한다.
 */
export function rankCoveringMachinesForRequest({
  requestDoc,
  machines = [],
}) {
  return (Array.isArray(machines) ? machines : [])
    .filter((m) =>
      isRequestDiameterCompatibleWithMachineMaterial({
        requestDoc,
        machineMeta: m?.machineMeta || m,
      }),
    )
    .map((m) => {
      const machineMeta = m?.machineMeta || m;
      const materialDia = inferCurrentMaterialDiameter(machineMeta);
      return {
        machineId: String(m?.machineId || machineMeta?.machineId || "").trim(),
        machineMeta,
        materialDia,
        queue: Number(m?.queue) || 0,
      };
    })
    .filter((m) => m.machineId)
    .sort((a, b) => {
      const da = Number.isFinite(a.materialDia) ? a.materialDia : Infinity;
      const db = Number.isFinite(b.materialDia) ? b.materialDia : Infinity;
      if (da !== db) return da - db;
      if (a.queue !== b.queue) return a.queue - b.queue;
      return a.machineId.localeCompare(b.machineId);
    });
}

export function isMachiningInProgress(reqItem) {
  const record = reqItem?.productionSchedule?.machiningRecord;
  if (!record) return false;

  const status = String(record?.status || "")
    .trim()
    .toUpperCase();
  if (status === "RUNNING" || status === "PROCESSING") return true;

  const startedAt = record?.startedAt
    ? new Date(record.startedAt).getTime()
    : 0;
  const completedAt = record?.completedAt
    ? new Date(record.completedAt).getTime()
    : 0;
  return startedAt > 0 && completedAt <= 0;
}

export function isMachiningCompleted(reqItem) {
  const record = reqItem?.productionSchedule?.machiningRecord;
  if (!record) return false;

  const status = String(record?.status || "")
    .trim()
    .toUpperCase();
  if (status === "COMPLETED" || status === "SUCCESS" || status === "DONE")
    return true;

  const completedAt = record?.completedAt
    ? new Date(record.completedAt).getTime()
    : 0;
  return completedAt > 0;
}

export function getMachiningLoadWeight(reqItem) {
  const qty = Number(reqItem?.productionSchedule?.machiningQty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export async function buildMachineQueueLoadMap(machineIds, session = null) {
  const ids = Array.isArray(machineIds)
    ? machineIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return new Map();

  // session을 전달하여 같은 트랜잭션 내 변경사항(방금 배정한 요청)을 큐 계산에 포함
  const query = Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    "productionSchedule.assignedMachine": { $in: ids },
  }).select(
    "productionSchedule.assignedMachine productionSchedule.machiningQty productionSchedule.machiningRecord",
  );

  const assigned = session ? await query.session(session) : await query;

  const loadMap = new Map(ids.map((id) => [id, 0]));
  for (const reqItem of assigned) {
    const machineId = String(
      reqItem?.productionSchedule?.assignedMachine || "",
    ).trim();
    if (!machineId || !loadMap.has(machineId)) continue;

    // 가공이 완료된 건은 큐 부하에서 제외 (장비의 진행 대기 큐가 아님)
    if (isMachiningCompleted(reqItem)) continue;

    loadMap.set(
      machineId,
      (loadMap.get(machineId) || 0) + getMachiningLoadWeight(reqItem),
    );
  }

  return loadMap;
}
