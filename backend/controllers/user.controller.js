import mongoose from "mongoose";
import User from "../models/user.model";
import Request from "../models/request.model";
import File from "../models/file.model";
import ActivityLog from "../models/activityLog.model";

/**
 * 사용자 프로필 조회
 * @route GET /api/users/profile
 */
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "프로필 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 프로필 수정
 * @route PUT /api/users/profile
 */
async function updateProfile(req, res) {
  try {
    const updateData = req.body;
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData.active;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
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
      message: "프로필이 성공적으로 수정되었습니다.",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "프로필 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사 목록 조회
 * @route GET /api/users/manufacturers
 */
async function getManufacturers(req, res) {
  try {
    const manufacturers = await User.find({ role: "manufacturer", active: true }).select(
      "name email organization specialties"
    );
    res.status(200).json({
      success: true,
      data: {
        manufacturers,
        pagination: { total: manufacturers.length }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "제조사 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰자 목록 조회
 * @route GET /api/users/requestors
 */
async function getRequestors(req, res) {
  try {
    const requestors = await User.find({ role: "requestor", active: true }).select(
      "name email organization phoneNumber"
    );
    res.status(200).json({
      success: true,
      data: {
        requestors,
        pagination: { total: requestors.length }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰자 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 알림 설정 조회
 * @route GET /api/users/notification-settings
 */
async function getNotificationSettings(req, res) {
  try {
    const user = await User.findById(req.user._id).select("preferences.notifications");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    res.status(200).json({
      success: true,
      data: user.preferences.notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 알림 설정 수정
 * @route PUT /api/users/notification-settings
 */
async function updateNotificationSettings(req, res) {
  try {
    const { email, push } = req.body;
    // email, push 각각에 newRequest, newMessage가 있는지 확인
    if (
      !email || typeof email.newRequest !== "boolean" || typeof email.newMessage !== "boolean" ||
      !push || typeof push.newRequest !== "boolean" || typeof push.newMessage !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 알림 설정입니다. email, push 각각에 newRequest, newMessage boolean 값이 필요합니다.",
      });
    }
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "preferences.notifications.email": email,
          "preferences.notifications.push": push,
        },
      },
      { new: true, runValidators: true }
    ).select("preferences.notifications");
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    // 모든 알림 필드가 누락 없이 포함되도록 보장
    const defaultKeys = ["newRequest", "newMessage", "fileUpload", "statusUpdate"];
    const fillAllFields = (obj) => {
      const filled = {};
      defaultKeys.forEach(key => {
        filled[key] = typeof obj[key] === "boolean" ? obj[key] : false;
      });
      return filled;
    };
    res.status(200).json({
      success: true,
      message: "알림 설정이 성공적으로 수정되었습니다.",
      data: {
        email: fillAllFields(updatedUser.preferences.notifications.email || {}),
        push: fillAllFields(updatedUser.preferences.notifications.push || {})
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 설정 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
/**
 * 사용자 통계 조회
 * @route GET /api/users/stats
 */
async function getUserStats(req, res) {
  try {
    const { _id: userId, role } = req.user;
    let stats = {};

    if (role === "requestor") {
      const totalRequests = await Request.countDocuments({ requestor: userId });
      const activeRequests = await Request.countDocuments({ requestor: userId, status: { $nin: ["완료", "취소"] } });
      const completedRequests = await Request.countDocuments({ requestor: userId, status: "완료" });
      stats = { totalRequests, activeRequests, completedRequests };

    } else if (role === "manufacturer") {
      const assignedRequests = await Request.countDocuments({ manufacturer: userId });
      const activeRequests = await Request.countDocuments({ manufacturer: userId, status: { $nin: ["완료", "취소"] } });
      const completedRequests = await Request.countDocuments({ manufacturer: userId, status: "완료" });
      stats = { assignedRequests, activeRequests, completedRequests };

    } else if (role === "admin") {
      const totalUsers = await User.countDocuments();
      const totalRequests = await Request.countDocuments();
      const totalFiles = await File.countDocuments();
      stats = { totalUsers, totalRequests, totalFiles };
    }

    let wrappedStats = {};
    if (role === "requestor") wrappedStats = { requestor: stats };
    else if (role === "manufacturer") wrappedStats = { manufacturer: stats };
    else if (role === "admin") wrappedStats = { admin: stats };
    res.status(200).json({ success: true, data: wrappedStats });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 활동 로그 조회
 * @route GET /api/users/activity-logs
 */
async function getActivityLogs(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const logs = await ActivityLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalLogs = await ActivityLog.countDocuments({ userId: req.user._id });

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalLogs,
          totalPages: Math.ceil(totalLogs / limit),
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "활동 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getManufacturers,
  getRequestors,
  getNotificationSettings,
  updateNotificationSettings,
  getUserStats,
  getActivityLogs,
};
