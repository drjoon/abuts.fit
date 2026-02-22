import CncMachine from "../../models/cncMachine.model.js";

export async function getManagementStatus(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerOrganization = String(user.organization || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    // CNC 머신 상태 조회
    const machines = await CncMachine.find({
      manufacturerOrganization,
    })
      .select({
        name: 1,
        status: 1,
        lastStatusUpdate: 1,
        alarmMessage: 1,
      })
      .lean();

    // 장비 상태 판단
    const machineIssues = machines.filter(
      (m) => m.status === "alarm" || m.status === "error",
    );
    const machinesStatus = {
      hasIssue: machineIssues.length > 0,
      status: machineIssues.length > 0 ? `${machineIssues.length}대 알람` : "이상 없음",
    };

    // 소재, 공구, 제품 관리는 기본값으로 설정
    const status = {
      material: {
        hasIssue: false,
        status: "이상 없음",
      },
      tools: {
        hasIssue: false,
        status: "이상 없음",
      },
      machines: machinesStatus,
      products: {
        hasIssue: false,
        status: "이상 없음",
      },
    };

    return res.status(200).json({
      success: true,
      data: {
        status,
      },
    });
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
