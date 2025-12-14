import User from "../models/user.model.js";
import Request from "../models/request.model.js";
import File from "../models/file.model.js";
import ActivityLog from "../models/activityLog.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import crypto from "crypto";

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

async function sendPhoneVerification(req, res) {
  try {
    const userId = req.user?._id;
    const phoneNumber = String(req.body?.phoneNumber || "").trim();

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "인증이 필요합니다." });
    }

    if (!/^\+\d{7,15}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "전화번호 형식을 확인해주세요.",
      });
    }

    const user = await User.findById(userId).select("phoneVerification").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }

    const now = Date.now();
    const lastSentAt = user?.phoneVerification?.sentAt
      ? new Date(user.phoneVerification.sentAt).getTime()
      : 0;
    if (lastSentAt && now - lastSentAt < 30_000) {
      return res.status(429).json({
        success: false,
        message: "잠시 후 다시 시도해주세요.",
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(now + 5 * 60_000);
    const sentAt = new Date(now);

    if (process.env.NODE_ENV === "production") {
      console.log("[sms] phone verification", { phoneNumber });
    } else {
      console.log("[sms-dev] phone verification", { phoneNumber, code });
    }

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          phoneVerification: {
            codeHash,
            expiresAt,
            sentAt,
            attempts: 0,
            pendingPhoneNumber: phoneNumber,
          },
        },
      },
      { new: false }
    );

    const data = {
      expiresAt,
      ...(process.env.NODE_ENV === "production" ? {} : { devCode: code }),
    };

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "인증번호 발송 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function verifyPhoneVerification(req, res) {
  try {
    const userId = req.user?._id;
    const code = String(req.body?.code || "").trim();

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "인증이 필요합니다." });
    }

    if (!/^\d{4,8}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "인증번호를 확인해주세요.",
      });
    }

    const user = await User.findById(userId)
      .select("phoneVerification phoneNumber")
      .lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }

    const pv = user.phoneVerification || {};
    const expiresAt = pv.expiresAt ? new Date(pv.expiresAt).getTime() : 0;
    const now = Date.now();
    if (!pv.codeHash || !expiresAt) {
      return res.status(400).json({
        success: false,
        message: "인증번호 발송을 먼저 진행해주세요.",
      });
    }
    if (expiresAt < now) {
      return res.status(400).json({
        success: false,
        message: "인증번호가 만료되었습니다. 다시 발송해주세요.",
      });
    }
    const attempts = typeof pv.attempts === "number" ? pv.attempts : 0;
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    if (codeHash !== pv.codeHash) {
      await User.findByIdAndUpdate(
        userId,
        { $set: { "phoneVerification.attempts": attempts + 1 } },
        { new: false }
      );
      return res.status(400).json({
        success: false,
        message: "인증번호가 올바르지 않습니다.",
      });
    }

    const verifiedAt = new Date(now);
    const nextPhone = String(
      pv.pendingPhoneNumber || user.phoneNumber || ""
    ).trim();

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          phoneNumber: nextPhone,
          phoneVerifiedAt: verifiedAt,
          phoneVerification: {
            codeHash: null,
            expiresAt: null,
            sentAt: null,
            attempts: 0,
            pendingPhoneNumber: "",
          },
        },
      },
      { new: false }
    );

    return res.status(200).json({
      success: true,
      data: { phoneNumber: nextPhone, phoneVerifiedAt: verifiedAt },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "인증번호 확인 중 오류가 발생했습니다.",
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
    delete updateData.organizationId;

    if (Object.prototype.hasOwnProperty.call(updateData, "phoneNumber")) {
      const nextPhone = String(updateData.phoneNumber || "").trim();
      const prevPhone = String(req.user?.phoneNumber || "").trim();
      if (nextPhone && nextPhone !== prevPhone) {
        updateData.phoneVerifiedAt = null;
        updateData.phoneVerification = {
          codeHash: null,
          expiresAt: null,
          sentAt: null,
          attempts: 0,
          pendingPhoneNumber: "",
        };
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, "organization") &&
      req.user?.role === "requestor" &&
      req.user?.organizationId
    ) {
      const nextName = String(updateData.organization || "").trim();
      const org = await RequestorOrganization.findById(req.user.organizationId);
      if (!org || String(org.owner) !== String(req.user._id)) {
        delete updateData.organization;
      } else {
        if (nextName && nextName !== org.name) {
          const exists = await RequestorOrganization.findOne({
            _id: { $ne: org._id },
            name: nextName,
          }).select({ _id: 1 });
          if (exists) {
            return res.status(409).json({
              success: false,
              message: "이미 동일한 이름의 기공소가 존재합니다.",
            });
          }

          org.name = nextName;
          await org.save();

          await User.updateMany(
            { organizationId: org._id },
            { $set: { organization: nextName } }
          );
        }

        updateData.organization = nextName || org.name;
      }
    }

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
    const manufacturers = await User.find({
      role: "manufacturer",
      active: true,
    }).select("name email organization specialties");
    res.status(200).json({
      success: true,
      data: {
        manufacturers,
        pagination: { total: manufacturers.length },
      },
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
    const requestors = await User.find({
      role: "requestor",
      active: true,
    }).select("name email organization phoneNumber");
    res.status(200).json({
      success: true,
      data: {
        requestors,
        pagination: { total: requestors.length },
      },
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
    const user = await User.findById(req.user._id).select(
      "preferences.notifications"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    res.status(200).json({
      success: true,
      data: user.preferences.notifications,
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
      !email ||
      typeof email.newRequest !== "boolean" ||
      typeof email.newMessage !== "boolean" ||
      !push ||
      typeof push.newRequest !== "boolean" ||
      typeof push.newMessage !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "유효하지 않은 알림 설정입니다. email, push 각각에 newRequest, newMessage boolean 값이 필요합니다.",
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
    const defaultKeys = [
      "newRequest",
      "newMessage",
      "fileUpload",
      "statusUpdate",
    ];
    const fillAllFields = (obj) => {
      const filled = {};
      defaultKeys.forEach((key) => {
        filled[key] = typeof obj[key] === "boolean" ? obj[key] : false;
      });
      return filled;
    };
    res.status(200).json({
      success: true,
      message: "알림 설정이 성공적으로 수정되었습니다.",
      data: {
        email: fillAllFields(updatedUser.preferences.notifications.email || {}),
        push: fillAllFields(updatedUser.preferences.notifications.push || {}),
      },
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
      const activeRequests = await Request.countDocuments({
        requestor: userId,
        status: { $nin: ["완료", "취소"] },
      });
      const completedRequests = await Request.countDocuments({
        requestor: userId,
        status: "완료",
      });
      stats = { totalRequests, activeRequests, completedRequests };
    } else if (role === "manufacturer") {
      const assignedRequests = await Request.countDocuments({
        manufacturer: userId,
      });
      const activeRequests = await Request.countDocuments({
        manufacturer: userId,
        status: { $nin: ["완료", "취소"] },
      });
      const completedRequests = await Request.countDocuments({
        manufacturer: userId,
        status: "완료",
      });
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

    const totalLogs = await ActivityLog.countDocuments({
      userId: req.user._id,
    });

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalLogs,
          totalPages: Math.ceil(totalLogs / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "활동 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export {
  getProfile,
  updateProfile,
  sendPhoneVerification,
  verifyPhoneVerification,
  getManufacturers,
  getRequestors,
  getNotificationSettings,
  updateNotificationSettings,
  getUserStats,
  getActivityLogs,
};
