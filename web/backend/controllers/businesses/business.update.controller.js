// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { verifyBusinessNumber } from "../../services/hometax.service.js";
import {
  assertBusinessRole,
  buildBusinessTypeFilter,
} from "./businessRole.util.js";
import {
  normalizeBusinessNumber,
  normalizePhoneNumber,
  isValidEmail,
  isValidAddress,
  normalizeStartDate,
  hasOwnKey,
  isDuplicateKeyError,
  formatBusinessNumber,
} from "./business.validation.util.js";
import { normalizeBusinessAddressFields } from "./business.address.util.js";
import { findBusinessByAnchors } from "./business.find.util.js";
import { grantWelcomeFreeCreditIfEligible } from "./business.freeCredit.util.js";
import { enableDemoModeAndGrantCreditIfEligible } from "./business.demoMode.util.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";
import { invalidateMyBusinessCache } from "./business.controller.js";
import {
  hasRequestorProfile,
  requiresBusinessLicense,
  resolveRequestorProfile,
  normalizeRequestorProfileInput,
  requestorProfilePersistFields,
  requestorProfileResponseFields,
  normalizeRequestorKind,
  canReceivePracticeTransfer,
} from "../../utils/requestorCapabilities.js";
import { isInternalLabBusinessType } from "../../utils/practiceTransferAutoMatch.js";
import { isSyntheticPracticeBusinessNumber } from "./requestorOrgAnchor.util.js";
import {
  activateLabTradingPartnerInvite,
  activatePendingLabTradingPartnersForPractice,
} from "../../utils/labTradingPartner.util.js";
import {
  applyAbutsLabCertification,
  applyAutoMatchParticipationCancel,
  applyAutoMatchParticipationJoin,
  autoMatchParticipationResponseFields,
} from "../../services/labAutoMatchParticipation.service.js";
import {
  canLabApplyAbutsCertification,
  isAbutsLabCertificationCertified,
  toAbutsLabCertificationApi,
} from "../../utils/abutsLabCertification.js";
import {
  loadGlobalLabRatingAggregates,
  toLabRatingSummaryApi,
} from "../../utils/practiceLabRating.js";
import { resolvePlatformFeeRate, resolveDirectPlatformFeeRateConfigured } from "../../services/creditRevenuePolicy.service.js";

function resolveLabPartnerInviteToken(req) {
  return String(
    req.body?.labPartnerToken ||
      req.body?.labPartner ||
      req.body?.labTradingPartnerToken ||
      "",
  ).trim();
}

/** 자동매칭 참여: requestor lab 또는 어벗츠기공소(internalLab). */
function assertAutoMatchParticipationActor({ profile, anchor, role }) {
  if (isInternalLabBusinessType(anchor)) return null;
  if (String(role || "").trim() === "internalLab") return null;
  if (String(profile?.kind || "").trim() !== "lab") {
    return "자동 매칭 참여는 기공소만 이용할 수 있습니다.";
  }
  return null;
}

function canJoinAutoMatchParticipation({ profile, anchor, role }) {
  if (isInternalLabBusinessType(anchor)) return true;
  if (String(role || "").trim() === "internalLab") return true;
  return canReceivePracticeTransfer(profile);
}

async function bindLabTradingPartnerFromRequest({
  req,
  businessAnchorId,
  verified,
}) {
  const inviteToken = resolveLabPartnerInviteToken(req);
  let bound = false;
  let status = null;
  if (inviteToken && businessAnchorId) {
    const kind =
      normalizeRequestorKind(
        req.body?.requestorKind ||
          req.user?.requestorKind ||
          undefined,
      ) || "practice";
    try {
      const bindResult = await activateLabTradingPartnerInvite({
        inviteToken,
        practiceAnchorId: businessAnchorId,
        practiceKind: kind,
        verified: Boolean(verified),
      });
      bound = Boolean(bindResult?.activated);
      if (bound) {
        status = String(bindResult?.partner?.status || "") || "active";
      }
    } catch (bindErr) {
      console.warn(
        "[BusinessAnchor] lab trading partner bind failed",
        bindErr?.message || bindErr,
      );
    }
  }
  if (verified && businessAnchorId) {
    try {
      const pending = await activatePendingLabTradingPartnersForPractice({
        practiceAnchorId: businessAnchorId,
      });
      if (pending?.activated) {
        bound = true;
        status = "active";
      }
    } catch (pendErr) {
      console.warn(
        "[BusinessAnchor] lab trading partner pending activate failed",
        pendErr?.message || pendErr,
      );
    }
  }
  return { bound, status };
}

