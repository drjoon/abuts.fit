// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/frontend/src/shared/practice/labReceiveCalendarDateKey.ts
// - web/backend/utils/labReceiveCalendarHiddenWeekdays.util.js
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts
import crypto from "crypto";
import User from "../../models/user.model.js";
import ActivityLog from "../../models/activityLog.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { messageService } from "../../utils/popbill.util.js";
import { Types } from "mongoose";
import { toKstYmd } from "../../utils/krBusinessDays.js";
import { ensureRequestorOrgAnchor } from "../businesses/requestorOrgAnchor.util.js";
import { resolvePlatformFeeRate } from "../../services/creditRevenuePolicy.service.js";
import { normalizeLastDashboardPath } from "../../utils/lastDashboardPath.util.js";
import { normalizeWorkspaceMode } from "../../utils/workspaceMode.util.js";
import { normalizeSidebarOpen } from "../../utils/sidebarOpen.util.js";
import { normalizeLabReceiveCalendarDateKey } from "../../utils/labReceiveCalendarDateKey.util.js";
import { normalizeLabReceiveCalendarHiddenWeekdays } from "../../utils/labReceiveCalendarHiddenWeekdays.util.js";

/**
 * 사용자 프로필 조회
 * @route GET /api/users/profile
 */
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select("-password").lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    const data = { ...user };
    const provider = data?.social?.provider;
    data.authMethods = {
      email: !provider,
      google: provider === "google",
      kakao: provider === "kakao",
    };

    const anchorId = user.businessAnchorId;
    if (anchorId && Types.ObjectId.isValid(String(anchorId))) {
      const anchor = await BusinessAnchor.findById(anchorId)
        .select({ payoutAccount: 1, payoutRates: 1 })
        .lean();
      if (anchor) {
        let { payoutAccount, payoutRates } = anchor;

        const legacyPayout = user.salesmanPayoutAccount;
        if (!payoutAccount?.updatedAt && legacyPayout?.updatedAt) {
          payoutAccount = legacyPayout;
          void BusinessAnchor.updateOne(
            { _id: new Types.ObjectId(String(anchorId)) },
            { $set: { payoutAccount } },
          ).catch(() => {});
        }

        const legacyRates = user.devopsPayoutSettings;
        if (!payoutRates?.updatedAt && legacyRates?.updatedAt) {
          payoutRates = legacyRates;
          void BusinessAnchor.updateOne(
            { _id: new Types.ObjectId(String(anchorId)) },
            { $set: { payoutRates } },
          ).catch(() => {});
        }

        data.salesmanPayoutAccount = payoutAccount || {};
        const rates = payoutRates || {};
        const platformFeeRate = resolvePlatformFeeRate(rates);
        data.devopsPayoutSettings = {
          ...rates,
          platformFeeRate,
          partnerFeeRate: platformFeeRate,
          nonPartnerFeeRate: platformFeeRate,
        };
        delete data.devopsPayoutSettings.labReferredFeeRate;
      }
    }

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

    const isProd = process.env.NODE_ENV === "production";
    const forceAutoVerify =
      !isProd && process.env.SMS_DEV_FORCE_AUTO_VERIFY !== "false";

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
    const todayKey = toKstYmd(new Date(now));
    const prevDailyKey = String(user?.phoneVerification?.dailySendDate || "");
    const prevDailyCountRaw = user?.phoneVerification?.dailySendCount;
    const prevDailyCount =
      typeof prevDailyCountRaw === "number" &&
      Number.isFinite(prevDailyCountRaw)
        ? prevDailyCountRaw
        : 0;
    const nextDailyCount = prevDailyKey === todayKey ? prevDailyCount : 0;
    if (!forceAutoVerify && nextDailyCount >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "하루 5회까지만 인증 문자를 받을 수 있습니다. 내일 다시 시도해주세요.",
      });
    }
    const lastSentAt = user?.phoneVerification?.sentAt
      ? new Date(user.phoneVerification.sentAt).getTime()
      : 0;
    if (!forceAutoVerify && lastSentAt && now - lastSentAt < 30_000) {
      return res.status(429).json({
        success: false,
        message: "잠시 후 다시 시도해주세요.",
      });
    }

    const code = String(crypto.randomInt(1000, 10000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(now + 5 * 60_000);
    const sentAt = new Date(now);
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
      { new: false },
    );

    const corpNum = String(process.env.POPBILL_CORP_NUM || "")
      .replace(/\D/g, "")
      .trim();
    const sender = String(process.env.POPBILL_SENDER_NUM || "")
      .replace(/\D/g, "")
      .trim();
    const popbillUserId = String(process.env.POPBILL_USER_ID || "").trim();
    const popbillLinkId = String(process.env.POPBILL_LINK_ID || "").trim();
    const popbillSecret = String(process.env.POPBILL_SECRET_KEY || "").trim();
    const popbillEnabled =
      popbillLinkId && popbillSecret && corpNum && sender && popbillUserId;

    if (popbillEnabled) {
      const to = `0${phoneNumber.slice(3)}`;
      const text = `[abuts.fit] 인증번호: ${code}`;

      try {
        await new Promise((resolve, reject) => {
          messageService.sendSMS(
            corpNum,
            sender,
            to,
            "",
            text,
            "",
            false,
            "",
            "",
            popbillUserId,
            (result) => resolve(result),
            (error) => reject(error),
          );
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
          { new: false },
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
    const isProd = process.env.NODE_ENV === "production";
    const forceAutoVerify =
      !isProd && process.env.SMS_DEV_FORCE_AUTO_VERIFY !== "false";

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "인증이 필요합니다." });
    }

    if (!/^\d{4}$/.test(code)) {
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
    if (!forceAutoVerify && attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    let codeMatches = false;
    if (forceAutoVerify) {
      codeMatches = true;
    } else {
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      codeMatches = codeHash === pv.codeHash;
    }

    if (!codeMatches) {
      await User.findByIdAndUpdate(
        userId,
        { $set: { "phoneVerification.attempts": attempts + 1 } },
        { new: false },
      );
      return res.status(400).json({
        success: false,
        message: "인증번호가 올바르지 않습니다.",
      });
    }

    const verifiedAt = new Date(now);
    const nextPhone = String(
      pv.pendingPhoneNumber || user.phoneNumber || "",
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
      { new: false },
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
    delete updateData.businessId;

    if (
      Object.prototype.hasOwnProperty.call(updateData, "salesmanPayoutAccount")
    ) {
      const role = String(req.user?.role || "");
      if (role !== "salesman" && role !== "devops") {
        delete updateData.salesmanPayoutAccount;
      } else {
        const raw = updateData.salesmanPayoutAccount;
        const bankName = String(raw?.bankName || "").trim();
        const holderName = String(raw?.holderName || "").trim();
        const accountNumberRaw = String(raw?.accountNumber || "").trim();
        const accountNumber = accountNumberRaw.replace(/\s/g, "");

        const allEmpty = !bankName && !holderName && !accountNumber;
        let payoutAccount;
        if (allEmpty) {
          payoutAccount = {
            bankName: "",
            accountNumber: "",
            holderName: "",
            updatedAt: null,
          };
        } else {
          if (!bankName || !holderName || !accountNumber) {
            return res.status(400).json({
              success: false,
              message: "계좌 정보(은행/계좌번호/예금주)를 모두 입력해주세요.",
            });
          }
          payoutAccount = {
            bankName,
            accountNumber,
            holderName,
            updatedAt: new Date(),
          };
        }

        const anchorId = req.user?.businessAnchorId;
        if (anchorId && Types.ObjectId.isValid(String(anchorId))) {
          await BusinessAnchor.updateOne(
            { _id: new Types.ObjectId(String(anchorId)) },
            { $set: { payoutAccount } },
          );
        }
        delete updateData.salesmanPayoutAccount;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, "devopsPayoutSettings")
    ) {
      const role = String(req.user?.role || "");
      if (role !== "devops") {
        delete updateData.devopsPayoutSettings;
      } else {
        const raw = updateData.devopsPayoutSettings;
        const manufacturerRate = Number(raw?.manufacturerRate ?? 0.6);
        const devopsRate = Number(raw?.devopsRate ?? 0.1);
        const salesmanRate = Number(raw?.salesmanRate ?? 0.1);
        const adminRate = Number(raw?.adminRate ?? 0.2);
        const rates = [manufacturerRate, devopsRate, salesmanRate, adminRate];
        if (rates.some((r) => !Number.isFinite(r) || r < 0 || r > 1)) {
          return res.status(400).json({
            success: false,
            message: "분배율은 0~100% 범위여야 합니다.",
          });
        }

        const totalRate =
          manufacturerRate + devopsRate + salesmanRate + adminRate;
        if (Math.abs(totalRate - 1) > 0.0001) {
          return res.status(400).json({
            success: false,
            message: `분배율 합계는 100%여야 합니다. (현재 ${Math.round(totalRate * 10000) / 100}%)`,
          });
        }

        const platformFeeRate = Number(
          raw?.platformFeeRate ?? raw?.nonPartnerFeeRate ?? 0.1,
        );
        if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 1) {
          return res.status(400).json({
            success: false,
            message: "플랫폼 수수료율은 0~100% 범위여야 합니다.",
          });
        }

        const anchorId = req.user?.businessAnchorId;
        if (anchorId && Types.ObjectId.isValid(String(anchorId))) {
          await BusinessAnchor.updateOne(
            { _id: new Types.ObjectId(String(anchorId)) },
            {
              $set: {
                payoutRates: {
                  manufacturerRate,
                  devopsRate,
                  salesmanRate,
                  adminRate,
                  platformFeeRate,
                  partnerFeeRate: platformFeeRate,
                  nonPartnerFeeRate: platformFeeRate,
                  updatedAt: new Date(),
                },
              },
            },
          );
        }
        delete updateData.devopsPayoutSettings;
      }
    }

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
      Object.prototype.hasOwnProperty.call(updateData, "business") &&
      req.user?.role === "requestor" &&
      req.user?.businessAnchorId
    ) {
      const nextName = String(updateData.business || "").trim();
      const anchor = await BusinessAnchor.findOne({
        _id: req.user.businessAnchorId,
      });
      if (
        !anchor ||
        String(anchor.primaryContactUserId) !== String(req.user._id)
      ) {
        delete updateData.business;
      } else {
        if (nextName && nextName !== anchor.name) {
          const exists = await BusinessAnchor.findOne({
            _id: { $ne: anchor._id },
            name: nextName,
          }).select({ _id: 1 });
          if (exists) {
            return res.status(409).json({
              success: false,
              message: "이미 동일한 이름의 기공소가 존재합니다.",
            });
          }

          anchor.name = nextName;
          await anchor.save();

          await User.updateMany(
            { businessAnchorId: anchor._id },
            { $set: { business: nextName } },
          );
        }

        updateData.business = nextName || anchor.name;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "practiceProfile")) {
      const userRole = String(req.user?.role || "");
      const isPracticeRole = userRole === "practice";
      const isRequestorPracticeProfile = userRole === "requestor";

      if (isPracticeRole || isRequestorPracticeProfile) {
        const pp =
          updateData.practiceProfile &&
          typeof updateData.practiceProfile === "object"
            ? updateData.practiceProfile
            : {};
        const clinicName = String(
          pp.clinicName || updateData.business || "",
        ).trim();
        const directorName = String(pp.directorName || "").trim();
        const staffName = String(pp.staffName || updateData.name || "").trim();
        const phone = String(pp.phone || updateData.phoneNumber || "").trim();
        const clinicPhone = String(pp.clinicPhone || "").trim();
        const address = String(pp.address || "").trim();
        const addressDetail = String(pp.addressDetail || "").trim();
        const zipCode = String(pp.zipCode || "").trim();

        if (
          !clinicName ||
          !directorName ||
          !staffName ||
          !phone ||
          !clinicPhone ||
          !address ||
          !zipCode
        ) {
          return res.status(400).json({
            success: false,
            message:
              "치과명, 대표원장님 성함, 담당직원명, 치과 전화, 담당자 휴대폰, 주소, 우편번호는 필수입니다.",
          });
        }

        const existingCreatedAt = req.user?.practiceProfile?.createdAt;
        updateData.practiceProfile = {
          clinicName,
          directorName,
          staffName,
          phone,
          clinicPhone,
          address,
          addressDetail,
          zipCode,
          createdAt: existingCreatedAt || new Date(),
          updatedAt: new Date(),
        };
        updateData.business = clinicName;
        if (!String(updateData.name || "").trim()) {
          updateData.name = staffName;
        }
        if (!String(updateData.phoneNumber || "").trim()) {
          updateData.phoneNumber = phone;
        }

        // 의뢰자 Org SSOT: practiceProfile 완료 시 BusinessAnchor 보장.
        if (
          (isRequestorPracticeProfile || isPracticeRole) &&
          !req.user?.requestorKind
        ) {
          updateData.requestorKind = "practice";
          updateData.requestorServices = { free: false, paid: true };
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    let responseUser = updatedUser;
    if (Object.prototype.hasOwnProperty.call(updateData, "practiceProfile")) {
      await ensureRequestorOrgAnchor({ user: updatedUser.toObject() });
      const refreshed = await User.findById(updatedUser._id).select("-password");
      if (refreshed) responseUser = refreshed;
    }

    res.status(200).json({
      success: true,
      message: "프로필이 성공적으로 수정되었습니다.",
      data: responseUser,
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
      "preferences.notifications",
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
      { new: true, runValidators: true },
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
          updatedUser.preferences.notifications.methods || {},
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

/**
 * 최근 대시보드 경로 조회
 * @route GET /api/users/last-dashboard-path
 */
async function getLastDashboardPath(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("preferences.lastDashboardPath")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    const path = normalizeLastDashboardPath(
      user?.preferences?.lastDashboardPath,
    );
    return res.status(200).json({
      success: true,
      data: { path },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "최근 페이지 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 최근 대시보드 경로 저장
 * @route PUT /api/users/last-dashboard-path
 */
async function updateLastDashboardPath(req, res) {
  try {
    const path = normalizeLastDashboardPath(req.body?.path);
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 대시보드 경로입니다.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "preferences.lastDashboardPath": path } },
      { new: true, runValidators: true },
    ).select("preferences.lastDashboardPath");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        path: normalizeLastDashboardPath(
          updatedUser.preferences?.lastDashboardPath,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "최근 페이지 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 계정(개인) 워크스페이스 모드 조회
 * @route GET /api/users/workspace-mode
 */
async function getWorkspaceMode(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("preferences.workspaceMode")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        mode: normalizeWorkspaceMode(user?.preferences?.workspaceMode),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "모드 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 계정(개인) 워크스페이스 모드 저장
 * @route PUT /api/users/workspace-mode
 */
async function updateWorkspaceMode(req, res) {
  try {
    const raw = req.body?.mode;
    const value = String(raw || "")
      .trim()
      .toLowerCase();
    if (value !== "express" && value !== "expert") {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 모드입니다.",
      });
    }
    const mode = normalizeWorkspaceMode(value);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "preferences.workspaceMode": mode } },
      { new: true, runValidators: true },
    ).select("preferences.workspaceMode");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        mode: normalizeWorkspaceMode(updatedUser.preferences?.workspaceMode),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "모드 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 데스크톱 사이드바 펼침 조회
 * @route GET /api/users/sidebar-open
 */
async function getSidebarOpen(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("preferences.sidebarOpen")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        open: normalizeSidebarOpen(user?.preferences?.sidebarOpen),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사이드바 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 데스크톱 사이드바 펼침 저장
 * @route PUT /api/users/sidebar-open
 */
async function updateSidebarOpen(req, res) {
  try {
    const raw = req.body?.open;
    if (raw !== true && raw !== false) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사이드바 상태입니다.",
      });
    }
    const open = normalizeSidebarOpen(raw);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "preferences.sidebarOpen": open } },
      { new: true, runValidators: true },
    ).select("preferences.sidebarOpen");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        open: normalizeSidebarOpen(updatedUser.preferences?.sidebarOpen),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사이드바 상태 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기공의뢰수신 캘린더 날짜 뱃지 조회
 * @route GET /api/users/lab-receive-calendar-date-key
 */
async function getLabReceiveCalendarDateKey(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("preferences.labReceiveCalendarDateKey")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        dateKey: normalizeLabReceiveCalendarDateKey(
          user?.preferences?.labReceiveCalendarDateKey,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "캘린더 날짜 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기공의뢰수신 캘린더 날짜 뱃지 저장
 * @route PUT /api/users/lab-receive-calendar-date-key
 */
async function updateLabReceiveCalendarDateKey(req, res) {
  try {
    const dateKey = normalizeLabReceiveCalendarDateKey(req.body?.dateKey);
    const raw = String(req.body?.dateKey || "").trim();
    if (raw !== "orderDate" && raw !== "arrivalDate") {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 날짜 뱃지입니다.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "preferences.labReceiveCalendarDateKey": dateKey } },
      { new: true, runValidators: true },
    ).select("preferences.labReceiveCalendarDateKey");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        dateKey: normalizeLabReceiveCalendarDateKey(
          updatedUser.preferences?.labReceiveCalendarDateKey,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "캘린더 날짜 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기공의뢰수신 캘린더 숨길 요일 조회
 * @route GET /api/users/lab-receive-calendar-hidden-weekdays
 */
async function getLabReceiveCalendarHiddenWeekdays(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("preferences.labReceiveCalendarHiddenWeekdays")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        hiddenWeekdays: normalizeLabReceiveCalendarHiddenWeekdays(
          user?.preferences?.labReceiveCalendarHiddenWeekdays,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "캘린더 숨길 요일 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기공의뢰수신 캘린더 숨길 요일 저장
 * @route PUT /api/users/lab-receive-calendar-hidden-weekdays
 */
async function updateLabReceiveCalendarHiddenWeekdays(req, res) {
  try {
    if (!Array.isArray(req.body?.hiddenWeekdays)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 숨길 요일입니다.",
      });
    }
    const hiddenWeekdays = normalizeLabReceiveCalendarHiddenWeekdays(
      req.body.hiddenWeekdays,
    );
    // 전 요일 숨김·비배열은 normalize가 기본값으로 돌리므로, 원본이 전부 무효면 400
    const rawValid = req.body.hiddenWeekdays.filter((item) => {
      const n = typeof item === "number" ? item : Number(item);
      return Number.isInteger(n) && n >= 0 && n <= 6;
    });
    const unique = new Set(rawValid);
    if (unique.size >= 7) {
      return res.status(400).json({
        success: false,
        message: "모든 요일을 숨길 수 없습니다.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "preferences.labReceiveCalendarHiddenWeekdays": hiddenWeekdays } },
      { new: true, runValidators: true },
    ).select("preferences.labReceiveCalendarHiddenWeekdays");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hiddenWeekdays: normalizeLabReceiveCalendarHiddenWeekdays(
          updatedUser.preferences?.labReceiveCalendarHiddenWeekdays,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "캘린더 숨길 요일 저장 중 오류가 발생했습니다.",
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
  getLastDashboardPath,
  updateLastDashboardPath,
  getWorkspaceMode,
  updateWorkspaceMode,
  getSidebarOpen,
  updateSidebarOpen,
  getLabReceiveCalendarDateKey,
  updateLabReceiveCalendarDateKey,
  getLabReceiveCalendarHiddenWeekdays,
  updateLabReceiveCalendarHiddenWeekdays,
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
