import mongoose, { Types } from "mongoose";
import path from "path";
import Request from "../../models/request.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import User from "../../models/user.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPacking,
  buildRequestorOrgScopeFilter,
  computePriceForRequest,
  normalizeCaseInfosImplantFields,
  getTodayYmdInKst,
  bumpRollbackCount,
} from "./utils.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";
import { getAllProductionQueues } from "../cnc/shared.js";
import { getOrganizationCreditBalanceBreakdown } from "./creation.helpers.controller.js";
import s3Utils, {
  deleteFileFromS3,
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

const BRIDGE_PROCESS_BASE =
  process.env.BRIDGE_NODE_URL ||
  process.env.BRIDGE_PROCESS_BASE ||
  process.env.CNC_BRIDGE_BASE ||
  process.env.BRIDGE_BASE ||
  "http://localhost:8002";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

async function ensureDeliveryInfoShippedAtNow({ request, session }) {
  if (!request) return;

  const existingRef = request.deliveryInfoRef;
  const now = new Date();

  if (existingRef) {
    const di = await DeliveryInfo.findById(existingRef)
      .session(session || null)
      .catch(() => null);
    if (di && !di.shippedAt) {
      di.shippedAt = now;
      await di.save({ session });
    }
    return;
  }

  const created = await DeliveryInfo.create(
    [
      {
        request: request._id,
        shippedAt: now,
      },
    ],
    { session },
  ).catch(() => null);

  const doc = Array.isArray(created) ? created[0] : null;
  if (doc?._id) {
    request.deliveryInfoRef = doc._id;
  }
}

export async function getRequestSummaryByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId) {
      return res
        .status(400)
        .json({ success: false, message: "requestId is required" });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const request = await Request.findOne({ requestId }).select({
      requestId: 1,
      caseInfos: 1,
    });
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const tooth = request?.caseInfos?.tooth ?? null;
    const maxDiameter =
      typeof request?.caseInfos?.maxDiameter === "number"
        ? request.caseInfos.maxDiameter
        : null;

    return res.json({
      success: true,
      data: {
        requestId: request.requestId,
        tooth,
        maxDiameter,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "요약 조회 실패" });
  }
}

export async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const role = req.user?.role;
    let filter = {};
    if (req.query.status) filter.manufacturerStage = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 제조사: 본인에게 배정되었거나 미배정된 의뢰 + 취소 제외
    if (role === "manufacturer") {
      filter = {
        $and: [
          filter,
          { manufacturerStage: { $ne: "취소" } },
          {
            $or: [
              { manufacturer: req.user._id },
              { manufacturer: null },
              { manufacturer: { $exists: false } },
            ],
          },
        ],
      };
    }

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
      .populate("requestor", "name email organization phoneNumber address")
      .populate("deliveryInfoRef")
      .populate("requestorOrganizationId", "name extracted")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const now = new Date();
    const requests = await Promise.all(
      rawRequests.map(async (r) => {
        const shippingPriority = await computeShippingPriority({
          request: r,
          now,
        });
        const reqOrg = r?.requestorOrganizationId || null;
        return {
          ...r,
          requestorOrganization: reqOrg,
          shippingPriority,
        };
      }),
    );

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