// BusinessAnchor를 직접 생성/업데이트하는 헬퍼 함수
export async function ensureBusinessAnchor({
  businessNumberNormalized,
  businessType,
  name,
  userId,
  referredByAnchorId,
  metadata = {},
  verified = false,
}) {
  if (!businessNumberNormalized) return null;
  if (!name) return null;
  if (!businessType) return null;

  const existingAnchor = await BusinessAnchor.findOne({
    businessNumberNormalized,
    businessType,
  })
    .select({ _id: 1, referredByAnchorId: 1 })
    .lean();

  const anchor = await BusinessAnchor.findOneAndUpdate(
    { businessNumberNormalized, businessType },
    {
      $set: {
        businessType,
        name,
        status: verified ? "verified" : "active",
        primaryContactUserId: userId || null,
        "metadata.companyName": String(
          metadata.companyName || name || "",
        ).trim(),
        "metadata.representativeName": String(
          metadata.representativeName || "",
        ).trim(),
        "metadata.address": String(metadata.address || "").trim(),
        "metadata.addressDetail": String(metadata.addressDetail || "").trim(),
        "metadata.zipCode": String(metadata.zipCode || "").trim(),
        "metadata.phoneNumber": String(metadata.phoneNumber || "").trim(),
        "metadata.email": String(metadata.email || "").trim(),
        "metadata.businessItem": String(metadata.businessItem || "").trim(),
        "metadata.businessType": String(metadata.businessType || "").trim(),
        "metadata.startDate": String(metadata.startDate || "").trim(),
        "metadata.businessNumber": String(metadata.businessNumber || "").trim(),
      },
      $setOnInsert: {
        referredByAnchorId: referredByAnchorId || null,
        defaultReferralAnchorId: referredByAnchorId || null,
        ...(businessType === "requestor"
          ? { demoMode: true, demoModeStartedAt: new Date() }
          : {}),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const anchorId = anchor?._id || existingAnchor?._id || null;
  if (!anchorId) return null;

  // 신규 requestor 앵커: 데모 모드 + 데모 크레딧(멱등)
  if (businessType === "requestor" && !existingAnchor?._id) {
    try {
      await enableDemoModeAndGrantCreditIfEligible({
        businessAnchorId: anchorId,
        userId,
      });
    } catch (e) {
      console.error("[BusinessAnchor] demo mode grant failed", e);
    }
  }

  if (
    !existingAnchor?.referredByAnchorId &&
    referredByAnchorId &&
    Types.ObjectId.isValid(String(referredByAnchorId))
  ) {
    await BusinessAnchor.updateOne(
      {
        _id: anchorId,
        referredByAnchorId: null,
      },
      {
        $set: {
          referredByAnchorId,
          defaultReferralAnchorId: referredByAnchorId,
        },
      },
    );
  }

  await User.updateMany(
    { businessAnchorId: anchorId },
    { $set: { business: name } },
  );
  if (userId) {
    await User.updateOne(
      { _id: userId },
      {
        $set: { businessAnchorId: anchorId, business: name, subRole: "owner" },
      },
    );
  }

  emitReferralMembershipChanged(anchorId, "business-anchor-linked");

  return anchorId;
}

export async function updateMyBusiness(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const nextName = String(req.body?.name || "").trim();
    const businessLicenseInput = req.body?.businessLicense || null;

    const representativeNameProvided = hasOwnKey(
      req.body,
      "representativeName",
    );
    const businessItemProvided = hasOwnKey(req.body, "businessItem");
    const phoneNumberProvided = hasOwnKey(req.body, "phoneNumber");
    const businessNumberProvided = hasOwnKey(req.body, "businessNumber");
    const businessTypeFieldProvided = hasOwnKey(req.body, "businessType");
    const emailProvided = hasOwnKey(req.body, "email");
    const addressProvided = hasOwnKey(req.body, "address");
    const addressDetailProvided = hasOwnKey(req.body, "addressDetail");
    const zipCodeProvided = hasOwnKey(req.body, "zipCode");
    const startDateProvided = hasOwnKey(req.body, "startDate");
    const shippingPolicyProvided = hasOwnKey(req.body, "shippingPolicy");
    const requestorProfileProvided =
      hasOwnKey(req.body, "requestorKind") ||
      hasOwnKey(req.body, "requestorServices") ||
      hasOwnKey(req.body, "requestorCapabilities");
    const nextRequestorProfile = requestorProfileProvided
      ? normalizeRequestorProfileInput({
          ...req.body,
          businessVerified: false,
        })
      : null;

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        business: 1,
        referredByAnchorId: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        role: 1,
      })
      .lean();
    const effectiveBusinessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;
    const effectiveBusinessName = String(
      freshUser?.business || req.user.business || "",
    ).trim();

    const nextNameProvided = hasOwnKey(req.body, "name");
    let businessAnchor = await findBusinessByAnchors({
      businessType,
      businessId: effectiveBusinessAnchorId,
      businessNumber: req.body?.businessNumber,
      userId: req.user._id,
      businessName: effectiveBusinessName,
    });

    const hasBusinessAnchor = Boolean(
      businessAnchor?._id || effectiveBusinessAnchorId,
    );
    console.info("[BusinessAnchor] updateMyBusiness", {
      userId: String(req.user._id),
      businessType,
      tokenBusinessAnchorId: String(req.user.businessAnchorId || ""),
      freshBusinessAnchorId: String(freshUser?.businessAnchorId || ""),
      effectiveBusinessAnchorId: String(effectiveBusinessAnchorId || ""),
      tokenBusinessName: String(req.user.business || ""),
      effectiveBusinessName,
      resolvedBusinessAnchorId: String(businessAnchor?._id || ""),
      resolvedBusinessName: String(businessAnchor?.name || ""),
      payloadBusinessNumber: String(req.body?.businessNumber || ""),
      payloadName: String(req.body?.name || ""),
    });

    if (hasBusinessAnchor) {
      const meId = String(req.user._id);
      const canEdit =
        businessAnchor &&
        (String(businessAnchor.primaryContactUserId) === meId ||
          (Array.isArray(businessAnchor.owners) &&
            businessAnchor.owners.some((c) => String(c) === meId)));
      const nonShippingProvided =
        hasOwnKey(req.body, "name") ||
        representativeNameProvided ||
        businessItemProvided ||
        phoneNumberProvided ||
        businessNumberProvided ||
        businessTypeFieldProvided ||
        emailProvided ||
        addressProvided ||
        addressDetailProvided ||
        zipCodeProvided ||
        startDateProvided ||
        hasOwnKey(req.body, "businessLicense") ||
        requestorProfileProvided;
      if (!canEdit && (nonShippingProvided || !shippingPolicyProvided)) {
        return res.status(403).json({
          success: false,
          message: "대표자 계정만 수정할 수 있습니다.",
        });
      }
    }

    const representativeName = String(
      req.body?.representativeName || "",
    ).trim();
    const businessItem = String(req.body?.businessItem || "").trim();
    const phoneNumberRaw = String(req.body?.phoneNumber || "").trim();
    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    const businessTypeField = String(req.body?.businessType || "").trim();
    const email = String(req.body?.email || "").trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();
    const startDateRaw = String(req.body?.startDate || "").trim();
    const startDate = normalizeStartDate(startDateRaw);

    const businessLicense = businessLicenseInput
      ? {
          fileId: businessLicenseInput?.fileId || null,
          s3Key: String(businessLicenseInput?.s3Key || "").trim(),
          originalName: String(businessLicenseInput?.originalName || "").trim(),
          uploadedAt: new Date(),
        }
      : null;

    // 의뢰자 역할(kind) + 서비스(services) — 앵커 SSOT. 단독 저장 시 User(+Anchor) 동기화.
    if (
      requestorProfileProvided &&
      businessType === "requestor" &&
      nextRequestorProfile
    ) {
      if (!hasRequestorProfile(nextRequestorProfile)) {
        return res.status(400).json({
          success: false,
          message:
            "역할(치과/기공소)을 선택해주세요.",
        });
      }

      const isVerifiedBusiness = businessAnchor?.status === "verified";
      // 가입 도중 practice 조직용 미검증 앵커가 먼저 생성될 수 있다.
      // 앵커 존재 여부가 아니라 이번 저장 요청에 등록증이 포함됐는지를 기준으로
      // 아래의 홈택스 검증·사업자 저장 경로를 허용한다.
      const hasLicenseInRegistrationRequest = Boolean(
        businessLicenseInput?.fileId ||
          String(businessLicenseInput?.s3Key || "").trim(),
      );
      if (
        requiresBusinessLicense(nextRequestorProfile.services) &&
        !isVerifiedBusiness &&
        !hasLicenseInRegistrationRequest
      ) {
        return res.status(400).json({
          success: false,
          reason: "business_license_required",
          message: "사업자등록증을 등록·검증해야 합니다.",
        });
      }

      const onlyProfileUpdate =
        !nextNameProvided &&
        !representativeNameProvided &&
        !businessItemProvided &&
        !phoneNumberProvided &&
        !businessNumberProvided &&
        !businessTypeFieldProvided &&
        !emailProvided &&
        !addressProvided &&
        !addressDetailProvided &&
        !zipCodeProvided &&
        !startDateProvided &&
        !shippingPolicyProvided &&
        !hasOwnKey(req.body, "businessLicense");

      if (onlyProfileUpdate) {
        const persist = requestorProfilePersistFields(nextRequestorProfile);
        await User.findByIdAndUpdate(req.user._id, {
          $set: persist,
        });
        if (businessAnchor?._id) {
          await BusinessAnchor.findByIdAndUpdate(businessAnchor._id, {
            $set: persist,
          });
        }
        invalidateMyBusinessCache(req.user._id);
        return res.json({
          success: true,
          data: {
            updated: true,
            ...requestorProfileResponseFields(nextRequestorProfile),
            businessAnchorId: businessAnchor?._id || null,
          },
        });
      }
    }

    const phoneNumber = phoneNumberRaw
      ? normalizePhoneNumber(phoneNumberRaw)
      : "";
    const businessNumber = businessNumberRaw
      ? normalizeBusinessNumber(businessNumberRaw)
      : "";
    const currentBusinessNumber = formatBusinessNumber(
      businessAnchor?.metadata?.businessNumber || "",
    );
    const isBusinessNumberChanging =
      businessNumberProvided &&
      Boolean(businessNumber) &&
      currentBusinessNumber !== businessNumber;
    const isVerifiedBusiness = businessAnchor?.status === "verified";
    const wasSyntheticBusinessNumber = isSyntheticPracticeBusinessNumber(
      businessAnchor?.businessNumberNormalized,
    );

    if (phoneNumberRaw && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "전화번호 형식이 올바르지 않습니다.",
      });
    }

    if (businessNumberRaw && !businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    // 사업자등록증 업로드와 함께 사업자등록번호가 변경되는 경우는 허용
    // (사업자등록증에서 추출한 번호가 더 정확함)
    const isBusinessLicenseUpdate = Boolean(
      businessLicense && (businessLicense.s3Key || businessLicense.fileId),
    );

    if (
      isVerifiedBusiness &&
      isBusinessNumberChanging &&
      !isBusinessLicenseUpdate
    ) {
      return res.status(400).json({
        success: false,
        reason: "business_number_locked",
        message:
          "검증 완료된 사업자의 사업자등록번호는 직접 변경할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "세금계산서 이메일 형식이 올바르지 않습니다.",
      });
    }

    if (address && !isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "주소 형식이 올바르지 않습니다.",
      });
    }

    if (startDateRaw && !startDate) {
      return res.status(400).json({
        success: false,
        message: "개업연월일은 YYYYMMDD 8자리로 입력해주세요.",
      });
    }

    const normalizedAddressFields =
      addressProvided || zipCodeProvided
        ? await normalizeBusinessAddressFields({ address, zipCode })
        : null;

    const originalBusinessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;
    let attachToBusinessAnchor = null;
    if (businessNumber && isBusinessNumberChanging) {
      const businessNumberNormalized = businessNumber.replace(/\D/g, "").trim();
      const existingAnchorByNumber = await BusinessAnchor.findOne({
        ...typeFilter,
        businessNumberNormalized,
      });
      const meId = String(req.user._id);

      if (existingAnchorByNumber) {
        const existingPrimaryContactId = String(
          existingAnchorByNumber.primaryContactUserId || "",
        );
        const existingIsOwner =
          Array.isArray(existingAnchorByNumber.owners) &&
          existingAnchorByNumber.owners.some((c) => String(c) === meId);
        const existingIsMember =
          Array.isArray(existingAnchorByNumber.members) &&
          existingAnchorByNumber.members.some((m) => String(m) === meId);
        const isMyExistingAnchor =
          existingPrimaryContactId === meId ||
          existingIsOwner ||
          existingIsMember;

        if (isMyExistingAnchor) {
          console.info(
            "[BusinessAnchor] updateMyBusiness same-anchor own anchor",
            {
              userId: meId,
              currentResolvedAnchorId: String(businessAnchor?._id || ""),
              existingAnchorByNumberId: String(
                existingAnchorByNumber?._id || "",
              ),
              businessNumber,
            },
          );
          attachToBusinessAnchor = existingAnchorByNumber;
          businessAnchor = existingAnchorByNumber;
        }
      }

      if (
        existingAnchorByNumber &&
        !attachToBusinessAnchor &&
        (!businessAnchor ||
          String(existingAnchorByNumber._id) !== String(businessAnchor._id))
      ) {
        if (hasBusinessAnchor) {
          console.info("[BusinessAnchor] updateMyBusiness conflict", {
            reason: "business_number_switch_requires_admin",
            userId: String(req.user._id),
            resolvedAnchorId: String(businessAnchor?._id || ""),
            existingAnchorByNumberId: String(existingAnchorByNumber?._id || ""),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "business_number_switch_requires_admin",
            message:
              "기존 사업자에 연결된 상태에서는 사업자등록번호로 다른 사업자로 전환할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
          });
        }
        const primaryContactId = String(
          existingAnchorByNumber.primaryContactUserId || "",
        );
        const isOwner =
          Array.isArray(existingAnchorByNumber.owners) &&
          existingAnchorByNumber.owners.some((c) => String(c) === meId);
        const isMember =
          Array.isArray(existingAnchorByNumber.members) &&
          existingAnchorByNumber.members.some((m) => String(m) === meId);

        if (primaryContactId === meId || isOwner || isMember) {
          console.info("[BusinessAnchor] updateMyBusiness attachToAnchor", {
            userId: String(req.user._id),
            attachToAnchorId: String(existingAnchorByNumber?._id || ""),
            businessNumber,
          });
          attachToBusinessAnchor = existingAnchorByNumber;
          businessAnchor = existingAnchorByNumber;
        } else {
          console.info("[BusinessAnchor] updateMyBusiness conflict", {
            reason: "duplicate_business_number",
            userId: String(req.user._id),
            resolvedAnchorId: String(businessAnchor?._id || ""),
            existingAnchorByNumberId: String(existingAnchorByNumber?._id || ""),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
          });
        }
      }
    }

    const patch = {};
    const unsetPatch = {};
    if (nextNameProvided && nextName) patch.name = nextName;

    if (
      businessLicense &&
      (businessLicense.s3Key || businessLicense.originalName)
    ) {
      patch.businessLicense = businessLicense;
    }

    if (
      requestorProfileProvided &&
      nextRequestorProfile &&
      businessType === "requestor"
    ) {
      if (!hasRequestorProfile(nextRequestorProfile)) {
        return res.status(400).json({
          success: false,
          message:
            "역할(치과/기공소)을 선택해주세요.",
        });
      }
      if (
        requiresBusinessLicense(nextRequestorProfile.services) &&
        businessAnchor?.status !== "verified" &&
        !businessNumberProvided &&
        !businessLicense
      ) {
        return res.status(400).json({
          success: false,
          reason: "business_license_required",
          message: "사업자등록증을 등록·검증해야 합니다.",
        });
      }
      Object.assign(patch, requestorProfilePersistFields(nextRequestorProfile));
    }

    const metadataPatch = {};
    if (nextNameProvided) metadataPatch.companyName = nextName;
    if (representativeNameProvided)
      metadataPatch.representativeName = representativeName;
    if (businessItemProvided) metadataPatch.businessItem = businessItem;
    if (phoneNumberProvided) metadataPatch.phoneNumber = phoneNumber;
    if (businessTypeFieldProvided)
      metadataPatch.businessType = businessTypeField;
    if (emailProvided) metadataPatch.email = email;
    if (addressProvided)
      metadataPatch.address =
        normalizedAddressFields?.address != null
          ? normalizedAddressFields.address
          : address;
    if (addressDetailProvided) metadataPatch.addressDetail = addressDetail;
    if (zipCodeProvided)
      metadataPatch.zipCode =
        normalizedAddressFields?.zipCode != null
          ? normalizedAddressFields.zipCode
          : zipCode;
    if (startDateProvided) metadataPatch.startDate = startDate;

    if (businessNumberProvided) {
      if (!businessNumber) {
        unsetPatch["metadata.businessNumber"] = 1;
      } else {
        metadataPatch.businessNumber = businessNumber;
        // synthetic practice-* → 실BN 승격 시 unique 키도 동일 앵커에서 교체
        const nextNormalized = businessNumber.replace(/\D/g, "").trim();
        const currentNormalized = String(
          businessAnchor?.businessNumberNormalized || "",
        ).trim();
        if (
          nextNormalized &&
          (isSyntheticPracticeBusinessNumber(currentNormalized) ||
            currentNormalized !== nextNormalized)
        ) {
          patch.businessNumberNormalized = nextNormalized;
        }
      }
    }

    if (shippingPolicyProvided) {
      const rawDays = req.body?.shippingPolicy?.weeklyBatchDays;
      if (Array.isArray(rawDays)) {
        const normalizedDays = rawDays
          .map((day) => String(day).trim())
          .filter((day) => ["mon", "tue", "wed", "thu", "fri"].includes(day));
        patch["shippingPolicy.weeklyBatchDays"] = Array.from(
          new Set(normalizedDays),
        );
      }

      if (hasOwnKey(req.body?.shippingPolicy, "defaultShippingMode")) {
        const rawMode = String(
          req.body?.shippingPolicy?.defaultShippingMode || "",
        ).trim();
        patch["shippingPolicy.defaultShippingMode"] =
          rawMode === "express" ? "express" : "normal";
      }

      if (
        hasOwnKey(req.body?.shippingPolicy, "leadTimes") &&
        req.body?.shippingPolicy?.leadTimes
      ) {
        const clampLead = (v, fallback) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) return fallback;
          return Math.floor(n);
        };
        const rawLeadTimes = req.body?.shippingPolicy?.leadTimes || {};
        const nextLeadTimes = {};
        ["d6", "d8", "d10", "d12"].forEach((key) => {
          const entry = rawLeadTimes?.[key] || {};
          const min = clampLead(entry.minBusinessDays, 1);
          const max = clampLead(entry.maxBusinessDays, Math.max(min, 1));
          nextLeadTimes[key] = {
            minBusinessDays: Math.min(min, max),
            maxBusinessDays: Math.max(min, max),
          };
        });
        patch["shippingPolicy.leadTimes"] = nextLeadTimes;
      }

      patch["shippingPolicy.updatedAt"] = new Date();
    }

    if (businessNumber && !attachToBusinessAnchor) {
      const businessNumberNormalized = businessNumber.replace(/\D/g, "").trim();
      const query = {
        businessNumberNormalized,
        ...typeFilter,
      };
      if (businessAnchor?._id) {
        query._id = { $ne: businessAnchor._id };
      }
      const dup = await BusinessAnchor.findOne(query).select({ _id: 1 }).lean();
      if (dup) {
        console.info("[BusinessAnchor] updateMyBusiness conflict", {
          reason: "duplicate_business_number_post_patch",
          userId: String(req.user._id),
          resolvedAnchorId: String(businessAnchor?._id || ""),
          duplicateAnchorId: String(dup?._id || ""),
          businessNumber,
        });
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
        });
      }
    }

    let verificationResult = null;
    // 이미 verified 상태이고 사업자등록번호가 변경되지 않는 경우 홈택스 재검증 스킵
    // (주소·전화번호 등 단순 정보 수정 시 홈택스 API 타임아웃/장애로 저장이 차단되는 문제 방지)
    const skipVerification = isVerifiedBusiness && !isBusinessNumberChanging;
    if (businessNumber && !skipVerification) {
      verificationResult = await verifyBusinessNumber({
        businessNumber,
        companyName: nextName || businessAnchor?.name || "",
        representativeName,
        startDate,
      });
      if (!verificationResult?.verified) {
        return res.status(400).json({
          success: false,
          reason: "business_verification_failed",
          message:
            verificationResult?.message ||
            "사업자등록번호 검증에 실패했습니다. 정보를 다시 확인해주세요.",
        });
      }
    }

    if (!hasBusinessAnchor && attachToBusinessAnchor) {
      const priorLedgerCount = originalBusinessAnchorId
        ? await LedgerLine.countDocuments({
            ownerRole: "requestor",
            ownerId: originalBusinessAnchorId,
            accountCode: {
              $in: [
                "REQ_PAID_CREDIT",
                "REQ_FREE_REQUEST_CREDIT",
                "REQ_FREE_SHIPPING_CREDIT",
              ],
            },
          })
        : 0;
      console.error("[BUSINESS_ANCHOR_ATTACH_SWITCH]", {
        userId: String(req.user._id),
        originalBusinessAnchorId: originalBusinessAnchorId
          ? String(originalBusinessAnchorId)
          : null,
        nextBusinessAnchorId: String(attachToBusinessAnchor._id),
        priorLedgerCount,
      });
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            businessAnchorId: attachToBusinessAnchor._id,
            business: attachToBusinessAnchor.name,
            subRole: "owner",
          },
        },
        { new: true },
      );

      const meId = String(req.user._id);
      const isMember =
        Array.isArray(attachToBusinessAnchor.members) &&
        attachToBusinessAnchor.members.some((m) => String(m) === meId);
      if (
        !isMember &&
        String(attachToBusinessAnchor.primaryContactUserId || "") !== meId
      ) {
        await BusinessAnchor.findByIdAndUpdate(attachToBusinessAnchor._id, {
          $addToSet: { members: req.user._id },
        });
      }

      const attachedAnchorId = attachToBusinessAnchor._id;
      emitReferralMembershipChanged(attachedAnchorId, "business-anchor-linked");

      return res.json({
        success: true,
        data: {
          attached: true,
          businessAnchorId: attachedAnchorId,
          businessName: attachToBusinessAnchor.name,
        },
      });
    }

    if (!hasBusinessAnchor && !attachToBusinessAnchor) {
      const requiredMissing =
        !nextName ||
        !representativeName ||
        !businessTypeField ||
        !businessItem ||
        !address ||
        !email ||
        !phoneNumber ||
        !businessNumber ||
        !startDate;
      if (requiredMissing) {
        return res.status(400).json({
          success: false,
          message: "사업자 정보를 모두 입력해주세요.",
        });
      }

      try {
        const businessNumberNormalized = businessNumber
          .replace(/\D/g, "")
          .trim();
        const verifiedNow = Boolean(verificationResult?.verified);
        const createdProfile =
          nextRequestorProfile && hasRequestorProfile(nextRequestorProfile)
            ? nextRequestorProfile
            : resolveRequestorProfile({
                userKind: freshUser?.requestorKind,
                userServices: freshUser?.requestorServices,
                userCaps: freshUser?.requestorCapabilities,
                userRole: req.user.role,
                businessVerified: verifiedNow,
              });
        const createdKind = hasRequestorProfile(createdProfile)
          ? createdProfile.kind
          : "lab";
        const createdPersist = requestorProfilePersistFields({
          kind: createdKind,
          services: { free: false, paid: true },
        });

        const created = await BusinessAnchor.create({
          businessType,
          businessNumberNormalized,
          name: nextName,
          primaryContactUserId: req.user._id,
          owners: [],
          members: [req.user._id],
          status: verificationResult?.verified ? "verified" : "active",
          ...(businessType === "requestor"
            ? { demoMode: true, demoModeStartedAt: new Date() }
            : {}),
          ...createdPersist,
          ...(businessLicense &&
          (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          metadata: {
            companyName: nextName,
            representativeName,
            businessItem,
            businessType: businessTypeField,
            address,
            addressDetail,
            zipCode:
              normalizedAddressFields?.zipCode != null
                ? normalizedAddressFields.zipCode
                : zipCode,
            email,
            phoneNumber,
            businessNumber,
            startDate,
          },
          referredByAnchorId: freshUser?.referredByAnchorId || null,
          defaultReferralAnchorId: freshUser?.referredByAnchorId || null,
        });

        await User.findByIdAndUpdate(
          req.user._id,
          {
            $set: {
              businessAnchorId: created._id,
              business: created.name,
              subRole: "owner",
              ...createdPersist,
            },
          },
          { new: true },
        );

        const createdAnchorId = created._id;

        const priorLedgerCount = originalBusinessAnchorId
          ? await LedgerLine.countDocuments({
              ownerRole: "requestor",
              ownerId: originalBusinessAnchorId,
              accountCode: {
                $in: [
                  "REQ_PAID_CREDIT",
                  "REQ_FREE_REQUEST_CREDIT",
                  "REQ_FREE_SHIPPING_CREDIT",
                ],
              },
            })
          : 0;
        console.error("[BUSINESS_ANCHOR_CREATED_AND_ATTACHED]", {
          userId: String(req.user._id),
          originalBusinessAnchorId: originalBusinessAnchorId
            ? String(originalBusinessAnchorId)
            : null,
          createdBusinessAnchorId: String(created._id),
          priorLedgerCount,
          businessNumber,
        });

        emitReferralMembershipChanged(
          createdAnchorId,
          "business-anchor-linked",
        );

        // 환영 무료 크레딧: 의뢰자·기공소(lab) BusinessAnchor 신규 생성 시에만 1회 지급
        const welcomeFreeCreditAmount =
          await grantWelcomeFreeCreditIfEligible({
            businessAnchorId: created._id,
            userId: req.user._id,
            userRole: req.user.role,
          });
        const welcomeGranted = !!welcomeFreeCreditAmount;
        const welcomeAmount = Number(welcomeFreeCreditAmount || 0);

        if (businessType === "requestor") {
          try {
            await enableDemoModeAndGrantCreditIfEligible({
              businessAnchorId: created._id,
              userId: req.user._id,
            });
          } catch (e) {
            console.error(
              "[BusinessAnchor] demo mode grant on create failed",
              e,
            );
          }
        }

        const labTradingPartner = await bindLabTradingPartnerFromRequest({
          req,
          businessAnchorId: created._id,
          verified: Boolean(verificationResult?.verified),
        });

        return res.json({
          success: true,
          data: {
            created: true,
            businessAnchorId: created._id,
            businessName: created.name,
            verification:
              created.status === "verified" ? { verified: true } : null,
            welcomeFreeCreditGranted: welcomeGranted,
            welcomeFreeCreditAmount: welcomeAmount,
            // 하위호환 키
            welcomeBonusGranted: welcomeGranted,
            welcomeBonusAmount: welcomeAmount,
            requestFreeCreditGranted: welcomeGranted,
            requestFreeCreditAmount: welcomeAmount,
            freeShippingCreditGranted: false,
            freeShippingCreditAmount: 0,
            labTradingPartnerBound: labTradingPartner.bound,
            labTradingPartnerStatus: labTradingPartner.status,
          },
        });
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          const msg = String(e?.message || "");
          if (msg.includes("businessNumberNormalized")) {
            return res.status(409).json({
              success: false,
              reason: "duplicate_business_number",
              message:
                "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
            });
          }
        }
        throw e;
      }
    }

    if (verificationResult) {
      patch.status = verificationResult.verified ? "verified" : "active";
      if (verificationResult.verified && businessType === "requestor") {
        patch.requestorServices = { free: false, paid: true };
      }
    }

    for (const [k, v] of Object.entries(metadataPatch)) {
      patch[`metadata.${k}`] = v;
    }

    if (
      Object.keys(patch).length === 0 &&
      Object.keys(unsetPatch).length === 0
    ) {
      return res.json({
        success: true,
        data: {
          updated: false,
          businessAnchorId: businessAnchor?._id || null,
        },
      });
    }

    try {
      const update = {};
      if (Object.keys(patch).length > 0) update.$set = patch;
      if (Object.keys(unsetPatch).length > 0) update.$unset = unsetPatch;
      console.info("[BusinessAnchor] updateMyBusiness persist", {
        userId: String(req.user._id),
        businessAnchorId: String(businessAnchor?._id || ""),
        patch,
        metadataPatch,
        unsetPatch,
      });
      // 성능 최적화: findByIdAndUpdate와 findById를 하나로 통합
      const persistedAnchor = await BusinessAnchor.findByIdAndUpdate(
        businessAnchor._id,
        update,
        {
          new: true,
          select: { name: 1, metadata: 1, status: 1, businessLicense: 1 },
          lean: true,
        },
      );
      console.info("[BusinessAnchor] updateMyBusiness persisted result", {
        businessAnchorId: String(
          persistedAnchor?._id || businessAnchor?._id || "",
        ),
        name: String(persistedAnchor?.name || ""),
        metadata: persistedAnchor?.metadata || {},
        businessLicense: persistedAnchor?.businessLicense || null,
        verified: persistedAnchor?.status === "verified",
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const msg = String(e?.message || "");
        if (msg.includes("businessNumberNormalized")) {
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
          });
        }
      }
      throw e;
    }

    // 성능 최적화: 이름이 변경된 경우에만 User.updateMany 실행
    const currentBusinessName = String(req.user.business || "").trim();
    const newBusinessName =
      nextName || String(businessAnchor?.name || "").trim();

    const userSyncPatch = {};
    if (newBusinessName && currentBusinessName !== newBusinessName) {
      userSyncPatch.business = newBusinessName;
    }
    if (patch.requestorKind != null || patch.requestorServices) {
      if (patch.requestorKind != null) {
        userSyncPatch.requestorKind = patch.requestorKind;
      }
      if (patch.requestorServices) {
        userSyncPatch.requestorServices = patch.requestorServices;
      }
    }

    if (Object.keys(userSyncPatch).length > 0) {
      if (userSyncPatch.business) {
        await User.updateMany(
          { businessAnchorId: businessAnchor._id },
          { $set: { business: userSyncPatch.business } },
        );
      }
      if (
        userSyncPatch.requestorKind != null ||
        userSyncPatch.requestorServices
      ) {
        const profileSet = {};
        if (userSyncPatch.requestorKind != null) {
          profileSet.requestorKind = userSyncPatch.requestorKind;
        }
        if (userSyncPatch.requestorServices) {
          profileSet.requestorServices = userSyncPatch.requestorServices;
        }
        await User.findByIdAndUpdate(req.user._id, {
          $set: profileSet,
        });
      }
    }

    // 환영 무료 크레딧: 기공소(lab) synthetic→실BN 검증 승격 시에만 (사업자번호당 1회).
    let welcomeFreeCreditGranted = false;
    let welcomeFreeCreditAmount = 0;
    if (
      wasSyntheticBusinessNumber &&
      verificationResult?.verified &&
      businessNumber &&
      businessAnchor?._id
    ) {
      welcomeFreeCreditAmount =
        (await grantWelcomeFreeCreditIfEligible({
          businessAnchorId: businessAnchor._id,
          userId: req.user._id,
          userRole: req.user.role,
        })) || 0;
      welcomeFreeCreditGranted = !!welcomeFreeCreditAmount;
    }

    // 기공소 기존 거래처 초대: 사업자 저장 시 pending, 검증 완료 시 active
    let labTradingPartnerBound = false;
    let labTradingPartnerStatus = null;
    if (businessAnchor?._id) {
      const labTradingPartner = await bindLabTradingPartnerFromRequest({
        req,
        businessAnchorId: businessAnchor._id,
        verified: Boolean(verificationResult?.verified),
      });
      labTradingPartnerBound = labTradingPartner.bound;
      labTradingPartnerStatus = labTradingPartner.status;
    }

    // 캐시 무효화: 사업자 정보가 업데이트되었으므로 getMyBusiness 캐시 제거
    invalidateMyBusinessCache(req.user._id);

    return res.json({
      success: true,
      data: {
        updated: true,
        welcomeFreeCreditGranted,
        welcomeFreeCreditAmount: Number(welcomeFreeCreditAmount || 0),
        welcomeBonusGranted: welcomeFreeCreditGranted,
        welcomeBonusAmount: Number(welcomeFreeCreditAmount || 0),
        requestFreeCreditGranted: welcomeFreeCreditGranted,
        requestFreeCreditAmount: Number(welcomeFreeCreditAmount || 0),
        freeShippingCreditGranted: false,
        freeShippingCreditAmount: 0,
        labTradingPartnerBound,
        labTradingPartnerStatus,
        verification: verificationResult
          ? {
              verified: !!verificationResult.verified,
              provider: verificationResult.provider || "hometax",
              message: verificationResult.message || "",
              checkedAt: new Date(),
            }
          : undefined,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 정보 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function loadDevopsAutoMatchFees() {
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ payoutRates: 1 })
    .sort({ createdAt: 1 })
    .lean();
  const rates = devops?.payoutRates || {};
  const platformFeeRate = resolvePlatformFeeRate(rates);
  const directPlatformFeeEnabled =
    rates?.directPlatformFeeEnabled === true;
  // 기공소 UI: 설정 요율(취소선·0% 표시용). 실효 요율은 enabled일 때만 청구.
  const directPlatformFeeRate =
    resolveDirectPlatformFeeRateConfigured(rates);
  const monthlyFee = Math.max(0, Number(rates.autoMatchMonthlyFee) || 0);
  return {
    platformFeeRate,
    directPlatformFeeEnabled,
    directPlatformFeeRate,
    autoMatchMonthlyFee: monthlyFee,
  };
}

export async function getMyAutoMatchParticipation(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        role: 1,
      })
      .lean();

    const businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 등록 후 이용할 수 있습니다.",
      });
    }

    const anchor = await BusinessAnchor.findById(businessAnchorId).lean();
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자 정보를 찾을 수 없습니다.",
      });
    }

    const profile = resolveRequestorProfile({
      anchorKind: anchor.requestorKind,
      anchorServices: anchor.requestorServices,
      anchorCaps: anchor.requestorCapabilities,
      userKind: freshUser?.requestorKind,
      userServices: freshUser?.requestorServices,
      userCaps: freshUser?.requestorCapabilities,
      userRole: freshUser?.role || req.user.role,
      businessVerified: String(anchor.status || "").trim() === "verified",
    });

    if (assertAutoMatchParticipationActor({
      profile,
      anchor,
      role: freshUser?.role || req.user.role,
    })) {
      return res.status(403).json({
        success: false,
        message: "자동 매칭 참여는 기공소만 이용할 수 있습니다.",
      });
    }

    const fees = await loadDevopsAutoMatchFees();
    const ratingMap = await loadGlobalLabRatingAggregates({
      labAnchorIds: [businessAnchorId],
    });
    const labRatingSummary = toLabRatingSummaryApi(
      ratingMap.get(String(businessAnchorId)) || null,
    );
    return res.json({
      success: true,
      data: {
        ...autoMatchParticipationResponseFields(anchor),
        ...fees,
        labRatingSummary,
        verified: String(anchor.status || "").trim() === "verified",
        canReceivePracticeTransfer: canJoinAutoMatchParticipation({
          profile,
          anchor,
          role: freshUser?.role || req.user.role,
        }),
      },
    });
  } catch (error) {
    console.error("[getMyAutoMatchParticipation]", error);
    return res.status(500).json({
      success: false,
      message: "자동 매칭 참여 정보를 불러오지 못했습니다.",
    });
  }
}

