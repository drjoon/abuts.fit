import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import { verifyBusinessNumber } from "../../services/hometax.service.js";
import { assertOrganizationRole, buildOrganizationTypeFilter } from "./organizationRole.util.js";
import {
  normalizeBusinessNumber,
  normalizeBusinessNumberDigits,
  normalizePhoneNumber,
  isValidEmail,
  isValidAddress,
  normalizeStartDate,
  hasOwnKey,
  isDuplicateKeyError,
  formatBusinessNumber,
} from "./org.validation.util.js";
import { normalizeOrganizationAddressFields } from "./org.address.util.js";
import { findOrganizationByAnchors } from "./org.find.util.js";
import {
  grantWelcomeBonusIfEligible,
  grantFreeShippingCreditIfEligible,
  grantSalesmanReferralBonusIfEligible,
} from "./org.bonus.util.js";

export async function updateMyOrganization(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const nextName = String(req.body?.name || "").trim();

    const representativeNameProvided = hasOwnKey(req.body, "representativeName");
    const businessItemProvided = hasOwnKey(req.body, "businessItem");
    const phoneNumberProvided = hasOwnKey(req.body, "phoneNumber");
    const businessNumberProvided = hasOwnKey(req.body, "businessNumber");
    const businessTypeProvided = hasOwnKey(req.body, "businessType");
    const emailProvided = hasOwnKey(req.body, "email");
    const addressProvided = hasOwnKey(req.body, "address");
    const addressDetailProvided = hasOwnKey(req.body, "addressDetail");
    const zipCodeProvided = hasOwnKey(req.body, "zipCode");
    const startDateProvided = hasOwnKey(req.body, "startDate");
    const shippingPolicyProvided = hasOwnKey(req.body, "shippingPolicy");

    const freshUser = await User.findById(req.user._id)
      .select({
        businessId: 1,
        business: 1,
        organizationId: 1,
        organization: 1,
      })
      .lean();
    const effectiveBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId ||
      null;
    const effectiveBusinessName = String(
      freshUser?.business ||
        req.user.business ||
        freshUser?.organization ||
        req.user.organization ||
        "",
    ).trim();
    const nextNameProvided = hasOwnKey(req.body, "name");
    let org = await findOrganizationByAnchors({
      organizationType,
      businessId: effectiveBusinessId,
      businessNumber: req.body?.businessNumber,
      userId: req.user._id,
      businessName: effectiveBusinessName,
    });
    const hasOrganization = Boolean(org?._id || effectiveBusinessId);
    console.info("[Organization] updateMyOrganization anchors", {
      userId: String(req.user._id),
      organizationType,
      tokenBusinessId: String(req.user.businessId || ""),
      freshBusinessId: String(freshUser?.businessId || ""),
      tokenOrganizationId: String(req.user.organizationId || ""),
      effectiveBusinessId: String(effectiveBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      tokenOrganizationName: String(req.user.organization || ""),
      effectiveBusinessName,
      resolvedBusinessId: String(org?._id || ""),
      resolvedBusinessName: String(org?.name || ""),
      payloadBusinessNumber: String(req.body?.businessNumber || ""),
      payloadName: String(req.body?.name || ""),
    });
    if (hasOrganization) {
      const meId = String(req.user._id);
      const canEdit =
        org &&
        (String(org.owner) === meId ||
          (Array.isArray(org.owners) && org.owners.some((c) => String(c) === meId)));
      const nonShippingProvided =
        hasOwnKey(req.body, "name") ||
        representativeNameProvided ||
        businessItemProvided ||
        phoneNumberProvided ||
        businessNumberProvided ||
        businessTypeProvided ||
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

    const representativeName = String(req.body?.representativeName || "").trim();
    const businessItem = String(req.body?.businessItem || "").trim();
    const phoneNumberRaw = String(req.body?.phoneNumber || "").trim();
    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    const businessType = String(req.body?.businessType || "").trim();
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

    const phoneNumber = phoneNumberRaw ? normalizePhoneNumber(phoneNumberRaw) : "";
    const businessNumber = businessNumberRaw ? normalizeBusinessNumber(businessNumberRaw) : "";
    const currentBusinessNumber = formatBusinessNumber(org?.extracted?.businessNumber || "");
    const isBusinessNumberChanging =
      businessNumberProvided && Boolean(businessNumber) && currentBusinessNumber !== businessNumber;
    const isVerifiedOrganization = Boolean(org?.verification?.verified);

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

    if (isVerifiedOrganization && isBusinessNumberChanging) {
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
        ? await normalizeOrganizationAddressFields({ address, zipCode })
        : null;

    const originalBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId ||
      null;
    let attachToOrg = null;
    if (businessNumber && isBusinessNumberChanging) {
      const existingOrgByBusinessNumber = await RequestorOrganization.findOne({
        ...orgTypeFilter,
        "extracted.businessNumber": businessNumber,
      });
      const meId = String(req.user._id);

      if (existingOrgByBusinessNumber) {
        const existingOwnerId = String(existingOrgByBusinessNumber.owner || "");
        const existingIsOwner =
          Array.isArray(existingOrgByBusinessNumber.owners) &&
          existingOrgByBusinessNumber.owners.some((c) => String(c) === meId);
        const existingIsMember =
          Array.isArray(existingOrgByBusinessNumber.members) &&
          existingOrgByBusinessNumber.members.some((m) => String(m) === meId);
        const isMyExistingOrg =
          existingOwnerId === meId || existingIsOwner || existingIsMember;

        if (isMyExistingOrg) {
          console.info(
            "[Organization] updateMyOrganization same-business own org",
            {
              userId: meId,
              currentResolvedOrgId: String(org?._id || ""),
              existingOrgByBusinessNumberId: String(
                existingOrgByBusinessNumber?._id || "",
              ),
              businessNumber,
            },
          );
          attachToOrg = existingOrgByBusinessNumber;
          org = existingOrgByBusinessNumber;
        }
      }

      if (
        existingOrgByBusinessNumber &&
        !attachToOrg &&
        (!org || String(existingOrgByBusinessNumber._id) !== String(org._id))
      ) {
        if (hasOrganization) {
          console.info("[Organization] updateMyOrganization conflict", {
            reason: "business_number_switch_requires_admin",
            userId: String(req.user._id),
            resolvedOrganizationId: String(org?._id || ""),
            existingOrgByBusinessNumberId: String(
              existingOrgByBusinessNumber?._id || "",
            ),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "business_number_switch_requires_admin",
            message:
              "기존 조직에 연결된 상태에서는 사업자등록번호로 다른 조직으로 전환할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
          });
        }
        const ownerId = String(existingOrgByBusinessNumber.owner || "");
        const isOwner =
          Array.isArray(existingOrgByBusinessNumber.owners) &&
          existingOrgByBusinessNumber.owners.some((c) => String(c) === meId);
        const isMember =
          Array.isArray(existingOrgByBusinessNumber.members) &&
          existingOrgByBusinessNumber.members.some((m) => String(m) === meId);

        if (ownerId === meId || isOwner || isMember) {
          console.info("[Organization] updateMyOrganization attachToOrg", {
            userId: String(req.user._id),
            attachToOrgId: String(existingOrgByBusinessNumber?._id || ""),
            businessNumber,
          });
          attachToOrg = existingOrgByBusinessNumber;
          org = existingOrgByBusinessNumber;
        } else {
          console.info("[Organization] updateMyOrganization conflict", {
            reason: "duplicate_business_number",
            userId: String(req.user._id),
            resolvedOrganizationId: String(org?._id || ""),
            existingOrgByBusinessNumberId: String(
              existingOrgByBusinessNumber?._id || "",
            ),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 조직에 가입 요청을 진행해주세요.",
          });
        }
      }
    }

    const patch = {};
    const unsetPatch = {};
    if (nextNameProvided && nextName) patch.name = nextName;

    if (businessLicense && (businessLicense.s3Key || businessLicense.originalName)) {
      patch.businessLicense = businessLicense;
    }

    const extractedPatch = {};
    if (nextNameProvided) extractedPatch.companyName = nextName;
    if (representativeNameProvided) extractedPatch.representativeName = representativeName;
    if (businessItemProvided) extractedPatch.businessItem = businessItem;
    if (phoneNumberProvided) extractedPatch.phoneNumber = phoneNumber;
    if (businessTypeProvided) extractedPatch.businessType = businessType;
    if (emailProvided) extractedPatch.email = email;
    if (addressProvided)
      extractedPatch.address =
        normalizedAddressFields?.address != null ? normalizedAddressFields.address : address;
    if (addressDetailProvided) extractedPatch.addressDetail = addressDetail;
    if (zipCodeProvided)
      extractedPatch.zipCode =
        normalizedAddressFields?.zipCode != null ? normalizedAddressFields.zipCode : zipCode;
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
        patch["shippingPolicy.weeklyBatchDays"] = Array.from(new Set(normalizedDays));
      }

      if (hasOwnKey(req.body?.shippingPolicy, "leadTimes") && req.body?.shippingPolicy?.leadTimes) {
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

    if (businessNumber && !attachToOrg) {
      const query = {
        "extracted.businessNumber": businessNumber,
        ...orgTypeFilter,
      };
      if (org?._id) {
        query._id = { $ne: org._id };
      }
      const dup = await RequestorOrganization.findOne(query)
        .select({ _id: 1 })
        .lean();
      if (dup) {
        console.info("[Organization] updateMyOrganization conflict", {
          reason: "duplicate_business_number_post_patch",
          userId: String(req.user._id),
          resolvedOrganizationId: String(org?._id || ""),
          duplicateOrganizationId: String(dup?._id || ""),
          businessNumber,
        });
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message: "이미 등록된 사업자등록번호입니다. 기존 기공소에 가입 요청을 진행해주세요.",
        });
      }
    }

    let verificationResult = null;
    if (businessNumber) {
      verificationResult = await verifyBusinessNumber({
        businessNumber,
        companyName: nextName || org?.name || "",
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

    if (!hasOrganization && attachToOrg) {
      const priorLedgerCount = originalBusinessId
        ? await CreditLedger.countDocuments({ businessId: originalBusinessId })
        : 0;
      console.error("[ORGANIZATION_ATTACH_SWITCH]", {
        userId: String(req.user._id),
        originalBusinessId: originalBusinessId ? String(originalBusinessId) : null,
        nextBusinessId: String(attachToOrg._id),
        priorLedgerCount,
      });
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            businessId: attachToOrg._id,
            business: attachToOrg.name,
            organizationId: attachToOrg._id,
            organization: attachToOrg.name,
          },
        },
        { new: true },
      );

      const meId = String(req.user._id);
      const isMember =
        Array.isArray(attachToOrg.members) &&
        attachToOrg.members.some((m) => String(m) === meId);
      if (!isMember && String(attachToOrg.owner || "") !== meId) {
        await RequestorOrganization.findByIdAndUpdate(attachToOrg._id, {
          $addToSet: { members: req.user._id },
        });
      }

      return res.json({
        success: true,
        data: {
          attached: true,
          organizationId: attachToOrg._id,
          organizationName: attachToOrg.name,
        },
      });
    }

    if (!hasOrganization && !attachToOrg) {
      const requiredMissing =
        !nextName ||
        !representativeName ||
        !businessType ||
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
        const created = await RequestorOrganization.create({
          organizationType,
          name: nextName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          ...(businessLicense && (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          extracted: {
            companyName: nextName,
            representativeName,
            businessItem,
            businessType,
            address,
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
              organizationId: created._id,
              organization: created.name,
            },
          },
          { new: true },
        );

        const priorLedgerCount = originalBusinessId
          ? await CreditLedger.countDocuments({
              businessId: originalBusinessId,
            })
          : 0;
        console.error("[ORGANIZATION_CREATED_AND_ATTACHED]", {
          userId: String(req.user._id),
          originalBusinessId: originalBusinessId ? String(originalBusinessId) : null,
          createdBusinessId: String(created._id),
          priorLedgerCount,
          businessNumber,
        });

        const welcomeBonusAmount = await grantWelcomeBonusIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });
        const freeShippingCreditAmount = await grantFreeShippingCreditIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });
        await grantSalesmanReferralBonusIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });

        return res.json({
          success: true,
          data: {
            created: true,
            organizationId: created._id,
            organizationName: created.name,
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
              message: "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
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

    if (Object.keys(patch).length === 0 && Object.keys(unsetPatch).length === 0) {
      return res.json({ success: true, data: { updated: false } });
    }

    try {
      const update = {};
      if (Object.keys(patch).length > 0) update.$set = patch;
      if (Object.keys(unsetPatch).length > 0) update.$unset = unsetPatch;
      console.info("[Organization] updateMyOrganization persist", {
        userId: String(req.user._id),
        organizationId: String(org?._id || ""),
        patch,
        extractedPatch,
        unsetPatch,
      });
      await RequestorOrganization.findByIdAndUpdate(org._id, update);
      const persistedOrg = await RequestorOrganization.findById(org._id)
        .select({ name: 1, extracted: 1, verification: 1 })
        .lean();
      console.info("[Organization] updateMyOrganization persisted result", {
        organizationId: String(persistedOrg?._id || org?._id || ""),
        name: String(persistedOrg?.name || ""),
        extracted: {
          companyName: String(persistedOrg?.extracted?.companyName || "").trim(),
          businessNumber: String(persistedOrg?.extracted?.businessNumber || "").trim(),
          address: String(persistedOrg?.extracted?.address || "").trim(),
          addressDetail: String(persistedOrg?.extracted?.addressDetail || "").trim(),
          zipCode: String(persistedOrg?.extracted?.zipCode || "").trim(),
          phoneNumber: String(persistedOrg?.extracted?.phoneNumber || "").trim(),
          email: String(persistedOrg?.extracted?.email || "").trim(),
          representativeName: String(
            persistedOrg?.extracted?.representativeName || "",
          ).trim(),
          businessType: String(persistedOrg?.extracted?.businessType || "").trim(),
          businessItem: String(persistedOrg?.extracted?.businessItem || "").trim(),
          startDate: String(persistedOrg?.extracted?.startDate || "").trim(),
        },
        businessVerified: Boolean(persistedOrg?.verification?.verified),
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const msg = String(e?.message || "");
        if (msg.includes("extracted.businessNumber")) {
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message: "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
          });
        }
      }
      throw e;
    }

    if (
      nextName &&
      String(req.user.business || req.user.organization || "") !== nextName
    ) {
      await User.updateMany(
        { $or: [{ businessId: org._id }, { organizationId: org._id }] },
        {
          $set: {
            business: nextName,
            organization: nextName,
          },
        },
      );
    } else {
      await User.updateMany(
        { $or: [{ businessId: org._id }, { organizationId: org._id }] },
        {
          $set: {
            businessId: org._id,
            business: String(org?.name || nextName || "").trim(),
            organizationId: org._id,
            organization: String(org?.name || nextName || "").trim(),
          },
        },
      );
    }

    const granted = await grantWelcomeBonusIfEligible({
      organizationId: org._id,
      userId: req.user._id,
    });

    const freeShippingGranted = await grantFreeShippingCreditIfEligible({
      organizationId: org._id,
      userId: req.user._id,
    });

    const salesmanGranted = await grantSalesmanReferralBonusIfEligible({
      organizationId: org._id,
      userId: req.user._id,
    });

    return res.json({
      success: true,
      data: {
        updated: true,
        welcomeBonusGranted: Boolean(granted),
        welcomeBonusAmount: granted || 0,
        freeShippingCreditGranted: Boolean(freeShippingGranted),
        freeShippingCreditAmount: freeShippingGranted || 0,
        salesmanReferralBonusGranted: Boolean(salesmanGranted),
        salesmanReferralBonusAmount: salesmanGranted || 0,
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
