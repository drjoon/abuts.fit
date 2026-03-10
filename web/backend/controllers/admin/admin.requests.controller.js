import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";

export async function getAllRequests(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
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
      .populate("manufacturer", "name email business")
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
      return res.status(400).json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    const request = await Request.findById(requestId)
      .populate("requestor", "name email business")
      .populate("manufacturer", "name email business");
    if (!request) {
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
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

export async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status, statusNote } = req.body;
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const validStatuses = ["의뢰", "CAM", "생산", "발송", "완료", "취소"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "유효하지 않은 상태입니다." });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const statusHistory = {
      status,
      note: statusNote || "",
      updatedBy: req.user.id,
      updatedAt: new Date(),
    };

    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        status,
        $push: { statusHistory },
      },
      { new: true },
    )
      .populate("requestor", "name email business")
      .populate("manufacturer", "name email business");

    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    res.status(200).json({
      success: true,
      message: "의뢰 상태가 성공적으로 변경되었습니다.",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function assignManufacturer(req, res) {
  try {
    const requestId = req.params.id;
    const { manufacturerId } = req.body;
    if (
      !Types.ObjectId.isValid(requestId) ||
      !Types.ObjectId.isValid(manufacturerId)
    ) {
      return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
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
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        manufacturer: manufacturerId,
        assignedAt: new Date(),
      },
      { new: true },
    )
      .populate("requestor", "name email business")
      .populate("manufacturer", "name email business");

    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    res.status(200).json({
      success: true,
      message: "제조사가 성공적으로 할당되었습니다.",
      data: {
        ...result,
        manufacturer: result.manufacturer?._id || result.manufacturer,
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
