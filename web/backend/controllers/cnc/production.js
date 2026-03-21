import {
  Request,
  getAllProductionQueues,
  rollbackRequestToCamByRequestId,
} from "./shared.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import BridgeSetting from "../../models/bridgeSetting.model.js";
import {
  MACHINING_ASSIGN_STAGE_SET,
  MACHINING_QUEUE_STAGE_SET,
  normalizeDiameterGroupValue,
  inferMaterialDiameterGroup,
  inferRequestDiameterGroup,
  isMachiningInProgress,
  isMachiningCompleted,
  getMachiningLoadWeight,
} from "./distribution.utils.js";

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

  const ownedMachines = await Machine.find(machineFilter)
    .select({ uid: 1 })
    .lean();
  const machineIds = ownedMachines
    .map((m) => String(m?.uid || "").trim())
    .filter(Boolean);

  return {
    requestFilter: {},
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
  const sortedRequests = [...requests].sort((a, b) => {
    const aRunning = isMachiningInProgress(a);
    const bRunning = isMachiningInProgress(b);
    if (aRunning !== bRunning) return aRunning ? -1 : 1;

    const aPos = Number(a?.productionSchedule?.queuePosition ?? 0);
    const bPos = Number(b?.productionSchedule?.queuePosition ?? 0);
    const aPosOk = Number.isFinite(aPos) && aPos > 0;
    const bPosOk = Number.isFinite(bPos) && bPos > 0;
    if (aPosOk && bPosOk && aPos !== bPos) return aPos - bPos;
    if (aPosOk !== bPosOk) return aPosOk ? -1 : 1;

    const aTime = a.productionSchedule?.scheduledShipPickup || new Date(0);
    const bTime = b.productionSchedule?.scheduledShipPickup || new Date(0);
    const diff = aTime - bTime;
    if (diff !== 0) return diff;

    return String(a?.requestId || "").localeCompare(String(b?.requestId || ""));
  });

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

    console.log("[getProductionQueues] scope", {
      role: req?.user?.role,
      userId: req?.user?._id ? String(req.user._id) : null,
      businessId: req?.user?.businessId ? String(req.user.businessId) : null,
      requestFilter: scope.requestFilter,
      machineIds: scope.machineIds,
    });

    let requests = await Request.find({
      manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
      ...scope.requestFilter,
    })
      .select(
        "requestId status manufacturerStage productionSchedule caseInfos lotNumber timeline caManufacturer",
      )
      .populate({
        path: "productionSchedule.machiningRecord",
        select:
          "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
      });

    console.log("[getProductionQueues] found requests", {
      count: requests.length,
      samples: requests.slice(0, 5).map((r) => ({
        requestId: r.requestId,
        stage: r.manufacturerStage,
        caManufacturer: r.caManufacturer ? String(r.caManufacturer) : null,
        assignedMachine: r.productionSchedule?.assignedMachine || null,
      })),
    });

    let queues = getAllProductionQueues(requests);

    console.log("[getProductionQueues] queues built", {
      machineIds: Object.keys(queues),
      counts: Object.fromEntries(
        Object.entries(queues).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.length : 0,
        ]),
      ),
    });

    const unassignedCount = Array.isArray(queues.unassigned)
      ? queues.unassigned.length
      : 0;

    if (unassignedCount > 0) {
      const rebalance = await rebalanceProductionQueuesInternal({ req, scope });

      console.log("[getProductionQueues] auto-rebalanced", {
        unassignedCount,
        reassignedCount: rebalance.reassignedCount,
        eligibleMachineIds: rebalance.eligibleMachineIds,
      });

      requests = await Request.find({
        manufacturerStage: { $in: MACHINING_QUEUE_STAGE_SET },
        ...scope.requestFilter,
      })
        .select(
          "requestId status manufacturerStage productionSchedule caseInfos lotNumber timeline caManufacturer",
        )
        .populate({
          path: "productionSchedule.machiningRecord",
          select:
            "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
        });

      queues = getAllProductionQueues(requests);

      console.log("[getProductionQueues] queues rebuilt after rebalance", {
        machineIds: Object.keys(queues),
        counts: Object.fromEntries(
          Object.entries(queues).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.length : 0,
          ]),
        ),
      });
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
      }));
    }

    return res.status(200).json({
      success: true,
      data: queues,
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

    return res.status(200).json({
      success: true,
      data: { reassignedCount: result.reassignedCount },
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
