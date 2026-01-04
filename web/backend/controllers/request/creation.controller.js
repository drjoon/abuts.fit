import mongoose, { Types } from "mongoose";
import Request from "../../models/request.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import {
  getRequestorOrgId,
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  applyStatusMapping,
  canAccessRequestAsRequestor,
  buildRequestorOrgScopeFilter,
  getDeliveryEtaLeadDays,
  addKoreanBusinessDays,
  normalizeKoreanBusinessDay,
  getTodayYmdInKst,
  calculateExpressShipYmd,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
} from "./utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";

const toKstYmd = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const ymdToKstDate = (ymd) => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const resolveNormalLeadDays = ({ leadDays, maxDiameter }) => {
  const effective = {
    ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
    ...(leadDays || {}),
  };
  const d =
    typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
      ? maxDiameter
      : maxDiameter != null && String(maxDiameter).trim()
      ? Number(maxDiameter)
      : null;
  if (d == null || Number.isNaN(d)) return effective.d10;
  if (d <= 6) return effective.d6;
  if (d <= 8) return effective.d8;
  if (d <= 10) return effective.d10;
  return effective.d10plus;
};

const resolveEstimatedCompletionDate = async ({
  baseYmd,
  shippingMode,
  requestedShipDate,
  maxDiameter,
}) => {
  const leadDays = await getDeliveryEtaLeadDays();
  const requestedShipYmd = toKstYmd(requestedShipDate);
  const todayYmd = getTodayYmdInKst();
  const seedYmd = baseYmd || todayYmd;

  const rawShipDateYmd =
    shippingMode === "express"
      ? requestedShipYmd ||
        (await calculateExpressShipYmd({ maxDiameter, baseYmd: todayYmd }))
      : requestedShipYmd || seedYmd;

  const shipDateYmd = await normalizeKoreanBusinessDay({ ymd: rawShipDateYmd });

  const arrivalYmd =
    shippingMode === "express"
      ? await addKoreanBusinessDays({ startYmd: shipDateYmd, days: 1 })
      : await addKoreanBusinessDays({
          startYmd: shipDateYmd,
          days: resolveNormalLeadDays({ leadDays, maxDiameter }),
        });

  return ymdToKstDate(arrivalYmd);
};

export async function getOrganizationCreditBalanceBreakdown({
  organizationId,
  session,
}) {
  const rows = await CreditLedger.find({ organizationId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1 })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonus = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);
    if (!Number.isFinite(amount)) continue;

    if (type === "CHARGE") {
      paid += amount;
      continue;
    }
    if (type === "BONUS") {
      bonus += amount;
      continue;
    }
    if (type === "REFUND") {
      paid += amount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = Math.abs(amount);
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
  };
}

const isDuplicateKeyError = (err) => {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
};

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

      // 크레딧 lock 체크
      const lockStatus = await checkCreditLock(orgId);
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
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

    const shippingMode = bodyRest.shippingMode || "normal";
    const requestedAt = new Date();

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

    // 원본 배송 옵션 저장
    newRequest.originalShipping = {
      mode: shippingMode,
      requestedAt,
    };

    // 최종 배송 옵션 초기화 (처음에는 원본과 동일)
    newRequest.finalShipping = {
      mode: shippingMode,
      updatedAt: requestedAt,
    };

    // 생산 스케줄 계산 (시각 기반)
    const { calculateInitialProductionSchedule } = await import(
      "./production.utils.js"
    );
    const productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt,
    });
    newRequest.productionSchedule = productionSchedule;

    // 하위 호환성을 위해 timeline.estimatedCompletion도 설정 (YYYY-MM-DD)
    newRequest.timeline = newRequest.timeline || {};
    newRequest.timeline.estimatedCompletion =
      productionSchedule.estimatedDelivery.toISOString().slice(0, 10);

    newRequest.caseInfos = newRequest.caseInfos || {};
    if (newRequest.caseInfos?.file?.s3Key) {
      newRequest.caseInfos.reviewByStage =
        newRequest.caseInfos.reviewByStage || {};
      newRequest.caseInfos.reviewByStage.request = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
    }

    // [변경] 생산 시작(CAM 승인) 시점에 크레딧을 차감하므로, 의뢰 생성 시점의 SPEND 로직을 제거합니다.
    await newRequest.save();

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

