import Request from "../../models/request.model.js";

export const MACHINING_ASSIGN_STAGE_SET = ["의뢰", "CAM", "가공"];

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
  const groupRaw = String(reqItem?.productionSchedule?.diameterGroup || "").trim();
  if (groupRaw) return normalizeDiameterGroupValue(groupRaw);
  const diameter = Number(reqItem?.productionSchedule?.diameter);
  return inferDiameterGroupFromValue(diameter);
}

export function isMachiningInProgress(reqItem) {
  const record = reqItem?.productionSchedule?.machiningRecord;
  if (!record) return false;

  const status = String(record?.status || "")
    .trim()
    .toUpperCase();
  if (status === "RUNNING" || status === "PROCESSING") return true;

  const startedAt = record?.startedAt ? new Date(record.startedAt).getTime() : 0;
  const completedAt = record?.completedAt
    ? new Date(record.completedAt).getTime()
    : 0;
  return startedAt > 0 && completedAt <= 0;
}

export function getMachiningLoadWeight(reqItem) {
  const qty = Number(reqItem?.productionSchedule?.machiningQty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export async function buildMachineQueueLoadMap(machineIds) {
  const ids = Array.isArray(machineIds)
    ? machineIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return new Map();

  const assigned = await Request.find({
    manufacturerStage: { $in: MACHINING_ASSIGN_STAGE_SET },
    "productionSchedule.assignedMachine": { $in: ids },
  }).select(
    "productionSchedule.assignedMachine productionSchedule.machiningQty",
  );

  const loadMap = new Map(ids.map((id) => [id, 0]));
  for (const reqItem of assigned) {
    const machineId = String(reqItem?.productionSchedule?.assignedMachine || "").trim();
    if (!machineId || !loadMap.has(machineId)) continue;
    loadMap.set(
      machineId,
      (loadMap.get(machineId) || 0) + getMachiningLoadWeight(reqItem),
    );
  }

  return loadMap;
}
