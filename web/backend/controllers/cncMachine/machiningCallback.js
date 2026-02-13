import { getIO } from "../../socket.js";

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
      `[Machining Callback] machineId=${mid} jobId=${jobId} status=${status}`
    );

    // WebSocket으로 프론트에 완료 알림
    const io = getIO();
    io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-completed", {
      machineId: mid,
      jobId,
      status,
      error,
      completedAt: new Date(),
    });

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
