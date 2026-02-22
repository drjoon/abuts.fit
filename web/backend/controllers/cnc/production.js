import {
  Request,
  getAllProductionQueues,
  rollbackRequestToCamByRequestId,
} from "./shared.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";

export async function getProductionQueues(req, res) {
  try {
    const requests = await Request.find({
      manufacturerStage: { $in: ["의뢰", "CAM", "가공"] },
    })
      .select(
        "requestId status manufacturerStage productionSchedule caseInfos lotNumber timeline",
      )
      .populate({
        path: "productionSchedule.machiningRecord",
        select:
          "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
      });

    const queues = getAllProductionQueues(requests);

    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((reqItem, index) => ({
        requestId: reqItem.requestId,
        status: reqItem.manufacturerStage || reqItem.status,
        lotNumber: reqItem.lotNumber || {},
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
    const requests = await Request.find({
      manufacturerStage: { $in: ["CAM", "가공"] },
    }).select(
      "_id requestId manufacturerStage productionSchedule assignedMachine caseInfos",
    );

    const cncMachines = await CncMachine.find({ status: "active" })
      .select({ machineId: 1, maxModelDiameterGroups: 1 })
      .lean();

    const machineUids = cncMachines
      .map((m) => String(m?.machineId || "").trim())
      .filter(Boolean);

    const machineFlags = await Machine.find({ uid: { $in: machineUids } })
      .select({ uid: 1, allowRequestAssign: 1 })
      .lean();

    const allowAssignSet = new Set(
      machineFlags
        .filter((m) => m?.allowRequestAssign !== false)
        .map((m) => String(m?.uid || "").trim())
        .filter(Boolean),
    );

    const machinesByGroup = new Map();
    for (const m of cncMachines) {
      const uid = String(m?.machineId || "").trim();
      if (!uid || !allowAssignSet.has(uid)) continue;
      const groups = Array.isArray(m?.maxModelDiameterGroups)
        ? m.maxModelDiameterGroups
        : [];
      for (const g of groups) {
        const key = String(g || "").trim();
        if (!key) continue;
        if (!machinesByGroup.has(key)) machinesByGroup.set(key, []);
        machinesByGroup.get(key).push(uid);
      }
    }

    const queueCounts = new Map();
    for (const uid of allowAssignSet) {
      queueCounts.set(uid, 0);
    }
    for (const reqItem of requests) {
      const uid = String(
        reqItem?.productionSchedule?.assignedMachine || "",
      ).trim();
      if (uid && queueCounts.has(uid)) {
        queueCounts.set(uid, (queueCounts.get(uid) || 0) + 1);
      }
    }

    const assignmentsByMachine = new Map();
    const ops = [];
    for (const reqItem of requests) {
      const group = inferDiameterGroup(reqItem);
      const candidates = machinesByGroup.get(group) || [];
      if (!candidates.length) continue;

      const sorted = [...candidates].sort((a, b) => {
        const ac = queueCounts.get(a) || 0;
        const bc = queueCounts.get(b) || 0;
        if (ac !== bc) return ac - bc;
        return String(a).localeCompare(String(b));
      });
      const selected = sorted[0];
      queueCounts.set(selected, (queueCounts.get(selected) || 0) + 1);

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

    return res.status(200).json({
      success: true,
      data: { reassignedCount: ops.length },
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
      manufacturerStage: { $in: ["의뢰", "CAM", "가공"] },
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