export async function setMyAutoMatchParticipation(req, res) {
  const wantActive = req.body?.active !== false;
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        role: 1,
      })
      .lean();

    const businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 등록 후 참여할 수 있습니다.",
      });
    }

    const anchor = await BusinessAnchor.findById(businessAnchorId).lean();
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자 정보를 찾을 수 없습니다.",
      });
    }

    const profile = resolveRequestorProfile({
      anchorKind: anchor.requestorKind,
      anchorServices: anchor.requestorServices,
      anchorCaps: anchor.requestorCapabilities,
      userKind: freshUser?.requestorKind,
      userServices: freshUser?.requestorServices,
      userCaps: freshUser?.requestorCapabilities,
      userRole: freshUser?.role || req.user.role,
      businessVerified: String(anchor.status || "").trim() === "verified",
    });

    const actorDenied = assertAutoMatchParticipationActor({
      profile,
      anchor,
      role: freshUser?.role || req.user.role,
    });
    if (actorDenied) {
      return res.status(403).json({
        success: false,
        message: actorDenied,
      });
    }

    if (wantActive !== true) {
      if (!anchor.practiceTransferAutoMatchEnabled) {
        return res.status(400).json({
          success: false,
          message: "참여 중이 아닙니다.",
        });
      }
      const { anchor: next, expiredNow } =
        await applyAutoMatchParticipationCancel(anchor);
      return res.json({
        success: true,
        message: expiredNow
          ? "자동 매칭 참여가 종료되었습니다."
          : "참여 해지가 예약되었습니다. 다음 결제일까지 유지됩니다.",
        data: {
          ...autoMatchParticipationResponseFields(next),
          ...(await loadDevopsAutoMatchFees()),
        },
      });
    }

    if (String(anchor.status || "").trim() !== "verified") {
      return res.status(400).json({
        success: false,
        message: "사업자 검증 후 신청할 수 있습니다.",
      });
    }
    if (
      !canJoinAutoMatchParticipation({
        profile,
        anchor,
        role: freshUser?.role || req.user.role,
      })
    ) {
      return res.status(400).json({
        success: false,
        message: "기공의뢰를 수신할 수 있는 기공소만 신청할 수 있습니다.",
      });
    }

    if (
      anchor.practiceTransferAutoMatchEnabled &&
      !anchor.autoMatchParticipationCancelAtPeriodEnd
    ) {
      return res.json({
        success: true,
        message: "이미 자동 매칭에 참여 중입니다.",
        data: {
          ...autoMatchParticipationResponseFields(anchor),
          ...(await loadDevopsAutoMatchFees()),
        },
      });
    }

    // 인증 전이면 신청만 (풀 ON은 관리자 테스트 통과 후)
    if (!isAbutsLabCertificationCertified(anchor)) {
      const cert = toAbutsLabCertificationApi(anchor);
      if (!canLabApplyAbutsCertification(anchor)) {
        return res.json({
          success: true,
          message:
            cert.status === "testing"
              ? "기공 테스트가 진행 중입니다. 통과 후 인증됩니다."
              : "인증 신청이 접수되어 있습니다. 기공 테스트 후 인증됩니다.",
          data: {
            ...autoMatchParticipationResponseFields(anchor),
            ...(await loadDevopsAutoMatchFees()),
          },
        });
      }
      const { anchor: next } = await applyAbutsLabCertification(anchor);
      return res.json({
        success: true,
        message:
          "어벗츠 인증을 신청했습니다. 기공 테스트 통과 후 인증 기공소로 등록됩니다.",
        data: {
          ...autoMatchParticipationResponseFields(next),
          ...(await loadDevopsAutoMatchFees()),
        },
      });
    }

    const next = await applyAutoMatchParticipationJoin(anchor);
    const resumed = Boolean(anchor.autoMatchParticipationCancelAtPeriodEnd);
    return res.json({
      success: true,
      message: resumed
        ? "참여 해지가 취소되었습니다."
        : "자동 매칭에 참여합니다.",
      data: {
        ...autoMatchParticipationResponseFields(next),
        ...(await loadDevopsAutoMatchFees()),
      },
    });
  } catch (error) {
    console.error("[setMyAutoMatchParticipation]", error);
    return res.status(500).json({
      success: false,
      message: wantActive
        ? "자동 매칭 참여 중 오류가 발생했습니다."
        : "자동 매칭 해지 중 오류가 발생했습니다.",
    });
  }
}
