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

    // 의뢰 상태가 '의뢰접수' 또는 '가공전'일 때만 일부 필드 수정 가능
    // (requestor는 가공 시작 전까지 환자/임플란트 정보를 수정 가능)
    if (!isAdmin && !["의뢰접수", "가공전"].includes(request.status)) {
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

    // 취소는 의뢰접수/가공전 상태에서만 가능
    if (status === "취소" && !["의뢰접수", "가공전"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: "의뢰접수 또는 가공전 상태에서만 취소할 수 있습니다.",
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

    // 가공 시작 시점(가공전 진입)에서만 로트넘버 부여
    if (status === "가공전") {
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
    request.caseInfos.camFile = {
      fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    applyStatusMapping(request, "가공후");
    await request.save();

    return res.status(200).json({
      success: true,
      message: "CAM 결과가 저장되고 상태가 가공후로 변경되었습니다.",
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

    // camFile 제거, 상태 롤백
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.camFile = undefined;
    request.status = "가공전";
    request.status1 = "가공";
    request.status2 = undefined;

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

    const rawOriginal =
      request.caseInfos?.file?.fileName ||
      request.caseInfos?.file?.originalName;

    const getBaseName = (n) => {
      const s = String(n || "");
      if (!s.includes(".")) return s;
      return s.split(".").slice(0, -1).join(".");
    };

    const expectedNcName = rawOriginal ? `${getBaseName(rawOriginal)}.nc` : "";

    const lowerName = normalize(fileName);
    if (!lowerName.endsWith(".nc")) {
      return res.status(400).json({
        success: false,
        message: "NC 파일(.nc)만 업로드할 수 있습니다.",
      });
    }
    if (expectedNcName && normalize(expectedNcName) !== lowerName) {
      return res.status(400).json({
        success: false,
        message: `파일명 불일치: 원본과 동일한 파일명(${expectedNcName})으로 업로드해주세요.`,
      });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.ncFile = {
      fileName: expectedNcName || fileName,
      originalName: expectedNcName || fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 제조사 공정: CAM(가공/후) -> 가공(중)
    request.status1 = "가공";
    request.status2 = "중";

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 저장되고 가공 단계로 이동합니다.",
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

    // 제조사 공정: 가공(중) -> CAM(가공/후)
    request.status1 = "가공";
    request.status2 = "후";

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
