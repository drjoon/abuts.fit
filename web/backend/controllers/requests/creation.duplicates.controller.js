import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import {
  buildRequestorOrgScopeFilter,
  normalizeRequestStage,
} from "./utils.js";

export async function checkDuplicateCaseInfo(req, res) {
  try {
    const clinicName = String(req.query?.clinicName || "").trim();
    const patientName = String(req.query?.patientName || "").trim();
    const tooth = String(req.query?.tooth || "").trim();

    if (!clinicName || !patientName || !tooth) {
      return res.status(400).json({
        success: false,
        message: "clinicName, patientName, tooth는 필수입니다.",
      });
    }

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const query = {
      $and: [
        requestFilter,
        { manufacturerStage: { $ne: "취소" } },
        {
          "caseInfos.clinicName": clinicName,
          "caseInfos.patientName": patientName,
          "caseInfos.tooth": tooth,
        },
      ],
    };

    const candidates = await Request.find(query)
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        price: 1,
        createdAt: 1,
        "caseInfos.clinicName": 1,
        "caseInfos.patientName": 1,
        "caseInfos.tooth": 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    const existing =
      Array.isArray(candidates) && candidates.length > 0 ? candidates[0] : null;

    if (!existing) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          stageOrder: -1,
          existingRequest: null,
        },
      });
    }

    const stage = normalizeRequestStage(existing);
    const stageOrderMap = {
      request: 0,
      cam: 1,
      production: 2,
      shipping: 3,
      tracking: 4,
    };
    const stageOrder = stageOrderMap[stage] ?? 0;

    return res.status(200).json({
      success: true,
      data: {
        exists: true,
        stageOrder,
        existingRequest: {
          _id: String(existing._id),
          requestId: String(existing.requestId || ""),
          manufacturerStage: String(existing.manufacturerStage || ""),
          price: existing.price ? { amount: existing.price.amount } : null,
          createdAt: existing.createdAt || null,
          caseInfos: {
            clinicName: String(existing?.caseInfos?.clinicName || ""),
            patientName: String(existing?.caseInfos?.patientName || ""),
            tooth: String(existing?.caseInfos?.tooth || ""),
          },
        },
      },
    });
  } catch (error) {
    console.error("Error in checkDuplicateCaseInfo:", error);
    return res.status(500).json({
      success: false,
      message: "중복 의뢰 여부 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
