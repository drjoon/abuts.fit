import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import {
  BUSINESS_ALLOWED_ROLE_SET,
  resolveBusinessType,
  assertBusinessRole,
  buildBusinessTypeFilter,
  buildBusinessTypeQuery,
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
      return digits;
    };

    const businessNumber = normalizeBusinessNumber(businessNumberRaw);
    if (!businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select({ businessAnchorId: 1 })
      .lean();
    const effectiveBusinessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;

    const existingAnchor = await BusinessAnchor.findOne({
      businessType,
      businessNumberNormalized: businessNumber,
      ...(effectiveBusinessAnchorId
        ? { _id: { $ne: effectiveBusinessAnchorId } }
        : {}),
    })
      .select({ _id: 1, primaryContactUserId: 1 })
      .lean();

    if (existingAnchor) {
      const meId = String(req.user._id);
      const existingOwnerId = String(existingAnchor.primaryContactUserId || "");

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

    const businessId = String(
      req.body?.businessAnchorId || req.body?.businessId || "",
    ).trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessAnchorId가 필요합니다.",
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

    const anchor = await BusinessAnchor.findOne({
      _id: businessId,
      businessType: "requestor",
    });

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "의뢰인 사업자를 찾을 수 없습니다.",
      });
    }

    const nextMetadata = {
      ...(anchor.metadata || {}),
      address: normalizedAddressFields?.address || address,
      addressDetail,
      zipCode: normalizedAddressFields?.zipCode || zipCode,
    };

    await BusinessAnchor.findByIdAndUpdate(anchor._id, {
      $set: {
        metadata: nextMetadata,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        businessId: String(anchor._id),
        address: nextMetadata.address || "",
        addressDetail: nextMetadata.addressDetail || "",
        zipCode: nextMetadata.zipCode || "",
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

// 성능 최적화: getMyBusiness 캐시 (TTL 30초)
const __getMyBusinessCache = new Map();
const GET_MY_BUSINESS_CACHE_TTL = 30 * 1000;

function getMyBusinessCacheKey(userId, businessType) {
  return `${userId}:${businessType}`;
}

// 캐시 무효화 함수 (사업자 정보 업데이트 시 호출)
export function invalidateMyBusinessCache(businessAnchorId) {
  if (!businessAnchorId) return 0;
  let removed = 0;
  for (const key of __getMyBusinessCache.keys()) {
    __getMyBusinessCache.delete(key);
    removed++;
  }
  return removed;
}

export async function getMyBusiness(req, res) {
  try {
    res.set("x-abuts-handler", "business.getMyBusiness");
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    // 캐시 확인
    const cacheKey = getMyBusinessCacheKey(req.user._id, businessType);
    const cached = __getMyBusinessCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GET_MY_BUSINESS_CACHE_TTL) {
      return res.json(cached.data);
    }

    const freshUser = await User.findById(req.user._id)
      .select({ businessAnchorId: 1, business: 1 })
      .lean();
    const businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId;

    let anchor = null;
    if (businessAnchorId) {
      anchor = await BusinessAnchor.findOne({
        _id: businessAnchorId,
        businessType,
      }).lean();
    }

    console.info("[BusinessAnchor] getMyBusiness", {
      userId: String(req.user._id),
      businessType,
      businessAnchorId: String(businessAnchorId || ""),
      found: !!anchor,
    });

    if (!anchor) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          business: null,
          hasBusinessNumber: false,
          businessVerified: false,
          metadata: {},
          payoutAccount: {},
        },
      });
    }

    const meId = String(req.user._id);
    const primaryContactId = String(anchor.primaryContactUserId || "");
    const isOwner =
      Array.isArray(anchor.owners) &&
      anchor.owners.some((c) => String(c) === meId);

    let membership = "none";
    if (primaryContactId === meId || isOwner) {
      membership = "owner";
    } else if (
      Array.isArray(anchor.members) &&
      anchor.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(anchor.joinRequests) &&
      anchor.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending",
      )
    ) {
      membership = "pending";
    }

    if (
      req.user.businessAnchorId &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessAnchorId: null,
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
          metadata: {},
          payoutAccount: {},
        },
      });
    }

    if (
      !req.user.businessAnchorId &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessAnchorId: anchor._id,
          business: anchor.name,
        },
      });
    }

    const safeBusiness = {
      _id: anchor._id,
      name: anchor.name,
      owner: anchor.primaryContactUserId,
    };

    const businessNumber = String(
      anchor?.businessNumberNormalized || "",
    ).trim();
    const hasBusinessNumber = !!businessNumber;
    const businessVerified = anchor.status === "verified";

    // SSOT: metadata만 반환 (extracted 레거시 제거, 2026-03-31)
    // AI 파싱 후 사용자 확인/검증을 거친 데이터는 metadata에 저장
    const metadata = anchor?.metadata || {};

    const responseData = {
      success: true,
      data: {
        membership,
        business: safeBusiness,
        businessId: anchor._id,
        hasBusinessNumber,
        businessVerified,
        metadata, // SSOT
        businessLicense: anchor?.businessLicense || null,
        payoutAccount: anchor?.payoutAccount || {},
      },
    };

    // 캐시 저장
    __getMyBusinessCache.set(cacheKey, {
      ts: Date.now(),
      data: responseData,
    });

    return res.json(responseData);
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

    // admin 타입 anchor는 일반 사용자 검색에서 제외
    if (businessType === "admin" && userRole !== "admin") {
      return res.json({ success: true, data: [] });
    }
    // businessType이 없을 때 non-admin 사용자는 admin anchor를 검색 결과에서 제외
    const typeFilter = buildBusinessTypeQuery(businessType);
    const adminExcludeFilter =
      !businessType && userRole !== "admin"
        ? { businessType: { $ne: "admin" } }
        : null;

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    // BusinessAnchor가 법적 식별/소개/정산 SSOT
    // Business는 멤버십/조직 UI 컨테이너일 뿐이므로 검색 대상이 아님
    // $or 중복 spread 방지: typeFilter와 이름 $or를 $and로 결합
    const regex = new RegExp(q, "i");
    const nameClauses = {
      $or: [
        { name: regex },
        { "metadata.companyName": regex },
        { "metadata.representativeName": regex },
      ],
    };
    const andClauses = [nameClauses];
    if (Object.keys(typeFilter).length > 0) andClauses.push(typeFilter);
    if (adminExcludeFilter) andClauses.push(adminExcludeFilter);
    const searchQuery =
      andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
    const anchors = await BusinessAnchor.find(searchQuery)
      .select({ name: 1, metadata: 1, businessNumberNormalized: 1 })
      .limit(20)
      .lean();

    const data = (anchors || []).map((a) => ({
      _id: a._id,
      name: a.name,
      representativeName: a?.metadata?.representativeName || "",
      businessNumber: a?.businessNumberNormalized || "",
      address: a?.metadata?.address || "",
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

    if (!req.user.businessAnchorId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const anchor = await BusinessAnchor.findOne({
      _id: req.user.businessAnchorId,
      businessType,
    });

    const meId = String(req.user._id);
    const isOwner =
      anchor &&
      (String(anchor.primaryContactUserId) === meId ||
        (Array.isArray(anchor.owners) &&
          anchor.owners.some((c) => String(c) === meId)));
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    await BusinessAnchor.findByIdAndUpdate(req.user.businessAnchorId, {
      $set: {
        "metadata.companyName": "",
        "metadata.address": "",
        "metadata.zipCode": "",
        "metadata.phoneNumber": "",
        "metadata.email": "",
        "metadata.representativeName": "",
        "metadata.businessItem": "",
        "metadata.businessType": "",
        "metadata.startDate": "",
        status: "draft",
      },
      $unset: {
        businessNumberNormalized: "",
      },
    });

    await User.updateMany(
      { businessAnchorId: anchor._id },
      {
        $set: {
          businessAnchorId: null,
          business: "",
        },
      },
    );

    return res.json({
      success: true,
      data: { cleared: true },
    });
  } catch (error) {
    console.error(
      "[business] clearMyBusinessLicense error",
      {
        userId: req.user?._id,
        businessAnchorId: req.user?.businessAnchorId,
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
