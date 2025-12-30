import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  buildRequestorOrgScopeFilter,
} from "./utils.js";
import s3Utils, {
  deleteFileFromS3,
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";

const mapManufacturerStage = (request) => {
  const main = (request.status || "").trim();

  switch (main) {
    case "의뢰":
    case "의뢰접수":
      return "의뢰";
    case "CAM":
      return "CAM";
    case "생산":
      return "생산";
    case "발송":
    case "완료":
      return "발송";
    case "취소":
      return "의뢰";
    default:
      return "의뢰";
  }
};

const ensureReviewByStageDefaults = (request) => {
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  request.caseInfos.reviewByStage.request = request.caseInfos.reviewByStage
    .request || { status: "PENDING" };
  request.caseInfos.reviewByStage.cam = request.caseInfos.reviewByStage.cam || {
    status: "PENDING",
  };
  request.caseInfos.reviewByStage.machining = request.caseInfos.reviewByStage
    .machining || { status: "PENDING" };
  request.caseInfos.reviewByStage.packaging = request.caseInfos.reviewByStage
    .packaging || { status: "PENDING" };
  request.caseInfos.reviewByStage.shipping = request.caseInfos.reviewByStage
    .shipping || { status: "PENDING" };
  request.caseInfos.reviewByStage.tracking = request.caseInfos.reviewByStage
    .tracking || { status: "PENDING" };
};

const revertManufacturerStageByReviewStage = (request, stage) => {
  const map = {
    request: "의뢰",
    cam: "CAM",
    machining: "생산",
    packaging: "생산",
    shipping: "발송",
    tracking: "추적관리",
  };
  const target = map[String(stage || "").trim()];
  if (target) {
    request.manufacturerStage = target;
  }
};

export async function deleteStageFile(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "").trim();
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    const allowed = ["machining", "packaging", "shipping", "tracking"];

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    const meta = request.caseInfos.stageFiles?.[stage] || null;
    const s3Key = meta?.s3Key;

    if (rollbackOnly) {
      request.caseInfos.reviewByStage[stage] = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      const prevStageMap = {
        machining: "CAM",
        packaging: "CAM",
        shipping: "생산",
        tracking: "발송",
      };
      const prevStage = prevStageMap[stage];
      if (prevStage) {
        request.manufacturerStage = prevStage;
      }

      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "삭제할 파일이 없습니다.",
      });
    }

    try {
      await deleteFileFromS3(s3Key);
    } catch {
      // ignore S3 delete errors
    }

    delete request.caseInfos.stageFiles[stage];

    request.caseInfos.reviewByStage[stage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    // stageFiles의 stage는 reviewByStage 키와 동일한 문자열을 사용
    revertManufacturerStageByReviewStage(request, stage);

    await request.save();

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

const advanceManufacturerStageByReviewStage = async ({ request, stage }) => {
  if (stage === "request") {
    applyStatusMapping(request, "CAM");
    return;
  }

  if (stage === "cam") {
    applyStatusMapping(request, "생산");
    return;
  }

  if (stage === "machining" || stage === "packaging") {
    applyStatusMapping(request, "발송");
    return;
  }

  if (stage === "shipping") {
    applyStatusMapping(request, "발송"); // '발송' 상태 내에서 상세 단계(status2)만 변경됨
    return;
  }

  if (stage === "tracking") {
    applyStatusMapping(request, "추적관리");
  }
};

export async function updateReviewStatusByStage(req, res) {
  try {
    const { id } = req.params;
    const { stage, status, reason } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "변경 권한이 없습니다." });
    }

    const allowedStages = [
      "request",
      "cam",
      "machining",
      "packaging",
      "shipping",
      "tracking",
    ];
    if (!allowedStages.includes(String(stage || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }

    const allowedStatuses = ["PENDING", "APPROVED", "REJECTED"];
    if (!allowedStatuses.includes(String(status || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 status 입니다.",
      });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    ensureReviewByStageDefaults(request);
    request.caseInfos.reviewByStage[stage] = {
      status,
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: String(reason || ""),
    };

    // 승인 시 다음 공정으로 전환, 미승인(PENDING) 시 현재 단계로 되돌림
    if (status === "APPROVED") {
      await advanceManufacturerStageByReviewStage({ request, stage });
    } else if (status === "PENDING") {
      revertManufacturerStageByReviewStage(request, stage);
    }

    await request.save();

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "검토 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getStageFileUrl(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "").trim();
    const allowed = ["machining", "packaging", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const meta = request?.caseInfos?.stageFiles?.[stage];
    const s3Key = meta?.s3Key;
    const fileName = meta?.fileName || `${stage}-file`;
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveStageFile(req, res) {
  try {
    const { id } = req.params;
    const {
      stage,
      fileName,
      fileType,
      fileSize,
      s3Key,
      s3Url,
      filePath,
      source,
    } = req.body || {};

    const allowed = ["machining", "packaging", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(String(stage || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (!fileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const normalizedStage = String(stage || "").trim();
    const normalizedSource =
      String(source || "manual").trim() === "worker" ? "worker" : "manual";

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    request.caseInfos.stageFiles[normalizedStage] = {
      fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      source: normalizedSource,
      uploadedBy: req.user?._id,
      uploadedAt: new Date(),
    };

    request.caseInfos.reviewByStage[normalizedStage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    await request.save();

    return res.status(200).json({
      success: true,
      message: "파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 의뢰 목록 조회 (관리자용)
 * @route GET /api/requests/all
 */
export async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      // requestor 필터가 있다면 제거 (현재 코드에서는 위에서 requestor를 설정하지 않지만, 혹시 모를 로직에 대비)
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
    const rawRequests = await Request.find(filter)
      .select("-messages")
      .populate("requestor", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = rawRequests;

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
export async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 소속 기공소(조직) 기준
    const filter = await buildRequestorOrgScopeFilter(req);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

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
    const rawRequests = await Request.find(filter)
      .select("-messages")
      .populate("requestor", "name email organization organizationId")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = rawRequests;

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
export async function getRequestById(req, res) {
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
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate(
        "requestor",
        "name email phoneNumber organization organizationId role"
      );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 조회 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 접근할 권한이 없습니다.",
      });
    }

    const normalized = await normalizeRequestForResponse(request);
    res.status(200).json({
      success: true,
      data: normalized,
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
export async function updateRequest(req, res) {
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
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate("requestor", "organizationId");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 수정 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
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

    // 의뢰 상태가 '의뢰' 또는 'CAM'일 때만 일부 필드 수정 가능
    // (requestor는 가공 시작 전까지 환자/임플란트 정보를 수정 가능)
    if (
      !isAdmin &&
      !["의뢰", "CAM", "의뢰접수", "가공전"].includes(request.status)
    ) {
      const allowedFields = ["messages"];
      Object.keys(updateData).forEach((key) => {
        if (!allowedFields.includes(key)) {
          delete updateData[key];
        }
      });
    }

    if (
      updateData &&
      updateData.caseInfos &&
      typeof updateData.caseInfos === "object"
    ) {
      // 레거시 connectionType이 넘어오면 implantType으로 흡수
      if (
        typeof updateData.caseInfos.connectionType === "string" &&
        !updateData.caseInfos.implantType
      ) {
        updateData.caseInfos.implantType = updateData.caseInfos.connectionType;
      }
      delete updateData.caseInfos.connectionType;

      updateData.caseInfos = await normalizeCaseInfosImplantFields(
        updateData.caseInfos
      );
    }

    // 의뢰 수정
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    const normalized = await normalizeRequestForResponse(updatedRequest);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 수정되었습니다.",
      data: normalized,
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
export async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    // 상태 유효성 검사 (새 워크플로우)
    const validStatuses = ["의뢰", "CAM", "생산", "발송", "추적관리", "취소"];
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
    const request = await Request.findById(requestId).populate(
      "requestor",
      "organizationId"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 상태 변경 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
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

    // 취소는 의뢰 또는 CAM 상태에서만 가능
    if (
      status === "취소" &&
      !["의뢰", "CAM", "의뢰접수", "가공전"].includes(request.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "의뢰 또는 CAM 상태에서만 취소할 수 있습니다.",
      });
    }

    // 의뢰 상태 변경 (status1/status2 동기화 포함)
    applyStatusMapping(request, status);

    // 신속 배송이 출고(배송중)로 전환되면, 그동안 쌓인 묶음(일반) 배송대기 건도 함께 출고 처리
    if (status === "배송중" && request.shippingMode === "express") {
      const groupFilter = request.requestorOrganizationId
        ? { requestorOrganizationId: request.requestorOrganizationId }
        : request.requestor?.organizationId
        ? { requestorOrganizationId: request.requestor.organizationId }
        : { requestor: request.requestor };
      await Request.updateMany(
        {
          ...groupFilter,
          status: "배송대기",
          shippingMode: "normal",
          _id: { $ne: request._id },
        },
        {
          $set: {
            status: "배송중",
            status1: "배송",
            status2: "중",
          },
        }
      );
    }

    // 가공 시작 시점(CAM 진입)에서만 로트넘버 부여
    if (status === "CAM" || status === "가공전") {
      await ensureLotNumberForMachining(request);
    }

    await request.save();

    // 취소 시 크레딧 환불(차감 SPEND가 있는 경우에만)
    if (status === "취소") {
      const organizationId =
        request.requestorOrganizationId || request.requestor?.organizationId;

      if (organizationId) {
        const spendRows = await CreditLedger.find({
          organizationId,
          type: "SPEND",
          refType: "REQUEST",
          refId: request._id,
        })
          .select({ amount: 1 })
          .lean();

        const totalSpend = (spendRows || []).reduce((acc, r) => {
          const n = Number(r?.amount || 0);
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);

        const refundAmount = Math.abs(totalSpend);
        if (refundAmount > 0) {
          const uniqueKey = `request:${String(request._id)}:cancel_refund`;
          await CreditLedger.updateOne(
            { uniqueKey },
            {
              $setOnInsert: {
                organizationId,
                userId: req.user?._id || null,
                type: "REFUND",
                amount: refundAmount,
                refType: "REQUEST",
                refId: request._id,
                uniqueKey,
              },
            },
            { upsert: true }
          );
        }
      }
    }

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
 * 제조사/관리자: 의뢰 원본 STL 다운로드 URL 생성
 * @route GET /api/requests/:id/original-file-url
 */
export async function getOriginalFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사 또는 관리자만 접근
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.file?.s3Key;
    const fileName =
      request?.caseInfos?.file?.fileName ||
      request?.caseInfos?.file?.originalName ||
      "download.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "원본 STL 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "원본 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: CAM 결과 STL 다운로드 URL 생성
 * @route GET /api/requests/:id/cam-file-url
 */
export async function getCamFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사 또는 관리자만 접근
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.camFile?.s3Key;
    const fileName =
      request?.caseInfos?.camFile?.fileName ||
      request?.caseInfos?.camFile?.originalName ||
      "cam-output.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "CAM STL 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: CAM 결과 업로드 메타 저장 및 상태 가공후 전환
 * @route POST /api/requests/:id/cam-file
 * body: { fileName, fileType, fileSize, s3Key, s3Url }
 */
export async function saveCamFileAndCompleteCam(req, res) {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, s3Key, s3Url, filePath } = req.body;

    if (!fileName || !s3Key || !s3Url) {
      throw new ApiError(400, "필수 파일 정보가 없습니다.");
    }

    const request = await Request.findById(id);
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.cam = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.camFile = {
      fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 업로드 시 공정 전환은 하지 않고, 기존 단계 유지 (수동 승인 버튼 클릭 시에만 전환)
    // request.manufacturerStage = "CAM";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "CAM 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
/**
 * 제조사/관리자: CAM 결과 파일 제거 및 상태 가공전으로 롤백
 * @route DELETE /api/requests/:id/cam-file
 */
export async function deleteCamFileAndRollback(req, res) {
  try {
    const { id } = req.params;
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    // 롤백 전용 모드: 파일/정보 삭제 없이 공정 단계만 변경
    if (rollbackOnly) {
      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage.cam = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      request.manufacturerStage = "의뢰";
      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    // camFile 제거, 상태 롤백
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.camFile = undefined;
    request.status = "의뢰접수";
    request.status1 = "가공";
    request.status2 = "전";
    request.lotNumber = undefined; // 의뢰 단계로 복귀 시 로트번호 반납
    request.manufacturerStage = mapManufacturerStage(request);

    await request.save();

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getNcFileUrl(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    const fileName =
      request?.caseInfos?.ncFile?.fileName ||
      request?.caseInfos?.ncFile?.originalName ||
      "program.nc";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "NC 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveNcFileAndMoveToMachining(req, res) {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, s3Key, s3Url, filePath } = req.body;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!fileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const normalize = (name) => {
      try {
        return String(name || "")
          .trim()
          .normalize("NFC")
          .toLowerCase();
      } catch {
        return String(name || "")
          .trim()
          .toLowerCase();
      }
    };

    const getBaseName = (n) => {
      let s = String(n || "").trim();
      if (!s) return "";
      // .cam.stl, .stl, .nc 등 모든 확장자 제거
      // 가장 마지막 점부터 제거하는 것이 아니라, 알려진 확장자들을 순차적으로 제거
      s = s.replace(/\.cam\.stl$/i, "");
      s = s.replace(/\.stl$/i, "");
      s = s.replace(/\.nc$/i, "");
      return s;
    };

    const originalBase = getBaseName(
      request.caseInfos?.file?.fileName || request.caseInfos?.file?.originalName
    );
    const camBase = getBaseName(
      request.caseInfos?.camFile?.fileName ||
        request.caseInfos?.camFile?.originalName
    );

    const originalName =
      request.caseInfos?.camFile?.fileName ||
      request.caseInfos?.camFile?.originalName ||
      request.caseInfos?.file?.fileName ||
      request.caseInfos?.file?.originalName ||
      "";

    const lowerName = normalize(fileName);
    const uploadedBase = getBaseName(lowerName);

    if (!lowerName.endsWith(".nc")) {
      return res.status(400).json({
        success: false,
        message: "NC 파일(.nc)만 업로드할 수 있습니다.",
      });
    }

    // 파일명 매칭 검사 (자동 매칭 드롭 시에만 엄격하게 적용하기 위해,
    // 여기서는 최소한의 검증만 수행하거나 경고 메시지 정도로 완화 가능)
    const matchesOriginal =
      originalBase && normalize(originalBase) === normalize(uploadedBase);
    const matchesCam =
      camBase && normalize(camBase) === normalize(uploadedBase);

    // 상세 페이지에서 직접 업로드하는 경우(파일명이 program.nc 등일 수 있음)를 위해
    // 매칭 실패 시에도 업로드는 허용하되, 가급적 매칭을 권장
    // 단, 아예 다른 환자의 파일이 올라가는 것을 방지하기 위해 최소한의 식별자가 있다면 체크하는 것이 좋으나
    // 현재는 사용자 편의를 위해 매칭 실패 시에도 저장을 허용하도록 수정합니다.

    const finalNcName = lowerName;

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.machining = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.ncFile = {
      fileName: finalNcName,
      originalName: originalName || fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 업로드 시 공정 전환은 하지 않고, 생산(검토) 대상으로만 전환
    request.manufacturerStage = "생산";

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteNcFileAndRollbackCam(req, res) {
  try {
    const { id } = req.params;
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    if (s3Key) {
      try {
        await deleteFileFromS3(s3Key);
      } catch (e) {
        console.warn("delete nc file s3 failed", e);
      }
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.ncFile = undefined;
    if (request.caseInfos.reviewByStage?.machining) {
      request.caseInfos.reviewByStage.machining.status = "PENDING";
      request.caseInfos.reviewByStage.machining.updatedAt = new Date();
      request.caseInfos.reviewByStage.machining.updatedBy = req.user?._id;
      request.caseInfos.reviewByStage.machining.reason = "";
    }

    // 제조사 공정: 가공(중) -> CAM(가공/후) 또는 의뢰(의뢰접수)
    const isRollbackToRequest = req.query.nextStage === "request";
    if (isRollbackToRequest) {
      request.status = "의뢰접수";
      request.status1 = "가공";
      request.status2 = "전";
    } else {
      request.status = "가공후";
      request.status1 = "가공";
      request.status2 = "후";
    }
    request.manufacturerStage = mapManufacturerStage(request);

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 삭제되고 CAM 단계로 되돌아갑니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 삭제 (관리자 또는 의뢰자 본인만 가능)
 * @route DELETE /api/requests/:id
 */
export async function deleteRequest(req, res) {
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
    const request = await Request.findById(requestId).populate(
      "requestor",
      "organizationId"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 권한 검증: 관리자이거나 같은 기공소(조직) 의뢰자만 삭제 가능
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    if (req.user.role !== "admin" && !isRequestor) {
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
