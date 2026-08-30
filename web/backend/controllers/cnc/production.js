// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/shared.js
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/backend/controllers/requests/machiningPriorityRules.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/ExpressRebalanceAlertModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningPriorityRulesModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// change-log:
// - 2026-08-21: Next Up 수동 장비 이동 API(moveProductionQueueRequest) — NC $unset 후 항상 CAM/NC 재생성.
// - 2026-08-26: 재배정 시 소재 직경 불일치 NC는 $unset 후 Esprit force 재생성.
// - 2026-08-07: 재배정을 소재≥maxDiameter 커버 + 최소 소재 우선으로 통일 (D6 exact-group skip 수정).
// - 2026-08-07: 생산 큐 응답에 의뢰자명(businessName) 포함.
// - 2026-08-06: 가공 큐 select에 designSoftware·헥스 회전(rnd/caseInfos) 포함. 프리뷰 누락 수정.
import {
  Request,
  getAllProductionQueues,
  rollbackRequestToCamByRequestId,
  buildBusinessNameByAnchorIdMap,
} from "./shared.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import BridgeSetting from "../../models/bridgeSetting.model.js";
import mongoose from "mongoose";
import { buildManufacturerOrgScopeFilter } from "../requests/utils.js";
import {
  MACHINING_ASSIGN_STAGE_SET,
  MACHINING_QUEUE_STAGE_SET,
  EXCLUDE_UNMACHINABLE_FILTER,
  normalizeDiameterGroupValue,
  inferCurrentMaterialDiameter,
  inferDiameterGroupFromValue,
  inferRequestDiameterGroup,
  isMachiningInProgress,
  isMachiningCompleted,
  isRequestDiameterCompatibleWithMachineMaterial,
  getMachiningLoadWeight,
  rankCoveringMachinesForRequest,
} from "./distribution.utils.js";
import {
  compareMachiningQueueOrder,
  placeRequestAtPolicyQueuePosition,
} from "../requests/production.utils.js";
import {
  getLastExpressDeadlineRebalanceAlert,
  rebalanceExpressJobsForFourteenOClockDeadline,
} from "../requests/expressDeadlineRebalance.utils.js";
import { getMachiningPriorityRules } from "../requests/machiningPriorityRules.js";
import { enqueueApproval } from "../../services/reviewApprovalQueue.service.js";
import { resolveEffectiveShippingMode } from "../requests/shippingPriority.utils.js";
import {
  clearNcAndForceEspritRetrigger,
  shouldRetriggerEspritForMaterialDiameter,
} from "../requests/espritDiameterRetrigger.utils.js";

function isMachineOnlineStatus(status) {
  const s = String(status || "")
    .trim()
    .toUpperCase();
  return ["OK", "ONLINE", "RUNNING", "IDLE", "STOP"].includes(s);
}

function isAssignableMachine({ machineMeta, mockCncMachiningEnabled }) {
  return machineMeta?.allowRequestAssign !== false;
}

function normalizeTargetGroupSet(targetDiameterGroups) {
  const set = new Set(
    (Array.isArray(targetDiameterGroups) ? targetDiameterGroups : [])
      .map((group) => normalizeDiameterGroupValue(group))
      .filter(Boolean),
  );
  return set;
}

