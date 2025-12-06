import Request from "../models/request.model.js";
import User from "../models/user.model.js";
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
  if (requestDoc.lotNumber) {
    return;
  }

  const patientCases = Array.isArray(requestDoc.patientCases)
    ? requestDoc.patientCases
    : [];

  const workTypes = patientCases.flatMap((c) =>
    Array.isArray(c.files)
      ? c.files.map((f) => f?.workType).filter(Boolean)
      : []
  );

  let prefixBase = null;
  if (workTypes.includes("abutment")) {
    prefixBase = "AB";
  } else if (workTypes.includes("crown")) {
    prefixBase = "CR";
  }

  if (!prefixBase) {
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`; // YYYYMMDD

  const prefix = `${prefixBase}${dateStr}-`;

  const todayCount = await Request.countDocuments({
    lotNumber: { $regex: `^${prefix}` },
  });

  const index = todayCount; // 0-based index: 0 -> AAA, 1 -> AAB ...
  const toLetters = (n) => {
    const A = "A".charCodeAt(0);
    const first = String.fromCharCode(A + (Math.floor(n / (26 * 26)) % 26));
    const second = String.fromCharCode(A + (Math.floor(n / 26) % 26));
    const third = String.fromCharCode(A + (n % 26));
    return `${first}${second}${third}`;
  };

  const code = toLetters(index);
  requestDoc.lotNumber = `${prefix}${code}`;
}

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
async function createRequest(req, res) {
  console.log("createRequest req.user:", req.user);
  console.log("createRequest req.body:", req.body);
  try {
    // Batch request processing
    if (req.body.items && Array.isArray(req.body.items)) {
      const createdRequests = [];
      const items = req.body.items;

      // Generate a common referenceId for the batch if not provided in items
      // However, items might already have referenceIds grouped by patient
      // So we just process each item.

      for (const item of items) {
        const patientCases = Array.isArray(item.patientCases)
          ? item.patientCases
          : [];

        // Validate each item
        const hasValidPatientCases =
          patientCases.length > 0 &&
          patientCases.every((c) => {
            if (!c) return false;
            const name = (c.patientName || "").trim();
            const teethArr = Array.isArray(c.teeth) ? c.teeth : [];
            // batch 모드에서도 단일 요청과 동일하게: 환자명 + 최소 1개 치아번호 필수
            return name.length > 0 && teethArr.length > 0;
          });

        if (!hasValidPatientCases) {
          // Continue or fail? Let's fail whole batch for integrity or skip?
          // For now, let's just throw to fail.
          throw new Error(
            `환자 정보가 누락된 항목이 있습니다. (Patient: ${
              patientCases[0]?.patientName || "Unknown"
            })`
          );
        }

        const { referenceId, referenceIds, ...rest } = item;

        let normalizedReferenceIds = undefined;
        if (Array.isArray(referenceIds) && referenceIds.length > 0) {
          normalizedReferenceIds = referenceIds;
        } else if (
          typeof referenceId === "string" &&
          referenceId.trim().length > 0
        ) {
          normalizedReferenceIds = [referenceId];
        }

        const newRequest = new Request({
          ...rest,
          ...(normalizedReferenceIds
            ? { referenceId: normalizedReferenceIds }
            : {}),
          requestor: req.user._id,
        });
        applyStatusMapping(newRequest, newRequest.status);
        await newRequest.save();
        createdRequests.push(newRequest);
      }

      return res.status(201).json({
        success: true,
        message: `${createdRequests.length}건의 의뢰가 성공적으로 등록되었습니다.`,
        data: createdRequests,
      });
    }

    // 환자 정보(patientCases)는 필수
    const patientCases = Array.isArray(req.body.patientCases)
      ? req.body.patientCases
      : [];

    const hasValidPatientCases =
      patientCases.length > 0 &&
      patientCases.every((c) => {
        if (!c) return false;
        const name = (c.patientName || "").trim();
        const teethArr = Array.isArray(c.teeth) ? c.teeth : [];
        return name.length > 0 && teethArr.length > 0;
      });

    if (!hasValidPatientCases) {
      return res.status(400).json({
        success: false,
        message: "환자 이름과 치아번호는 필수입니다.",
        errors: [
          "각 환자 케이스에 patientName과 하나 이상의 teeth가 포함되어야 합니다.",
        ],
      });
    }

    const newRequest = new Request({
      ...req.body,
      requestor: req.user._id,
    });

    applyStatusMapping(newRequest, newRequest.status);

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
    const filter = {
      $or: [{ manufacturer: req.user._id }, { manufacturer: null }],
    };
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

    // 개발 환경 + MOCK_DEV_TOKEN 여부 확인 (대시보드와 동일한 정책)
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    // 접근 권한 확인 (의뢰자, 제조사, 관리자만 상태 변경 가능)
    const isRequestor = isMockDevToken
      ? req.user.role === "requestor"
      : req.user._id.equals(request.requestor._id);
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

    // 취소는 의뢰접수/가공전 상태에서만 가능
    if (status === "취소" && !["의뢰접수", "가공전"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: "의뢰접수 또는 가공전 상태에서만 취소할 수 있습니다.",
      });
    }

    // 제조사/관리자만 변경 가능한 상태들 (가공 관련 및 배송 상태)
    const manufacturerOnlyStatuses = [
      "가공전",
      "가공후",
      "배송대기",
      "배송중",
      "완료",
    ];

    if (
      manufacturerOnlyStatuses.includes(status) &&
      !isManufacturer &&
      !isAdmin
    ) {
      return res.status(403).json({
        success: false,
        message: "제조사 또는 관리자만 이 상태로 변경할 수 있습니다.",
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
      .populate("manufacturer", "name organization")
      .lean();

    const total = requests.length;
    const inProduction = requests.filter((r) =>
      ["가공전", "가공후"].includes(r.status)
    ).length;
    const completed = requests.filter((r) => r.status === "완료").length;
    const inShipping = requests.filter((r) => r.status === "배송중").length;

    const active = requests.filter((r) =>
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

    const recentRequests = requests
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bDate = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 5)
      .map((r) => ({
        id: r.requestId,
        title: r.title,
        status: r.status,
        manufacturer:
          r.manufacturer?.organization || r.manufacturer?.name || "",
        date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
      }));

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
    const inProduction = requests.filter((r) =>
      ["가공전", "가공후"].includes(r.status)
    ).length;
    const completed = requests.filter((r) => r.status === "완료").length;
    const inShipping = requests.filter((r) => r.status === "배송중").length;

    const active = requests.filter((r) =>
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
  getMyBulkShipping,
  createMyBulkShipping,
};
