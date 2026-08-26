// related files:
// - web/backend/controllers/cnc/material.js
// - web/backend/controllers/cnc/production.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/services/reviewApprovalQueue.service.js
// - web/backend/rules.md
import Request from "../../models/request.model.js";
import { enqueueApproval } from "../../services/reviewApprovalQueue.service.js";
import { inferDiameterGroupFromValue } from "../cnc/distribution.utils.js";

export function isMaterialDiameterChanged(fromDia, toDia) {
  return (
    Number.isFinite(fromDia) &&
    Number.isFinite(toDia) &&
    fromDia > 0 &&
    toDia > 0 &&
    Math.abs(fromDia - toDia) > 1e-6
  );
}

export function shouldRetriggerEspritForMaterialDiameter({
  previousDiameter: _previousDiameter,
  nextDiameter,
  hasNc,
  ncMaterialDiameter = null,
}) {
  if (!hasNc) return false;
  if (!Number.isFinite(nextDiameter) || nextDiameter <= 0) return false;
  const ncDia = Number(ncMaterialDiameter);
  if (Number.isFinite(ncDia) && ncDia > 0) {
    return Math.abs(ncDia - nextDiameter) > 1e-6;
  }
  // 레거시 NC(materialDiameter 메타 없음): 스케줄 직경만으로는 NC #521을
  // 보증할 수 없으므로 장비 소재와 맞추기 위해 재생성한다.
  return true;
}

/**
 * 장비 소재 직경과 다른 NC를 제거하고 Esprit force 재생성 큐를 등록한다.
 * (수동 Next Up 이동 / 신속 재배치와 동일 SSOT)
 */
export async function clearNcAndForceEspritRetrigger({
  requestIds,
  diameter,
  diameterGroup,
  actorUserId = null,
  reason = "material_diameter_changed",
} = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(requestIds) ? requestIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return { cleared: 0, enqueued: 0, reason };

  const dia = Number(diameter);
  const group =
    String(diameterGroup || "").trim() ||
    (Number.isFinite(dia) && dia > 0 ? inferDiameterGroupFromValue(dia) : "");

  const $set = {
    "productionSchedule.ncPreload": { status: "NONE" },
  };
  if (Number.isFinite(dia) && dia > 0) {
    $set["productionSchedule.diameter"] = dia;
  }
  if (group) {
    $set["productionSchedule.diameterGroup"] = group;
  }

  await Request.updateMany(
    { _id: { $in: ids } },
    {
      $set,
      $unset: { "caseInfos.ncFile": 1 },
    },
  );

  let enqueued = 0;
  for (const id of ids) {
    const fresh = await Request.findById(id).lean();
    if (!fresh) continue;
    await enqueueApproval({
      taskType: "REQUEST_STAGE_APPROVED",
      request: fresh,
      actorUserId,
      forceReprocess: true,
    });
    enqueued += 1;
  }

  console.log("[ESPRIT] cleared NC and enqueued diameter retrigger", {
    reason,
    cleared: ids.length,
    enqueued,
    diameter: Number.isFinite(dia) ? dia : null,
    diameterGroup: group || null,
  });

  return { cleared: ids.length, enqueued, reason };
}