export async function resolveManufacturerMachineScope(req) {
  if (!req?.user || req.user.role !== "manufacturer") {
    return {
      requestFilter: {},
      machineFilter: {},
      machineIds: null,
    };
  }

  const machineFilter = {
    manufacturerBusinessAnchorId: req.user.businessAnchorId,
  };

  let ownedMachines = await Machine.find(machineFilter)
    .select({ uid: 1 })
    .lean();

  // legacy: BA 미설정 장비만 있는 환경에서는 소유 장비가 0건이 되어
  // 아래 machineScope가 큐를 통째로 비워버리는 사고가 난다.
  // BA 매칭 결과가 없으면 null/미설정 장비를 fallback으로 포함한다.
  if (!ownedMachines.length) {
    ownedMachines = await Machine.find({
      $or: [
        { manufacturerBusinessAnchorId: null },
        { manufacturerBusinessAnchorId: { $exists: false } },
      ],
    })
      .select({ uid: 1 })
      .lean();
  }

  const machineIds = ownedMachines
    .map((m) => String(m?.uid || "").trim())
    .filter(Boolean);

  // 제조사 조직 스코프 + (가능하면) 소유 장비에 배정된/미배정 의뢰만 조회.
  // 소유 장비를 끝내 못 찾으면 machineScope를 생략하고 orgScope만 적용한다.
  // (이전 {_id:{$exists:false}} fallback은 가공 큐를 0건으로 만드는 버그였다.)
  const orgScope = await buildManufacturerOrgScopeFilter(req);
  // 소유 장비 배정 + 미배정 + ghost 장비(소유 목록 밖) 배정도 포함한다.
  // ghost 배정은 getProductionQueues에서 unassigned로 모아 재배정한다.
  const machineScope =
    machineIds.length > 0
      ? {
          $or: [
            { "productionSchedule.assignedMachine": { $in: machineIds } },
            { assignedMachine: { $in: machineIds } },
            { "productionSchedule.assignedMachine": { $in: [null, ""] } },
            { "productionSchedule.assignedMachine": { $exists: false } },
            {
              $and: [
                { "productionSchedule.assignedMachine": { $type: "string" } },
                { "productionSchedule.assignedMachine": { $ne: "" } },
                { "productionSchedule.assignedMachine": { $nin: machineIds } },
              ],
            },
          ],
        }
      : null;

  return {
    requestFilter: {
      $and: [orgScope, machineScope].filter(
        (f) => f && typeof f === "object" && Object.keys(f).length > 0,
      ),
    },
    machineFilter,
    machineIds,
  };
}

