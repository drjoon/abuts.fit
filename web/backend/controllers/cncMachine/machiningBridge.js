import Request from "../../models/request.model.js";

export async function recordMachiningTickForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining tick 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function recordMachiningCompleteForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const requestId = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";

    if (requestId) {
      await Request.updateOne(
        { requestId },
        {
          $set: {
            "productionSchedule.actualMachiningComplete": new Date(),
          },
        },
      );
    }

    await CncEvent.create({
      requestId: requestId || null,
      machineId: mid,
      sourceStep: "machining",
      status: "success",
      eventType: "MACHINING_COMPLETE",
      message: "OK",
      metadata: { jobId: jobId || null },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining complete 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function recordMachiningFailForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const requestId = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";
    const alarms = Array.isArray(req.body?.alarms) ? req.body.alarms : [];

    await CncEvent.create({
      requestId: requestId || null,
      machineId: mid,
      sourceStep: "machining",
      status: "failed",
      eventType: "MACHINING_FAILED",
      message: reason || "FAILED",
      metadata: { jobId: jobId || null, alarms },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining fail 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
