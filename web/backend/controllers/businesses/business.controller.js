import Business from "../../models/business.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import {
  BUSINESS_ALLOWED_ROLE_SET,
  resolveBusinessType,
  assertBusinessRole,
  buildBusinessTypeFilter,
} from "./businessRole.util.js";
import {
  lookupPostalCodeByAddress,
  normalizeBusinessAddressFields,
} from "./business.address.util.js";
import { findBusinessByAnchors } from "./business.find.util.js";
import { updateMyBusiness } from "./business.update.controller.js";
export { updateMyBusiness };

export async function checkBusinessNumberDuplicate(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    if (!businessNumberRaw) {
      return res.status(400).json({
        success: false,
        message: "businessNumber가 필요합니다.",
      });
    }

    const normalizeBusinessNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 10) return "";
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    };

    const businessNumber = normalizeBusinessNumber(businessNumberRaw);
    if (!businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select({ businessId: 1, business: 1 })
      .lean();
    const effectiveBusinessId =
      freshUser?.businessId || req.user.businessId || null;

    const existingBusiness = await Business.findOne({
      ...typeFilter,
      "extracted.businessNumber": businessNumber,
      ...(effectiveBusinessId ? { _id: { $ne: effectiveBusinessId } } : {}),
    })
      .select({ _id: 1, owner: 1 })
      .lean();

    if (existingBusiness) {
      const meId = String(req.user._id);
      const existingOwnerId = String(existingBusiness.owner || "");

      if (existingOwnerId !== meId) {
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        duplicate: false,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "사업자등록번호 중복 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function lookupPostalCode(req, res) {
  try {
    const address = String(
      req.body?.address || req.query?.address || "",
    ).trim();

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "address가 필요합니다.",
      });
    }

    const data = await lookupPostalCodeByAddress(address);
    return res.status(200).json({
      success: true,
      data: {
        address,
        zipCode: data.postalCode,
        formattedAddress: data.formattedAddress,
        matchedAddress: data.matchedAddress,
        provider: data.provider,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "주소 우편번호 조회 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

export async function updateBusinessShippingAddress(req, res) {
  try {
    const actorRole = String(req.user?.role || "").trim();
    if (!["manufacturer", "admin"].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const businessId = String(req.body?.businessId || "").trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessId가 필요합니다.",
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "address가 필요합니다.",
      });
    }

    if (!addressDetail) {
      return res.status(400).json({
        success: false,
        message: "addressDetail이 필요합니다.",
      });
    }

    const normalizedAddressFields = await normalizeBusinessAddressFields({
      address,
      zipCode,
    });

    const business = await Business.findOne({
      _id: businessId,
      ...buildBusinessTypeFilter("requestor"),
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "의뢰인 사업자를 찾을 수 없습니다.",
      });
    }

    const nextExtracted = {
      ...(business.extracted
        ? business.extracted.toObject?.() || business.extracted
        : {}),
      address: normalizedAddressFields?.address || address,
      addressDetail,
      zipCode: normalizedAddressFields?.zipCode || zipCode,
    };

    await Business.findByIdAndUpdate(business._id, {
      $set: {
        extracted: nextExtracted,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        businessId: String(business._id),
        address: nextExtracted.address || "",
        addressDetail: nextExtracted.addressDetail || "",
        zipCode: nextExtracted.zipCode || "",
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "의뢰인 배송지 수정 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

export async function getMyBusiness(req, res) {
  try {
    res.set("x-abuts-handler", "business.getMyBusiness");
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    let businessName = String(req.user.business || "").trim();
    const freshUser = await User.findById(req.user._id)
      .select({ businessId: 1, business: 1 })
      .lean();
    const freshBusinessId = freshUser?.businessId || req.user.businessId;
    const freshBusinessName = String(
      freshUser?.business || req.user.business || "",
    ).trim();

    let business = await findBusinessByAnchors({
      businessType,
      businessId: freshBusinessId,
      businessNumber: "",
      userId: req.user._id,
      businessName: freshBusinessName || businessName,
    });

    console.info("[Business] getMyBusiness anchors", {
      userId: String(req.user._id),
      businessType,
      tokenBusinessId: String(req.user.businessId || ""),
      freshBusinessId: String(freshBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      freshBusinessName,
      resolvedBusinessId: String(business?._id || ""),
      resolvedBusinessName: String(business?.name || ""),
    });

    if (
      !business &&
      businessName &&
      String(req.user.referralCode || "").startsWith("mock_")
    ) {
      try {
        business = await Business.create({
          businessType,
          name: businessName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          joinRequests: [],
        });
        await User.findByIdAndUpdate(req.user._id, {
          $set: {
            businessId: business._id,
            business: business.name,
          },
        });
      } catch (error) {
        return res.status(403).json({
          success: false,
          message: "내 사업자 생성 중 오류가 발생했습니다.",
          error: error.message,
        });
      }
    }

    if (!business) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          business: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: {},
        },
      });
    }

    const ownerId = String(business.owner);
    const meId = String(req.user._id);
    const isOwner =
      Array.isArray(business.owners) &&
      business.owners.some((c) => String(c) === meId);

    let membership = "none";
    if (ownerId === meId || isOwner) {
      membership = "owner";
    } else if (
      Array.isArray(business.members) &&
      business.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(business.joinRequests) &&
      business.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending",
      )
    ) {
      membership = "pending";
    }

    if (
      req.user.businessId &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: null,
          business: "",
        },
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          business: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: business?.shippingPolicy || {},
        },
      });
    }

    if (
      !req.user.businessId &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: business._id,
          business: business.name,
        },
      });
    }

    const safeBusiness = {
      _id: business._id,
      name: business.name,
      owner: business.owner,
    };

    const businessNumber = String(
      business?.extracted?.businessNumber || "",
    ).trim();
    const hasBusinessNumber = !!businessNumber;
    const businessVerified = !!business?.verification?.verified;

    const shippingPolicy = business?.shippingPolicy || {};
    const safeShippingPolicy = { ...shippingPolicy };

    console.info("[Business] getMyBusiness response", {
      userId: String(req.user._id),
      businessId: String(business?._id || ""),
      membership,
      name: String(business?.name || ""),
      extracted: {
        companyName: String(business?.extracted?.companyName || "").trim(),
        businessNumber: String(
          business?.extracted?.businessNumber || "",
        ).trim(),
        address: String(business?.extracted?.address || "").trim(),
        addressDetail: String(business?.extracted?.addressDetail || "").trim(),
        zipCode: String(business?.extracted?.zipCode || "").trim(),
        phoneNumber: String(business?.extracted?.phoneNumber || "").trim(),
        email: String(business?.extracted?.email || "").trim(),
        representativeName: String(
          business?.extracted?.representativeName || "",
        ).trim(),
        businessType: String(business?.extracted?.businessType || "").trim(),
        businessItem: String(business?.extracted?.businessItem || "").trim(),
        startDate: String(business?.extracted?.startDate || "").trim(),
      },
      businessVerified,
    });

    return res.json({
      success: true,
      data: {
        membership,
        business: safeBusiness,
        businessId: business?._id,
        hasBusinessNumber,
        businessVerified,
        extracted: business?.extracted || {},
        businessLicense: business?.businessLicense || {},
        shippingPolicy: safeShippingPolicy,
      },
    });
  } catch (error) {
    res.set("x-abuts-handler", "business.getMyBusiness");
    return res.status(500).json({
      success: false,
      message: "내 사업자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function searchBusinesses(req, res) {
  try {
    const userRole = String(req.user?.role || "").trim();
    if (!BUSINESS_ALLOWED_ROLE_SET.has(userRole) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const rawType = String(req.query?.businessType || "").trim();
    const requestedType = BUSINESS_ALLOWED_ROLE_SET.has(rawType)
      ? rawType
      : null;
    const businessType =
      rawType === "all"
        ? null
        : requestedType || resolveBusinessType(req.user, null);
    const typeFilter = businessType
      ? buildBusinessTypeFilter(businessType)
      : {};

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const businesses = await Business.find({
      ...typeFilter,
      $or: [{ name: regex }, { "extracted.representativeName": regex }],
    })
      .select({ name: 1, extracted: 1 })
      .limit(20)
      .lean();

    const data = (businesses || []).map((b) => ({
      _id: b._id,
      name: b.name,
      representativeName: b?.extracted?.representativeName || "",
      businessNumber: b?.extracted?.businessNumber || "",
      address: b?.extracted?.address || "",
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    if (!req.user.businessId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const business = await Business.findOne({
      _id: req.user.businessId,
      ...typeFilter,
    });
    const meId = String(req.user._id);
    const isOwner =
      business &&
      (String(business.owner) === meId ||
        (Array.isArray(business.owners) &&
          business.owners.some((c) => String(c) === meId)));
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    const key = String(business?.businessLicense?.s3Key || "").trim();
    if (key) {
      try {
        await s3Utils.deleteFileFromS3(key);
      } catch {}
    }

    const fileId = String(business?.businessLicense?.fileId || "").trim();
    if (fileId) {
      try {
        await File.findByIdAndDelete(fileId);
      } catch {}
    }

    await Business.findByIdAndUpdate(req.user.businessId, {
      $set: {
        businessLicense: {
          fileId: null,
          s3Key: "",
          originalName: "",
          uploadedAt: null,
        },
        "extracted.companyName": "",
        "extracted.address": "",
        "extracted.zipCode": "",
        "extracted.phoneNumber": "",
        "extracted.email": "",
        "extracted.representativeName": "",
        "extracted.businessType": "",
        "extracted.businessItem": "",
        verification: {
          verified: false,
          provider: "",
          message: "",
          checkedAt: null,
        },
      },
      $unset: {
        "extracted.businessNumber": "",
      },
    });

    await User.updateMany(
      { businessId: business._id },
      {
        $set: {
          businessId: null,
          business: "",
        },
      },
    );
    await Business.findByIdAndDelete(business._id);

    return res.json({
      success: true,
      data: { cleared: true, businessRemoved: true },
    });
  } catch (error) {
    console.error(
      "[business] clearMyBusinessLicense error",
      {
        userId: req.user?._id,
        businessId: req.user?.businessId,
        message: error?.message,
      },
      error,
    );
    return res.status(500).json({
      success: false,
      message: "사업자등록증 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