export async function rebalanceProductionQueuesInternal({
  req,
  scope,
  targetDiameterGroups = null,
}) {
  const targetGroupSet = normalizeTargetGroupSet(targetDiameterGroups);

  let requests = await Request.find({
    manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
    ...EXCLUDE_UNMACHINABLE_FILTER,
    ...scope.requestFilter,
  })
    .select(
      "_id requestId manufacturerStage productionSchedule assignedMachine caseInfos",
    )
    .populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt machineId",
    });

  if (targetGroupSet.size > 0) {
    requests = requests.filter((reqItem) =>
      targetGroupSet.has(inferRequestDiameterGroup(reqItem)),
    );
  }

  const cncMachineQuery = {
    status: "active",
    ...(Array.isArray(scope.machineIds) && scope.machineIds.length
      ? { machineId: { $in: scope.machineIds } }
      : {}),
  };

  const bridgeSetting = await BridgeSetting.findById("default")
    .select({ mockCncMachiningEnabled: 1 })
    .lean();
  const mockCncMachiningEnabled =
    bridgeSetting?.mockCncMachiningEnabled === true;

  const cncMachines = await CncMachine.find(cncMachineQuery)
    .select({
      machineId: 1,
      maxModelDiameterGroups: 1,
      currentMaterial: 1,
    })
    .lean();

  const machineUids = cncMachines
    .map((m) => String(m?.machineId || "").trim())
    .filter(Boolean);

  const machineFlags = await Machine.find({ uid: { $in: machineUids } })
    .select({ uid: 1, allowRequestAssign: 1, lastStatus: 1 })
    .lean();

  const machineFlagMap = new Map(
    machineFlags
      .map((m) => [String(m?.uid || "").trim(), m])
      .filter(([uid]) => Boolean(uid)),
  );

  const eligibleMachineSet = new Set(
    cncMachines
      .map((cncMachine) => {
        const uid = String(cncMachine?.machineId || "").trim();
        if (!uid) return null;
        const machineMeta = machineFlagMap.get(uid) || null;
        if (!machineMeta) return null;
        return isAssignableMachine({
          machineMeta,
          mockCncMachiningEnabled,
        })
          ? uid
          : null;
      })
      .filter(Boolean),
  );

  // machineId → CncMachine doc (소재/허용그룹) — exact diameterGroup 매칭 금지
  const cncMachineById = new Map(
    cncMachines
      .map((m) => {
        const uid = String(m?.machineId || "").trim();
        return uid && eligibleMachineSet.has(uid) ? [uid, m] : null;
      })
      .filter(Boolean),
  );

  const queueCounts = new Map();
  for (const uid of eligibleMachineSet) {
    queueCounts.set(uid, 0);
  }

  const assignmentsByMachine = new Map();
  const ops = [];
  const espritRetriggerByDiameter = new Map();
  const sortedRequests = [...requests].sort(compareMachiningQueueOrder);

  for (const reqItem of sortedRequests) {
    const covering = rankCoveringMachinesForRequest({
      requestDoc: reqItem,
      machines: [...cncMachineById.entries()].map(([machineId, machineMeta]) => ({
        machineId,
        machineMeta,
        queue: queueCounts.get(machineId) || 0,
      })),
    });
    const candidates = covering
      .map((c) => c.machineId)
      .filter((uid) => queueCounts.has(uid));
    if (!candidates.length) continue;

    const lockedMachineId = String(
      reqItem?.productionSchedule?.machiningRecord?.machineId ||
        reqItem?.productionSchedule?.assignedMachine ||
        reqItem?.assignedMachine ||
        "",
    ).trim();
    const isLocked =
      isMachiningInProgress(reqItem) || isMachiningCompleted(reqItem);
    const isCompleted = isMachiningCompleted(reqItem);

    if (isLocked && lockedMachineId && candidates.includes(lockedMachineId)) {
      if (!isCompleted) {
        const load = getMachiningLoadWeight(reqItem);
        queueCounts.set(
          lockedMachineId,
          (queueCounts.get(lockedMachineId) || 0) + load,
        );
      }

      if (!assignmentsByMachine.has(lockedMachineId)) {
        assignmentsByMachine.set(lockedMachineId, []);
      }
      assignmentsByMachine.get(lockedMachineId).push(reqItem);
      continue;
    }

    // 커버 가능 최소 소재 → 큐 부하 → machineId (rankCoveringMachinesForRequest)
    const selected = candidates[0];
    if (!selected) continue;
    const load = getMachiningLoadWeight(reqItem);
    queueCounts.set(selected, (queueCounts.get(selected) || 0) + load);

    if (!assignmentsByMachine.has(selected)) {
      assignmentsByMachine.set(selected, []);
    }
    assignmentsByMachine.get(selected).push(reqItem);
  }

  for (const [uid, list] of assignmentsByMachine.entries()) {
    const materialDia = inferCurrentMaterialDiameter(cncMachineById.get(uid));
    const diameterGroup = Number.isFinite(materialDia)
      ? inferDiameterGroupFromValue(materialDia)
      : "";
    list.forEach((reqItem, idx) => {
      const prevDia = Number(reqItem?.productionSchedule?.diameter);
      const hasNc = Boolean(reqItem?.caseInfos?.ncFile?.s3Key);
      const needsEspritRetrigger = shouldRetriggerEspritForMaterialDiameter({
        previousDiameter: prevDia,
        nextDiameter: materialDia,
        hasNc,
        ncMaterialDiameter: Number(reqItem?.caseInfos?.ncFile?.materialDiameter),
      });
      const $set = {
        "productionSchedule.assignedMachine": uid,
        "productionSchedule.queuePosition": idx + 1,
        assignedMachine: uid,
      };
      if (Number.isFinite(materialDia) && materialDia > 0) {
        $set["productionSchedule.diameter"] = materialDia;
      }
      if (diameterGroup) {
        $set["productionSchedule.diameterGroup"] = diameterGroup;
      }
      const update = { $set };
      if (needsEspritRetrigger) {
        $set["productionSchedule.ncPreload"] = {
          status: "GENERATING",
          updatedAt: new Date(),
        };
        update.$unset = { "caseInfos.ncFile": 1 };
        const key = `${materialDia}|${diameterGroup || ""}`;
        if (!espritRetriggerByDiameter.has(key)) {
          espritRetriggerByDiameter.set(key, {
            diameter: materialDia,
            diameterGroup,
            requestIds: [],
          });
        }
        espritRetriggerByDiameter.get(key).requestIds.push(reqItem._id);
      }
      ops.push({
        updateOne: {
          filter: { _id: reqItem._id },
          update,
        },
      });
    });
  }

  if (ops.length > 0) {
    await Request.bulkWrite(ops);
  }

  let espritRetriggered = 0;
  for (const batch of espritRetriggerByDiameter.values()) {
    const result = await clearNcAndForceEspritRetrigger({
      requestIds: batch.requestIds,
      diameter: batch.diameter,
      diameterGroup: batch.diameterGroup,
      actorUserId: req?.user?._id ? String(req.user._id) : null,
      reason: "queue_redistribute_diameter_changed",
    });
    espritRetriggered += Number(result?.enqueued || 0);
  }

  return {
    reassignedCount: ops.length,
    eligibleMachineIds: Array.from(eligibleMachineSet),
    espritRetriggered,
  };
}

