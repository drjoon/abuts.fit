import CncMachine from "../../models/cncMachine.model.js";
import { buildToolingSummary } from "../../controllers/cnc/tooling.js";

export async function getManagementStatus(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const machines = await CncMachine.find({})
      .select({
        name: 1,
        machineId: 1,
        status: 1,
        currentMaterial: 1,
        scheduledMaterialChange: 1,
        "uiSnapshot.toolLifeRows": 1,
        tooling: 1,
      })
      .lean();

    // 소재 요약
    const materialGroups = {};
    let scheduledChanges = 0;
    const materialMachines = machines.map((m) => {
      const dg = m.currentMaterial?.diameterGroup || null;
      if (dg) materialGroups[dg] = (materialGroups[dg] || 0) + 1;
      const hasScheduled = !!m.scheduledMaterialChange?.targetTime;
      if (hasScheduled) scheduledChanges++;
      return {
        name: m.name,
        diameterGroup: dg,
        remainingLength: m.currentMaterial?.remainingLength ?? null,
        materialType: m.currentMaterial?.materialType || null,
        scheduled: hasScheduled
          ? {
              newDiameterGroup: m.scheduledMaterialChange.newDiameterGroup,
              targetTime: m.scheduledMaterialChange.targetTime,
            }
          : null,
      };
    });

    // 공구 요약
    let totalToolWarning = 0;
    let totalToolAlarm = 0;
    const toolsMachines = machines.map((m) => {
      const summary = buildToolingSummary({
        toolLifeRows: m.uiSnapshot?.toolLifeRows || [],
        tooling: m.tooling,
      });
      totalToolWarning += summary.warningCount;
      totalToolAlarm += summary.alarmCount;
      return {
        name: m.name,
        machineId: m.machineId,
        totalTools: summary.totalTools,
        warningCount: summary.warningCount,
        alarmCount: summary.alarmCount,
        alertLevel: summary.alertLevel,
        dueTools: summary.dueTools || [],
      };
    });

    // 장비 요약
    const byStatus = { active: 0, maintenance: 0, inactive: 0 };
    const machineList = machines.map((m) => {
      const st = m.status || "active";
      byStatus[st] = (byStatus[st] || 0) + 1;
      return { name: m.name, machineId: m.machineId, status: st };
    });

    const status = {
      material: {
        hasIssue: scheduledChanges > 0,
        totalCount: machines.length,
        groups: materialGroups,
        scheduledChanges,
        machines: materialMachines,
      },
      tools: {
        hasIssue: totalToolAlarm > 0 || totalToolWarning > 0,
        warningCount: totalToolWarning,
        alarmCount: totalToolAlarm,
        machines: toolsMachines,
      },
      machines: {
        hasIssue: byStatus.maintenance > 0 || byStatus.inactive > 0,
        totalCount: machines.length,
        activeCount: byStatus.active || 0,
        maintenanceCount: byStatus.maintenance || 0,
        inactiveCount: byStatus.inactive || 0,
        list: machineList,
      },
    };

    return res.status(200).json({ success: true, data: { status } });
  } catch (error) {
    console.error("관리 상태 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "관리 상태 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export default {
  getManagementStatus,
};