/**
 * DraftRequest를 실제 Request들로 변환
 * @route POST /api/requests/from-draft
 */
export async function createRequestsFromDraft(req, res) {
  try {
    const { draftId, clinicId } = req.body || {};
    const duplicateResolution =
      req.body?.duplicateResolution &&
      typeof req.body.duplicateResolution === "object"
        ? req.body.duplicateResolution
        : null;
    const duplicateResolutionsRaw = Array.isArray(
      req.body?.duplicateResolutions
    )
      ? req.body.duplicateResolutions
      : null;
    const duplicateResolutions = Array.isArray(duplicateResolutionsRaw)
      ? duplicateResolutionsRaw
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            caseId: String(r.caseId || "").trim(),
            strategy: String(r.strategy || "").trim(),
            existingRequestId: String(r.existingRequestId || "").trim(),
          }))
          .filter((r) => r.caseId && r.strategy)
      : null;

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

      // 크레딧 lock 체크
      const lockStatus = await checkCreditLock(orgId);
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
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
    const preparedCases = [];

    for (let idx = 0; idx < abutmentCases.length; idx++) {
      const ci = abutmentCases[idx] || {};
      const normalizedCi = await normalizeCaseInfosImplantFields(ci);

      const patientName = (ci.patientName || "").trim();
      const tooth = (ci.tooth || "").trim();
      const clinicName = (ci.clinicName || "").trim();
      const workType = (ci.workType || "abutment").trim();
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
        continue;
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
              filePath: undefined,
              s3Key: ci.file.s3Key,
              s3Url: undefined,
            },
          }
        : normalizedCi;

      preparedCases.push({
        idx,
        caseId: ci._id ? String(ci._id) : String(idx),
        caseInfosWithFile,
        shippingMode,
        requestedShipDate,
        computedPrice,
        clinicName,
        patientName,
        tooth,
      });
    }

    // 생성 대상이 없으면 에러 반환
    if (preparedCases.length === 0) {
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

    const organizationId = req.user?.organizationId;
    if (!organizationId || !Types.ObjectId.isValid(String(organizationId))) {
      return res.status(403).json({
        success: false,
        message:
          "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
      });
    }

    // 중복 의뢰(동일 치과/환자/치아) 감지
    // - duplicateResolution이 없으면 409로 사용자에게 선택지를 제공한다.
    // - duplicateResolution이 있으면 정책에 따라 replace/remake 처리한다.
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const duplicates = [];

    const keyTuplesRaw = preparedCases
      .map((item) => ({
        caseId: item.caseId,
        fileName: item.caseInfosWithFile?.file?.fileName || undefined,
        clinicName: String(item.clinicName || "").trim(),
        patientName: String(item.patientName || "").trim(),
        tooth: String(item.tooth || "").trim(),
      }))
      .filter((k) => k.clinicName && k.patientName && k.tooth);

    // 동일 제출 내 중복(치과/환자/치아) 방지
    const tupleByKey = new Map();
    const duplicateInPayload = [];
    for (const item of keyTuplesRaw) {
      const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
      if (!tupleByKey.has(key)) {
        tupleByKey.set(key, item);
      } else {
        duplicateInPayload.push(item);
      }
    }

    if (duplicateInPayload.length > 0) {
      return res.status(400).json({
        success: false,
        code: "DUPLICATE_IN_PAYLOAD",
        message:
          "제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다. 중복 항목을 제거하고 다시 제출해주세요.",
        data: {
          duplicates: duplicateInPayload.map((d) => ({
            caseId: d.caseId,
            clinicName: d.clinicName,
            patientName: d.patientName,
            tooth: d.tooth,
          })),
        },
      });
    }

    const keyTuples = Array.from(tupleByKey.values());

    if (keyTuples.length > 0) {
      const orConditions = keyTuples.map((k) => ({
        "caseInfos.clinicName": k.clinicName,
        "caseInfos.patientName": k.patientName,
        "caseInfos.tooth": k.tooth,
      }));

      const query = {
        $and: [
          requestFilter,
          { status: { $ne: "취소" } },
          { $or: orConditions },
        ],
      };

      const candidates = await Request.find(query)
        .select({
          _id: 1,
          requestId: 1,
          status: 1,
          createdAt: 1,
          price: 1,
          "caseInfos.clinicName": 1,
          "caseInfos.patientName": 1,
          "caseInfos.tooth": 1,
        })
        .sort({ createdAt: -1 })
        .lean();

      const latestByKey = new Map();
      for (const doc of candidates || []) {
        const ci = doc?.caseInfos || {};
        const key = `${String(ci.clinicName || "").trim()}|${String(
          ci.patientName || ""
        ).trim()}|${String(ci.tooth || "").trim()}`;
        if (!latestByKey.has(key)) {
          latestByKey.set(key, doc);
        }
      }

      for (const item of keyTuples) {
        const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
        const existing = latestByKey.get(key);
        if (!existing) continue;

        const existingCi = existing?.caseInfos || {};

        duplicates.push({
          caseId: item.caseId,
          fileName: item.fileName,
          existingRequest: {
            _id: String(existing._id),
            requestId: String(existing.requestId || ""),
            status: String(existing.status || ""),
            price: existing.price || null,
            createdAt: existing.createdAt || null,
            caseInfos: {
              clinicName: String(existingCi?.clinicName || ""),
              patientName: String(existingCi?.patientName || ""),
              tooth: String(existingCi?.tooth || ""),
            },
          },
        });
      }
    }

    const first = duplicates[0];

    if (
      duplicates.length > 0 &&
      !duplicateResolution &&
      !duplicateResolutions
    ) {
      const st = String(first?.existingRequest?.status || "");
      const mode = st === "완료" ? "completed" : "active";
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_REQUEST",
        message:
          st === "완료"
            ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 재의뢰(리메이크)로 접수할까요?"
            : "동일한 정보의 의뢰가 이미 진행 중입니다. 기존 의뢰를 취소하고 다시 의뢰할까요?",
        data: {
          mode,
          duplicates,
        },
      });
    }

    if (duplicates.length > 0 && duplicateResolution && !duplicateResolutions) {
      // 레거시(single) 해소 방식은 다중 중복 케이스 처리에 안전하지 않다.
      // 프론트에서 duplicateResolutions(케이스별)를 보내도록 유도한다.
      if (duplicates.length > 1) {
        const st = String(first?.existingRequest?.status || "");
        const mode = st === "완료" ? "completed" : "active";
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_REQUEST",
          message:
            st === "완료"
              ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 중복 의뢰 처리 방법을 선택해주세요."
              : "동일한 정보의 의뢰가 이미 진행 중입니다. 중복 의뢰 처리 방법을 선택해주세요.",
          data: {
            mode,
            duplicates,
          },
        });
      }
    }

    const resolutionsByCaseId = new Map();
    if (duplicates.length > 0 && duplicateResolutions) {
      for (const r of duplicateResolutions) {
        const strategy = String(r.strategy || "").trim();
        if (!strategy) continue;
        if (!["skip", "replace", "remake"].includes(strategy)) {
          return res.status(400).json({
            success: false,
            message: "유효하지 않은 duplicateResolutions.strategy 입니다.",
          });
        }
        resolutionsByCaseId.set(String(r.caseId), {
          strategy,
          existingRequestId: String(r.existingRequestId || "").trim(),
        });
      }

      const unresolved = duplicates.filter(
        (d) => !resolutionsByCaseId.has(String(d.caseId || ""))
      );
      if (unresolved.length > 0) {
        const st = String(first?.existingRequest?.status || "");
        const mode = st === "완료" ? "completed" : "active";
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_REQUEST",
          message:
            st === "완료"
              ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 중복 의뢰 처리 방법을 선택해주세요."
              : "동일한 정보의 의뢰가 이미 진행 중입니다. 중복 의뢰 처리 방법을 선택해주세요.",
          data: {
            mode,
            duplicates: unresolved,
          },
        });
      }

      const duplicatesByCaseId = new Map(
        duplicates.map((d) => [String(d.caseId || ""), d])
      );
      for (const [caseId, r] of resolutionsByCaseId.entries()) {
        const dup = duplicatesByCaseId.get(String(caseId));
        if (!dup) continue;

        const strategy = String(r?.strategy || "");
        if (strategy === "skip") continue;

        const expectedExistingId = String(dup?.existingRequest?._id || "");
        if (
          !r?.existingRequestId ||
          !Types.ObjectId.isValid(r.existingRequestId)
        ) {
          return res.status(400).json({
            success: false,
            message: "유효한 existingRequestId가 필요합니다.",
          });
        }
        if (
          expectedExistingId &&
          String(r.existingRequestId) !== expectedExistingId
        ) {
          return res.status(400).json({
            success: false,
            message: "중복 의뢰(existingRequestId) 정보가 일치하지 않습니다.",
          });
        }
      }
    }

    const skipCaseIds = new Set();
    if (resolutionsByCaseId.size > 0) {
      for (const [caseId, r] of resolutionsByCaseId.entries()) {
        if (String(r?.strategy || "") === "skip") {
          skipCaseIds.add(String(caseId));
        }
      }
    }

    const preparedCasesForCreate = preparedCases.filter(
      (c) => !skipCaseIds.has(String(c.caseId))
    );

    if (preparedCasesForCreate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "제출할 의뢰가 없습니다.",
      });
    }

    const totalSpendSupply = preparedCasesForCreate.reduce((acc, item) => {
      const n = Number(item?.computedPrice?.amount || 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // duplicateResolution 처리 (레거시 단일 existingRequestId에 대해서만 처리)
        if (duplicateResolution && !duplicateResolutions) {
          const strategy = String(duplicateResolution.strategy || "").trim();
          const existingRequestId = String(
            duplicateResolution.existingRequestId || ""
          ).trim();

          if (
            !existingRequestId ||
            !Types.ObjectId.isValid(existingRequestId)
          ) {
            const err = new Error("유효한 existingRequestId가 필요합니다.");
            err.statusCode = 400;
            throw err;
          }

          const existingDoc = await Request.findById(existingRequestId).session(
            session
          );
          if (!existingDoc) {
            const err = new Error("기존 의뢰를 찾을 수 없습니다.");
            err.statusCode = 404;
            throw err;
          }
          if (!(await canAccessRequestAsRequestor(req, existingDoc))) {
            const err = new Error("기존 의뢰에 접근 권한이 없습니다.");
            err.statusCode = 403;
            throw err;
          }

          const existingStatus = String(existingDoc.status || "");
          const existingStatus2 = String(existingDoc.status2 || "");
          const existingStage = String(
            existingDoc.manufacturerStage || ""
          ).trim();
          const stageOrder = {
            의뢰: 0,
            CAM: 1,
            생산: 2,
            발송: 3,
            완료: 4,
          };
          const currentStageOrder =
            existingStatus2 === "완료"
              ? 4
              : stageOrder[existingStage] ?? stageOrder[existingStatus] ?? 0;
          if (strategy === "replace") {
            if (existingStatus2 === "완료") {
              const err = new Error(
                "완료된 의뢰는 취소 후 재의뢰할 수 없습니다. 재의뢰(리메이크)로 진행해주세요."
              );
              err.statusCode = 400;
              throw err;
            }
            if (currentStageOrder > 1) {
              const err = new Error(
                "생산 이후 단계에서는 기존 의뢰를 교체할 수 없습니다."
              );
              err.statusCode = 400;
              throw err;
            }

            // 기존 의뢰 취소
            if (existingDoc.status !== "취소") {
              applyStatusMapping(existingDoc, "취소");
              await existingDoc.save({ session });
            }
          } else if (strategy === "remake") {
            if (existingStatus2 !== "완료") {
              const err = new Error(
                "진행 중인 의뢰는 재의뢰(리메이크)로 처리할 수 없습니다. 기존 의뢰를 취소하고 재의뢰로 진행해주세요."
              );
              err.statusCode = 400;
              throw err;
            }
          } else {
            const err = new Error(
              "유효한 duplicateResolution.strategy가 필요합니다."
            );
            err.statusCode = 400;
            throw err;
          }
        }

        // duplicateResolutions 처리 (케이스별)
        if (duplicates.length > 0 && duplicateResolutions) {
          const duplicatesByCaseId = new Map(
            duplicates.map((d) => [String(d.caseId || ""), d])
          );

          for (const [caseId, r] of resolutionsByCaseId.entries()) {
            const strategy = String(r?.strategy || "").trim();
            if (strategy !== "replace") continue;

            const dup = duplicatesByCaseId.get(String(caseId));
            const existingRequestId = String(r?.existingRequestId || "").trim();
            if (!dup || !existingRequestId) continue;

            const existingDoc = await Request.findById(
              existingRequestId
            ).session(session);
            if (!existingDoc) {
              const err = new Error("기존 의뢰를 찾을 수 없습니다.");
              err.statusCode = 404;
              throw err;
            }
            if (!(await canAccessRequestAsRequestor(req, existingDoc))) {
              const err = new Error("기존 의뢰에 접근 권한이 없습니다.");
              err.statusCode = 403;
              throw err;
            }

            const existingStatus = String(existingDoc.status || "");
            const existingStage = String(
              existingDoc.manufacturerStage || ""
            ).trim();
            const stageOrder = {
              의뢰: 0,
              CAM: 1,
              생산: 2,
              발송: 3,
              완료: 4,
            };
            const currentStageOrder =
              stageOrder[existingStage] ?? stageOrder[existingStatus] ?? 0;
            if (existingStatus === "완료") {
              const err = new Error(
                "완료된 의뢰는 취소 후 재의뢰할 수 없습니다. 재의뢰(리메이크)로 진행해주세요."
              );
              err.statusCode = 400;
              throw err;
            }
            if (currentStageOrder > 1) {
              const err = new Error(
                "생산 이후 단계에서는 기존 의뢰를 교체할 수 없습니다."
              );
              err.statusCode = 400;
              throw err;
            }

            if (existingDoc.status !== "취소") {
              applyStatusMapping(existingDoc, "취소");
              await existingDoc.save({ session });
            }

            const refundAmount = Number(existingDoc?.price?.amount || 0);
            if (refundAmount > 0) {
              const refundKey = `request:${String(
                existingDoc._id
              )}:case:${String(caseId)}:replace_refund`;
              await CreditLedger.updateOne(
                { uniqueKey: refundKey },
                {
                  $setOnInsert: {
                    organizationId,
                    userId: req.user?._id || null,
                    type: "REFUND",
                    amount: refundAmount,
                    refType: "REQUEST",
                    refId: existingDoc._id,
                    uniqueKey: refundKey,
                  },
                },
                { upsert: true, session }
              );
            }
          }

          for (const [caseId, r] of resolutionsByCaseId.entries()) {
            const strategy = String(r?.strategy || "").trim();
            if (strategy !== "remake") continue;
            const existingRequestId = String(r?.existingRequestId || "").trim();
            if (!existingRequestId) continue;

            const existingDoc = await Request.findById(existingRequestId)
              .select({ _id: 1, status: 1, status2: 1 })
              .session(session);
            if (!existingDoc) {
              const err = new Error("기존 의뢰를 찾을 수 없습니다.");
              err.statusCode = 404;
              throw err;
            }
            if (!(await canAccessRequestAsRequestor(req, existingDoc))) {
              const err = new Error("기존 의뢰에 접근 권한이 없습니다.");
              err.statusCode = 403;
              throw err;
            }
            const existingStatus = String(existingDoc.status || "");
            const existingStatus2 = String(existingDoc.status2 || "");
            if (existingStatus2 !== "완료") {
              const err = new Error(
                "진행 중인 의뢰는 재의뢰(리메이크)로 처리할 수 없습니다. 기존 의뢰를 취소하고 재의뢰로 진행해주세요."
              );
              err.statusCode = 400;
              throw err;
            }
          }
        }

        const { balance } = await getOrganizationCreditBalanceBreakdown({
          organizationId,
          session,
        });

        if (balance < totalSpendSupply) {
          const err = new Error("크레딧이 부족합니다.");
          err.statusCode = 402;
          err.payload = { balance, required: totalSpendSupply };
          throw err;
        }

        const duplicatesByCaseId = new Map(
          duplicates.map((d) => [String(d.caseId || ""), d])
        );

        const { calculateInitialProductionSchedule } = await import(
          "./production.utils.js"
        );

        for (const item of preparedCasesForCreate) {
          const shippingMode = item.shippingMode || "normal";
          const requestedAt = new Date();

          const newRequest = new Request({
            requestor: req.user._id,
            requestorOrganizationId:
              req.user?.role === "requestor" && req.user?.organizationId
                ? req.user.organizationId
                : null,
            caseInfos: item.caseInfosWithFile,
            price: item.computedPrice,
          });

          // 원본 배송 옵션 저장
          newRequest.originalShipping = {
            mode: shippingMode,
            requestedAt,
          };

          // 최종 배송 옵션 초기화
          newRequest.finalShipping = {
            mode: shippingMode,
            updatedAt: requestedAt,
          };

          // 생산 스케줄 계산 (시각 기반)
          const productionSchedule = await calculateInitialProductionSchedule({
            shippingMode,
            maxDiameter: item.caseInfosWithFile?.maxDiameter,
            requestedAt,
          });
          newRequest.productionSchedule = productionSchedule;

          // 하위 호환성을 위해 timeline.estimatedCompletion도 설정 (YYYY-MM-DD)
          newRequest.timeline = newRequest.timeline || {};
          newRequest.timeline.estimatedCompletion =
            productionSchedule.estimatedDelivery.toISOString().slice(0, 10);

          // 완료된 기존 의뢰에 대한 재의뢰(리메이크): referenceIds에 기존 requestId를 남긴다.
          if (duplicateResolution && !duplicateResolutions) {
            if (
              String(duplicateResolution.strategy || "") === "remake" &&
              duplicateResolution.existingRequestId
            ) {
              const existing = duplicates.find(
                (d) =>
                  String(d?.existingRequest?._id || "") ===
                  String(duplicateResolution.existingRequestId)
              );
              const oldRequestId = existing?.existingRequest?.requestId;
              if (oldRequestId) {
                newRequest.referenceIds = Array.from(
                  new Set([
                    ...(newRequest.referenceIds || []),
                    String(oldRequestId),
                  ])
                );
              }
            }
          }

          if (duplicateResolutions) {
            const r = resolutionsByCaseId.get(String(item.caseId));
            if (String(r?.strategy || "") === "remake") {
              const dup = duplicatesByCaseId.get(String(item.caseId));
              const oldRequestId = dup?.existingRequest?.requestId;
              if (oldRequestId) {
                newRequest.referenceIds = Array.from(
                  new Set([
                    ...(newRequest.referenceIds || []),
                    String(oldRequestId),
                  ])
                );
              }
            }
          }

          applyStatusMapping(newRequest, newRequest.status);
          await newRequest.save({ session });
          createdRequests.push(newRequest);

          // [변경] 생산 시작(CAM 승인) 시점에 크레딧을 차감하므로, 의뢰 생성 시점의 SPEND 로직을 제거합니다.
        }
      });
    } catch (e) {
      const statusCode = Number(e?.statusCode || 0);
      if (statusCode === 402) {
        return res.status(402).json({
          success: false,
          message: "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해주세요.",
          data: e.payload || null,
        });
      }
      if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({
          success: false,
          message: e.message || "요청 처리 중 오류가 발생했습니다.",
        });
      }
      throw e;
    } finally {
      session.endSession();
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

    if (isDuplicateKeyError(error)) {
      const msg = String(error?.message || "");
      const isRequestIdDup = msg.includes("requestId");
      return res.status(409).json({
        success: false,
        code: isRequestIdDup ? "REQUEST_ID_CONFLICT" : "DUPLICATE_KEY",
        message: isRequestIdDup
          ? "의뢰 번호 생성이 충돌했습니다. 잠시 후 다시 시도해주세요."
          : "중복된 데이터로 인해 요청을 처리할 수 없습니다. 다시 시도해주세요.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Draft에서 의뢰 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function hasDuplicateCase(req, res) {
  try {
    const { fileName } = req.query;

    // 중복 체크는 “조회 화면 권한”과 별개로 조직 단위로 판단해야 한다.
    // - staff 계정이라도 같은 조직의 기존 의뢰 진행 상태를 기준으로 업로드를 제한해야 함
    // - 레거시 데이터(requestorOrganizationId 누락)도 requestor(member) 기준으로 포함
    let requestFilter = {};
    if (req?.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (orgId && Types.ObjectId.isValid(orgId)) {
        const org = await RequestorOrganization.findById(orgId)
          .select({ owner: 1, owners: 1, members: 1 })
          .lean();

        const memberIdsRaw = [
          String(org?.owner || ""),
          ...(Array.isArray(org?.owners)
            ? org.owners.map((id) => String(id))
            : []),
          ...(Array.isArray(org?.members)
            ? org.members.map((id) => String(id))
            : []),
        ]
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));

        requestFilter = {
          $or: [
            { requestorOrganizationId: new Types.ObjectId(orgId) },
            { requestor: { $in: memberIdsRaw } },
          ],
        };
      } else {
        requestFilter = { requestor: req.user._id };
      }
    }

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "fileName은 필수입니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const normalizeFileName = (v) => {
      if (!v) return "";
      const s = String(v);
      let candidate = s;
      try {
        const hasHangul = /[가-힣]/.test(s);
        const bytes = new Uint8Array(
          Array.from(s).map((ch) => ch.charCodeAt(0) & 0xff)
        );
        const decoded = new TextDecoder("utf-8").decode(bytes);
        const decodedHasHangul = /[가-힣]/.test(decoded);
        candidate = !hasHangul && decodedHasHangul ? decoded : s;
      } catch {
        candidate = s;
      }

      const base = String(candidate)
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .slice(-1)[0];

      return base
        .normalize("NFC")
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase();
    };

    const normalizedFileName = normalizeFileName(fileName);

    // 모든 Request를 검색하여 파일명 매칭 확인
    const allRequests = await Request.find({
      ...requestFilter,
      status: { $ne: "취소" },
      createdAt: { $gte: cutoff },
    })
      .select({
        _id: 1,
        requestId: 1,
        status: 1,
        status2: 1,
        manufacturerStage: 1,
        caseInfos: 1,
        price: 1,
        createdAt: 1,
      })
      .lean();

    const stageOrderMap = {
      의뢰: 0,
      의뢰접수: 0,
      CAM: 1,
      가공전: 1,
      생산: 2,
      가공후: 2,
      발송: 3,
      추적관리: 3,
      배송대기: 3,
      배송중: 3,
      완료: 4,
    };

    const computeStageOrder = (doc) => {
      const st = String(doc?.manufacturerStage || "").trim();
      const status = String(doc?.status || "").trim();
      const status2 = String(doc?.status2 || "").trim();

      if (status2 === "완료") return 4;

      // manufacturerStage가 authoritative. 레거시 status는 fallback으로만 사용.
      return stageOrderMap[st] ?? stageOrderMap[status] ?? 0;
    };

    let existing = null;
    let existingStageOrder = -1;
    let existingCreatedAt = null;

    for (const r of allRequests) {
      const caseInfosList = Array.isArray(r?.caseInfos)
        ? r.caseInfos
        : r?.caseInfos
        ? [r.caseInfos]
        : [];

      const matched = caseInfosList.some((ci) => {
        const storedName =
          ci?.file?.fileName ||
          ci?.file?.originalName ||
          ci?.fileName ||
          ci?.file_name;
        const normalizedStoredName = normalizeFileName(storedName);
        if (!normalizedStoredName) return false;
        return normalizedStoredName === normalizedFileName;
      });

      if (!matched) continue;

      const so = computeStageOrder(r);
      const ca = r?.createdAt ? new Date(r.createdAt) : null;
      const shouldReplace =
        existing == null ||
        so > existingStageOrder ||
        (so === existingStageOrder &&
          ca &&
          (!existingCreatedAt || ca.getTime() > existingCreatedAt.getTime()));

      if (shouldReplace) {
        existing = r;
        existingStageOrder = so;
        existingCreatedAt = ca;
      }
    }

    if (!existing) {
      // 매칭되는 파일명이 없으면 중복 아님
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          hasDuplicate: false,
          stageOrder: -1,
          status: null,
          manufacturerStage: null,
          existingRequest: null,
        },
      });
    }

    const stageOrder = existing ? computeStageOrder(existing) : -1;

    return res.status(200).json({
      success: true,
      data: {
        exists: Boolean(existing),
        hasDuplicate: Boolean(existing),
        stageOrder,
        status: existing?.status,
        status2: existing?.status2,
        manufacturerStage: existing?.manufacturerStage,
        existingRequest: existing
          ? {
              _id: existing._id,
              requestId: existing.requestId,
              status: existing.status,
              status2: existing.status2,
              manufacturerStage: existing.manufacturerStage,
              caseInfos: existing.caseInfos,
              price: existing.price ? { amount: existing.price.amount } : null,
              createdAt: existing.createdAt,
            }
          : null,
      },
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
