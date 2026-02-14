import Request from "../../models/request.model.js";
import CncEvent from "../../models/cncEvent.model.js";
import { getIO } from "../../socket.js";
import { applyStatusMapping } from "../request/utils.js";

export async function recordMachiningTickForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const requestId = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const phase = req.body?.phase ? String(req.body.phase).trim() : "";
    const percentRaw = req.body?.percent;
    const percent = Number.isFinite(Number(percentRaw))
      ? Math.max(0, Math.min(100, Number(percentRaw)))
      : null;

    if (requestId) {
      const now = new Date();
      const existing = await Request.findOne({ requestId })
        .select({ productionSchedule: 1, requestId: 1 })
        .lean();

      const startedAtRaw =
        existing?.productionSchedule?.machiningProgress?.startedAt;
      const startedAt = startedAtRaw ? new Date(startedAtRaw) : now;
      const elapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - startedAt.getTime()) / 1000),
      );

      const update = {
        $set: {
          "productionSchedule.machiningProgress": {
            machineId: mid,
            jobId: jobId || null,
            phase: phase || null,
            percent: percent == null ? null : percent,
            startedAt,
            lastTickAt: now,
            elapsedSeconds,
          },
        },
      };

      if (!existing?.productionSchedule?.actualMachiningStart) {
        update.$set["productionSchedule.actualMachiningStart"] = startedAt;
      }

      await Request.updateOne({ requestId }, update);

      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        requestId,
        phase: phase || null,
        percent: percent == null ? null : percent,
        startedAt,
        elapsedSeconds,
        tickAt: now,
      };

      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-tick", payload);
      }
      io.emit("cnc-machining-tick", payload);
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

    const now = new Date();
    let request = null;
    if (requestId) {
      request = await Request.findOne({ requestId });
      if (request) {
        request.productionSchedule = request.productionSchedule || {};
        request.productionSchedule.actualMachiningComplete = now;
        applyStatusMapping(request, "세척.포장");
        await request.save();
      } else {
        await Request.updateOne(
          { requestId },
          {
            $set: {
              "productionSchedule.actualMachiningComplete": now,
            },
          },
        );
      }
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

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        status: "COMPLETED",
        completedAt: now,
        requestId: requestId || null,
      };
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-completed", payload);
      }
      io.emit("cnc-machining-completed", payload);
    } catch {
      // ignore
    }

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
