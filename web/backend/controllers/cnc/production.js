// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/backend/controllers/requests/machiningPriorityRules.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/ExpressRebalanceAlertModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningPriorityRulesModal.tsx
import {
  Request,
  getAllProductionQueues,
  rollbackRequestToCamByRequestId,
} from "./shared.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import BridgeSetting from "../../models/bridgeSetting.model.js";
import { buildManufacturerOrgScopeFilter } from "../requests/utils.js";
import {
  MACHINING_ASSIGN_STAGE_SET,
  MACHINING_QUEUE_STAGE_SET,
  EXCLUDE_UNMACHINABLE_FILTER,
  normalizeDiameterGroupValue,
  inferMaterialDiameterGroup,
  inferRequestDiameterGroup,
  isMachiningInProgress,
  isMachiningCompleted,
  getMachiningLoadWeight,
} from "./distribution.utils.js";
import { compareMachiningQueueOrder } from "../requests/production.utils.js";
import {
  getLastExpressDeadlineRebalanceAlert,
  rebalanceExpressJobsForFourteenOClockDeadline,
} from "../requests/expressDeadlineRebalance.utils.js";
import { getMachiningPriorityRules } from "../requests/machiningPriorityRules.js";

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

  const machinesByGroup = new Map();
  for (const m of cncMachines) {
    const uid = String(m?.machineId || "").trim();
    if (!uid || !eligibleMachineSet.has(uid)) continue;
    const materialGroup = inferMaterialDiameterGroup(m);
    const groups = materialGroup
      ? [materialGroup]
      : Array.isArray(m?.maxModelDiameterGroups)
        ? m.maxModelDiameterGroups
            .map((g) => normalizeDiameterGroupValue(g))
            .filter(Boolean)
        : [];
    for (const g of groups) {
      const key = normalizeDiameterGroupValue(g);
      if (!key) continue;
      if (targetGroupSet.size > 0 && !targetGroupSet.has(key)) continue;
      if (!machinesByGroup.has(key)) machinesByGroup.set(key, []);
      machinesByGroup.get(key).push(uid);
    }
  }

  const queueCounts = new Map();
  for (const uid of eligibleMachineSet) {
    queueCounts.set(uid, 0);
  }

  const assignmentsByMachine = new Map();
  const ops = [];
  const sortedRequests = [...requests].sort(compareMachiningQueueOrder);

  for (const reqItem of sortedRequests) {
    const group = inferRequestDiameterGroup(reqItem);
    const rawCandidates = machinesByGroup.get(group) || [];
    const candidates = Array.from(
      new Set(
        rawCandidates
          .map((uid) => String(uid || "").trim())
          .filter((uid) => uid && queueCounts.has(uid)),
      ),
    ).sort((a, b) => String(a).localeCompare(String(b)));
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

    let selected = null;
    let minCount = Infinity;
    const tied = [];

    for (const uid of candidates) {
      const count = queueCounts.get(uid) || 0;
      if (count < minCount) {
        minCount = count;
        tied.length = 0;
        tied.push(uid);
      } else if (count === minCount) {
        tied.push(uid);
      }
    }

    if (tied.length === 1) {
      selected = tied[0];
    } else if (tied.length > 1) {
      // queueCounts가 동일한 경우 알파벳 순으로 선택 (안정적인 분배)
      tied.sort((a, b) => a.localeCompare(b));
      selected = tied[0];
    }

    if (!selected) continue;
    const load = getMachiningLoadWeight(reqItem);
    queueCounts.set(selected, (queueCounts.get(selected) || 0) + load);

    if (!assignmentsByMachine.has(selected)) {
      assignmentsByMachine.set(selected, []);
    }
    assignmentsByMachine.get(selected).push(reqItem);
  }

  for (const [uid, list] of assignmentsByMachine.entries()) {
    list.forEach((reqItem, idx) => {
      ops.push({
        updateOne: {
          filter: { _id: reqItem._id },
          update: {
            $set: {
              "productionSchedule.assignedMachine": uid,
              "productionSchedule.queuePosition": idx + 1,
              assignedMachine: uid,
            },
          },
        },
      });
    });
  }

  if (ops.length > 0) {
    await Request.bulkWrite(ops);
  }

  return {
    reassignedCount: ops.length,
    eligibleMachineIds: Array.from(eligibleMachineSet),
  };
}

export async function getProductionQueues(req, res) {
  try {
    const scope = await resolveManufacturerMachineScope(req);

    const queueSelect = [
      "requestId",
      "status",
      "manufacturerStage",
      "productionSchedule",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.rollbackCounts.machining",
      "caseInfos.ncFile",
      "caseInfos.anodizingEnabled",
      "caseInfos.totalLength",
      "caseInfos.maxDiameter",
      "shippingMode",
      "finalShipping.mode",
      "originalShipping.mode",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.retentionGroove",
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
        clinicName: reqItem.caseInfos?.clinicName,
        patientName: reqItem.caseInfos?.patientName,
        tooth: reqItem.caseInfos?.tooth,
        caseInfos: reqItem.caseInfos || null,
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
    return "12";
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
