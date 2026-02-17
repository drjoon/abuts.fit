import {
  Request,
  getAllProductionQueues,
  rollbackRequestToCamByRequestId,
} from "./shared.js";

export async function getProductionQueues(req, res) {
  try {
    const requests = await Request.find({
      status: { $in: ["의뢰", "CAM", "생산", "가공"] },
    })
      .select("requestId status productionSchedule caseInfos lotNumber")
      .populate({
        path: "productionSchedule.machiningRecord",
        select:
          "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
      });

    const queues = getAllProductionQueues(requests);

    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((reqItem, index) => ({
        requestId: reqItem.requestId,
        status: reqItem.status,
        lotNumber: reqItem.lotNumber || {},
        queuePosition:
          reqItem.productionSchedule?.queuePosition != null
            ? reqItem.productionSchedule.queuePosition
            : index + 1,
        machiningQty:
          reqItem.productionSchedule?.machiningQty != null
            ? reqItem.productionSchedule.machiningQty
            : 1,
        estimatedDelivery: reqItem.productionSchedule?.estimatedDelivery,
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

    res.status(200).json({
      success: true,
      data: queues,
    });
  } catch (error) {
    console.error("Error in getProductionQueues:", error);
    res.status(500).json({
      success: false,
      message: "생산 큐 조회 중 오류가 발생했습니다.",
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
      status: { $in: ["의뢰", "CAM", "생산", "가공"] },
      "productionSchedule.assignedMachine": mid,
    }).select("_id requestId productionSchedule status manufacturerStage");

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
