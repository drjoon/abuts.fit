import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import DraftRequest from "../models/draftRequest.model.js";
import ClinicImplantPreset from "../models/clinicImplantPreset.model.js";
import { Types } from "mongoose";

// status(단일 필드)를 status1/status2와 동기화하는 헬퍼
function applyStatusMapping(requestDoc, statusValue) {
  const status = statusValue || requestDoc.status || "의뢰접수";

  let status1 = "의뢰접수";
  let status2 = "없음";

  switch (status) {
    case "의뢰접수":
      status1 = "의뢰접수";
      status2 = "없음";
      break;
    case "가공전":
      status1 = "가공";
      status2 = "전";
      break;
    case "가공후":
      status1 = "가공";
      status2 = "후";
      break;
    case "배송대기":
      status1 = "세척/검사/포장";
      status2 = "후";
      break;
    case "배송중":
      status1 = "배송";
      status2 = "중";
      break;
    case "완료":
      status1 = "완료";
      status2 = "없음";
      break;
    case "취소":
      status1 = "취소";
      status2 = "없음";
      break;
    default:
      // 알 수 없는 값인 경우 기본값 유지
      break;
  }

  requestDoc.status = status;
  requestDoc.status1 = status1;
  requestDoc.status2 = status2;
}

// 가공 시작 시점에 로트넘버(lotNumber)를 부여하는 헬퍼
async function ensureLotNumberForMachining(requestDoc) {
  // patientCases 필드를 더 이상 사용하지 않으므로, 현재는 lotNumber를 자동 부여하지 않는다.
  // 기존 데이터에 lotNumber가 이미 있다면 그대로 유지하고, 없다면 변경하지 않는다.
  if (requestDoc.lotNumber) {
    return;
  }

  return;
}

