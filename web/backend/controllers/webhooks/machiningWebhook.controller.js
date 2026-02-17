import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import { ensureLotNumberForMachining } from "../../controllers/requests/utils.js";

export async function handleMachiningStartedWebhook(req, res) {
  try {
    const secret = String(process.env.MACHINING_WEBHOOK_SECRET || "").trim();
    const provided = String(req.headers["x-webhook-secret"] || "").trim();

    if (
      process.env.NODE_ENV === "production" &&
      secret &&
      provided !== secret
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized webhook",
      });
    }

    const { requestId, id, assignedMachine } = req.body || {};
    const targetId = String(requestId || id || "").trim();

    if (!Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const machine = String(assignedMachine || "").trim();
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "assignedMachine 값이 필요합니다.",
      });
    }

    const request = await Request.findById(targetId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    await ensureLotNumberForMachining(request);

    request.lotNumber = request.lotNumber || {};
    if (!request.lotNumber.material) {
      const cncMachine = await CncMachine.findOne({
        machineId: machine,
      }).lean();
      const heatNo = String(cncMachine?.currentMaterial?.heatNo || "").trim();
      if (heatNo) {
        request.lotNumber.material = heatNo;
      }
    }

    request.assignedMachine = machine;
    request.assignedAt = new Date();

    await request.save();

    return res.status(200).json({
      success: true,
      data: {
        id: request._id,
        lotNumber: request.lotNumber || null,
        assignedMachine: request.assignedMachine,
        assignedAt: request.assignedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining webhook 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
