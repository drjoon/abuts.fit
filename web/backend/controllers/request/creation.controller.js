import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";
import {
  getRequestorOrgId,
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  applyStatusMapping,
  canAccessRequestAsRequestor,
  buildRequestorOrgScopeFilter,
} from "./utils.js";

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
export async function createRequest(req, res) {
  try {
    if (req.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
        });
      }
    }

    const { caseInfos, ...bodyRest } = req.body;

    if (!caseInfos || typeof caseInfos !== "object") {
      throw new Error("caseInfos 객체가 필요합니다.");
    }

    const patientName = (caseInfos.patientName || "").trim();
    const tooth = (caseInfos.tooth || "").trim();
    const clinicName = (caseInfos.clinicName || "").trim();
    const workType = (caseInfos.workType || "abutment").trim();

    // 현재는 커스텀 어벗먼트 의뢰만 허용
    if (workType !== "abutment") {
      return res.status(400).json({
        success: false,
        message: "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
      });
    }

    const normalizedCaseInfos = await normalizeCaseInfosImplantFields(
      caseInfos
    );
    const implantManufacturer = (
      normalizedCaseInfos.implantManufacturer || ""
    ).trim();
    const implantSystem = (normalizedCaseInfos.implantSystem || "").trim();
    const implantType = (normalizedCaseInfos.implantType || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
      });
    }

    if (!implantManufacturer || !implantSystem || !implantType) {
      return res.status(400).json({
        success: false,
        message:
          "커스텀 어벗 의뢰의 경우 임플란트 제조사/시스템/유형은 모두 필수입니다.",
      });
    }

    const computedPrice = await computePriceForRequest({
      requestorId: req.user._id,
      requestorOrgId: req.user?.organizationId,
      clinicName,
      patientName,
      tooth,
    });

    const newRequest = new Request({
      ...bodyRest,
      caseInfos: normalizedCaseInfos,
      requestor: req.user._id,
      requestorOrganizationId:
        req.user?.role === "requestor" && req.user?.organizationId
          ? req.user.organizationId
          : null,
      price: computedPrice,
    });

    applyStatusMapping(newRequest, newRequest.status);

    await newRequest.save();

    const hasManufacturer =
      typeof normalizedCaseInfos.implantManufacturer === "string" &&
      normalizedCaseInfos.implantManufacturer.trim();

    if (hasManufacturer) {
      try {
        await ClinicImplantPreset.findOneAndUpdate(
          {
            requestor: req.user._id,
            clinicName: caseInfos.clinicName || "",
            manufacturer: normalizedCaseInfos.implantManufacturer,
            system: normalizedCaseInfos.implantSystem,
            type: normalizedCaseInfos.implantType,
          },
          {
            $inc: { useCount: 1 },
            $set: { lastUsedAt: new Date() },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (presetError) {
        console.warn("Could not save clinic implant preset", presetError);
      }
    }

    res.status(201).json({
      success: true,
      message: " 의뢰가 성공적으로 등록되었습니다.",
      data: newRequest,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      // Mongoose ValidationError 처리
      const errors = Object.values(error.errors).map((e) => e.message);
      res.status(400).json({
        success: false,
        message: "필수 입력 항목이 누락되었습니다.",
        errors,
      });
    } else {
      console.error("Error in createRequest:", error);
      res.status(500).json({
        success: false,
        message: "의뢰 등록 중 오류가 발생했습니다.",
        error: error.message,
      });
    }
  }
}

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

    const isRequestor = canAccessRequestAsRequestor(req, request);
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

/**
 * DraftRequest를 실제 Request들로 변환
 * @route POST /api/requests/from-draft
 */
export async function createRequestsFromDraft(req, res) {
  try {
    const { draftId, clinicId } = req.body || {};

    if (!draftId || !Types.ObjectId.isValid(draftId)) {
      return res.status(400).json({
        success: false,
        message: "유효한 draftId가 필요합니다.",
      });
    }

    const draft = await DraftRequest.findById(draftId).lean();

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "Draft를 찾을 수 없습니다.",
      });
    }

    if (draft.requestor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "이 Draft에 대한 권한이 없습니다.",
      });
    }

    if (req.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
        });
      }
    }

    const draftCaseInfos = Array.isArray(draft.caseInfos)
      ? draft.caseInfos
      : [];

    // 프론트엔드에서 최신 caseInfos 배열을 함께 보내온 경우, 이를 Draft.caseInfos 와 병합한다.
    // - 인덱스 기준으로 draft.caseInfos 의 file 서브도큐먼트는 유지
    // - 텍스트 필드(clinicName, patientName, tooth, implant*, connectionType 등)는
    //   클라이언트 caseInfos 가 있으면 덮어쓴다.
    let caseInfosArray = draftCaseInfos;
    if (Array.isArray(req.body.caseInfos) && req.body.caseInfos.length > 0) {
      const incoming = req.body.caseInfos;
      caseInfosArray = draftCaseInfos.map((ci, idx) => {
        const incomingCi = incoming[idx] || {};
        return {
          ...ci,
          ...incomingCi,
          file: ci.file, // file 메타는 Draft 기준 유지
          workType: (incomingCi.workType || ci.workType || "abutment").trim(),
        };
      });
    }

    if (!caseInfosArray.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 caseInfos가 없습니다.",
      });
    }

    // 현재는 커스텀 어벗먼트 케이스만 실제 Request 생성 대상으로 사용
    const abutmentCases = caseInfosArray.filter(
      (ci) => (ci.workType || "abutment").trim() === "abutment"
    );

    if (!abutmentCases.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 커스텀 어벗 케이스가 없습니다.",
      });
    }

    const createdRequests = [];
    const missingFieldsByFile = []; // 필수 정보 누락 파일 추적

    for (let idx = 0; idx < abutmentCases.length; idx++) {
      const ci = abutmentCases[idx] || {};

      const normalizedCi = await normalizeCaseInfosImplantFields(ci);

      const patientName = (ci.patientName || "").trim();
      const tooth = (ci.tooth || "").trim();
      const clinicName = (ci.clinicName || "").trim();
      const workType = (ci.workType || "abutment").trim();

      // 안전장치: 여기까지 온 케이스는 모두 abutment 여야 함
      if (workType !== "abutment") continue;

      const implantManufacturer = (
        normalizedCi.implantManufacturer || ""
      ).trim();
      const implantSystem = (normalizedCi.implantSystem || "").trim();
      const implantType = (normalizedCi.implantType || "").trim();

      // 배송 정보 (없으면 기본값 normal)
      const shippingMode = ci.shippingMode === "express" ? "express" : "normal";
      const requestedShipDate = ci.requestedShipDate || undefined;

      // 필수 정보 검증
      const missing = [];
      if (!clinicName) missing.push("치과이름");
      if (!patientName) missing.push("환자이름");
      if (!tooth) missing.push("치아번호");

      if (!implantManufacturer) missing.push("임플란트 제조사");
      if (!implantSystem) missing.push("임플란트 시스템");
      if (!implantType) missing.push("임플란트 유형");

      if (missing.length > 0) {
        const fileName = ci.file?.originalName || `파일 ${idx + 1}`;
        missingFieldsByFile.push({
          fileName,
          missingFields: missing,
        });
        continue; // 이 파일은 건너뛰고 다음 파일 처리
      }

      const computedPrice = await computePriceForRequest({
        requestorId: req.user._id,
        requestorOrgId: req.user?.organizationId,
        clinicName,
        patientName,
        tooth,
      });

      const caseInfosWithFile = ci.file
        ? {
            ...normalizedCi,
            file: {
              fileName: ci.file.originalName,
              fileType: ci.file.mimetype,
              fileSize: ci.file.size,
              // filePath는 아직 없으므로 undefined 유지
              filePath: undefined,
              s3Key: ci.file.s3Key,
              // s3Url은 나중에 presigned URL 생성 시 채울 수 있으므로 undefined
              s3Url: undefined,
            },
          }
        : normalizedCi;

      const newRequest = new Request({
        requestor: req.user._id,
        requestorOrganizationId:
          req.user?.role === "requestor" && req.user?.organizationId
            ? req.user.organizationId
            : null,
        caseInfos: caseInfosWithFile,
        price: computedPrice,
        shippingMode,
        requestedShipDate,
      });

      applyStatusMapping(newRequest, newRequest.status);

      await newRequest.save();
      createdRequests.push(newRequest);
    }

    // 생성된 의뢰가 없으면 에러 반환
    if (createdRequests.length === 0) {
      return res.status(400).json({
        success: false,
        message: "필수 정보가 누락된 파일이 있습니다.",
        missingFiles: missingFieldsByFile,
        details: missingFieldsByFile
          .map(
            (item) => `${item.fileName}: ${item.missingFields.join(", ")} 필수`
          )
          .join("\n"),
      });
    }

    return res.status(201).json({
      success: true,
      message: `${createdRequests.length}건의 의뢰가 Draft에서 생성되었습니다.`,
      data: createdRequests,
      ...(missingFieldsByFile.length > 0 && {
        warning: `${missingFieldsByFile.length}개 파일은 필수 정보 누락으로 제외되었습니다.`,
        missingFiles: missingFieldsByFile,
      }),
    });
  } catch (error) {
    console.error("Error in createRequestsFromDraft:", error);
    return res.status(500).json({
      success: false,
      message: "Draft에서 의뢰 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 동일 환자/치아 커스텀 어벗 의뢰 존재 여부 확인 (재의뢰 판단용)
export async function hasDuplicateCase(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const patientName = (req.query.patientName || "").trim();
    const tooth = (req.query.tooth || "").trim();
    const clinicName = (req.query.clinicName || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "patientName, tooth, clinicName은 필수입니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const existing = await Request.findOne({
      ...requestFilter,
      "caseInfos.patientName": patientName,
      "caseInfos.tooth": tooth,
      "caseInfos.clinicName": clinicName,
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
      status: { $ne: "취소" },
      createdAt: { $gte: cutoff },
    })
      .select({ _id: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: { hasDuplicate: Boolean(existing) },
    });
  } catch (error) {
    console.error("Error in hasDuplicateCase:", error);
    return res.status(500).json({
      success: false,
      message: "중복 의뢰 여부 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
