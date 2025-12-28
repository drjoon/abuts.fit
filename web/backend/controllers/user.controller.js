import User from "../models/user.model.js";
import ActivityLog from "../models/activityLog.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import crypto from "crypto";
import { SolapiMessageService } from "solapi";
import { Types } from "mongoose";

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

    const data = typeof user.toObject === "function" ? user.toObject() : user;
    const provider = data?.social?.provider;
    data.authMethods = {
      email: !provider,
      google: provider === "google",
      kakao: provider === "kakao",
    };

    res.status(200).json({ success: true, data });
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

    if (!/^(\+\d{7,15})$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "전화번호 형식을 확인해주세요.",
      });
    }

    if (!phoneNumber.startsWith("+82")) {
      return res.status(400).json({
        success: false,
        message: "현재는 국내(+82) 번호만 지원합니다.",
      });
    }

    const user = await User.findById(userId).select("phoneVerification").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }

    const now = Date.now();
    const todayKey = new Date(now).toISOString().slice(0, 10);
    const prevDailyKey = String(user?.phoneVerification?.dailySendDate || "");
    const prevDailyCountRaw = user?.phoneVerification?.dailySendCount;
    const prevDailyCount =
      typeof prevDailyCountRaw === "number" &&
      Number.isFinite(prevDailyCountRaw)
        ? prevDailyCountRaw
        : 0;
    const nextDailyCount = prevDailyKey === todayKey ? prevDailyCount : 0;
    if (nextDailyCount >= 3) {
      return res.status(429).json({
        success: false,
        message:
          "오늘 인증번호 발송 횟수를 초과했습니다. 내일 다시 시도해주세요.",
      });
    }
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

    const isProd = process.env.NODE_ENV === "production";
    const devLogCode = !isProd && process.env.SMS_DEV_LOG_CODE !== "false";
    const devExposeCode =
      !isProd && process.env.SMS_DEV_EXPOSE_CODE !== "false";

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          phoneVerification: {
            codeHash,
            expiresAt,
            sentAt,
            dailySendDate: todayKey,
            dailySendCount: nextDailyCount + 1,
            attempts: 0,
            pendingPhoneNumber: phoneNumber,
          },
        },
      },
      { new: false }
    );

    if (isProd) {
      const apiKey = String(process.env.SOLAPI_API_KEY || "").trim();
      const apiSecret = String(process.env.SOLAPI_API_SECRET || "").trim();
      const from = String(process.env.SOLAPI_FROM || "").trim();

      if (!apiKey || !apiSecret || !from) {
        return res.status(500).json({
          success: false,
          message: "문자 발송 설정이 누락되었습니다.",
        });
      }

      const to = `0${phoneNumber.slice(3)}`;
      const text = `[abuts.fit] 인증번호: ${code}`;

      try {
        const messageService = new SolapiMessageService(apiKey, apiSecret);
        await messageService.send({
          to,
          from,
          text,
        });
      } catch (sendError) {
        console.error("[sms] phone verification send failed", {
          userId: String(userId),
          phoneNumber,
          message: sendError?.message,
        });
        await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              phoneVerification: {
                codeHash: null,
                expiresAt: null,
                sentAt: null,
                dailySendDate: todayKey,
                dailySendCount: nextDailyCount,
                attempts: 0,
                pendingPhoneNumber: "",
              },
            },
          },
          { new: false }
        );

        return res.status(500).json({
          success: false,
          message: "인증번호 발송에 실패했습니다.",
        });
      }
    } else {
      if (devLogCode) {
        console.log("[sms-dev] phone verification", { phoneNumber, code });
      } else {
        console.log("[sms-dev] phone verification", { phoneNumber });
      }
    }

    const data = {
      expiresAt,
      ...(devExposeCode ? { devCode: code } : {}),
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
            dailySendDate: String(pv.dailySendDate || ""),
            dailySendCount:
              typeof pv.dailySendCount === "number" &&
              Number.isFinite(pv.dailySendCount)
                ? pv.dailySendCount
                : 0,
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
        const prevPv = req.user?.phoneVerification || {};
        const pendingPhone = String(prevPv?.pendingPhoneNumber || "").trim();
        const pendingCodeHash = String(prevPv?.codeHash || "").trim();
        const pendingExpiresAt = prevPv?.expiresAt
          ? new Date(prevPv.expiresAt).getTime()
          : 0;
        const now = Date.now();

        if (
          pendingPhone &&
          pendingPhone === nextPhone &&
          pendingCodeHash &&
          pendingExpiresAt &&
          pendingExpiresAt > now
        ) {
          // 인증 진행 중(이미 발송된 번호와 동일)인 경우 초기화하지 않음
        } else {
          updateData.phoneVerifiedAt = null;
          updateData.phoneVerification = {
            codeHash: null,
            expiresAt: null,
            sentAt: null,
            dailySendDate: String(prevPv.dailySendDate || ""),
            dailySendCount:
              typeof prevPv.dailySendCount === "number" &&
              Number.isFinite(prevPv.dailySendCount)
                ? prevPv.dailySendCount
                : 0,
            attempts: 0,
            pendingPhoneNumber: "",
          };
        }
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

    const notification = user?.preferences?.notifications || {};
    const userConfiguredAt = notification?.userConfiguredAt || null;

    if (!userConfiguredAt) {
      return res.status(200).json({
        success: true,
        data: {
          methods: {
            emailNotifications: true,
            smsNotifications: true,
            pushNotifications: true,
            marketingEmails: true,
          },
          types: {
            newRequests: true,
            statusUpdates: true,
            payments: true,
          },
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        methods: notification?.methods || {},
        types: notification?.types || {},
      },
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
    const { methods, types } = req.body;
    if (!methods || !types) {
      return res.status(400).json({
        success: false,
        message:
          "유효하지 않은 알림 설정입니다. methods, types 객체가 필요합니다.",
      });
    }

    const methodKeys = [
      "emailNotifications",
      "smsNotifications",
      "pushNotifications",
      "marketingEmails",
    ];
    const typeKeys = ["newRequests", "statusUpdates", "payments"];

    const fillMethods = (obj) => {
      const filled = {};
      methodKeys.forEach((key) => {
        filled[key] = typeof obj?.[key] === "boolean" ? obj[key] : false;
      });
      return filled;
    };

    const fillTypes = (obj) => {
      const filled = {};
      typeKeys.forEach((key) => {
        filled[key] = typeof obj?.[key] === "boolean" ? obj[key] : false;
      });
      return filled;
    };

    const nextMethods = fillMethods(methods);
    const nextTypes = fillTypes(types);
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "preferences.notifications.userConfiguredAt": new Date(),
          "preferences.notifications.methods": nextMethods,
          "preferences.notifications.types": nextTypes,
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
    res.status(200).json({
      success: true,
      message: "알림 설정이 성공적으로 수정되었습니다.",
      data: {
        methods: fillMethods(
          updatedUser.preferences.notifications.methods || {}
        ),
        types: fillTypes(updatedUser.preferences.notifications.types || {}),
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

export {
  getProfile,
  updateProfile,
  sendPhoneVerification,
  verifyPhoneVerification,
  getNotificationSettings,
  updateNotificationSettings,
  getMySecurityLogs,
};

/**
 * 내 보안 로그 조회 (최근 로그인 기록 등)
 * @route GET /api/users/security-logs
 * @query limit?: number (default 10, max 100)
 */
async function getMySecurityLogs(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "인증이 필요합니다.",
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 10, 100);

    const logsRaw = await ActivityLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const logs = logsRaw.map((log) => {
      const severity =
        log.severity ||
        (log.details && typeof log.details.severity === "string"
          ? log.details.severity
          : "info");
      const status =
        log.status ||
        (log.details && typeof log.details.status === "string"
          ? log.details.status
          : "info");
      return { ...log, severity, status };
    });

    return res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보안 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
