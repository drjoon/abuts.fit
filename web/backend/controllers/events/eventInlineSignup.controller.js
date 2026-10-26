// related files:
// - web/backend/controllers/events/marketingEvent.controller.js
// - web/backend/controllers/auth/signupVerification.controller.js
// - web/backend/services/kakaoPlaceSearch.service.js
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
import crypto from "crypto";
import { Types } from "mongoose";
import MarketingEvent from "../../models/marketingEvent.model.js";
import MarketingEventApplication from "../../models/marketingEventApplication.model.js";
import User from "../../models/user.model.js";
import { searchKakaoPlaces } from "../../services/kakaoPlaceSearch.service.js";
import {
  assertSignupPhoneVerified,
  consumeSignupVerifications,
} from "../auth/signupVerification.controller.js";
import { generateRefreshToken, generateToken } from "../../utils/jwt.util.js";
import { defaultProfileImageForSeed } from "../../utils/defaultProfileImage.js";
import {
  isStrongPassword,
  PASSWORD_POLICY_MESSAGE,
} from "../../utils/passwordPolicy.js";
import { isReservedReferralCode } from "../../utils/requestorReferralWindow.util.js";
import { resolveAbutsAdminReferralAnchorId } from "../../services/abutsAdminReferral.service.js";
import {
  ABUTS_LAB_EVENT_SLUG,
  ensureDefaultMarketingEvents,
} from "./marketingEvent.controller.js";
import { findClinicIdentityDuplicate } from "./eventApplicationDuplicate.js";
import { markEventVisitConverted } from "../../services/eventVisitLog.service.js";

function trimStr(value, max = 200) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function compact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isMobilePhone(digits) {
  return /^01[016789]\d{7,8}$/.test(digits);
}

/** 클라이언트가 고른 카카오 치과와 서버 검색 결과가 같은 장소인지. */
export function matchKakaoPracticePlace(items, wanted) {
  const name = compact(wanted?.name);
  const address = compact(wanted?.address);
  const lat = Number(wanted?.lat);
  const lng = Number(wanted?.lng);
  if (!name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  for (const item of items || []) {
    if (compact(item?.name) !== name) continue;
    if (compact(item?.address) !== address) continue;
    const itemLat = Number(item?.lat);
    const itemLng = Number(item?.lng);
    if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) continue;
    if (Math.abs(itemLat - lat) > 0.001 || Math.abs(itemLng - lng) > 0.001) {
      continue;
    }
    return item;
  }
  return null;
}

async function ensureUniqueReferralCode(length = 5) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 200; i += 1) {
    let code = "";
    for (let j = 0; j < length; j += 1) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (isReservedReferralCode(code)) continue;
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("Failed to create referralCode");
}

/**
 * 어벗츠기공소 소개 — 페이지 안에서 최소 가입과 상담 신청을 함께 받는다.
 * 이메일 인증·사업자등록은 받지 않는다. 휴대폰은 확인한다.
 * 치과 주소는 카카오 검색 결과를 확인하고, 결과가 없으면 직접 입력(manualAddress)을 받는다.
 * 소개 코드는 어벗츠 주식회사(AAA)로 고정한다. 본인 소개 코드는 따로 발급한다.
 * @route POST /api/events/:slug/signup-apply
 */
