import {
  BRIDGE_BASE,
  withBridgeHeaders,
  CncMachine,
  Machine,
} from "./shared.js";

export async function getMachines(req, res) {
  try {
    const machines = await CncMachine.find({ status: "active" }).sort({
      machineId: 1,
    });

    res.status(200).json({
      success: true,
      data: machines,
    });
  } catch (error) {
    console.error("Error in getMachines:", error);
    res.status(500).json({
      success: false,
      message: "장비 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMachineFlagsForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const machine = await Machine.findOne({ uid: mid })
      .select({
        allowAutoMachining: 1,
        allowJobStart: 1,
        allowProgramDelete: 1,
      })
      .lean()
      .catch(() => null);

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        allowAutoMachining: machine?.allowAutoMachining === true,
        allowJobStart: machine?.allowJobStart !== false,
        allowProgramDelete: machine?.allowProgramDelete === true,
      },
    });
  } catch (error) {
    console.error("Error in getMachineFlagsForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 장비 플래그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getBridgeActiveProgram(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/programs/active`;

    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));

    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 활성 프로그램 조회 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({ success: true, data: body?.data ?? body });
  } catch (error) {
    console.error("Error in getBridgeActiveProgram:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 활성 프로그램 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
