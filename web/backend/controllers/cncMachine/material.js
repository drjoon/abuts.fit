import {
  BRIDGE_BASE,
  withBridgeHeaders,
  getOrCreateCncMachine,
  recalculateQueueOnMaterialChange,
  toNumberOrNull,
  Machine,
  Request,
  CAM_RETRY_BATCH_LIMIT,
} from "./shared.js";

async function fetchBridgeMachineStatusMap() {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.BRIDGE_STATUS_TIMEOUT_MS || 2500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/status`, {
      method: "GET",
      headers: withBridgeHeaders(),
      signal: controller.signal,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) return null;
    const list = Array.isArray(body?.data) ? body.data : [];
    const map = new Map();
    for (const item of list) {
      const id = String(item?.machineId || item?.id || "").trim();
      if (!id) continue;
      map.set(id, item);
    }
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function isBridgeOnlineStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return ["OK", "ONLINE", "RUN", "RUNNING", "IDLE", "STOP"].includes(s);
}

async function syncMachineMaterialToBridge(machineId, material) {
  try {
    const mid = String(machineId || "").trim();
    if (!mid) return;
    const dia = Number(material?.diameter);
    if (!Number.isFinite(dia) || dia <= 0) return;

    await fetch(`${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/material`, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        machineId: mid,
        materialType: String(material?.materialType || "").trim(),
        heatNo: String(material?.heatNo || "").trim(),
        diameter: dia,
        diameterGroup: String(material?.diameterGroup || "").trim(),
        remainingLength:
          typeof material?.remainingLength === "number" && Number.isFinite(material.remainingLength)
            ? material.remainingLength
            : null,
      }),
    });
  } catch {
    // ignore
  }
}

export async function updateMaterialRemaining(req, res) {
  try {
    const { machineId } = req.params;
    const { remainingLength } = req.body;

    if (typeof remainingLength !== "number" || !Number.isFinite(remainingLength)) {
      return res.status(400).json({
        success: false,
        message: "유효한 remainingLength 값이 필요합니다.",
      });
    }

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    machine.currentMaterial = machine.currentMaterial || {
      diameter: 8,
      diameterGroup: "8",
    };
    machine.currentMaterial.remainingLength = remainingLength;
    await machine.save();

    syncMachineMaterialToBridge(machineId, machine.currentMaterial);

    return res.status(200).json({
      success: true,
      data: machine,
    });
  } catch (error) {
    console.error("Error in updateMaterialRemaining:", error);
    return res.status(500).json({
      success: false,
      message: "소재 잔여량 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateMachineMaterial(req, res) {
  try {
    const { machineId } = req.params;
    const {
      diameter,
      diameterGroup,
      materialType,
      heatNo,
      remainingLength,
      maxModelDiameterGroups,
    } = req.body;

    const rawGroup = String(diameterGroup || "").trim();
    const normalizedGroup = rawGroup.replace(/mm$/i, "");

    if (!normalizedGroup || !["6", "8", "10", "10+"].includes(normalizedGroup)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const normalizedMaxGroups = Array.isArray(maxModelDiameterGroups)
      ? maxModelDiameterGroups
          .map((v) => String(v || "").trim().replace(/mm$/i, ""))
          .filter(Boolean)
      : [];

    if (normalizedMaxGroups.length > 0) {
      const uniq = Array.from(new Set(normalizedMaxGroups));
      const ok = uniq.every((g) => ["6", "8", "10", "10+"].includes(g));
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 최대 직경 그룹입니다.",
        });
      }
      machine.maxModelDiameterGroups = uniq;
    } else {
      machine.maxModelDiameterGroups = [normalizedGroup];
    }

    const nextMaterial = {
      materialType: String(materialType || "").trim(),
      heatNo: String(heatNo || "").trim(),
      diameter: diameter || parseInt(normalizedGroup, 10),
      diameterGroup: normalizedGroup,
      setAt: new Date(),
      setBy: req.user?._id,
    };
    if (typeof remainingLength === "number" && Number.isFinite(remainingLength)) {
      nextMaterial.remainingLength = remainingLength;
    }
    machine.currentMaterial = nextMaterial;
    await machine.save();

    syncMachineMaterialToBridge(machineId, machine.currentMaterial);

    const assignedCount = await recalculateQueueOnMaterialChange(machineId, normalizedGroup);

    try {
      const matDia = toNumberOrNull(machine.currentMaterial?.diameter);
      if (matDia) {
        const machineMeta = await Machine.findOne({
          $or: [{ uid: machineId }, { name: machineId }],
        })
          .lean()
          .catch(() => null);
        if (machineMeta?.allowAutoMachining !== true) {
          throw new Error("allowAutoMachining is false");
        }
        if (machineMeta?.allowJobStart === false) {
          throw new Error("allowJobStart is false");
        }

        const statusMap = await fetchBridgeMachineStatusMap();
        if (statusMap) {
          const st = statusMap.get(machineId);
          if (!st || st.success !== true || !isBridgeOnlineStatus(st.status)) {
            throw new Error("bridge status is not online");
          }
        }

        const pending = await Request.find({
          manufacturerStage: "CAM",
          "caseInfos.reviewByStage.cam.status": "PENDING",
          "productionSchedule.diameter": matDia,
          $or: [
            { "productionSchedule.assignedMachine": { $exists: false } },
            { "productionSchedule.assignedMachine": null },
            { "productionSchedule.assignedMachine": "" },
          ],
        })
          .limit(CAM_RETRY_BATCH_LIMIT)
          .exec();

        let baseQueueLen = await Request.countDocuments({
          status: { $in: ["의뢰", "CAM", "생산"] },
          "productionSchedule.assignedMachine": machineId,
        });

        for (const reqItem of pending) {
          reqItem.productionSchedule = reqItem.productionSchedule || {};
          reqItem.productionSchedule.assignedMachine = machineId;
          baseQueueLen += 1;
          reqItem.productionSchedule.queuePosition = baseQueueLen;
          await reqItem.save();
        }
      }
    } catch (e) {
      console.warn("[updateMachineMaterial] CAM retry skipped", {
        machineId,
        error: String(e?.message || e),
      });
    }

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 세팅이 ${diameterGroup}mm로 변경되었습니다.`,
      data: {
        machine,
        assignedCount,
      },
    });
  } catch (error) {
    console.error("Error in updateMachineMaterial:", error);
    res.status(500).json({
      success: false,
      message: "소재 세팅 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function scheduleMaterialChange(req, res) {
  try {
    const { machineId } = req.params;
    const { targetTime, newDiameter, newDiameterGroup, notes } = req.body;

    if (!targetTime || !newDiameterGroup) {
      return res.status(400).json({
        success: false,
        message: "목표 시각과 직경 그룹은 필수입니다.",
      });
    }

    if (!["6", "8", "10", "10+"].includes(newDiameterGroup)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = {
      targetTime: new Date(targetTime),
      newDiameter: newDiameter || parseInt(newDiameterGroup, 10),
      newDiameterGroup,
      scheduledBy: req.user?._id,
      scheduledAt: new Date(),
      notes: notes || "",
    };
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체가 예약되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in scheduleMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function cancelScheduledMaterialChange(req, res) {
  try {
    const { machineId } = req.params;

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = undefined;
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체 예약이 취소되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in cancelScheduledMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
