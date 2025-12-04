import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import { Types } from "mongoose";

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
async function createRequest(req, res) {
  console.log("createRequest req.user:", req.user);
  console.log("createRequest req.body:", req.body);
  try {
    const newRequest = new Request({
      ...req.body,
      requestor: req.user._id,
    });

    await newRequest.save();

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
 * 현재 로그인한 의뢰인의 최다 사용 임플란트 조합 조회
 * @route GET /api/requests/my/favorite-implant
 */
async function getMyFavoriteImplant(req, res) {
  try {
    const requestorId = req.user._id;

    const [favorite] = await Request.aggregate([
      { $match: { requestor: requestorId } },
      {
        $group: {
          _id: {
            implantManufacturer: "$implantManufacturer",
            implantSystem: "$implantSystem",
            implantType: "$implantType",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    if (!favorite) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const { implantManufacturer, implantSystem, implantType } = favorite._id;

    res.status(200).json({
      success: true,
      data: {
        implantManufacturer,
        implantSystem,
        implantType,
        count: favorite.count,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "선호 임플란트 정보를 조회하는 중 오류가 발생했습니다.",
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
      .populate("manufacturer", "name email organization")
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

    // 필터링 파라미터
    const filter = { requestor: req.user._id };
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
    const requests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization")
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
 * 제조사에게 할당된 의뢰 목록 조회 (제조사용)
 * @route GET /api/requests/assigned
 */
async function getAssignedRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = { manufacturer: req.user._id };
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
      .populate("manufacturer", "name email phoneNumber organization role")
      .populate("messages.sender", "name email role");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 제조사, 관리자만 조회 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isManufacturer =
      request.manufacturer && req.user._id.equals(request.manufacturer._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isManufacturer && !isAdmin) {
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

    // 상태 유효성 검사
    const validStatuses = ["검토중", "견적 대기", "진행중", "완료", "취소"];
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

    // 접근 권한 확인 (의뢰자, 제조사, 관리자만 상태 변경 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isManufacturer =
      request.manufacturer && req.user._id.equals(request.manufacturer);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isManufacturer && !isAdmin) {
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

    if (
      (status === "견적 대기" || status === "진행중" || status === "완료") &&
      !isManufacturer &&
      !isAdmin
    ) {
      return res.status(403).json({
        success: false,
        message: "제조사 또는 관리자만 이 상태로 변경할 수 있습니다.",
      });
    }

    // 의뢰 상태 변경
    request.status = status;
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

    // 접근 권한 확인 (의뢰자, 제조사, 관리자만 메시지 추가 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isManufacturer =
      request.manufacturer && req.user._id.equals(request.manufacturer);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isManufacturer && !isAdmin) {
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

/**
 * 의뢰에 제조사 할당
 * @route PATCH /api/requests/:id/assign
 */
async function assignManufacturer(req, res) {
  try {
    const requestId = req.params.id;
    const { manufacturerId } = req.body;

    // ObjectId 유효성 검사
    if (
      !Types.ObjectId.isValid(requestId) ||
      !Types.ObjectId.isValid(manufacturerId)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 ID입니다.",
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

    // 관리자만 제조사 할당 가능
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 제조사를 할당할 수 있습니다.",
      });
    }

    // 제조사 조회
    const manufacturer = await User.findById(manufacturerId);

    if (!manufacturer) {
      return res.status(400).json({
        success: false,
        message: "존재하지 않는 제조사 ID입니다.",
      });
    }

    if (manufacturer.role !== "manufacturer") {
      return res.status(400).json({
        success: false,
        message: "선택한 사용자는 제조사가 아닙니다.",
      });
    }

    // 제조사 할당
    request.manufacturer = manufacturerId;
    await request.save();

    res.status(200).json({
      success: true,
      message: "제조사가 성공적으로 할당되었습니다.",
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "제조사 할당 중 오류가 발생했습니다.",
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

    const requests = await Request.find({ requestor: requestorId })
      .populate("manufacturer", "name organization")
      .lean();

    const total = requests.length;
    const inProduction = requests.filter((r) => r.status === "진행중").length;
    const completed = requests.filter((r) => r.status === "완료").length;
    const inShipping = requests.filter((r) => {
      const shippedAt = r.deliveryInfo?.shippedAt;
      const deliveredAt = r.deliveryInfo?.deliveredAt;
      return r.status === "진행중" && shippedAt && !deliveredAt;
    }).length;

    const active = requests.filter((r) =>
      ["검토중", "견적 대기", "진행중"].includes(r.status)
    );

    const stageCounts = {
      design: 0,
      cnc: 0,
      post: 0,
      shipping: 0,
    };

    active.forEach((r) => {
      const shippedAt = r.deliveryInfo?.shippedAt;
      if (r.status === "검토중" || r.status === "견적 대기") {
        stageCounts.design += 1;
      } else if (r.status === "진행중" && !shippedAt) {
        stageCounts.cnc += 1;
      } else if (r.status === "진행중" && shippedAt) {
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

    requests.forEach((r) => {
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

    const totalWithEta = requests.filter(
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
      manufacturer: r.manufacturer?.organization || r.manufacturer?.name || "",
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

    const diameterStats = computeDiameterStats(requests);

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
 * 제조사용 대시보드 요약 (할당된 의뢰 기준)
 * @route GET /api/requests/assigned/dashboard-summary
 */
async function getAssignedDashboardSummary(req, res) {
  try {
    const manufacturerId = req.user._id;

    const requests = await Request.find({ manufacturer: manufacturerId })
      .populate("requestor", "name organization")
      .lean();

    const total = requests.length;
    const inProduction = requests.filter((r) => r.status === "진행중").length;
    const completed = requests.filter((r) => r.status === "완료").length;
    const inShipping = requests.filter((r) => {
      const shippedAt = r.deliveryInfo?.shippedAt;
      const deliveredAt = r.deliveryInfo?.deliveredAt;
      return r.status === "진행중" && shippedAt && !deliveredAt;
    }).length;

    const active = requests.filter((r) =>
      ["검토중", "견적 대기", "진행중"].includes(r.status)
    );

    const stageCounts = {
      design: 0,
      cnc: 0,
      post: 0,
      shipping: 0,
    };

    active.forEach((r) => {
      const shippedAt = r.deliveryInfo?.shippedAt;
      if (r.status === "검토중" || r.status === "견적 대기") {
        stageCounts.design += 1;
      } else if (r.status === "진행중" && !shippedAt) {
        stageCounts.cnc += 1;
      } else if (r.status === "진행중" && shippedAt) {
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

    requests.forEach((r) => {
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

    const totalWithEta = requests.filter(
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
      manufacturer: r.requestor?.organization || r.requestor?.name || "",
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
      },
    });
  } catch (error) {
    console.error("Error in getAssignedDashboardSummary:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 대시보드 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  createRequest,
  getAllRequests,
  getMyRequests,
  getAssignedRequests,
  getRequestById,
  updateRequest,
  updateRequestStatus,
  addMessage,
  deleteRequest,
  assignManufacturer,
  getMyFavoriteImplant,
  getMyDashboardSummary,
  getAssignedDashboardSummary,
};
