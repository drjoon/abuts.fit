// change-log:
// - 2026-08-03: manufacturerStage request 단계 SSOT를 '준비' 단일값으로 통일하고 '의뢰' 레거시 허용을 제거.
// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import { updateRequestStatus as updateManufacturerStage } from "../requests/common.requests.controller.js";

export async function getAllRequests(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.manufacturerStage = req.query.status;
    if (req.query.manufacturerStage) filter.manufacturerStage = req.query.manufacturerStage;
    if (req.query.requestorId) {
      const requestorId = String(req.query.requestorId || "").trim();
      if (!Types.ObjectId.isValid(requestorId)) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 requestorId입니다.",
        });
      }
      filter.requestor = new Types.ObjectId(requestorId);
    }
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
        { requestId: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1;
    }

    const requests = await Request.find(filter)
      .populate("requestor", "name email business")
      .populate("caManufacturer", "name email business")
      .sort(sort)
      .skip(skip)
      .limit(limit);
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
    if (!Types.ObjectId.isValid(requestId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    const request = await Request.findById(requestId)
      .populate("requestor", "name email business")
      .populate("caManufacturer", "name email business");
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }
    res.status(200).json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상세 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/** 예전 관리자 상태 라벨 → manufacturerStage. */
const LEGACY_ADMIN_STATUS_TO_STAGE = {
  준비: "준비",
  가공: "가공",
  발송: "포장.발송",
  완료: "추적관리",
  취소: "취소",
};

/**
 * PATCH /api/admin/requests/:id/status
 * 공정 단계 변경은 `PATCH /api/requests/:id/status`(크레딧·취소 부수효과 포함) 하나로 처리한다.
 * 예전 body `{ status }`도 받아 manufacturerStage로 바꿔 넘긴다.
 */
export async function updateRequestStatus(req, res) {
  const raw = String(req.body?.manufacturerStage || req.body?.status || "").trim();
  const manufacturerStage = LEGACY_ADMIN_STATUS_TO_STAGE[raw] || raw;
  req.body = { ...(req.body || {}), manufacturerStage };
  return updateManufacturerStage(req, res);
}

export async function assignManufacturer(req, res) {
  try {
    const requestId = req.params.id;
    const { manufacturerId } = req.body;
    if (
      !Types.ObjectId.isValid(requestId) ||
      !Types.ObjectId.isValid(manufacturerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 ID입니다." });
    }

    const manufacturer = await User.findById(manufacturerId);
    if (!manufacturer || manufacturer.role !== "manufacturer") {
      return res.status(400).json({
        success: false,
        message: "유효한 제조사를 찾을 수 없습니다.",
      });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        caManufacturer: manufacturerId,
        assignedAt: new Date(),
      },
      { new: true },
    )
      .populate("requestor", "name email business")
      .populate("caManufacturer", "name email business");

    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    res.status(200).json({
      success: true,
      message: "제조사가 성공적으로 할당되었습니다.",
      data: {
        ...result,
        caManufacturer: result.caManufacturer?._id || result.caManufacturer,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "제조사 할당 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기존 의뢰의 businessAnchorId 복구 (관리자 전용)
 * @route POST /api/admin/requests/fix-business-anchor-id
 */
export async function fixMissingBusinessAnchorId(req, res) {
  try {
    // businessAnchorId가 null인 의뢰 조회
    const requestsWithoutAnchor = await Request.find({
      businessAnchorId: null,
    })
      .populate("requestor", "businessAnchorId")
      .lean();

    let updatedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const request of requestsWithoutAnchor) {
      const requestorBusinessAnchorId = request.requestor?.businessAnchorId;

      if (requestorBusinessAnchorId) {
        await Request.updateOne(
          { _id: request._id },
          { $set: { businessAnchorId: requestorBusinessAnchorId } },
        );
        updates.push({
          requestId: request.requestId,
          businessAnchorId: requestorBusinessAnchorId.toString(),
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `businessAnchorId 복구 완료: ${updatedCount}건 업데이트, ${skippedCount}건 건너뜀`,
      data: {
        updatedCount,
        skippedCount,
        updates,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "businessAnchorId 복구 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