export async function getProductionQueues(req, res) {
  try {
    const scope = await resolveManufacturerMachineScope(req);

    // change-log:
    // - 2026-08-07: businessAnchorId 포함 → 의뢰자명(businessName) 매핑.
    // - 2026-08-06: 큐→프리뷰에 designSoftware/헥스 회전 필드 포함(가공 단계 누락 수정).
    const queueSelect = [
      "requestId",
      "status",
      "manufacturerStage",
      "productionSchedule",
      "businessAnchorId",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.rollbackCounts.machining",
      "caseInfos.ncFile",
      "caseInfos.anodizingEnabled",
      "caseInfos.designSoftware",
      "caseInfos.manufacturerHexRotation",
      "caseInfos.finalHexRotation",
      "caseInfos.requestorHexRotation",
      "caseInfos.totalLength",
      "caseInfos.maxDiameter",
      "shippingMode",
      "finalShipping.mode",
      "originalShipping.mode",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.retentionGroove",
      "rnd.manufacturerHexRotation",
      "lotNumber",
      "timeline.estimatedShipYmd",
      "caManufacturer",
      "source",
      "requestCategory",
    ].join(" ");

    const loadQueueRequests = () =>
      Request.find({
        manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
        ...EXCLUDE_UNMACHINABLE_FILTER,
        ...scope.requestFilter,
      })
        .select(queueSelect)
        .populate({
          path: "productionSchedule.machiningRecord",
          select:
            "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
        })
        .lean();

    let requests = await loadQueueRequests();
    let queues = getAllProductionQueues(requests);

    // ghost 장비(소유/활성 목록에 없는 M3 등)에 묶인 건은 미배정으로 모아 재배정한다.
    const knownMachineIds = new Set(
      Array.isArray(scope.machineIds)
        ? scope.machineIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );
    if (knownMachineIds.size > 0) {
      for (const mid of Object.keys(queues)) {
        if (mid === "unassigned") continue;
        if (knownMachineIds.has(mid)) continue;
        const orphaned = Array.isArray(queues[mid]) ? queues[mid] : [];
        if (!orphaned.length) {
          delete queues[mid];
          continue;
        }
        if (!Array.isArray(queues.unassigned)) queues.unassigned = [];
        queues.unassigned.push(...orphaned);
        delete queues[mid];
      }
    }

    const unassignedCount = Array.isArray(queues.unassigned)
      ? queues.unassigned.length
      : 0;

    // 미배정 건이 있을 때만 재배정. 실제 변경이 있을 때만 재조회.
    if (unassignedCount > 0) {
      const rebalance = await rebalanceProductionQueuesInternal({ req, scope });
      if (Number(rebalance?.reassignedCount || 0) > 0) {
        requests = await loadQueueRequests();
        queues = getAllProductionQueues(requests);
      }
    }

    const businessNameByAnchorId = await buildBusinessNameByAnchorIdMap(
      (Array.isArray(requests) ? requests : []).map((r) => r?.businessAnchorId),
    );

    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((reqItem, index) => ({
        requestMongoId: reqItem?._id ? String(reqItem._id) : null,
        requestId: reqItem.requestId,
        status: reqItem.manufacturerStage || reqItem.status,
        lotNumber: reqItem.lotNumber || {},
        rollbackCount: Number(
          reqItem?.caseInfos?.rollbackCounts?.machining || 0,
        ),
        queuePosition:
          reqItem.productionSchedule?.queuePosition != null
            ? reqItem.productionSchedule.queuePosition
            : index + 1,
        machiningQty:
          reqItem.productionSchedule?.machiningQty != null
            ? reqItem.productionSchedule.machiningQty
            : 1,
        estimatedShipYmd: reqItem.timeline?.estimatedShipYmd || null,
        scheduledShipPickup: reqItem.productionSchedule?.scheduledShipPickup,
        diameter: reqItem.productionSchedule?.diameter,
        diameterGroup: reqItem.productionSchedule?.diameterGroup,
        ncFile: reqItem.caseInfos?.ncFile
          ? {
              fileName: reqItem.caseInfos.ncFile.fileName,
              filePath: reqItem.caseInfos.ncFile.filePath,
              s3Key: reqItem.caseInfos.ncFile.s3Key,
              s3Bucket: reqItem.caseInfos.ncFile.s3Bucket,
            }
          : null,
        ncPreload: reqItem.productionSchedule?.ncPreload
          ? {
              status: reqItem.productionSchedule.ncPreload.status,
              machineId: reqItem.productionSchedule.ncPreload.machineId,
              updatedAt: reqItem.productionSchedule.ncPreload.updatedAt,
              error: reqItem.productionSchedule.ncPreload.error,
            }
          : null,
        machiningRecord: reqItem.productionSchedule?.machiningRecord
          ? {
              status: reqItem.productionSchedule.machiningRecord.status,
              startedAt: reqItem.productionSchedule.machiningRecord.startedAt,
              completedAt:
                reqItem.productionSchedule.machiningRecord.completedAt,
              durationSeconds:
                reqItem.productionSchedule.machiningRecord.durationSeconds,
              elapsedSeconds:
                reqItem.productionSchedule.machiningRecord.elapsedSeconds,
              lastTickAt: reqItem.productionSchedule.machiningRecord.lastTickAt,
              machineId: reqItem.productionSchedule.machiningRecord.machineId,
              jobId: reqItem.productionSchedule.machiningRecord.jobId,
            }
          : null,
        businessName:
          businessNameByAnchorId.get(
            String(reqItem?.businessAnchorId || "").trim(),
          ) || "",
        clinicName: reqItem.caseInfos?.clinicName,
        patientName: reqItem.caseInfos?.patientName,
        tooth: reqItem.caseInfos?.tooth,
        caseInfos: reqItem.caseInfos || null,
        rnd: reqItem?.rnd?.manufacturerHexRotation
          ? { manufacturerHexRotation: reqItem.rnd.manufacturerHexRotation }
          : null,
        shippingMode: reqItem?.shippingMode || null,
        finalShipping: reqItem?.finalShipping
          ? { mode: reqItem.finalShipping.mode || null }
          : null,
        originalShipping: reqItem?.originalShipping
          ? { mode: reqItem.originalShipping.mode || null }
          : null,
        source: reqItem?.source || null,
        requestCategory: reqItem?.requestCategory || null,
        fastMachiningRebalance:
          reqItem?.productionSchedule?.fastMachiningRebalance || null,
        totalLength:
          Number.isFinite(Number(reqItem?.caseInfos?.totalLength)) &&
          Number(reqItem.caseInfos.totalLength) > 0
            ? Number(reqItem.caseInfos.totalLength)
            : null,
      }));
    }

    const expressRebalanceAlert = await getLastExpressDeadlineRebalanceAlert();

    return res.status(200).json({
      success: true,
      data: queues,
      meta: {
        expressRebalanceAlert: expressRebalanceAlert || null,
      },
    });
  } catch (error) {
    console.error("Error in getProductionQueues:", error);
    return res.status(500).json({
      success: false,
      message: "생산 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

const inferDiameterGroup = (reqItem) => {
  const groupRaw = String(
    reqItem?.productionSchedule?.diameterGroup || "",
  ).trim();
  if (groupRaw) return groupRaw;
  const diameter = Number(reqItem?.productionSchedule?.diameter);
  if (Number.isFinite(diameter) && diameter > 0) {
    if (diameter <= 6) return "6";
    if (diameter <= 8) return "8";
    if (diameter <= 10) return "10";
    if (diameter <= 12) return "12";
    return "14";
  }
  return "";
};

export async function reassignProductionQueues(req, res) {
  try {
    const scope = await resolveManufacturerMachineScope(req);
    const result = await rebalanceProductionQueuesInternal({ req, scope });

    let expressRebalance = null;
    try {
      expressRebalance = await rebalanceExpressJobsForFourteenOClockDeadline({
        machineIds: scope.machineIds,
        actorUserId: req?.user?._id ? String(req.user._id) : null,
      });
    } catch (err) {
      console.warn("[reassignProductionQueues] express rebalance failed", {
        message: err?.message || String(err || ""),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        reassignedCount: result.reassignedCount,
        expressRebalance:
          expressRebalance && Array.isArray(expressRebalance.moved)
            ? {
                movedCount: expressRebalance.moved.length,
                summary: expressRebalance.summary || null,
              }
            : null,
      },
    });
  } catch (error) {
    console.error("Error in reassignProductionQueues:", error);
    return res.status(500).json({
      success: false,
      message: "생산 큐 재배정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getExpressDeadlineRebalanceAlert(req, res) {
  try {
    const alert = await getLastExpressDeadlineRebalanceAlert();
    return res.status(200).json({
      success: true,
      data: alert || null,
    });
  } catch (error) {
    console.error("Error in getExpressDeadlineRebalanceAlert:", error);
    return res.status(500).json({
      success: false,
      message: "빠른 가공 재배치 Alert 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMachiningPriorityRulesHandler(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: getMachiningPriorityRules(),
    });
  } catch (error) {
    console.error("Error in getMachiningPriorityRulesHandler:", error);
    return res.status(500).json({
      success: false,
      message: "가공 우선순위 룰 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * Next Up(대기) 의뢰를 다른 장비로 수동 이동.
 * - 가공중/완료 건은 거부
 * - 대상 장비 소재가 maxDiameter를 커버해야 함
 * - 장착 직경이 바뀌면 Esprit force 재생성(CAM/NC)
 */
export async function moveProductionQueueRequest(req, res) {
  try {
    const requestMongoId = String(
      req.body?.requestMongoId || req.body?.requestId || "",
    ).trim();
    const fromMachineId = String(req.body?.fromMachineId || "").trim();
    const toMachineId = String(req.body?.toMachineId || "").trim();

    if (!requestMongoId || !fromMachineId || !toMachineId) {
      return res.status(400).json({
        success: false,
        message: "requestMongoId, fromMachineId, toMachineId가 필요합니다.",
      });
    }
    if (fromMachineId === toMachineId) {
      return res.status(400).json({
        success: false,
        message: "같은 장비로는 이동할 수 없습니다.",
      });
    }

    const scope = await resolveManufacturerMachineScope(req);
    if (
      Array.isArray(scope.machineIds) &&
      scope.machineIds.length > 0 &&
      (!scope.machineIds.includes(fromMachineId) ||
        !scope.machineIds.includes(toMachineId))
    ) {
      return res.status(403).json({
        success: false,
        message: "소유하지 않은 장비로는 이동할 수 없습니다.",
      });
    }

    const idFilter = mongoose.isValidObjectId(requestMongoId)
      ? { $or: [{ _id: requestMongoId }, { requestId: requestMongoId }] }
      : { requestId: requestMongoId };

    const requestDoc = await Request.findOne({
      ...idFilter,
      manufacturerStage: { $in: MACHINING_ASSIGN_STAGE_SET },
      ...EXCLUDE_UNMACHINABLE_FILTER,
      ...scope.requestFilter,
    }).populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt machineId",
    });

    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "이동할 가공 대기 의뢰를 찾을 수 없습니다.",
      });
    }

    if (isMachiningInProgress(requestDoc) || isMachiningCompleted(requestDoc)) {
      return res.status(409).json({
        success: false,
        message: "가공 중이거나 완료된 건은 이동할 수 없습니다.",
      });
    }

    const currentMachineId = String(
      requestDoc?.productionSchedule?.assignedMachine ||
        requestDoc?.assignedMachine ||
        "",
    ).trim();
    if (currentMachineId && currentMachineId !== fromMachineId) {
      return res.status(409).json({
        success: false,
        message: `현재 ${currentMachineId}에 배정된 건입니다. 화면을 새로고침 후 다시 시도하세요.`,
      });
    }

    const [toCnc, toMachineFlag, fromDiaSource] = await Promise.all([
      CncMachine.findOne({ machineId: toMachineId, status: "active" })
        .select({ machineId: 1, maxModelDiameterGroups: 1, currentMaterial: 1 })
        .lean(),
      Machine.findOne({ uid: toMachineId })
        .select({ uid: 1, allowRequestAssign: 1 })
        .lean(),
      CncMachine.findOne({ machineId: fromMachineId })
        .select({ currentMaterial: 1 })
        .lean(),
    ]);

    if (!toCnc) {
      return res.status(404).json({
        success: false,
        message: "대상 장비를 찾을 수 없습니다.",
      });
    }
    if (toMachineFlag?.allowRequestAssign === false) {
      return res.status(409).json({
        success: false,
        message: "대상 장비는 배정이 꺼져 있습니다.",
      });
    }

    if (
      !isRequestDiameterCompatibleWithMachineMaterial({
        requestDoc,
        machineMeta: toCnc,
      })
    ) {
      const maxD = Number(requestDoc?.caseInfos?.maxDiameter);
      const toDia = inferCurrentMaterialDiameter(toCnc);
      return res.status(409).json({
        success: false,
        message: `대상 장비 소재(Ø${
          Number.isFinite(toDia) ? toDia : "?"
        })가 의뢰 maxDiameter(${
          Number.isFinite(maxD) ? maxD : "?"
        })를 커버하지 않습니다.`,
      });
    }

    const fromDia = Number.isFinite(
      Number(requestDoc?.productionSchedule?.diameter),
    )
      ? Number(requestDoc.productionSchedule.diameter)
      : inferCurrentMaterialDiameter(fromDiaSource);
    const toDia = inferCurrentMaterialDiameter(toCnc);
    const toGroup = Number.isFinite(toDia)
      ? inferDiameterGroupFromValue(toDia)
      : "";
    const diameterChanged =
      Number.isFinite(fromDia) &&
      Number.isFinite(toDia) &&
      Math.abs(fromDia - toDia) > 1e-6;

    const nowMs = Date.now();
    const moveMeta = {
      at: new Date(nowMs),
      fromMachineId,
      toMachineId,
      fromDiameter: Number.isFinite(fromDia) ? fromDia : null,
      toDiameter: Number.isFinite(toDia) ? toDia : null,
      reason: "manual_next_up_move",
      diameterChanged,
      ncCleared: true,
      espritRetriggered: true,
    };

    const $set = {
      "productionSchedule.assignedMachine": toMachineId,
      "productionSchedule.ncPreload": {
        status: "GENERATING",
        updatedAt: new Date(),
      },
      // express 「빠른 가공 재배치」뱃지와 분리 (manualMachineMove만 기록)
      "productionSchedule.manualMachineMove": moveMeta,
      assignedMachine: toMachineId,
    };
    if (Number.isFinite(toDia) && toDia > 0) {
      $set["productionSchedule.diameter"] = toDia;
    }
    if (toGroup) {
      $set["productionSchedule.diameterGroup"] = toGroup;
    }

    // 기존 NC를 반드시 제거한 뒤 CAM 재생성 — 이전 장비 직경 NC 재사용 여지 차단
    await Request.updateOne(
      { _id: requestDoc._id },
      {
        $set,
        $unset: { "caseInfos.ncFile": 1 },
      },
    );

    await placeRequestAtPolicyQueuePosition({
      machineId: toMachineId,
      requestMongoId: requestDoc._id,
      anodizingEnabled: requestDoc?.caseInfos?.anodizingEnabled,
      shippingMode: resolveEffectiveShippingMode(requestDoc),
      RequestModel: Request,
    });

    const remainingOnFrom = await Request.find({
      manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
      ...EXCLUDE_UNMACHINABLE_FILTER,
      "productionSchedule.assignedMachine": fromMachineId,
      _id: { $ne: requestDoc._id },
    })
      .select(
        "_id productionSchedule caseInfos shippingMode finalShipping originalShipping",
      )
      .populate({
        path: "productionSchedule.machiningRecord",
        select: "status startedAt completedAt",
      });

    const orderedFrom = [...remainingOnFrom].sort(compareMachiningQueueOrder);
    if (orderedFrom.length > 0) {
      await Promise.all(
        orderedFrom.map((item, idx) =>
          Request.updateOne(
            { _id: item._id },
            { $set: { "productionSchedule.queuePosition": idx + 1 } },
          ),
        ),
      );
    }

    let espritRetriggered = false;
    const fresh = await Request.findById(requestDoc._id).lean();
    if (fresh) {
      await enqueueApproval({
        taskType: "REQUEST_STAGE_APPROVED",
        request: fresh,
        actorUserId: req?.user?._id ? String(req.user._id) : null,
        forceReprocess: true,
      });
      espritRetriggered = true;
    }

    return res.status(200).json({
      success: true,
      data: {
        requestId: String(requestDoc.requestId || ""),
        requestMongoId: String(requestDoc._id || ""),
        fromMachineId,
        toMachineId,
        fromDiameter: Number.isFinite(fromDia) ? fromDia : null,
        toDiameter: Number.isFinite(toDia) ? toDia : null,
        diameterChanged,
        ncCleared: true,
        espritRetriggered,
      },
    });
  } catch (error) {
    console.error("Error in moveProductionQueueRequest:", error);
    return res.status(500).json({
      success: false,
      message: "생산 큐 이동 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function applyProductionQueueBatchForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const orderRaw = req.body?.order;
    const order = Array.isArray(orderRaw)
      ? orderRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : null;

    const qtyRaw = req.body?.qtyUpdates;
    const qtyUpdates = Array.isArray(qtyRaw)
      ? qtyRaw
          .map((u) => {
            if (!u) return null;
            const requestId = String(u.requestId || u.id || "").trim();
            if (!requestId) return null;
            const qty = Math.max(1, Number(u.qty ?? 1) || 1);
            return { requestId, qty };
          })
          .filter(Boolean)
      : [];

    const delRaw = req.body?.deleteRequestIds;
    const deleteRequestIds = Array.isArray(delRaw)
      ? delRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    const list = await Request.find({
      manufacturerStage: { $in: MACHINING_ASSIGN_STAGE_SET },
      ...EXCLUDE_UNMACHINABLE_FILTER,
      "productionSchedule.assignedMachine": mid,
    }).select("_id requestId productionSchedule manufacturerStage");

    const byRequestId = new Map();
    for (const r of list) {
      const rid = String(r?.requestId || "").trim();
      if (rid) byRequestId.set(rid, r);
    }

    const uniqueDel = Array.from(new Set(deleteRequestIds));
    for (const rid of uniqueDel) {
      if (!rid) continue;
      await rollbackRequestToCamByRequestId(rid);
    }

    if (qtyUpdates.length > 0) {
      const ops = [];
      for (const u of qtyUpdates) {
        if (!u?.requestId) continue;
        ops.push({
          updateOne: {
            filter: { requestId: u.requestId },
            update: { $set: { "productionSchedule.machiningQty": u.qty } },
          },
        });
      }
      if (ops.length > 0) {
        await Request.bulkWrite(ops);
      }
    }

    if (order && order.length > 0) {
      const current = Array.from(byRequestId.keys());
      const delSet = new Set(uniqueDel);
      const kept = current.filter((rid) => !delSet.has(rid));

      const nextOrder = [];
      const seen = new Set();
      for (const rid of order) {
        if (!rid) continue;
        if (delSet.has(rid)) continue;
        if (!byRequestId.has(rid)) continue;
        if (seen.has(rid)) continue;
        seen.add(rid);
        nextOrder.push(rid);
      }
      for (const rid of kept) {
        if (seen.has(rid)) continue;
        seen.add(rid);
        nextOrder.push(rid);
      }

      const ops = nextOrder.map((rid, idx) => ({
        updateOne: {
          filter: { requestId: rid },
          update: {
            $set: {
              "productionSchedule.queuePosition": idx + 1,
              "productionSchedule.assignedMachine": mid,
              assignedMachine: mid,
            },
          },
        },
      }));
      if (ops.length > 0) {
        await Request.bulkWrite(ops);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in applyProductionQueueBatchForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "생산 큐 배치 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
