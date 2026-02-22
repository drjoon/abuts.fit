import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import {
  normalizeCaseInfosImplantFields,
  canAccessRequestAsRequestor,
} from "./utils.js";

/**
 * 기존 의뢰를 Draft로 복제 (파일 포함)
 * @route POST /api/requests/:id/clone-to-draft
 */
export async function cloneRequestToDraft(req, res) {
  try {
    const requestId = req.params.id;

    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const request = await Request.findById(requestId)
      .populate("requestor", "organizationId")
      .lean();
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 복제할 권한이 없습니다.",
      });
    }

    const ci = request.caseInfos || {};
    const file = ci.file || {};

    const normalizedCi = await normalizeCaseInfosImplantFields(ci);

    const draftCaseInfo = {
      file: file.s3Key
        ? {
            originalName: file.fileName,
            size: file.fileSize,
            mimetype: file.fileType,
            s3Key: file.s3Key,
          }
        : undefined,
      clinicName: ci.clinicName,
      patientName: ci.patientName,
      tooth: ci.tooth,
      implantManufacturer: normalizedCi.implantManufacturer,
      implantSystem: normalizedCi.implantSystem,
      implantType: normalizedCi.implantType,
      maxDiameter: ci.maxDiameter,
      connectionDiameter: ci.connectionDiameter,
      workType: ci.workType,
      shippingMode: request.shippingMode || "normal",
      requestedShipDate: request.requestedShipDate,
    };

    const draft = await DraftRequest.create({
      requestor: req.user._id,
      caseInfos: [draftCaseInfo].map((x) => ({
        ...x,
        workType: (x && x.workType) || "abutment",
      })),
    });

    return res.status(201).json({
      success: true,
      message: "Draft가 생성되었습니다.",
      data: draft,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Draft 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