export async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 소속 기공소(조직) 기준
    const filter = await buildRequestorOrgScopeFilter(req);
    if (req.query.status) filter.manufacturerStage = req.query.status;
    if (req.query.statusIn) {
      const raw = Array.isArray(req.query.statusIn)
        ? req.query.statusIn
        : [req.query.statusIn];
      const values = raw.map((v) => String(v || "").trim()).filter(Boolean);
      if (values.length) {
        filter.manufacturerStage = { $in: values };
      }
    }
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
      .select("-messages -statusHistory") // 상세 내역 조회 시 불필요한 큰 필드 제외
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
        "name email phoneNumber organization organizationId role",
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
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

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
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

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

    // CAM 승인 후 임플란트 정보 수정 차단 (관리자 제외)
    if (!isAdmin && camApproved && updateData.caseInfos) {
      return res.status(400).json({
        success: false,
        message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
      });
    }

    // 의뢰 상태별 수정 가능 필드 제한 (비관리자)
    let caseInfosAllowed = true;
    if (!isAdmin) {
      const stageStatus = String(request.manufacturerStage || "");

      // CAM 승인 이후(또는 가공/세척.포장/발송/추적 단계)는 caseInfos 수정 전면 차단
      const afterCam =
        camApproved ||
        ["가공", "세척.포장", "발송", "추적관리"].includes(stageStatus) ||
        (stageStatus === "CAM" && camApproved);

      if (afterCam) {
        const allowedTopLevelFields = [
          "messages",
          "patientName",
          "patientAge",
          "patientGender",
        ];
        Object.keys(updateData).forEach((key) => {
          if (key !== "caseInfos" && !allowedTopLevelFields.includes(key)) {
            delete updateData[key];
          }
        });
        if (updateData.caseInfos) {
          return res.status(400).json({
            success: false,
            message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
          });
        }
        caseInfosAllowed = false;
      } else if (stageStatus === "의뢰") {
        // 제한 없음
      } else if (stageStatus === "CAM") {
        // CAM 승인 전: 제한 없음 (caseInfos 허용)
      }
    }

    // caseInfos 정규화 (허용되는 단계에서만)
    if (
      caseInfosAllowed &&
      updateData &&
      updateData.caseInfos &&
      typeof updateData.caseInfos === "object"
    ) {
      if (
        typeof updateData.caseInfos.connectionType === "string" &&
        !updateData.caseInfos.implantType
      ) {
        updateData.caseInfos.implantType = updateData.caseInfos.connectionType;
      }
      delete updateData.caseInfos.connectionType;

      updateData.caseInfos = await normalizeCaseInfosImplantFields(
        updateData.caseInfos,
      );
    } else if (!caseInfosAllowed && updateData?.caseInfos) {
      // 허용되지 않는 경우 caseInfos 삭제
      delete updateData.caseInfos;
    }

    // 의뢰 수정
    const updatedRequest = await Request.findById(requestId);
    if (updatedRequest) {
      Object.assign(updatedRequest, updateData);
      await updatedRequest.save();
    }

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

export async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    // 상태 유효성 검사 (새 워크플로우)
    const validStatuses = [
      "의뢰",
      "CAM",
      "가공",
      "세척.포장",
      "발송",
      "추적관리",
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
      "organizationId",
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

    // 취소는 의뢰/CAM 단계에서만 가능 (manufacturerStage도 허용 범위에 포함)
    if (status === "취소") {
      const manufacturerStage = String(request.manufacturerStage || "").trim();
      const allowedCancelStages = ["의뢰", "CAM"];
      const isStageAllowed = allowedCancelStages.includes(manufacturerStage);

      if (!isStageAllowed) {
        return res.status(400).json({
          success: false,
          message:
            "의뢰 또는 CAM 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
        });
      }
    }

    // 의뢰 상태 변경
    applyStatusMapping(request, status);

    // 신속 배송이 출고(배송중)로 전환되면, 그동안 쌓인 묶음(일반) 배송대기 건도 함께 출고 처리
    // 완료 판단은 reviewByStage.shipping 승인 여부로 처리한다.
    if (status === "배송중" && request.shippingMode === "express") {
      const groupFilter = request.requestorOrganizationId
        ? { requestorOrganizationId: request.requestorOrganizationId }
        : request.requestor?.organizationId
          ? { requestorOrganizationId: request.requestor.organizationId }
          : { requestor: request.requestor };
      await Request.updateMany(
        {
          ...groupFilter,
          manufacturerStage: { $nin: ["취소", "추적관리"] },
          "caseInfos.reviewByStage.shipping.status": { $ne: "APPROVED" },
          shippingMode: "normal",
          _id: { $ne: request._id },
        },
        {
          $set: {
            manufacturerStage: "발송",
          },
        },
      );
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
      "organizationId",
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

    // 단계 검증: 관리자면 가공(machining) 단계 이전까지, 의뢰자면 의뢰/CAM 단계까지만 허용
    const stageStatus = String(request.manufacturerStage || "");
    const isAdmin = req.user.role === "admin";

    const deletableStages = isAdmin ? ["의뢰", "CAM", "가공"] : ["의뢰", "CAM"];

    if (!deletableStages.includes(stageStatus)) {
      return res.status(400).json({
        success: false,
        message: isAdmin
          ? "발송 단계 이후의 의뢰는 삭제할 수 없습니다."
          : "가공 단계 이후의 의뢰는 직접 삭제할 수 없습니다. 고객센터에 문의해주세요.",
      });
    }

    // 의뢰 취소 처리 (상태를 '취소'로 변경)
    applyStatusMapping(request, "취소");
    await request.save();

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
