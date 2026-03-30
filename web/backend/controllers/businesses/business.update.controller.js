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
      .select({ businessAnchorId: 1, business: 1, referredByAnchorId: 1 })
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
      businessAnchor?.metadata?.businessNumber || "",
    );
    const isBusinessNumberChanging =
      businessNumberProvided &&
      Boolean(businessNumber) &&
      currentBusinessNumber !== businessNumber;
    const isVerifiedBusiness = businessAnchor?.status === "verified";

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

    const metadataPatch = {};
    if (nextNameProvided) metadataPatch.companyName = nextName;
    if (representativeNameProvided)
      metadataPatch.representativeName = representativeName;
    if (businessItemProvided) metadataPatch.businessItem = businessItem;
    if (phoneNumberProvided) metadataPatch.phoneNumber = phoneNumber;
    if (businessTypeFieldProvided)
      metadataPatch.businessCategory = businessTypeField;
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
    if (businessNumber) {
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
        ? await CreditLedger.countDocuments({
            businessAnchorId: originalBusinessAnchorId,
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
        const created = await BusinessAnchor.create({
          businessType,
          businessNumberNormalized,
          name: nextName,
          primaryContactUserId: req.user._id,
          owners: [],
          members: [req.user._id],
          status: verificationResult?.verified ? "verified" : "active",
          ...(businessLicense &&
          (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          metadata: {
            companyName: nextName,
            representativeName,
            businessItem,
            businessCategory: businessTypeField,
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
            },
          },
          { new: true },
        );

        const createdAnchorId = created._id;

        const priorLedgerCount = originalBusinessAnchorId
          ? await CreditLedger.countDocuments({
              businessAnchorId: originalBusinessAnchorId,
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

        const welcomeBonusAmount = await grantWelcomeBonusIfEligible({
          businessAnchorId: created._id,
          userId: req.user._id,
          userRole: req.user.role,
        });
        const freeShippingCreditAmount =
          await grantFreeShippingCreditIfEligible({
            businessAnchorId: created._id,
            userId: req.user._id,
            userRole: req.user.role,
          });

        return res.json({
          success: true,
          data: {
            created: true,
            businessAnchorId: created._id,
            businessName: created.name,
            verification:
              created.status === "verified" ? { verified: true } : null,
            welcomeBonusGranted: !!welcomeBonusAmount,
            welcomeBonusAmount: Number(welcomeBonusAmount || 0),
            freeShippingCreditGranted: !!freeShippingCreditAmount,
            freeShippingCreditAmount: Number(freeShippingCreditAmount || 0),
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
      await BusinessAnchor.findByIdAndUpdate(businessAnchor._id, update);
      const persistedAnchor = await BusinessAnchor.findById(businessAnchor._id)
        .select({ name: 1, metadata: 1, status: 1, businessLicense: 1 })
        .lean();
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

    if (nextName && String(req.user.business || "") !== nextName) {
      await User.updateMany(
        { businessAnchorId: businessAnchor._id },
        {
          $set: {
            business: nextName,
          },
        },
      );
    } else {
      await User.updateMany(
        { businessAnchorId: businessAnchor._id },
        {
          $set: {
            business: String(businessAnchor?.name || nextName || "").trim(),
          },
        },
      );
    }

    const granted = await grantWelcomeBonusIfEligible({
      businessAnchorId: businessAnchor._id,
      userId: req.user._id,
      userRole: req.user.role,
    });

    const freeShippingGranted = await grantFreeShippingCreditIfEligible({
      businessAnchorId: businessAnchor._id,
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
