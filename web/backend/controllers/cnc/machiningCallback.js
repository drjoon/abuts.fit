import { getIO } from "../../socket.js";
import mongoose from "mongoose";
import Request from "../../models/request.model.js";
import { applyStatusMapping } from "../../controllers/requests/utils.js";

/**
 * 브리지 서버에서 가공 완료 시 호출하는 콜백 엔드포인트
 * POST /api/cnc-machines/{machineId}/machining-completed
 */
export async function machiningCompleted(req, res) {
  try {
    const { machineId } = req.params;
    const { jobId, status, error } = req.body;

    const mid = String(machineId || "").trim();
    if (!mid || !jobId) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    console.log(
      `[Machining Callback] machineId=${mid} jobId=${jobId} status=${status}`,
    );

    // 가공 완료(COMPLETED) 시 의뢰 stage를 세척.포장으로 자동 진행
    try {
      const normalizedStatus = String(status || "")
        .trim()
        .toUpperCase();
      if (normalizedStatus === "COMPLETED") {
        const rid = req.body?.requestId
          ? String(req.body.requestId).trim()
          : "";
        const jid = String(jobId || "").trim();

        const request = rid
          ? await Request.findOne({ requestId: rid })
          : mongoose.Types.ObjectId.isValid(jid)
            ? await Request.findById(jid)
            : await Request.findOne({ requestId: jid });

        if (request) {
          applyStatusMapping(request, "세척.포장");
          await request.save();
        }
      }
    } catch (e) {
      console.error("[Machining Callback] stage update failed:", e);
    }

    // WebSocket으로 프론트에 완료 알림
    const io = getIO();
    const payload = {
      machineId: mid,
      jobId,
      status,
      error,
      completedAt: new Date(),
    };

    io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-completed", payload);
    io.emit("cnc-machining-completed", payload);

    return res.status(200).json({
      success: true,
      message: "Machining completion callback received",
    });
  } catch (error) {
    console.error("machiningCompleted error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process machining completion callback",
    });
  }
}

export default {
  machiningCompleted,
};