async function computePriceForRequest({
  requestorId,
  clinicName,
  patientName,
  tooth,
}) {
  const BASE_UNIT_PRICE = 15000;
  const REMAKE_FIXED_PRICE = 10000;
  const NEW_USER_FIXED_PRICE = 10000;
  const DISCOUNT_PER_ORDER = 10;
  const MAX_DISCOUNT = 5000;

  const now = new Date();

  // 1) 리메이크(재의뢰): 동일 환자/치아/치과, 90일 내 주문 존재 -> 10,000원 고정
  const remakeCutoff = new Date(now);
  remakeCutoff.setDate(remakeCutoff.getDate() - 90);
  const existing = await Request.findOne({
    requestor: requestorId,
    "caseInfos.patientName": patientName,
    "caseInfos.tooth": tooth,
    "caseInfos.clinicName": clinicName,
    status: { $ne: "취소" },
    createdAt: { $gte: remakeCutoff },
  })
    .select({ _id: 1 })
    .lean();

  if (existing) {
    return {
      baseAmount: REMAKE_FIXED_PRICE,
      discountAmount: 0,
      amount: REMAKE_FIXED_PRICE,
      currency: "KRW",
      rule: "remake_fixed_10000",
      discountMeta: {
        last30DaysOrders: 0,
        referralLast30DaysOrders: 0,
        discountPerOrder: DISCOUNT_PER_ORDER,
        maxDiscount: MAX_DISCOUNT,
      },
      quotedAt: now,
    };
  }

  // 2) 신규 90일 고정가: 가입일(createdAt) 기준 90일 내 -> 10,000원 고정
  const user = await User.findById(requestorId)
    .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
    .lean();
  const baseDate =
    user?.approvedAt ||
    (user?.active ? user?.updatedAt : null) ||
    user?.createdAt;
  if (baseDate) {
    const newUserCutoff = new Date(baseDate);
    newUserCutoff.setDate(newUserCutoff.getDate() + 90);
    if (now < newUserCutoff) {
      return {
        baseAmount: NEW_USER_FIXED_PRICE,
        discountAmount: 0,
        amount: NEW_USER_FIXED_PRICE,
        currency: "KRW",
        rule: "new_user_90days_fixed_10000",
        discountMeta: {
          last30DaysOrders: 0,
          referralLast30DaysOrders: 0,
          discountPerOrder: DISCOUNT_PER_ORDER,
          maxDiscount: MAX_DISCOUNT,
        },
        quotedAt: now,
      };
    }
  }

  // 3) 최근 30일 주문량 할인(리퍼럴 합산은 아직 스키마가 없어 0으로 처리)
  const last30Cutoff = new Date(now);
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);
  const last30DaysOrders = await Request.countDocuments({
    requestor: requestorId,
    status: { $ne: "취소" },
    createdAt: { $gte: last30Cutoff },
  });

  // 추천인 합산: 내가 추천한(=referredByUserId가 나인) 유저들의 최근 30일 주문량을 합산
  const referredUsers = await User.find({
    referredByUserId: requestorId,
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

  const referralLast30DaysOrders = referredUserIds.length
    ? await Request.countDocuments({
        requestor: { $in: referredUserIds },
        status: { $ne: "취소" },
        createdAt: { $gte: last30Cutoff },
      })
    : 0;
  const totalOrders = last30DaysOrders + referralLast30DaysOrders;
  const discountAmount = Math.min(
    totalOrders * DISCOUNT_PER_ORDER,
    MAX_DISCOUNT
  );
  const amount = Math.max(0, BASE_UNIT_PRICE - discountAmount);

  return {
    baseAmount: BASE_UNIT_PRICE,
    discountAmount,
    amount,
    currency: "KRW",
    rule: discountAmount > 0 ? "volume_discount_last30days" : "base_price",
    discountMeta: {
      last30DaysOrders,
      referralLast30DaysOrders,
      discountPerOrder: DISCOUNT_PER_ORDER,
      maxDiscount: MAX_DISCOUNT,
    },
    quotedAt: now,
  };
}

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
async function createRequest(req, res) {
  try {
    // Batch request processing
    if (req.body.items && Array.isArray(req.body.items)) {
      const createdRequests = [];
      const items = req.body.items;

      // Generate a common referenceId for the batch if not provided in items
      // However, items might already have referenceIds grouped by patient
      // So we just process each item.

      for (const item of items) {
        const { caseInfos, ...rest } = item;

        // caseInfos가 필수이며, 환자명/치아번호는 반드시 있어야 한다.
        if (!caseInfos || typeof caseInfos !== "object") {
          throw new Error("각 항목에 caseInfos 객체가 필요합니다.");
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

        const implantSystem = (caseInfos.implantSystem || "").trim();
        const implantType = (caseInfos.implantType || "").trim();
        const connectionType = (caseInfos.connectionType || "").trim();

        if (!patientName || !tooth || !clinicName) {
          return res.status(400).json({
            success: false,
            message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
          });
        }

        if (!implantSystem || !implantType || !connectionType) {
          return res.status(400).json({
            success: false,
            message:
              "커스텀 어벗 의뢰의 경우 임플란트 시스템/타입/커넥션은 모두 필수입니다.",
          });
        }

        const computedPrice = await computePriceForRequest({
          requestorId: req.user._id,
          clinicName,
          patientName,
          tooth,
        });

        const newRequest = new Request({
          ...rest,
          caseInfos,
          requestor: req.user._id,
          price: computedPrice,
        });
        applyStatusMapping(newRequest, newRequest.status);
        await newRequest.save();
        createdRequests.push(newRequest);
      }

      // 모든 요청이 저장된 뒤, 같은 환자명 기준으로 requestId를 referenceId에 매핑한다.
      // (예: "김선미"의 27번/37번/크라운 의뢰만 서로 묶이고,
      //  다른 환자 이름의 의뢰들은 별도 그룹으로 관리)

      // 1) (클리닉명 + 환자명) 조합별 -> requestId[] 맵 구성
      const groupByClinicAndPatient = new Map();

      for (const r of createdRequests) {
        const rawName =
          typeof r.caseInfos?.patientName === "string"
            ? r.caseInfos.patientName
            : "";
        const rawClinic =
          typeof r.caseInfos?.clinicName === "string"
            ? r.caseInfos.clinicName
            : "";
        const nameKey = rawName.trim() || "__NO_NAME__";
        const clinicKey = rawClinic.trim() || "__NO_CLINIC__";
        const key = `${clinicKey}::${nameKey}`;
        if (!groupByClinicAndPatient.has(key)) {
          groupByClinicAndPatient.set(key, []);
        }
        const arr = groupByClinicAndPatient.get(key);
        if (typeof r.requestId === "string" && r.requestId.length > 0) {
          arr.push(r.requestId);
        }
      }

      // 2) 각 의뢰에 대해, 자신의 (클리닉+환자) 그룹에 해당하는 requestId 배열(자기 자신은 제외)을 referenceIds로 설정
      await Promise.all(
        createdRequests.map(async (reqDoc) => {
          const rawName =
            typeof reqDoc.caseInfos?.patientName === "string"
              ? reqDoc.caseInfos.patientName
              : "";
          const rawClinic =
            typeof reqDoc.caseInfos?.clinicName === "string"
              ? reqDoc.caseInfos.clinicName
              : "";
          const nameKey = rawName.trim() || "__NO_NAME__";
          const clinicKey = rawClinic.trim() || "__NO_CLINIC__";
          const key = `${clinicKey}::${nameKey}`;
          const idsForGroup = groupByClinicAndPatient.get(key) || [];
          reqDoc.referenceIds = idsForGroup.filter(
            (id) => id !== reqDoc.requestId
          );
          await reqDoc.save();
        })
      );

      return res.status(201).json({
        success: true,
        message: `${createdRequests.length}건의 의뢰가 성공적으로 등록되었습니다.`,
        data: createdRequests,
      });
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

    const implantSystem = (caseInfos.implantSystem || "").trim();
    const implantType = (caseInfos.implantType || "").trim();
    const connectionType = (caseInfos.connectionType || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
      });
    }

    if (!implantSystem || !implantType || !connectionType) {
      return res.status(400).json({
        success: false,
        message:
          "커스텀 어벗 의뢰의 경우 임플란트 시스템/타입/커넥션은 모두 필수입니다.",
      });
    }

    const computedPrice = await computePriceForRequest({
      requestorId: req.user._id,
      clinicName,
      patientName,
      tooth,
    });

    const newRequest = new Request({
      ...bodyRest,
      caseInfos,
      requestor: req.user._id,
      price: computedPrice,
    });

    applyStatusMapping(newRequest, newRequest.status);

    await newRequest.save();

    const hasImplantSystem =
      typeof caseInfos.implantSystem === "string" &&
      caseInfos.implantSystem.trim();

    if (hasImplantSystem) {
      try {
        await ClinicImplantPreset.findOneAndUpdate(
          {
            requestor: req.user._id,
            clinicName: caseInfos.clinicName || "",
            manufacturer: caseInfos.implantSystem,
            system: caseInfos.implantType,
            type: caseInfos.connectionType,
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
      message: "의뢰가 성공적으로 등록되었습니다.",
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
async function cloneRequestToDraft(req, res) {
  try {
    const requestId = req.params.id;

    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const request = await Request.findById(requestId).lean();
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const isRequestor = req.user._id.equals(request.requestor);
    const isAdmin = req.user.role === "admin";
    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 복제할 권한이 없습니다.",
      });
    }

    const ci = request.caseInfos || {};
    const file = ci.file || {};

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
      implantSystem: ci.implantSystem,
      implantType: ci.implantType,
      connectionType: ci.connectionType,
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
async function createRequestsFromDraft(req, res) {
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

      const patientName = (ci.patientName || "").trim();
      const tooth = (ci.tooth || "").trim();
      const clinicName = (ci.clinicName || "").trim();
      const workType = (ci.workType || "abutment").trim();

      // 안전장치: 여기까지 온 케이스는 모두 abutment 여야 함
      if (workType !== "abutment") continue;

      const implantSystem = (ci.implantSystem || "").trim();
      const implantType = (ci.implantType || "").trim();
      const connectionType = (ci.connectionType || "").trim();

      // 배송 정보 (없으면 기본값 normal)
      const shippingMode = ci.shippingMode === "express" ? "express" : "normal";
      const requestedShipDate = ci.requestedShipDate || undefined;

      // 필수 정보 검증
      const missing = [];
      if (!clinicName) missing.push("치과이름");
      if (!patientName) missing.push("환자이름");
      if (!tooth) missing.push("치아번호");

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
        clinicName,
        patientName,
        tooth,
      });

      const caseInfosWithFile = ci.file
        ? {
            ...ci,
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
        : ci;

      const newRequest = new Request({
        requestor: req.user._id,
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
async function hasDuplicateCase(req, res) {
  try {
    const requestorId = req.user._id;
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
      requestor: requestorId,
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

/**
 * 모든 의뢰 목록 조회 (관리자용)
 * @route GET /api/requests/all
 */
async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      const { requestor, ...rest } = filter;
      filter = rest;
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회 (현재 사용자 기준 unreadCount 포함)
    const rawRequests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = rawRequests.map((r) => {
      const messages = Array.isArray(r.messages) ? r.messages : [];
      const unreadCount = messages.filter((m) => {
        if (!m) return false;
        if (m.isRead) return false;
        if (!m.sender) return true;
        const senderId =
          typeof m.sender === "string" ? m.sender : m.sender.toString();
        return senderId !== req.user._id.toString();
      }).length;
      return { ...r, unreadCount };
    });

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 의뢰 목록 조회 (의뢰자용)
 * @route GET /api/requests/my
 */
async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 본인
    let filter = { requestor: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      const { requestor, ...rest } = filter;
      filter = rest;
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    const requests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상세 조회
 * @route GET /api/requests/:id
 */
async function getRequestById(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회 (메시지 발신자 정보까지 포함)
    const request = await Request.findById(requestId)
      .populate("requestor", "name email phoneNumber organization role")
      .populate("messages.sender", "name email role");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 조회 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 접근할 권한이 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 수정
 * @route PUT /api/requests/:id
 */
async function updateRequest(req, res) {
  try {
    const requestId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 수정 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 수정할 권한이 없습니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.requestId;
    delete updateData.requestor;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // 의뢰 상태가 '검토중'일 때만 일부 필드 수정 가능
    if (request.status !== "검토중" && !isAdmin) {
      const allowedFields = ["messages"];
      Object.keys(updateData).forEach((key) => {
        if (!allowedFields.includes(key)) {
          delete updateData[key];
        }
      });
    }

    // 의뢰 수정
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 수정되었습니다.",
      data: updatedRequest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상태 변경
 * @route PATCH /api/requests/:id/status
 */
async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    // 상태 유효성 검사 (새 워크플로우)
    const validStatuses = [
      "의뢰접수",
      "가공전",
      "가공후",
      "배송대기",
      "배송중",
      "완료",
      "취소",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 상태 변경 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰의 상태를 변경할 권한이 없습니다.",
      });
    }

    // 상태 변경 권한 확인
    if (status === "취소" && !isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "의뢰자 또는 관리자만 의뢰를 취소할 수 있습니다.",
      });
    }

    // 취소는 의뢰접수/가공전 상태에서만 가능
    if (status === "취소" && !["의뢰접수", "가공전"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: "의뢰접수 또는 가공전 상태에서만 취소할 수 있습니다.",
      });
    }

    // 의뢰 상태 변경 (status1/status2 동기화 포함)
    applyStatusMapping(request, status);

    // 가공 시작 시점(가공전 진입)에서만 로트넘버 부여
    if (status === "가공전") {
      await ensureLotNumberForMachining(request);
    }

    await request.save();

    res.status(200).json({
      success: true,
      message: "의뢰 상태가 성공적으로 변경되었습니다.",
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰에 메시지 추가
 * @route POST /api/requests/:id/messages
 */
async function addMessage(req, res) {
  try {
    const requestId = req.params.id;
    const { content } = req.body;

    // 메시지 내용 유효성 검사
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용은 필수입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 메시지 추가 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 메시지를 추가할 권한이 없습니다.",
      });
    }

    // 메시지 추가
    const newMessage = {
      sender: req.user._id,
      content,
      createdAt: Date.now(),
      isRead: false,
    };

    request.messages.push(newMessage);
    const updatedRequest = await request.save();

    res.status(201).json({
      success: true,
      message: "메시지가 성공적으로 추가되었습니다.",
      data: updatedRequest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "메시지 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 삭제 (관리자 또는 의뢰자 본인만 가능)
 * @route DELETE /api/requests/:id
 */
async function deleteRequest(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 권한 검증: 관리자이거나 의뢰자 본인만 삭제 가능
    if (
      req.user.role !== "admin" &&
      request.requestor.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 삭제할 권한이 없습니다.",
      });
    }

    // 의뢰 삭제
    await Request.findByIdAndDelete(requestId);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 삭제되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 최대 직경 기준 4개 구간(<6, <8, <10, >=10mm) 통계를 계산하는 헬퍼
function computeDiameterStats(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    const buckets = [6, 8, 10, 11].map((d, index) => ({
      diameter: d,
      shipLabel:
        index === 0
          ? "모레"
          : index === 1
          ? "내일"
          : index === 2
          ? "+3일"
          : "+5일",
      count: 0,
      ratio: 0,
    }));
    return { total: 0, buckets };
  }

  const bucketDefs = [
    { id: "lt6", diameter: 6, label: "<6mm", shipLabel: "모레" },
    { id: "lt8", diameter: 8, label: "<8mm", shipLabel: "내일" },
    { id: "lt10", diameter: 10, label: "<10mm", shipLabel: "+3일" },
    { id: "gte10", diameter: 11, label: "10mm 이상", shipLabel: "+5일" },
  ];

  const counts = {
    lt6: 0,
    lt8: 0,
    lt10: 0,
    gte10: 0,
  };

  requests.forEach((r) => {
    const d = typeof r.maxDiameter === "number" ? r.maxDiameter : null;
    if (d == null || Number.isNaN(d)) return;

    if (d < 6) counts.lt6 += 1;
    else if (d >= 6 && d < 8) counts.lt8 += 1;
    else if (d >= 8 && d < 10) counts.lt10 += 1;
    else if (d >= 10) counts.gte10 += 1;
  });

  const total = counts.lt6 + counts.lt8 + counts.lt10 + counts.gte10;

  const maxCount = Math.max(
    1,
    counts.lt6,
    counts.lt8,
    counts.lt10,
    counts.gte10
  );

  const buckets = bucketDefs.map((def) => {
    const count =
      def.id === "lt6"
        ? counts.lt6
        : def.id === "lt8"
        ? counts.lt8
        : def.id === "lt10"
        ? counts.lt10
        : counts.gte10;

    return {
      diameter: def.diameter,
      shipLabel: def.shipLabel,
      count,
      ratio: maxCount > 0 ? count / maxCount : 0,
    };
  });

  return {
    total,
    buckets,
  };
}

/**
 * 내 대시보드 요약 (의뢰자용)
 * @route GET /api/requests/my/dashboard-summary
 */
async function getMyDashboardSummary(req, res) {
  try {
    const requestorId = req.user._id;
    const { period = "30d" } = req.query;

    let dateFilter = {};
    if (period && period !== "all") {
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      const from = new Date();
      from.setDate(from.getDate() - days);
      dateFilter = { createdAt: { $gte: from } };
    }

    // 기본적으로는 로그인한 의뢰자 본인(requestorId)의 데이터만 조회
    // 단, 개발 환경에서 MOCK_DEV_TOKEN을 사용하는 경우에는
    // 기존 시드 데이터 확인을 위해 requestor 필터를 생략한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    const requestFilter = isMockDevToken
      ? { ...dateFilter }
      : { requestor: requestorId, ...dateFilter };

    const requests = await Request.find(requestFilter)
      .populate("requestor", "name organization")
      .lean();

    // 커스텀 어벗(Request.caseInfos.implantSystem 존재)만 대시보드 통계 대상
    const abutmentRequests = requests.filter((r) => {
      const ci = r.caseInfos || {};
      return typeof ci.implantSystem === "string" && ci.implantSystem.trim();
    });

    const total = abutmentRequests.length;
    const inProduction = abutmentRequests.filter((r) =>
      ["가공전", "가공후"].includes(r.status)
    ).length;
    const completed = abutmentRequests.filter(
      (r) => r.status === "완료"
    ).length;
    const inShipping = abutmentRequests.filter(
      (r) => r.status === "배송중"
    ).length;

    const active = abutmentRequests.filter((r) =>
      ["의뢰접수", "가공전", "가공후", "배송대기", "배송중"].includes(r.status)
    );

    const stageCounts = {
      design: 0,
      cnc: 0,
      post: 0,
      shipping: 0,
    };

    active.forEach((r) => {
      if (r.status === "의뢰접수") {
        stageCounts.design += 1;
      } else if (r.status === "가공전") {
        stageCounts.cnc += 1;
      } else if (r.status === "가공후") {
        stageCounts.post += 1;
      } else if (r.status === "배송대기" || r.status === "배송중") {
        stageCounts.shipping += 1;
      }
    });

    const totalActive = active.length || 1;
    const manufacturingSummary = {
      totalActive: active.length,
      stages: [
        { key: "design", label: "디자인 검토", count: stageCounts.design },
        { key: "cnc", label: "CNC 가공", count: stageCounts.cnc },
        { key: "post", label: "후처리/폴리싱", count: stageCounts.post },
        {
          key: "shipping",
          label: "출고/배송 준비",
          count: stageCounts.shipping,
        },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    const now = new Date();
    const delayedItems = [];
    const warningItems = [];

    abutmentRequests.forEach((r) => {
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfo?.shippedAt
        ? new Date(r.deliveryInfo.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfo?.deliveredAt
        ? new Date(r.deliveryInfo.deliveredAt)
        : null;
      const isDone = r.status === "완료" || Boolean(deliveredAt || shippedAt);

      const diffDays = (now.getTime() - est.getTime()) / (1000 * 60 * 60 * 24);

      if (!isDone && diffDays >= 1) {
        delayedItems.push(r);
      } else if (!isDone && diffDays >= 0 && diffDays < 1) {
        warningItems.push(r);
      }
    });

    const totalWithEta = abutmentRequests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (r, level) => ({
      id: r.requestId,
      title: r.title,
      manufacturer: "",
      riskLevel: level,
      message:
        level === "danger"
          ? "제조 공정 지연으로 출고일 재조정이 필요할 수 있습니다."
          : "예상 출고일과 근접해 있어 지연 가능성이 있습니다.",
    });

    const riskItems = [
      ...delayedItems.slice(0, 3).map((r) => toRiskItem(r, "danger")),
      ...warningItems.slice(0, 3).map((r) => toRiskItem(r, "warning")),
    ];

    const riskSummary = {
      delayedCount,
      warningCount,
      onTimeRate,
      items: riskItems,
    };

    const diameterStats = computeDiameterStats(abutmentRequests);

    const recentRequests = abutmentRequests
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bDate = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 5)
      .map((r) => {
        const ci = r.caseInfos || {};
        return {
          // 기본 식별자
          _id: r._id,
          requestId: r.requestId,
          // 표시용 필드
          title: r.title,
          status: r.status,
          date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
          // 편집 다이얼로그에서 사용할 세부 정보
          patientName: ci.patientName || "",
          tooth: ci.tooth || "",
          caseInfos: ci,
          requestor: r.requestor || null,
        };
      });

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRequests: total,
          inProduction,
          inShipping,
          completed,
        },
        manufacturingSummary,
        riskSummary,
        diameterStats,
        recentRequests,
      },
    });
  } catch (error) {
    console.error("Error in getMyDashboardSummary:", error);
    return res.status(500).json({
      success: false,
      message: "대시보드 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 가격/리퍼럴 통계 (의뢰자용)
 * @route GET /api/requests/my/pricing-referral-stats
 */
async function getMyPricingReferralStats(req, res) {
  try {
    const requestorId = req.user._id;

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    const myLast30DaysOrders = await Request.countDocuments({
      requestor: requestorId,
      status: { $ne: "취소" },
      createdAt: { $gte: last30Cutoff },
    });

    const referredUsers = await User.find({
      referredByUserId: requestorId,
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

    const referralLast30DaysOrders = referredUserIds.length
      ? await Request.countDocuments({
          requestor: { $in: referredUserIds },
          status: { $ne: "취소" },
          createdAt: { $gte: last30Cutoff },
        })
      : 0;

    const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 10;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit
    );

    const user = await User.findById(requestorId)
      .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
      .lean();

    let rule = "volume_discount_last30days";
    let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);

    const dateSource = user || req.user;

    const baseDate =
      dateSource?.approvedAt ||
      (dateSource?.active ? dateSource?.updatedAt : null) ||
      dateSource?.createdAt;

    let fixedUntil = null;

    if (baseDate) {
      fixedUntil = new Date(baseDate);
      fixedUntil.setDate(fixedUntil.getDate() + 90);
      if (now < fixedUntil) {
        rule = "new_user_90days_fixed_10000";
        effectiveUnitPrice = 10000;
      }
    }

    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (process.env.NODE_ENV !== "production") {
      console.log("[pricing-referral-stats]", {
        requestorId: String(requestorId),
        isMockDevToken,
        now,
        baseDate,
        fixedUntil,
        userDates: user
          ? {
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              approvedAt: user.approvedAt,
              active: user.active,
            }
          : null,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        last30Cutoff,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        baseUnitPrice,
        discountPerOrder,
        maxDiscountPerUnit,
        discountAmount,
        effectiveUnitPrice,
        rule,
        ...(process.env.NODE_ENV !== "production"
          ? {
              debug: {
                requestorId,
                isMockDevToken,
                now,
                baseDate,
                fixedUntil,
                userDates: user
                  ? {
                      createdAt: user.createdAt,
                      updatedAt: user.updatedAt,
                      approvedAt: user.approvedAt,
                      active: user.active,
                    }
                  : null,
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("Error in getMyPricingReferralStats:", error);
    return res.status(500).json({
      success: false,
      message: "가격/리퍼럴 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 후보 조회 (의뢰자용)
 * @route GET /api/requests/my/bulk-shipping
 */
async function getMyBulkShipping(req, res) {
  try {
    const requestorId = req.user._id;

    const requests = await Request.find({
      requestor: requestorId,
      status: { $in: ["가공전", "가공후", "배송대기"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    const mapItem = (r) => ({
      id: r.requestId,
      title: r.title,
      clinic: r.requestor?.organization || r.requestor?.name || "",
      patient: r.patientName || "",
      tooth: r.tooth || "",
      diameter: r.specifications?.maxDiameter
        ? `${r.specifications.maxDiameter}mm`
        : "",
      status: r.status,
      status1: r.status1,
      status2: r.status2,
    });

    const pre = requests.filter((r) => r.status === "가공전").map(mapItem);
    const post = requests.filter((r) => r.status === "가공후").map(mapItem);
    const waiting = requests
      .filter((r) => r.status === "배송대기")
      .map(mapItem);

    return res.status(200).json({
      success: true,
      data: { pre, post, waiting },
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 생성/신청 (의뢰자용)
 * @route POST /api/requests/my/bulk-shipping
 */
async function createMyBulkShipping(req, res) {
  try {
    const requestorId = req.user._id;
    const { requestIds } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    const requests = await Request.find({
      requestId: { $in: requestIds },
      requestor: requestorId,
      status: { $in: ["가공전", "가공후", "배송대기"] },
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    for (const r of requests) {
      applyStatusMapping(r, "배송대기");
      await r.save();
    }

    return res.status(200).json({
      success: true,
      message: `${requests.length}건의 의뢰가 배송대기 상태로 변경되었습니다.`,
      data: {
        updatedIds: requests.map((r) => r.requestId),
      },
    });
  } catch (error) {
    console.error("Error in createMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  createRequest,
  createRequestsFromDraft,
  hasDuplicateCase,
  getAllRequests,
  getMyRequests,
  getRequestById,
  updateRequest,
  updateRequestStatus,
  cloneRequestToDraft,
  addMessage,
  deleteRequest,
  getMyDashboardSummary,
  getMyPricingReferralStats,
  getMyBulkShipping,
  createMyBulkShipping,
};
