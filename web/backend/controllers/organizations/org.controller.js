import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import {
  ORGANIZATION_ALLOWED_ROLE_SET,
  resolveOrganizationType,
  assertOrganizationRole,
  buildOrganizationTypeFilter,
} from "./organizationRole.util.js";
import {
  lookupPostalCodeByAddress,
  normalizeOrganizationAddressFields,
} from "./org.address.util.js";
import { findOrganizationByAnchors } from "./org.find.util.js";
import { updateMyOrganization } from "./org.updateMyOrganization.js";
export { updateMyOrganization };

export async function checkBusinessNumberDuplicate(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

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

    // 현재 사용자의 organization 조회
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

    // 같은 사업자등록번호를 가진 다른 organization 확인
    const existingOrg = await RequestorOrganization.findOne({
      ...orgTypeFilter,
      "extracted.businessNumber": businessNumber,
      ...(effectiveBusinessId ? { _id: { $ne: effectiveBusinessId } } : {}),
    })
      .select({ _id: 1, owner: 1 })
      .lean();

    if (existingOrg) {
      const meId = String(req.user._id);
      const existingOwnerId = String(existingOrg.owner || "");

      // 현재 사용자가 소유한 organization이 아니면 중복
      if (existingOwnerId !== meId) {
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 조직에 가입 요청을 진행해주세요.",
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

export async function updateRequestorOrganizationShippingAddress(req, res) {
  try {
    const actorRole = String(req.user?.role || "").trim();
    if (!["manufacturer", "admin"].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const businessId = String(
      req.body?.businessId || req.body?.organizationId || "",
    ).trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessId 또는 organizationId가 필요합니다.",
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

    const normalizedAddressFields = await normalizeOrganizationAddressFields({
      address,
      zipCode,
    });

    const org = await RequestorOrganization.findOne({
      _id: businessId,
      ...buildOrganizationTypeFilter("requestor"),
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "의뢰인 조직을 찾을 수 없습니다.",
      });
    }

    const nextExtracted = {
      ...(org.extracted ? org.extracted.toObject?.() || org.extracted : {}),
      address: normalizedAddressFields?.address || address,
      addressDetail,
      zipCode: normalizedAddressFields?.zipCode || zipCode,
    };

    await RequestorOrganization.findByIdAndUpdate(org._id, {
      $set: {
        extracted: nextExtracted,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        businessId: String(org._id),
        organizationId: String(org._id),
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

export async function getMyOrganization(req, res) {
  try {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    let orgName = "";
    orgName = String(req.user.business || req.user.organization || "").trim();
    const freshUser = await User.findById(req.user._id)
      .select({
        businessId: 1,
        business: 1,
        organizationId: 1,
        organization: 1,
      })
      .lean();
    const freshBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId;
    const freshBusinessName = String(
      freshUser?.business ||
        req.user.business ||
        freshUser?.organization ||
        req.user.organization ||
        "",
    ).trim();
    let org = await findOrganizationByAnchors({
      organizationType,
      businessId: freshBusinessId,
      businessNumber: "",
      userId: req.user._id,
      businessName: freshBusinessName || orgName,
    });
    console.info("[Organization] getMyOrganization anchors", {
      userId: String(req.user._id),
      organizationType,
      tokenBusinessId: String(req.user.businessId || ""),
      tokenOrganizationId: String(req.user.organizationId || ""),
      freshBusinessId: String(freshBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      tokenOrganizationName: orgName,
      freshBusinessName,
      resolvedBusinessId: String(org?._id || ""),
      resolvedBusinessName: String(org?.name || ""),
    });

    if (
      !org &&
      orgName &&
      String(req.user.referralCode || "").startsWith("mock_")
    ) {
      try {
        org = await RequestorOrganization.create({
          organizationType,
          name: orgName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          joinRequests: [],
        });
        await User.findByIdAndUpdate(req.user._id, {
          $set: {
            businessId: org._id,
            business: org.name,
            organizationId: org._id,
            organization: org.name,
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

    if (!org) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: {},
        },
      });
    }

    const ownerId = String(org.owner);
    const meId = String(req.user._id);
    const isOwner =
      Array.isArray(org.owners) && org.owners.some((c) => String(c) === meId);

    let membership = "none";
    if (ownerId === meId || isOwner) {
      membership = "owner";
    } else if (
      Array.isArray(org.members) &&
      org.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(org.joinRequests) &&
      org.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending",
      )
    ) {
      membership = "pending";
    }

    if (
      (req.user.businessId || req.user.organizationId) &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: null,
          business: "",
          organizationId: null,
          organization: "",
        },
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: org?.shippingPolicy || {},
        },
      });
    }

    if (
      !(req.user.businessId || req.user.organizationId) &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: org._id,
          business: org.name,
          organizationId: org._id,
          organization: org.name,
        },
      });
    }

    const safeOrg = {
      _id: org._id,
      name: org.name,
      owner: org.owner,
    };

    const businessNumber = String(org?.extracted?.businessNumber || "").trim();
    const hasBusinessNumber = !!businessNumber;
    const businessVerified = !!org?.verification?.verified;

    const shippingPolicy = org?.shippingPolicy || {};
    const safeShippingPolicy = { ...shippingPolicy };
    console.info("[Organization] getMyOrganization response", {
      userId: String(req.user._id),
      organizationId: String(org?._id || ""),
      membership,
      name: String(org?.name || ""),
      extracted: {
        companyName: String(org?.extracted?.companyName || "").trim(),
        businessNumber: String(org?.extracted?.businessNumber || "").trim(),
        address: String(org?.extracted?.address || "").trim(),
        addressDetail: String(org?.extracted?.addressDetail || "").trim(),
        zipCode: String(org?.extracted?.zipCode || "").trim(),
        phoneNumber: String(org?.extracted?.phoneNumber || "").trim(),
        email: String(org?.extracted?.email || "").trim(),
        representativeName: String(
          org?.extracted?.representativeName || "",
        ).trim(),
        businessType: String(org?.extracted?.businessType || "").trim(),
        businessItem: String(org?.extracted?.businessItem || "").trim(),
        startDate: String(org?.extracted?.startDate || "").trim(),
      },
      businessVerified,
    });

    return res.json({
      success: true,
      data: {
        membership,
        organization: safeOrg,
        hasBusinessNumber,
        businessVerified,
        extracted: org?.extracted || {},
        businessLicense: org?.businessLicense || {},
        shippingPolicy: safeShippingPolicy,
      },
    });
  } catch (error) {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    return res.status(500).json({
      success: false,
      message: "내 사업자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function searchOrganizations(req, res) {
  try {
    const userRole = String(req.user?.role || "").trim();
    if (!ORGANIZATION_ALLOWED_ROLE_SET.has(userRole) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const rawType = String(req.query?.organizationType || "").trim();
    const requestedType = ORGANIZATION_ALLOWED_ROLE_SET.has(rawType)
      ? rawType
      : null;
    const organizationType =
      rawType === "all"
        ? null
        : requestedType || resolveOrganizationType(req.user, null);
    const orgTypeFilter = organizationType
      ? buildOrganizationTypeFilter(organizationType)
      : {};

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const orgs = await RequestorOrganization.find({
      ...orgTypeFilter,
      $or: [{ name: regex }, { "extracted.representativeName": regex }],
    })
      .select({ name: 1, extracted: 1 })
      .limit(20)
      .lean();

    const data = (orgs || []).map((o) => ({
      _id: o._id,
      name: o.name,
      representativeName: o?.extracted?.representativeName || "",
      businessNumber: o?.extracted?.businessNumber || "",
      address: o?.extracted?.address || "",
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공소 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = { organizationType };

    if (!req.user.organizationId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: req.user.organizationId,
      ...orgTypeFilter,
    });
    const meId = String(req.user._id);
    const isOwner =
      org &&
      (String(org.owner) === meId ||
        (Array.isArray(org.owners) &&
          org.owners.some((c) => String(c) === meId)));
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    const key = String(org?.businessLicense?.s3Key || "").trim();
    if (key) {
      try {
        await s3Utils.deleteFileFromS3(key);
      } catch {}
    }

    const fileId = String(org?.businessLicense?.fileId || "").trim();
    if (fileId) {
      try {
        await File.findByIdAndDelete(fileId);
      } catch {}
    }

    await RequestorOrganization.findByIdAndUpdate(req.user.organizationId, {
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
      { $or: [{ businessId: org._id }, { organizationId: org._id }] },
      {
        $set: {
          businessId: null,
          business: "",
          organizationId: null,
          organization: "",
        },
      },
    );
    await RequestorOrganization.findByIdAndDelete(org._id);

    return res.json({
      success: true,
      data: { cleared: true, organizationRemoved: true },
    });
  } catch (error) {
    console.error(
      "[requestorOrganization] clearMyBusinessLicense error",
      {
        userId: req.user?._id,
        organizationId: req.user?.organizationId,
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