export async function signupApplyToEvent(req, res) {
  let createdUser = null;
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    if (slug !== ABUTS_LAB_EVENT_SLUG) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }

    const event = await MarketingEvent.findOne({ slug }).lean();
    if (!event || event.status !== "open") {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없거나 신청이 마감되었습니다.",
      });
    }

    const body = req.body || {};
    const email = trimStr(body.email, 120).toLowerCase();
    const password = String(body.password || "");
    const directorName = trimStr(body.directorName, 80);
    const phone = trimStr(body.phone, 40);
    const digits = phoneDigits(phone);
    const clinicName = trimStr(body.clinicName, 120);
    const address = trimStr(body.address, 240);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const usesOralScan = body.usesOralScan;
    const manualAddress = body.manualAddress === true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "이메일 형식을 확인해 주세요.",
      });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_POLICY_MESSAGE,
      });
    }
    if (directorName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "성함을 입력해 주세요.",
      });
    }
    if (!isMobilePhone(digits)) {
      return res.status(400).json({
        success: false,
        message: "휴대폰 번호 형식을 확인해 주세요.",
      });
    }
    if (typeof usesOralScan !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "구강 스캐너 사용 여부를 선택해 주세요.",
      });
    }
    if (manualAddress) {
      if (clinicName.length < 2 || address.length < 5) {
        return res.status(400).json({
          success: false,
          message: "치과명과 주소를 입력해 주세요.",
        });
      }
    } else if (
      !clinicName ||
      address.length < 5 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        success: false,
        message: "검색 결과에서 주소를 선택해 주세요.",
      });
    }

    const phoneOk = await assertSignupPhoneVerified(digits);
    if (!phoneOk) {
      return res.status(400).json({
        success: false,
        message: "휴대폰 인증을 완료해 주세요.",
      });
    }

    let place = null;
    if (manualAddress) {
      place = {
        name: clinicName,
        address,
        lat: null,
        lng: null,
        phone: "",
      };
    } else {
      const kakao = await searchKakaoPlaces(clinicName, {
        mode: "practice",
        limit: 40,
      });
      if (kakao.keyMissing || kakao.authError) {
        return res.status(503).json({
          success: false,
          message: "주소 확인을 잠시 후 다시 시도해 주세요. 주소를 직접 입력할 수도 있습니다.",
        });
      }
      place = matchKakaoPracticePlace(kakao.items, {
        name: clinicName,
        address,
        lat,
        lng,
      });
      if (!place) {
        return res.status(400).json({
          success: false,
          message: "검색 결과에서 주소를 다시 선택해 주세요.",
        });
      }
    }

    const existingByEmail = await User.findOne({ email }).select({ _id: 1 }).lean();
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: "이미 등록된 이메일입니다. 로그인해 신청해 주세요.",
      });
    }

    const dup = await findClinicIdentityDuplicate(MarketingEventApplication, {
      eventId: event._id,
      clinicName: place.name,
      directorName,
      address: place.address,
      applicantPhone: phone,
      practicePhone: place.phone,
    });
    if (dup) {
      return res.status(409).json({
        success: false,
        message: "이미 신청하신 내역이 있습니다. 영업 담당자에게 문의해 주세요.",
      });
    }

    const adminAnchorId = await resolveAbutsAdminReferralAnchorId();
    if (!adminAnchorId || !Types.ObjectId.isValid(String(adminAnchorId))) {
      return res.status(503).json({
        success: false,
        message: "소개 코드를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const referralCode = await ensureUniqueReferralCode(5);
    const now = new Date();
    const clinicPhone = trimStr(place.phone, 40);
    const user = new User({
      name: directorName,
      email,
      password,
      role: "requestor",
      subRole: "owner",
      business: place.name,
      referralCode,
      referredByAnchorId: new Types.ObjectId(String(adminAnchorId)),
      requestorKind: "practice",
      requestorServices: { free: false, paid: true },
      signupChannel: "event_abuts_lab",
      onboardingWizardCompleted: false,
      approvedAt: now,
      active: true,
      isVerified: true,
      profileImage: defaultProfileImageForSeed(email),
      phoneNumber: phone,
      phoneVerifiedAt: now,
      practiceProfile: {
        clinicName: place.name,
        directorName,
        staffName: directorName,
        phone,
        clinicPhone,
        address: place.address,
        usesOralScan,
        createdAt: now,
        updatedAt: now,
      },
    });

    createdUser = await user.save();

    const application = await MarketingEventApplication.create({
      eventId: event._id,
      eventSlug: event.slug,
      applicantUserId: createdUser._id,
      practice: {
        name: place.name,
        representativeName: directorName,
        phone: clinicPhone || phone,
        address: place.address,
        lat: place.lat == null ? null : Number(place.lat),
        lng: place.lng == null ? null : Number(place.lng),
      },
      directorName,
      dealer: {
        name: "",
        representativeName: "",
        phone: "",
        address: "",
        lat: null,
        lng: null,
      },
      usesOralScan,
      applicantPhone: phone,
      applicantEmail: email,
      memo: "",
      status: "received",
    });

    try {
      await consumeSignupVerifications({
        phone: digits,
        userId: createdUser._id,
      });
    } catch (consumeError) {
      console.error("[events.signupApply] consume phone verification", consumeError);
    }

    void markEventVisitConverted(event._id, req.body?.visitSessionId).catch(
      (err) => {
        console.error("[events.signupApply] visit convert", err?.message || err);
      },
    );

    const token = generateToken({
      userId: createdUser._id,
      role: createdUser.role,
    });
    const refreshToken = generateRefreshToken(createdUser._id);

    return res.status(201).json({
      success: true,
      message: "신청이 접수되었습니다.",
      data: {
        token,
        refreshToken,
        applicationId: String(application._id),
      },
    });
  } catch (error) {
    if (createdUser?._id) {
      await User.deleteOne({ _id: createdUser._id }).catch((deleteError) => {
        console.error("[events.signupApply] rollback user", deleteError);
      });
      await MarketingEventApplication.deleteMany({
        applicantUserId: createdUser._id,
        eventSlug: ABUTS_LAB_EVENT_SLUG,
      }).catch(() => {});
    }
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "이미 등록된 이메일입니다. 로그인해 신청해 주세요.",
      });
    }
    console.error("[events.signupApply]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "신청에 실패했습니다.",
    });
  }
}
