import User from "../models/user.model";
import Request from "../models/request.model";
import File from "../models/file.model";
import { Types } from "mongoose";
import ActivityLog from "../models/activityLog.model";

/**
 * 모든 사용자 목록 조회
 * @route GET /api/admin/users
 */
async function getAllUsers(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { organization: { $regex: req.query.search, $options: "i" } },
      ];
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

    // 사용자 조회 (비밀번호 제외)
    const users = await User.find(filter)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // 전체 사용자 수
    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        users,
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
      message: "사용자 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 상세 조회
 * @route GET /api/admin/users/:id
 */
async function getUserById(req, res) {
  try {
    const userId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 사용자 조회 (비밀번호 제외)
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 정보 수정
 * @route PUT /api/admin/users/:id
 */
async function updateUser(req, res) {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.password;
    delete updateData.email; // 이메일은 변경 불가
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // 자기 자신의 관리자 권한 제거 방지
    if (
      userId === req.user.id &&
      updateData.role &&
      req.user.role === "admin" &&
      updateData.role !== "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 관리자 권한을 제거할 수 없습니다.",
      });
    }

    // 사용자 수정
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      message: "사용자 정보가 성공적으로 수정되었습니다.",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 정보 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 활성화/비활성화
 * @route PATCH /api/admin/users/:id/toggle-active
 */
async function toggleUserActive(req, res) {
  try {
    const userId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 사용자 조회
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 자기 자신을 비활성화하는 것 방지
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "자기 자신을 비활성화할 수 없습니다.",
      });
    }

    // 활성화 상태 토글
    user.active = !user.active;
    await user.save();

    res.status(200).json({
      success: true,
      message: `사용자가 ${user.active ? "활성화" : "비활성화"}되었습니다.`,
      data: {
        userId: user._id,
        active: user.active,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 활성화/비활성화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 역할 변경
 * @route PATCH /api/admin/users/:id/change-role
 */
async function changeUserRole(req, res) {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 역할 유효성 검사
    const validRoles = ["requestor", "manufacturer", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 역할입니다.",
      });
    }

    // 사용자 조회
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 자기 자신의 관리자 권한 제거 방지
    if (
      user._id.equals(req.user._id) &&
      user.role === "admin" &&
      role !== "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 관리자 권한을 제거할 수 없습니다.",
      });
    }

    // 역할 변경
    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: "사용자 역할이 성공적으로 변경되었습니다.",
      data: {
        userId: user._id,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 역할 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 대시보드 통계 조회
 * @route GET /api/admin/dashboard
 */
async function getDashboardStats(req, res) {
  try {
    // 사용자 통계
    const userStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    // 사용자 통계 가공
    const userStatsByRole = {};
    userStats.forEach((stat) => {
      userStatsByRole[stat._id] = stat.count;
    });

    // 총 사용자 수
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });

    // 의뢰 통계
    const requestStats = await Request.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // 의뢰 통계 가공
    const requestStatsByStatus = {};
    requestStats.forEach((stat) => {
      requestStatsByStatus[stat._id] = stat.count;
    });

    // 총 의뢰 수
    const totalRequests = await Request.countDocuments();

    // 최근 의뢰 (최대 5개)
    const recentRequests = await Request.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("requestor", "name email")
      .populate("manufacturer", "name email");

    // 파일 통계
    const totalFiles = await File.countDocuments();
    const totalFileSize = await File.aggregate([
      {
        $group: {
          _id: null,
          totalSize: { $sum: "$size" },
        },
      },
    ]);

    // 응답 데이터 구성
    const dashboardData = {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: userStatsByRole,
      },
      requests: {
        total: totalRequests,
        byStatus: requestStatsByStatus,
        recent: recentRequests,
      },
      files: {
        total: totalFiles,
        totalSize: totalFileSize.length > 0 ? totalFileSize[0].totalSize : 0,
      },
    };

    res.status(200).json({
      success: true,
      data: {
        userStats: dashboardData.users,
        requestStats: dashboardData.requests,
        recentActivity: dashboardData.files,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 시스템 로그 조회 (예시, 실제 구현은 로그 저장 방식에 따라 다름)
 * @route GET /api/admin/logs
 */
async function getSystemLogs(req, res) {
  try {
    // 실제 구현에서는 로그 파일을 읽거나 DB에서 로그를 조회
    // 여기서는 예시로 빈 배열 반환
    res.status(200).json({
      success: true,
      message: "시스템 로그 조회 기능은 아직 구현되지 않았습니다.",
      data: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 시스템 설정 조회 (예시)
 * @route GET /api/admin/settings
 */
async function getSystemSettings(req, res) {
  try {
    // 실제 구현에서는 DB에서 설정을 조회
    // 여기서는 예시로 하드코딩된 설정 반환
    const settings = {
      fileUpload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "model/stl",
          "application/octet-stream",
        ],
      },
      security: {
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15분
          max: 100, // 15분 동안 최대 100개 요청
        },
        jwtExpiration: "1d", // 1일
        refreshTokenExpiration: "7d", // 7일
      },
    };

    res.status(200).json({
      success: true,
      data: { settings },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 삭제
 * @route DELETE /api/admin/users/:id
 */
async function deleteUser(req, res) {
  try {
    const userId = req.params.id;
    const adminId = req.user.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 자기 자신을 삭제하려는 경우 방지
    if (userId.toString() === adminId.toString()) {
      return res.status(400).json({
        success: false,
        message: "자기 자신을 삭제할 수 없습니다.",
      });
    }

    // 사용자 삭제
    const deletedUser = await User.findByIdAndUpdate(
      userId,
      { active: false, deletedAt: new Date() },
      { new: true }
    );

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 실제 DB에서 삭제 (테스트에서는 이 방식을 사용)
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "사용자가 성공적으로 삭제되었습니다.",
      data: deletedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 의뢰 목록 조회
 * @route GET /api/admin/requests
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
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
        { requestId: { $regex: req.query.search, $options: "i" } },
      ];
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
 * 의뢰 상세 조회
 * @route GET /api/admin/requests/:id
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

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상세 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상태 변경
 * @route PATCH /api/admin/requests/:id/status
 */
async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status, statusNote } = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 상태 유효성 검사
    const validStatuses = ["검토중", "승인", "진행중", "완료", "거절", "취소"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
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

    // 상태 변경 이력 추가
    const statusHistory = {
      status,
      note: statusNote || "",
      updatedBy: req.user.id,
      updatedAt: new Date(),
    };

    // 의뢰 상태 업데이트
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        status,
        $push: { statusHistory },
      },
      { new: true }
    )
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    // statusHistory가 없으면 빈 배열 반환 보장
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

/**
 * 제조사 할당
 * @route PATCH /api/admin/requests/:id/assign
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

    // 제조사 존재 확인
    const manufacturer = await User.findById(manufacturerId);
    if (!manufacturer || manufacturer.role !== "manufacturer") {
      return res.status(400).json({
        success: false,
        message: "유효한 제조사를 찾을 수 없습니다.",
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

    // 제조사 할당
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        manufacturer: manufacturerId,
        assignedAt: new Date(),
      },
      { new: true }
    )
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    // statusHistory가 없으면 빈 배열 반환 보장
    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    // manufacturer는 ObjectId만 반환
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

/**
 * 활동 로그 조회
 * @route GET /api/admin/activity-logs
 */
async function getActivityLogs(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.userId) {
      if (!Types.ObjectId.isValid(req.query.userId)) {
        return res
          .status(400)
          .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
      }
      filter.user = new Types.ObjectId(req.query.userId);
}
    if (req.query.action) filter.action = req.query.action;
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // 실제 로그 조회
    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await ActivityLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs,
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
  message: "활동 로그 조회 중 오류가 발생했습니다.",
  error: error.message,
  stack: error.stack,
});
  }
}

/**
 * 시스템 설정 업데이트
 * @route PUT /api/admin/settings
 */
async function updateSystemSettings(req, res) {
  try {
    // 실제 구현에서는 DB에서 설정을 가져와 업데이트
    // 여기서는 간단한 예시로 요청 바디를 그대로 반환
    const updatedSettings = req.body;

    res.status(200).json({
      success: true,
      message: "시스템 설정이 성공적으로 업데이트되었습니다.",
      data: updatedSettings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 전체 파일 목록 조회 (관리자 전용)
 * @route GET /api/files
 */
async function getAllFiles(req, res) {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자 권한이 필요합니다.",
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.fileType) filter.fileType = req.query.fileType;
    if (req.query.uploadedBy) filter.uploadedBy = req.query.uploadedBy;
    if (req.query.requestId) filter.relatedRequest = req.query.requestId;
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1;
    }
    const files = await File.find(filter)
      .populate("uploadedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit);
    const total = await File.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: {
        files,
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
      message: "파일 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActive,
  changeUserRole,
  getDashboardStats,
  getAllRequests,
  getRequestById,
  updateRequestStatus,
  assignManufacturer,
  getSystemLogs,
  getActivityLogs,
  getSystemSettings,
  updateSystemSettings,
  getAllFiles,
};
