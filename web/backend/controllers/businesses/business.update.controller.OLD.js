import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
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
import {
  grantWelcomeBonusIfEligible,
  grantFreeShippingCreditIfEligible,
} from "./business.bonus.util.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";

// BusinessAnchor를 직접 생성/업데이트하는 헬퍼 함수
// 레거시 Business 모델 동기화 로직 제거됨
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

  const existingAnchor = await BusinessAnchor.findOne({
    businessNumberNormalized,
  })
    .select({ _id: 1, referredByAnchorId: 1 })
    .lean();

  const anchor = await BusinessAnchor.findOneAndUpdate(
    { businessNumberNormalized },
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
        "metadata.businessCategory": String(
          metadata.businessCategory || "",
        ).trim(),
        "metadata.startDate": String(metadata.startDate || "").trim(),
        "metadata.businessNumber": String(metadata.businessNumber || "").trim(),
      },
      $setOnInsert: {
        referredByAnchorId: referredByAnchorId || null,
        defaultReferralAnchorId: referredByAnchorId || null,
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
      { $set: { businessAnchorId: anchorId, business: name } },
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

    const freshUser = await User.findById(req.user._id)
      .select({ businessId: 1, business: 1, referredByAnchorId: 1 })
      .lean();
    const effectiveBusinessId =
      freshUser?.businessId || req.user.businessId || null;
    const effectiveBusinessName = String(
      freshUser?.business || req.user.business || "",
    ).trim();

    const nextNameProvided = hasOwnKey(req.body, "name");
    let business = await findBusinessByAnchors({
      businessType,
      businessId: effectiveBusinessId,
      businessNumber: req.body?.businessNumber,
      userId: req.user._id,
      businessName: effectiveBusinessName,
    });

    const hasBusiness = Boolean(business?._id || effectiveBusinessId);
    console.info("[Business] updateMyBusiness anchors", {
      userId: String(req.user._id),
      businessType,
      tokenBusinessId: String(req.user.businessId || ""),
      freshBusinessId: String(freshUser?.businessId || ""),
      effectiveBusinessId: String(effectiveBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      effectiveBusinessName,
      resolvedBusinessId: String(business?._id || ""),
      resolvedBusinessName: String(business?.name || ""),
      payloadBusinessNumber: String(req.body?.businessNumber || ""),
      payloadName: String(req.body?.name || ""),
    });

    if (hasBusiness) {
      const meId = String(req.user._id);
      const canEdit =
        business &&
        (String(business.owner) === meId ||
          (Array.isArray(business.owners) &&
            business.owners.some((c) => String(c) === meId)));
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
        hasOwnKey(req.body, "businessLicense");
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

    const businessLicenseInput = req.body?.businessLicense || null;
    const businessLicense = businessLicenseInput
      ? {
          fileId: businessLicenseInput?.fileId || null,
          s3Key: String(businessLicenseInput?.s3Key || "").trim(),
          originalName: String(businessLicenseInput?.originalName || "").trim(),
          uploadedAt: new Date(),
        }
      : null;

    const phoneNumber = phoneNumberRaw
      ? normalizePhoneNumber(phoneNumberRaw)
      : "";
    const businessNumber = businessNumberRaw
      ? normalizeBusinessNumber(businessNumberRaw)
      : "";
    const currentBusinessNumber = formatBusinessNumber(
      business?.extracted?.businessNumber || "",
    );
    const isBusinessNumberChanging =
      businessNumberProvided &&
      Boolean(businessNumber) &&
      currentBusinessNumber !== businessNumber;
    const isVerifiedBusiness = Boolean(business?.verification?.verified);

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

    if (isVerifiedBusiness && isBusinessNumberChanging) {
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

    const originalBusinessId =
      freshUser?.businessId || req.user.businessId || null;
    let attachToBusiness = null;
    if (businessNumber && isBusinessNumberChanging) {
      const existingBusinessByNumber = await Business.findOne({
        ...typeFilter,
        "extracted.businessNumber": businessNumber,
      });
      const meId = String(req.user._id);

      if (existingBusinessByNumber) {
        const existingOwnerId = String(existingBusinessByNumber.owner || "");
        const existingIsOwner =
          Array.isArray(existingBusinessByNumber.owners) &&
          existingBusinessByNumber.owners.some((c) => String(c) === meId);
        const existingIsMember =
          Array.isArray(existingBusinessByNumber.members) &&
          existingBusinessByNumber.members.some((m) => String(m) === meId);
        const isMyExistingBusiness =
          existingOwnerId === meId || existingIsOwner || existingIsMember;

        if (isMyExistingBusiness) {
          console.info(
            "[Business] updateMyBusiness same-business own business",
            {
              userId: meId,
              currentResolvedBusinessId: String(business?._id || ""),
              existingBusinessByNumberId: String(
                existingBusinessByNumber?._id || "",
              ),
              businessNumber,
            },
          );
          attachToBusiness = existingBusinessByNumber;
          business = existingBusinessByNumber;
        }
      }

      if (
        existingBusinessByNumber &&
        !attachToBusiness &&
        (!business ||
          String(existingBusinessByNumber._id) !== String(business._id))
      ) {
        if (hasBusiness) {
          console.info("[Business] updateMyBusiness conflict", {
            reason: "business_number_switch_requires_admin",
            userId: String(req.user._id),
            resolvedBusinessId: String(business?._id || ""),
            existingBusinessByNumberId: String(
              existingBusinessByNumber?._id || "",
            ),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "business_number_switch_requires_admin",
            message:
              "기존 사업자에 연결된 상태에서는 사업자등록번호로 다른 사업자로 전환할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
          });
        }
        const ownerId = String(existingBusinessByNumber.owner || "");
        const isOwner =
          Array.isArray(existingBusinessByNumber.owners) &&
          existingBusinessByNumber.owners.some((c) => String(c) === meId);
        const isMember =
          Array.isArray(existingBusinessByNumber.members) &&
          existingBusinessByNumber.members.some((m) => String(m) === meId);

        if (ownerId === meId || isOwner || isMember) {
          console.info("[Business] updateMyBusiness attachToBusiness", {
            userId: String(req.user._id),
            attachToBusinessId: String(existingBusinessByNumber?._id || ""),
            businessNumber,
          });
          attachToBusiness = existingBusinessByNumber;
          business = existingBusinessByNumber;
        } else {
          console.info("[Business] updateMyBusiness conflict", {
            reason: "duplicate_business_number",
            userId: String(req.user._id),
            resolvedBusinessId: String(business?._id || ""),
            existingBusinessByNumberId: String(
              existingBusinessByNumber?._id || "",
            ),
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

    const extractedPatch = {};
    if (nextNameProvided) extractedPatch.companyName = nextName;
    if (representativeNameProvided)
      extractedPatch.representativeName = representativeName;
    if (businessItemProvided) extractedPatch.businessItem = businessItem;
    if (phoneNumberProvided) extractedPatch.phoneNumber = phoneNumber;
    if (businessTypeFieldProvided)
      extractedPatch.businessType = businessTypeField;
    if (emailProvided) extractedPatch.email = email;
    if (addressProvided)
      extractedPatch.address =
        normalizedAddressFields?.address != null
          ? normalizedAddressFields.address
          : address;
    if (addressDetailProvided) extractedPatch.addressDetail = addressDetail;
    if (zipCodeProvided)
      extractedPatch.zipCode =
        normalizedAddressFields?.zipCode != null
          ? normalizedAddressFields.zipCode
          : zipCode;
    if (startDateProvided) extractedPatch.startDate = startDate;

    if (businessNumberProvided) {
      if (!businessNumber) {
        unsetPatch["extracted.businessNumber"] = 1;
      } else {
        extractedPatch.businessNumber = businessNumber;
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

    if (businessNumber && !attachToBusiness) {
      const query = {
        "extracted.businessNumber": businessNumber,
        ...typeFilter,
      };
      if (business?._id) {
        query._id = { $ne: business._id };
      }
      const dup = await Business.findOne(query).select({ _id: 1 }).lean();
      if (dup) {
        console.info("[Business] updateMyBusiness conflict", {
          reason: "duplicate_business_number_post_patch",
          userId: String(req.user._id),
          resolvedBusinessId: String(business?._id || ""),
          duplicateBusinessId: String(dup?._id || ""),
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
    if (businessNumber) {
      verificationResult = await verifyBusinessNumber({
        businessNumber,
        companyName: nextName || business?.name || "",
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

    if (!hasBusiness && attachToBusiness) {
      const priorLedgerCount = originalBusinessId
        ? await CreditLedger.countDocuments({ businessId: originalBusinessId })
        : 0;
      console.error("[BUSINESS_ATTACH_SWITCH]", {
        userId: String(req.user._id),
        originalBusinessId: originalBusinessId
          ? String(originalBusinessId)
          : null,
        nextBusinessId: String(attachToBusiness._id),
        priorLedgerCount,
      });
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            businessId: attachToBusiness._id,
            business: attachToBusiness.name,
          },
        },
        { new: true },
      );

      const meId = String(req.user._id);
      const isMember =
        Array.isArray(attachToBusiness.members) &&
        attachToBusiness.members.some((m) => String(m) === meId);
      if (!isMember && String(attachToBusiness.owner || "") !== meId) {
        await Business.findByIdAndUpdate(attachToBusiness._id, {
          $addToSet: { members: req.user._id },
        });
      }

      const attachedAnchorId = await ensureBusinessAnchorForBusiness({
        business: attachToBusiness,
        businessType,
        userId: req.user._id,
        referredByAnchorId: freshUser?.referredByAnchorId || null,
      });

      return res.json({
        success: true,
        data: {
          attached: true,
          businessId: attachToBusiness._id,
          businessAnchorId: attachedAnchorId,
          businessName: attachToBusiness.name,
        },
      });
    }

    if (!hasBusiness && !attachToBusiness) {
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
        const created = await Business.create({
          businessType,
          name: nextName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          ...(businessLicense &&
          (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          extracted: {
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
          verification: verificationResult
            ? {
                verified: !!verificationResult.verified,
                provider: verificationResult.provider || "hometax",
                message: verificationResult.message || "",
                checkedAt: new Date(),
              }
            : undefined,
        });

        await User.findByIdAndUpdate(
          req.user._id,
          {
            $set: {
              businessId: created._id,
              business: created.name,
            },
          },
          { new: true },
        );

        const createdAnchorId = await ensureBusinessAnchorForBusiness({
          business: created,
          businessType,
          userId: req.user._id,
          referredByAnchorId: freshUser?.referredByAnchorId || null,
        });

        const priorLedgerCount = originalBusinessId
          ? await CreditLedger.countDocuments({
              businessId: originalBusinessId,
            })
          : 0;
        console.error("[BUSINESS_CREATED_AND_ATTACHED]", {
          userId: String(req.user._id),
          originalBusinessId: originalBusinessId
            ? String(originalBusinessId)
            : null,
          createdBusinessId: String(created._id),
          priorLedgerCount,
          businessNumber,
        });

        const welcomeBonusAmount = await grantWelcomeBonusIfEligible({
          businessId: created._id,
          userId: req.user._id,
          userRole: req.user.role,
        });
        const freeShippingCreditAmount =
          await grantFreeShippingCreditIfEligible({
            businessId: created._id,
            userId: req.user._id,
            userRole: req.user.role,
          });

        return res.json({
          success: true,
          data: {
            created: true,
            businessId: created._id,
            businessAnchorId: createdAnchorId,
            businessName: created.name,
            verification: created.verification || null,
            welcomeBonusGranted: !!welcomeBonusAmount,
            welcomeBonusAmount: Number(welcomeBonusAmount || 0),
            freeShippingCreditGranted: !!freeShippingCreditAmount,
            freeShippingCreditAmount: Number(freeShippingCreditAmount || 0),
          },
        });
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          const msg = String(e?.message || "");
          if (msg.includes("extracted.businessNumber")) {
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
      patch.verification = {
        verified: !!verificationResult.verified,
        provider: verificationResult.provider || "hometax",
        message: verificationResult.message || "",
        checkedAt: new Date(),
      };
    }

    for (const [k, v] of Object.entries(extractedPatch)) {
      patch[`extracted.${k}`] = v;
    }

    if (
      Object.keys(patch).length === 0 &&
      Object.keys(unsetPatch).length === 0
    ) {
      const repairedAnchorId = await ensureBusinessAnchorForBusiness({
        business: {
          _id: business?._id,
          name: business?.name || "",
          extracted: business?.extracted || {},
          verification: business?.verification || {},
        },
        businessType,
        userId: req.user._id,
        referredByAnchorId: freshUser?.referredByAnchorId || null,
      });

      return res.json({
        success: true,
        data: {
          updated: false,
          businessAnchorId:
            repairedAnchorId || business?.businessAnchorId || null,
        },
      });
    }

    try {
      const update = {};
      if (Object.keys(patch).length > 0) update.$set = patch;
      if (Object.keys(unsetPatch).length > 0) update.$unset = unsetPatch;
      console.info("[Business] updateMyBusiness persist", {
        userId: String(req.user._id),
        businessId: String(business?._id || ""),
        patch,
        extractedPatch,
        unsetPatch,
      });
      await Business.findByIdAndUpdate(business._id, update);
      const persistedBusiness = await Business.findById(business._id)
        .select({ name: 1, extracted: 1, verification: 1, businessAnchorId: 1 })
        .lean();
      console.info("[Business] updateMyBusiness persisted result", {
        businessId: String(persistedBusiness?._id || business?._id || ""),
        name: String(persistedBusiness?.name || ""),
        extracted: {
          companyName: String(
            persistedBusiness?.extracted?.companyName || "",
          ).trim(),
          businessNumber: String(
            persistedBusiness?.extracted?.businessNumber || "",
          ).trim(),
          address: String(persistedBusiness?.extracted?.address || "").trim(),
          addressDetail: String(
            persistedBusiness?.extracted?.addressDetail || "",
          ).trim(),
          zipCode: String(persistedBusiness?.extracted?.zipCode || "").trim(),
          phoneNumber: String(
            persistedBusiness?.extracted?.phoneNumber || "",
          ).trim(),
          email: String(persistedBusiness?.extracted?.email || "").trim(),
          representativeName: String(
            persistedBusiness?.extracted?.representativeName || "",
          ).trim(),
          businessType: String(
            persistedBusiness?.extracted?.businessType || "",
          ).trim(),
          businessItem: String(
            persistedBusiness?.extracted?.businessItem || "",
          ).trim(),
          startDate: String(
            persistedBusiness?.extracted?.startDate || "",
          ).trim(),
        },
        businessVerified: Boolean(persistedBusiness?.verification?.verified),
      });

      await ensureBusinessAnchorForBusiness({
        business: {
          _id: business._id,
          name: persistedBusiness?.name || business?.name || "",
          extracted: persistedBusiness?.extracted || business?.extracted || {},
          verification:
            persistedBusiness?.verification || business?.verification || {},
        },
        businessType,
        userId: req.user._id,
        referredByAnchorId: freshUser?.referredByAnchorId || null,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const msg = String(e?.message || "");
        if (msg.includes("extracted.businessNumber")) {
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

    if (nextName && String(req.user.business || "") !== nextName) {
      await User.updateMany(
        { businessId: business._id },
        {
          $set: {
            business: nextName,
          },
        },
      );
    } else {
      await User.updateMany(
        { businessId: business._id },
        {
          $set: {
            businessId: business._id,
            business: String(business?.name || nextName || "").trim(),
          },
        },
      );
    }

    const granted = await grantWelcomeBonusIfEligible({
      businessId: business._id,
      userId: req.user._id,
      userRole: req.user.role,
    });

    const freeShippingGranted = await grantFreeShippingCreditIfEligible({
      businessId: business._id,
      userId: req.user._id,
      userRole: req.user.role,
    });

    return res.json({
      success: true,
      data: {
        updated: true,
        welcomeBonusGranted: Boolean(granted),
        welcomeBonusAmount: granted || 0,
        freeShippingCreditGranted: Boolean(freeShippingGranted),
        freeShippingCreditAmount: freeShippingGranted || 0,
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
